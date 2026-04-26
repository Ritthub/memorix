'use server'

import { createServerSupabase } from '@/lib/supabase-server'

export async function sendResetEmail(email: string): Promise<{ error: string | null }> {
  const supabase = await createServerSupabase()
  const siteUrl = process.env.SITE_URL

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?type=recovery`,
  })

  return { error: error?.message ?? null }
}
