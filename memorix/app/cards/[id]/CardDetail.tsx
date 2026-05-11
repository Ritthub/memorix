'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type CardWithTheme = {
  id: string
  question: string
  answer: string
  explanation?: string | null
  difficulty?: number | null
  theme_id?: string | null
  archived?: boolean | null
  user_edited?: boolean | null
  themes?: {
    id: string
    name: string
    color: string
    parent_id?: string | null
  } | null
}

type ReviewData = {
  state?: string
  reps?: number
  lapses?: number
  scheduled_at?: string | null
} | null

type HistoryEntry = {
  rating: number
  reviewed_at: string
  scheduled_days: number
  state: string
  mode: 'scheduled' | 'free'
}

type CardStats = {
  total: number
  freeCount: number
  scheduledCount: number
  successRate: number | null
  correctStreak: number
}

interface Props {
  card: CardWithTheme
  review: ReviewData
  history: HistoryEntry[]
  daysUntilNext: number | null
  parentThemeName: string | null
  stats: CardStats
}

function formatState(state: string | undefined): string {
  switch (state) {
    case 'new': return 'Nouvelle'
    case 'learning': return 'En apprentissage'
    case 'review': return 'Maîtrisée'
    case 'relearning': return 'En rattrapage'
    default: return 'Nouvelle'
  }
}

