import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
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

  // No archived filter — column may not exist yet. Filter client-side in DeckManager.
  const { data: allCards } = await supabase
    .from('cards')
    .select('id, question, answer, explanation, theme, difficulty, created_by_ai, user_edited, archived, archived_at, auto_delete_at, card_reviews(id, state)')
    .eq('deck_id', id)
    .order('created_at', { ascending: false })

  const activeCardIds = (allCards || []).filter(c => !c.archived).map(c => c.id)
  const safeIds = activeCardIds.length > 0 ? activeCardIds : ['00000000-0000-0000-0000-000000000000']

  const [{ data: dueReviews }, { data: nextDue }] = await Promise.all([
    supabase
      .from('card_reviews')
      .select('id')
      .eq('user_id', user!.id)
      .lte('scheduled_at', new Date().toISOString())
      .in('card_id', safeIds),
    supabase
      .from('card_reviews')
      .select('scheduled_at')
      .eq('user_id', user!.id)
      .gt('scheduled_at', new Date().toISOString())
      .in('card_id', safeIds)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (!deck) redirect('/dashboard')

  const nextDueDays = nextDue?.scheduled_at
    ? Math.max(1, Math.ceil((new Date(nextDue.scheduled_at).getTime() - Date.now()) / 86_400_000))
    : null

  return (
    <DeckManager
      deck={deck}
      initialCards={allCards || []}
      dueCount={dueReviews?.length || 0}
      nextDueDays={nextDueDays}
      userId={user!.id}
    />
  )
}
