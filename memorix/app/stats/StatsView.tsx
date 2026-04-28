'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const LineChart = dynamic(() => import('./Charts').then(m => m.LineChart), { ssr: false })
const DonutChart = dynamic(() => import('./Charts').then(m => m.DonutChart), { ssr: false })

// ── Types ──────────────────────────────────────────────────────────────────────

type ReviewRow = {
  reviewed_at: string | null
  rating: number | null
  scheduled_at?: string | null
  scheduled_days?: number | null
}

type HardCard = {
  card_id: string
  failRate: number
  question: string
  deck_id: string | null
  deck_name: string | null
  total: number
}

type ForecastDay = {
  day: string
  label: string
  count: number
}

type Period = '7j' | '30j' | '90j' | 'tout'

type Props = {
  reviews: ReviewRow[]
  hardCards: HardCard[]
  forecast: ForecastDay[]
  streak: number
  retentionTarget: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<Period, number | null> = {
  '7j': 7, '30j': 30, '90j': 90, 'tout': null,
}

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const HEATMAP_ROWS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

// ── Utilities ──────────────────────────────────────────────────────────────────

function heatColor(count: number): string {
  if (count === 0) return '#0F172A'
  if (count <= 2) return '#3C3489'
  if (count <= 5) return '#4338CA'
  if (count <= 10) return '#6D62E0'
  return '#818CF8'
}

function forecastColor(count: number): string {
  if (count <= 5) return '#4338CA'
  if (count <= 15) return '#F59E0B'
  return '#E85D4A'
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function buildWeekGrid(reviews: ReviewRow[]): { date: string; count: number }[][] {
  const dayMap = new Map<string, number>()
  for (const r of reviews) {
    if (!r.reviewed_at) continue
    const day = r.reviewed_at.slice(0, 10)
    dayMap.set(day, (dayMap.get(day) || 0) + 1)
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - 364)
  const dow = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - dow)

  const weeks: { date: string; count: number }[][] = []
  const cur = new Date(start)
  while (cur <= today) {
    const week: { date: string; count: number }[] = []
    for (let d = 0; d < 7; d++) {
      const iso = cur.toISOString().slice(0, 10)
      week.push({ date: iso, count: dayMap.get(iso) || 0 })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

function filterReviews(reviews: ReviewRow[], period: Period): ReviewRow[] {
  const days = PERIOD_DAYS[period]
  if (!days) return reviews
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10)
  return reviews.filter(r => r.reviewed_at && r.reviewed_at.slice(0, 10) >= cutoff)
}

type SuccessPoint = { label: string; rate: number | null; count: number }

function buildSuccessRateData(reviews: ReviewRow[], period: Period): SuccessPoint[] {
  const days = period === '7j' ? 7 : period === '30j' ? 30 : period === '90j' ? 90 : 365

  if (days <= 30) {
    const result: SuccessPoint[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const day = d.toISOString().slice(0, 10)
      const dayR = reviews.filter(r => r.reviewed_at?.slice(0, 10) === day)
      const good = dayR.filter(r => (r.rating || 0) >= 2).length
      const label = days === 7
        ? DAYS_FR[d.getDay()]
        : `${d.getDate()}/${d.getMonth() + 1}`
      result.push({ label, rate: dayR.length > 0 ? Math.round(good / dayR.length * 100) : null, count: dayR.length })
    }
    return result
  }

  // Weekly buckets for 90j / tout
  const weeks = days === 90 ? 13 : 52
  const result: SuccessPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const endD = new Date()
    endD.setDate(endD.getDate() - i * 7)
    const endStr = endD.toISOString().slice(0, 10)
    const startD = new Date(endD)
    startD.setDate(startD.getDate() - 6)
    const startStr = startD.toISOString().slice(0, 10)
    const weekR = reviews.filter(r =>
      r.reviewed_at && r.reviewed_at.slice(0, 10) >= startStr && r.reviewed_at.slice(0, 10) <= endStr
    )
    const good = weekR.filter(r => (r.rating || 0) >= 2).length
    const label = `${startD.getDate()} ${MONTHS_FR[startD.getMonth()]}`
    result.push({ label, rate: weekR.length > 0 ? Math.round(good / weekR.length * 100) : null, count: weekR.length })
  }
  return result
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function StatsView({ reviews, hardCards, forecast, streak, retentionTarget }: Props) {
  const [period, setPeriod] = useState<Period>('30j')

  const weekGrid = useMemo(() => buildWeekGrid(reviews), [reviews])

  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = []
    let last = -1
    weekGrid.forEach((week, i) => {
      const m = new Date(week[0].date + 'T00:00:00').getMonth()
      if (m !== last) { labels.push({ label: MONTHS_FR[m], col: i }); last = m }
    })
    return labels
  }, [weekGrid])

  const filtered = useMemo(() => filterReviews(reviews, period), [reviews, period])

  const totalReviewed = filtered.length
  const retentionRate = filtered.length > 0
    ? Math.round(filtered.filter(r => (r.rating || 0) >= 2).length / filtered.length * 100)
    : 0
  const yearRate = reviews.length > 0
    ? Math.round(reviews.filter(r => (r.rating || 0) >= 2).length / reviews.length * 100)
    : 0

  const ratingDist = useMemo(() => {
    const non = filtered.filter(r => r.rating === 1).length
    const hes = filtered.filter(r => r.rating === 2).length
    const oui = filtered.filter(r => (r.rating || 0) >= 3).length
    const total = non + hes + oui
    return { non, hes, oui, total }
  }, [filtered])

  const successData = useMemo(() => buildSuccessRateData(reviews, period), [reviews, period])
  const maxForecast = Math.max(1, ...forecast.map(f => f.count))

  const lineData = {
    labels: successData.map(p => p.label),
    datasets: [{
      data: successData.map(p => p.rate),
      borderColor: '#818CF8',
      backgroundColor: 'rgba(129,140,248,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: '#818CF8',
      borderWidth: 2,
      spanGaps: true,
    }],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1E293B',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#94A3B8',
        bodyColor: '#F1F5F9',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        callbacks: { label: (ctx: any) => ctx.parsed.y !== null ? `${ctx.parsed.y}%` : 'Aucune révision' },
      },
    },
    scales: {
      y: {
        min: 0, max: 100,
        grid: { color: 'rgba(255,255,255,0.04)' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ticks: { color: '#64748B', callback: (v: any) => `${v}%`, stepSize: 25 },
        border: { display: false },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#64748B', font: { size: 10 }, maxRotation: 0 },
        border: { display: false },
      },
    },
  }

  const doughnutData = {
    labels: ['Oui', 'Hésitation', 'Non'],
    datasets: [{
      data: [ratingDist.oui, ratingDist.hes, ratingDist.non],
      backgroundColor: ['#0F6E56', '#334155', '#993C1D'],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1E293B',
        borderColor: '#334155',
        borderWidth: 1,
        titleColor: '#94A3B8',
        bodyColor: '#F1F5F9',
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (ctx: any) => {
            const pct = ratingDist.total > 0 ? Math.round(ctx.parsed / ratingDist.total * 100) : 0
            return `${ctx.label} : ${ctx.parsed} (${pct}%)`
          },
        },
      },
    },
  }

  const PERIODS: { key: Period; label: string }[] = [
    { key: '7j', label: '7 j' },
    { key: '30j', label: '30 j' },
    { key: '90j', label: '90 j' },
    { key: 'tout', label: 'Tout' },
  ]

  return (
    <div className="min-h-screen bg-[#0F172A] text-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-b border-[#334155] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[#F1F5F9]">Statistiques</h1>
          <div className="flex items-center gap-0.5 bg-[#1E293B] rounded-xl p-1">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  period === p.key
                    ? 'bg-[#4338CA] text-white shadow-sm'
                    : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── 4 KPIs ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <div className="text-2xl font-bold text-[#818CF8] tabular-nums">{totalReviewed.toLocaleString('fr')}</div>
            <div className="text-[10px] text-[#64748B] mt-0.5">révisions</div>
            <div className="text-xs text-[#94A3B8] mt-1">Révisées</div>
          </div>
          <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <div className={`text-2xl font-bold tabular-nums ${retentionRate >= retentionTarget ? 'text-emerald-400' : 'text-[#818CF8]'}`}>
              {retentionRate}%
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5">objectif {retentionTarget}%</div>
            <div className="text-xs text-[#94A3B8] mt-1">Rétention</div>
          </div>
          <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <div className="text-2xl font-bold text-[#818CF8] tabular-nums">{streak}</div>
            <div className="text-[10px] text-[#64748B] mt-0.5">{streak === 1 ? 'jour consécutif' : 'jours consécutifs'}</div>
            <div className="text-xs text-[#94A3B8] mt-1">Streak {streak > 0 ? '🔥' : ''}</div>
          </div>
          <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <div className="text-2xl font-bold text-[#818CF8] tabular-nums">{yearRate}%</div>
            <div className="text-[10px] text-[#64748B] mt-0.5">sur 1 an</div>
            <div className="text-xs text-[#94A3B8] mt-1">Succès global</div>
          </div>
        </div>

        {/* ── Heatmap 52 semaines ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-[#64748B] uppercase tracking-widest mb-3">Activité — 52 semaines</h2>
          <div className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155] overflow-x-auto">
            <div className="min-w-[560px]">
              {/* Month labels */}
              <div className="flex mb-1" style={{ paddingLeft: 20 }}>
                {weekGrid.map((_, i) => {
                  const ml = monthLabels.find(m => m.col === i)
                  return (
                    <div key={i} className="flex-1 text-[9px] text-[#475569] truncate leading-none">
                      {ml?.label ?? ''}
                    </div>
                  )
                })}
              </div>
              {/* Grid */}
              <div className="flex gap-[2px]">
                <div className="flex flex-col gap-[2px] mr-1">
                  {HEATMAP_ROWS.map((d, i) => (
                    <div key={i} className="h-[10px] w-[14px] text-[8px] text-[#475569] flex items-center leading-none">
                      {i % 2 === 0 ? d : ''}
                    </div>
                  ))}
                </div>
                {weekGrid.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.map((day, di) => (
                      <div
                        key={di}
                        title={
                          day.count > 0
                            ? `${day.count} révision${day.count > 1 ? 's' : ''} le ${fmtDate(day.date)}`
                            : fmtDate(day.date)
                        }
                        className="rounded-[2px] cursor-default"
                        style={{
                          width: 10, height: 10,
                          backgroundColor: heatColor(day.count),
                          opacity: day.count === 0 ? 0.45 : 1,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-1.5 mt-2.5 justify-end">
                <span className="text-[9px] text-[#475569]">Moins</span>
                {[0, 1, 4, 8, 13].map((c, i) => (
                  <div
                    key={i}
                    className="rounded-[2px]"
                    style={{ width: 10, height: 10, backgroundColor: heatColor(c), opacity: c === 0 ? 0.45 : 1 }}
                  />
                ))}
                <span className="text-[9px] text-[#475569]">Plus</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Line + Donut ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Line chart — taux de succès */}
          <section className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <h2 className="text-xs font-semibold text-[#64748B] uppercase tracking-widest mb-3">Taux de succès</h2>
            {successData.every(p => p.rate === null) ? (
              <p className="text-[#475569] text-sm text-center py-10">Pas encore de données pour cette période.</p>
            ) : (
              <div style={{ height: 160 }}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <LineChart data={lineData} options={lineOptions} />
              </div>
            )}
          </section>

          {/* Donut — répartition Non/Hésitation/Oui */}
          <section className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <h2 className="text-xs font-semibold text-[#64748B] uppercase tracking-widest mb-3">Répartition des réponses</h2>
            {ratingDist.total === 0 ? (
              <p className="text-[#475569] text-sm text-center py-10">Pas encore de données pour cette période.</p>
            ) : (
              <div className="flex items-center gap-5">
                <div style={{ width: 100, height: 100, flexShrink: 0 }}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <DonutChart data={doughnutData} options={doughnutOptions} />
                </div>
                <div className="space-y-2.5 flex-1 min-w-0">
                  {[
                    { label: 'Oui', count: ratingDist.oui, color: '#0F6E56' },
                    { label: 'Hésitation', count: ratingDist.hes, color: '#475569' },
                    { label: 'Non', count: ratingDist.non, color: '#993C1D' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                      <span className="text-xs text-[#94A3B8] flex-1 min-w-0">{item.label}</span>
                      <span className="text-xs font-medium text-[#F1F5F9] tabular-nums">
                        {Math.round(item.count / ratingDist.total * 100)}%
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-[#475569] pt-0.5">
                    {ratingDist.total.toLocaleString('fr')} révision{ratingDist.total > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Hard cards + Forecast ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Hard cards */}
          <section className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <h2 className="text-xs font-semibold text-[#64748B] uppercase tracking-widest mb-3">Cartes difficiles</h2>
            {hardCards.length === 0 ? (
              <p className="text-[#475569] text-sm text-center py-6">Excellent — aucune carte difficile 🏆</p>
            ) : (
              <div className="space-y-3">
                {hardCards.map((hc, i) => (
                  <div key={hc.card_id} className="flex items-start gap-2">
                    <span className="text-[10px] text-[#475569] w-4 text-right flex-shrink-0 mt-0.5 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs text-[#94A3B8] truncate flex-1 leading-tight">
                          {hc.question.length > 42 ? hc.question.slice(0, 42) + '…' : hc.question}
                        </span>
                        {hc.deck_id && (
                          <Link
                            href={`/decks/${hc.deck_id}`}
                            className="text-[10px] text-[#4338CA] hover:text-[#818CF8] flex-shrink-0 transition-colors"
                            title={hc.deck_name || undefined}
                          >
                            →
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-[#0F172A] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${hc.failRate}%`, background: '#993C1D' }}
                          />
                        </div>
                        <span className="text-[10px] text-red-400 tabular-nums flex-shrink-0 w-8 text-right font-medium">
                          {hc.failRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Forecast */}
          <section className="bg-[#1E293B] rounded-2xl p-4 border border-[#334155]">
            <h2 className="text-xs font-semibold text-[#64748B] uppercase tracking-widest mb-3">Prévisions — 7 jours</h2>
            <div className="space-y-2.5">
              {forecast.map(day => (
                <div key={day.day} className="flex items-center gap-2">
                  <span className="text-xs text-[#94A3B8] w-28 flex-shrink-0 truncate">{day.label}</span>
                  <div className="flex-1 h-2 bg-[#0F172A] rounded-full overflow-hidden">
                    {day.count > 0 && (
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(4, Math.round(day.count / maxForecast * 100))}%`,
                          background: forecastColor(day.count),
                        }}
                      />
                    )}
                  </div>
                  <span className="text-xs text-[#64748B] tabular-nums flex-shrink-0 w-6 text-right">
                    {day.count}
                  </span>
                </div>
              ))}
            </div>
            {forecast.every(f => f.count === 0) && (
              <p className="text-[#475569] text-xs text-center mt-3">Aucune révision planifiée.</p>
            )}
          </section>
        </div>

      </main>
    </div>
  )
}
