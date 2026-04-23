import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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

  const dueCount = dueReviews?.length || 0
  const cardCount = cards?.length || 0

  if (!deck) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
            ← Retour
          </Link>
          <Link href={`/create?deckId=${deck.id}`} className="text-sm text-[#534AB7] hover:text-[#AFA9EC] transition-colors">
            + Ajouter des cartes
          </Link>
        </div>

        <div className="bg-[#1A1A2E] rounded-2xl p-8 border border-[#534AB7]/20 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-4xl">{deck.icon}</span>
            <div>
              <h1 className="text-2xl font-bold">{deck.name}</h1>
              {deck.description && (
                <p className="text-gray-400 mt-1">{deck.description}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-[#0D0D1A] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#534AB7]">{cardCount}</div>
              <div className="text-gray-400 text-xs mt-1">Cartes total</div>
            </div>
            <div className="bg-[#0D0D1A] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#534AB7]">{dueCount}</div>
              <div className="text-gray-400 text-xs mt-1">À réviser</div>
            </div>
            <div className="bg-[#0D0D1A] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-[#534AB7]">
                {cardCount > 0 ? Math.round(((cardCount - dueCount) / cardCount) * 100) : 0}%
              </div>
              <div className="text-gray-400 text-xs mt-1">Maîtrisées</div>
            </div>
          </div>
        </div>

        {dueCount > 0 && (
          <Link href={`/review/${deck.id}`} className="block w-full bg-[#534AB7] hover:bg-[#3C3489] rounded-2xl p-5 text-center text-lg font-bold mb-6 transition-colors">
            Réviser ce deck ({dueCount} cartes)
          </Link>
        )}

        <div>
          <h2 className="text-xl font-bold mb-4">Cartes ({cardCount})</h2>
          <div className="space-y-3">
            {cards?.map(card => (
              <div key={card.id} className="bg-[#1A1A2E] rounded-xl p-5 border border-[#534AB7]/20">
                <p className="font-medium mb-2">{card.question}</p>
                <p className="text-[#534AB7] text-sm">{card.answer}</p>
                {card.explanation && (
                  <p className="text-gray-500 text-xs mt-2">{card.explanation}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-[#0D0D1A] text-gray-400">
                    {card.card_reviews?.[0]?.state || 'new'}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-[#0D0D1A] text-gray-400">
                    Difficulté {card.difficulty}/5
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export const runtime = 'edge'
