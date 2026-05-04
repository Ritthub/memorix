import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import CardDetail from './CardDetail'

export const runtime = 'edge'

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: card } = await supabase
    .from('cards')
    .select('*, themes(id, name, color, parent_id)')
    .eq('id', id)
    .single()

  if (!card) redirect('/library')

  if (card.themes) {
    const { data: theme } = await supabase
      .from('themes')
      .select('user_id')
      .eq('id', card.theme_id)
      .single()
    if (theme?.user_id !== user.id) redirect('/library')
  }

  const { data: review } = await supabase
    .from('card_reviews')
    .select('*')
    .eq('card_id', id)
    .eq('user_id', user.id)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const daysUntilNext = review?.scheduled_at
    ? Math.ceil((new Date(review.scheduled_at).getTime() - Date.now()) / 86400000)
    : null

  let parentThemeName: string | null = null
  if (card.themes?.parent_id) {
    const { data: parent } = await supabase
      .from('themes')
      .select('name')
      .eq('id', card.themes.parent_id)
      .single()
    parentThemeName = parent?.name || null
  }

  const { data: history } = await supabase
    .from('card_reviews')
    .select('rating, reviewed_at, scheduled_days, state')
    .eq('card_id', id)
    .eq('user_id', user.id)
    .not('reviewed_at', 'is', null)
    .order('reviewed_at', { ascending: false })
    .limit(5)

  return (
    <CardDetail
      card={card}
      review={review}
      history={history || []}
      daysUntilNext={daysUntilNext}
      parentThemeName={parentThemeName}
    />
  )
}
