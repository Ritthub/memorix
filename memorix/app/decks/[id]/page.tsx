import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import DeckManager from './DeckManager'

export const runtime = 'edge'

export default async function DeckPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { id } = await params

  const { data: deck } = await supabase
    .from('decks')
    .select('*')
    .eq('id', id)
    .single()

  const { data: cards } = await supabase
    .from('cards')
    .select('*, card_reviews(*)')
    .eq('deck_id', id)
    .order('created_at', { ascending: false })

  const { data: dueReviews } = await supabase
    .from('card_reviews')
    .select('id')
    .eq('user_id', user!.id)
    .lte('scheduled_at', new Date().toISOString())
    .in('card_id', cards?.map(c => c.id) || [])

  if (!deck) redirect('/dashboard')

  return (
    <DeckManager
      deck={deck}
      initialCards={cards || []}
      dueCount={dueReviews?.length || 0}
      userId={user!.id}
    />
  )
}
