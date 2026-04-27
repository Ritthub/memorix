'use client'

import {
  useState, useCallback, useRef, useEffect,
  createContext, useContext, useMemo, CSSProperties,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Theme, Deck } from '@/types'
import { pluralCard } from '@/lib/utils'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ────────────────────────────────────────────────────────────────────

type DeckWithMeta = Deck & { card_count: number; due_count: number }
type TreeNode = Theme & { children: TreeNode[]; depth: number }
type MenuAnchor = { rect: DOMRect; mobile: boolean }
type CardItem = { id: string; question: string; answer: string }

export interface TreeLibraryProps {
  initialThemes: Theme[]
  initialDecks: DeckWithMeta[]
  userId: string
}

interface Ctx {
  decksMap: Map<string | null, DeckWithMeta[]>
  collapsed: Set<string>
  editingId: string | null
  editValue: string
  deletingThemeId: string | null
  colorPickerId: string | null
  onToggle: (id: string) => void
  onEditStart: (id: string, name: string) => void
  onEditChange: (v: string) => void
  onEditCommit: (id: string) => void
  onEditCancel: () => void
  onCreateChild: (parentId: string) => void
  onDeleteThemeStart: (id: string) => void
  onDeleteThemeCancel: () => void
  onDeleteThemeConfirm: (id: string) => void
  onColorToggle: (id: string | null) => void
  onColorChange: (id: string, color: string) => void
  onDeckOptions: (deck: DeckWithMeta, btn: HTMLButtonElement) => void
  // Card expansion
  userId: string
  expandedDecks: Set<string>
  deckCards: Map<string, CardItem[]>
  loadingDecks: Set<string>
  onToggleDeck: (id: string) => void
  onAddCard: (deckId: string, q: string, a: string) => Promise<void>
  onEditCard: (cardId: string, deckId: string, q: string, a: string) => Promise<void>
  onDeleteCard: (cardId: string, deckId: string) => Promise<void>
  onMoveCard: (cardId: string, fromDeckId: string, toDeckId: string) => Promise<void>
  onToggleAllDecksInTheme: (node: TreeNode) => void
  onCreateDeck: (name: string, icon: string, themeId: string | null) => Promise<void>
  allDecks: DeckWithMeta[]
  themesById: Map<string, Theme>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#4338CA', '#0D9488', '#E85D4A', '#F59E0B', '#3B82F6', '#22C55E', '#EC4899']
const DECK_ICONS = ['📚', '💼', '🧠', '🌍', '⚖️', '💊', '🏛️', '🔬', '💰', '🎯', '🗣️', '✏️', '🎵', '🏋️', '🧪']
const INDENT = 20

const LibCtx = createContext<Ctx | null>(null)
const useLib = () => useContext(LibCtx)!

// ── Utilities ─────────────────────────────────────────────────────────────────

function buildTree(themes: Theme[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const t of themes) map.set(t.id, { ...t, children: [], depth: 0 })
  const roots: TreeNode[] = []

  for (const t of themes) {
    const node = map.get(t.id)!
    if (t.parent_id && map.has(t.parent_id)) {
      map.get(t.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const queue: Array<{ node: TreeNode; depth: number }> = roots.map(n => ({ node: n, depth: 0 }))
  while (queue.length) {
    const { node, depth } = queue.shift()!
    node.depth = depth
    node.children.forEach(child => queue.push({ node: child, depth: depth + 1 }))
  }

  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    nodes.forEach(n => sort(n.children))
    return nodes
  }
  return sort(roots)
}

function subtreeDue(node: TreeNode, decksMap: Map<string | null, DeckWithMeta[]>): number {
  const direct = decksMap.get(node.id) || []
  return direct.reduce((s, d) => s + d.due_count, 0) +
    node.children.reduce((s, c) => s + subtreeDue(c, decksMap), 0)
}

function flattenTree(nodes: TreeNode[]): Array<{ theme: Theme; depth: number }> {
  const result: Array<{ theme: Theme; depth: number }> = []
  function walk(n: TreeNode) {
    result.push({ theme: n, depth: n.depth })
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return result
}

function getDeckIdsInSubtree(node: TreeNode, decksMap: Map<string | null, DeckWithMeta[]>): string[] {
  const ids: string[] = (decksMap.get(node.id) || []).map(d => d.id)
  node.children.forEach(child => ids.push(...getDeckIdsInSubtree(child, decksMap)))
  return ids
}

function isAncestor(themes: Theme[], ancestorId: string, descendantId: string): boolean {
  let current = themes.find(t => t.id === descendantId)
  while (current?.parent_id) {
    if (current.parent_id === ancestorId) return true
    current = themes.find(t => t.id === current!.parent_id!)
  }
  return false
}

function dropdownStyle(rect: DOMRect): CSSProperties {
  const MENU_H = 220
  const spaceBelow = window.innerHeight - rect.bottom
  const s: CSSProperties = {}
  if (spaceBelow < MENU_H + 8) s.bottom = window.innerHeight - rect.top + 4
  else s.top = rect.bottom + 4
  s.right = Math.max(window.innerWidth - rect.right, 8)
  return s
}

// ── DeckCardsList ─────────────────────────────────────────────────────────────

function DeckCardsList({ deckId, depth }: { deckId: string; depth: number }) {
  const { deckCards, loadingDecks, onAddCard, onEditCard, onDeleteCard, onMoveCard, allDecks, themesById } = useLib()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [movingCardId, setMovingCardId] = useState<string | null>(null)
  const [moveSearch, setMoveSearch] = useState('')
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [addSaving, setAddSaving] = useState(false)

  const qRef = useRef<HTMLInputElement>(null)
  const aRef = useRef<HTMLInputElement>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editARef = useRef<HTMLInputElement>(null)

  const isLoading = loadingDecks.has(deckId)
  const cards = deckCards.get(deckId)
  const pl = INDENT * (depth + 1) + 8

  useEffect(() => {
    return () => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current) }
  }, [])

  function startEdit(card: CardItem) {
    setEditingId(card.id)
    setEditQ(card.question)
    setEditA(card.answer)
    setDeletingId(null)
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditQ('')
    setEditA('')
  }

  async function commitEdit() {
    if (!editingId || (!editQ.trim() && !editA.trim())) { cancelEdit(); return }
    const id = editingId
    cancelEdit()
    await onEditCard(id, deckId, editQ.trim() || '…', editA.trim() || '…')
  }

  function startDelete(cardId: string) {
    setDeletingId(cardId)
    setEditingId(null)
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    deleteTimerRef.current = setTimeout(() => setDeletingId(null), 4000)
  }

  async function confirmDelete(cardId: string) {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setDeletingId(null)
    await onDeleteCard(cardId, deckId)
  }

  async function handleAdd() {
    if (!newQ.trim() || !newA.trim() || addSaving) return
    setAddSaving(true)
    await onAddCard(deckId, newQ.trim(), newA.trim())
    setNewQ('')
    setNewA('')
    setAddSaving(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1000)
    qRef.current?.focus()
  }

  if (isLoading) {
    return (
      <div className="py-1.5 space-y-1.5" style={{ paddingLeft: pl }}>
        <div className="h-3 bg-[#1E293B] rounded animate-pulse" style={{ width: '65%' }} />
        <div className="h-3 bg-[#1E293B] rounded animate-pulse" style={{ width: '45%' }} />
      </div>
    )
  }

  return (
    <div className="pb-1">
      {/* Empty state */}
      {cards?.length === 0 && (
        <p className="text-xs text-[#475569] italic py-0.5" style={{ paddingLeft: pl }}>
          Aucune carte — ajoutez-en une ci-dessous
        </p>
      )}

      {/* Card rows */}
      {cards?.map(card => (
        <div key={card.id}>
          {editingId === card.id ? (
            <div className="flex items-center gap-1.5 py-0.5 pr-2" style={{ paddingLeft: pl }}>
              <input
                autoFocus
                value={editQ}
                onChange={e => setEditQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Tab') { e.preventDefault(); editARef.current?.focus() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                }}
                className="flex-1 bg-transparent text-xs text-[#94A3B8] outline-none border-b border-[#818CF8] py-0.5 min-w-0"
                style={{ maxWidth: '50%' }}
              />
              <span className="text-xs text-[#475569] flex-shrink-0">·</span>
              <input
                ref={editARef}
                value={editA}
                onChange={e => setEditA(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                }}
                onBlur={commitEdit}
                className="flex-1 bg-transparent text-xs text-[#64748B] outline-none border-b border-[#818CF8] py-0.5 min-w-0"
                style={{ maxWidth: '35%' }}
              />
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 py-0.5 pr-2 group/card rounded hover:bg-white/5 transition-colors"
              style={{ paddingLeft: pl }}
            >
              <span className="w-1 h-1 rounded-full bg-[#334155] flex-shrink-0" />
              <span
                className="text-xs text-[#94A3B8] truncate"
                style={{ maxWidth: '50%' }}
                title={card.question}
              >
                {card.question}
              </span>
              <span className="text-xs text-[#475569] flex-shrink-0">·</span>
              <span
                className="text-xs text-[#64748B] truncate"
                style={{ maxWidth: '35%' }}
                title={card.answer}
              >
                {card.answer}
              </span>
              <div className="ml-auto flex items-center gap-0 opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => startEdit(card)}
                  className="w-5 h-5 flex items-center justify-center text-[#475569] hover:text-[#818CF8] rounded text-xs transition-colors"
                  title="Modifier"
                >
                  ✏
                </button>
                <button
                  onClick={() => { setMovingCardId(card.id); setMoveSearch('') }}
                  className="w-5 h-5 flex items-center justify-center text-[#475569] hover:text-[#818CF8] rounded text-xs transition-colors"
                  title="Déplacer vers un autre deck"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                  </svg>
                </button>
                <button
                  onClick={() => startDelete(card.id)}
                  className="w-5 h-5 flex items-center justify-center text-[#475569] hover:text-red-400 rounded text-xs transition-colors"
                  title="Supprimer"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {deletingId === card.id && (
            <div
              className="flex items-center gap-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-xs mt-0.5 mr-2"
              style={{ marginLeft: pl }}
            >
              <span className="text-red-300 flex-1 truncate">Supprimer cette carte ?</span>
              <button
                onClick={() => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); setDeletingId(null) }}
                className="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/5 flex-shrink-0"
              >
                Annuler
              </button>
              <button
                onClick={() => confirmDelete(card.id)}
                className="text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded flex-shrink-0"
              >
                Confirmer
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Move card sheet */}
      {movingCardId && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setMovingCardId(null)}
        >
          <div
            className="bg-[#1E293B] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#334155] max-h-[65vh] flex flex-col pb-safe"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 20px)' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="px-4 py-3 text-sm font-semibold text-gray-400 border-b border-[#334155] shrink-0">
              Déplacer la carte vers…
            </p>
            <div className="px-3 py-2 shrink-0">
              <input
                autoFocus
                value={moveSearch}
                onChange={e => setMoveSearch(e.target.value)}
                placeholder="Rechercher un deck…"
                className="w-full bg-[#0F172A] border border-[#334155] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#4338CA]/60 placeholder-gray-600"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {allDecks
                .filter(d => d.id !== deckId && d.name.toLowerCase().includes(moveSearch.toLowerCase()))
                .map(d => {
                  const themeName = d.theme_id ? themesById.get(d.theme_id)?.name : null
                  return (
                    <button
                      key={d.id}
                      onClick={async () => {
                        const cid = movingCardId
                        setMovingCardId(null)
                        await onMoveCard(cid, deckId, d.id)
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#312E81]/20 rounded-xl text-sm flex items-center gap-2"
                    >
                      <span className="text-lg flex-shrink-0">{d.icon || '📚'}</span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{d.name}</p>
                        {themeName && <p className="text-xs text-gray-500 truncate">{themeName}</p>}
                      </div>
                    </button>
                  )
                })}
              {allDecks.filter(d => d.id !== deckId && d.name.toLowerCase().includes(moveSearch.toLowerCase())).length === 0 && (
                <p className="text-center text-xs text-gray-600 py-6">Aucun deck trouvé</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline add form */}
      <div
        className="flex items-center gap-1.5 py-1 pr-2 border-b border-[#1E293B]"
        style={{ paddingLeft: pl }}
      >
        <input
          ref={qRef}
          value={newQ}
          onChange={e => setNewQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Tab') { e.preventDefault(); aRef.current?.focus() }
          }}
          placeholder="Question…"
          className="flex-1 bg-transparent text-xs text-[#94A3B8] placeholder-[#334155] outline-none border-b border-transparent focus:border-[#818CF8] py-0.5 min-w-0 transition-colors"
          style={{ maxWidth: '45%' }}
        />
        <input
          ref={aRef}
          value={newA}
          onChange={e => setNewA(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() }
          }}
          placeholder="Réponse…"
          className="flex-1 bg-transparent text-xs text-[#64748B] placeholder-[#334155] outline-none border-b border-transparent focus:border-[#818CF8] py-0.5 min-w-0 transition-colors"
          style={{ maxWidth: '45%' }}
        />
        {savedFlash && <span className="text-green-400 text-xs flex-shrink-0">✓</span>}
        <button
          onClick={handleAdd}
          disabled={!newQ.trim() || !newA.trim() || addSaving}
          className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 text-white text-xs leading-none transition-colors"
          title="Ajouter"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ── InlineDeckCreator ─────────────────────────────────────────────────────────

function InlineDeckCreator({ themeId, pl, onDone }: { themeId: string | null; pl: number; onDone: () => void }) {
  const { onCreateDeck } = useLib()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📚')
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function submit() {
    if (!name.trim() || saving) return
    setSaving(true)
    await onCreateDeck(name.trim(), icon, themeId)
    setName('')
    setIcon('📚')
    setSaving(false)
    onDone()
  }

  return (
    <div style={{ paddingLeft: pl }} className="flex items-center gap-1.5 py-1 pr-2 relative">
      <div className="relative flex-shrink-0">
        <button onClick={() => setShowPicker(v => !v)} className="text-base hover:scale-110 transition-transform leading-none">
          {icon}
        </button>
        {showPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
            <div className="absolute left-0 top-7 z-50 bg-[#1E293B] border border-[#334155] rounded-xl p-2 flex flex-wrap gap-1 shadow-xl" style={{ maxWidth: 180 }}>
              {DECK_ICONS.map(i => (
                <button key={i} onClick={() => { setIcon(i); setShowPicker(false) }} className="text-base hover:scale-125 transition-transform p-0.5">{i}</button>
              ))}
            </div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { e.preventDefault(); onDone() }
        }}
        placeholder="Nom du deck…"
        className="flex-1 bg-transparent text-sm text-[#94A3B8] placeholder-[#334155] outline-none border-b border-[#4338CA] py-0.5 min-w-0"
      />
      <button
        onClick={submit}
        disabled={!name.trim() || saving}
        className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 text-white text-xs leading-none transition-colors"
        title="Créer"
      >
        ↵
      </button>
      <button
        onClick={onDone}
        className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-[#475569] hover:text-red-400 text-xs transition-colors"
        title="Annuler"
      >
        ✕
      </button>
    </div>
  )
}

// ── DeckRow ───────────────────────────────────────────────────────────────────

function DeckRow({ deck, depth }: { deck: DeckWithMeta; depth: number }) {
  const { onDeckOptions, expandedDecks, onToggleDeck } = useLib()
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: `deck:${deck.id}`,
    data: { type: 'deck', parentId: deck.theme_id || null },
  })

  const isExpanded = expandedDecks.has(deck.id)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    paddingLeft: INDENT * depth + 24,
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 py-1 pr-2 rounded-lg hover:bg-white/5 group transition-colors"
      >
        <button
          {...attributes}
          {...listeners}
          className="text-gray-700 hover:text-gray-500 touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
          aria-label="Déplacer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2.5" r="1" /><circle cx="9" cy="2.5" r="1" />
            <circle cx="3" cy="6" r="1" /><circle cx="9" cy="6" r="1" />
            <circle cx="3" cy="9.5" r="1" /><circle cx="9" cy="9.5" r="1" />
          </svg>
        </button>
        <Link href={`/decks/${deck.id}`} className="flex-1 flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 text-base leading-none">{deck.icon || '📚'}</span>
          <span className="text-sm text-gray-300 truncate">{deck.name}</span>
          <span className="text-xs text-gray-600 flex-shrink-0">{deck.card_count} {pluralCard(deck.card_count)}</span>
        </Link>
        {deck.due_count > 0 && (
          <span className="bg-[#4338CA] text-white text-xs font-bold rounded-full px-1.5 py-0.5 tabular-nums flex-shrink-0">
            {deck.due_count}
          </span>
        )}
        {/* Chevron to expand/collapse inline cards */}
        <button
          onClick={e => { e.preventDefault(); onToggleDeck(deck.id) }}
          className="w-5 h-5 flex items-center justify-center text-gray-700 hover:text-gray-400 flex-shrink-0 transition-all duration-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'none' }}
          title={isExpanded ? 'Réduire les cartes' : 'Voir les cartes'}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={e => onDeckOptions(deck, e.currentTarget as HTMLButtonElement)}
          className="text-gray-600 hover:text-gray-400 transition-opacity p-1 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      {/* Inline card list */}
      {isExpanded && <DeckCardsList deckId={deck.id} depth={depth} />}
    </>
  )
}

// ── ThemeNode (recursive) ─────────────────────────────────────────────────────

function ThemeNode({ node }: { node: TreeNode }) {
  const {
    decksMap, collapsed, editingId, editValue, deletingThemeId, colorPickerId,
    onToggle, onEditStart, onEditChange, onEditCommit, onEditCancel,
    onCreateChild, onDeleteThemeStart, onDeleteThemeCancel, onDeleteThemeConfirm,
    onColorToggle, onColorChange, expandedDecks, onToggleAllDecksInTheme,
  } = useLib()

  const [creatingDeck, setCreatingDeck] = useState(false)

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: `theme:${node.id}`,
    data: { type: 'theme', parentId: node.parent_id || null },
  })

  const isCollapsed = collapsed.has(node.id)
  const isEditing = editingId === node.id
  const isDeleting = deletingThemeId === node.id
  const showColorPicker = colorPickerId === node.id

  const directDecks = decksMap.get(node.id) || []
  const due = subtreeDue(node, decksMap)
  const subtreeDeckIds = getDeckIdsInSubtree(node, decksMap)
  const allCardsExpanded = subtreeDeckIds.length > 0 && subtreeDeckIds.every(id => expandedDecks.has(id))
  const directDeckIds = directDecks.map(d => `deck:${d.id}`)
  const childThemeIds = node.children.map(c => `theme:${c.id}`)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const pl = node.depth * INDENT + 4

  return (
    <>
      {/* Header row */}
      <div
        ref={setNodeRef}
        style={{ paddingLeft: pl, transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
        className="group relative"
      >
        <div className="flex items-center gap-1 py-0.5 pr-2 rounded-lg hover:bg-white/5 transition-colors">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="text-gray-700 hover:text-gray-500 touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
            aria-label="Déplacer le thème"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="3" cy="2.5" r="1" /><circle cx="9" cy="2.5" r="1" />
              <circle cx="3" cy="6" r="1" /><circle cx="9" cy="6" r="1" />
              <circle cx="3" cy="9.5" r="1" /><circle cx="9" cy="9.5" r="1" />
            </svg>
          </button>
          {/* Chevron */}
          <button
            onClick={() => onToggle(node.id)}
            className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-400 flex-shrink-0 transition-transform duration-200"
            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Color dot + picker */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => onColorToggle(showColorPicker ? null : node.id)}
              className="w-3 h-3 rounded-full hover:scale-125 transition-transform"
              style={{ background: node.color }}
            />
            {showColorPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => onColorToggle(null)} />
                <div className="absolute left-0 top-5 z-50 bg-[#1E293B] border border-[#334155] rounded-xl p-2 flex gap-1.5 shadow-xl">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => onColorChange(node.id, c)}
                      className={`w-5 h-5 rounded-full hover:scale-125 transition-transform ${node.color === c ? 'ring-2 ring-white/60' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Name / inline edit */}
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onEditCommit(node.id) }
                if (e.key === 'Escape') { e.preventDefault(); onEditCancel() }
                if (e.key === 'Tab') { e.preventDefault(); onEditCommit(node.id) }
              }}
              onBlur={() => onEditCommit(node.id)}
              className="flex-1 bg-transparent border-b border-[#4338CA] text-sm font-medium text-white outline-none py-0.5 min-w-0"
            />
          ) : (
            <span
              onDoubleClick={() => onEditStart(node.id, node.name)}
              className="flex-1 text-sm font-medium text-gray-200 hover:text-white truncate min-w-0 cursor-default"
            >
              {node.name}
            </span>
          )}

          {/* Due badge */}
          {due > 0 && (
            <span className="bg-[#4338CA] text-white text-xs font-bold rounded-full px-1.5 py-0.5 tabular-nums flex-shrink-0">
              {due}
            </span>
          )}

          {/* Hover actions */}
          <div className="flex items-center gap-0.5 transition-opacity flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            {subtreeDeckIds.length > 0 && (
              <button
                onClick={() => onToggleAllDecksInTheme(node)}
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${allCardsExpanded ? 'text-[#818CF8]' : 'text-gray-600 hover:text-[#818CF8]'}`}
                title={allCardsExpanded ? 'Masquer toutes les cartes' : 'Voir toutes les cartes'}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="8" height="5" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/>
                  <rect x="3" y="11" width="8" height="5" rx="1"/><rect x="13" y="11" width="8" height="5" rx="1"/>
                  <rect x="3" y="19" width="18" height="2" rx="1"/>
                </svg>
              </button>
            )}
            <Link
              href={`/review/theme/${node.id}`}
              onClick={e => e.stopPropagation()}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-[#4338CA] rounded text-xs"
              title="Réviser ce thème"
            >
              ▶
            </Link>
            <button
              onClick={() => onCreateChild(node.id)}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-white rounded text-base leading-none"
              title="Nouveau sous-thème"
            >
              +
            </button>
            <button
              onClick={() => onDeleteThemeStart(node.id)}
              className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-400 rounded text-xs"
              title="Supprimer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Inline delete confirmation */}
        {isDeleting && (
          <div className="flex items-center gap-2 mx-1 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs mt-0.5">
            <span className="text-red-300 flex-1 truncate">Supprimer &ldquo;{node.name}&rdquo; ?</span>
            <button
              onClick={onDeleteThemeCancel}
              className="text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/5 flex-shrink-0"
            >
              Non
            </button>
            <button
              onClick={() => onDeleteThemeConfirm(node.id)}
              className="text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded flex-shrink-0"
            >
              Oui
            </button>
          </div>
        )}
      </div>

      {/* Children (when expanded) */}
      {!isCollapsed && (
        <>
          {/* Direct deck rows — own SortableContext, no conflict with parent */}
          {directDecks.length > 0 && (
            <SortableContext items={directDeckIds} strategy={verticalListSortingStrategy}>
              {directDecks.map(deck => (
                <DeckRow key={deck.id} deck={deck} depth={node.depth + 1} />
              ))}
            </SortableContext>
          )}

          {/* Add deck inline */}
          {creatingDeck ? (
            <InlineDeckCreator
              themeId={node.id}
              pl={INDENT * (node.depth + 1) + 24}
              onDone={() => setCreatingDeck(false)}
            />
          ) : (
            <div style={{ paddingLeft: INDENT * (node.depth + 1) + 24 }}>
              <button
                onClick={() => setCreatingDeck(true)}
                className="flex items-center gap-1 text-xs text-gray-700 hover:text-[#4338CA] py-0.5 transition-colors"
              >
                + Ajouter un deck
              </button>
            </div>
          )}

          {/* Child theme nodes — own SortableContext */}
          {node.children.length > 0 && (
            <SortableContext items={childThemeIds} strategy={verticalListSortingStrategy}>
              {node.children.map(child => (
                <ThemeNode key={child.id} node={child} />
              ))}
            </SortableContext>
          )}
        </>
      )}
    </>
  )
}

// ── TreeLibrary ───────────────────────────────────────────────────────────────

export default function TreeLibrary({ initialThemes, initialDecks, userId }: TreeLibraryProps) {
  const router = useRouter()
  const supabase = createClient()

  const [themes, setThemes] = useState(initialThemes)
  const [decks, setDecks] = useState(initialDecks)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deletingThemeId, setDeletingThemeId] = useState<string | null>(null)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [activeDeck, setActiveDeck] = useState<DeckWithMeta | null>(null)
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null)

  const [optionsDeck, setOptionsDeck] = useState<DeckWithMeta | null>(null)
  const [optionsAnchor, setOptionsAnchor] = useState<MenuAnchor | null>(null)
  const [movingDeck, setMovingDeck] = useState<DeckWithMeta | null>(null)
  const [deletingDeck, setDeletingDeck] = useState<DeckWithMeta | null>(null)

  // Card expansion state
  const [expandedDecks, setExpandedDecks] = useState<Set<string>>(new Set())
  const [deckCards, setDeckCards] = useState<Map<string, CardItem[]>>(new Map())
  const [loadingDecks, setLoadingDecks] = useState<Set<string>>(new Set())

  const [creatingNoThemeDeck, setCreatingNoThemeDeck] = useState(false)

  const tree = useMemo(() => buildTree(themes), [themes])
  const themesById = useMemo(() => new Map(themes.map(t => [t.id, t])), [themes])

  const filteredDecks = search
    ? decks.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : decks

  const decksMap = useMemo(() => {
    const themeIds = new Set(themes.map(t => t.id))
    const map = new Map<string | null, DeckWithMeta[]>()
    map.set(null, [])
    themes.forEach(t => map.set(t.id, []))
    filteredDecks.forEach(d => {
      const key = (d.theme_id && themeIds.has(d.theme_id)) ? d.theme_id : null
      map.get(key)!.push(d)
    })
    return map
  }, [filteredDecks, themes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Theme actions ──────────────────────────────────────────────────────────

  const onToggle = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onEditStart = useCallback((id: string, name: string) => {
    setEditingId(id)
    setEditValue(name)
  }, [])

  const onEditChange = useCallback((v: string) => setEditValue(v), [])

  const onEditCommit = useCallback((id: string) => {
    const name = editValue.trim() || 'Sans titre'
    setEditingId(null)
    setEditValue('')
    setThemes(prev => prev.map(t => t.id === id ? { ...t, name } : t))
    supabase.from('themes').update({ name }).eq('id', id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ error }: any) => { if (error) console.error('theme rename error:', error) })
  }, [editValue, supabase])

  const onEditCancel = useCallback(() => {
    setEditingId(null)
    setEditValue('')
  }, [])

  const onCreateChild = useCallback(async (parentId: string) => {
    const parent = themes.find(t => t.id === parentId)
    const siblingCount = themes.filter(t => t.parent_id === parentId).length
    const { data, error } = await supabase.from('themes').insert({
      user_id: userId,
      name: 'Sans titre',
      color: parent?.color || '#4338CA',
      position: siblingCount,
      parent_id: parentId,
    }).select().single()
    if (error) { console.error('create sub-theme error:', error); return }
    if (data) {
      setThemes(prev => [...prev, data as Theme])
      setCollapsed(prev => { const next = new Set(prev); next.delete(parentId); return next })
      setEditingId(data.id)
      setEditValue('Sans titre')
    }
  }, [themes, userId, supabase])

  const onDeleteThemeStart = useCallback((id: string) => setDeletingThemeId(id), [])
  const onDeleteThemeCancel = useCallback(() => setDeletingThemeId(null), [])

  const onDeleteThemeConfirm = useCallback((id: string) => {
    setDeletingThemeId(null)
    const toDelete = new Set<string>()
    const queue = [id]
    while (queue.length) {
      const curr = queue.pop()!
      toDelete.add(curr)
      themes.filter(t => t.parent_id === curr).forEach(t => queue.push(t.id))
    }
    setThemes(prev => prev.filter(t => !toDelete.has(t.id)))
    supabase.from('themes').delete().eq('id', id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ error }: any) => { if (error) console.error('delete theme error:', error) })
  }, [themes, supabase])

  const onColorToggle = useCallback((id: string | null) => setColorPickerId(id), [])

  const onColorChange = useCallback((id: string, color: string) => {
    setThemes(prev => prev.map(t => t.id === id ? { ...t, color } : t))
    setColorPickerId(null)
    supabase.from('themes').update({ color }).eq('id', id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ error }: any) => { if (error) console.error('color change error:', error) })
  }, [supabase])

  const onDeckOptions = useCallback((deck: DeckWithMeta, btn: HTMLButtonElement) => {
    setOptionsDeck(deck)
    setOptionsAnchor({ rect: btn.getBoundingClientRect(), mobile: window.innerWidth < 640 })
  }, [])

  // ── Card expansion actions ─────────────────────────────────────────────────

  const loadDeckCards = useCallback(async (deckId: string) => {
    setLoadingDecks(prev => { const next = new Set(prev); next.add(deckId); return next })
    const { data } = await supabase
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: CardItem[] = (data || []).filter((c: any) => !c.archived).map((c: any) => ({
      id: c.id, question: c.question, answer: c.answer,
    }))
    setDeckCards(prev => new Map(prev).set(deckId, items))
    setLoadingDecks(prev => { const next = new Set(prev); next.delete(deckId); return next })
  }, [supabase])

  const onToggleDeck = useCallback((deckId: string) => {
    const isExpanded = expandedDecks.has(deckId)
    setExpandedDecks(prev => {
      const next = new Set(prev)
      if (isExpanded) next.delete(deckId)
      else next.add(deckId)
      return next
    })
    if (!isExpanded && !deckCards.has(deckId)) {
      loadDeckCards(deckId)
    }
  }, [expandedDecks, deckCards, loadDeckCards])

  const onAddCard = useCallback(async (deckId: string, q: string, a: string) => {
    const { data: card } = await supabase
      .from('cards')
      .insert({ deck_id: deckId, question: q, answer: a, difficulty: 1, created_by_ai: false, user_edited: false })
      .select('id')
      .single()
    if (!card) return
    await supabase.from('card_reviews').insert({
      card_id: card.id, user_id: userId, state: 'new',
      scheduled_at: new Date().toISOString(),
    })
    setDeckCards(prev => {
      const existing = prev.get(deckId) || []
      return new Map(prev).set(deckId, [{ id: card.id, question: q, answer: a }, ...existing])
    })
    setDecks(prev => prev.map(d => d.id === deckId ? { ...d, card_count: d.card_count + 1 } : d))
  }, [supabase, userId])

  const onEditCard = useCallback(async (cardId: string, deckId: string, q: string, a: string) => {
    setDeckCards(prev => {
      const cards = prev.get(deckId) || []
      return new Map(prev).set(deckId, cards.map(c => c.id === cardId ? { ...c, question: q, answer: a } : c))
    })
    await supabase.from('cards').update({ question: q, answer: a, user_edited: true }).eq('id', cardId)
  }, [supabase])

  const onDeleteCard = useCallback(async (cardId: string, deckId: string) => {
    setDeckCards(prev => {
      const cards = prev.get(deckId) || []
      return new Map(prev).set(deckId, cards.filter(c => c.id !== cardId))
    })
    setDecks(prev => prev.map(d => d.id === deckId ? { ...d, card_count: Math.max(0, d.card_count - 1) } : d))
    await supabase.from('card_reviews').delete().eq('card_id', cardId)
    await supabase.from('cards').delete().eq('id', cardId)
  }, [supabase])

  const onCreateDeck = useCallback(async (name: string, icon: string, themeId: string | null) => {
    const { data, error } = await supabase.from('decks').insert({
      name, icon, color: '#4338CA', user_id: userId, theme_id: themeId,
    }).select().single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error || !data) { console.error('create deck error:', error); return }
    setDecks(prev => [...prev, { ...(data as Deck), card_count: 0, due_count: 0 } as DeckWithMeta])
  }, [supabase, userId])

  const onMoveCard = useCallback(async (cardId: string, fromDeckId: string, toDeckId: string) => {
    const card = deckCards.get(fromDeckId)?.find(c => c.id === cardId)
    setDeckCards(prev => {
      const next = new Map(prev)
      next.set(fromDeckId, (prev.get(fromDeckId) || []).filter(c => c.id !== cardId))
      if (card && prev.has(toDeckId)) {
        next.set(toDeckId, [card, ...(prev.get(toDeckId) || [])])
      }
      return next
    })
    setDecks(prev => prev.map(d => {
      if (d.id === fromDeckId) return { ...d, card_count: Math.max(0, d.card_count - 1) }
      if (d.id === toDeckId) return { ...d, card_count: d.card_count + 1 }
      return d
    }))
    await supabase.from('cards').update({ deck_id: toDeckId }).eq('id', cardId)
  }, [supabase, deckCards])

  const onToggleAllDecksInTheme = useCallback((node: TreeNode) => {
    const allIds = getDeckIdsInSubtree(node, decksMap)
    if (allIds.length === 0) return
    const allExpanded = allIds.every(id => expandedDecks.has(id))
    setExpandedDecks(prev => {
      const next = new Set(prev)
      if (allExpanded) allIds.forEach(id => next.delete(id))
      else allIds.forEach(id => next.add(id))
      return next
    })
    if (!allExpanded) {
      allIds.forEach(id => { if (!deckCards.has(id)) loadDeckCards(id) })
    }
  }, [decksMap, expandedDecks, deckCards, loadDeckCards])

  // ── Create root theme ──────────────────────────────────────────────────────

  const handleCreateRootTheme = async () => {
    const rootCount = themes.filter(t => !t.parent_id).length
    const { data, error } = await supabase.from('themes').insert({
      user_id: userId,
      name: 'Sans titre',
      color: '#4338CA',
      position: rootCount,
    }).select().single()
    if (error) { console.error('create theme error:', error); return }
    if (data) {
      setThemes(prev => [...prev, data as Theme])
      setEditingId(data.id)
      setEditValue('Sans titre')
    }
  }

  // ── DnD ────────────────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string
    if (id.startsWith('theme:')) {
      setActiveTheme(themes.find(t => t.id === id.slice(6)) ?? null)
    } else {
      setActiveDeck(decks.find(d => d.id === id.slice(5)) ?? null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDeck(null)
    setActiveTheme(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string
    const isActiveTheme = activeId.startsWith('theme:')
    const isOverTheme = overId.startsWith('theme:')
    const activeRawId = activeId.slice(isActiveTheme ? 6 : 5)
    const overRawId = overId.slice(isOverTheme ? 6 : 5)

    const activeParentId = (active.data.current?.parentId ?? null) as string | null
    const overParentId = (over.data.current?.parentId ?? null) as string | null

    // ── Theme drag ───────────────────────────────────────────────────────────
    if (isActiveTheme) {
      if (!isOverTheme) return
      if (isAncestor(themes, activeRawId, overRawId)) return

      if (activeParentId === overParentId) {
        const siblings = themes
          .filter(t => (t.parent_id || null) === activeParentId)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        const oldIdx = siblings.findIndex(t => t.id === activeRawId)
        const newIdx = siblings.findIndex(t => t.id === overRawId)
        if (oldIdx === -1 || newIdx === -1) return
        const reordered = arrayMove(siblings, oldIdx, newIdx)
        setThemes(prev => {
          const others = prev.filter(t => (t.parent_id || null) !== activeParentId)
          return [...others, ...reordered.map((t, i) => ({ ...t, position: i }))]
        })
        await Promise.all(reordered.map((t, i) =>
          supabase.from('themes').update({ position: i }).eq('id', t.id)
        ))
      } else {
        const targetParentId = overParentId
        const targetSiblings = themes
          .filter(t => (t.parent_id || null) === targetParentId && t.id !== activeRawId)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        const overIdx = targetSiblings.findIndex(t => t.id === overRawId)
        const newPosition = overIdx === -1 ? targetSiblings.length : overIdx
        setThemes(prev => prev.map(t =>
          t.id === activeRawId ? { ...t, parent_id: targetParentId, position: newPosition } : t
        ))
        await supabase.from('themes').update({ parent_id: targetParentId, position: newPosition }).eq('id', activeRawId)
      }
      return
    }

    // ── Deck drag ─────────────────────────────────────────────────────────────
    if (isOverTheme) {
      setDecks(prev => prev.map(d => d.id === activeRawId ? { ...d, theme_id: overRawId } : d))
      await supabase.from('decks').update({ theme_id: overRawId }).eq('id', activeRawId)
      return
    }

    if (activeParentId === overParentId) {
      const group = decks.filter(d => (d.theme_id || null) === activeParentId)
      const oldIdx = group.findIndex(d => d.id === activeRawId)
      const newIdx = group.findIndex(d => d.id === overRawId)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(group, oldIdx, newIdx)
      setDecks(prev => [
        ...prev.filter(d => (d.theme_id || null) !== activeParentId),
        ...reordered,
      ])
      await Promise.all(reordered.map((d, i) =>
        supabase.from('decks').update({ position: i }).eq('id', d.id)
      ))
    } else {
      const newThemeId = overParentId
      setDecks(prev => prev.map(d => d.id === activeRawId ? { ...d, theme_id: newThemeId } : d))
      await supabase.from('decks').update({ theme_id: newThemeId }).eq('id', activeRawId)
    }
  }

  // ── Deck actions ───────────────────────────────────────────────────────────

  const handleDeleteDeck = async (deck: DeckWithMeta) => {
    setDecks(prev => prev.filter(d => d.id !== deck.id))
    setDeletingDeck(null)
    setOptionsDeck(null)
    setOptionsAnchor(null)
    await supabase.from('decks').delete().eq('id', deck.id)
  }

  const handleMoveDeck = async (deck: DeckWithMeta, themeId: string | null) => {
    setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, theme_id: themeId } : d))
    setMovingDeck(null)
    setOptionsDeck(null)
    setOptionsAnchor(null)
    await supabase.from('decks').update({ theme_id: themeId }).eq('id', deck.id)
  }

  // ── Context value ──────────────────────────────────────────────────────────

  const ctxValue: Ctx = {
    decksMap, collapsed, editingId, editValue, deletingThemeId, colorPickerId,
    onToggle, onEditStart, onEditChange, onEditCommit, onEditCancel,
    onCreateChild, onDeleteThemeStart, onDeleteThemeCancel, onDeleteThemeConfirm,
    onColorToggle, onColorChange, onDeckOptions,
    userId, expandedDecks, deckCards, loadingDecks,
    onToggleDeck, onAddCard, onEditCard, onDeleteCard, onMoveCard, onToggleAllDecksInTheme,
    onCreateDeck, allDecks: decks, themesById,
  }

  const unthemedDecks = decksMap.get(null) || []
  const unthemedIds = unthemedDecks.map(d => `deck:${d.id}`)
  const rootThemeIds = tree.map(n => `theme:${n.id}`)
  const themeFlatList = useMemo(() => flattenTree(tree), [tree])

  return (
    <LibCtx.Provider value={ctxValue}>
      <div className="min-h-screen bg-[#0F172A] text-white pb-20">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-b border-[#334155] px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold flex-1">Ma bibliothèque</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateRootTheme}
                className="text-gray-500 hover:text-white border border-[#334155] hover:border-[#818CF8]/50 rounded-xl px-3 h-9 text-sm transition-colors"
                title="Nouveau thème"
              >
                + Thème
              </button>
              <Link
                href="/create"
                className="bg-[#4338CA] hover:bg-[#3730A3] rounded-xl w-9 h-9 flex items-center justify-center font-bold text-xl transition-colors"
                title="Nouveau deck"
              >
                +
              </Link>
            </div>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher un deck…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#1E293B] border border-[#334155] rounded-xl py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-[#4338CA]/60 placeholder-gray-600"
            />
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-2 py-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Root themes */}
            {tree.length > 0 && (
              <SortableContext items={rootThemeIds} strategy={verticalListSortingStrategy}>
                {tree.map(node => <ThemeNode key={node.id} node={node} />)}
              </SortableContext>
            )}

            {/* Empty state */}
            {tree.length === 0 && unthemedDecks.length === 0 && !search && (
              <div className="text-center py-16 text-gray-600">
                <p className="text-4xl mb-4">📚</p>
                <p className="text-sm">Aucun deck pour l&apos;instant.</p>
                <Link href="/create" className="inline-block mt-4 text-[#4338CA] hover:text-[#7B73D4] text-sm">
                  Créer mon premier deck →
                </Link>
              </div>
            )}

            {/* Unthemed decks */}
            {unthemedDecks.length > 0 && (
              <div className={tree.length > 0 ? 'mt-4 pt-3 border-t border-[#1E293B]' : ''}>
                {tree.length > 0 && (
                  <p className="text-xs text-gray-600 px-6 mb-1">Sans thème</p>
                )}
                <SortableContext items={unthemedIds} strategy={verticalListSortingStrategy}>
                  {unthemedDecks.map(deck => (
                    <DeckRow key={deck.id} deck={deck} depth={0} />
                  ))}
                </SortableContext>
                {creatingNoThemeDeck ? (
                  <InlineDeckCreator themeId={null} pl={24} onDone={() => setCreatingNoThemeDeck(false)} />
                ) : (
                  <div style={{ paddingLeft: 24 }}>
                    <button
                      onClick={() => setCreatingNoThemeDeck(true)}
                      className="flex items-center gap-1 text-xs text-gray-700 hover:text-[#4338CA] py-0.5 transition-colors"
                    >
                      + Ajouter un deck
                    </button>
                  </div>
                )}
              </div>
            )}

            <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
              {activeDeck && (
                <div className="bg-[#1E293B] rounded-xl px-3 py-2 border border-[#4338CA]/60 shadow-2xl opacity-90 flex items-center gap-2 cursor-grabbing">
                  <span>{activeDeck.icon || '📚'}</span>
                  <span className="text-sm font-medium">{activeDeck.name}</span>
                </div>
              )}
              {activeTheme && (
                <div className="bg-[#1E293B] rounded-xl px-3 py-2 border border-[#4338CA]/60 shadow-2xl opacity-90 flex items-center gap-2 cursor-grabbing">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: activeTheme.color }} />
                  <span className="text-sm font-semibold">{activeTheme.name}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </main>

        {/* ── Deck options ──────────────────────────────────────────────────── */}
        {optionsDeck && !movingDeck && !deletingDeck && optionsAnchor && (
          optionsAnchor.mobile ? (
            <div
              className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => { setOptionsDeck(null); setOptionsAnchor(null) }}
            >
              <div
                className="bg-[#1E293B] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#334155] pb-20"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[#334155] mb-1">
                  <span className="text-2xl">{optionsDeck.icon || '📚'}</span>
                  <span className="font-semibold truncate">{optionsDeck.name}</span>
                </div>
                {[
                  { label: '⚡ Réviser maintenant', action: () => { router.push(`/review/${optionsDeck.id}`); setOptionsDeck(null); setOptionsAnchor(null) } },
                  { label: '➕ Ajouter des cartes', action: () => { router.push(`/create?deckId=${optionsDeck.id}`); setOptionsDeck(null); setOptionsAnchor(null) } },
                  { label: '🗂️ Déplacer vers un thème', action: () => setMovingDeck(optionsDeck) },
                ].map(({ label, action }) => (
                  <button key={label} onClick={action} className="w-full text-left px-4 py-3 hover:bg-[#312E81]/20 rounded-xl text-sm">
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setDeletingDeck(optionsDeck)}
                  className="w-full text-left px-4 py-3 hover:bg-red-500/10 rounded-xl text-sm text-red-400 mb-2"
                >
                  🗑️ Supprimer le deck
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="fixed inset-0 z-[55]"
                onClick={() => { setOptionsDeck(null); setOptionsAnchor(null) }}
              />
              <div
                className="fixed z-[60] bg-[#1E293B] rounded-xl shadow-2xl border border-[#334155] w-56 overflow-hidden"
                style={dropdownStyle(optionsAnchor.rect)}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#334155]">
                  <span className="text-lg">{optionsDeck.icon || '📚'}</span>
                  <span className="font-medium text-sm truncate">{optionsDeck.name}</span>
                </div>
                {[
                  { label: '⚡ Réviser maintenant', action: () => { router.push(`/review/${optionsDeck.id}`); setOptionsDeck(null); setOptionsAnchor(null) } },
                  { label: '➕ Ajouter des cartes', action: () => { router.push(`/create?deckId=${optionsDeck.id}`); setOptionsDeck(null); setOptionsAnchor(null) } },
                  { label: '🗂️ Déplacer vers un thème', action: () => setMovingDeck(optionsDeck) },
                ].map(({ label, action }) => (
                  <button key={label} onClick={action} className="w-full text-left px-3 py-2.5 hover:bg-[#312E81]/20 text-sm transition-colors">
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setDeletingDeck(optionsDeck)}
                  className="w-full text-left px-3 py-2.5 hover:bg-red-500/10 text-sm text-red-400 transition-colors"
                >
                  🗑️ Supprimer le deck
                </button>
              </div>
            </>
          )
        )}

        {/* ── Move deck sheet ────────────────────────────────────────────── */}
        {movingDeck && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setMovingDeck(null)}
          >
            <div
              className="bg-[#1E293B] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#334155] max-h-[70vh] overflow-y-auto pb-20"
              onClick={e => e.stopPropagation()}
            >
              <p className="px-4 py-3 text-sm font-semibold text-gray-400 border-b border-[#1E293B] mb-1 sticky top-0 bg-[#1E293B]">
                Déplacer vers…
              </p>
              <button
                onClick={() => handleMoveDeck(movingDeck, null)}
                className="w-full text-left px-4 py-2.5 hover:bg-[#312E81]/20 rounded-xl text-sm text-gray-400"
              >
                Sans thème
              </button>
              {themeFlatList.map(({ theme, depth }) => (
                <button
                  key={theme.id}
                  onClick={() => handleMoveDeck(movingDeck, theme.id)}
                  className="w-full text-left py-2.5 hover:bg-[#312E81]/20 rounded-xl text-sm flex items-center gap-2"
                  style={{ paddingLeft: depth * 12 + 16 }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: theme.color }} />
                  {depth > 0 && <span className="text-gray-600 text-xs">└</span>}
                  {theme.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Delete deck confirmation ───────────────────────────────────── */}
        {deletingDeck && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1E293B] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-red-500/30">
              <h2 className="text-lg font-bold mb-2">Supprimer &ldquo;{deletingDeck.name}&rdquo; ?</h2>
              <p className="text-gray-400 text-sm mb-5">
                Supprime aussi les {deletingDeck.card_count} {pluralCard(deletingDeck.card_count)}. Irréversible.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setDeletingDeck(null); setOptionsDeck(null); setOptionsAnchor(null) }}
                  className="flex-1 border border-[#334155] rounded-xl py-2.5 text-sm hover:bg-[#312E81]/20"
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDeleteDeck(deletingDeck)}
                  className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl py-2.5 text-sm font-semibold transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LibCtx.Provider>
  )
}
