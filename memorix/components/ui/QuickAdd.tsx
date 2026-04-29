'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Toast from './Toast'

const LAST_DEST_KEY = 'memorix_last_deck'
const HIDDEN_PREFIXES = ['/login', '/onboarding', '/auth', '/review/']

type DestOption = { value: string; label: string; name: string }

export default function QuickAdd() {
  const pathname = usePathname()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [lockedDeckId, setLockedDeckId] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<DestOption[]>([])
  const [selectedDest, setSelectedDest] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [showExplanation, setShowExplanation] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const questionRef = useRef<HTMLTextAreaElement>(null)

  // Auth check + destination list (leaf themes + all decks)
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setUserId(null); return }
      setUserId(user.id)

      const [{ data: decksData }, { data: themesData }] = await Promise.all([
        supabase.from('decks').select('id, name, icon, theme_id').eq('user_id', user.id).order('name'),
        supabase.from('themes').select('id, name, color, parent_id').eq('user_id', user.id),
      ])

      // Leaf themes: not a parent of another theme AND has no decks assigned
      const parentIds = new Set((themesData || []).filter((t: { id: string; parent_id: string | null }) => t.parent_id).map((t: { parent_id: string }) => t.parent_id))
      const themesWithDecks = new Set((decksData || []).map((d: { theme_id: string | null }) => d.theme_id).filter(Boolean))
      const leafThemes = (themesData || []).filter((t: { id: string; parent_id: string | null }) =>
        !parentIds.has(t.id) && !themesWithDecks.has(t.id)
      )

      const themeOpts: DestOption[] = leafThemes.map((t: { id: string; name: string }) => ({
        value: `theme:${t.id}`,
        label: `◆ ${t.name} (direct)`,
        name: t.name,
      }))
      const deckOpts: DestOption[] = (decksData || []).map((d: { id: string; name: string; icon: string }) => ({
        value: `deck:${d.id}`,
        label: `${d.icon || '📚'} ${d.name}`,
        name: d.name,
      }))

      const all = [...themeOpts, ...deckOpts]
      setDestinations(all)

      const rawLast = localStorage.getItem(LAST_DEST_KEY)
      // Backward compat: old format was just a deck ID without prefix
      const last = rawLast && !rawLast.includes(':') ? `deck:${rawLast}` : rawLast
      const defaultDest = last && all.find(d => d.value === last) ? last : (all[0]?.value || '')
      setSelectedDest(defaultDest)
    }
    init()
  }, [])

  // Custom event: memorix:quickadd:open  { deckId?, locked? }
  useEffect(() => {
    function onOpen(e: Event) {
      const { deckId, locked } = (e as CustomEvent<{ deckId?: string; locked?: boolean }>).detail ?? {}
      if (deckId) {
        const dest = `deck:${deckId}`
        setSelectedDest(dest)
        setLockedDeckId(locked ? deckId : null)
        localStorage.setItem(LAST_DEST_KEY, dest)
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
    if (!question.trim() || !answer.trim() || !selectedDest || saving || !userId) return
    setSaving(true)

    const colonIdx = selectedDest.indexOf(':')
    const destType = selectedDest.slice(0, colonIdx) as 'deck' | 'theme'
    const destId = selectedDest.slice(colonIdx + 1)

    const cardPayload: Record<string, unknown> = {
      question: question.trim(),
      answer: answer.trim(),
      explanation: explanation.trim() || null,
      difficulty: 3,
      created_by_ai: false,
      user_edited: false,
    }
    if (destType === 'theme') {
      cardPayload.theme_id = destId
    } else {
      cardPayload.deck_id = destId
    }

    const { data: card, error } = await supabase
      .from('cards')
      .insert(cardPayload)
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

    localStorage.setItem(LAST_DEST_KEY, selectedDest)
    const destName = destinations.find(d => d.value === selectedDest)?.name ?? 'destination'
    setSaving(false)
    close()
    setToast(`Carte ajoutée à ${destName}`)
  }

  const hidden = HIDDEN_PREFIXES.some(p => pathname.startsWith(p))
  if (userId === undefined || userId === null || hidden) return null

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          onClick={() => { setLockedDeckId(null); setOpen(true) }}
          style={{ bottom: 80, right: 16 }}
          className="fixed z-50 w-[52px] h-[52px] rounded-full bg-[var(--accent)] shadow-lg
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

          <div className={`
            fixed z-[101] bg-[var(--bg-surface)] border-[var(--border-default)] p-5
            bottom-0 left-0 right-0 rounded-t-3xl border-t
            sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2
            sm:w-full sm:max-w-md sm:rounded-2xl sm:border
            animate-quickadd
          `}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[var(--text-primary)]">Nouvelle carte</h2>
              <button
                onClick={close}
                className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-elevated)]/20 transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {/* Destination selector: leaf themes first, then decks */}
            <select
              value={selectedDest}
              onChange={e => {
                setSelectedDest(e.target.value)
                localStorage.setItem(LAST_DEST_KEY, e.target.value)
              }}
              disabled={!!lockedDeckId}
              className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors mb-3 disabled:opacity-60"
            >
              {destinations.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>

            {/* Question */}
            <textarea
              ref={questionRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() } }}
              placeholder="Question…"
              rows={2}
              className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[#475569] focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none mb-3"
            />

            {/* Answer */}
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save() } }}
              placeholder="Réponse…"
              rows={2}
              className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--accent-light)] placeholder-[#475569] focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none mb-3"
            />

            {/* Explanation toggle */}
            {!showExplanation ? (
              <button
                onClick={() => setShowExplanation(true)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-3 block transition-colors"
              >
                + Ajouter une explication
              </button>
            ) : (
              <textarea
                value={explanation}
                onChange={e => setExplanation(e.target.value)}
                placeholder="Explication (optionnel)…"
                rows={2}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-secondary)] placeholder-[#475569] focus:outline-none focus:border-[var(--border-focus)] transition-colors resize-none mb-3"
              />
            )}

            <button
              onClick={save}
              disabled={!question.trim() || !answer.trim() || !selectedDest || saving}
              className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 rounded-xl py-2.5 font-medium text-sm transition-colors"
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
