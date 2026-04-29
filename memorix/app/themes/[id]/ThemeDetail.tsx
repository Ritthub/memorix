'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Theme, Deck } from '@/types'
import { pluralCard } from '@/lib/utils'

const THEME_COLORS = [
  '#4338CA', '#0D9488', '#E85D4A', '#F59E0B',
  '#3B82F6', '#22C55E', '#EC4899', '#6B7280',
]

type DeckWithMeta = Deck & { card_count: number; due_count: number }

interface Props {
  theme: Theme
  decks: DeckWithMeta[]
  totalCards: number
  totalDue: number
  userId: string
}

export default function ThemeDetail({ theme, decks: initialDecks, totalCards, totalDue, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState(theme.name)
  const [color, setColor] = useState(theme.color)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(theme.name)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteMode, setDeleteMode] = useState<'keep' | 'delete'>('keep')
  const [decks] = useState(initialDecks)

  const handleRename = async () => {
    if (!editName.trim()) return
    await supabase.from('themes').update({ name: editName.trim() }).eq('id', theme.id)
    setName(editName.trim())
    setEditing(false)
  }

  const handleColorChange = async (c: string) => {
    setColor(c)
    setShowColorPicker(false)
    await supabase.from('themes').update({ color: c }).eq('id', theme.id)
  }

  const handleDelete = async () => {
    if (deleteMode === 'delete') {
      await supabase.from('decks').delete().eq('theme_id', theme.id)
    } else {
      await supabase.from('decks').update({ theme_id: null }).eq('theme_id', theme.id)
    }
    await supabase.from('themes').delete().eq('id', theme.id)
    router.push('/decks')
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg-base)]/95 backdrop-blur-md border-b border-[var(--border-default)] px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/decks" className="text-gray-400 hover:text-white flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
            </svg>
          </Link>

          <button
            onClick={() => { setShowColorPicker(v => !v) }}
            className="w-4 h-4 rounded-full flex-shrink-0 transition-transform hover:scale-110"
            style={{ background: color }}
          />

          {editing ? (
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
              className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3 py-1 text-lg font-bold focus:outline-none focus:border-[var(--border-focus)]"
            />
          ) : (
            <h1
              className="text-xl font-bold flex-1 cursor-pointer hover:text-[var(--accent-light)] transition-colors"
              onClick={() => setEditing(true)}
            >
              {name}
            </h1>
          )}

          {editing ? (
            <button onClick={handleRename} className="bg-[var(--accent)] rounded-lg px-3 py-1 text-sm font-medium">OK</button>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>

        {showColorPicker && (
          <div className="flex gap-2 mt-3 pl-11">
            {THEME_COLORS.map(c => (
              <button
                key={c}
                onClick={() => handleColorChange(c)}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/40' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[var(--bg-surface)] rounded-2xl p-4 border border-[var(--border-default)]">
            <div className="text-2xl font-bold" style={{ color }}>{decks.length}</div>
            <div className="text-gray-400 text-xs mt-0.5">Decks</div>
          </div>
          <div className="bg-[var(--bg-surface)] rounded-2xl p-4 border border-[var(--border-default)]">
            <div className="text-2xl font-bold" style={{ color }}>{totalCards}</div>
            <div className="text-gray-400 text-xs mt-0.5">Cartes</div>
          </div>
          <div className="bg-[var(--bg-surface)] rounded-2xl p-4 border border-[var(--border-default)]">
            <div className="text-2xl font-bold" style={{ color }}>{totalDue}</div>
            <div className="text-gray-400 text-xs mt-0.5">À réviser</div>
          </div>
        </div>

        {/* Review all CTA */}
        <div className="mb-6">
          {totalDue > 0 ? (
            <>
              <Link
                href={`/review/theme/${theme.id}`}
                className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-[#4338CA] to-[#818CF8] hover:from-[#3730A3] hover:to-[#4338CA] rounded-2xl p-4 font-bold mb-2 transition-all shadow-lg shadow-[#4338CA]/25"
              >
                <span className="text-xl">⚡</span>
                <span>Réviser tout le thème</span>
                <span className="bg-white/20 rounded-full px-2.5 py-0.5 text-sm font-normal">{totalDue}</span>
              </Link>
              <Link
                href={`/review/theme/${theme.id}?mode=free`}
                className="flex items-center justify-center gap-3 w-full border border-[var(--border-default)] hover:border-[var(--accent)] rounded-2xl p-3 text-gray-400 hover:text-white text-sm font-medium transition-colors"
              >
                Tout réviser ({totalCards} {pluralCard(totalCards)})
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 text-green-400 text-sm mb-3">
                <span>✓</span><span>Aucune carte due aujourd&apos;hui</span>
              </div>
              <Link
                href={`/review/theme/${theme.id}?mode=free`}
                className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-[#4338CA] to-[#818CF8] hover:from-[#3730A3] hover:to-[#4338CA] rounded-2xl p-4 font-bold transition-all shadow-lg shadow-[#4338CA]/25"
              >
                Tout réviser ({totalCards} {pluralCard(totalCards)})
              </Link>
            </>
          )}
        </div>

        {/* Decks list */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Decks ({decks.length})</h2>
          {decks.length === 0 ? (
            <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--border-default)]">
              <p className="text-gray-500 text-sm mb-3">Aucun deck dans ce thème</p>
              <Link href={`/create?themeId=${theme.id}`} className="text-[var(--accent)] hover:text-[var(--accent-light)] text-sm">+ Créer un deck</Link>
            </div>
          ) : (
            decks.map(deck => {
              const retention = deck.card_count > 0
                ? Math.round(((deck.card_count - deck.due_count) / deck.card_count) * 100)
                : 100
              return (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="flex items-center gap-3 bg-[var(--bg-surface)] rounded-xl p-4 border border-[var(--border-default)] hover:border-[var(--border-focus)]/40 transition-colors"
                >
                  <span className="text-2xl">{deck.icon || '📚'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{deck.name}</p>
                    <p className="text-xs text-gray-500">{deck.card_count} {pluralCard(deck.card_count)} · {retention}% rétention</p>
                  </div>
                  {deck.due_count > 0 && (
                    <span className="bg-[var(--accent)] text-white text-xs font-bold rounded-full px-2 py-0.5">{deck.due_count}</span>
                  )}
                </Link>
              )
            })
          )}
        </div>
      </main>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-surface)] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-red-500/30">
            <h2 className="text-lg font-bold mb-2">Supprimer &quot;{name}&quot; ?</h2>
            <p className="text-gray-400 text-sm mb-4">Ce thème contient {decks.length} deck{decks.length !== 1 ? 's' : ''}.</p>
            <div className="space-y-2 mb-5">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-default)] cursor-pointer hover:border-[#475569]">
                <input
                  type="radio"
                  name="deleteMode"
                  value="keep"
                  checked={deleteMode === 'keep'}
                  onChange={() => setDeleteMode('keep')}
                  className="accent-[#4338CA]"
                />
                <span className="text-sm">Garder les decks sans thème</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-red-500/20 cursor-pointer hover:border-red-500/40">
                <input
                  type="radio"
                  name="deleteMode"
                  value="delete"
                  checked={deleteMode === 'delete'}
                  onChange={() => setDeleteMode('delete')}
                  className="accent-red-500"
                />
                <span className="text-sm text-red-400">Supprimer aussi les decks</span>
              </label>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 border border-[var(--border-default)] rounded-xl py-2.5 text-sm hover:bg-[var(--accent)]/10">Annuler</button>
              <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl py-2.5 text-sm font-semibold transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
