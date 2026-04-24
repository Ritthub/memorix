import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import StatsView from './StatsView'

export default async function StatsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Reviews from the last 365 days for the heatmap
  const since365 = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
  const { data: reviews365 } = await supabase
    .from('card_reviews')
    .select('reviewed_at, rating, retrievability, lapses, card_id')
    .eq('user_id', user.id)
    .gte('reviewed_at', since365)
    .not('reviewed_at', 'is', null)
    .order('reviewed_at', { ascending: true })

  // Hardest cards: most lapses
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: hardCards } = await supabase
    .from('card_reviews')
    .select('card_id, lapses, rating, cards(question, answer, deck_id, decks(name))')
    .eq('user_id', user.id)
    .gt('lapses', 0)
    .order('lapses', { ascending: false })
    .limit(10) as { data: any[] | null }

  // Overall stats
  const { data: allReviews } = await supabase
    .from('card_reviews')
    .select('rating, state')
    .eq('user_id', user.id)

  const totalCards = allReviews?.length || 0
  const mastered = allReviews?.filter(r => r.state === 'review').length || 0
  const totalReviews = reviews365?.length || 0
  const successRate = reviews365 && reviews365.length > 0
    ? Math.round(reviews365.filter(r => (r.rating || 0) >= 3).length / reviews365.length * 100)
    : 0

  return (
    <StatsView
      reviews365={reviews365 || []}
      hardCards={hardCards || []}
      totalCards={totalCards}
      mastered={mastered}
      totalReviews={totalReviews}
      successRate={successRate}
    />
  )
}
export const runtime = 'edge'
