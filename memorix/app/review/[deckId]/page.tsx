'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { scheduleCard } from '@/lib/fsrs'
import { buildSession } from '@/lib/session-builder'
import { Card, CardReview, Rating } from '@/types'

// Simple confetti burst
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

export default function ReviewPage({ params }: { params: Promise<{ deckId: string }> }) {
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
  const [showConfetti, setShowConfetti] = useState(false)
  const [failedCards, setFailedCards] = useState<Card[]>([])
  const [passNumber, setPassNumber] = useState(1)
  const ratingHistoryRef = useRef<Map<string, number[]>>(new Map())
  // Swipe tracking
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null)

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

        // Batch-load rating history for all session cards in one query
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

    // Use pre-loaded history — no DB round-trip
    const history = ratingHistoryRef.current.get(card.id) || []
    const successRate = history.length > 0
      ? history.filter(r => r >= 2).length / history.length
      : 1.0

    const nextReview = scheduleCard(review, rating, 0.9, {
      userEdited: card.user_edited,
      createdByAi: card.created_by_ai,
      successRate,
    })

    // Fire DB update in background — UI doesn't wait
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

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!flipped) setFlipped(true)
      }
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

  // Swipe handlers
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = Math.abs(e.touches[0].clientY - (touchStartY.current ?? 0))
    if (Math.abs(dx) > 30 && dy < 60) {
      setSwipeHint(dx < 0 ? 'left' : 'right')
    } else {
      setSwipeHint(null)
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0))
    setSwipeHint(null)

    if (Math.abs(dx) > 80 && dy < 80) {
      if (!flipped) {
        setFlipped(true)
      } else {
        // Left = Again (1), Right = Easy (4)
        handleRating(dx < 0 ? 1 : 4)
      }
    } else if (Math.abs(dx) < 10 && dy < 10) {
      if (!flipped) setFlipped(true)
    }

    touchStartX.current = null
    touchStartY.current = null
  }

  // Lock body scroll so pb-16 from layout doesn't allow a 16px body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (loading) return (
    <div className="fixed inset-0 bg-[#0F172A] flex items-center justify-center">
      <div className="text-[#818CF8] text-xl">Chargement...</div>
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
              { label: 'Again', value: stats.again, bg: '#2D1515', text: '#FCA5A5', border: '#991B1B' },
              { label: 'Hard',  value: stats.hard,  bg: '#1E293B', text: '#94A3B8', border: '#334155' },
              { label: 'Good',  value: stats.good,  bg: '#0C4A6E', text: '#BAE6FD', border: '#0369A1' },
              { label: 'Easy',  value: stats.easy,  bg: '#312E81', text: '#C7D2FE', border: '#4338CA' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4 border" style={{ background: s.bg, borderColor: s.border }}>
                <div className="text-2xl font-bold" style={{ color: s.text }}>{s.value}</div>
                <div className="text-xs mt-1 opacity-70" style={{ color: s.text }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => router.push(`/decks/${deckId}`)}
              className="flex-1 border border-[#334155] hover:border-[#818CF8]/50 rounded-xl py-3 text-[#94A3B8] hover:text-[#F1F5F9] transition-all duration-150"
            >
              Voir le deck
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-all duration-150 text-[#E0E7FF]"
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
        <p className="text-gray-400 mb-6">Toutes les cartes sont à jour.</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="bg-[#4338CA] hover:bg-[#3730A3] rounded-xl px-6 py-3 transition-colors"
        >
          Retour au dashboard
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
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1E293B]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push(`/decks/${deckId}`)}
            className="text-[#64748B] hover:text-[#F1F5F9] transition-colors"
          >
            ✕
          </button>
          <div className="text-center">
            {passNumber > 1 && (
              <div className="text-[#818CF8] text-xs font-semibold mb-0.5">
                Passage {passNumber} — {cards.length} carte{cards.length > 1 ? 's' : ''} à retravailler
              </div>
            )}
            <span className="text-[#64748B] text-sm">{current + 1} / {cards.length}</span>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('memorix:quickadd:open', { detail: { deckId, locked: true } }))}
            className="w-8 h-8 flex items-center justify-center text-[#64748B] hover:text-[#818CF8] opacity-60 hover:opacity-100 transition-all rounded-lg hover:bg-white/5"
            title="Ajouter une carte"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="max-w-lg mx-auto mt-3">
          <div className="h-0.5 bg-[#334155] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#818CF8] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Swipe hint overlay */}
      {swipeHint && flipped && (
        <div className={`fixed inset-0 pointer-events-none z-10 flex items-center ${swipeHint === 'left' ? 'justify-start pl-8' : 'justify-end pr-8'}`}>
          <div className={`rounded-2xl px-4 py-2 text-sm font-bold ${swipeHint === 'left' ? 'bg-[#2D1515] text-[#FCA5A5] border border-[#991B1B]' : 'bg-[#312E81] text-[#C7D2FE] border border-[#4338CA]'}`}>
            {swipeHint === 'left' ? '← Again' : 'Easy →'}
          </div>
        </div>
      )}

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
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
              {/* Front */}
              <div
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                className="absolute inset-0 bg-[#1E293B] rounded-[20px] border border-[#334155] p-8 flex flex-col items-center justify-center text-center"
              >
                <div className="text-[10px] text-[#475569] uppercase tracking-[0.04em] font-medium mb-6">Question</div>
                <p className="text-[15px] font-medium leading-relaxed text-[#F1F5F9]">{card.question}</p>
                {!flipped && (
                  <p className="text-[#475569] text-sm mt-8">Appuyez · Espace · Glissez pour révéler</p>
                )}
              </div>

              {/* Back */}
              <div
                style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                className="absolute inset-0 bg-[#1E293B] rounded-[20px] border border-[#334155] p-8 flex flex-col items-center justify-center text-center"
              >
                <div className="text-[10px] text-[#475569] uppercase tracking-[0.04em] font-medium mb-6">Réponse</div>
                <p className="text-2xl font-bold text-[#818CF8] leading-relaxed">{card.answer}</p>
                {card.explanation && (
                  <p className="text-[#94A3B8] text-sm mt-4">{card.explanation}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div className="px-4 pb-4 pt-3 border-t border-[#1E293B]">
          {/* Swipe hints — mobile only */}
          <div className="max-w-lg mx-auto flex justify-between text-xs text-[#475569] mb-2 sm:hidden">
            <span>← Again</span>
            <span>Easy →</span>
          </div>
          {/* 2×2 grid */}
          <div className="max-w-lg mx-auto grid grid-cols-2 gap-2.5">
            {[
              { rating: 1 as Rating, label: 'Again', sub: 'Oublié',   bg: '#2D1515', text: '#FCA5A5', border: '#991B1B' },
              { rating: 2 as Rating, label: 'Hard',  sub: 'Difficile', bg: '#1E293B', text: '#94A3B8', border: '#334155' },
              { rating: 3 as Rating, label: 'Good',  sub: 'Correct',  bg: '#0C4A6E', text: '#BAE6FD', border: '#0369A1' },
              { rating: 4 as Rating, label: 'Easy',  sub: 'Facile',   bg: '#312E81', text: '#C7D2FE', border: '#4338CA' },
            ].map(({ rating, label, sub, bg, text, border }) => (
              <button
                key={rating}
                onClick={() => handleRating(rating)}
                disabled={saving}
                style={{ backgroundColor: bg, color: text, borderColor: border }}
                className="border rounded-[12px] py-3 px-3 text-center transition-all duration-150 disabled:opacity-40 hover:brightness-110"
              >
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-xs opacity-75 mt-0.5">{sub}</div>
                <div className="text-[10px] opacity-40 font-mono mt-1 hidden sm:block">[{rating}]</div>
              </button>
            ))}
          </div>
          <p className="text-center text-[#475569] text-xs mt-2 hidden sm:block">
            Espace = retourner · 1 Again · 2 Hard · 3 Good · 4 Easy
          </p>
        </div>
      )}
    </div>
  )
}
export const runtime = 'edge'
