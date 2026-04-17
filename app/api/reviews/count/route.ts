import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { count, error } = await getSupabaseAdmin()
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('is_approved', true)

  if (error) return NextResponse.json({ count: 0 })
  return NextResponse.json({ count: count || 0 })
}
