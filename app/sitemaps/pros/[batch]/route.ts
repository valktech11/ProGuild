import { NextResponse, NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const BASE  = 'https://proguild.ai'
// Supabase hard-caps at 1,000 rows per request regardless of range upper bound.
// Keep LIMIT at 1,000 so offset math and batch count stay in sync.
const LIMIT = 1000

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ batch: string }> }
) {
  const { batch } = await context.params
  const batchNum  = parseInt(batch, 10)
  if (isNaN(batchNum)) return new NextResponse('Bad request', { status: 400 })

  const offset = batchNum * LIMIT

  // Only emit profiles that are actually indexable:
  //   - must have a slug (keyword URL, not a raw UUID)
  //   - must have city (is_claimed profiles always do; DBPR scrapes without city get excluded)
  //   - must have a trade category linked
  // This mirrors the noindex gate in app/pro/[id]/page.tsx so sitemap and page agree.
  const { data } = await getSupabaseAdmin()
    .from('pros')
    .select('slug, updated_at')
    .eq('profile_status', 'Active')
    .not('slug', 'is', null)
    .not('city', 'is', null)
    .not('trade_category_id', 'is', null)
    .order('updated_at', { ascending: false })
    .range(offset, offset + LIMIT - 1)

  if (!data) return new NextResponse('Error', { status: 500 })

  const urls = data.map(pro => {
    const loc = `${BASE}/pro/${pro.slug}`
    const mod = pro.updated_at ? `<lastmod>${new Date(pro.updated_at).toISOString().split('T')[0]}</lastmod>` : ''
    return `  <url><loc>${loc}</loc>${mod}<priority>0.6</priority><changefreq>monthly</changefreq></url>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
