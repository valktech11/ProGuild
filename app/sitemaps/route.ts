import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const BASE  = 'https://proguild.ai'
// Must match LIMIT in pros/[batch]/route.ts
const LIMIT = 1000

export async function GET() {
  try {
    // Count only indexable pros — same filter as the batch route
    const { count } = await getSupabaseAdmin()
      .from('pros')
      .select('id', { count: 'exact', head: true })
      .eq('profile_status', 'Active')
      .not('slug', 'is', null)
      .not('city', 'is', null)
      .not('trade_category_id', 'is', null)

    const proCount   = count || 0
    const proBatches = Math.ceil(proCount / LIMIT)

    // Only reference routes that actually exist
    const sitemaps = [
      `${BASE}/sitemaps/static`,
      ...Array.from({ length: proBatches }, (_, i) => `${BASE}/sitemaps/pros/${i}`),
    ]

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(url => `  <sitemap><loc>${url}</loc></sitemap>`).join('\n')}
</sitemapindex>`

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (err) {
    console.error('[sitemaps] error:', err)
    return new NextResponse('Error generating sitemap index', { status: 500 })
  }
}
