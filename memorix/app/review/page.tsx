import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function ReviewIndexPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: dueReviews } = await supabase
    .from('card_reviews')
    .select('card_id, cards(deck_id)')
    .eq('user_id', user!.id)
    .lte('scheduled_at', new Date().toISOString())
    .limit(1)

  const firstReview = dueReviews?.[0] as any
  const deckId = firstReview?.cards?.deck_id

  if (deckId) {
    redirect(`/review/${deckId}`)
  } else {
    redirect('/dashboard')
  }
}

export const runtime = 'edge'
