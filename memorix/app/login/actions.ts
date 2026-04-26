'use server'

import { getSiteUrl } from '@/lib/site-url'

export async function getAuthCallbackUrl(): Promise<string> {
  return `${getSiteUrl()}/auth/callback`
}
