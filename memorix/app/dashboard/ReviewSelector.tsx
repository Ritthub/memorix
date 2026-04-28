'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Theme } from '@/types'

interface Props {
  dueCount: number
  themes: Theme[]
  themeDueCounts: Record<string, number>
  noThemeDue: number
}

type Selection = Set<string> // theme IDs + 'none' for no-theme decks

export default function ReviewSelector({ dueCount, themes, themeDueCounts, noThemeDue }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [themeListOpen, setThemeListOpen] = useState(false)

  const parentThemes = themes.filter(t => !t.parent_id)
  const subThemesByParent = (parentId: string) => themes.filter(t => t.parent_id === parentId)
  const allIds: string[] = [
    ...themes.map(t => t.id),
    ...(noThemeDue > 0 ? ['none'] : []),
  ]

  const [selected, setSelected] = useState<Selection>(new Set(allIds))
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())

  const allSelected = allIds.every(id => selected.has(id))

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds))
  }

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleParent = (theme: Theme) => {
    const subs = subThemesByParent(theme.id)
    const relatedIds = [theme.id, ...subs.map(s => s.id)]
    const allOn = relatedIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      relatedIds.forEach(id => allOn ? next.delete(id) : next.add(id))
      return next
    })
  }

  const selectedDue = () => {
    let count = 0
    themes.forEach(t => {
      if (selected.has(t.id)) count += themeDueCounts[t.id] || 0
    })
    if (selected.has('none')) count += noThemeDue
    return count
  }

  // IC-8: use router.push instead of <a href> for soft navigation
  const handleStart = () => {
    if (allSelected || selected.size === 0) {
      router.push('/review')
      return
    }
    const themeIds = [...selected].filter(id => id !== 'none')
    const noTheme = selected.has('none')
    const params = new URLSearchParams()
    if (themeIds.length > 0) params.set('themeIds', themeIds.join(','))
    if (noTheme) params.set('noTheme', '1')
    router.push(`/review/custom?${params.toString()}`)
  }

  if (dueCount === 0) {
    return (
      <div className="bg-[#1E293B] rounded-2xl p-5 text-center mb-8 border border-[#1E293B]">
        <p className="text-gray-400 text-sm">✅ Toutes les révisions du jour sont terminées</p>
      </div>
    )
  }

  // No themes → single button (IC-8: was <a>, now button+router)
  if (themes.length === 0) {
    return (
      <button
        onClick={() => router.push('/review')}
        className="flex items-center justify-center gap-3 w-full bg-gradient-to-r from-[#4338CA] to-[#7C6FCD] hover:from-[#3730A3] hover:to-[#4338CA] rounded-2xl p-5 font-bold mb-8 transition-all shadow-lg shadow-[#4338CA]/25 text-lg"
      >
        <span className="text-2xl">⚡</span>
        <span>Réviser maintenant</span>
        <span className="bg-white/20 rounded-full px-3 py-0.5 text-sm font-normal">{dueCount} carte{dueCount > 1 ? 's' : ''}</span>
      </button>
    )
  }

  // Themes with due counts for the quick-access list
  const themesWithDue = parentThemes
    .map(t => {
      const subs = subThemesByParent(t.id)
      const due = [t, ...subs].reduce((s, x) => s + (themeDueCounts[x.id] || 0), 0)
      return { theme: t, due }
    })
    .filter(x => x.due > 0)

  return (
    <>
      <div className="flex gap-3 mb-4">
        {/* IC-8: was <a href="/review">, now button+router */}
        <button
          onClick={() => router.push('/review')}
          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#4338CA] to-[#7C6FCD] hover:from-[#3730A3] hover:to-[#4338CA] rounded-2xl p-4 font-bold transition-all shadow-lg shadow-[#4338CA]/25"
        >
          <span>⚡</span>
          <span>Tout réviser</span>
          <span className="bg-white/20 rounded-full px-2.5 py-0.5 text-sm font-normal">{dueCount}</span>
        </button>
        <button
          onClick={() => setOpen(true)}
          className="bg-[#1E293B] border border-[#4338CA]/40 hover:border-[#4338CA] rounded-2xl px-4 py-4 transition-colors"
          title="Choisir les thèmes"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
          </svg>
        </button>
      </div>

      {/* Phase 3: quick per-theme review links */}
      {themesWithDue.length > 1 && (
        <div className="mb-8">
          <button
            onClick={() => setThemeListOpen(v => !v)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={`transition-transform ${themeListOpen ? 'rotate-90' : ''}`}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Réviser par thème
          </button>
          {themeListOpen && (
            <div className="bg-[#1E293B] rounded-xl border border-[#334155] overflow-hidden">
              {themesWithDue.map(({ theme, due }) => (
                <Link
                  key={theme.id}
                  href={`/review/theme/${theme.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#312E81]/20 transition-colors border-b border-[#1E293B] last:border-0"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: theme.color }} />
                  <span className="text-sm flex-1 text-gray-300">{theme.name}</span>
                  <span className="text-xs text-gray-500 tabular-nums">{due}</span>
                  <span className="text-[#4338CA] text-xs">▶</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="bg-[#1E293B] rounded-t-3xl sm:rounded-2xl w-full max-w-sm border border-[#334155] max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-[#1E293B] flex-shrink-0">
              <h2 className="text-lg font-bold">Choisir les thèmes</h2>
              <p className="text-gray-500 text-xs mt-0.5">Sélectionne ce que tu veux réviser</p>
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1 px-3 py-2">
              {/* All toggle */}
              <button
                onClick={toggleAll}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#312E81]/20 transition-colors"
              >
                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  allSelected ? 'bg-[#4338CA] border-[#4338CA]' : 'border-gray-600'
                }`}>
                  {allSelected && <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                </span>
                <span className="font-semibold flex-1 text-sm text-left">Toutes les cartes</span>
                <span className="text-xs text-gray-500 bg-[#312E81]/30 rounded-full px-2 py-0.5">{dueCount}</span>
              </button>

              <div className="border-t border-[#1E293B] my-1" />

              {/* Parent themes */}
              {parentThemes.map(theme => {
                const subs = subThemesByParent(theme.id)
                const relatedIds = [theme.id, ...subs.map(s => s.id)]
                const allOn = relatedIds.every(id => selected.has(id))
                const someOn = relatedIds.some(id => selected.has(id))
                const due = relatedIds.reduce((s, id) => s + (themeDueCounts[id] || 0), 0)
                const isExpanded = expandedParents.has(theme.id)

                return (
                  <div key={theme.id}>
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleParent(theme)}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#312E81]/20 transition-colors"
                      >
                        <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          allOn ? 'bg-[#4338CA] border-[#4338CA]' : someOn ? 'bg-[#4338CA]/40 border-[#4338CA]/40' : 'border-gray-600'
                        }`}>
                          {allOn && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          {!allOn && someOn && <span className="w-2 h-2 bg-white rounded-sm" />}
                        </span>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: theme.color }} />
                        <span className="text-sm flex-1 text-left">{theme.name}</span>
                        {due > 0 && <span className="text-xs text-gray-500">{due}</span>}
                      </button>
                      {subs.length > 0 && (
                        <button
                          onClick={() => setExpandedParents(prev => {
                            const next = new Set(prev)
                            next.has(theme.id) ? next.delete(theme.id) : next.add(theme.id)
                            return next
                          })}
                          className="pr-3 text-gray-600 hover:text-gray-400"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                            className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* Sub-themes */}
                    {isExpanded && subs.map(sub => {
                      const subDue = themeDueCounts[sub.id] || 0
                      return (
                        <button
                          key={sub.id}
                          onClick={() => toggle(sub.id)}
                          className="w-full flex items-center gap-3 pl-8 pr-3 py-2 rounded-xl hover:bg-[#312E81]/20 transition-colors"
                        >
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            selected.has(sub.id) ? 'bg-[#4338CA] border-[#4338CA]' : 'border-gray-600'
                          }`}>
                            {selected.has(sub.id) && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </span>
                          <span className="text-gray-500 text-xs">└</span>
                          <span className="text-sm flex-1 text-left text-gray-300">{sub.name}</span>
                          {subDue > 0 && <span className="text-xs text-gray-500">{subDue}</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}

              {/* No theme */}
              {noThemeDue > 0 && (
                <button
                  onClick={() => toggle('none')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#312E81]/20 transition-colors"
                >
                  <span className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected.has('none') ? 'bg-[#4338CA] border-[#4338CA]' : 'border-gray-600'
                  }`}>
                    {selected.has('none') && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-600 flex-shrink-0" />
                  <span className="text-sm flex-1 text-left text-gray-400">Sans thème</span>
                  <span className="text-xs text-gray-500">{noThemeDue}</span>
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#1E293B] flex-shrink-0">
              <button
                onClick={handleStart}
                disabled={selected.size === 0}
                className="w-full bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-40 rounded-xl py-3.5 font-bold transition-colors"
              >
                Réviser {selectedDue() > 0 ? `— ${selectedDue()} carte${selectedDue() > 1 ? 's' : ''}` : 'la sélection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
