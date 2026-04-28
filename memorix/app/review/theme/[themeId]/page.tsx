'use client'
import { useState, useRef, useEffect } from 'react'
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
  if (r >= 0.9) return { emoji: '🔥', title: 'Session parfaite !', sub: 'Votre mémoire est en feu — continuez comme ça.' }
  if (r >= 0.7) return { emoji: '🎉', title: 'Excellent travail !', sub: 'Votre mémoire se consolide progressivement.' }
  if (r >= 0.5) return { emoji: '💪', title: 'Bonne session !', sub: 'Quelques cartes difficiles — revenez demain.' }
  return { emoji: '📚', title: 'Continuez !', sub: "Ces cartes ont besoin de plus de pratique. C'est normal." }
}

// IC-1: recursively collect all deck IDs under a theme and its sub-themes
async function getDeckIdsForTheme(
  themeId: string,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string[]> {
  const { data: allThemes } = await supabase
    .from('themes')
    .select('id, parent_id')
    .eq('user_id', userId)

  function getSubtreeIds(rootId: string): string[] {
    const children = (allThemes || []).filter((t: { id: string; parent_id: string | null }) => t.parent_id === rootId)
    return [rootId, ...children.flatMap((c: { id: string }) => getSubtreeIds(c.id))]
  }

  const themeIds = getSubtreeIds(themeId)
  const { data: decks } = await supabase
    .from('decks')
    .select('id')
    .in('theme_id', themeIds)

  const deckIds = (decks || []).map((d: { id: string }) => d.id)
  // Include theme IDs so direct theme cards (deck_id=null) are loaded in review
  return [...deckIds, ...themeIds]
}

export default function ThemeReviewPage({ params }: { params: Promise<{ themeId: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFreeMode = searchParams.get('mode') === 'free'
  const supabase = createClient()
  const [themeId, setThemeId] = useState('')

  const session = useReviewSession({
    loadDeckIds: async (userId) => {
      const p = await params
      setThemeId(p.themeId)
      return getDeckIdsForTheme(p.themeId, userId, supabase)
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
    <div className="fixed inset-0 bg-[#0F172A] flex items-center justify-center">
      <div className="text-[#4338CA] text-xl">Chargement...</div>
    </div>
  )

  if (isFinished) {
    const total = stats.non + stats.hesitation + stats.oui + (isFreeMode ? 0 : stats.autoEasy)
    if (isFreeMode) {
      return (
        <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="text-7xl mb-4">🔄</div>
            <h1 className="text-3xl font-bold mb-2">Session libre terminée !</h1>
            <p className="text-gray-400 mb-2">Vos intervalles de révision FSRS n&apos;ont pas été modifiés.</p>
            <p className="text-gray-500 text-sm mb-6">{total} carte{total > 1 ? 's' : ''} révisée{total > 1 ? 's' : ''}</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
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
            <button onClick={() => router.push(`/themes/${themeId}`)}
              className="w-full bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-colors">
              Retour au thème
            </button>
          </div>
        </div>
      )
    }

    const msg = sessionMessage(stats)
    const totalNormal = stats.non + stats.hesitation + stats.oui + stats.autoEasy
    return (
      <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
        <Confetti active={showConfetti} />
        <div className="max-w-md w-full text-center">
          <div className="text-7xl mb-4 animate-bounce-once">{msg.emoji}</div>
          <h1 className="text-3xl font-bold mb-2">{msg.title}</h1>
          <p className="text-gray-400 mb-2">{msg.sub}</p>
          <p className="text-gray-500 text-sm mb-6">{totalNormal} carte{totalNormal > 1 ? 's' : ''} révisée{totalNormal > 1 ? 's' : ''}</p>
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
            <button onClick={() => router.push(`/themes/${themeId}`)}
              className="flex-1 border border-[#334155] hover:border-[#4338CA] rounded-xl py-3 text-gray-400 hover:text-white transition-colors">
              Voir le thème
            </button>
            <button onClick={() => router.push('/dashboard')}
              className="flex-1 bg-[#4338CA] hover:bg-[#3730A3] rounded-xl py-3 font-medium transition-colors">
              Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!currentCard) return (
    <div className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Rien à réviser !</h1>
        <p className="text-gray-400 mb-6">Toutes les cartes du thème sont à jour.</p>
        <button onClick={() => router.push(`/themes/${themeId}`)}
          className="bg-[#4338CA] hover:bg-[#3730A3] rounded-xl px-6 py-3 transition-colors">
          Retour au thème
        </button>
      </div>
    </div>
  )

  const card = currentCard as Card
  const progress = Math.round((currentIndex / totalCards) * 100)

  return (
    <div className="fixed inset-0 bg-[#0F172A] text-white flex flex-col select-none overflow-hidden"
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

      {/* Header */}
      <div className="px-6 py-4 border-b border-[#334155]">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <button onClick={() => router.push(`/themes/${themeId}`)} className="text-gray-400 hover:text-white transition-colors">✕</button>
          <div className="text-center">
            {isFreeMode && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium mb-1 inline-block"
                style={{ background: '#854F0B', color: '#FAC775' }}
                title="Vos intervalles de révision ne sont pas modifiés">
                ∞ Mode libre
              </span>
            )}
            {passNumber > 1 && !isFreeMode && (
              <div className="text-[#818CF8] text-xs font-semibold mb-0.5">
                Passage {passNumber} — {totalCards} carte{totalCards > 1 ? 's' : ''} à retravailler
              </div>
            )}
            <span className="text-gray-400 text-sm">{currentIndex + 1} / {totalCards}</span>
          </div>
          <div className="w-8" />
        </div>
        <div className="max-w-lg mx-auto mt-3">
          <div className="h-1 bg-[#1E293B] rounded-full overflow-hidden">
            <div className="h-full bg-[#4338CA] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
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

      {/* Card zone */}
      <div className="flex-1 min-h-0 overflow-hidden px-6 py-4 flex flex-col gap-3">
        <div className="flex-1 min-h-0 relative w-full max-w-lg mx-auto flex flex-col gap-3">

          {/* Question card */}
          <div
            ref={questionScrollRef}
            onClick={() => !flipped && handleFlip()}
            onScroll={e => { const el = e.currentTarget; setQuestionAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2) }}
            className={`relative overflow-y-auto bg-[#1E293B] rounded-3xl border border-[#334155] shadow-xl shadow-[#4338CA]/10 ${!flipped ? 'flex-1 cursor-pointer' : 'flex-none max-h-[40%]'}`}
          >
            <div className="min-h-full p-8 flex flex-col items-center justify-center gap-4 text-center">
              {(card.decks?.name || card.themes?.name) && (
                <div className="flex items-center gap-1.5">
                  {(card.decks?.themes?.color || card.themes?.color) && (
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: card.decks?.themes?.color || card.themes?.color }} />
                  )}
                  <span className="text-[11px] text-[#64748B]">
                    {card.decks?.themes?.name && <>{card.decks.themes.name} › </>}
                    {card.decks?.name || card.themes?.name}
                  </span>
                </div>
              )}
              {card.theme && <span className="text-xs text-[#818CF8] font-medium uppercase tracking-widest opacity-70">{card.theme}</span>}
              <p className="text-xl font-semibold text-center leading-relaxed">{card.question}</p>
              {!flipped && <p className="text-gray-600 text-sm mt-2">Appuyer pour révéler</p>}
            </div>
            {!questionAtBottom && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#1E293B] to-transparent pointer-events-none" />
            )}
          </div>

          {/* Answer card */}
          {flipped && (
            <div
              ref={answerScrollRef}
              onScroll={e => { const el = e.currentTarget; setAnswerAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2) }}
              className="flex-1 min-h-0 relative overflow-y-auto bg-[#0F0F1F] rounded-3xl border border-[#334155]"
            >
              <div className="min-h-full p-8 flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-lg text-center leading-relaxed whitespace-pre-wrap">{card.answer}</p>
                {card.explanation && <p className="text-sm text-gray-500 text-center mt-2 italic">{card.explanation}</p>}
              </div>
              {!answerAtBottom && (
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0F0F1F] to-transparent pointer-events-none" />
              )}
            </div>
          )}

        </div>
      </div>

      {/* Rating or reveal */}
      {flipped ? (
        <div className="px-6 py-4 border-t border-[#334155]">
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-3">
            {([
              { label: 'Non',        rating: 1, color: 'bg-[#2D1515] hover:brightness-110 border-[#991B1B] text-[#FCA5A5]' },
              { label: 'Hésitation', rating: 2, color: 'bg-[#1C1F2E] hover:brightness-110 border-[#4338CA] text-[#818CF8]' },
              { label: 'Oui',        rating: 3, color: 'bg-[#0C2D1E] hover:brightness-110 border-[#0F6E56] text-[#5DCAA5]' },
            ] as const).map(b => (
              <button key={b.label} onClick={() => handleRating(b.rating)} disabled={isSaving}
                className={`${b.color} border rounded-2xl py-4 font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 min-h-[64px]`}>
                {b.label}
              </button>
            ))}
          </div>

          <div className="max-w-lg mx-auto mt-3 border-t border-[#334155] pt-3">
            {!showArchiveConfirm ? (
              <button onClick={handleArchiveRequest}
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
                <button onClick={handleArchiveCancel} className="text-[#64748B] hover:text-white text-xs px-2 py-1 rounded flex-shrink-0">Annuler</button>
                <button onClick={handleArchiveConfirm} className="bg-[#334155] hover:bg-[#475569] text-white text-xs px-3 py-1 rounded flex-shrink-0">Archiver</button>
              </div>
            )}
          </div>

          <p className="text-center text-gray-700 text-xs mt-2">← Non · Hésitation · Oui →</p>
        </div>
      ) : (
        <div className="px-6 py-4 border-t border-[#334155]">
          <div className="max-w-lg mx-auto">
            <button onClick={handleFlip}
              className="w-full bg-[#4338CA] hover:bg-[#3730A3] rounded-2xl py-4 font-semibold transition-colors">
              Révéler la réponse
            </button>
            <p className="text-center text-gray-600 text-xs mt-2">Espace · Entrée · Appuyer</p>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undoData && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-[#1E293B] border border-[#334155] rounded-xl px-4 py-2.5 text-sm flex items-center gap-3 shadow-lg whitespace-nowrap">
          <span className="text-[#F1F5F9]">Archivée</span>
          <button onClick={() => handleUndoArchive(undoData.cardId)} className="text-[#818CF8] hover:text-[#A5B4FC] font-medium transition-colors">
            Annuler ({undoData.countdown}s)
          </button>
        </div>
      )}
    </div>
  )
}
export const runtime = 'edge'
