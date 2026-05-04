'use client'

import {
  useState, useCallback, useRef, useEffect,
  createContext, useContext, useMemo,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Theme } from '@/types'
import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter, useDraggable,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Types ────────────────────────────────────────────────────────────────────

type TreeNode = Theme & { children: TreeNode[]; depth: number }
type CardItem = { id: string; question: string; answer: string; explanation?: string | null }

export interface TreeLibraryProps {
  initialThemes: Theme[]
  userId: string
}

interface Ctx {
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
  userId: string
  themeCards: Map<string, CardItem[]>
  loadingThemes: Set<string>
  expandedThemes: Set<string>
  onToggleTheme: (id: string) => void
  onAddThemeCard: (themeId: string, q: string, a: string, expl?: string) => Promise<void>
  onEditThemeCard: (cardId: string, themeId: string, q: string, a: string, expl?: string) => Promise<void>
  onDeleteThemeCard: (cardId: string, themeId: string) => Promise<void>
  onMoveCard: (cardId: string, fromThemeId: string, toThemeId: string) => Promise<void>
  loadThemeCards: (themeId: string) => Promise<void>
  themesById: Map<string, Theme>
  draggingCard: (CardItem & { fromThemeId: string }) | null
  hoveredDropThemeId: string | null
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

function isAncestor(themes: Theme[], ancestorId: string, descendantId: string): boolean {
  let current = themes.find(t => t.id === descendantId)
  while (current?.parent_id) {
    if (current.parent_id === ancestorId) return true
    current = themes.find(t => t.id === current!.parent_id!)
  }
  return false
}

function getThemeDepth(themeId: string | null, themesMap: Map<string, Theme>): number {
  let depth = 0
  let current = themeId ? themesMap.get(themeId) : undefined
  while (current?.parent_id) {
    depth++
    current = themesMap.get(current.parent_id)
  }
  return depth
}

// ── DraggableCardRow ──────────────────────────────────────────────────────────

function DraggableCardRow({ card, themeId, pl }: { card: CardItem; themeId: string; pl: number }) {
  const { onDeleteThemeCard } = useLib()
  const router = useRouter()

  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `card:${card.id}`,
    data: { cardId: card.id, fromThemeId: themeId },
  })

  const [isDeleting, setIsDeleting] = useState(false)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current) }
  }, [])

  function startDelete() {
    setIsDeleting(true)
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    deleteTimerRef.current = setTimeout(() => setIsDeleting(false), 4000)
  }

  async function confirmDelete() {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setIsDeleting(false)
    await onDeleteThemeCard(card.id, themeId)
  }

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.25 : 1 }}>
      {/* Listeners on the row itself → drag from anywhere; distance:8 prevents accidental drags */}
      <div
        {...listeners}
        onClick={() => router.push(`/cards/${card.id}`)}
        className="flex flex-col py-0.5 pr-2 group/card rounded hover:bg-[var(--bg-elevated)]/20 transition-colors cursor-pointer select-none"
        style={{ paddingLeft: pl }}
      >
        <div className="flex items-center gap-1.5">
          {/* 6-dot grip */}
          <svg
            width="6" height="10" viewBox="0 0 6 10" fill="currentColor"
            className="flex-shrink-0 text-[var(--text-hint)] opacity-25 group-hover/card:opacity-70 transition-opacity pointer-events-none"
          >
            <circle cx="1.5" cy="1.5" r="1"/><circle cx="4.5" cy="1.5" r="1"/>
            <circle cx="1.5" cy="5" r="1"/>  <circle cx="4.5" cy="5" r="1"/>
            <circle cx="1.5" cy="8.5" r="1"/><circle cx="4.5" cy="8.5" r="1"/>
          </svg>
          <span className="text-xs text-[var(--text-secondary)] truncate" style={{ maxWidth: '50%' }} title={card.question}>
            {card.question}
          </span>
          <span className="text-xs text-[var(--text-hint)] flex-shrink-0">·</span>
          <span className="text-xs text-[var(--text-muted)] truncate" style={{ maxWidth: '35%' }} title={card.answer}>
            {card.answer}
          </span>
          <div className="ml-auto flex items-center gap-0 opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0">
            <button
              onClick={e => { e.stopPropagation(); router.push(`/cards/${card.id}`) }}
              onPointerDown={e => e.stopPropagation()}
              className="w-5 h-5 flex items-center justify-center text-[var(--text-hint)] hover:text-[var(--accent-light)] rounded text-xs transition-colors cursor-pointer" title="Voir le détail">
              ✏
            </button>
            <button
              onClick={e => { e.stopPropagation(); startDelete() }}
              onPointerDown={e => e.stopPropagation()}
              className="w-5 h-5 flex items-center justify-center text-[var(--text-hint)] hover:text-red-400 rounded text-xs transition-colors cursor-pointer" title="Supprimer">
              ✕
            </button>
          </div>
        </div>
        {card.explanation && (
          <p className="text-[10px] text-[var(--text-hint)] italic truncate pl-3.5 -mt-0.5" title={card.explanation}>
            {card.explanation}
          </p>
        )}
      </div>

      {isDeleting && (
        <div className="flex items-center gap-2 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-xs mt-0.5 mr-2" style={{ marginLeft: pl }}>
          <span className="text-red-300 flex-1 truncate">Supprimer cette carte ?</span>
          <button onClick={() => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); setIsDeleting(false) }}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-elevated)]/20 flex-shrink-0">
            Annuler
          </button>
          <button onClick={confirmDelete}
            className="text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded flex-shrink-0">
            Confirmer
          </button>
        </div>
      )}
    </div>
  )
}

