'use client'
import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useReviewSession, ReviewStats } from '@/lib/hooks/useReviewSession'
import { Card } from '@/types'

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

function sessionMessage(stats: ReviewStats) {
  const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
  if (total === 0) return { emoji: '✅', title: 'Bravo !', sub: 'Session complète.' }
  const r = (stats.oui + stats.autoEasy) / total
  if (r >= 0.9) return { emoji: '🔥', title: 'Session parfaite !', sub: 'Votre mémoire est en feu — continuez comme ça.' }
  if (r >= 0.7) return { emoji: '🎉', title: 'Excellent travail !', sub: 'Votre mémoire se consolide progressivement.' }
  if (r >= 0.5) return { emoji: '💪', title: 'Bonne session !', sub: 'Quelques cartes difficiles — revenez demain.' }
  return { emoji: '📚', title: 'Continuez !', sub: "Ces cartes ont besoin de plus de pratique. C'est normal." }
}

export default function AllReviewPage() {
  const router = useRouter()
  const supabase = createClient()

  const session = useReviewSession({
    loadDeckIds: async (userId) => {
      const [{ data: decks }, { data: themes }] = await Promise.all([
        supabase.from('decks').select('id').eq('user_id', userId),
        supabase.from('themes').select('id').eq('user_id', userId),
      ])
      return [
        ...(decks || []).map((d: { id: string }) => d.id),
        ...(themes || []).map((t: { id: string }) => t.id),
      ]
    },
    isFreeMode: false,
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
    const msg = sessionMessage(stats)
    const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
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
            <button onClick={() => router.push('/library')}
              className="flex-1 border rounded-xl py-3 transition-all duration-150"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>
              Bibliothèque
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
  const qFontSize = card.question.length > 80 ? 24 : 32
  const progress = Math.round((currentIndex / totalCards) * 100)

  return (
    <div className="fixed inset-0 flex flex-col select-none overflow-hidden"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

      {/* Header */}
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')} className="transition-colors" style={{ color: 'var(--text-muted)' }}>✕</button>
          <div className="text-center">
            {passNumber > 1 && (
              <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--accent-light)' }}>
                Passage {passNumber} — {totalCards} carte{totalCards > 1 ? 's' : ''} à retravailler
              </div>
            )}
            <div className="flex items-center gap-2 justify-center">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{currentIndex + 1} / {totalCards}</span>
            </div>
          </div>
          <div className="w-8" />
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
                    <div className="text-[10px] uppercase tracking-[0.04em] font-medium mb-6" style={{ color: 'var(--text-hint)' }}>Question</div>
                    <p style={{ fontSize: qFontSize, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25, letterSpacing: '-0.02em' }} className={card.question.length <= 80 ? 'sm:text-[40px]' : ''}>{card.question}</p>
                    {!flipped && <p className="text-sm mt-8" style={{ color: 'var(--text-hint)' }}>Appuyez · Espace · Glissez pour révéler</p>}
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
                    <div className="text-[10px] uppercase tracking-[0.04em] font-medium mb-6" style={{ color: 'var(--text-hint)' }}>Réponse</div>
                    <p className="text-2xl font-bold leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--accent-light)', wordBreak: 'break-word' }}>{card.answer}</p>
                    {card.explanation && <p className="text-sm mt-4" style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{card.explanation}</p>}
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
        <div className="px-4 pb-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="max-w-lg mx-auto flex justify-between text-xs mb-2 sm:hidden" style={{ color: 'var(--text-hint)' }}>
            <span>← Non</span><span>Oui →</span>
          </div>
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-2.5">
            {([
              { rating: 1, label: 'Non',        sub: "Je n'savais pas · 1", bg: 'var(--btn-non-bg)', text: 'var(--btn-non-text)', border: 'var(--btn-non-border)' },
              { rating: 2, label: 'Hésitation', sub: 'Avec effort · 2',     bg: 'var(--btn-hes-bg)', text: 'var(--btn-hes-text)', border: 'var(--btn-hes-border)' },
              { rating: 3, label: 'Oui',        sub: 'Je savais · 3',       bg: 'var(--btn-oui-bg)', text: 'var(--btn-oui-text)', border: 'var(--btn-oui-border)' },
            ] as const).map(({ rating, label, sub, bg, text, border }) => (
              <button key={rating} onClick={() => handleRating(rating)} disabled={isSaving}
                style={{ backgroundColor: bg, color: text, borderColor: border }}
                className="border rounded-[12px] py-4 px-3 text-center transition-all duration-150 disabled:opacity-40 hover:brightness-110 min-h-[64px]">
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-xs opacity-75 mt-0.5">{sub}</div>
                <div className="text-[10px] opacity-40 font-mono mt-1 hidden sm:block">[{rating}]</div>
              </button>
            ))}
          </div>

          {/* Archive */}
          <div className="max-w-lg mx-auto mt-3 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
            {!showArchiveConfirm ? (
              <button onClick={handleArchiveRequest}
                className="w-full h-10 flex items-center justify-center gap-2 border rounded-xl text-sm transition-colors"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border-default)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 8v13H3V8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M1 3h22v5H1z" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 12h4" strokeLinecap="round"/>
                </svg>
                Archiver cette carte
              </button>
            ) : (
              <div className="border rounded-xl p-3 flex items-center gap-2" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-default)' }}>
                <span className="flex-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>Cette carte disparaîtra des révisions. Récupérable 30 jours.</span>
                <button onClick={handleArchiveCancel} className="text-xs px-2 py-1 rounded flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Annuler</button>
                <button onClick={handleArchiveConfirm} className="text-xs px-3 py-1 rounded flex-shrink-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>Archiver</button>
              </div>
            )}
          </div>

          <p className="text-center text-xs mt-2 hidden sm:block" style={{ color: 'var(--text-hint)' }}>
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
