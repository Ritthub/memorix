import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import CardDetail from './CardDetail'

export const runtime = 'edge'

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: card } = await supabase
    .from('cards')
    .select('*, themes(id, name, color, parent_id)')
    .eq('id', id)
    .single()

  if (!card) redirect('/library')

  if (card.themes) {
    const { data: theme } = await supabase
      .from('themes')
      .select('user_id')
      .eq('id', card.theme_id)
      .single()
    if (theme?.user_id !== user.id) redirect('/library')
  }

  const { data: review } = await supabase
    .from('card_reviews')
    .select('*')
    .eq('card_id', id)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  // Source of truth for the next review is card_reviews.scheduled_at.
  // Legacy free-mode rows seeded scheduled_at to ~10 years in the future as a
  // "no real schedule" sentinel; treat any such value as no schedule for display.
  const scheduledAt = review?.scheduled_at ? new Date(review.scheduled_at) : null
  const daysUntilNext = scheduledAt
    ? (() => {
        const days = Math.ceil((scheduledAt.getTime() - Date.now()) / 86400000)
        return days > 3650 ? null : days
      })()
    : null

  let parentThemeName: string | null = null
  if (card.themes?.parent_id) {
    const { data: parent } = await supabase
      .from('themes')
      .select('name')
      .eq('id', card.themes.parent_id)
      .single()
    parentThemeName = parent?.name || null
  }

  // Full per-review history from review_logs (new in 2026-05-09 migration)
  const { data: logs } = await supabase
    .from('review_logs')
    .select('rating, reviewed_at, scheduled_days, state, mode')
    .eq('card_id', id)
    .eq('user_id', user.id)
    .order('reviewed_at', { ascending: false })
    .limit(500)

  const history = (logs || []).map(l => ({
    rating: l.rating as number,
    reviewed_at: l.reviewed_at as string,
    scheduled_days: (l.scheduled_days as number | null) ?? 0,
    state: (l.state as string | null) || 'review',
    mode: (l.mode as 'scheduled' | 'free') || 'scheduled',
  }))

  const total = history.length
  const freeCount = history.filter(h => h.mode === 'free').length
  const scheduledCount = total - freeCount
  const successCount = history.filter(h => h.rating >= 2).length
  const successRate = total > 0 ? Math.round(successCount / total * 100) : null

  // Consecutive correct streak walking from most recent backward
  let correctStreak = 0
  for (const h of history) {
    if (h.rating >= 2) correctStreak++
    else break
  }

  return (
    <CardDetail
      card={card}
      review={review}
      history={history}
      daysUntilNext={daysUntilNext}
      parentThemeName={parentThemeName}
      stats={{
        total,
        freeCount,
        scheduledCount,
        successRate,
        correctStreak,
      }}
    />
  )
}
