import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('archived', true)
    .lt('auto_delete_at', new Date().toISOString())
  return NextResponse.json({ success: !error, error: error?.message })
}
