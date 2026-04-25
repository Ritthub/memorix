'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Theme, Deck } from '@/types'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const THEME_COLORS = [
  '#534AB7', '#0D9488', '#E85D4A', '#F59E0B',
  '#3B82F6', '#22C55E', '#EC4899', '#6B7280',
]

type DeckWithMeta = Deck & { card_count: number; due_count: number }

interface Props {
  initialThemes: Theme[]
  initialDecks: DeckWithMeta[]
  userId: string
}

function DeckRow({
  deck,
  onLongPress,
  onContextMenu,
}: {
  deck: DeckWithMeta
  onLongPress: (deck: DeckWithMeta) => void
  onContextMenu: (deck: DeckWithMeta, e: React.MouseEvent) => void
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: deck.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => onLongPress(deck), 500)
  }
  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
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
      onContextMenu={e => onContextMenu(deck, e)}
    >
      {/* drag handle */}
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
        onClick={() => onLongPress(deck)}
        className="text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Options"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>
    </div>
  )
}

function ThemeSection({
  theme,
  decks,
  collapsed,
  onToggle,
  onLongPress,
  onContextMenu,
}: {
  theme: Theme | null
  decks: DeckWithMeta[]
  collapsed: boolean
  onToggle: () => void
  onLongPress: (deck: DeckWithMeta) => void
  onContextMenu: (deck: DeckWithMeta, e: React.MouseEvent) => void
}) {
  const deckIds = decks.map(d => d.id)
  const color = theme?.color || '#6B7280'

  return (
    <div className="mb-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2 px-1 text-left hover:opacity-80 transition-opacity"
      >
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="font-semibold text-sm text-gray-300 flex-1">
          {theme?.name || 'Sans thème'}
        </span>
        <span className="text-xs text-gray-500">{decks.length}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className={`text-gray-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {theme && (
          <Link
            href={`/themes/${theme.id}`}
            onClick={e => e.stopPropagation()}
            className="text-gray-600 hover:text-gray-400 text-xs ml-1"
          >
            →
          </Link>
        )}
      </button>

      {!collapsed && (
        <SortableContext items={deckIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 pl-4">
            {decks.map(deck => (
              <DeckRow
                key={deck.id}
                deck={deck}
                onLongPress={onLongPress}
                onContextMenu={onContextMenu}
              />
            ))}
            <Link
              href={`/create${theme ? `?themeId=${theme.id}` : ''}`}
              className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#534AB7] py-1 transition-colors"
            >
              <span>+</span> Ajouter un deck ici
            </Link>
          </div>
        </SortableContext>
      )}
    </div>
  )
}

function KanbanColumn({
  theme,
  decks,
  onLongPress,
}: {
  theme: Theme | null
  decks: DeckWithMeta[]
  onLongPress: (deck: DeckWithMeta) => void
}) {
  const color = theme?.color || '#6B7280'
  const deckIds = decks.map(d => d.id)

  return (
    <div className="flex-shrink-0 w-64 bg-[#13131F] rounded-2xl p-4 border border-[#534AB7]/20">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-sm flex-1 truncate">{theme?.name || 'Sans thème'}</span>
        <Link
          href={`/create${theme ? `?themeId=${theme.id}` : ''}`}
          className="text-gray-500 hover:text-[#534AB7] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </Link>
      </div>
      <SortableContext items={deckIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {decks.map(deck => (
            <KanbanCard key={deck.id} deck={deck} onLongPress={onLongPress} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function KanbanCard({
  deck,
  onLongPress,
}: {
  deck: DeckWithMeta
  onLongPress: (deck: DeckWithMeta) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deck.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-[#1A1A2E] rounded-xl p-3 border border-[#534AB7]/20 cursor-grab active:cursor-grabbing touch-none"
      onTouchStart={() => { timerRef.current = setTimeout(() => onLongPress(deck), 500) }}
      onTouchEnd={() => { if (timerRef.current) clearTimeout(timerRef.current) }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{deck.icon || '📚'}</span>
        <span className="font-medium text-sm truncate flex-1">{deck.name}</span>
        {deck.due_count > 0 && (
          <span className="bg-[#534AB7] text-white text-xs font-bold rounded-full px-1.5 py-0.5">{deck.due_count}</span>
        )}
      </div>
      <p className="text-xs text-gray-500">{deck.card_count} cartes</p>
    </div>
  )
}

type OptionsDeck = DeckWithMeta | null

export default function DecksLibrary({ initialThemes, initialDecks, userId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [themes, setThemes] = useState(initialThemes)
  const [decks, setDecks] = useState(initialDecks)
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [optionsDeck, setOptionsDeck] = useState<OptionsDeck>(null)
  const [activeDeck, setActiveDeck] = useState<DeckWithMeta | null>(null)
  const [showCreateTheme, setShowCreateTheme] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [newThemeName, setNewThemeName] = useState('')
  const [newThemeColor, setNewThemeColor] = useState('#534AB7')
  const [createThemeError, setCreateThemeError] = useState<string | null>(null)
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

  // Group decks by theme
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

  const handleDragStart = (event: DragStartEvent) => {
    const deck = decks.find(d => d.id === event.active.id)
    if (deck) setActiveDeck(deck)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string
    if (activeId === overId) return

    const activeDeckObj = decks.find(d => d.id === activeId)
    if (!activeDeckObj) return

    // Check if over a theme column (kanban) or deck in different group
    const overDeck = decks.find(d => d.id === overId)
    if (!overDeck) return

    if (activeDeckObj.theme_id !== overDeck.theme_id) {
      setDecks(prev => prev.map(d => d.id === activeId ? { ...d, theme_id: overDeck.theme_id } : d))
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDeck(null)
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeDeckObj = decks.find(d => d.id === activeId)
    const overDeckObj = decks.find(d => d.id === overId)
    if (!activeDeckObj || !overDeckObj) return

    const newThemeId = overDeckObj.theme_id

    // Reorder within the group
    const groupDecks = decks.filter(d => (d.theme_id || null) === (newThemeId || null))
    const oldIdx = groupDecks.findIndex(d => d.id === activeId)
    const newIdx = groupDecks.findIndex(d => d.id === overId)

    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(groupDecks, oldIdx, newIdx)
    const others = decks.filter(d => (d.theme_id || null) !== (newThemeId || null))
    const newDecks = [...others, ...reordered].map((d, i) => ({
      ...d,
      position: decks.findIndex(od => od.id === d.id),
    }))

    setDecks(prev => {
      const groupOther = prev.filter(d => (d.theme_id || null) !== (newThemeId || null))
      return [...groupOther, ...reordered]
    })

    // Persist to Supabase
    await supabase
      .from('decks')
      .update({ theme_id: newThemeId || null })
      .eq('id', activeId)

    // Update positions
    await Promise.all(
      reordered.map((d, i) => supabase.from('decks').update({ position: i }).eq('id', d.id))
    )
  }

  const handleCreateTheme = async () => {
    if (!newThemeName.trim()) return
    setCreateThemeError(null)
    const { data, error } = await supabase
      .from('themes')
      .insert({ user_id: userId, name: newThemeName.trim(), color: newThemeColor, position: themes.length })
      .select()
      .single()
    if (error) {
      setCreateThemeError(error.message.includes('does not exist')
        ? 'La migration SQL n\'a pas encore été exécutée. Ouvre le SQL editor Supabase et exécute le fichier supabase/migrations/20260425_themes.sql'
        : error.message)
      return
    }
    if (data) {
      setThemes(prev => [...prev, data as Theme])
      setNewThemeName('')
      setNewThemeColor('#534AB7')
      setShowCreateTheme(false)
    }
  }

  const handleDeleteDeck = async (deck: DeckWithMeta) => {
    await supabase.from('decks').delete().eq('id', deck.id)
    setDecks(prev => prev.filter(d => d.id !== deck.id))
    setDeleteConfirm(null)
    setOptionsDeck(null)
  }

  const handleMoveDeck = async (deck: DeckWithMeta, themeId: string | null) => {
    await supabase.from('decks').update({ theme_id: themeId }).eq('id', deck.id)
    setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, theme_id: themeId } : d))
    setMovingDeck(null)
    setOptionsDeck(null)
  }

  const handleRenameDeck = async () => {
    if (!renamingDeck || !renameValue.trim()) return
    await supabase.from('decks').update({ name: renameValue.trim() }).eq('id', renamingDeck.id)
    setDecks(prev => prev.map(d => d.id === renamingDeck.id ? { ...d, name: renameValue.trim() } : d))
    setRenamingDeck(null)
    setOptionsDeck(null)
  }

  const handleChangeEmoji = async () => {
    if (!emojiPicker || !emojiInput.trim()) return
    await supabase.from('decks').update({ icon: emojiInput.trim() }).eq('id', emojiPicker.id)
    setDecks(prev => prev.map(d => d.id === emojiPicker.id ? { ...d, icon: emojiInput.trim() } : d))
    setEmojiPicker(null)
    setOptionsDeck(null)
  }

  const openOptions = (deck: DeckWithMeta) => setOptionsDeck(deck)
  const handleContextMenu = (deck: DeckWithMeta, e: React.MouseEvent) => {
    e.preventDefault()
    openOptions(deck)
  }

  const groupedDecks = grouped()

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

          {/* View toggle */}
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

          {/* Create menu */}
          <div className="relative">
            <button
              onClick={() => setShowCreateMenu(v => !v)}
              className="bg-[#534AB7] hover:bg-[#3C3489] rounded-xl w-9 h-9 flex items-center justify-center font-bold text-xl transition-colors"
            >
              +
            </button>
            {showCreateMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCreateMenu(false)} />
                <div className="absolute right-0 top-11 z-50 bg-[#1A1A2E] border border-[#534AB7]/30 rounded-xl py-2 w-48 shadow-xl">
                  <Link
                    href="/create"
                    onClick={() => setShowCreateMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#534AB7]/20 transition-colors text-sm"
                  >
                    <span>📚</span> Nouveau deck
                  </Link>
                  <button
                    onClick={() => { setShowCreateMenu(false); setShowCreateTheme(true); setCreateThemeError(null) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#534AB7]/20 transition-colors text-sm text-left"
                  >
                    <span>🗂️</span> Nouveau thème
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search */}
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
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {view === 'list' ? (
            <div>
              {themes.map(theme => {
                const theseDecks = groupedDecks.get(theme.id) || []
                const key = theme.id
                return (
                  <ThemeSection
                    key={key}
                    theme={theme}
                    decks={theseDecks}
                    collapsed={collapsed[key] ?? false}
                    onToggle={() => setCollapsed(c => ({ ...c, [key]: !c[key] }))}
                    onLongPress={openOptions}
                    onContextMenu={handleContextMenu}
                  />
                )
              })}
              {/* No theme section */}
              {(() => {
                const noThemeDecks = groupedDecks.get(null) || []
                return (
                  <ThemeSection
                    theme={null}
                    decks={noThemeDecks}
                    collapsed={collapsed['__none__'] ?? false}
                    onToggle={() => setCollapsed(c => ({ ...c, '__none__': !c['__none__'] }))}
                    onLongPress={openOptions}
                    onContextMenu={handleContextMenu}
                  />
                )
              })()}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
              {themes.map(theme => (
                <KanbanColumn
                  key={theme.id}
                  theme={theme}
                  decks={groupedDecks.get(theme.id) || []}
                  onLongPress={openOptions}
                />
              ))}
              <KanbanColumn
                theme={null}
                decks={groupedDecks.get(null) || []}
                onLongPress={openOptions}
              />
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

      {/* Create Theme Modal */}
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
              className="w-full bg-[#0D0D1A] border border-[#534AB7]/30 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-[#534AB7] text-sm"
            />
            {createThemeError && (
              <p className="text-red-400 text-xs mb-4 bg-red-500/10 rounded-xl p-3">{createThemeError}</p>
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

      {/* Options Sheet */}
      {optionsDeck && !movingDeck && !renamingDeck && !deleteConfirm && !emojiPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOptionsDeck(null)}>
          <div className="bg-[#1A1A2E] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#534AB7]/30" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#534AB7]/10 mb-1">
              <span className="text-2xl">{optionsDeck.icon || '📚'}</span>
              <span className="font-semibold truncate">{optionsDeck.name}</span>
            </div>
            {[
              { label: '⚡ Réviser maintenant', action: () => { router.push(`/review/${optionsDeck.id}`); setOptionsDeck(null) } },
              { label: '➕ Ajouter des cartes', action: () => { router.push(`/create?deckId=${optionsDeck.id}`); setOptionsDeck(null) } },
              { label: '🗂️ Déplacer vers un thème', action: () => setMovingDeck(optionsDeck) },
              { label: '✏️ Renommer', action: () => { setRenamingDeck(optionsDeck); setRenameValue(optionsDeck.name) } },
              { label: '🎨 Changer l\'icône', action: () => { setEmojiPicker(optionsDeck); setEmojiInput(optionsDeck.icon || '') } },
            ].map(({ label, action }) => (
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

      {/* Move to theme sub-sheet */}
      {movingDeck && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setMovingDeck(null)}>
          <div className="bg-[#1A1A2E] rounded-t-3xl p-2 w-full max-w-sm border-t border-[#534AB7]/30" onClick={e => e.stopPropagation()}>
            <p className="px-4 py-3 text-sm font-semibold text-gray-400 border-b border-[#534AB7]/10 mb-1">Déplacer vers…</p>
            <button onClick={() => handleMoveDeck(movingDeck, null)} className="w-full text-left px-4 py-3 hover:bg-[#534AB7]/10 rounded-xl text-sm transition-colors">
              Sans thème
            </button>
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => handleMoveDeck(movingDeck, t.id)}
                className="w-full text-left px-4 py-3 hover:bg-[#534AB7]/10 rounded-xl text-sm transition-colors flex items-center gap-2"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rename modal */}
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

      {/* Emoji picker modal */}
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

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A1A2E] rounded-t-3xl sm:rounded-2xl p-6 w-full max-w-sm border border-red-500/30">
            <h2 className="text-lg font-bold mb-2">Supprimer &quot;{deleteConfirm.name}&quot; ?</h2>
            <p className="text-gray-400 text-sm mb-5">
              Supprimer aussi les {deleteConfirm.card_count} carte{deleteConfirm.card_count !== 1 ? 's' : ''} ?
              Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteConfirm(null); setOptionsDeck(null) }} className="flex-1 border border-[#534AB7]/30 rounded-xl py-2.5 text-sm hover:bg-[#534AB7]/10">Annuler</button>
              <button onClick={() => handleDeleteDeck(deleteConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl py-2.5 text-sm font-semibold transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
