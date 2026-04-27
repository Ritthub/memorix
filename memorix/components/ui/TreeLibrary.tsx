'use client'

import {
  useState, useCallback, useRef, useEffect,
  createContext, useContext, useMemo,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Theme, Deck } from '@/types'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ────────────────────────────────────────────────────────────────────

type DeckWithMeta = Deck & { card_count: number; due_count: number }
type TreeNode = Theme & { children: TreeNode[]; depth: number }

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
  onDeckOptions: (deck: DeckWithMeta) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#4338CA', '#0D9488', '#E85D4A', '#F59E0B', '#3B82F6', '#22C55E', '#EC4899']
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
      const parent = map.get(t.parent_id)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
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

// ── DeckRow ───────────────────────────────────────────────────────────────────

function DeckRow({ deck, depth }: { deck: DeckWithMeta; depth: number }) {
  const { onDeckOptions } = useLib()
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: `deck:${deck.id}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    paddingLeft: INDENT * depth + 24,
  }

  return (
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
        <span className="text-xs text-gray-600 flex-shrink-0">{deck.card_count}c</span>
      </Link>
      {deck.due_count > 0 && (
        <span className="bg-[#4338CA] text-white text-xs font-bold rounded-full px-1.5 py-0.5 tabular-nums flex-shrink-0">
          {deck.due_count}
        </span>
      )}
      <button
        onClick={() => onDeckOptions(deck)}
        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-gray-400 transition-opacity p-1 flex-shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
    </div>
  )
}

// ── ThemeNode (recursive) ─────────────────────────────────────────────────────

function ThemeNode({ node }: { node: TreeNode }) {
  const {
    decksMap, collapsed, editingId, editValue, deletingThemeId, colorPickerId,
    onToggle, onEditStart, onEditChange, onEditCommit, onEditCancel,
    onCreateChild, onDeleteThemeStart, onDeleteThemeCancel, onDeleteThemeConfirm,
    onColorToggle, onColorChange,
  } = useLib()

  const isCollapsed = collapsed.has(node.id)
  const isEditing = editingId === node.id
  const isDeleting = deletingThemeId === node.id
  const showColorPicker = colorPickerId === node.id

  const directDecks = decksMap.get(node.id) || []
  const due = subtreeDue(node, decksMap)
  const allDeckIds = directDecks.map(d => `deck:${d.id}`)
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
      <div style={{ paddingLeft: pl }} className="group relative">
        <div className="flex items-center gap-1 py-0.5 pr-2 rounded-lg hover:bg-white/5 transition-colors">
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
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0">
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
          {/* Direct deck rows */}
          <SortableContext items={allDeckIds} strategy={verticalListSortingStrategy}>
            {directDecks.map(deck => (
              <DeckRow key={deck.id} deck={deck} depth={node.depth + 1} />
            ))}
          </SortableContext>

          {/* Add deck link */}
          <div style={{ paddingLeft: INDENT * (node.depth + 1) + 24 }}>
            <Link
              href={`/create?themeId=${node.id}`}
              className="flex items-center gap-1 text-xs text-gray-700 hover:text-[#4338CA] py-0.5 transition-colors"
            >
              + Ajouter un deck
            </Link>
          </div>

          {/* Child theme nodes */}
          {node.children.map(child => (
            <ThemeNode key={child.id} node={child} />
          ))}
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

  // Deck-level actions
  const [optionsDeck, setOptionsDeck] = useState<DeckWithMeta | null>(null)
  const [movingDeck, setMovingDeck] = useState<DeckWithMeta | null>(null)
  const [deletingDeck, setDeletingDeck] = useState<DeckWithMeta | null>(null)

  const tree = useMemo(() => buildTree(themes), [themes])

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

  const allDeckSortableIds = useMemo(
    () => filteredDecks.map(d => `deck:${d.id}`),
    [filteredDecks]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
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
    if (error) {
      console.error('create sub-theme error:', error)
      return
    }
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
    // Remove theme + all descendants
    const toDelete = new Set<string>()
    const queue = [id]
    const allThemes = themes
    while (queue.length) {
      const curr = queue.pop()!
      toDelete.add(curr)
      allThemes.filter(t => t.parent_id === curr).forEach(t => queue.push(t.id))
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

  const onDeckOptions = useCallback((deck: DeckWithMeta) => setOptionsDeck(deck), [])

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

  // ── Deck DnD ───────────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const id = (event.active.id as string).replace('deck:', '')
    setActiveDeck(decks.find(d => d.id === id) ?? null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeck(null)
    if (!over || active.id === over.id) return

    const activeId = (active.id as string).replace('deck:', '')
    const overId = (over.id as string).replace('deck:', '')
    const activeDeckObj = decks.find(d => d.id === activeId)
    const overDeckObj = decks.find(d => d.id === overId)
    if (!activeDeckObj || !overDeckObj) return

    const activeTheme = activeDeckObj.theme_id || null
    const overTheme = overDeckObj.theme_id || null

    if (activeTheme !== overTheme) {
      // Cross-theme move
      setDecks(prev => prev.map(d => d.id === activeId ? { ...d, theme_id: overTheme } : d))
      await supabase.from('decks').update({ theme_id: overTheme }).eq('id', activeId)
      return
    }

    // Same-theme reorder
    const group = decks.filter(d => (d.theme_id || null) === activeTheme)
    const oldIdx = group.findIndex(d => d.id === activeId)
    const newIdx = group.findIndex(d => d.id === overId)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(group, oldIdx, newIdx)
    setDecks(prev => [
      ...prev.filter(d => (d.theme_id || null) !== activeTheme),
      ...reordered,
    ])
    await Promise.all(reordered.map((d, i) =>
      supabase.from('decks').update({ position: i }).eq('id', d.id)
    ))
  }

  // ── Deck actions ───────────────────────────────────────────────────────────

  const handleDeleteDeck = async (deck: DeckWithMeta) => {
    setDecks(prev => prev.filter(d => d.id !== deck.id))
    setDeletingDeck(null)
    setOptionsDeck(null)
    await supabase.from('decks').delete().eq('id', deck.id)
  }

  const handleMoveDeck = async (deck: DeckWithMeta, themeId: string | null) => {
    setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, theme_id: themeId } : d))
    setMovingDeck(null)
    setOptionsDeck(null)
    await supabase.from('decks').update({ theme_id: themeId }).eq('id', deck.id)
  }

  // ── Context value ──────────────────────────────────────────────────────────

  const ctxValue: Ctx = {
    decksMap, collapsed, editingId, editValue, deletingThemeId, colorPickerId,
    onToggle, onEditStart, onEditChange, onEditCommit, onEditCancel,
    onCreateChild, onDeleteThemeStart, onDeleteThemeCancel, onDeleteThemeConfirm,
    onColorToggle, onColorChange, onDeckOptions,
  }

  const unthemedDecks = decksMap.get(null) || []
  const unthemedIds = unthemedDecks.map(d => `deck:${d.id}`)
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
            <SortableContext items={allDeckSortableIds} strategy={verticalListSortingStrategy}>
              {/* Theme tree */}
              {tree.map(node => <ThemeNode key={node.id} node={node} />)}

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
                  <div style={{ paddingLeft: 24 }}>
                    <Link href="/create" className="flex items-center gap-1 text-xs text-gray-700 hover:text-[#4338CA] py-0.5 transition-colors">
                      + Ajouter un deck
                    </Link>
                  </div>
                </div>
              )}
            </SortableContext>

            <DragOverlay>
              {activeDeck && (
                <div className="bg-[#1E293B] rounded-xl px-3 py-2 border border-[#4338CA]/60 shadow-xl opacity-90 flex items-center gap-2">
                  <span>{activeDeck.icon || '📚'}</span>
                  <span className="text-sm font-medium">{activeDeck.name}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </main>

        {/* ── Deck options sheet ─────────────────────────────────────────── */}
        {optionsDeck && !movingDeck && !deletingDeck && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setOptionsDeck(null)}
          >
            <div
              className="bg-[#1E293B] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#334155]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1E293B] mb-1">
                <span className="text-2xl">{optionsDeck.icon || '📚'}</span>
                <span className="font-semibold truncate">{optionsDeck.name}</span>
              </div>
              {[
                { label: '⚡ Réviser maintenant', action: () => { router.push(`/review/${optionsDeck.id}`); setOptionsDeck(null) } },
                { label: '➕ Ajouter des cartes', action: () => { router.push(`/create?deckId=${optionsDeck.id}`); setOptionsDeck(null) } },
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
        )}

        {/* ── Move deck sheet ────────────────────────────────────────────── */}
        {movingDeck && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setMovingDeck(null)}
          >
            <div
              className="bg-[#1E293B] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#334155] max-h-[70vh] overflow-y-auto"
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
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1E293B] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-red-500/30">
              <h2 className="text-lg font-bold mb-2">Supprimer &ldquo;{deletingDeck.name}&rdquo; ?</h2>
              <p className="text-gray-400 text-sm mb-5">
                Supprime aussi les {deletingDeck.card_count} carte{deletingDeck.card_count !== 1 ? 's' : ''}. Irréversible.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setDeletingDeck(null); setOptionsDeck(null) }}
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
