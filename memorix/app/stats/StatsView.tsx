'use client'
import Link from 'next/link'

type ReviewRow = {
  reviewed_at: string
  rating: number
  retrievability?: number
  lapses?: number
  card_id?: string
}

type HardCard = {
  card_id: string
  lapses: number
  rating: number
  cards: { question: string; answer: string; deck_id: string; decks: { name: string } | null } | null
}

type Props = {
  reviews365: ReviewRow[]
  hardCards: HardCard[]
  totalCards: number
  mastered: number
  totalReviews: number
  successRate: number
}

// Build a day → count map from ISO date strings
function buildDayMap(reviews: ReviewRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of reviews) {
    const day = r.reviewed_at.slice(0, 10)
    map.set(day, (map.get(day) || 0) + 1)
  }
  return map
}

// Build daily success rate for the last 30 days
function buildRetentionCurve(reviews: ReviewRow[]): { day: string; rate: number; count: number }[] {
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const recent = reviews.filter(r => new Date(r.reviewed_at) >= since30)
  const dayMap = new Map<string, { good: number; total: number }>()
  for (const r of recent) {
    const day = r.reviewed_at.slice(0, 10)
    const entry = dayMap.get(day) || { good: 0, total: 0 }
    entry.total++
    if (r.rating >= 3) entry.good++
    dayMap.set(day, entry)
  }
  const result: { day: string; rate: number; count: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000)
    const day = d.toISOString().slice(0, 10)
    const entry = dayMap.get(day)
    result.push({ day, rate: entry ? entry.good / entry.total : -1, count: entry?.total || 0 })
  }
  return result
}

function heatColor(count: number): string {
  if (count === 0) return '#1A1A2E'
  if (count <= 2) return '#2D2A6E'
  if (count <= 5) return '#3C3489'
  if (count <= 10) return '#534AB7'
  return '#AFA9EC'
}