// ── ThemeCardsList ────────────────────────────────────────────────────────────

function ThemeCardsList({ themeId, depth, isLeaf = true }: { themeId: string; depth: number; isLeaf?: boolean }) {
  const { themeCards, loadingThemes, onAddThemeCard, loadThemeCards, expandedThemes } = useLib()

  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [newExpl, setNewExpl] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  const qRef = useRef<HTMLInputElement>(null)
  const aRef = useRef<HTMLInputElement>(null)
  const explRef = useRef<HTMLInputElement>(null)

  // Pour les thèmes non-feuilles, auto-charger les cartes directes à l'affichage
  const didAutoLoad = useRef(false)
  useEffect(() => {
    if (!isLeaf && !didAutoLoad.current) {
      didAutoLoad.current = true
      if (!themeCards.has(themeId) && !loadingThemes.has(themeId)) {
        loadThemeCards(themeId)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pour les thèmes non-feuilles : le formulaire d'ajout n'apparaît qu'après clic 📝
  const isExpanded = expandedThemes.has(themeId)
  const showAddForm = isLeaf || isExpanded

  const isLoading = loadingThemes.has(themeId)
  const cards = themeCards.get(themeId)
  const pl = INDENT * (depth + 1) + 8

  async function handleAdd() {
    if (!newQ.trim() || !newA.trim() || addSaving) return
    setAddSaving(true)
    setAddError('')
    try {
      await onAddThemeCard(themeId, newQ.trim(), newA.trim(), newExpl.trim() || undefined)
      setNewQ('')
      setNewA('')
      setNewExpl('')
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1000)
      qRef.current?.focus()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Erreur lors de l\'ajout')
    } finally {
      setAddSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="py-1.5 space-y-1.5" style={{ paddingLeft: pl }}>
        <div className="h-3 bg-[var(--bg-surface)] rounded animate-pulse" style={{ width: '65%' }} />
        <div className="h-3 bg-[var(--bg-surface)] rounded animate-pulse" style={{ width: '45%' }} />
      </div>
    )
  }

  // Pour les thèmes non-feuilles sans cartes directes et sans formulaire : ne rien afficher
  if (!isLoading && !cards?.length && !showAddForm) return null

  return (
    <div className="pb-1">
      {isLeaf && cards?.length === 0 && (
        <p className="text-xs text-[var(--text-hint)] italic py-0.5" style={{ paddingLeft: pl }}>
          Aucune carte — ajoutez-en une ci-dessous
        </p>
      )}

      {cards?.map(card => (
        <DraggableCardRow key={card.id} card={card} themeId={themeId} pl={pl} />
      ))}

      {/* Formulaire d'ajout : toujours pour les feuilles, sinon seulement si 📝 actif */}
      {showAddForm && <div className="py-1 pr-2 border-b border-[var(--border-subtle)]" style={{ paddingLeft: pl }}>
        <div className="flex items-center gap-1.5">
          <input ref={qRef} value={newQ} onChange={e => { setNewQ(e.target.value); setAddError('') }}
            onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); aRef.current?.focus() } }}
            placeholder="Question…"
            className="flex-1 bg-transparent text-xs text-[var(--text-secondary)] placeholder-[var(--border-default)] outline-none border-b border-transparent focus:border-[var(--border-focus)] py-0.5 min-w-0 transition-colors"
            style={{ maxWidth: '45%' }}
          />
          <input ref={aRef} value={newA} onChange={e => { setNewA(e.target.value); setAddError('') }}
            onKeyDown={e => {
              if (e.key === 'Tab') { e.preventDefault(); explRef.current?.focus() }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() }
            }}
            placeholder="Réponse…"
            className="flex-1 bg-transparent text-xs text-[var(--text-muted)] placeholder-[var(--border-default)] outline-none border-b border-transparent focus:border-[var(--border-focus)] py-0.5 min-w-0 transition-colors"
            style={{ maxWidth: '45%' }}
          />
          {savedFlash && <span className="text-green-400 text-xs flex-shrink-0">✓</span>}
          {addSaving && <span className="text-[var(--text-muted)] text-xs flex-shrink-0 animate-pulse">…</span>}
          <button onClick={handleAdd} disabled={!newQ.trim() || !newA.trim() || addSaving}
            className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-xs leading-none transition-colors"
            title="Ajouter">
            +
          </button>
        </div>
        <input ref={explRef} value={newExpl} onChange={e => setNewExpl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd() } }}
          placeholder="Explication (optionnel)…"
          className="w-full bg-transparent text-xs text-[var(--text-hint)] italic placeholder-[var(--border-default)] outline-none border-b border-transparent focus:border-[var(--border-focus)]/50 py-0.5 transition-colors mt-0.5"
        />
      </div>}
      {addError && (
        <p className="text-red-400 text-xs py-1 pr-2" style={{ paddingLeft: pl }}>
          ⚠ {addError}
        </p>
      )}
    </div>
  )
}

