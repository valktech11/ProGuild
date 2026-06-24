import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Public/static payload — safe to cache; revalidate hourly.
export const revalidate = 3600

// Public endpoint — readable by all, cached
export async function GET() {
  const { data } = await getSupabaseAdmin().from('site_config').select('*')
  const config: Record<string, string> = {}
  for (const row of data || []) config[row.key] = row.value
  return NextResponse.json({ config }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' }
  })
}
