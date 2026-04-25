import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import StatsView from './StatsView'

function computeStreak(reviewedAtDates: string[]): number {
  if (reviewedAtDates.length === 0) return 0
  const days = new Set(reviewedAtDates.map(d => d.slice(0, 10)))
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

  const since365 = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
  const { data: reviews365 } = await supabase
    .from('card_reviews')
    .select('reviewed_at, rating, retrievability, lapses, card_id')
    .eq('user_id', user.id)
    .gte('reviewed_at', since365)
    .not('reviewed_at', 'is', null)
    .order('reviewed_at', { ascending: true })

  // Fetch top candidates for hardest cards, sort by failure rate client-side
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: hardCandidates } = await supabase
    .from('card_reviews')
    .select('card_id, lapses, reps, rating, cards(question, answer, deck_id, decks(name))')
    .eq('user_id', user.id)
    .gt('lapses', 0)
    .order('lapses', { ascending: false })
    .limit(20) as { data: any[] | null }

  // Sort by failure rate (lapses/reps) and keep top 5
  const hardCards = (hardCandidates || [])
    .map(c => ({ ...c, failureRate: c.reps > 0 ? c.lapses / c.reps : 0 }))
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, 5)

  const totalReviews = reviews365?.length || 0
  const successRate = reviews365 && reviews365.length > 0
    ? Math.round(reviews365.filter(r => (r.rating || 0) >= 3).length / reviews365.length * 100)
    : 0
  const streak = computeStreak((reviews365 || []).map(r => r.reviewed_at as string))

  return (
    <StatsView
      reviews365={reviews365 || []}
      hardCards={hardCards}
      totalReviews={totalReviews}
      successRate={successRate}
      streak={streak}
    />
  )
}
export const runtime = 'edge'
