import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('archived', true)
    .lt('auto_delete_at', new Date().toISOString())
  return NextResponse.json({ success: !error, error: error?.message })
}
