'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Theme, Deck } from '@/types'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, useSensor, useSensors, closestCenter, useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const THEME_COLORS = [
  '#534AB7', '#0D9488', '#E85D4A', '#F59E0B',
  '#3B82F6', '#22C55E', '#EC4899', '#6B7280',
]

type DeckWithMeta = Deck & { card_count: number; due_count: number }
type Anchor = { x: number; y: number }

interface Props {
  initialThemes: Theme[]
  initialDecks: DeckWithMeta[]
  userId: string
}

// ─── DeckRow ────────────────────────────────────────────────────────────────

function DeckRow({
  deck,
  onOptionsClick,
}: {
  deck: DeckWithMeta
  onOptionsClick: (deck: DeckWithMeta, anchor: Anchor | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => onOptionsClick(deck, null), 500)
  }
  const handleTouchEnd = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }
  const handleTouchMove = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }

  const handleMenuClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = menuBtnRef.current?.getBoundingClientRect()
    if (rect) {
      const x = Math.max(4, Math.min(rect.right - 208, window.innerWidth - 212))
      const y = rect.bottom + 4 + window.scrollY
      onOptionsClick(deck, { x, y })
    } else {
      onOptionsClick(deck, null)
    }
  }

  const retention = deck.card_count > 0
    ? Math.round(((deck.card_count - deck.due_count) / deck.card_count) * 100)
    : 100

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-[#1A1A2E] rounded-xl p-3 border border-[#534AB7]/20 hover:border-[#534AB7]/50 transition-colors group"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={e => { e.preventDefault(); onOptionsClick(deck, { x: e.clientX - 104, y: e.clientY }) }}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-600 hover:text-gray-400 touch-none flex-shrink-0 cursor-grab active:cursor-grabbing"
        aria-label="Déplacer"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
          <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
          <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
        </svg>
      </button>
      <Link href={`/decks/${deck.id}`} className="flex-1 flex items-center gap-3 min-w-0">
        <span className="text-xl flex-shrink-0">{deck.icon || '📚'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{deck.name}</p>
          <p className="text-xs text-gray-500">{deck.card_count} carte{deck.card_count !== 1 ? 's' : ''} · {retention}% rétention</p>
        </div>
      </Link>
      {deck.due_count > 0 && (
        <span className="bg-[#534AB7] text-white text-xs font-bold rounded-full px-2 py-0.5 flex-shrink-0">
          {deck.due_count}
        </span>
      )}
      <button
        ref={menuBtnRef}
        onClick={handleMenuClick}
        className="text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1"
        aria-label="Options"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>
    </div>
  )
}

// ─── ThemeSection ────────────────────────────────────────────────────────────

