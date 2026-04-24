import { MetadataRoute } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'
import { DBPR_TRADES, FL_SEO_CITIES, cityToSlug } from '@/config/dbpr-trades'

const BASE = 'https://proguild.ai'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = []

  // ── Static pages ────────────────────────────────────────────────────────────
  const staticPages = [
    { url: BASE,              priority: 1.0,  changeFrequency: 'weekly'  as const },
    { url: `${BASE}/search`,  priority: 0.9,  changeFrequency: 'daily'   as const },
    { url: `${BASE}/post-job`,priority: 0.8,  changeFrequency: 'monthly' as const },
    { url: `${BASE}/community`,priority: 0.8, changeFrequency: 'daily'   as const },
    { url: `${BASE}/jobs`,    priority: 0.7,  changeFrequency: 'daily'   as const },
    { url: `${BASE}/about`,   priority: 0.5,  changeFrequency: 'monthly' as const },
    { url: `${BASE}/contact`, priority: 0.4,  changeFrequency: 'monthly' as const },
    { url: `${BASE}/privacy`, priority: 0.3,  changeFrequency: 'yearly'  as const },
    { url: `${BASE}/terms`,   priority: 0.3,  changeFrequency: 'yearly'  as const },
  ]
  entries.push(...staticPages)

  // ── State page ───────────────────────────────────────────────────────────────
  entries.push({ url: `${BASE}/fl`, priority: 0.9, changeFrequency: 'weekly' as const })

  // ── Trade landing pages — /fl/[trade] ───────────────────────────────────────
  for (const trade of DBPR_TRADES) {
    entries.push({
      url: `${BASE}/fl/${trade.slug}`,
      priority: 0.9,
      changeFrequency: 'weekly' as const,
    })
  }

  // ── City trade pages — /fl/[trade]/[city] ──────────────────────────────────
  for (const trade of DBPR_TRADES) {
    for (const city of FL_SEO_CITIES) {
      entries.push({
        url: `${BASE}/fl/${trade.slug}/${cityToSlug(city)}`,
        priority: 0.8,
        changeFrequency: 'weekly' as const,
      })
    }
  }

  // ── Pro profile pages — /pro/[id] ───────────────────────────────────────────
  try {
    const sb = getSupabaseAdmin()
    let offset = 0
    const BATCH = 1000

    while (true) {
      const { data } = await sb
        .from('pros')
        .select('id, updated_at')
        .eq('profile_status', 'Active')
        .order('updated_at', { ascending: false })
        .range(offset, offset + BATCH - 1)

      if (!data || data.length === 0) break

      for (const pro of data) {
        entries.push({
          url: `${BASE}/pro/${pro.id}`,
          lastModified: pro.updated_at ? new Date(pro.updated_at) : new Date(),
          priority: 0.6,
          changeFrequency: 'monthly' as const,
        })
      }

      if (data.length < BATCH) break
      offset += BATCH
    }
  } catch (err) {
    console.error('[sitemap] Error fetching pros:', err)
  }

  return entries
}
