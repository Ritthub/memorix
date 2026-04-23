import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: decks } = await supabase
    .from('decks')
    .select('*, cards(count)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: dueCards } = await supabase
    .from('card_reviews')
    .select('id')
    .eq('user_id', user.id)
    .lte('scheduled_at', new Date().toISOString())

  const dueCount = dueCards?.length || 0
  const deckCount = decks?.length || 0

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white">
      <header className="border-b border-[#534AB7]/20 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#534AB7]">Memorix</h1>
        <nav className="flex items-center gap-6">
          <Link href="/create" className="text-gray-400 hover:text-white transition-colors">Créer</Link>
          <Link href="/settings" className="text-gray-400 hover:text-white transition-colors">Paramètres</Link>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h2 className="text-3xl font-bold mb-2">Bonjour 👋</h2>
          <p className="text-gray-400">
            {dueCount > 0
              ? `Vous avez ${dueCount} carte${dueCount > 1 ? 's' : ''} à réviser aujourd'hui.`
              : 'Aucune carte à réviser pour le moment.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
            <div className="text-3xl font-bold text-[#534AB7]">{dueCount}</div>
            <div className="text-gray-400 text-sm mt-1">Cartes à réviser</div>
          </div>
          <div className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
            <div className="text-3xl font-bold text-[#534AB7]">{deckCount}</div>
            <div className="text-gray-400 text-sm mt-1">Decks actifs</div>
          </div>
          <div className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20">
            <div className="text-3xl font-bold text-[#534AB7]">90%</div>
            <div className="text-gray-400 text-sm mt-1">Rétention cible</div>
          </div>
        </div>

        {dueCount > 0 && (
          <Link href="/review" className="block w-full bg-[#534AB7] hover:bg-[#3C3489] rounded-2xl p-6 text-center text-xl font-bold mb-10 transition-colors">
            Commencer la révision ({dueCount} cartes)
          </Link>
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
              {decks?.map(deck => (
                <Link key={deck.id} href={`/decks/${deck.id}`} className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20 hover:border-[#534AB7]/60 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{deck.icon}</span>
                    <h4 className="font-bold">{deck.name}</h4>
                  </div>
                  <p className="text-gray-400 text-sm">{deck.cards?.[0]?.count || 0} cartes</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}