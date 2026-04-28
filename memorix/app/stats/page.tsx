export const runtime = 'edge'

import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import StatsView from './StatsView'

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0
  const days = new Set(dates.map(d => d.slice(0, 10)))
  let streak = 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export default async function StatsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: allReviews },
    { data: hardCardsRaw },
    { data: forecastReviews },
    { data: profile },
  ] = await Promise.all([
    supabase.from('card_reviews')
      .select('reviewed_at, rating, scheduled_at, scheduled_days')
      .eq('user_id', user.id)
      .not('reviewed_at', 'is', null)
      .gte('reviewed_at', new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString())
      .order('reviewed_at', { ascending: false }),

    supabase.from('card_reviews')
      .select('card_id, rating, cards!inner(question, deck_id, decks(name))')
      .eq('user_id', user.id)
      .not('reviewed_at', 'is', null)
      .or('archived.is.null,archived.eq.false', { foreignTable: 'cards' }),

    supabase.from('card_reviews')
      .select('scheduled_at')
      .eq('user_id', user.id)
      .gte('scheduled_at', new Date().toISOString())
      .lte('scheduled_at', new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()),

    supabase.from('profiles')
      .select('name, retention_target')
      .eq('id', user.id)
      .single(),
  ])

  const streak = computeStreak((allReviews || []).map(r => r.reviewed_at as string))

  // Hard cards: group by card_id, failure rate = rating===1 / total, min 3 reviews, top 8
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardMap = new Map<string, { total: number; fails: number; card: any }>()
  for (const r of hardCardsRaw || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { card_id, rating, cards } = r as any
    const entry = cardMap.get(card_id) || { total: 0, fails: 0, card: cards }
    entry.total++
    if (rating === 1) entry.fails++
    if (!entry.card) entry.card = cards
    cardMap.set(card_id, entry)
  }
  const topHardCards = Array.from(cardMap.entries())
    .filter(([, v]) => v.total >= 3)
    .map(([id, v]) => ({
      card_id: id,
      failRate: Math.round(v.fails / v.total * 100),
      question: (v.card?.question as string) || '—',
      deck_id: (v.card?.deck_id as string | null) || null,
      deck_name: (v.card?.decks?.name as string | null) || null,
      total: v.total,
    }))
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 8)

  // Forecast: next 7 days scheduled count grouped by day
  const forecastMap = new Map<string, number>()
  for (const r of forecastReviews || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const day = (r as any).scheduled_at?.slice(0, 10)
    if (day) forecastMap.set(day, (forecastMap.get(day) || 0) + 1)
  }
  const todayBase = new Date()
  todayBase.setHours(0, 0, 0, 0)
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayBase)
    d.setDate(d.getDate() + i)
    const day = d.toISOString().slice(0, 10)
    const label = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : `Dans ${i} jours`
    return { day, label, count: forecastMap.get(day) || 0 }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const retentionTarget = (profile as any)?.retention_target ?? 80

  return (
    <StatsView
      reviews={allReviews || []}
      hardCards={topHardCards}
      forecast={forecast}
      streak={streak}
      retentionTarget={retentionTarget}
    />
  )
}
