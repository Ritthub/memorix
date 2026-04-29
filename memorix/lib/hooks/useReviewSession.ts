'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { scheduleCard, shouldAutoEasy, ReviewHistoryItem } from '@/lib/fsrs'
import { buildSession } from '@/lib/session-builder'
import { Card, CardReview, Rating, UserRating } from '@/types'
import { createClient } from '@/lib/supabase'

type SupabaseClient = ReturnType<typeof createClient>

export interface ReviewStats {
  non: number
  hesitation: number
  oui: number
  autoEasy: number
}

export interface UseReviewSessionOptions {
  /** Called once on mount with the authenticated userId. Returns deck IDs to review. */
  loadDeckIds: (userId: string) => Promise<string[]>
  isFreeMode: boolean
  supabase: SupabaseClient
}

export interface UseReviewSessionReturn {
  isLoading: boolean
  isFinished: boolean
  cards: Card[]
  currentCard: Card | null
  currentIndex: number
  totalCards: number
  passNumber: number
  flipped: boolean
  isSaving: boolean
  stats: ReviewStats
  showArchiveConfirm: boolean
  undoData: { cardId: string; countdown: number } | null
  showConfetti: boolean
  swipeHint: 'left' | 'right' | null
  handleFlip: () => void
  handleRating: (rating: UserRating) => void
  handleArchiveRequest: () => void
  handleArchiveCancel: () => void
  handleArchiveConfirm: () => void
  handleUndoArchive: (cardId: string) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

export function useReviewSession({
  loadDeckIds,
  isFreeMode,
  supabase,
}: UseReviewSessionOptions): UseReviewSessionReturn {
  const router = useRouter()

  const [cards, setCards] = useState<Card[]>([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [stats, setStats] = useState<ReviewStats>({ non: 0, hesitation: 0, oui: 0, autoEasy: 0 })
  const [showConfetti, setShowConfetti] = useState(false)
  const [failedCards, setFailedCards] = useState<Card[]>([])
  const [passNumber, setPassNumber] = useState(1)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [undoData, setUndoData] = useState<{ cardId: string; countdown: number } | null>(null)
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null)

  const ratingHistoryRef = useRef<Map<string, ReviewHistoryItem[]>>(new Map())
  const retentionTargetRef = useRef(0.9)
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  // Guards against double-execution in React 18 Strict Mode
  const startedRef = useRef(false)

  // ── Card loading ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('retention_target')
        .eq('id', user.id)
        .single()
      retentionTargetRef.current = ((profileData as { retention_target?: number } | null)?.retention_target ?? 90) / 100

      const ids = await loadDeckIds(user.id)
      if (ids.length === 0) { setIsLoading(false); return }

      function deduplicateById<T extends { id: string }>(rows: T[]): T[] {
        const seen = new Set<string>()
        return rows.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
      }

      if (isFreeMode) {
        // Load non-archived cards by deck_id OR theme_id (for direct theme cards)
        const [{ data: byDeck }, { data: byTheme }] = await Promise.all([
          supabase.from('cards').select('*, decks(name, theme_id, themes(name, color)), themes(name, color)').in('deck_id', ids).or('archived.is.null,archived.eq.false'),
          supabase.from('cards').select('*, decks(name, theme_id, themes(name, color)), themes(name, color)').in('theme_id', ids).is('deck_id', null).or('archived.is.null,archived.eq.false'),
        ])
        const allCards = deduplicateById([...(byDeck || []), ...(byTheme || [])])

        if (!allCards.length) { setIsLoading(false); return }

        const cardIds = allCards.map((c: { id: string }) => c.id)
        const { data: existingReviews } = await supabase
          .from('card_reviews')
          .select('*')
          .eq('user_id', user.id)
          .in('card_id', cardIds)

        const reviewMap = new Map<string, CardReview>()
        for (const r of existingReviews || []) {
          reviewMap.set((r as CardReview).card_id, r as CardReview)
        }

        // Create missing card_review rows for manually-added cards
        const missingIds = cardIds.filter((id: string) => !reviewMap.has(id))
        if (missingIds.length > 0) {
          const { data: newReviews } = await supabase
            .from('card_reviews')
            .insert(missingIds.map((card_id: string) => ({
              card_id,
              user_id: user.id,
              state: 'new',
              scheduled_at: new Date().toISOString(),
            })))
            .select()
          for (const r of newReviews || []) {
            reviewMap.set((r as CardReview).card_id, r as CardReview)
          }
        }

        const readyCards = (allCards as Card[])
          .filter(c => reviewMap.has(c.id))
          .map(c => ({ ...c, review: reviewMap.get(c.id)! }))
        setCards([...readyCards].sort(() => Math.random() - 0.5))
      } else {
        // Normal mode: only due cards — query by deck_id AND theme_id, dedup
        const now = new Date().toISOString()
        type DueRow = { cards: (Card & { deck_id: string | null; theme_id: string | null }) | null } & CardReview
        const [{ data: byDeck }, { data: byTheme }] = await Promise.all([
          supabase.from('card_reviews')
            .select('*, cards!inner(*, decks(name, theme_id, themes(name, color)), themes(name, color))')
            .eq('user_id', user.id)
            .lte('scheduled_at', now)
            .in('cards.deck_id', ids),
          supabase.from('card_reviews')
            .select('*, cards!inner(*, decks(name, theme_id, themes(name, color)), themes(name, color))')
            .eq('user_id', user.id)
            .lte('scheduled_at', now)
            .in('cards.theme_id', ids),
        ])
        const dueReviews = deduplicateById([...(byDeck || []), ...(byTheme || [])])

        if (!dueReviews.length) { setIsLoading(false); return }

        const rows = dueReviews as DueRow[]
        const cardsWithReviews = rows
          .filter(r => r.cards && !r.cards.archived)
          .map(r => ({ ...r.cards!, review: r as CardReview }))

        setCards(buildSession(cardsWithReviews as Card[]))

        // Load rating history for autoEasy computation
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

      setIsLoading(false)
    }

    load()
  // loadDeckIds is captured at mount time via closure — intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock body scroll during session
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Cleanup undo timers on unmount
  useEffect(() => {
    return () => {
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    }
  }, [])

  // ── Session finish ────────────────────────────────────────────────────────────

  const finishSession = useCallback(() => {
    setIsFinished(true)
    if (!isFreeMode) {
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3500)
    }
  }, [isFreeMode])

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handleFlip = useCallback(() => {
    setFlipped(true)
  }, [])

  const handleRating = useCallback((userRating: UserRating) => {
    if (isSaving) return
    setIsSaving(true)
    setShowArchiveConfirm(false)

    const card = cards[current]
    const review = card.review as CardReview

    if (isFreeMode) {
      supabase
        .from('card_reviews')
        .update({ rating: userRating, reviewed_at: new Date().toISOString() })
        .eq('id', review.id)
        .then(({ error }: { error: unknown }) => { if (error) console.error('free rating save:', error) })

      setStats(s => {
        if (userRating === 1) return { ...s, non: s.non + 1 }
        if (userRating === 2) return { ...s, hesitation: s.hesitation + 1 }
        return { ...s, oui: s.oui + 1 }
      })

      const isLast = current + 1 >= cards.length
      setTimeout(() => {
        if (isLast) setIsFinished(true)
        else { setCurrent(c => c + 1); setFlipped(false) }
        setIsSaving(false)
      }, 300)
      return
    }

    // Normal mode: full FSRS update
    const history = ratingHistoryRef.current.get(card.id) || []
    const successRate = history.length > 0
      ? history.filter(h => h.rating >= 2).length / history.length
      : 1.0

    const isAutoEasy = userRating === 3 && shouldAutoEasy(history, review.scheduled_days || 0)
    const fsrsRating = (isAutoEasy ? 4 : userRating) as Rating

    const nextReview = scheduleCard(review, fsrsRating, retentionTargetRef.current, {
      userEdited: card.user_edited,
      createdByAi: card.created_by_ai,
      successRate,
    })

    supabase
      .from('card_reviews')
      .update({ ...nextReview, reviewed_at: new Date().toISOString(), rating: fsrsRating })
      .eq('id', review.id)
      .then(({ error }: { error: unknown }) => { if (error) console.error('rating save:', error) })

    ratingHistoryRef.current.set(card.id, [
      ...history,
      { rating: fsrsRating, scheduled_days: nextReview.scheduled_days },
    ])

    setStats(s => {
      if (userRating === 1) return { ...s, non: s.non + 1 }
      if (userRating === 2) return { ...s, hesitation: s.hesitation + 1 }
      if (isAutoEasy) return { ...s, autoEasy: s.autoEasy + 1 }
      return { ...s, oui: s.oui + 1 }
    })

    const newFailed = userRating === 1 ? [...failedCards, card] : [...failedCards]
    const isLast = current + 1 >= cards.length

    setTimeout(() => {
      if (isLast) {
        if (newFailed.length > 0) {
          setCards(newFailed)
          setCurrent(0)
          setFailedCards([])
          setPassNumber(p => p + 1)
          setFlipped(false)
        } else {
          finishSession()
        }
      } else {
        if (userRating === 1) setFailedCards(newFailed)
        setCurrent(c => c + 1)
        setFlipped(false)
      }
      setIsSaving(false)
    }, 300)
  }, [isSaving, cards, current, failedCards, isFreeMode, supabase, finishSession])

  const handleArchiveRequest = useCallback(() => setShowArchiveConfirm(true), [])
  const handleArchiveCancel = useCallback(() => setShowArchiveConfirm(false), [])

  const handleArchiveConfirm = useCallback(() => {
    const card = cards[current]
    setShowArchiveConfirm(false)

    const now = new Date()
    supabase.from('cards').update({
      archived: true,
      archived_at: now.toISOString(),
      auto_delete_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', card.id)
      .then(({ error }: { error: unknown }) => { if (error) console.error('archive error:', error) })

    const newCards = cards.filter((_, i) => i !== current)

    if (newCards.length === 0) {
      setIsFinished(true)
      // IC-3: no confetti in free mode
      if (!isFreeMode) {
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 3500)
      }
    } else {
      setCards(newCards)
      if (current >= newCards.length) setCurrent(newCards.length - 1)
      setFlipped(false)
    }

    // Start undo countdown
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
  }, [cards, current, isFreeMode, supabase])

  const handleUndoArchive = useCallback((cardId: string) => {
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setUndoData(null)
    supabase.from('cards')
      .update({ archived: false, archived_at: null, auto_delete_at: null })
      .eq('id', cardId)
      .then(({ error }: { error: unknown }) => { if (error) console.error('undo archive:', error) })
  }, [supabase])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

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

  // ── Touch / swipe handlers ────────────────────────────────────────────────────

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = Math.abs(e.touches[0].clientY - (touchStartY.current ?? 0))
    setSwipeHint(Math.abs(dx) > 30 && dy < 60 ? (dx < 0 ? 'left' : 'right') : null)
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - (touchStartY.current ?? 0))
    setSwipeHint(null)
    if (Math.abs(dx) > 80 && dy < 80) {
      if (!flipped) setFlipped(true)
      else handleRating(dx < 0 ? 1 : 3)
    } else if (Math.abs(dx) < 10 && dy < 10 && !flipped) {
      setFlipped(true)
    }
    touchStartX.current = null
    touchStartY.current = null
  }, [flipped, handleRating])

  return {
    isLoading,
    isFinished,
    cards,
    currentCard: cards[current] ?? null,
    currentIndex: current,
    totalCards: cards.length,
    passNumber,
    flipped,
    isSaving,
    stats,
    showArchiveConfirm,
    undoData,
    showConfetti,
    swipeHint,
    handleFlip,
    handleRating,
    handleArchiveRequest,
    handleArchiveCancel,
    handleArchiveConfirm,
    handleUndoArchive,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}
