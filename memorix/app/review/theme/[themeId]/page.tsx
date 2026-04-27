'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { scheduleCard, shouldAutoEasy, ReviewHistoryItem } from '@/lib/fsrs'
import { buildSession } from '@/lib/session-builder'
import { Card, CardReview, Rating } from '@/types'

type UserRating = 1 | 2 | 3

function Confetti({ active }: { active: boolean }) {
  const PIECES = 60
  const colors = ['#4338CA', '#818CF8', '#7C6FCD', '#E879F9', '#34D399', '#FBBF24']
  const pieces = useRef(Array.from({ length: PIECES }, (_, i) => ({
    x: Math.random() * 100, delay: Math.random() * 0.8,
    color: colors[i % colors.length], size: 6 + Math.random() * 8, drift: (Math.random() - 0.5) * 60,
  })))
  if (!active) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.current.map((p, i) => (
        <div key={i} className="absolute top-0 animate-confetti"
          style={{ left: `${p.x}%`, animationDelay: `${p.delay}s`, width: p.size, height: p.size, backgroundColor: p.color, borderRadius: Math.random() > 0.5 ? '50%' : '2px', '--drift': `${p.drift}px` } as React.CSSProperties} />
      ))}
    </div>
  )
}

function sessionMessage(stats: { non: number; hesitation: number; oui: number; autoEasy: number }) {
  const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
  if (total === 0) return { emoji: '✅', title: 'Bravo !', sub: 'Session complète.' }
  const r = (stats.oui + stats.autoEasy) / total
  if (r >= 0.9) return { emoji: '🔥', title: 'Session parfaite !', sub: 'Votre mémoire est en feu — continuez comme ça.' }
  if (r >= 0.7) return { emoji: '🎉', title: 'Excellent travail !', sub: 'Votre mémoire se consolide progressivement.' }
  if (r >= 0.5) return { emoji: '💪', title: 'Bonne session !', sub: 'Quelques cartes difficiles — revenez demain.' }
  return { emoji: '📚', title: 'Continuez !', sub: "Ces cartes ont besoin de plus de pratique. C'est normal." }
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
  const [stats, setStats] = useState({ non: 0, hesitation: 0, oui: 0, autoEasy: 0 })
  const [themeId, setThemeId] = useState('')
  const [showConfetti, setShowConfetti] = useState(false)
  const [failedCards, setFailedCards] = useState<Card[]>([])
  const [passNumber, setPassNumber] = useState(1)
  const ratingHistoryRef = useRef<Map<string, ReviewHistoryItem[]>>(new Map())

  // Archive state
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [undoData, setUndoData] = useState<{ cardId: string; countdown: number } | null>(null)
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null)

  useEffect(() => {
    async function loadCards() {
      const p = await params
      setThemeId(p.themeId)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: themeDecks } = await supabase.from('decks').select('id').eq('theme_id', p.themeId).eq('user_id', user.id)
      const deckIds = (themeDecks || []).map((d: { id: string }) => d.id)
      if (deckIds.length === 0) { setLoading(false); return }

      const { data: dueReviews } = await supabase
        .from('card_reviews')
        .select('*, cards(*)')
        .eq('user_id', user.id)
        .lte('scheduled_at', new Date().toISOString())
        .in('cards.deck_id', deckIds)
        .not('cards', 'is', null)

      if (dueReviews && dueReviews.length > 0) {
        type DueRow = { cards: (Card & { deck_id: string }) | null } & CardReview
        const rows = dueReviews as DueRow[]
        const cardsWithReviews = rows
          .filter(r => r.cards && deckIds.includes(r.cards.deck_id) && !r.cards.archived)
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
      setLoading(false)
    }
    loadCards()
  }, [])

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
    const successRate = history.length > 0 ? history.filter(h => h.rating >= 2).length / history.length : 1.0

    const isAutoEasy = userRating === 3 && shouldAutoEasy(history, review.scheduled_days || 0)
    const fsrsRating = (isAutoEasy ? 4 : userRating) as Rating

    const nextReview = scheduleCard(review, fsrsRating, 0.9, { userEdited: card.user_edited, createdByAi: card.created_by_ai, successRate })
    supabase.from('card_reviews').update({ ...nextReview, reviewed_at: new Date().toISOString(), rating: fsrsRating }).eq('id', review.id)
      .then((res: { error: unknown }) => { if (res.error) console.error('rating save failed:', res.error) })

    setStats(s => {
      if (userRating === 1) return { ...s, non: s.non + 1 }
      if (userRating === 2) return { ...s, hesitation: s.hesitation + 1 }
      if (isAutoEasy) return { ...s, autoEasy: s.autoEasy + 1 }
      return { ...s, oui: s.oui + 1 }
    })

    const newFailed = userRating === 1 ? [...failedCards, card] : [...failedCards]
    const isLastCard = current + 1 >= cards.length

    setTimeout(() => {
      if (isLastCard) {
        if (newFailed.length > 0) { setCards(newFailed); setCurrent(0); setFailedCards([]); setPassNumber(p => p + 1); setFlipped(false) }
        else { setDone(true); setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3500) }
      } else {
        if (userRating === 1) setFailedCards(newFailed)
        setCurrent(c => c + 1); setFlipped(false)
      }
      setSaving(false)
    }, 300)
  }, [saving, cards, current, failedCards, supabase])

  function archiveCard() {
    const card = cards[current]
    setShowArchiveConfirm(false)
    const now = new Date()
    supabase.from('cards').update({ archived: true, archived_at: now.toISOString(), auto_delete_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() }).eq('id', card.id)
      .then((res: { error: unknown }) => { if (res.error) console.error('archive error:', res.error) })

    const newCards = cards.filter((_, i) => i !== current)
    if (newCards.length === 0) { setDone(true); setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3500) }
    else { setCards(newCards); if (current >= newCards.length) setCurrent(newCards.length - 1); setFlipped(false) }

    let countdown = 5
    setUndoData({ cardId: card.id, countdown })
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    undoIntervalRef.current = setInterval(() => { countdown--; setUndoData(prev => prev ? { ...prev, countdown } : null) }, 1000)
    undoTimeoutRef.current = setTimeout(() => { clearInterval(undoIntervalRef.current!); setUndoData(null) }, 5000)
  }

  function undoArchiveCard(cardId: string) {
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current)
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setUndoData(null)
    supabase.from('cards').update({ archived: false, archived_at: null, auto_delete_at: null }).eq('id', cardId)
  }

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

  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY }
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
    if (Math.abs(dx) > 80 && dy < 80) { if (!flipped) setFlipped(true); else handleRating(dx < 0 ? 1 : 3) }
    else if (Math.abs(dx) < 10 && dy < 10 && !flipped) setFlipped(true)
    touchStartX.current = null; touchStartY.current = null
  }

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])

  if (loading) return <div className="fixed inset-0 bg-[#0F172A] flex items-center justify-center"><div className="text-[#4338CA] text-xl">Chargement...</div></div>

  if (done) {
    const msg = sessionMessage(stats)
    const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
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
              { label: 'Non', value: stats.non, bg: '#2D1515', text: '#FCA5A5', border: '#991B1B' },
              { label: 'Hésitation', value: stats.hesitation, bg: '#1C1F2E', text: '#818CF8', border: '#4338CA' },
              { label: 'Oui', value: stats.oui, bg: '#0C2D1E', text: '#5DCAA5', border: '#0F6E56' },
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
            <button onClick={() => router.push(`/themes/${themeId}`)} className="flex-1 border border-[#334155] hover:border-[#4338CA] rounded-xl py-3 text-gray-400 hover:text-white transition-colors">Voir le thème</button>
            <button onClick={() => router.push('/dashboard')} className="flex-1 bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-colors">Dashboard</button>
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
        <button onClick={() => router.push(`/themes/${themeId}`)} className="bg-[#4338CA] hover:bg-[#3730A3] rounded-xl px-6 py-3 transition-colors">Retour au thème</button>
      </div>
    </div>
  )

  const card = cards[current]
  const progress = Math.round((current / cards.length) * 100)

  return (
    <div className="fixed inset-0 bg-[#0F172A] text-white flex flex-col select-none overflow-hidden"
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="px-6 py-4 border-b border-[#334155]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push(`/themes/${themeId}`)} className="text-gray-400 hover:text-white transition-colors">✕</button>
          <div className="text-center">
            {passNumber > 1 && <div className="text-[#818CF8] text-xs font-semibold mb-0.5">Passage {passNumber} — {cards.length} carte{cards.length > 1 ? 's' : ''} à retravailler</div>}
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
          <div className={`rounded-2xl px-4 py-2 text-sm font-bold ${swipeHint === 'left' ? 'bg-[#2D1515] text-[#FCA5A5] border border-[#991B1B]' : 'bg-[#0C2D1E] text-[#5DCAA5] border border-[#0F6E56]'}`}>
            {swipeHint === 'left' ? '← Non' : 'Oui →'}
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <div className="w-full max-w-lg">
          <button onClick={() => !flipped && setFlipped(true)} className="w-full" disabled={flipped}>
            <div className="bg-[#1E293B] rounded-3xl p-8 border border-[#334155] min-h-[240px] flex flex-col items-center justify-center gap-4 shadow-xl shadow-[#4338CA]/10">
              {card.theme && <span className="text-xs text-[#818CF8] font-medium uppercase tracking-widest opacity-70">{card.theme}</span>}
              <p className="text-xl font-semibold text-center leading-relaxed">{card.question}</p>
              {!flipped && <p className="text-gray-600 text-sm mt-2">Appuyer pour révéler</p>}
            </div>
          </button>
          {flipped && (
            <div className="mt-4 bg-[#0F0F1F] rounded-3xl p-8 border border-[#334155] min-h-[180px] flex flex-col items-center justify-center gap-3">
              <p className="text-lg text-center leading-relaxed">{card.answer}</p>
              {card.explanation && <p className="text-sm text-gray-500 text-center mt-2 italic">{card.explanation}</p>}
            </div>
          )}
        </div>
      </div>

      {flipped ? (
        <div className="px-6 py-4 border-t border-[#334155]">
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-3">
            {([
              { label: 'Non',        rating: 1, color: 'bg-[#2D1515] hover:brightness-110 border-[#991B1B] text-[#FCA5A5]' },
              { label: 'Hésitation', rating: 2, color: 'bg-[#1C1F2E] hover:brightness-110 border-[#4338CA] text-[#818CF8]' },
              { label: 'Oui',        rating: 3, color: 'bg-[#0C2D1E] hover:brightness-110 border-[#0F6E56] text-[#5DCAA5]' },
            ] as const).map(b => (
              <button key={b.label} onClick={() => handleRating(b.rating)} disabled={saving}
                className={`${b.color} border rounded-2xl py-4 font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 min-h-[64px]`}>
                {b.label}
              </button>
            ))}
          </div>

          <div className="max-w-lg mx-auto mt-3 border-t border-[#334155] pt-3">
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

          <p className="text-center text-gray-700 text-xs mt-2">← Non · Hésitation · Oui →</p>
        </div>
      ) : (
        <div className="px-6 py-4 border-t border-[#334155]">
          <div className="max-w-lg mx-auto">
            <button onClick={() => setFlipped(true)} className="w-full bg-[#4338CA] hover:bg-[#3730A3] rounded-2xl py-4 font-semibold transition-colors">Révéler la réponse</button>
            <p className="text-center text-gray-600 text-xs mt-2">Espace · Entrée · Appuyer</p>
          </div>
        </div>
      )}

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
