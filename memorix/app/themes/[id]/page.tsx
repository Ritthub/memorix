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

  const [
    { data: theme },
    { data: decks },
    { data: deckDueCards },
  ] = await Promise.all([
    supabase.from('themes').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('decks').select('*, cards(count)').eq('theme_id', id).eq('user_id', user.id).order('position'),
    supabase.from('card_reviews').select('cards(deck_id)').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
  ])

  if (!theme) redirect('/decks')

  const deckDueMap = new Map<string, number>()
  for (const r of deckDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deckId = (r as any).cards?.deck_id
    if (deckId) deckDueMap.set(deckId, (deckDueMap.get(deckId) || 0) + 1)
  }

  const decksWithMeta = (decks || []).map(deck => ({
    ...deck,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    card_count: (deck as any).cards?.[0]?.count || 0,
    due_count: deckDueMap.get(deck.id) || 0,
  })) as (Deck & { card_count: number; due_count: number })[]

  const totalCards = decksWithMeta.reduce((s, d) => s + d.card_count, 0)
  const totalDue = decksWithMeta.reduce((s, d) => s + d.due_count, 0)

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
