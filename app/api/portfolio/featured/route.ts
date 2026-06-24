import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Per-record data that changes — always read fresh.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from('portfolio_items')
    .select(`
      id, photo_url, title, location_label, is_job_site, is_before_after,
      pro:pros!pro_id(id, full_name, avg_rating, city, state, trade_category:trade_categories(category_name))
    `)
    .not('photo_url', 'is', null)
    .eq('is_job_site', true)
    .order('created_at', { ascending: false })
    .limit(6)

  if (error) return NextResponse.json({ items: [] })

  // Filter to items where pro has a real profile
  const items = (data || []).filter((item: any) => item.pro?.full_name)
  return NextResponse.json({ items })
}