// ── ThemeNode (recursive) ─────────────────────────────────────────────────────

function ThemeNode({ node }: { node: TreeNode }) {
  const {
    collapsed, editingId, editValue, deletingThemeId, colorPickerId,
    onToggle, onEditStart, onEditChange, onEditCommit, onEditCancel,
    onCreateChild, onDeleteThemeStart, onDeleteThemeCancel, onDeleteThemeConfirm,
    onColorToggle, onColorChange, expandedThemes, onToggleTheme,
    draggingCard, hoveredDropThemeId,
  } = useLib()

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
  const isLeaf = node.children.length === 0
  const isExpanded = expandedThemes.has(node.id)
  const childThemeIds = node.children.map(c => `theme:${c.id}`)
  const inputRef = useRef<HTMLInputElement>(null)

  const isCardDropTarget = draggingCard !== null && node.id !== draggingCard.fromThemeId
  const isCardDropHovered = hoveredDropThemeId === node.id

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
        <div className={`flex items-center gap-1 py-0.5 pr-2 rounded-lg transition-colors ${
          isCardDropHovered
            ? 'bg-[var(--accent)]/20 ring-1 ring-[var(--accent)]/40'
            : isCardDropTarget
              ? 'hover:bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/20 ring-dashed'
              : 'hover:bg-[var(--bg-elevated)]/20'
        }`}>
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="text-[var(--text-secondary)] hover:text-[var(--text-muted)] touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
            aria-label="Déplacer le thème"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="3" cy="2.5" r="1" /><circle cx="9" cy="2.5" r="1" />
              <circle cx="3" cy="6" r="1" /><circle cx="9" cy="6" r="1" />
              <circle cx="3" cy="9.5" r="1" /><circle cx="9" cy="9.5" r="1" />
            </svg>
          </button>

          {/* Chevron: leaf → toggle cards; branch → collapse children */}
          <button
            onClick={() => isLeaf ? onToggleTheme(node.id) : onToggle(node.id)}
            className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] flex-shrink-0 transition-transform duration-200"
            style={{ transform: isLeaf
              ? (isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)')
              : (isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)') }}
            title={isLeaf ? (isExpanded ? 'Masquer les cartes' : 'Voir les cartes') : undefined}
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
                <div className="absolute left-0 top-5 z-50 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl p-2 flex gap-1.5 shadow-xl">
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
              className="flex-1 bg-transparent border-b border-[var(--accent)] text-sm font-medium text-[var(--text-primary)] outline-none py-0.5 min-w-0"
            />
          ) : (
            <span
              onDoubleClick={() => onEditStart(node.id, node.name)}
              className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate min-w-0 cursor-default"
            >
              {node.name}
            </span>
          )}

          {/* Hover actions */}
          <div className="flex items-center gap-0.5 transition-opacity flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            <button
              onClick={() => onToggleTheme(node.id)}
              className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                isExpanded ? 'text-[var(--accent-light)]' : 'text-[var(--text-muted)] hover:text-[var(--accent-light)]'
              }`}
              title="Voir les cartes"
            >
              📝
            </button>
            <Link
              href={`/review/theme/${node.id}`}
              onClick={e => e.stopPropagation()}
              className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] rounded text-xs"
              title="Réviser ce thème"
            >
              ▶
            </Link>
            <Link
              href={`/review/theme/${node.id}?mode=free`}
              onClick={e => e.stopPropagation()}
              className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-amber-400 rounded text-[10px] font-bold leading-none"
              title="Tout réviser (mode libre)"
            >
              ∞
            </Link>
            <button
              onClick={() => onCreateChild(node.id)}
              className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded text-base leading-none"
              title="Nouveau sous-thème"
            >
              +
            </button>
            <button
              onClick={() => onDeleteThemeStart(node.id)}
              className="w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 rounded text-xs"
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
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded hover:bg-[var(--bg-elevated)]/20 flex-shrink-0"
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

      {/* Cartes directes : feuilles → quand expanded ; non-feuilles → quand non réduit */}
      {(isLeaf ? isExpanded : !isCollapsed) && (
        <ThemeCardsList themeId={node.id} depth={node.depth} isLeaf={isLeaf} />
      )}

      {/* Children (when not collapsed) */}
      {!isLeaf && !isCollapsed && node.children.length > 0 && (
        <SortableContext items={childThemeIds} strategy={verticalListSortingStrategy}>
          {node.children.map(child => (
            <ThemeNode key={child.id} node={child} />
          ))}
        </SortableContext>
      )}
    </>
  )
}

// ── TreeLibrary ───────────────────────────────────────────────────────────────

export default function TreeLibrary({ initialThemes, userId }: TreeLibraryProps) {
  const supabase = createClient()

  const [themes, setThemes] = useState(initialThemes)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deletingThemeId, setDeletingThemeId] = useState<string | null>(null)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null)
  const [activeCard, setActiveCard] = useState<(CardItem & { fromThemeId: string }) | null>(null)
  const [hoveredDropThemeId, setHoveredDropThemeId] = useState<string | null>(null)

  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set())
  const [themeCards, setThemeCards] = useState<Map<string, CardItem[]>>(new Map())
  const [loadingThemes, setLoadingThemes] = useState<Set<string>>(new Set())

  const filteredThemes = search
    ? themes.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : themes

  const tree = useMemo(() => buildTree(filteredThemes), [filteredThemes])
  const themesById = useMemo(() => new Map(themes.map(t => [t.id, t])), [themes])

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

  const editValueRef = useRef(editValue)
  useEffect(() => { editValueRef.current = editValue }, [editValue])

  const onEditCommit = useCallback((id: string) => {
    const name = editValueRef.current.trim() || 'Sans titre'
    setEditingId(null)
    setEditValue('')
    setThemes(prev => prev.map(t => t.id === id ? { ...t, name } : t))
    supabase.from('themes').update({ name }).eq('id', id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ error }: any) => { if (error) console.error('theme rename error:', error) })
  }, [supabase])

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

  // ── Theme card actions ─────────────────────────────────────────────────────

  const loadThemeCards = useCallback(async (themeId: string) => {
    setLoadingThemes(prev => { const next = new Set(prev); next.add(themeId); return next })
    const { data } = await supabase
      .from('cards')
      .select('id, question, answer, explanation')
      .eq('theme_id', themeId)
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: CardItem[] = (data || []).map((c: any) => ({ id: c.id, question: c.question, answer: c.answer, explanation: c.explanation ?? null }))
    setThemeCards(prev => new Map(prev).set(themeId, items))
    setLoadingThemes(prev => { const next = new Set(prev); next.delete(themeId); return next })
  }, [supabase])

  const onToggleTheme = useCallback((themeId: string) => {
    const isExpanded = expandedThemes.has(themeId)
    setExpandedThemes(prev => {
      const next = new Set(prev)
      if (isExpanded) next.delete(themeId)
      else next.add(themeId)
      return next
    })
    if (!isExpanded && !themeCards.has(themeId)) {
      loadThemeCards(themeId)
    }
  }, [expandedThemes, themeCards, loadThemeCards])

  const onAddThemeCard = useCallback(async (themeId: string, q: string, a: string, expl?: string) => {
    const { data: card, error } = await supabase
      .from('cards')
      .insert({ theme_id: themeId, deck_id: null, question: q, answer: a, explanation: expl || null, difficulty: 1, created_by_ai: false, user_edited: false })
      .select('id')
      .single()
    if (error) {
      console.error('onAddThemeCard error:', error)
      throw new Error(error.message || 'Erreur lors de la création de la carte')
    }
    if (!card) throw new Error('Carte non créée — réponse vide du serveur')
    const { error: reviewError } = await supabase.from('card_reviews').insert({
      card_id: card.id, user_id: userId, state: 'new',
      scheduled_at: new Date().toISOString(),
    })
    if (reviewError) console.error('card_reviews insert error:', reviewError)
    setThemeCards(prev => {
      const existing = prev.get(themeId) || []
      return new Map(prev).set(themeId, [{ id: card.id, question: q, answer: a, explanation: expl || null }, ...existing])
    })
  }, [supabase, userId])

  const onEditThemeCard = useCallback(async (cardId: string, themeId: string, q: string, a: string, expl?: string) => {
    const explanation = expl !== undefined ? (expl || null) : undefined
    setThemeCards(prev => {
      const cards = prev.get(themeId) || []
      return new Map(prev).set(themeId, cards.map(c => c.id === cardId ? { ...c, question: q, answer: a, explanation: explanation ?? c.explanation } : c))
    })
    await supabase.from('cards').update({ question: q, answer: a, explanation: expl || null, user_edited: true }).eq('id', cardId)
  }, [supabase])

  const onDeleteThemeCard = useCallback(async (cardId: string, themeId: string) => {
    setThemeCards(prev => {
      const cards = prev.get(themeId) || []
      return new Map(prev).set(themeId, cards.filter(c => c.id !== cardId))
    })
    await supabase.from('card_reviews').delete().eq('card_id', cardId)
    await supabase.from('cards').delete().eq('id', cardId)
  }, [supabase])

  const onMoveCard = useCallback(async (cardId: string, fromThemeId: string, toThemeId: string) => {
    setThemeCards(prev => {
      const fromCards = prev.get(fromThemeId) || []
      const movedCard = fromCards.find(c => c.id === cardId)
      if (!movedCard) return prev
      const next = new Map(prev)
      next.set(fromThemeId, fromCards.filter(c => c.id !== cardId))
      // Only update target if already loaded, to avoid stale partial lists
      if (prev.has(toThemeId)) {
        next.set(toThemeId, [movedCard, ...(prev.get(toThemeId) || [])])
      }
      return next
    })
    const { error } = await supabase.from('cards').update({ theme_id: toThemeId, deck_id: null }).eq('id', cardId)
    if (error) console.error('onMoveCard error:', error)
  }, [supabase])

  // ── Expand / Collapse all ─────────────────────────────────────────────────

  const handleExpandAll = useCallback(() => {
    setCollapsed(new Set())
    const allIds = new Set(themes.map(t => t.id))
    setExpandedThemes(allIds)
    themes.filter(t => !themeCards.has(t.id) && !loadingThemes.has(t.id)).forEach(t => loadThemeCards(t.id))
  }, [themes, themeCards, loadThemeCards])

  const handleCollapseAll = useCallback(() => {
    setCollapsed(new Set(themes.map(t => t.id)))
    setExpandedThemes(new Set())
  }, [themes])

  const isEverythingExpanded = themes.length > 0 && collapsed.size === 0 && expandedThemes.size === themes.length

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

  // ── DnD — themes + cards ──────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string
    if (id.startsWith('theme:')) {
      setActiveTheme(themes.find(t => t.id === id.slice(6)) ?? null)
    } else if (id.startsWith('card:')) {
      const { cardId, fromThemeId } = event.active.data.current as { cardId: string; fromThemeId: string }
      const card = (themeCards.get(fromThemeId) || []).find(c => c.id === cardId)
      if (card) setActiveCard({ ...card, fromThemeId })
    }
  }, [themes, themeCards])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!(active.id as string).startsWith('card:')) return
    const overId = over?.id as string | undefined
    setHoveredDropThemeId(overId?.startsWith('theme:') ? overId.slice(6) : null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveTheme(null)
    setActiveCard(null)
    setHoveredDropThemeId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    // ── Card move between themes ───────────────────────────────────────────
    if (activeId.startsWith('card:')) {
      if (overId.startsWith('theme:')) {
        const toThemeId = overId.slice(6)
        const { cardId, fromThemeId } = active.data.current as { cardId: string; fromThemeId: string }
        if (fromThemeId !== toThemeId) await onMoveCard(cardId, fromThemeId, toThemeId)
      }
      return
    }

    // ── Theme reorder ──────────────────────────────────────────────────────
    if (!activeId.startsWith('theme:') || !overId.startsWith('theme:')) return

    const activeRawId = activeId.slice(6)
    const overRawId = overId.slice(6)
    if (isAncestor(themes, activeRawId, overRawId)) return

    const activeParentId = (active.data.current?.parentId ?? null) as string | null
    const overParentId = (over.data.current?.parentId ?? null) as string | null

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
      const newDepth = getThemeDepth(targetParentId, themesById) + (targetParentId ? 1 : 0)
      if (newDepth > 2) return
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
  }, [themes, supabase, themesById])

  // ── Context value ──────────────────────────────────────────────────────────

  const ctxValue: Ctx = {
    collapsed, editingId, editValue, deletingThemeId, colorPickerId,
    onToggle, onEditStart, onEditChange, onEditCommit, onEditCancel,
    onCreateChild, onDeleteThemeStart, onDeleteThemeCancel, onDeleteThemeConfirm,
    onColorToggle, onColorChange,
    userId, themeCards, loadingThemes, expandedThemes,
    onToggleTheme, onAddThemeCard, onEditThemeCard, onDeleteThemeCard, onMoveCard,
    loadThemeCards,
    themesById,
    draggingCard: activeCard,
    hoveredDropThemeId,
  }

  const rootThemeIds = tree.map(n => `theme:${n.id}`)

  return (
    <LibCtx.Provider value={ctxValue}>
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] pb-20">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[var(--bg-base)]/95 backdrop-blur-md border-b border-[var(--border-default)] px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/dashboard" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold flex-1">Ma bibliothèque</h1>
            <div className="flex items-center gap-2">
              {themes.length > 0 && (
                <button
                  onClick={isEverythingExpanded ? handleCollapseAll : handleExpandAll}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-focus)]/50 rounded-xl w-9 h-9 flex items-center justify-center transition-colors"
                  title={isEverythingExpanded ? 'Tout réduire' : 'Tout développer'}
                >
                  {isEverythingExpanded ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 11l-5-5-5 5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17l-5-5-5 5" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 13l5 5 5-5" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7l5 5 5-5" />
                    </svg>
                  )}
                </button>
              )}
              <button
                onClick={handleCreateRootTheme}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-focus)]/50 rounded-xl px-3 h-9 text-sm transition-colors"
                title="Nouveau thème"
              >
                + Thème
              </button>
              <Link
                href="/create"
                className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-xl w-9 h-9 flex items-center justify-center font-bold text-xl transition-colors"
                title="Nouvelle carte"
              >
                +
              </Link>
            </div>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher un thème…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-[var(--accent)]/60 placeholder-[var(--text-muted)]"
            />
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-2 py-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            {tree.length > 0 && (
              <SortableContext items={rootThemeIds} strategy={verticalListSortingStrategy}>
                {tree.map(node => <ThemeNode key={node.id} node={node} />)}
              </SortableContext>
            )}

            {tree.length === 0 && !search && (
              <div className="text-center py-16 text-[var(--text-muted)]">
                <p className="text-4xl mb-4">🗂️</p>
                <p className="text-sm">Aucun thème pour l&apos;instant.</p>
                <button
                  onClick={handleCreateRootTheme}
                  className="inline-block mt-4 text-[var(--accent)] hover:text-[var(--accent-light)] text-sm"
                >
                  Créer mon premier thème →
                </button>
              </div>
            )}

            <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
              {activeTheme && (
                <div className="bg-[var(--bg-surface)] rounded-xl px-3 py-2 border border-[var(--accent)]/60 shadow-2xl opacity-90 flex items-center gap-2 cursor-grabbing">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: activeTheme.color }} />
                  <span className="text-sm font-semibold">{activeTheme.name}</span>
                </div>
              )}
              {activeCard && (
                <div className="bg-[var(--bg-surface)] rounded-xl px-3 py-1.5 border border-[var(--accent)]/60 shadow-2xl opacity-95 flex items-center gap-2 cursor-grabbing max-w-xs">
                  <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" className="text-[var(--text-muted)] flex-shrink-0">
                    <circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/>
                    <circle cx="2" cy="5" r="1"/><circle cx="6" cy="5" r="1"/>
                    <circle cx="2" cy="8" r="1"/><circle cx="6" cy="8" r="1"/>
                  </svg>
                  <span className="text-xs text-[var(--text-secondary)] truncate">{activeCard.question}</span>
                  <span className="text-xs text-[var(--text-hint)] flex-shrink-0">·</span>
                  <span className="text-xs text-[var(--text-muted)] truncate">{activeCard.answer}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </main>
      </div>
    </LibCtx.Provider>
  )
}