// "Prochaine révision" — relative label derived only from card_reviews.scheduled_at.
// daysUntilNext is null when there is no schedule (no row, null scheduled_at,
// or legacy free-mode sentinel ~10 years out): in that case the caller should
// show "Non planifiée" — never "Mode libre".
function formatNextReview(daysUntilNext: number | null): string {
  if (daysUntilNext === null) return 'Non planifiée'
  if (daysUntilNext < 0) return 'En retard'
  if (daysUntilNext === 0) return "Aujourd'hui"
  if (daysUntilNext === 1) return 'Demain'
  if (daysUntilNext < 30) return `Dans ${daysUntilNext} jours`
  if (daysUntilNext < 365) {
    const months = Math.round(daysUntilNext / 30)
    return `Dans ${months} mois`
  }
  const years = Math.round(daysUntilNext / 365)
  return `Dans ${years} an${years > 1 ? 's' : ''}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() !== new Date().getFullYear()
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short' }
  return d.toLocaleDateString('fr-FR', opts)
}

function RatingIcon({ rating }: { rating: number }) {
  if (rating === 1) return <span style={{ color: '#F87171' }}>✗</span>
  if (rating === 2) return <span style={{ color: '#94A3B8' }}>~</span>
  if (rating === 3) return <span style={{ color: '#34D399' }}>✓</span>
  return <span style={{ color: '#34D399' }}>✓✓</span>
}

export default function CardDetail({ card, review, history, daysUntilNext, parentThemeName, stats }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [editingField, setEditingField] = useState<'question' | 'answer' | 'explanation' | null>(null)
  const [values, setValues] = useState({
    question: card.question,
    answer: card.answer,
    explanation: card.explanation || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [difficulty, setDifficulty] = useState(card.difficulty ?? 1)

  function cancelEdit() {
    setEditingField(null)
    setValues({
      question: card.question,
      answer: card.answer,
      explanation: card.explanation || '',
    })
    setError(null)
  }

  async function saveField(): Promise<boolean> {
    if (!editingField) return true
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('cards')
      .update({
        [editingField]: values[editingField].trim(),
        user_edited: true,
      })
      .eq('id', card.id)
    if (err) {
      setError(err.message)
      setSaving(false)
      return false
    }
    setEditingField(null)
    setSaving(false)
    router.refresh()
    return true
  }

  async function startEdit(field: 'question' | 'answer' | 'explanation') {
    if (editingField === field) return
    if (editingField !== null) {
      const ok = await saveField()
      if (!ok) return
    }
    setEditingField(field)
  }

  async function handleArchive() {
    setMenuOpen(false)
    await supabase
      .from('cards')
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq('id', card.id)
    router.push('/library')
  }

  async function handleResetProgress() {
    setShowResetDialog(false)
    await Promise.all([
      supabase.from('card_reviews').delete().eq('card_id', card.id),
      supabase.from('review_logs').delete().eq('card_id', card.id),
    ])
    router.refresh()
  }

  async function handleDifficultyChange(val: number) {
    setDifficulty(val)
    await supabase.from('cards').update({ difficulty: val }).eq('id', card.id)
    router.refresh()
  }

  function dimmedStyle(field: 'question' | 'answer' | 'explanation') {
    if (editingField !== null && editingField !== field) {
      return { opacity: 0.45 }
    }
    return {}
  }

  function fieldBorder(field: 'question' | 'answer' | 'explanation') {
    return editingField === field ? 'var(--border-focus)' : 'var(--border-subtle)'
  }

  const autoExpand = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const FIELD_STYLE: React.CSSProperties = {
    background: 'var(--bg-surface)',
    borderRadius: 12,
    padding: '12px 14px',
    cursor: 'text',
    transition: 'opacity 0.15s',
  }

  const LABEL_STYLE: React.CSSProperties = {
    fontSize: 9,
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    marginBottom: 6,
  }

  const TEXTAREA_STYLE: React.CSSProperties = {
    width: '100%',
    resize: 'none',
    minHeight: 80,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: 15,
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    lineHeight: 1.5,
  }

  const VALUE_STYLE: React.CSSProperties = {
    fontSize: 15,
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.5,
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--bg-base)]/95 backdrop-blur-md border-b border-[var(--border-default)] px-4 py-3 flex items-center gap-3">
        {editingField ? (
          <>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
            >
              Annuler
            </button>
            <div className="flex-1" />
            <button
              onClick={saveField}
              disabled={saving}
              className="text-[var(--accent-light)] hover:text-[var(--accent-muted)] text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? '…' : 'Enregistrer'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
              </svg>
              Bibliothèque
            </button>
            <div className="flex-1" />
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-elevated)]/30 transition-colors text-lg leading-none"
              >
                ⋯
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-9 z-40 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-xl min-w-[200px] overflow-hidden">
                    <button
                      onClick={() => { setMenuOpen(false); setShowResetDialog(true) }}
                      className="w-full text-left px-4 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/30 transition-colors"
                    >
                      Réinitialiser la progression
                    </button>
                    <button
                      onClick={handleArchive}
                      className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors border-t border-[var(--border-subtle)]"
                    >
                      Archiver cette carte
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-4">
        {/* Breadcrumb */}
        {card.themes && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: card.themes.color }}
            />
            <span>
              {parentThemeName && `${parentThemeName} › `}{card.themes.name}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Reset progress dialog */}
        {showResetDialog && (
          <div className="px-4 py-4 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl space-y-3">
            <p className="text-sm text-[var(--text-primary)]">Réinitialiser la progression FSRS de cette carte ?</p>
            <p className="text-xs text-[var(--text-muted)]">Toutes les révisions seront supprimées et la carte reviendra à l&apos;état &ldquo;Nouvelle&rdquo;.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowResetDialog(false)}
                className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleResetProgress}
                className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        )}

        {/* Question */}
        <div
          style={{ ...FIELD_STYLE, border: `0.5px solid ${fieldBorder('question')}`, ...dimmedStyle('question') }}
          onClick={() => startEdit('question')}
        >
          <p style={LABEL_STYLE}>Question</p>
          {editingField === 'question' ? (
            <textarea
              autoFocus
              value={values.question}
              onChange={e => setValues(v => ({ ...v, question: e.target.value }))}
              onInput={e => autoExpand(e.currentTarget)}
              style={TEXTAREA_STYLE}
            />
          ) : (
            <p style={VALUE_STYLE}>{values.question}</p>
          )}
        </div>

        {/* Answer */}
        <div
          style={{ ...FIELD_STYLE, border: `0.5px solid ${fieldBorder('answer')}`, ...dimmedStyle('answer') }}
          onClick={() => startEdit('answer')}
        >
          <p style={LABEL_STYLE}>Réponse</p>
          {editingField === 'answer' ? (
            <textarea
              autoFocus
              value={values.answer}
              onChange={e => setValues(v => ({ ...v, answer: e.target.value }))}
              onInput={e => autoExpand(e.currentTarget)}
              style={TEXTAREA_STYLE}
            />
          ) : (
            <p style={VALUE_STYLE}>{values.answer}</p>
          )}
        </div>

        {/* Explanation */}
        <div
          style={{ ...FIELD_STYLE, border: `0.5px solid ${fieldBorder('explanation')}`, ...dimmedStyle('explanation') }}
          onClick={() => startEdit('explanation')}
        >
          <p style={LABEL_STYLE}>Explication</p>
          {editingField === 'explanation' ? (
            <textarea
              autoFocus
              value={values.explanation}
              onChange={e => setValues(v => ({ ...v, explanation: e.target.value }))}
              onInput={e => autoExpand(e.currentTarget)}
              style={TEXTAREA_STYLE}
            />
          ) : values.explanation ? (
            <p style={VALUE_STYLE}>{values.explanation}</p>
          ) : (
            <p style={{ fontSize: 15, color: 'var(--text-hint)', fontStyle: 'italic' }}>
              Ajouter une explication…
            </p>
          )}
        </div>

        {/* Difficulty */}
        <div style={{
          ...FIELD_STYLE,
          border: '0.5px solid var(--border-subtle)',
          ...(editingField !== null ? { opacity: 0.45, pointerEvents: 'none' } : {}),
        }}>
          <p style={LABEL_STYLE}>Difficulté</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(val => (
              <button
                key={val}
                onClick={() => handleDifficultyChange(val)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: val <= difficulty ? 'var(--accent)' : 'var(--border-default)',
                  background: val <= difficulty ? 'var(--accent)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  fontSize: 11,
                  color: val <= difficulty ? 'white' : 'var(--text-muted)',
                }}
                title={`Difficulté ${val}`}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* FSRS stats */}
        <div style={{
          ...FIELD_STYLE,
          border: '0.5px solid var(--border-subtle)',
          ...(editingField !== null ? { opacity: 0.45, pointerEvents: 'none' } : {}),
        }}>
          <p style={LABEL_STYLE}>Révisions</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Prochaine révision</p>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: daysUntilNext !== null && daysUntilNext < 0
                    ? '#F87171'
                    : 'var(--text-primary)',
                }}
              >
                {formatNextReview(daysUntilNext)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>État</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                {formatState(review?.state)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Révisions totales</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                {stats.total}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                  ({stats.scheduledCount} prog. · {stats.freeCount} libre)
                </span>
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Taux de réussite</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                {stats.successRate !== null ? `${stats.successRate}%` : '—'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Bonnes d&apos;affilée</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                {stats.correctStreak}{stats.correctStreak > 0 ? ' 🔥' : ''}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Lapses (oublis)</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                {review?.lapses ?? 0}
              </p>
            </div>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 12,
            overflow: 'hidden',
            ...(editingField !== null ? { opacity: 0.45, pointerEvents: 'none' } : {}),
            transition: 'opacity 0.15s',
          }}>
            <button
              onClick={() => setHistoryOpen(v => !v)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <p style={LABEL_STYLE}>Historique</p>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                style={{ transform: historyOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {historyOpen && (
              <div style={{ borderTop: '0.5px solid var(--border-subtle)' }}>
                {history.map((entry, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 14px',
                      borderBottom: i < history.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 50 }}>
                      {formatDate(entry.reviewed_at)}
                    </span>
                    <span style={{ fontSize: 14, minWidth: 24, textAlign: 'center' }}>
                      <RatingIcon rating={entry.rating} />
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: entry.mode === 'free' ? 'rgba(133,79,11,0.25)' : 'var(--bg-elevated)',
                        color: entry.mode === 'free' ? '#FAC775' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {entry.mode === 'free' ? 'Libre' : 'Prog.'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {entry.mode === 'free'
                        ? '—'
                        : entry.scheduled_days > 3650
                          ? '—'
                          : formatDate(new Date(new Date(entry.reviewed_at).getTime() + entry.scheduled_days * 86400000).toISOString())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
