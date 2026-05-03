import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import TreeLibrary from '@/components/ui/TreeLibrary'

export const runtime = 'edge'

export default async function LibraryPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: themes } = await supabase
    .from('themes')
    .select('*')
    .eq('user_id', user.id)
    .order('position')

  return (
    <TreeLibrary
      initialThemes={themes || []}
      userId={user.id}
    />
  )
}