// Generate the 52-week grid (Mon–Sun columns, most recent week last)
function buildWeekGrid(dayMap: Map<string, number>): { date: string; count: number }[][] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start on the Monday 52 weeks ago
  const start = new Date(today)
  start.setDate(start.getDate() - 364)
  // Align to Monday
  const dow = (start.getDay() + 6) % 7 // 0=Mon
  start.setDate(start.getDate() - dow)

  const weeks: { date: string; count: number }[][] = []
  let current = new Date(start)
  while (current <= today) {
    const week: { date: string; count: number }[] = []
    for (let d = 0; d < 7; d++) {
      const iso = current.toISOString().slice(0, 10)
      week.push({ date: iso, count: dayMap.get(iso) || 0 })
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export default function StatsView({ reviews365, hardCards, totalCards, mastered, totalReviews, successRate }: Props) {
  const dayMap = buildDayMap(reviews365)
  const weekGrid = buildWeekGrid(dayMap)
  const retentionCurve = buildRetentionCurve(reviews365)

  const maxCount = Math.max(...weekGrid.flatMap(w => w.map(d => d.count)), 1)
  const curveMax = Math.max(...retentionCurve.filter(d => d.rate >= 0).map(d => d.count), 1)

  // Month labels
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weekGrid.forEach((week, i) => {
    const month = new Date(week[0].date).getMonth()
    if (month !== lastMonth) {
      monthLabels.push({ label: MONTHS[month], col: i })
      lastMonth = month
    }
  })

  const masteredPct = totalCards > 0 ? Math.round((mastered / totalCards) * 100) : 0

  return (
    <div className="min-h-screen bg-[#0D0D1A] text-white pb-24">
      <header className="border-b border-[#534AB7]/20 px-6 py-4 flex items-center gap-4">
        <h1 className="text-xl font-bold text-[#534AB7]">Statistiques</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Cartes totales', value: totalCards },
            { label: 'Maîtrisées', value: `${masteredPct}%` },
            { label: 'Révisées (365j)', value: totalReviews },
            { label: 'Taux de succès', value: `${successRate}%` },
          ].map(kpi => (
            <div key={kpi.label} className="bg-[#1A1A2E] rounded-2xl p-4 border border-[#534AB7]/20 text-center">
              <div className="text-2xl font-bold text-[#534AB7]">{kpi.value}</div>
              <div className="text-gray-400 text-xs mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Heatmap */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">Activité de révision</h2>
          <div className="bg-[#1A1A2E] rounded-2xl p-4 border border-[#534AB7]/20 overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Month labels */}
              <div className="flex mb-1" style={{ paddingLeft: '20px' }}>
                {weekGrid.map((_, i) => {
                  const ml = monthLabels.find(m => m.col === i)
                  return (
                    <div key={i} className="flex-1 text-[9px] text-gray-600 truncate">
                      {ml?.label || ''}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-[2px]">
                {/* Day labels */}
                <div className="flex flex-col gap-[2px] mr-1">
                  {DAYS.map((d, i) => (
                    <div key={i} className="h-[10px] w-[14px] text-[8px] text-gray-600 flex items-center">{d}</div>
                  ))}
                </div>
                {/* Week columns */}
                {weekGrid.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.map((day, di) => (
                      <div
                        key={di}
                        title={`${day.date}: ${day.count} révision${day.count !== 1 ? 's' : ''}`}
                        className="rounded-sm"
                        style={{
                          width: 10,
                          height: 10,
                          backgroundColor: heatColor(day.count),
                          opacity: day.count === 0 ? 0.4 : 1,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2 justify-end">
                <span className="text-[9px] text-gray-600">Moins</span>
                {[0, 2, 5, 10, 15].map(c => (
                  <div key={c} className="rounded-sm" style={{ width: 10, height: 10, backgroundColor: heatColor(c), opacity: c === 0 ? 0.4 : 1 }} />
                ))}
                <span className="text-[9px] text-gray-600">Plus</span>
              </div>
            </div>
          </div>
        </section>

        {/* Retention curve (30 days) */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">Taux de succès — 30 derniers jours</h2>
          <div className="bg-[#1A1A2E] rounded-2xl p-4 border border-[#534AB7]/20">
            {retentionCurve.every(d => d.rate < 0) ? (
              <p className="text-gray-500 text-sm text-center py-6">Pas encore de données de révision.</p>
            ) : (
              <div className="relative h-36">
                <svg width="100%" height="100%" viewBox="0 0 600 120" preserveAspectRatio="none">
                  {/* Grid lines at 25%, 50%, 75%, 100% */}
                  {[0.25, 0.5, 0.75, 1].map(y => (
                    <line key={y} x1={0} y1={120 - y * 110} x2={600} y2={120 - y * 110} stroke="#534AB7" strokeWidth={0.5} strokeOpacity={0.2} />
                  ))}
                  {/* Bars */}
                  {retentionCurve.map((d, i) => {
                    const x = (i / 30) * 600
                    const w = 600 / 30 - 2
                    if (d.rate < 0) return null
                    const h = d.rate * 110
                    return (
                      <rect
                        key={i}
                        x={x + 1}
                        y={120 - h}
                        width={w}
                        height={h}
                        rx={2}
                        fill={d.rate >= 0.7 ? '#534AB7' : d.rate >= 0.5 ? '#7C6FCD' : '#E879F9'}
                        opacity={0.85}
                      />
                    )
                  })}
                </svg>
                {/* Y axis labels */}
                <div className="absolute top-0 left-0 h-full flex flex-col justify-between pointer-events-none">
                  <span className="text-[9px] text-gray-600">100%</span>
                  <span className="text-[9px] text-gray-600">75%</span>
                  <span className="text-[9px] text-gray-600">50%</span>
                  <span className="text-[9px] text-gray-600">25%</span>
                  <span className="text-[9px] text-gray-600">0%</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Hardest cards */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">Cartes les plus difficiles</h2>
          {hardCards.length === 0 ? (
            <div className="bg-[#1A1A2E] rounded-2xl p-6 border border-[#534AB7]/20 text-center text-gray-500 text-sm">
              Aucune carte difficile — excellent travail ! 🏆
            </div>
          ) : (
            <div className="space-y-2">
              {hardCards.slice(0, 8).map((hc, i) => (
                <div key={i} className="bg-[#1A1A2E] rounded-xl p-4 border border-[#534AB7]/20 flex items-start gap-3">
                  <span className="text-red-400 font-bold text-sm mt-0.5 shrink-0">{hc.lapses}×</span>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{hc.cards?.question || '—'}</p>
                    <p className="text-gray-500 text-xs truncate mt-0.5">{hc.cards?.decks?.name || 'Deck inconnu'}</p>
                  </div>
                  {hc.cards?.deck_id && (
                    <Link
                      href={`/decks/${hc.cards.deck_id}`}
                      className="shrink-0 text-[#534AB7] text-xs hover:underline"
                    >
                      Voir →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
