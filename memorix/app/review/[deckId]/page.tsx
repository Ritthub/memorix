'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { scheduleCard, shouldAutoEasy, ReviewHistoryItem } from '@/lib/fsrs'
import { buildSession } from '@/lib/session-builder'
import { Card, CardReview, Rating } from '@/types'

type UserRating = 1 | 2 | 3

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
        <div key={i} className="absolute top-0 animate-confetti"
          style={{ left: `${p.x}%`, animationDelay: `${p.delay}s`, width: p.size, height: p.size, backgroundColor: p.color, borderRadius: Math.random() > 0.5 ? '50%' : '2px', '--drift': `${p.drift}px` } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

function sessionMessage(stats: { non: number; hesitation: number; oui: number; autoEasy: number }) {
  const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
  if (total === 0) return { emoji: '✅', title: 'Bravo !', sub: 'Session complète.' }
  const goodRate = (stats.oui + stats.autoEasy) / total
  if (goodRate >= 0.9) return { emoji: '🔥', title: 'Session parfaite !', sub: 'Votre mémoire est en feu — continuez comme ça.' }
  if (goodRate >= 0.7) return { emoji: '🎉', title: 'Excellent travail !', sub: 'Votre mémoire se consolide progressivement.' }
  if (goodRate >= 0.5) return { emoji: '💪', title: 'Bonne session !', sub: 'Quelques cartes difficiles — revenez demain.' }
  return { emoji: '📚', title: 'Continuez !', sub: "Ces cartes ont besoin de plus de pratique. C'est normal." }
}

export default function ReviewPage({ params }: { params: Promise<{ deckId: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFreeMode = searchParams.get('mode') === 'free'
  const supabase = createClient()

  const [cards, setCards] = useState<Card[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ non: 0, hesitation: 0, oui: 0, autoEasy: 0 })
  const [deckId, setDeckId] = useState('')
  const [showConfetti, setShowConfetti] = useState(false)
  const [failedCards, setFailedCards] = useState<Card[]>([])
  const [passNumber, setPassNumber] = useState(1)
  const ratingHistoryRef = useRef<Map<string, ReviewHistoryItem[]>>(new Map())

  // Archive state
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [undoData, setUndoData] = useState<{ cardId: string; countdown: number } | null>(null)
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

      type DueRow = { cards: (Card & { deck_id: string }) | null } & CardReview

      if (isFreeMode) {
        // Free mode: all reviews for this deck, no date constraint, shuffle randomly
        const { data: allReviews } = await supabase
          .from('card_reviews')
          .select('*, cards!inner(*)')
          .eq('user_id', user.id)
          .eq('cards.deck_id', p.deckId)

        if (allReviews && allReviews.length > 0) {
          const rows = allReviews as DueRow[]
          const cardsWithReviews = rows
            .filter(r => r.cards && !r.cards.archived)
            .map(r => ({ ...r.cards!, review: r as CardReview }))
          // Shuffle randomly for free review
          const shuffled = [...cardsWithReviews].sort(() => Math.random() - 0.5)
          setCards(shuffled as Card[])
        }
      } else {
        // Normal mode: only due cards
        const { data: dueReviews } = await supabase
          .from('card_reviews')
          .select('*, cards!inner(*)')
          .eq('user_id', user.id)
          .lte('scheduled_at', new Date().toISOString())
          .eq('cards.deck_id', p.deckId)

        if (dueReviews && dueReviews.length > 0) {
          const rows = dueReviews as DueRow[]
          const cardsWithReviews = rows
            .filter(r => r.cards && !r.cards.archived)
            .map(r => ({ ...r.cards!, review: r as CardReview }))
          setCards(buildSession(cardsWithReviews as Card[]))

          const cardIds = cardsWithReviews.map(c => c.id)
          const { data: hist } = await supabase
            .from('card_reviews')
            .select('card_id, rating, scheduled_days')
            .eq('user_id', user.id)
            .in('card_id', cardIds)
            .not('reviewed_at', 'is', null)
            .order('reviewed_at', { ascending: true })
          const map = new Map<string, ReviewHistoryItem[]>()
          for (const h of hist || []) {
            if (!map.has(h.card_id)) map.set(h.card_id, [])
            map.get(h.card_id)!.push({ rating: h.rating || 0, scheduled_days: h.scheduled_days || 0 })
          }
          ratingHistoryRef.current = map
        }
      }
      setLoading(false)
    }
    loadCards()
  }, [])

  // Cleanup undo timers on unmount
  useEffect(() => {
    return () => {
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    }
  }, [])

  const handleRating = useCallback((userRating: UserRating) => {
    if (saving) return
    setSaving(true)
    setShowArchiveConfirm(false)

    const card = cards[current]
    const review = card.review as CardReview
    const history = ratingHistoryRef.current.get(card.id) || []
    const successRate = history.length > 0
      ? history.filter(h => h.rating >= 2).length / history.length
      : 1.0

    if (isFreeMode) {
      // Free mode: record rating only, FSRS intervals unchanged
      supabase
        .from('card_reviews')
        .update({ rating: userRating, reviewed_at: new Date().toISOString() })
        .eq('id', review.id)
        .then((res: { error: unknown }) => { if (res.error) console.error('free rating save failed:', res.error) })

      setStats(s => {
        if (userRating === 1) return { ...s, non: s.non + 1 }
        if (userRating === 2) return { ...s, hesitation: s.hesitation + 1 }
        return { ...s, oui: s.oui + 1 }
      })
    } else {
      // Normal mode: full FSRS update
      const isAutoEasy = userRating === 3 && shouldAutoEasy(history, review.scheduled_days || 0)
      const fsrsRating = (isAutoEasy ? 4 : userRating) as Rating

      const nextReview = scheduleCard(review, fsrsRating, 0.9, {
        userEdited: card.user_edited,
        createdByAi: card.created_by_ai,
        successRate,
      })
      supabase
        .from('card_reviews')
        .update({ ...nextReview, reviewed_at: new Date().toISOString(), rating: fsrsRating })
        .eq('id', review.id)
        .then((res: { error: unknown }) => { if (res.error) console.error('rating save failed:', res.error) })

      setStats(s => {
        if (userRating === 1) return { ...s, non: s.non + 1 }
        if (userRating === 2) return { ...s, hesitation: s.hesitation + 1 }
        if (isAutoEasy) return { ...s, autoEasy: s.autoEasy + 1 }
        return { ...s, oui: s.oui + 1 }
      })
    }

    const newFailed = userRating === 1 ? [...failedCards, card] : [...failedCards]
    const isLastCard = current + 1 >= cards.length

    setTimeout(() => {
      if (isLastCard) {
        if (newFailed.length > 0) {
          setCards(newFailed); setCurrent(0); setFailedCards([]); setPassNumber(p => p + 1); setFlipped(false)
        } else {
          setDone(true)
          if (!isFreeMode) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3500) }
        }
      } else {
        if (userRating === 1) setFailedCards(newFailed)
        setCurrent(c => c + 1)
        setFlipped(false)
      }
      setSaving(false)
    }, 300)
  }, [saving, cards, current, failedCards, supabase, isFreeMode])

  function archiveCard() {
    const card = cards[current]
    setShowArchiveConfirm(false)

    const now = new Date()
    const autoDeleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    supabase.from('cards').update({
      archived: true,
      archived_at: now.toISOString(),
      auto_delete_at: autoDeleteAt.toISOString(),
    }).eq('id', card.id).then((res: { error: unknown }) => { if (res.error) console.error('archive error:', res.error) })

    const newCards = cards.filter((_, i) => i !== current)

    if (newCards.length === 0) {
      setDone(true)
      if (!isFreeMode) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3500) }
    } else {
      setCards(newCards)
      if (current >= newCards.length) setCurrent(newCards.length - 1)
      setFlipped(false)
    }

    let countdown = 5
    setUndoData({ cardId: card.id, countdown })
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    undoIntervalRef.current = setInterval(() => {
      countdown--
      setUndoData(prev => prev ? { ...prev, countdown } : null)
    }, 1000)
    undoTimeoutRef.current = setTimeout(() => {
      clearInterval(undoIntervalRef.current!)
      setUndoData(null)
    }, 5000)
  }

  function undoArchiveCard(cardId: string) {
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setUndoData(null)
    supabase.from('cards').update({ archived: false, archived_at: null, auto_delete_at: null }).eq('id', cardId)
      .then((res: { error: unknown }) => { if (res.error) console.error('undo archive error:', res.error) })
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!flipped) setFlipped(true) }
      if (flipped) {
        if (e.key === '1') handleRating(1)
        if (e.key === '2') handleRating(2)
        if (e.key === '3') handleRating(3)
        if (e.key === 'Escape') setShowArchiveConfirm(false)
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
    setSwipeHint(Math.abs(dx) > 30 && dy < 60 ? (dx < 0 ? 'left' : 'right') : null)
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0))
    setSwipeHint(null)
    if (Math.abs(dx) > 80 && dy < 80) {
      if (!flipped) setFlipped(true)
      else handleRating(dx < 0 ? 1 : 3)
    } else if (Math.abs(dx) < 10 && dy < 10 && !flipped) setFlipped(true)
    touchStartX.current = null; touchStartY.current = null
  }

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  if (loading) return (
    <div className="fixed inset-0 bg-[#0F172A] flex items-center justify-center">
      <div className="text-[#818CF8] text-xl">Chargement...</div>
    </div>
  )

  if (done) {
    const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
    if (isFreeMode) {
      return (
        <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="text-7xl mb-4">🔄</div>
            <h1 className="text-3xl font-bold mb-2">Session libre terminée !</h1>
            <p className="text-[#94A3B8] mb-1">Vos intervalles de révision FSRS n&apos;ont pas été modifiés.</p>
            <p className="text-gray-500 text-sm mb-6">{total} carte{total > 1 ? 's' : ''} révisée{total > 1 ? 's' : ''}</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Non',        value: stats.non,        bg: '#2D1515', text: '#FCA5A5', border: '#991B1B' },
                { label: 'Hésitation', value: stats.hesitation, bg: '#1C1F2E', text: '#818CF8', border: '#4338CA' },
                { label: 'Oui',        value: stats.oui,        bg: '#0C2D1E', text: '#5DCAA5', border: '#0F6E56' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 border" style={{ background: s.bg, borderColor: s.border }}>
                  <div className="text-2xl font-bold" style={{ color: s.text }}>{s.value}</div>
                  <div className="text-xs mt-1 opacity-70" style={{ color: s.text }}>{s.label}</div>
                </div>
              ))}
            </div>
            <button onClick={() => router.push(`/decks/${deckId}`)}
              className="w-full bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-all duration-150 text-[#E0E7FF]">
              Retour au deck
            </button>
          </div>
        </div>
      )
    }

    const msg = sessionMessage(stats)
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
        <Confetti active={showConfetti} />
        <div className="max-w-md w-full text-center">
          <div className="text-7xl mb-4 animate-bounce-once">{msg.emoji}</div>
          <h1 className="text-3xl font-bold mb-2">{msg.title}</h1>
          <p className="text-gray-400 mb-2">{msg.sub}</p>
          <p className="text-gray-500 text-sm mb-6">{total} carte{total > 1 ? 's' : ''} révisée{total > 1 ? 's' : ''}</p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Non',        value: stats.non,        bg: '#2D1515', text: '#FCA5A5', border: '#991B1B' },
              { label: 'Hésitation', value: stats.hesitation, bg: '#1C1F2E', text: '#818CF8', border: '#4338CA' },
              { label: 'Oui',        value: stats.oui,        bg: '#0C2D1E', text: '#5DCAA5', border: '#0F6E56' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4 border" style={{ background: s.bg, borderColor: s.border }}>
                <div className="text-2xl font-bold" style={{ color: s.text }}>{s.value}</div>
                <div className="text-xs mt-1 opacity-70" style={{ color: s.text }}>{s.label}</div>
              </div>
            ))}
          </div>
          {stats.autoEasy > 0 && (
            <div className="bg-[#1C1F2E] border border-[#4338CA]/30 rounded-xl p-3 mb-6 flex items-center gap-2 text-sm">
              <span className="text-[#818CF8]">✨</span>
              <span className="text-[#94A3B8]">{stats.autoEasy} intervalle{stats.autoEasy > 1 ? 's' : ''} optimisé{stats.autoEasy > 1 ? 's' : ''} automatiquement</span>
            </div>
          )}

          <div className="flex gap-4">
            <button onClick={() => router.push(`/decks/${deckId}`)}
              className="flex-1 border border-[#334155] hover:border-[#818CF8]/50 rounded-xl py-3 text-[#94A3B8] hover:text-[#F1F5F9] transition-all duration-150">
              Voir le deck
            </button>
            <button onClick={() => router.push('/dashboard')}
              className="flex-1 bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-all duration-150 text-[#E0E7FF]">
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
        <button onClick={() => router.push('/dashboard')} className="bg-[#4338CA] hover:bg-[#3730A3] rounded-xl px-6 py-3 transition-colors">
          Retour au dashboard
        </button>
      </div>
    </div>
  )

  const card = cards[current]
  const progress = Math.round((current / cards.length) * 100)

  return (
    <div className="fixed inset-0 bg-[#0F172A] text-white flex flex-col select-none overflow-hidden"
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1E293B]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push(`/decks/${deckId}`)} className="text-[#64748B] hover:text-[#F1F5F9] transition-colors">✕</button>
          <div className="text-center">
            {passNumber > 1 && (
              <div className="text-[#818CF8] text-xs font-semibold mb-0.5">
                Passage {passNumber} — {cards.length} carte{cards.length > 1 ? 's' : ''} à retravailler
              </div>
            )}
            <div className="flex items-center gap-2 justify-center">
              <span className="text-[#64748B] text-sm">{current + 1} / {cards.length}</span>
              {isFreeMode && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: '#854F0B', color: '#FAC775' }}
                  title="Vos intervalles de révision ne sont pas modifiés"
                >
                  ∞ Mode libre
                </span>
              )}
            </div>
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
            <div className="h-full bg-[#818CF8] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Swipe hint */}
      {swipeHint && flipped && (
        <div className={`fixed inset-0 pointer-events-none z-10 flex items-center ${swipeHint === 'left' ? 'justify-start pl-8' : 'justify-end pr-8'}`}>
          <div className={`rounded-2xl px-4 py-2 text-sm font-bold ${swipeHint === 'left' ? 'bg-[#2D1515] text-[#FCA5A5] border border-[#991B1B]' : 'bg-[#0C2D1E] text-[#5DCAA5] border border-[#0F6E56]'}`}>
            {swipeHint === 'left' ? '← Non' : 'Oui →'}
          </div>
        </div>
      )}

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-lg">
          <div onClick={() => !flipped && setFlipped(true)} className="cursor-pointer" style={{ perspective: '1000px' }}>
            <div style={{ transformStyle: 'preserve-3d', transition: 'transform 0.5s cubic-bezier(.4,0,.2,1)', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', position: 'relative', minHeight: '280px' }}>
              <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                className="absolute inset-0 bg-[#1E293B] rounded-[20px] border border-[#334155] p-8 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] text-[#475569] uppercase tracking-[0.04em] font-medium mb-6">Question</div>
                <p className="text-[15px] font-medium leading-relaxed text-[#F1F5F9]">{card.question}</p>
                {!flipped && <p className="text-[#475569] text-sm mt-8">Appuyez · Espace · Glissez pour révéler</p>}
              </div>
              <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                className="absolute inset-0 bg-[#1E293B] rounded-[20px] border border-[#334155] p-8 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] text-[#475569] uppercase tracking-[0.04em] font-medium mb-6">Réponse</div>
                <p className="text-2xl font-bold text-[#818CF8] leading-relaxed whitespace-pre-wrap">{card.answer}</p>
                {card.explanation && <p className="text-[#94A3B8] text-sm mt-4">{card.explanation}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div className="px-4 pb-4 pt-3 border-t border-[#1E293B]">
          <div className="max-w-lg mx-auto flex justify-between text-xs text-[#475569] mb-2 sm:hidden">
            <span>← Non</span><span>Oui →</span>
          </div>
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-2.5">
            {([
              { rating: 1, label: 'Non',        sub: "Je n'savais pas · 1", bg: '#2D1515', text: '#FCA5A5', border: '#991B1B' },
              { rating: 2, label: 'Hésitation', sub: 'Avec effort · 2',     bg: '#1C1F2E', text: '#818CF8', border: '#4338CA' },
              { rating: 3, label: 'Oui',        sub: 'Je savais · 3',       bg: '#0C2D1E', text: '#5DCAA5', border: '#0F6E56' },
            ] as const).map(({ rating, label, sub, bg, text, border }) => (
              <button key={rating} onClick={() => handleRating(rating)} disabled={saving}
                style={{ backgroundColor: bg, color: text, borderColor: border }}
                className="border rounded-[12px] py-4 px-3 text-center transition-all duration-150 disabled:opacity-40 hover:brightness-110 min-h-[64px]">
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-xs opacity-75 mt-0.5">{sub}</div>
                <div className="text-[10px] opacity-40 font-mono mt-1 hidden sm:block">[{rating}]</div>
              </button>
            ))}
          </div>

          {/* Archive button */}
          <div className="max-w-lg mx-auto mt-3 border-t border-[#1E293B] pt-3">
            {!showArchiveConfirm ? (
              <button onClick={() => setShowArchiveConfirm(true)}
                className="w-full h-10 flex items-center justify-center gap-2 text-[#64748B] border border-[#334155]/50 rounded-xl text-sm hover:border-[#818CF8] hover:text-[#94A3B8] transition-colors">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 8v13H3V8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 3h22v5H1z" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 12h4" strokeLinecap="round"/>
                </svg>
                Archiver cette carte
              </button>
            ) : (
              <div className="bg-[#0F172A] border border-[#334155] rounded-xl p-3 flex items-center gap-2">
                <span className="text-[#94A3B8] flex-1 text-xs leading-snug">Cette carte disparaîtra des révisions. Récupérable 30 jours.</span>
                <button onClick={() => setShowArchiveConfirm(false)} className="text-[#64748B] hover:text-white text-xs px-2 py-1 rounded flex-shrink-0">Annuler</button>
                <button onClick={archiveCard} className="bg-[#334155] hover:bg-[#475569] text-white text-xs px-3 py-1 rounded flex-shrink-0">Archiver</button>
              </div>
            )}
          </div>

          <p className="text-center text-[#475569] text-xs mt-2 hidden sm:block">
            Espace = retourner · 1 Non · 2 Hésitation · 3 Oui
          </p>
        </div>
      )}

      {/* Undo toast */}
      {undoData && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-2.5 text-sm flex items-center gap-3 shadow-lg whitespace-nowrap">
          <span className="text-[#F1F5F9]">Archivée</span>
          <button onClick={() => undoArchiveCard(undoData.cardId)} className="text-[#818CF8] hover:text-[#A5B4FC] font-medium transition-colors">
            Annuler ({undoData.countdown}s)
          </button>
        </div>
      )}
    </div>
  )
}
export const runtime = 'edge'
