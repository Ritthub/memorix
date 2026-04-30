'use client'
import { useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  if (r >= 0.9) return { emoji: '🔥', title: 'Session parfaite !', sub: 'Votre mémoire est en feu.' }
  if (r >= 0.7) return { emoji: '🎉', title: 'Excellent travail !', sub: 'Votre mémoire se consolide.' }
  if (r >= 0.5) return { emoji: '💪', title: 'Bonne session !', sub: 'Quelques cartes difficiles — revenez demain.' }
  return { emoji: '📚', title: 'Continuez !', sub: 'Ces cartes ont besoin de plus de pratique.' }
}

export default function CustomReviewPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[var(--bg-base)] flex items-center justify-center"><div className="text-[var(--accent)] text-xl">Chargement…</div></div>}>
      <CustomReviewInner />
    </Suspense>
  )
}

function CustomReviewInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const session = useReviewSession({
    loadDeckIds: async (userId) => {
      const themeIds = searchParams.get('themeIds')?.split(',').filter(Boolean) || []
      const noTheme = searchParams.get('noTheme') === '1'

      let deckIds: string[] = []
      if (themeIds.length > 0) {
        const { data: themeDecks } = await supabase
          .from('decks').select('id').eq('user_id', userId).in('theme_id', themeIds)
        deckIds = [...deckIds, ...(themeDecks || []).map((d: { id: string }) => d.id)]
      }
      if (noTheme) {
        const { data: noThemeDecks } = await supabase
          .from('decks').select('id').eq('user_id', userId).is('theme_id', null)
        deckIds = [...deckIds, ...(noThemeDecks || []).map((d: { id: string }) => d.id)]
      }
      return deckIds
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

  if (isLoading) return (
    <div className="fixed inset-0 bg-[var(--bg-base)] flex items-center justify-center">
      <div className="text-[var(--accent)] text-xl">Chargement…</div>
    </div>
  )

  if (isFinished) {
    const msg = sessionMessage(stats)
    const total = stats.non + stats.hesitation + stats.oui + stats.autoEasy
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center p-6">
        <Confetti active={showConfetti} />
        <div className="max-w-md w-full text-center">
          <div className="text-7xl mb-4 animate-bounce-once">{msg.emoji}</div>
          <h1 className="text-3xl font-bold mb-2">{msg.title}</h1>
          <p className="text-[var(--text-muted)] mb-6">{msg.sub}</p>
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
            <div className="bg-[var(--btn-hes-bg)] border border-[var(--accent)]/30 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm">
              <span className="text-[var(--accent-light)]">✨</span>
              <span className="text-[var(--text-secondary)]">{stats.autoEasy} intervalle{stats.autoEasy > 1 ? 's' : ''} optimisé{stats.autoEasy > 1 ? 's' : ''} automatiquement</span>
            </div>
          )}
          <p className="text-[var(--text-muted)] text-sm mb-6">{total} carte{total > 1 ? 's' : ''} révisée{total > 1 ? 's' : ''}</p>
          <div className="flex gap-4">
            <button onClick={() => router.push('/dashboard')}
              className="flex-1 border border-[var(--border-default)] hover:border-[var(--accent)] rounded-xl py-3 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              Dashboard
            </button>
            <button onClick={() => router.push('/decks')}
              className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl py-3 font-medium transition-colors">
              Bibliothèque
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentCard) return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Rien à réviser !</h1>
        <p className="text-[var(--text-muted)] mb-6">Toutes les cartes de la sélection sont à jour.</p>
        <button onClick={() => router.push('/dashboard')}
          className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl px-6 py-3 transition-colors">
          Retour au dashboard
        </button>
      </div>
    </div>
  )

  const card = currentCard as Card
  const progress = Math.round((currentIndex / totalCards) * 100)

  return (
    <div className="fixed inset-0 bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col select-none overflow-hidden"
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border-default)]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">✕</button>
          <div className="text-center">
            {passNumber > 1 && (
              <div className="text-[var(--accent-light)] text-xs font-semibold mb-0.5">
                Passage {passNumber} — {totalCards} carte{totalCards > 1 ? 's' : ''}
              </div>
            )}
            <span className="text-[var(--text-muted)] text-sm">{currentIndex + 1} / {totalCards}</span>
          </div>
          <div className="w-8" />
        </div>
        <div className="max-w-lg mx-auto mt-3">
          <div className="h-1 bg-[var(--bg-surface)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--accent)] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Swipe hint */}
      {swipeHint && flipped && (
        <div className={`fixed inset-0 pointer-events-none z-10 flex items-center ${swipeHint === 'left' ? 'justify-start pl-8' : 'justify-end pr-8'}`}>
          <div className={`rounded-2xl px-4 py-2 text-sm font-bold ${swipeHint === 'left' ? 'bg-[var(--btn-non-bg)] text-[var(--btn-non-text)] border border-[var(--btn-non-border)]' : 'bg-[var(--btn-oui-bg)] text-[var(--btn-oui-text)] border border-[var(--btn-oui-border)]'}`}>
            {swipeHint === 'left' ? '← Non' : 'Oui →'}
          </div>
        </div>
      )}

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <div className="w-full max-w-lg">
          <button onClick={() => !flipped && handleFlip()} className="w-full" disabled={flipped}>
            <div className="bg-[var(--bg-surface)] rounded-3xl p-8 border border-[var(--border-default)] min-h-[240px] flex flex-col items-center justify-center gap-4 shadow-xl shadow-[#4338CA]/10">
              <div className="review-badge" style={{ color: 'var(--accent-light)' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M4.5 4.5c0-1 1.5-1.5 1.5 0s-1.5 1-1.5 1.5M6 8v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                QUESTION
              </div>
              <p className="text-[28px] sm:text-[32px]" style={{ fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, letterSpacing: '-0.02em', textAlign: 'center' }}>{card.question}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
                <svg width="12" height="12" viewBox="0 0 12 12" fill="var(--accent-light)"><path d="M6 0l1.5 4.5L12 6l-4.5 1.5L6 12l-1.5-4.5L0 6l4.5-1.5z"/></svg>
                <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.1)' }} />
              </div>
              {!flipped && <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Touchez pour révéler</p>}
            </div>
          </button>
          {flipped && (
            <div className="mt-4 bg-[#0F0F1F] rounded-3xl p-8 border border-[var(--border-default)] min-h-[180px] flex flex-col items-center justify-center gap-3">
              <div className="review-badge" style={{ color: '#5DCAA5' }}>
                RÉPONSE
              </div>
              <p className="review-answer text-[28px] sm:text-[32px]">{card.answer}</p>
              {card.explanation && <p className="text-sm text-[var(--text-muted)] text-center italic">{card.explanation}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Rating or reveal */}
      {flipped ? (
        <div className="px-6 pb-2 pt-3 border-t border-[var(--border-default)]">
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-3">
            <button onClick={() => handleRating(1)} disabled={isSaving}
              style={{ background: 'var(--btn-non-bg)', borderRadius: 16, padding: '14px 8px', textAlign: 'center', border: '0.5px solid rgba(153,60,29,0.4)', minHeight: 80 }}
              className="transition-all active:scale-95 disabled:opacity-50 hover:brightness-110">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(153,60,29,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="#FCA5A5" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--btn-non-text)' }}>Non</div>
              <div style={{ fontSize: 11, color: 'rgba(252,165,165,0.6)', marginTop: 2 }}>Je ne savais pas</div>
              <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'rgba(252,165,165,0.5)' }}>1</div>
            </button>
            <button onClick={() => handleRating(2)} disabled={isSaving}
              style={{ background: 'var(--btn-hes-bg)', borderRadius: 16, padding: '14px 8px', textAlign: 'center', border: '0.5px solid rgba(67,56,202,0.4)', minHeight: 80 }}
              className="transition-all active:scale-95 disabled:opacity-50 hover:brightness-110">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(67,56,202,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#818CF8" strokeWidth="1.2"/><path d="M7 4.5c0-.8 1.2-1.2 1.2 0s-1.2.8-1.2 1.2M7 9v.5" stroke="#818CF8" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--btn-hes-text)' }}>Hésitation</div>
              <div style={{ fontSize: 11, color: 'rgba(129,140,248,0.6)', marginTop: 2 }}>Avec effort</div>
              <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'rgba(129,140,248,0.5)' }}>2</div>
            </button>
            <button onClick={() => handleRating(3)} disabled={isSaving}
              style={{ background: 'var(--btn-oui-bg)', borderRadius: 16, padding: '14px 8px', textAlign: 'center', border: '0.5px solid rgba(15,110,86,0.4)', minHeight: 80 }}
              className="transition-all active:scale-95 disabled:opacity-50 hover:brightness-110">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(15,110,86,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="#6EE7B7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--btn-oui-text)' }}>Oui</div>
              <div style={{ fontSize: 11, color: 'rgba(110,231,183,0.6)', marginTop: 2 }}>Je savais</div>
              <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'rgba(110,231,183,0.5)' }}>3</div>
            </button>
          </div>

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
              <div className="bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl p-3 flex items-center gap-2 mb-2">
                <span className="text-[var(--text-secondary)] flex-1 text-xs leading-snug">Cette carte disparaîtra des révisions. Récupérable 30 jours.</span>
                <button onClick={handleArchiveCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs px-2 py-1 rounded flex-shrink-0">Annuler</button>
                <button onClick={handleArchiveConfirm} className="bg-[var(--bg-elevated)] hover:bg-[#475569] text-[var(--text-primary)] text-xs px-3 py-1 rounded flex-shrink-0">Archiver</button>
              </div>
            )}
          </div>

          <p className="text-center" style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', paddingBottom: 8 }}>
            Espace = retourner · 1 Non · 2 Hésitation · 3 Oui
          </p>
        </div>
      ) : (
        <div className="px-6 py-4 border-t border-[var(--border-default)]">
          <div className="max-w-lg mx-auto">
            <button onClick={handleFlip}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-2xl py-4 font-semibold transition-colors">
              Révéler la réponse
            </button>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undoData && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl px-4 py-2.5 text-sm flex items-center gap-3 shadow-lg whitespace-nowrap">
          <span className="text-[var(--text-primary)]">Archivée</span>
          <button onClick={() => handleUndoArchive(undoData.cardId)} className="text-[var(--accent-light)] hover:text-[#A5B4FC] font-medium transition-colors">
            Annuler ({undoData.countdown}s)
          </button>
        </div>
      )}
    </div>
  )
}
