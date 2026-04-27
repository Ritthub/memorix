import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ReviewSelector from './ReviewSelector'

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
    supabase.from('card_reviews').select('id').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
    supabase.from('profiles').select('name').eq('id', user.id).single(),
    supabase.from('card_reviews').select('reviewed_at').eq('user_id', user.id).not('reviewed_at', 'is', null).gte('reviewed_at', new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()),
    supabase.from('card_reviews').select('cards(deck_id)').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
    supabase.from('themes').select('id, name, color, position, parent_id').eq('user_id', user.id).order('position'),
  ])

  const dueCount = dueCards?.length || 0
  const deckCount = decks?.length || 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstName = (profile as any)?.name?.split(' ')[0] || ''
  const streak = computeStreak((recentReviews || []).map((r: { reviewed_at: string | null }) => r.reviewed_at as string))

  const deckDueMap = new Map<string, number>()
  for (const r of deckDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deckId = (r as any).cards?.deck_id
    if (deckId) deckDueMap.set(deckId, (deckDueMap.get(deckId) || 0) + 1)
  }

  // Per-theme due counts (includes sub-themes: each deck points to its direct theme)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeThemes = (themes as any) || []

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F1F5F9]">
      <header className="border-b border-[#1E293B] px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#818CF8]">Memorix</h1>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-[#0E7490]/20 border border-[#06B6D4]/30 rounded-full px-3 py-1">
              <span>🔥</span>
              <span className="text-[#06B6D4] font-bold text-sm">{streak} j</span>
            </div>
          )}
          <Link href="/settings" className="text-[#64748B] hover:text-[#F1F5F9] transition-colors text-sm">Paramètres</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold mb-1 text-[#F1F5F9]">
            Bonjour{firstName ? `, ${firstName}` : ''} 👋
          </h2>
          <p className="text-[#94A3B8]">
            {dueCount > 0
              ? `Vous avez ${dueCount} carte${dueCount > 1 ? 's' : ''} à réviser aujourd'hui.`
              : 'Aucune carte à réviser pour le moment. Beau travail !'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#1E293B] rounded-2xl p-5 border border-[#334155]">
            <div className="text-3xl font-bold text-[#818CF8]">{dueCount}</div>
            <div className="text-[#94A3B8] text-sm mt-1">Cartes dues</div>
          </div>
          <div className="bg-[#1E293B] rounded-2xl p-5 border border-[#334155]">
            <div className="text-3xl font-bold text-[#818CF8]">{deckCount}</div>
            <div className="text-[#94A3B8] text-sm mt-1">Decks actifs</div>
          </div>
          <div className="bg-[#1E293B] rounded-2xl p-5 border border-[#4338CA]/40 bg-[#312E81]/20">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-[#818CF8]">{streak}</span>
              <span className="text-2xl">🔥</span>
            </div>
            <div className="text-[#94A3B8] text-sm mt-1">Jours de suite</div>
          </div>
        </div>

        <ReviewSelector
          dueCount={dueCount}
          themes={safeThemes}
          themeDueCounts={themeDueCounts}
          noThemeDue={noThemeDue}
        />

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">À réviser en priorité</h3>
            <Link href="/decks" className="text-[#4338CA] hover:text-[#818CF8] text-sm transition-colors">
              Voir toute la bibliothèque →
            </Link>
          </div>

          {deckCount === 0 ? (
            <div className="bg-[#1E293B] rounded-2xl p-10 text-center border border-[#334155]">
              <div className="text-4xl mb-4">📚</div>
              <p className="text-gray-400 mb-4">Vous n&apos;avez pas encore de deck</p>
              <Link href="/create" className="inline-block bg-[#4338CA] hover:bg-[#3730A3] rounded-xl px-6 py-3 font-medium transition-colors">
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
                      <Link key={deck.id} href={`/decks/${deck.id}`} className="relative bg-[#1E293B] rounded-2xl p-6 border border-[#334155] hover:border-[#818CF8]/50 transition-all duration-150">
                        {due > 0 && (
                          <span className="absolute top-3 right-3 bg-[#312E81] text-[#C7D2FE] text-xs font-bold rounded-full px-2 py-0.5 leading-tight">
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
                        <p className="text-gray-400 text-sm">{(deck as any).cards?.[0]?.count || 0} cartes</p>
                      </Link>
                    )
                  })}
              </div>
              <Link href="/decks" className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-[#4338CA] transition-colors py-3">
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
export const runtime = 'edge'
