'use server'

import { createServerSupabase } from '@/lib/supabase-server'
import { getSiteUrl } from '@/lib/site-url'

export async function sendResetEmail(email: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteUrl()}/auth/callback?type=recovery`,
  })
  return { error: error?.message ?? null }
}