function ThemeSection({
  theme, directDecks, subThemes, subThemeDecksMap,
  isSubTheme, collapsed, onToggle,
  onOptionsClick, isDragging,
  subCollapsed, onSubToggle,
}: {
  theme: Theme | null
  directDecks: DeckWithMeta[]
  subThemes?: Theme[]
  subThemeDecksMap?: Map<string | null, DeckWithMeta[]>
  isSubTheme?: boolean
  collapsed: boolean
  onToggle: () => void
  onOptionsClick: (deck: DeckWithMeta, anchor: Anchor | null) => void
  isDragging: boolean
  subCollapsed?: Record<string, boolean>
  onSubToggle?: (id: string) => void
}) {
  const droppableId = `theme:${theme?.id ?? 'null'}`
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })
  const deckIds = directDecks.map(d => d.id)
  const color = theme?.color || '#6B7280'

  return (
    <div className={isSubTheme ? 'ml-4 mb-2' : 'mb-3'}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:opacity-80 transition-opacity"
      >
        <span className={`rounded-full flex-shrink-0 ${isSubTheme ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} style={{ background: color }} />
        <span className={`font-semibold text-gray-300 flex-1 ${isSubTheme ? 'text-xs' : 'text-sm'}`}>
          {theme?.name || 'Sans thème'}
        </span>
        <span className="text-xs text-gray-500">
          {directDecks.length + (subThemes?.reduce((s, st) => s + (subThemeDecksMap?.get(st.id)?.length || 0), 0) || 0)}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className={`text-gray-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {theme && !isSubTheme && (
          <Link
            href={`/themes/${theme.id}`}
            onClick={e => e.stopPropagation()}
            className="text-gray-600 hover:text-gray-400 text-xs ml-0.5"
          >→</Link>
        )}
      </button>

      {!collapsed && (
        <>
          {/* Sub-themes nested under parent, with a colored connecting line */}
          {!isSubTheme && subThemes && subThemes.length > 0 && (
            <div className="ml-3 border-l-2 pl-1 mt-1 mb-1" style={{ borderColor: `${color}40` }}>
              {subThemes.map(sub => (
                <ThemeSection
                  key={sub.id}
                  theme={sub}
                  directDecks={subThemeDecksMap?.get(sub.id) || []}
                  isSubTheme
                  collapsed={subCollapsed?.[sub.id] ?? false}
                  onToggle={() => onSubToggle?.(sub.id)}
                  onOptionsClick={onOptionsClick}
                  isDragging={isDragging}
                />
              ))}
            </div>
          )}

          {/* Decks in this theme (or sub-theme) */}
          <SortableContext items={deckIds} strategy={verticalListSortingStrategy}>
            <div
              ref={setNodeRef}
              className={`space-y-1.5 rounded-xl transition-colors ${isSubTheme ? 'pl-3' : 'pl-4'} ${
                isOver ? 'bg-[#534AB7]/10 ring-1 ring-[#534AB7]/40' : ''
              } ${directDecks.length === 0 ? 'min-h-[44px]' : 'min-h-[4px]'}`}
            >
              {directDecks.map(deck => (
                <DeckRow key={deck.id} deck={deck} onOptionsClick={onOptionsClick} />
              ))}
              {isDragging && directDecks.length === 0 && (
                <div className={`border-2 border-dashed rounded-xl h-11 flex items-center justify-center text-xs transition-colors ${
                  isOver ? 'border-[#534AB7] text-[#534AB7]' : 'border-gray-700 text-gray-700'
                }`}>
                  Déposer ici
                </div>
              )}
              {!isDragging && (
                <Link
                  href={`/create${theme ? `?themeId=${theme.id}` : ''}`}
                  className="flex items-center gap-1.5 text-xs text-gray-700 hover:text-[#534AB7] py-0.5 transition-colors"
                >
                  <span>+</span> Ajouter un deck ici
                </Link>
              )}
            </div>
          </SortableContext>
        </>
      )}
    </div>
  )
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

function KanbanCard({ deck, onOptionsClick }: { deck: DeckWithMeta; onOptionsClick: (d: DeckWithMeta, a: Anchor | null) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-[#1A1A2E] rounded-xl p-3 border border-[#534AB7]/20 cursor-grab active:cursor-grabbing touch-none"
      onTouchStart={() => { timerRef.current = setTimeout(() => onOptionsClick(deck, null), 500) }}
      onTouchEnd={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
      onTouchMove={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{deck.icon || '📚'}</span>
        <span className="font-medium text-sm truncate flex-1">{deck.name}</span>
        {deck.due_count > 0 && (
          <span className="bg-[#534AB7] text-white text-xs font-bold rounded-full px-1.5 py-0.5">{deck.due_count}</span>
        )}
        <button
          ref={menuBtnRef}
          onClick={e => {
            e.stopPropagation()
            const rect = menuBtnRef.current?.getBoundingClientRect()
            if (rect) onOptionsClick(deck, { x: Math.max(4, rect.right - 208), y: rect.bottom + 4 })
            else onOptionsClick(deck, null)
          }}
          className="text-gray-600 hover:text-gray-400 p-0.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </div>
      <p className="text-xs text-gray-500">{deck.card_count} cartes</p>
    </div>
  )
}

function KanbanColumn({ theme, decks, onOptionsClick }: {
  theme: Theme | null; decks: DeckWithMeta[]
  onOptionsClick: (d: DeckWithMeta, a: Anchor | null) => void
}) {
  const color = theme?.color || '#6B7280'
  const deckIds = decks.map(d => d.id)
  return (
    <div className="flex-shrink-0 w-64 bg-[#13131F] rounded-2xl p-4 border border-[#534AB7]/20">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-sm flex-1 truncate">{theme?.name || 'Sans thème'}</span>
        <Link href={`/create${theme ? `?themeId=${theme.id}` : ''}`} className="text-gray-500 hover:text-[#534AB7] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </Link>
      </div>
      <SortableContext items={deckIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {decks.map(deck => <KanbanCard key={deck.id} deck={deck} onOptionsClick={onOptionsClick} />)}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── DecksLibrary ─────────────────────────────────────────────────────────────

export default function DecksLibrary({ initialThemes, initialDecks, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [themes, setThemes] = useState(initialThemes)
  const [decks, setDecks] = useState(initialDecks)
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Options menu
  const [optionsDeck, setOptionsDeck] = useState<DeckWithMeta | null>(null)
  const [optionsAnchor, setOptionsAnchor] = useState<Anchor | null>(null)

  const [activeDeck, setActiveDeck] = useState<DeckWithMeta | null>(null)

  // Create theme modal
  const [showCreateTheme, setShowCreateTheme] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [newThemeName, setNewThemeName] = useState('')
  const [newThemeColor, setNewThemeColor] = useState('#534AB7')
  const [newThemeParent, setNewThemeParent] = useState<string | null>(null)
  const [createThemeError, setCreateThemeError] = useState<string | null>(null)

  // Sub-actions
  const [movingDeck, setMovingDeck] = useState<DeckWithMeta | null>(null)
  const [renamingDeck, setRenamingDeck] = useState<DeckWithMeta | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<DeckWithMeta | null>(null)
  const [emojiPicker, setEmojiPicker] = useState<DeckWithMeta | null>(null)
  const [emojiInput, setEmojiInput] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem('memorix-library-view')
    if (stored === 'kanban' || stored === 'list') setView(stored as 'list' | 'kanban')
  }, [])

  const setViewPersist = (v: 'list' | 'kanban') => {
    setView(v)
    localStorage.setItem('memorix-library-view', v)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  const filteredDecks = search
    ? decks.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : decks

  const grouped = useCallback(() => {
    const map = new Map<string | null, DeckWithMeta[]>()
    map.set(null, [])
    themes.forEach(t => map.set(t.id, []))
    filteredDecks.forEach(d => {
      const key = d.theme_id || null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    })
    return map
  }, [filteredDecks, themes])

  const resolveThemeId = useCallback((overId: string): string | null | undefined => {
    if (overId.startsWith('theme:')) {
      const part = overId.slice(6)
      return part === 'null' ? null : part
    }
    const overDeck = decks.find(d => d.id === overId)
    return overDeck ? (overDeck.theme_id || null) : undefined
  }, [decks])

  const handleDragStart = (event: DragStartEvent) => {
    const deck = decks.find(d => d.id === event.active.id)
    if (deck) setActiveDeck(deck)
  }

const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeck(null)
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string

    let currentDecks: DeckWithMeta[] = []
    setDecks(prev => { currentDecks = prev; return prev })
    await new Promise(r => setTimeout(r, 0))

    const activeDeckObj = currentDecks.find(d => d.id === activeId)
    if (!activeDeckObj) return

    const targetThemeId = resolveThemeId(overId)
    if (targetThemeId === undefined) return

    const oldThemeId = activeDeckObj.theme_id || null

    if (oldThemeId !== targetThemeId) {
      setDecks(prev => prev.map(d => d.id === activeId ? { ...d, theme_id: targetThemeId } : d))
      await supabase.from('decks').update({ theme_id: targetThemeId }).eq('id', activeId)
      return
    }

    if (activeId === overId) return
    const groupDecks = currentDecks.filter(d => (d.theme_id || null) === targetThemeId)
    const oldIdx = groupDecks.findIndex(d => d.id === activeId)
    const newIdx = groupDecks.findIndex(d => d.id === overId)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(groupDecks, oldIdx, newIdx)
    setDecks(prev => {
      const others = prev.filter(d => (d.theme_id || null) !== targetThemeId)
      return [...others, ...reordered]
    })
    await Promise.all(reordered.map((d, i) => supabase.from('decks').update({ position: i }).eq('id', d.id)))
  }

  const openOptions = (deck: DeckWithMeta, anchor: Anchor | null) => {
    setOptionsDeck(deck)
    setOptionsAnchor(anchor)
  }

  const closeOptions = () => {
    setOptionsDeck(null)
    setOptionsAnchor(null)
  }

  const handleCreateTheme = async () => {
    if (!newThemeName.trim()) return
    setCreateThemeError(null)
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      name: newThemeName.trim(),
      color: newThemeColor,
      position: themes.length,
    }
    if (newThemeParent) insertPayload.parent_id = newThemeParent

    const { data, error } = await supabase
      .from('themes')
      .insert(insertPayload)
      .select()
      .single()
    if (error) {
      setCreateThemeError(error.message.includes('does not exist')
        ? 'Migration SQL non exécutée — ouvre le SQL editor Supabase et exécute supabase/migrations/20260425_themes.sql'
        : error.message)
      return
    }
    if (data) {
      setThemes(prev => [...prev, data as Theme])
      setNewThemeName('')
      setNewThemeColor('#534AB7')
      setNewThemeParent(null)
      setShowCreateTheme(false)
    }
  }

  const handleDeleteDeck = async (deck: DeckWithMeta) => {
    await supabase.from('decks').delete().eq('id', deck.id)
    setDecks(prev => prev.filter(d => d.id !== deck.id))
    setDeleteConfirm(null)
    closeOptions()
  }

  const handleMoveDeck = async (deck: DeckWithMeta, themeId: string | null) => {
    setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, theme_id: themeId } : d))
    setMovingDeck(null)
    closeOptions()
    const { error } = await supabase.from('decks').update({ theme_id: themeId }).eq('id', deck.id)
    if (error) {
      setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, theme_id: deck.theme_id } : d))
    }
  }

  const handleRenameDeck = async () => {
    if (!renamingDeck || !renameValue.trim()) return
    await supabase.from('decks').update({ name: renameValue.trim() }).eq('id', renamingDeck.id)
    setDecks(prev => prev.map(d => d.id === renamingDeck.id ? { ...d, name: renameValue.trim() } : d))
    setRenamingDeck(null)
    closeOptions()
  }

  const handleChangeEmoji = async () => {
    if (!emojiPicker || !emojiInput.trim()) return
    await supabase.from('decks').update({ icon: emojiInput.trim() }).eq('id', emojiPicker.id)
    setDecks(prev => prev.map(d => d.id === emojiPicker.id ? { ...d, icon: emojiInput.trim() } : d))
    setEmojiPicker(null)
    closeOptions()
  }

  const groupedDecks = grouped()
  const parentThemes = themes.filter(t => !t.parent_id)
  const subThemesByParent = (parentId: string) => themes.filter(t => t.parent_id === parentId)

  // Flat list of theme options for "move" sheet, with hierarchy
  const themeOptions: Array<{ theme: Theme | null; depth: number }> = [
    { theme: null, depth: 0 },
    ...parentThemes.flatMap(t => [
      { theme: t, depth: 0 },
      ...subThemesByParent(t.id).map(sub => ({ theme: sub, depth: 1 })),
    ]),
  ]

  // Options menu content (shared between dropdown and sheet)
  const optionsItems = optionsDeck ? [
    { label: '⚡ Réviser maintenant', action: () => { router.push(`/review/${optionsDeck.id}`); closeOptions() } },
    { label: '➕ Ajouter des cartes', action: () => { router.push(`/create?deckId=${optionsDeck.id}`); closeOptions() } },
    { label: '🗂️ Déplacer vers un thème', action: () => { setMovingDeck(optionsDeck) } },
    { label: '✏️ Renommer', action: () => { setRenamingDeck(optionsDeck); setRenameValue(optionsDeck.name) } },
    { label: '🎨 Changer l\'icône', action: () => { setEmojiPicker(optionsDeck); setEmojiInput(optionsDeck.icon || '') } },
  ] : []

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0D0D1A]/95 backdrop-blur-md border-b border-[#534AB7]/20 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7-7l-7 7 7 7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold flex-1">Ma bibliothèque</h1>
          <div className="flex bg-[#1A1A2E] rounded-lg p-1 gap-1">
            <button
              onClick={() => setViewPersist('list')}
              className={`p-1.5 rounded transition-colors ${view === 'list' ? 'bg-[#534AB7] text-white' : 'text-gray-500'}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewPersist('kanban')}
              className={`p-1.5 rounded transition-colors ${view === 'kanban' ? 'bg-[#534AB7] text-white' : 'text-gray-500'}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V5a1 1 0 00-1-1zm10 0h-4a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V5a1 1 0 00-1-1zM9 14H5a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1zm10 0h-4a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1v-4a1 1 0 00-1-1z" />
              </svg>
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowCreateMenu(v => !v)}
              className="bg-[#534AB7] hover:bg-[#3C3489] rounded-xl w-9 h-9 flex items-center justify-center font-bold text-xl transition-colors"
            >+</button>
            {showCreateMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCreateMenu(false)} />
                <div className="absolute right-0 top-11 z-50 bg-[#1A1A2E] border border-[#534AB7]/30 rounded-xl py-2 w-52 shadow-xl">
                  <Link href="/create" onClick={() => setShowCreateMenu(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#534AB7]/20 transition-colors text-sm">
                    <span>📚</span> Nouveau deck
                  </Link>
                  <button
                    onClick={() => { setShowCreateMenu(false); setShowCreateTheme(true); setCreateThemeError(null); setNewThemeParent(null) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#534AB7]/20 transition-colors text-sm text-left"
                  >
                    <span>🗂️</span> Nouveau thème
                  </button>
                  {parentThemes.length > 0 && (
                    <button
                      onClick={() => { setShowCreateMenu(false); setShowCreateTheme(true); setCreateThemeError(null) }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#534AB7]/20 transition-colors text-sm text-left"
                    >
                      <span>📂</span> Nouveau sous-thème
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Rechercher un deck…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#1A1A2E] border border-[#534AB7]/20 rounded-xl py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-[#534AB7]/60 placeholder-gray-600"
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {view === 'list' ? (
            <div>
              {parentThemes.map(theme => (
                <ThemeSection
                  key={theme.id}
                  theme={theme}
                  directDecks={groupedDecks.get(theme.id) || []}
                  subThemes={subThemesByParent(theme.id)}
                  subThemeDecksMap={groupedDecks}
                  collapsed={collapsed[theme.id] ?? false}
                  onToggle={() => setCollapsed(c => ({ ...c, [theme.id]: !c[theme.id] }))}
                  onOptionsClick={openOptions}
                  isDragging={!!activeDeck}
                  subCollapsed={collapsed}
                  onSubToggle={id => setCollapsed(c => ({ ...c, [id]: !c[id] }))}
                />
              ))}
              <ThemeSection
                theme={null}
                directDecks={groupedDecks.get(null) || []}
                collapsed={collapsed['__none__'] ?? false}
                onToggle={() => setCollapsed(c => ({ ...c, '__none__': !c['__none__'] }))}
                onOptionsClick={openOptions}
                isDragging={!!activeDeck}
              />
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
              {parentThemes.map(theme => (
                <KanbanColumn
                  key={theme.id}
                  theme={theme}
                  decks={[
                    ...(groupedDecks.get(theme.id) || []),
                    ...subThemesByParent(theme.id).flatMap(sub => groupedDecks.get(sub.id) || []),
                  ]}
                  onOptionsClick={openOptions}
                />
              ))}
              <KanbanColumn theme={null} decks={groupedDecks.get(null) || []} onOptionsClick={openOptions} />
            </div>
          )}

          <DragOverlay>
            {activeDeck && (
              <div className="bg-[#1A1A2E] rounded-xl p-3 border border-[#534AB7]/60 shadow-xl opacity-90">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{activeDeck.icon || '📚'}</span>
                  <span className="font-medium">{activeDeck.name}</span>
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </main>

      {/* ── Create Theme Modal ─────────────────────────────────────────────── */}
      {showCreateTheme && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A1A2E] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-[#534AB7]/30">
            <h2 className="text-lg font-bold mb-4">Nouveau thème</h2>
            <input
              type="text"
              placeholder="Nom du thème"
              value={newThemeName}
              onChange={e => { setNewThemeName(e.target.value); setCreateThemeError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCreateTheme()}
              autoFocus
              className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:border-[#534AB7] text-sm"
            />
            {/* Parent theme selector */}
            {parentThemes.length > 0 && (
              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1.5 block">Sous-thème de (optionnel)</label>
                <select
                  value={newThemeParent || ''}
                  onChange={e => setNewThemeParent(e.target.value || null)}
                  className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#534AB7] text-gray-300"
                >
                  <option value="">— Thème principal —</option>
                  {parentThemes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            {createThemeError && (
              <p className="text-red-400 text-xs mb-3 bg-red-500/10 rounded-xl p-3">{createThemeError}</p>
            )}
            <div className="flex gap-2 mb-5 flex-wrap">
              {THEME_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewThemeColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${newThemeColor === c ? 'scale-125 ring-2 ring-white/40' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCreateTheme(false)} className="flex-1 border border-[#534AB7]/30 rounded-xl py-2.5 text-sm hover:bg-[#534AB7]/10">Annuler</button>
              <button onClick={handleCreateTheme} className="flex-1 bg-[#534AB7] hover:bg-[#3C3489] rounded-xl py-2.5 text-sm font-semibold transition-colors">Créer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Options: positioned dropdown (desktop) ─────────────────────────── */}
      {optionsDeck && optionsAnchor && !movingDeck && !renamingDeck && !deleteConfirm && !emojiPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeOptions} />
          <div
            className="fixed z-50 bg-[#1A1A2E] border border-[#534AB7]/30 rounded-2xl py-2 w-52 shadow-2xl"
            style={{ top: optionsAnchor.y, left: optionsAnchor.x }}
          >
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#534AB7]/10 mb-1">
              <span className="text-xl">{optionsDeck.icon || '📚'}</span>
              <span className="font-semibold text-sm truncate">{optionsDeck.name}</span>
            </div>
            {optionsItems.map(({ label, action }) => (
              <button key={label} onClick={action} className="w-full text-left px-4 py-2 hover:bg-[#534AB7]/15 transition-colors text-sm">
                {label}
              </button>
            ))}
            <div className="border-t border-[#534AB7]/10 mt-1 pt-1">
              <button
                onClick={() => setDeleteConfirm(optionsDeck)}
                className="w-full text-left px-4 py-2 hover:bg-red-500/10 transition-colors text-sm text-red-400"
              >
                🗑️ Supprimer le deck
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Options: bottom sheet (mobile / long-press) ─────────────────────── */}
      {optionsDeck && !optionsAnchor && !movingDeck && !renamingDeck && !deleteConfirm && !emojiPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={closeOptions}>
          <div className="bg-[#1A1A2E] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#534AB7]/30" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#534AB7]/10 mb-1">
              <span className="text-2xl">{optionsDeck.icon || '📚'}</span>
              <span className="font-semibold truncate">{optionsDeck.name}</span>
            </div>
            {optionsItems.map(({ label, action }) => (
              <button key={label} onClick={action} className="w-full text-left px-4 py-3 hover:bg-[#534AB7]/10 rounded-xl transition-colors text-sm">
                {label}
              </button>
            ))}
            <button
              onClick={() => setDeleteConfirm(optionsDeck)}
              className="w-full text-left px-4 py-3 hover:bg-red-500/10 rounded-xl transition-colors text-sm text-red-400 mt-1 mb-2"
            >
              🗑️ Supprimer le deck
            </button>
          </div>
        </div>
      )}

      {/* ── Move to theme ───────────────────────────────────────────────────── */}
      {movingDeck && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setMovingDeck(null)}>
          <div className="bg-[#1A1A2E] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#534AB7]/30 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="px-4 py-3 text-sm font-semibold text-gray-400 border-b border-[#534AB7]/10 mb-1 sticky top-0 bg-[#1A1A2E]">Déplacer vers…</p>
            {themeOptions.map(({ theme, depth }) => (
              <button
                key={theme?.id ?? '__none__'}
                onClick={() => handleMoveDeck(movingDeck, theme?.id ?? null)}
                className="w-full text-left px-4 py-2.5 hover:bg-[#534AB7]/10 rounded-xl text-sm transition-colors flex items-center gap-2"
                style={{ paddingLeft: depth > 0 ? '2rem' : undefined }}
              >
                {theme ? (
                  <>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: theme.color }} />
                    {depth > 0 && <span className="text-gray-600 text-xs">└</span>}
                    {theme.name}
                  </>
                ) : (
                  <span className="text-gray-400">Sans thème</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Rename modal ────────────────────────────────────────────────────── */}
      {renamingDeck && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A1A2E] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-[#534AB7]/30">
            <h2 className="text-lg font-bold mb-4">Renommer le deck</h2>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRenameDeck()}
              autoFocus
              className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-[#534AB7] text-sm"
            />
            <div className="flex gap-3">
              <button onClick={() => setRenamingDeck(null)} className="flex-1 border border-[#534AB7]/30 rounded-xl py-2.5 text-sm hover:bg-[#534AB7]/10">Annuler</button>
              <button onClick={handleRenameDeck} className="flex-1 bg-[#534AB7] hover:bg-[#3C3489] rounded-xl py-2.5 text-sm font-semibold transition-colors">Renommer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Emoji picker ────────────────────────────────────────────────────── */}
      {emojiPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A1A2E] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-[#534AB7]/30">
            <h2 className="text-lg font-bold mb-4">Changer l&apos;icône</h2>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{emojiInput || '📚'}</span>
              <input
                type="text"
                value={emojiInput}
                onChange={e => setEmojiInput(e.target.value)}
                placeholder="Entrez un emoji"
                autoFocus
                className="flex-1 bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 focus:outline-none focus:border-[#534AB7] text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {['📚','🎯','💡','🔬','🌍','📐','🏛️','💻','🎨','🎵','🧮','⚗️','🌱','🏋️','🗺️','🧠','📊','🔭'].map(e => (
                <button key={e} onClick={() => setEmojiInput(e)} className="text-2xl hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEmojiPicker(null)} className="flex-1 border border-[#534AB7]/30 rounded-xl py-2.5 text-sm hover:bg-[#534AB7]/10">Annuler</button>
              <button onClick={handleChangeEmoji} className="flex-1 bg-[#534AB7] hover:bg-[#3C3489] rounded-xl py-2.5 text-sm font-semibold transition-colors">Changer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A1A2E] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-red-500/30">
            <h2 className="text-lg font-bold mb-2">Supprimer &quot;{deleteConfirm.name}&quot; ?</h2>
            <p className="text-gray-400 text-sm mb-5">
              Supprime aussi les {deleteConfirm.card_count} carte{deleteConfirm.card_count !== 1 ? 's' : ''}. Irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteConfirm(null); closeOptions() }} className="flex-1 border border-[#534AB7]/30 rounded-xl py-2.5 text-sm hover:bg-[#534AB7]/10">Annuler</button>
              <button onClick={() => handleDeleteDeck(deleteConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl py-2.5 text-sm font-semibold transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
