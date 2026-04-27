import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Theme, Deck } from '@/types'
import TreeLibrary from '@/components/ui/TreeLibrary'

export const runtime = 'edge'

export default async function DecksPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: themes },
    { data: decks },
    { data: deckDueCards },
  ] = await Promise.all([
    supabase.from('themes').select('id, name, color, position, parent_id').eq('user_id', user.id).order('position'),
    supabase
      .from('decks')
      .select('*, cards(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('card_reviews')
      .select('cards(deck_id)')
      .eq('user_id', user.id)
      .lte('scheduled_at', new Date().toISOString()),
  ])

  const deckDueMap = new Map<string, number>()
  for (const r of deckDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deckId = (r as any).cards?.deck_id
    if (deckId) deckDueMap.set(deckId, (deckDueMap.get(deckId) || 0) + 1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decksWithDue = (decks || []).map(deck => ({
    ...deck,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    card_count: (deck as any).cards?.[0]?.count ?? 0,
    due_count: deckDueMap.get(deck.id) ?? 0,
  }))

  return (
    <TreeLibrary
      initialThemes={(themes || []) as Theme[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDecks={decksWithDue as any}
      userId={user.id}
    />
  )
}
