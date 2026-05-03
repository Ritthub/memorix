import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ReviewSelector from './ReviewSelector'
import ThemeReviewSection from './ThemeReviewSection'
import { pluralCard } from '@/lib/utils'

export const runtime = 'edge'

function computeStreak(reviewedAtDates: string[]): number {
  if (reviewedAtDates.length === 0) return 0
  const days = new Set(reviewedAtDates.map(d => d.slice(0, 10)))
  let streak = 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: themes },
    { data: dueCards },
    { data: profile },
    { data: recentReviews },
    { data: themeDueCards },
  ] = await Promise.all([
    supabase.from('themes').select('id, name, color, position, parent_id').eq('user_id', user.id).order('position'),
    supabase.from('card_reviews').select('id, cards!inner(archived)').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
    supabase.from('profiles').select('name').eq('id', user.id).single(),
    supabase.from('card_reviews').select('reviewed_at').eq('user_id', user.id).not('reviewed_at', 'is', null).gte('reviewed_at', new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()),
    supabase.from('card_reviews').select('cards!inner(theme_id, archived)').eq('user_id', user.id).lte('scheduled_at', new Date().toISOString()),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dueCount = (dueCards || []).filter((r: any) => !r.cards?.archived).length
  const themeCount = themes?.length || 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstName = (profile as any)?.name?.split(' ')[0] || ''
  const streak = computeStreak((recentReviews || []).map((r: { reviewed_at: string | null }) => r.reviewed_at as string))

  const themeDueCounts: Record<string, number> = {}
  let noThemeDue = 0
  for (const r of themeDueCards || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const card = (r as any).cards
    if (!card || card.archived) continue
    const themeId = card.theme_id
    if (themeId) {
      themeDueCounts[themeId] = (themeDueCounts[themeId] || 0) + 1
    } else {
      noThemeDue++
    }
  }

  type ThemeRow = { id: string; name: string; color: string; position: number; parent_id: string | null }
  const allThemesList = (themes as ThemeRow[] | null) || []

  function getSubtreeIds(themeId: string): string[] {
    const children = allThemesList.filter(t => t.parent_id === themeId)
    return [themeId, ...children.flatMap(c => getSubtreeIds(c.id))]
  }

  const allThemesWithDue = allThemesList.map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    parent_id: t.parent_id,
    due: getSubtreeIds(t.id).reduce((sum, id) => sum + (themeDueCounts[id] || 0), 0),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeThemes = (themes as any) || []

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--accent-light)' }}>Memorix</h1>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1 border" style={{ background: 'color-mix(in srgb, var(--streak-bg) 20%, transparent)', borderColor: 'color-mix(in srgb, var(--streak-text) 30%, transparent)' }}>
              <span>🔥</span>
              <span className="font-bold text-sm" style={{ color: 'var(--streak-text)' }}>{streak} j</span>
            </div>
          )}
          <Link href="/settings" className="text-sm transition-colors" style={{ color: 'var(--text-muted)' }}>Paramètres</Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Bonjour{firstName ? `, ${firstName}` : ''} 👋
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {dueCount > 0
              ? `Vous avez ${dueCount} carte${dueCount > 1 ? 's' : ''} à réviser aujourd'hui.`
              : 'Aucune carte à réviser pour le moment. Beau travail !'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="text-3xl font-bold" style={{ color: 'var(--accent-light)' }}>{dueCount}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Cartes dues</div>
          </div>
          <div className="rounded-2xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
            <div className="text-3xl font-bold" style={{ color: 'var(--accent-light)' }}>{themeCount}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Thèmes actifs</div>
          </div>
          <div className="rounded-2xl p-5 border" style={{ background: 'color-mix(in srgb, var(--accent-subtle) 50%, var(--bg-surface))', borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)' }}>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold" style={{ color: 'var(--accent-light)' }}>{streak}</span>
              <span className="text-2xl">🔥</span>
            </div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Jours de suite</div>
          </div>
        </div>

        <ReviewSelector
          dueCount={dueCount}
          themes={safeThemes}
          themeDueCounts={themeDueCounts}
          noThemeDue={noThemeDue}
        />

        <ThemeReviewSection themes={allThemesWithDue} />

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">Thèmes à réviser</h3>
          </div>

          {themeCount === 0 ? (
            <div className="rounded-2xl p-10 text-center border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <div className="text-4xl mb-4">🗂️</div>
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Vous n&apos;avez pas encore de thème</p>
              <Link href="/create" className="inline-block rounded-xl px-6 py-3 font-medium transition-colors" style={{ background: 'var(--accent)' }}>
                Créer mes premières cartes
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {(themes as { id: string; name: string; color: string }[])
                ?.slice()
                .sort((a, b) => (themeDueCounts[b.id] || 0) - (themeDueCounts[a.id] || 0))
                .slice(0, 4)
                .map(theme => {
                  const due = themeDueCounts[theme.id] || 0
                  return (
                    <Link key={theme.id} href={`/themes/${theme.id}`} className="relative rounded-2xl p-5 border transition-all duration-150" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                      {due > 0 && (
                        <span className="absolute top-3 right-3 text-xs font-bold rounded-full px-2 py-0.5 leading-tight" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-muted)' }}>
                          {due}
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: theme.color }} />
                        <h4 className="font-bold truncate text-sm">{theme.name}</h4>
                      </div>
                    </Link>
                  )
                })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
