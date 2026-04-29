import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ReviewSelector from './ReviewSelector'
import ThemeReviewSection from './ThemeReviewSection'
import { pluralCard } from '@/lib/utils'

export const runtime = 'edge'

function computeStreak(reviewedAtDates: string[]): number {
  if (reviewedAtDates.length === 0) return 0
  const days = new Set(reviewedAtDates.map(d => d.slice(0, 10)))
  let streak = 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: decks },
    { data: dueCards },
    { data: profile },
    { data: recentReviews },
    { data: deckDueCards },
    { data: themes },
  ] = await Promise.all([
    supabase.from('decks').select('id, name, icon, theme_id, cards(count)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('card_reviews').select('id, cards!inner(archived)').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
    supabase.from('profiles').select('name').eq('id', user.id).single(),
    supabase.from('card_reviews').select('reviewed_at').eq('user_id', user.id).not('reviewed_at', 'is', null).gte('reviewed_at', new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()),
    supabase.from('card_reviews').select('cards!inner(deck_id, theme_id, archived)').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
    supabase.from('themes').select('id, name, color, position, parent_id').eq('user_id', user.id).order('position'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dueCount = (dueCards || []).filter((r: any) => !r.cards?.archived).length
  const deckCount = decks?.length || 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstName = (profile as any)?.name?.split(' ')[0] || ''
  const streak = computeStreak((recentReviews || []).map((r: { reviewed_at: string | null }) => r.reviewed_at as string))

  const deckDueMap = new Map<string, number>()
  const directThemeDueMap: Record<string, number> = {}
  for (const r of deckDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = (r as any).cards
    if (!card || card.archived) continue
    const deckId = card.deck_id
    const themeId = card.theme_id
    if (deckId) {
      deckDueMap.set(deckId, (deckDueMap.get(deckId) || 0) + 1)
    } else if (themeId) {
      directThemeDueMap[themeId] = (directThemeDueMap[themeId] || 0) + 1
    }
  }

  const themeDueCounts: Record<string, number> = {}
  let noThemeDue = 0
  for (const deck of decks || []) {
    const due = deckDueMap.get(deck.id) || 0
    if (!due) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const themeId = (deck as any).theme_id
    if (themeId) themeDueCounts[themeId] = (themeDueCounts[themeId] || 0) + due
    else noThemeDue += due
  }
  for (const [themeId, due] of Object.entries(directThemeDueMap)) {
    themeDueCounts[themeId] = (themeDueCounts[themeId] || 0) + due
  }

  type ThemeRow = { id: string; name: string; color: string; position: number; parent_id: string | null }
  const allThemesList = (themes as ThemeRow[] | null) || []

  function getSubtreeIds(themeId: string): string[] {
    const children = allThemesList.filter(t => t.parent_id === themeId)
    return [themeId, ...children.flatMap(c => getSubtreeIds(c.id))]
  }

  const allThemesWithDue = allThemesList.map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    parent_id: t.parent_id,
    due: getSubtreeIds(t.id).reduce((sum, id) => sum + (themeDueCounts[id] || 0), 0),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeThemes = (themes as any) || []

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--accent-light)' }}>Memorix</h1>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1 border" style={{ background: 'color-mix(in srgb, var(--streak-bg) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--streak-text) 30%, transparent)' }}>
              <span>🔥</span>
              <span className="font-bold text-sm" style={{ color: 'var(--streak-text)' }}>{streak} j</span>
            </div>
          )}
          <Link href="/settings" className="text-sm transition-colors" style={{ color: 'var(--text-muted)' }}>Paramètres</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Bonjour{firstName ? `, ${firstName}` : ''} 👋
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {dueCount > 0
              ? `Vous avez ${dueCount} carte${dueCount > 1 ? 's' : ''} à réviser aujourd'hui.`
              : 'Aucune carte à réviser pour le moment. Beau travail !'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="text-3xl font-bold" style={{ color: 'var(--accent-light)' }}>{dueCount}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Cartes dues</div>
          </div>
          <div className="rounded-2xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="text-3xl font-bold" style={{ color: 'var(--accent-light)' }}>{deckCount}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Decks actifs</div>
          </div>
          <div className="rounded-2xl p-5 border" style={{ background: 'color-mix(in srgb, var(--accent-subtle) 50%, var(--bg-surface))', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold" style={{ color: 'var(--accent-light)' }}>{streak}</span>
              <span className="text-2xl">🔥</span>
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Jours de suite</div>
          </div>
        </div>

        <ReviewSelector
          dueCount={dueCount}
          themes={safeThemes}
          themeDueCounts={themeDueCounts}
          noThemeDue={noThemeDue}
        />

        <ThemeReviewSection themes={allThemesWithDue} />

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">À réviser en priorité</h3>
            <Link href="/decks" className="text-sm transition-colors" style={{ color: 'var(--accent)' }}>
              Voir toute la bibliothèque →
            </Link>
          </div>

          {deckCount === 0 ? (
            <div className="rounded-2xl p-10 text-center border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <div className="text-4xl mb-4">📚</div>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Vous n&apos;avez pas encore de deck</p>
              <Link href="/create" className="inline-block rounded-xl px-6 py-3 font-medium transition-colors" style={{ background: 'var(--accent)' }}>
                Créer mon premier deck
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                {decks
                  ?.slice()
                  .sort((a: { id: string }, b: { id: string }) => (deckDueMap.get(b.id) || 0) - (deckDueMap.get(a.id) || 0))
                  .slice(0, 3)
                  .map((deck: { id: string }) => {
                    const due = deckDueMap.get(deck.id) || 0
                    return (
                      <Link key={deck.id} href={`/decks/${deck.id}`} className="relative rounded-2xl p-6 border transition-all duration-150" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                        {due > 0 && (
                          <span className="absolute top-3 right-3 text-xs font-bold rounded-full px-2 py-0.5 leading-tight" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-muted)' }}>
                            {due}
                          </span>
                        )}
                        <div className="flex items-center gap-3 mb-3">
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <span className="text-2xl">{(deck as any).icon}</span>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <h4 className="font-bold truncate">{(deck as any).name}</h4>
                        </div>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{(deck as any).cards?.[0]?.count || 0} {pluralCard((deck as any).cards?.[0]?.count || 0)}</p>
                      </Link>
                    )
                  })}
              </div>
              <Link href="/decks" className="mt-4 flex items-center justify-center gap-2 text-sm py-3 transition-colors" style={{ color: 'var(--text-muted)' }}>
                <span>Voir tous les {deckCount} decks</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
