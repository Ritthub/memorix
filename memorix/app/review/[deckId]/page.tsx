'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { scheduleCard } from '@/lib/fsrs'
import { buildSession, reinsertFailed } from '@/lib/session-builder'
import { Card, CardReview, Rating } from '@/types'

export default function ReviewPage({ params }: { params: { deckId: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const [cards, setCards] = useState<Card[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 })
  const [deckId, setDeckId] = useState('')

  useEffect(() => {
    async function loadCards() {
      const p = await params
      setDeckId(p.deckId)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: dueReviews } = await supabase
        .from('card_reviews')
        .select('*, cards(*)')
        .eq('user_id', user.id)
        .lte('scheduled_at', new Date().toISOString())
        .eq('cards.deck_id', p.deckId)
        .not('cards', 'is', null)

      if (dueReviews && dueReviews.length > 0) {
        const cardsWithReviews = dueReviews
          .filter(r => r.cards)
          .map(r => ({ ...r.cards, review: r }))
        setCards(buildSession(cardsWithReviews))
      }
      setLoading(false)
    }
    loadCards()
  }, [])

  async function handleRating(rating: Rating) {
  if (saving) return
  setSaving(true)

  const card = cards[current]
  const review = card.review as CardReview
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Récupère l'historique des révisions pour calculer le taux de succès
  const { data: history } = await supabase
    .from('card_reviews')
    .select('rating')
    .eq('card_id', card.id)
    .eq('user_id', user.id)
    .order('reviewed_at', { ascending: true })
    .limit(10)

  const successRate = history && history.length > 0
    ? history.filter(r => (r.rating || 0) >= 2).length / history.length
    : 1.0

  const nextReview = scheduleCard(review, rating, 0.9, {
    userEdited: card.user_edited,
    createdByAi: card.created_by_ai,
    successRate,
  })

  await supabase
    .from('card_reviews')
    .update({
      ...nextReview,
      reviewed_at: new Date().toISOString(),
      rating,
    })
    .eq('id', review.id)

  setStats(s => ({
    ...s,
    [rating === 1 ? 'again' : rating === 2 ? 'hard' : rating === 3 ? 'good' : 'easy']:
      s[rating === 1 ? 'again' : rating === 2 ? 'hard' : rating === 3 ? 'good' : 'easy'] + 1
  }))

  let nextQueue = cards.slice(current + 1)
  if (rating === 1) {
    nextQueue = reinsertFailed(card, nextQueue)
  }

  setTimeout(() => {
    if (nextQueue.length === 0) {
      setDone(true)
    } else {
      setCards([...cards.slice(0, current + 1), ...nextQueue])
      setCurrent(c => c + 1)
      setFlipped(false)
    }
    setSaving(false)
  }, 300)
}

  if (loading) return (
    <div className="min-h-screen bg-[#0D0D1A] flex items-center justify-center">
      <div className="text-[#534AB7] text-xl">Chargement...</div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-[#0D0D1A] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-bold mb-2">Session terminée !</h1>
        <p className="text-gray-400 mb-8">Excellent travail — votre mémoire se consolide.</p>

        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Again', value: stats.again, color: 'text-red-400' },
            { label: 'Hard', value: stats.hard, color: 'text-orange-400' },
            { label: 'Good', value: stats.good, color: 'text-green-400' },
            { label: 'Easy', value: stats.easy, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="bg-[#1A1A2E] rounded-xl p-4 border border-[#534AB7]/20">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-gray-400 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => router.push(`/decks/${deckId}`)}
            className="flex-1 border border-[#534AB7]/30 hover:border-[#534AB7] rounded-xl py-3 text-gray-400 hover:text-white transition-colors"
          >
            Voir le deck
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 bg-[#534AB7] hover:bg-[#3C3489] rounded-xl py-3 font-medium transition-colors"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  if (cards.length === 0) return (
    <div className="min-h-screen bg-[#0D0D1A] text-white flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Rien à réviser !</h1>
        <p className="text-gray-400 mb-6">Toutes les cartes sont à jour.</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="bg-[#534AB7] hover:bg-[#3C3489] rounded-xl px-6 py-3 transition-colors"
        >
          Retour au dashboard
        </button>
      </div>
    </div>
  )

  const card = cards[current]
  const progress = Math.round((current / cards.length) * 100)

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#534AB7]/20">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push(`/decks/${deckId}`)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
          <span className="text-gray-400 text-sm">{current + 1} / {cards.length}</span>
          <div className="w-8" />
        </div>
        {/* Barre de progression */}
        <div className="max-w-lg mx-auto mt-3">
          <div className="h-1 bg-[#1A1A2E] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#534AB7] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Carte */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div
            onClick={() => !flipped && setFlipped(true)}
            className="cursor-pointer"
            style={{ perspective: '1000px' }}
          >
            <div
              style={{
                transformStyle: 'preserve-3d',
                transition: 'transform 0.5s cubic-bezier(.4,0,.2,1)',
                transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                position: 'relative',
                minHeight: '280px',
              }}
            >
              {/* Face avant */}
              <div
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                className="absolute inset-0 bg-[#1A1A2E] rounded-2xl border border-[#534AB7]/20 p-8 flex flex-col items-center justify-center text-center"
              >
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-6">Question</div>
                <p className="text-xl font-medium leading-relaxed">{card.question}</p>
                {!flipped && (
                  <p className="text-gray-600 text-sm mt-8">Cliquez pour révéler la réponse</p>
                )}
              </div>

              {/* Face arrière */}
              <div
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)'
                }}
                className="absolute inset-0 bg-[#1A1A2E] rounded-2xl border border-[#534AB7]/40 p-8 flex flex-col items-center justify-center text-center"
              >
                <div className="text-xs text-gray-500 uppercase tracking-widest mb-6">Réponse</div>
                <p className="text-2xl font-bold text-[#534AB7] leading-relaxed">{card.answer}</p>
                {card.explanation && (
                  <p className="text-gray-400 text-sm mt-4">{card.explanation}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Boutons de rating */}
      {flipped && (
        <div className="px-6 py-6 border-t border-[#534AB7]/20">
          <div className="max-w-lg mx-auto grid grid-cols-4 gap-3">
            {[
              { rating: 1 as Rating, label: 'Again', sub: 'Oublié', color: 'border-red-500/50 hover:bg-red-500/10 text-red-400' },
              { rating: 2 as Rating, label: 'Hard', sub: 'Difficile', color: 'border-orange-500/50 hover:bg-orange-500/10 text-orange-400' },
              { rating: 3 as Rating, label: 'Good', sub: 'Correct', color: 'border-green-500/50 hover:bg-green-500/10 text-green-400' },
              { rating: 4 as Rating, label: 'Easy', sub: 'Facile', color: 'border-blue-500/50 hover:bg-blue-500/10 text-blue-400' },
            ].map(({ rating, label, sub, color }) => (
              <button
                key={rating}
                onClick={() => handleRating(rating)}
                disabled={saving}
                className={`border rounded-xl py-3 px-2 text-center transition-colors disabled:opacity-40 ${color}`}
              >
                <div className="font-bold text-sm">{label}</div>
                <div className="text-xs opacity-70 mt-1">{sub}</div>
              </button>
            ))}
          </div>
          <p className="text-center text-gray-600 text-xs mt-3">
            Raccourcis : 1 Again · 2 Hard · 3 Good · 4 Easy
          </p>
        </div>
      )}
    </div>
  )
}