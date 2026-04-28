import Link from 'next/link'

interface ThemeItem {
  id: string
  name: string
  color: string
  due: number
}

export default function ThemeReviewSection({ themes }: { themes: ThemeItem[] }) {
  if (themes.length === 0) return null

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#94A3B8] uppercase tracking-wide">Réviser par thème</h3>
        <Link href="/decks" className="text-xs text-[#4338CA] hover:text-[#818CF8] transition-colors">
          Voir tout →
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {themes.map(theme => (
          <div
            key={theme.id}
            className="flex-shrink-0 bg-[#1E293B] border border-[#334155] rounded-xl p-3 flex flex-col gap-2"
            style={{ minWidth: 160 }}
          >
            {/* Theme identity */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: theme.color }} />
              <span className="text-sm font-medium text-[#F1F5F9] truncate">{theme.name}</span>
            </div>

            {/* Due count */}
            <p className="text-xs text-[#475569]">
              {theme.due > 0
                ? <><span className="text-[#818CF8] font-semibold">{theme.due}</span> due{theme.due > 1 ? 's' : ''}</>
                : 'À jour ✓'
              }
            </p>

            {/* Buttons */}
            <div className="flex flex-col gap-1.5 mt-1">
              {theme.due > 0 ? (
                <Link
                  href={`/review/theme/${theme.id}`}
                  className="flex items-center justify-center gap-1 bg-[#4338CA] hover:bg-[#3730A3] text-white text-xs font-medium rounded-lg py-1.5 transition-colors"
                >
                  ▶ Réviser ({theme.due})
                </Link>
              ) : (
                <span className="flex items-center justify-center gap-1 border border-[#334155] text-[#334155] text-xs rounded-lg py-1.5 cursor-not-allowed select-none">
                  ▶ Réviser (0)
                </span>
              )}
              <Link
                href={`/review/theme/${theme.id}?mode=free`}
                className="flex items-center justify-center gap-1 border border-[#334155] hover:border-amber-500/50 text-[#64748B] hover:text-amber-400 text-xs font-medium rounded-lg py-1.5 transition-colors"
              >
                ∞ Tout réviser
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
