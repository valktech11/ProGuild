import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const BASE = 'https://proguild.ai'

// City+trade directory pages (/fl/{trade}/{city}) are emitted only when the
// city has at least this many listable pros for that trade — otherwise the
// page is thin and Google distrusts the directory. Scoped to the trades whose
// pros have been slug-backfilled so far; widen TRADES as more are rolled out.
const MIN_PROS = 3
const TRADES   = ['roofing', 'hvac-technician']

type Row = { out_trade: string; out_city: string; n: number }

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .rpc('city_trade_sitemap', { min_count: MIN_PROS, trade_slugs: TRADES })

    if (error) {
      console.error('[sitemaps/cities] rpc error:', error)
      return new NextResponse('Error', { status: 500 })
    }

    const rows = (data || []) as Row[]
    const urls = rows.map(r =>
      `  <url><loc>${BASE}/fl/${r.out_trade}/${r.out_city}</loc><priority>0.8</priority><changefreq>weekly</changefreq></url>`
    )

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
  } catch (err) {
    console.error('[sitemaps/cities] error:', err)
    return new NextResponse('Error generating city sitemap', { status: 500 })
  }
}
