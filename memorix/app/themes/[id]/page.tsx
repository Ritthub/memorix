import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Theme, Deck } from '@/types'
import ThemeDetail from './ThemeDetail'

export const runtime = 'edge'

export default async function ThemePage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params

  const nowIso = new Date().toISOString()
  const [
    { data: theme },
    { data: decks },
    { data: deckDueCards },
    { data: themeDirectDueCards },
  ] = await Promise.all([
    supabase.from('themes').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('decks').select('*, cards(count)').eq('theme_id', id).eq('user_id', user.id).order('position'),
    supabase.from('card_reviews').select('cards(deck_id, archived)').eq('user_id', user.id).lte('scheduled_at', nowIso),
    // Theme-direct cards: theme_id = this theme AND deck_id IS NULL.
    // The deck_id IS NULL filter prevents double-counting cards already
    // attributed to a deck under this theme via the previous query.
    supabase
      .from('card_reviews')
      .select('cards!inner(id, archived)')
      .eq('user_id', user.id)
      .lte('scheduled_at', nowIso)
      .eq('cards.theme_id', id)
      .is('cards.deck_id', null),
  ])

  if (!theme) redirect('/library')

  const deckDueMap = new Map<string, number>()
  for (const r of deckDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = (r as any).cards
    if (!card || card.archived) continue
    const deckId = card.deck_id
    if (deckId) deckDueMap.set(deckId, (deckDueMap.get(deckId) || 0) + 1)
  }

  let themeDirectDueCount = 0
  for (const r of themeDirectDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = (r as any).cards
    if (!card || card.archived) continue
    themeDirectDueCount++
  }

  const decksWithMeta = (decks || []).map(deck => ({
    ...deck,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    card_count: (deck as any).cards?.[0]?.count || 0,
    due_count: deckDueMap.get(deck.id) || 0,
  })) as (Deck & { card_count: number; due_count: number })[]

  const totalCards = decksWithMeta.reduce((s, d) => s + d.card_count, 0)
  const totalDue = decksWithMeta.reduce((s, d) => s + d.due_count, 0) + themeDirectDueCount

  return (
    <ThemeDetail
      theme={theme as Theme}
      decks={decksWithMeta}
      totalCards={totalCards}
      totalDue={totalDue}
      userId={user.id}
    />
  )
}
