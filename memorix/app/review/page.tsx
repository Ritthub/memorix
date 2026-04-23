import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function ReviewIndexPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Trouve le premier deck qui a des cartes dues
  const { data: dueReviews } = await supabase
    .from('card_reviews')
    .select('card_id, cards(deck_id)')
    .eq('user_id', user.id)
    .lte('scheduled_at', new Date().toISOString())
    .limit(1)

  const deckId = dueReviews?.[0]?.cards?.deck_id

  if (deckId) {
    redirect(`/review/${deckId}`)
  } else {
    redirect('/dashboard')
  }
}
