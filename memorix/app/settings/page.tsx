import { createServerSupabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import SettingsView from './SettingsView'

export default async function SettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, retention_target, daily_goal')
    .eq('id', user.id)
    .single()

  return <SettingsView profile={profile} email={user.email ?? ''} />
}
export const runtime = 'edge'
