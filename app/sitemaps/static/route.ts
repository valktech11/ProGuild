import { NextResponse } from 'next/server'
import { DBPR_TRADES, FL_SEO_CITIES, cityToSlug } from '@/config/dbpr-trades'

const BASE = 'https://proguild.ai'

function u(loc: string, priority: string, freq: string) {
  return `  <url><loc>${loc}</loc><priority>${priority}</priority><changefreq>${freq}</changefreq></url>`
}

export async function GET() {
  // Trade group hub pages
  const TRADE_GROUPS = ['mechanical', 'structural', 'finishing', 'property', 'specialty']

  const urls = [
    u(BASE,                '1.0', 'weekly'),
    u(`${BASE}/fl`,        '0.9', 'weekly'),
    u(`${BASE}/about`,     '0.5', 'monthly'),
    u(`${BASE}/contact`,   '0.4', 'monthly'),
    u(`${BASE}/privacy`,   '0.3', 'yearly'),
    u(`${BASE}/terms`,     '0.3', 'yearly'),
    // Trade group hubs (fl/mechanical, fl/structural etc)
    ...TRADE_GROUPS.map(g => u(`${BASE}/fl/${g}`, '0.85', 'weekly')),
    // Individual trade pages
    ...DBPR_TRADES.map(t => u(`${BASE}/fl/${t.slug}`, '0.9', 'weekly')),
    // Trade + city pages (210 pages)
    ...DBPR_TRADES.flatMap(t =>
      FL_SEO_CITIES.map(c => u(`${BASE}/fl/${t.slug}/${cityToSlug(c)}`, '0.8', 'weekly'))
    ),
  ]

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
