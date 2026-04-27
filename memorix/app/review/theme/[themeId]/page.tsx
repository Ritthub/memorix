'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { scheduleCard } from '@/lib/fsrs'
import { buildSession } from '@/lib/session-builder'
import { Card, CardReview, Rating } from '@/types'

function Confetti({ active }: { active: boolean }) {
  const PIECES = 60
  const colors = ['#4338CA', '#818CF8', '#7C6FCD', '#E879F9', '#34D399', '#FBBF24']
  const pieces = useRef(
    Array.from({ length: PIECES }, (_, i) => ({
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      color: colors[i % colors.length],
      size: 6 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 60,
    }))
  )
  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.current.map((p, i) => (
        <div
          key={i}
          className="absolute top-0 animate-confetti"
          style={{
            left: `${p.x}%`,
            animationDelay: `${p.delay}s`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            '--drift': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

function sessionMessage(stats: { again: number; hard: number; good: number; easy: number }) {
  const total = stats.again + stats.hard + stats.good + stats.easy
  if (total === 0) return { emoji: '✅', title: 'Bravo !', sub: 'Session complète.' }
  const goodRate = (stats.good + stats.easy) / total
  if (goodRate >= 0.9) return { emoji: '🔥', title: 'Session parfaite !', sub: 'Votre mémoire est en feu — continuez comme ça.' }
  if (goodRate >= 0.7) return { emoji: '🎉', title: 'Excellent travail !', sub: 'Votre mémoire se consolide progressivement.' }
  if (goodRate >= 0.5) return { emoji: '💪', title: 'Bonne session !', sub: 'Quelques cartes difficiles — revenez demain.' }
  return { emoji: '📚', title: 'Continuez !', sub: 'Ces cartes ont besoin de plus de pratique. C\'est normal.' }
}

export default function ThemeReviewPage({ params }: { params: Promise<{ themeId: string }> }) {
  const router = useRouter()
  const supabase = createClient()
  const [cards, setCards] = useState<Card[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 })
  const [themeId, setThemeId] = useState('')
  const [showConfetti, setShowConfetti] = useState(false)
  const [failedCards, setFailedCards] = useState<Card[]>([])
  const [passNumber, setPassNumber] = useState(1)
  const ratingHistoryRef = useRef<Map<string, number[]>>(new Map())
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null)

  useEffect(() => {
    async function loadCards() {
      const p = await params
      setThemeId(p.themeId)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get all deck IDs for this theme
      const { data: themeDecks } = await supabase
        .from('decks')
        .select('id')
        .eq('theme_id', p.themeId)
        .eq('user_id', user.id)

      const deckIds = (themeDecks || []).map(d => d.id)
      if (deckIds.length === 0) { setLoading(false); return }

      const { data: dueReviews } = await supabase
        .from('card_reviews')
        .select('*, cards(*)')
        .eq('user_id', user.id)
        .lte('scheduled_at', new Date().toISOString())
        .in('cards.deck_id', deckIds)
        .not('cards', 'is', null)

      if (dueReviews && dueReviews.length > 0) {
        const cardsWithReviews = dueReviews
          .filter(r => r.cards && deckIds.includes(r.cards.deck_id))
          .map(r => ({ ...r.cards, review: r }))
        setCards(buildSession(cardsWithReviews))

        const cardIds = cardsWithReviews.map(c => c.id)
        const { data: hist } = await supabase
          .from('card_reviews')
          .select('card_id, rating')
          .eq('user_id', user.id)
          .in('card_id', cardIds)
          .not('reviewed_at', 'is', null)
          .order('reviewed_at', { ascending: true })
        const map = new Map<string, number[]>()
        for (const h of hist || []) {
          if (!map.has(h.card_id)) map.set(h.card_id, [])
          map.get(h.card_id)!.push(h.rating || 0)
        }
        ratingHistoryRef.current = map
      }
      setLoading(false)
    }
    loadCards()
  }, [])

  const handleRating = useCallback((rating: Rating) => {
    if (saving) return
    setSaving(true)

    const card = cards[current]
    const review = card.review as CardReview

    const history = ratingHistoryRef.current.get(card.id) || []
    const successRate = history.length > 0
      ? history.filter(r => r >= 2).length / history.length
      : 1.0

    const nextReview = scheduleCard(review, rating, 0.9, {
      userEdited: card.user_edited,
      createdByAi: card.created_by_ai,
      successRate,
    })

    supabase
      .from('card_reviews')
      .update({ ...nextReview, reviewed_at: new Date().toISOString(), rating })
      .eq('id', review.id)
      .then(({ error }) => { if (error) console.error('rating save failed:', error) })

    setStats(s => {
      const key = rating === 1 ? 'again' : rating === 2 ? 'hard' : rating === 3 ? 'good' : 'easy'
      return { ...s, [key]: s[key] + 1 }
    })

    const newFailed = rating === 1 ? [...failedCards, card] : [...failedCards]
    const isLastCard = current + 1 >= cards.length

    setTimeout(() => {
      if (isLastCard) {
        if (newFailed.length > 0) {
          setCards(newFailed)
          setCurrent(0)
          setFailedCards([])
          setPassNumber(p => p + 1)
          setFlipped(false)
        } else {
          setDone(true)
          setShowConfetti(true)
          setTimeout(() => setShowConfetti(false), 3500)
        }
      } else {
        if (rating === 1) setFailedCards(newFailed)
        setCurrent(c => c + 1)
        setFlipped(false)
      }
      setSaving(false)
    }, 300)
  }, [saving, cards, current, failedCards, supabase])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!flipped) setFlipped(true) }
      if (flipped) {
        if (e.key === '1') handleRating(1 as Rating)
        if (e.key === '2') handleRating(2 as Rating)
        if (e.key === '3') handleRating(3 as Rating)
        if (e.key === '4') handleRating(4 as Rating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, handleRating])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = Math.abs(e.touches[0].clientY - (touchStartY.current ?? 0))
    if (Math.abs(dx) > 30 && dy < 60) setSwipeHint(dx < 0 ? 'left' : 'right')
    else setSwipeHint(null)
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0))
    setSwipeHint(null)
    if (Math.abs(dx) > 80 && dy < 80) {
      if (!flipped) setFlipped(true)
      else handleRating(dx < 0 ? 1 : 4)
    } else if (Math.abs(dx) < 10 && dy < 10) {
      if (!flipped) setFlipped(true)
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (loading) return (
    <div className="fixed inset-0 bg-[#0F172A] flex items-center justify-center">
      <div className="text-[#4338CA] text-xl">Chargement...</div>
    </div>
  )

  if (done) {
    const msg = sessionMessage(stats)
    const total = stats.again + stats.hard + stats.good + stats.easy
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
        <Confetti active={showConfetti} />
        <div className="max-w-md w-full text-center">
          <div className="text-7xl mb-4 animate-bounce-once">{msg.emoji}</div>
          <h1 className="text-3xl font-bold mb-2">{msg.title}</h1>
          <p className="text-gray-400 mb-2">{msg.sub}</p>
          <p className="text-gray-500 text-sm mb-8">{total} carte{total > 1 ? 's' : ''} révisée{total > 1 ? 's' : ''}</p>
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Again', value: stats.again, color: 'text-red-400' },
              { label: 'Hard', value: stats.hard, color: 'text-orange-400' },
              { label: 'Good', value: stats.good, color: 'text-green-400' },
              { label: 'Easy', value: stats.easy, color: 'text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-[#1E293B] rounded-xl p-4 border border-[#334155]">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-gray-400 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push(`/themes/${themeId}`)}
              className="flex-1 border border-[#334155] hover:border-[#4338CA] rounded-xl py-3 text-gray-400 hover:text-white transition-colors"
            >
              Voir le thème
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-colors"
            >
              Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (cards.length === 0) return (
    <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Rien à réviser !</h1>
        <p className="text-gray-400 mb-6">Toutes les cartes du thème sont à jour.</p>
        <button onClick={() => router.push(`/themes/${themeId}`)} className="bg-[#4338CA] hover:bg-[#3730A3] rounded-xl px-6 py-3 transition-colors">
          Retour au thème
        </button>
      </div>
    </div>
  )

  const card = cards[current]
  const progress = Math.round((current / cards.length) * 100)

  return (
    <div
      className="fixed inset-0 bg-[#0F172A] text-white flex flex-col select-none overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="px-6 py-4 border-b border-[#334155]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push(`/themes/${themeId}`)} className="text-gray-400 hover:text-white transition-colors">✕</button>
          <div className="text-center">
            {passNumber > 1 && (
              <div className="text-[#818CF8] text-xs font-semibold mb-0.5">
                Passage {passNumber} — {cards.length} carte{cards.length > 1 ? 's' : ''} à retravailler
              </div>
            )}
            <span className="text-gray-400 text-sm">{current + 1} / {cards.length}</span>
          </div>
          <div className="w-8" />
        </div>
        <div className="max-w-lg mx-auto mt-3">
          <div className="h-1 bg-[#1E293B] rounded-full overflow-hidden">
            <div className="h-full bg-[#4338CA] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {swipeHint && flipped && (
        <div className={`fixed inset-0 pointer-events-none z-10 flex items-center ${swipeHint === 'left' ? 'justify-start pl-8' : 'justify-end pr-8'}`}>
          <div className={`rounded-2xl px-4 py-2 text-sm font-bold ${swipeHint === 'left' ? 'bg-red-500/80 text-white' : 'bg-blue-500/80 text-white'}`}>
            {swipeHint === 'left' ? '← Again' : 'Easy →'}
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <div className="w-full max-w-lg">
          <button
            onClick={() => !flipped && setFlipped(true)}
            className="w-full"
            disabled={flipped}
          >
            <div className="bg-[#1E293B] rounded-3xl p-8 border border-[#334155] min-h-[240px] flex flex-col items-center justify-center gap-4 shadow-xl shadow-[#4338CA]/10">
              {card.theme && (
                <span className="text-xs text-[#818CF8] font-medium uppercase tracking-widest opacity-70">{card.theme}</span>
              )}
              <p className="text-xl font-semibold text-center leading-relaxed">{card.question}</p>
              {!flipped && <p className="text-gray-600 text-sm mt-2">Appuyer pour révéler</p>}
            </div>
          </button>

          {flipped && (
            <div className="mt-4 bg-[#0F0F1F] rounded-3xl p-8 border border-[#334155] min-h-[180px] flex flex-col items-center justify-center gap-3">
              <p className="text-lg text-center leading-relaxed">{card.answer}</p>
              {card.explanation && (
                <p className="text-sm text-gray-500 text-center mt-2 italic">{card.explanation}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {flipped && (
        <div className="px-6 py-4 border-t border-[#334155]">
          <div className="max-w-lg mx-auto grid grid-cols-4 gap-3">
            {[
              { label: 'Again', rating: 1 as Rating, color: 'bg-red-500/20 hover:bg-red-500/40 border-red-500/30 text-red-300' },
              { label: 'Hard', rating: 2 as Rating, color: 'bg-orange-500/20 hover:bg-orange-500/40 border-orange-500/30 text-orange-300' },
              { label: 'Good', rating: 3 as Rating, color: 'bg-green-500/20 hover:bg-green-500/40 border-green-500/30 text-green-300' },
              { label: 'Easy', rating: 4 as Rating, color: 'bg-blue-500/20 hover:bg-blue-500/40 border-blue-500/30 text-blue-300' },
            ].map(b => (
              <button
                key={b.label}
                onClick={() => handleRating(b.rating)}
                disabled={saving}
                className={`${b.color} border rounded-2xl py-3 font-semibold text-sm transition-all active:scale-95 disabled:opacity-50`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <p className="text-center text-gray-700 text-xs mt-3">← Glisser pour Again · Easy pour Glisser →</p>
        </div>
      )}

      {!flipped && (
        <div className="px-6 py-4 border-t border-[#334155]">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setFlipped(true)}
              className="w-full bg-[#4338CA] hover:bg-[#3730A3] rounded-2xl py-4 font-semibold transition-colors"
            >
              Révéler la réponse
            </button>
            <p className="text-center text-gray-600 text-xs mt-2">Espace · Entrée · Appuyer</p>
          </div>
        </div>
      )}
    </div>
  )
}
