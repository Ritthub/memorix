import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function ReviewIndexPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // IC-2: use !inner join and filter archived cards to avoid redirecting to empty sessions
  const { data: dueReviews } = await supabase
    .from('card_reviews')
    .select('card_id, cards!inner(deck_id, archived)')
    .eq('user_id', user!.id)
    .lte('scheduled_at', new Date().toISOString())

  type ReviewRow = { card_id: string; cards: { deck_id: string; archived: boolean } | null }
  const validReviews = (dueReviews as ReviewRow[] | null)?.filter(r => r.cards && !r.cards.archived)
  const deckId = validReviews?.[0]?.cards?.deck_id

  if (deckId) {
    redirect(`/review/${deckId}`)
  } else {
    redirect('/dashboard')
  }
}

export const runtime = 'edge'
