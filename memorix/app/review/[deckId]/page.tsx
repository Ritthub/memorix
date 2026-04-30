'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useReviewSession } from '@/lib/hooks/useReviewSession'
import { ReviewStats } from '@/lib/hooks/useReviewSession'
import { Card } from '@/types'

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

function sessionMessage(stats: ReviewStats) {
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
  const [deckId, setDeckId] = useState('')

  const session = useReviewSession({
    loadDeckIds: async () => {
      const p = await params
      setDeckId(p.deckId)
      return [p.deckId]
    },
    isFreeMode,
    supabase,
  })

  const {
    isLoading, isFinished, currentCard, currentIndex, totalCards, passNumber,
    flipped, isSaving, stats, showArchiveConfirm, undoData, showConfetti, swipeHint,
    handleFlip, handleRating, handleArchiveRequest, handleArchiveCancel, handleArchiveConfirm,
    handleUndoArchive, onTouchStart, onTouchMove, onTouchEnd,
  } = session

  const [questionAtBottom, setQuestionAtBottom] = useState(false)
  const [answerAtBottom, setAnswerAtBottom] = useState(false)
  const questionScrollRef = useRef<HTMLDivElement>(null)
  const answerScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function atBottom(el: HTMLDivElement | null) { return !el || el.scrollHeight <= el.clientHeight + 2 }
    setQuestionAtBottom(atBottom(questionScrollRef.current))
    setAnswerAtBottom(atBottom(answerScrollRef.current))
    if (questionScrollRef.current) questionScrollRef.current.scrollTop = 0
    if (answerScrollRef.current) answerScrollRef.current.scrollTop = 0
  }, [currentIndex])

  useEffect(() => {
    if (flipped && answerScrollRef.current) {
      const el = answerScrollRef.current
      setAnswerAtBottom(el.scrollHeight <= el.clientHeight + 2)
    }
  }, [flipped])

  if (isLoading) return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
      <div style={{ color: 'var(--accent-light)' }} className="text-xl">Chargement...</div>
    </div>
  )

  if (isFinished) {
    const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
    if (isFreeMode) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
          <div className="max-w-md w-full text-center">
            <div className="text-7xl mb-4">🔄</div>
            <h1 className="text-3xl font-bold mb-2">Session libre terminée !</h1>
            <p className="mb-1" style={{ color: 'var(--text-secondary)' }}>Vos intervalles de révision FSRS n&apos;ont pas été modifiés.</p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{total} carte{total > 1 ? 's' : ''} révisée{total > 1 ? 's' : ''}</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Non',        value: stats.non,        bg: 'var(--btn-non-bg)', text: 'var(--btn-non-text)', border: 'var(--btn-non-border)' },
                { label: 'Hésitation', value: stats.hesitation, bg: 'var(--btn-hes-bg)', text: 'var(--btn-hes-text)', border: 'var(--btn-hes-border)' },
                { label: 'Oui',        value: stats.oui,        bg: 'var(--btn-oui-bg)', text: 'var(--btn-oui-text)', border: 'var(--btn-oui-border)' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 border" style={{ background: s.bg, borderColor: s.border }}>
                  <div className="text-2xl font-bold" style={{ color: s.text }}>{s.value}</div>
                  <div className="text-xs mt-1 opacity-70" style={{ color: s.text }}>{s.label}</div>
                </div>
              ))}
            </div>
            <button onClick={() => router.push(`/decks/${deckId}`)}
              className="w-full rounded-xl py-3 font-medium transition-all duration-150"
              style={{ background: 'var(--accent)', color: 'var(--accent-muted)' }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseOut={e => (e.currentTarget.style.background = 'var(--accent)')}>
              Retour au deck
            </button>
          </div>
        </div>
      )
    }

    const msg = sessionMessage(stats)
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
        <Confetti active={showConfetti} />
        <div className="max-w-md w-full text-center">
          <div className="text-7xl mb-4 animate-bounce-once">{msg.emoji}</div>
          <h1 className="text-3xl font-bold mb-2">{msg.title}</h1>
          <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>{msg.sub}</p>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{total} carte{total > 1 ? 's' : ''} révisée{total > 1 ? 's' : ''}</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Non',        value: stats.non,        bg: 'var(--btn-non-bg)', text: 'var(--btn-non-text)', border: 'var(--btn-non-border)' },
              { label: 'Hésitation', value: stats.hesitation, bg: 'var(--btn-hes-bg)', text: 'var(--btn-hes-text)', border: 'var(--btn-hes-border)' },
              { label: 'Oui',        value: stats.oui,        bg: 'var(--btn-oui-bg)', text: 'var(--btn-oui-text)', border: 'var(--btn-oui-border)' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4 border" style={{ background: s.bg, borderColor: s.border }}>
                <div className="text-2xl font-bold" style={{ color: s.text }}>{s.value}</div>
                <div className="text-xs mt-1 opacity-70" style={{ color: s.text }}>{s.label}</div>
              </div>
            ))}
          </div>
          {stats.autoEasy > 0 && (
            <div className="border rounded-xl p-3 mb-6 flex items-center gap-2 text-sm" style={{ background: 'var(--btn-hes-bg)', borderColor: 'var(--btn-hes-border)' }}>
              <span style={{ color: 'var(--accent-light)' }}>✨</span>
              <span style={{ color: 'var(--text-secondary)' }}>{stats.autoEasy} intervalle{stats.autoEasy > 1 ? 's' : ''} optimisé{stats.autoEasy > 1 ? 's' : ''} automatiquement</span>
            </div>
          )}
          <div className="flex gap-4">
            <button onClick={() => router.push(`/decks/${deckId}`)}
              className="flex-1 border rounded-xl py-3 transition-all duration-150"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
              Voir le deck
            </button>
            <button onClick={() => router.push('/dashboard')}
              className="flex-1 rounded-xl py-3 font-medium transition-all duration-150"
              style={{ background: 'var(--accent)', color: 'var(--accent-muted)' }}>
              Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentCard) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Rien à réviser !</h1>
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Toutes les cartes sont à jour.</p>
        <button onClick={() => router.push('/dashboard')}
          className="rounded-xl px-6 py-3 transition-colors"
          style={{ background: 'var(--accent)' }}>
          Retour au dashboard
        </button>
      </div>
    </div>
  )

  const card = currentCard as Card
  const progress = Math.round((currentIndex / totalCards) * 100)

  return (
    <div className="fixed inset-0 flex flex-col select-none overflow-hidden"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push(`/decks/${deckId}`)} className="transition-colors" style={{ color: 'var(--text-muted)' }}>✕</button>
          <div className="text-center">
            {passNumber > 1 && (
              <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--accent-light)' }}>
                Passage {passNumber} — {totalCards} carte{totalCards > 1 ? 's' : ''} à retravailler
              </div>
            )}
            <div className="flex items-center gap-2 justify-center">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentIndex + 1} / {totalCards}</span>
              {isFreeMode && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: '#854F0B', color: '#FAC775' }}
                  title="Vos intervalles de révision ne sont pas modifiés">
                  ∞ Mode libre
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('memorix:quickadd:open', { detail: { deckId, locked: true } }))}
            className="w-8 h-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-all rounded-lg"
            style={{ color: 'var(--text-muted)' }}
            title="Ajouter une carte"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="max-w-lg mx-auto mt-3">
          <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: 'var(--accent-light)' }} />
          </div>
        </div>
      </div>

      {/* Swipe hint */}
      {swipeHint && flipped && (
        <div className={`fixed inset-0 pointer-events-none z-10 flex items-center ${swipeHint === 'left' ? 'justify-start pl-8' : 'justify-end pr-8'}`}>
          <div className="rounded-2xl px-4 py-2 text-sm font-bold border"
            style={swipeHint === 'left'
              ? { background: 'var(--btn-non-bg)', color: 'var(--btn-non-text)', borderColor: 'var(--btn-non-border)' }
              : { background: 'var(--btn-oui-bg)', color: 'var(--btn-oui-text)', borderColor: 'var(--btn-oui-border)' }}>
            {swipeHint === 'left' ? '← Non' : 'Oui →'}
          </div>
        </div>
      )}

      {/* Card zone */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 py-4 flex flex-col">
        <div className="flex-1 min-h-0 relative w-full max-w-lg mx-auto sm:flex-none sm:h-[45vh] sm:my-auto">
          <div onClick={() => !flipped && handleFlip()} className="cursor-pointer absolute inset-0" style={{ perspective: '1000px' }}>
            <div style={{ transformStyle: 'preserve-3d', transition: 'transform 0.5s cubic-bezier(.4,0,.2,1)', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', position: 'absolute', inset: 0 }}>

              {/* Front face */}
              <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
                className="absolute inset-0 rounded-[20px] border overflow-hidden">
                <div ref={questionScrollRef}
                  onScroll={e => { const el = e.currentTarget; setQuestionAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2) }}
                  className="h-full overflow-y-auto">
                  <div className="min-h-full p-8 flex flex-col items-center justify-center text-center">
                    {(card.decks?.name || card.themes?.name) && (
                      <div className="flex items-center gap-1.5 mb-3">
                        {(card.decks?.themes?.color || card.themes?.color) && (
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: card.decks?.themes?.color || card.themes?.color }} />
                        )}
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {card.decks?.themes?.name && <>{card.decks.themes.name} › </>}
                          {card.decks?.name || card.themes?.name}
                        </span>
                      </div>
                    )}
                    <div className="review-badge" style={{ color: 'var(--accent-light)' }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M4.5 4.5c0-1 1.5-1.5 1.5 0s-1.5 1-1.5 1.5M6 8v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      QUESTION
                    </div>
                    <p className="text-[28px] sm:text-[32px]" style={{ fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, letterSpacing: '-0.02em', textAlign: 'center' }}>{card.question}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                      <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="var(--accent-light)"><path d="M6 0l1.5 4.5L12 6l-4.5 1.5L6 12l-1.5-4.5L0 6l4.5-1.5z"/></svg>
                      <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
                    </div>
                    {!flipped && <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Touchez pour révéler</p>}
                  </div>
                </div>
                {!questionAtBottom && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--bg-surface), transparent)' }} />
                )}
              </div>

              {/* Back face */}
              <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
                className="absolute inset-0 rounded-[20px] border overflow-hidden">
                <div ref={answerScrollRef}
                  onScroll={e => { const el = e.currentTarget; setAnswerAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2) }}
                  className="h-full overflow-y-auto">
                  <div className="min-h-full p-8 flex flex-col items-center justify-center text-center">
                    <div className="review-badge" style={{ color: '#5DCAA5' }}>
                      RÉPONSE
                    </div>
                    <p className="review-answer text-[28px] sm:text-[32px]">{card.answer}</p>
                    {card.explanation && <p className="text-sm mt-4" style={{ color: 'var(--text-secondary)' }}>{card.explanation}</p>}
                  </div>
                </div>
                {!answerAtBottom && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--bg-surface), transparent)' }} />
                )}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div className="px-4 pb-2 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-2.5">
            <button onClick={() => handleRating(1)} disabled={isSaving}
              style={{ background: 'var(--btn-non-bg)', borderRadius: 16, padding: '14px 8px', textAlign: 'center', border: '0.5px solid rgba(153,60,29,0.4)', minHeight: 80 }}
              className="transition-all duration-150 disabled:opacity-40 hover:brightness-110">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(153,60,29,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="#FCA5A5" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--btn-non-text)' }}>Non</div>
              <div style={{ fontSize: 11, color: 'rgba(252,165,165,0.6)', marginTop: 2 }}>Je ne savais pas</div>
              <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'rgba(252,165,165,0.5)' }}>1</div>
            </button>
            <button onClick={() => handleRating(2)} disabled={isSaving}
              style={{ background: 'var(--btn-hes-bg)', borderRadius: 16, padding: '14px 8px', textAlign: 'center', border: '0.5px solid rgba(67,56,202,0.4)', minHeight: 80 }}
              className="transition-all duration-150 disabled:opacity-40 hover:brightness-110">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(67,56,202,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#818CF8" strokeWidth="1.2"/><path d="M7 4.5c0-.8 1.2-1.2 1.2 0s-1.2.8-1.2 1.2M7 9v.5" stroke="#818CF8" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--btn-hes-text)' }}>Hésitation</div>
              <div style={{ fontSize: 11, color: 'rgba(129,140,248,0.6)', marginTop: 2 }}>Avec effort</div>
              <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'rgba(129,140,248,0.5)' }}>2</div>
            </button>
            <button onClick={() => handleRating(3)} disabled={isSaving}
              style={{ background: 'var(--btn-oui-bg)', borderRadius: 16, padding: '14px 8px', textAlign: 'center', border: '0.5px solid rgba(15,110,86,0.4)', minHeight: 80 }}
              className="transition-all duration-150 disabled:opacity-40 hover:brightness-110">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(15,110,86,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="#6EE7B7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--btn-oui-text)' }}>Oui</div>
              <div style={{ fontSize: 11, color: 'rgba(110,231,183,0.6)', marginTop: 2 }}>Je savais</div>
              <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'rgba(110,231,183,0.5)' }}>3</div>
            </button>
          </div>

          {/* Archive */}
          <div className="max-w-lg mx-auto mt-3">
            {!showArchiveConfirm ? (
              <button onClick={handleArchiveRequest} className="review-archive w-full">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="12" height="9" rx="1.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/><path d="M5 4V2.5a2 2 0 014 0V4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/></svg>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Archiver cette carte</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </button>
            ) : (
              <div className="border rounded-xl p-3 flex items-center gap-2 mb-2" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-default)' }}>
                <span className="flex-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>Cette carte disparaîtra des révisions. Récupérable 30 jours.</span>
                <button onClick={handleArchiveCancel} className="text-xs px-2 py-1 rounded flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Annuler</button>
                <button onClick={handleArchiveConfirm} className="text-xs px-3 py-1 rounded flex-shrink-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>Archiver</button>
              </div>
            )}
          </div>

          <p className="text-center" style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', paddingBottom: 8 }}>
            Espace = retourner · 1 Non · 2 Hésitation · 3 Oui
          </p>
        </div>
      )}

      {/* Undo toast */}
      {undoData && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] border rounded-xl px-4 py-2.5 text-sm flex items-center gap-3 shadow-lg whitespace-nowrap"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
          <span style={{ color: 'var(--text-primary)' }}>Archivée</span>
          <button onClick={() => handleUndoArchive(undoData.cardId)} className="font-medium transition-colors" style={{ color: 'var(--accent-light)' }}>
            Annuler ({undoData.countdown}s)
          </button>
        </div>
      )}
    </div>
  )
}
export const runtime = 'edge'
