'use client'

import Link from 'next/link'
import { useState } from 'react'

interface ThemeItem {
  id: string
  name: string
  color: string
  parent_id: string | null
  due: number
}

interface ThemeNode extends ThemeItem {
  children: ThemeNode[]
}

function buildTree(themes: ThemeItem[]): ThemeNode[] {
  const map = new Map<string, ThemeNode>()
  themes.forEach(t => map.set(t.id, { ...t, children: [] }))
  const roots: ThemeNode[] = []
  themes.forEach(t => {
    const node = map.get(t.id)!
    if (t.parent_id && map.has(t.parent_id)) {
      map.get(t.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function ThemeRow({
  node, depth, collapsed, onToggle,
}: {
  node: ThemeNode
  depth: number
  collapsed: Set<string>
  onToggle: (id: string) => void
}) {
  const hasChildren = node.children.length > 0
  const isExpanded = !collapsed.has(node.id)
  const nameColor = depth === 0 ? '#F1F5F9' : depth === 1 ? '#94A3B8' : '#64748B'
  const fontWeight = depth === 0 ? 500 : 400

  return (
    <>
      <div
        className="flex items-center gap-2 py-2.5 hover:bg-[#312E81]/10 transition-colors"
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="w-4 h-4 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-muted)] flex-shrink-0"
          >
            <svg
              width="10" height="10" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth={2.5}
              className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: node.color }} />

        <span className="text-sm flex-1 truncate min-w-0" style={{ color: nameColor, fontWeight }}>
          {node.name}
        </span>

        {node.due > 0 && (
          <span className="text-xs text-[var(--accent-light)] font-semibold flex-shrink-0 tabular-nums">{node.due}</span>
        )}

        {node.due > 0 ? (
          <Link
            href={`/review/theme/${node.id}`}
            className="flex-shrink-0 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-primary)] text-[10px] font-bold rounded-md px-2 py-1 transition-colors leading-none"
          >
            ▶
          </Link>
        ) : (
          <span className="flex-shrink-0 border border-[var(--border-default)] text-[#334155] text-[10px] rounded-md px-2 py-1 leading-none cursor-not-allowed select-none">
            ▶
          </span>
        )}

        <Link
          href={`/review/theme/${node.id}?mode=free`}
          className="flex-shrink-0 border border-[var(--border-default)] hover:border-amber-500/50 text-[#64748B] hover:text-amber-400 text-[10px] font-bold rounded-md px-2 py-1 transition-colors leading-none"
        >
          ∞
        </Link>
      </div>

      {isExpanded && hasChildren && node.children.map(child => (
        <ThemeRow key={child.id} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} />
      ))}
    </>
  )
}

export default function ThemeReviewSection({ themes }: { themes: ThemeItem[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const roots = buildTree(themes)
  if (roots.length === 0) return null

  const onToggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wide">Réviser par thème</h3>
        <Link href="/decks" className="text-xs text-[var(--accent)] hover:text-[var(--accent-light)] transition-colors">
          Voir tout →
        </Link>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl overflow-hidden py-1">
        {roots.map(root => (
          <ThemeRow key={root.id} node={root} depth={0} collapsed={collapsed} onToggle={onToggle} />
        ))}
      </div>
    </div>
  )
}
