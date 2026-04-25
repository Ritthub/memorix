import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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
  ] = await Promise.all([
    supabase.from('decks').select('*, cards(count)').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('card_reviews').select('id').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
    supabase.from('profiles').select('name').eq('id', user.id).single(),
    supabase.from('card_reviews').select('reviewed_at').eq('user_id', user.id).not('reviewed_at', 'is', null).gte('reviewed_at', new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()),
    supabase.from('card_reviews').select('cards(deck_id)').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
  ])

  const dueCount = dueCards?.length || 0
  const deckCount = decks?.length || 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstName = (profile as any)?.name?.split(' ')[0] || ''
  const streak = computeStreak((recentReviews || []).map(r => r.reviewed_at as string))

  const deckDueMap = new Map<string, number>()
  for (const r of deckDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deckId = (r as any).cards?.deck_id
    if (deckId) deckDueMap.set(deckId, (deckDueMap.get(deckId) || 0) + 1)
  }

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white">
      <header className="border-b border-[#534AB7]/20 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#534AB7]">Memorix</h1>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-[#534AB7]/20 border border-[#534AB7]/40 rounded-full px-3 py-1">
              <span>🔥</span>
              <span className="text-[#AFA9EC] font-bold text-sm">{streak} j</span>
            </div>
          )}
          <Link href="/settings" className="text-gray-400 hover:text-white transition-colors text-sm">Paramètres</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-1">
            Bonjour{firstName ? `, ${firstName}` : ''} 👋
          </h2>
          <p className="text-gray-400">
            {dueCount > 0
              ? `Vous avez ${dueCount} carte${dueCount > 1 ? 's' : ''} à réviser aujourd'hui.`
              : 'Aucune carte à réviser pour le moment. Beau travail !'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#1A1A2E] rounded-2xl p-5 border border-[#534AB7]/20">
            <div className="text-3xl font-bold text-[#534AB7]">{dueCount}</div>
            <div className="text-gray-400 text-sm mt-1">Cartes dues</div>
          </div>
          <div className="bg-[#1A1A2E] rounded-2xl p-5 border border-[#534AB7]/20">
            <div className="text-3xl font-bold text-[#534AB7]">{deckCount}</div>
            <div className="text-gray-400 text-sm mt-1">Decks actifs</div>
          </div>
          <div className="bg-[#1A1A2E] rounded-2xl p-5 border border-[#534AB7]/40 bg-[#534AB7]/5">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-[#534AB7]">{streak}</span>
              <span className="text-2xl">🔥</span>
            </div>
            <div className="text-gray-400 text-sm mt-1">Jours de suite</div>
          </div>
        </div>

        {dueCount > 0 ? (
          <Link
            href="/review"
            className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-[#534AB7] to-[#7C6FCD] hover:from-[#3C3489] hover:to-[#534AB7] rounded-2xl p-5 font-bold mb-8 transition-all shadow-lg shadow-[#534AB7]/25 text-lg"
          >
            <span className="text-2xl">⚡</span>
            <span>Réviser maintenant</span>
            <span className="bg-white/20 rounded-full px-3 py-0.5 text-sm font-normal">
              {dueCount} carte{dueCount > 1 ? 's' : ''}
            </span>
          </Link>
        ) : (
          <div className="bg-[#1A1A2E] rounded-2xl p-5 text-center mb-8 border border-[#534AB7]/10">
            <p className="text-gray-400 text-sm">✅ Toutes les révisions du jour sont terminées</p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Mes decks</h3>
            <Link href="/create" className="text-[#534AB7] hover:text-[#AFA9EC] text-sm transition-colors">+ Nouveau deck</Link>
          </div>

          {deckCount === 0 ? (
            <div className="bg-[#1A1A2E] rounded-2xl p-10 text-center border border-[#534AB7]/20">
              <div className="text-4xl mb-4">📚</div>
              <p className="text-gray-400 mb-4">Vous n'avez pas encore de deck</p>
              <Link href="/create" className="inline-block bg-[#534AB7] hover:bg-[#3C3489] rounded-xl px-6 py-3 font-medium transition-colors">
                Créer mon premier deck
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {decks?.map(deck => {
                const due = deckDueMap.get(deck.id) || 0
                return (
                  <Link key={deck.id} href={`/decks/${deck.id}`} className="relative bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20 hover:border-[#534AB7]/60 transition-colors">
                    {due > 0 && (
                      <span className="absolute top-3 right-3 bg-[#534AB7] text-white text-xs font-bold rounded-full px-2 py-0.5 leading-tight">
                        {due}
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{deck.icon}</span>
                      <h4 className="font-bold truncate">{deck.name}</h4>
                    </div>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <p className="text-gray-400 text-sm">{(deck as any).cards?.[0]?.count || 0} cartes</p>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
export const runtime = 'edge'
