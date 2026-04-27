'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Toast from './Toast'

const LAST_DECK_KEY = 'memorix_last_deck'
const HIDDEN_PREFIXES = ['/login', '/onboarding', '/auth', '/review/']

type DeckOption = { id: string; name: string; icon: string }

export default function QuickAdd() {
  const pathname = usePathname()
  const supabase = createClient()

  // undefined = auth check in progress, null = not logged in
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [lockedDeckId, setLockedDeckId] = useState<string | null>(null)
  const [decks, setDecks] = useState<DeckOption[]>([])
  const [selectedDeckId, setSelectedDeckId] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [showExplanation, setShowExplanation] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const questionRef = useRef<HTMLTextAreaElement>(null)

  // Auth check + deck list
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setUserId(null); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('decks')
        .select('id, name, icon')
        .eq('user_id', user.id)
        .order('name')
      if (data && data.length > 0) {
        setDecks(data)
        const last = localStorage.getItem(LAST_DECK_KEY)
        setSelectedDeckId(last && data.find((d: DeckOption) => d.id === last) ? last : data[0].id)
      }
    }
    init()
  }, [])

  // Custom event: memorix:quickadd:open  { deckId?, locked? }
  useEffect(() => {
    function onOpen(e: Event) {
      const { deckId, locked } = (e as CustomEvent<{ deckId?: string; locked?: boolean }>).detail ?? {}
      if (deckId) {
        setSelectedDeckId(deckId)
        setLockedDeckId(locked ? deckId : null)
        localStorage.setItem(LAST_DECK_KEY, deckId)
      } else {
        setLockedDeckId(null)
      }
      setOpen(true)
    }
    window.addEventListener('memorix:quickadd:open', onOpen)
    return () => window.removeEventListener('memorix:quickadd:open', onOpen)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setQuestion('')
    setAnswer('')
    setExplanation('')
    setShowExplanation(false)
    setLockedDeckId(null)
  }, [])

  // Keyboard shortcuts: Cmd+N to open, Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !open) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        setLockedDeckId(null)
        setOpen(true)
      }
      if (e.key === 'Escape' && open) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Autofocus on open
  useEffect(() => {
    if (open) setTimeout(() => questionRef.current?.focus(), 80)
  }, [open])

  async function save() {
    if (!question.trim() || !answer.trim() || !selectedDeckId || saving || !userId) return
    setSaving(true)

    const { data: card, error } = await supabase
      .from('cards')
      .insert({
        deck_id: selectedDeckId,
        question: question.trim(),
        answer: answer.trim(),
        explanation: explanation.trim() || null,
        difficulty: 1,
        created_by_ai: false,
        user_edited: false,
      })
      .select('id')
      .single()

    if (error || !card) {
      console.error('QuickAdd save error:', error)
      setSaving(false)
      return
    }

    await supabase.from('card_reviews').insert({
      card_id: card.id,
      user_id: userId,
      state: 'new',
      scheduled_at: new Date().toISOString(),
    })

    localStorage.setItem(LAST_DECK_KEY, selectedDeckId)
    const deckName = decks.find(d => d.id === selectedDeckId)?.name ?? 'deck'
    setSaving(false)
    close()
    setToast(`Carte ajoutée à ${deckName}`)
  }

  // Don't render while loading or unauthenticated or on excluded paths
  const hidden = HIDDEN_PREFIXES.some(p => pathname.startsWith(p))
  if (userId === undefined || userId === null || hidden) return null

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          onClick={() => { setLockedDeckId(null); setOpen(true) }}
          style={{ bottom: 80, right: 16 }}
          className="fixed z-50 w-[52px] h-[52px] rounded-full bg-[#4338CA] shadow-lg
            flex items-center justify-center text-white text-2xl font-light
            hover:scale-105 active:scale-95 transition-transform duration-150"
          aria-label="Nouvelle carte"
          title="Nouvelle carte (Cmd+N)"
        >
          +
        </button>
      )}

      {/* Overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={close}
          />

          {/* Panel — bottom sheet on mobile, centered modal on desktop */}
          <div className={`
            fixed z-[101] bg-[#1E293B] border-[#334155] p-5
            bottom-0 left-0 right-0 rounded-t-3xl border-t
            sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2
            sm:w-full sm:max-w-md sm:rounded-2xl sm:border
            animate-quickadd
          `}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[#F1F5F9]">Nouvelle carte</h2>
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center text-[#64748B] hover:text-[#F1F5F9] rounded-lg hover:bg-white/5 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {/* Deck selector */}
            <select
              value={selectedDeckId}
              onChange={e => {
                setSelectedDeckId(e.target.value)
                localStorage.setItem(LAST_DECK_KEY, e.target.value)
              }}
              disabled={!!lockedDeckId}
              className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-sm text-[#F1F5F9] focus:outline-none focus:border-[#818CF8] transition-colors mb-3 disabled:opacity-60"
            >
              {decks.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
            </select>

            {/* Question */}
            <textarea
              ref={questionRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() } }}
              placeholder="Question…"
              rows={2}
              className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#475569] focus:outline-none focus:border-[#818CF8] transition-colors resize-none mb-3"
            />

            {/* Answer */}
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() } }}
              placeholder="Réponse…"
              rows={2}
              className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-sm text-[#818CF8] placeholder-[#475569] focus:outline-none focus:border-[#818CF8] transition-colors resize-none mb-3"
            />

            {/* Explanation toggle */}
            {!showExplanation ? (
              <button
                onClick={() => setShowExplanation(true)}
                className="text-xs text-[#64748B] hover:text-[#94A3B8] mb-3 block transition-colors"
              >
                + Ajouter une explication
              </button>
            ) : (
              <textarea
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                placeholder="Explication (optionnel)…"
                rows={2}
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-sm text-[#94A3B8] placeholder-[#475569] focus:outline-none focus:border-[#818CF8] transition-colors resize-none mb-3"
              />
            )}

            <button
              onClick={save}
              disabled={!question.trim() || !answer.trim() || !selectedDeckId || saving}
              className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 rounded-xl py-2.5 font-medium text-sm transition-colors"
            >
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}
