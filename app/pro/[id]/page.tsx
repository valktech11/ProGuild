import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'
import { proDisplayName, tradeDisplayName } from '@/lib/utils'
import ProfileClient from './ProfileClient'

// Per-profile metadata is cached and regenerated at most once a day (profiles
// change rarely); avoids a DB hit per crawl across the 100k+ profile pages.
export const revalidate = 86400

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ProMeta = {
  id: string
  slug: string | null
  full_name: string | null
  city: string | null
  state: string | null
  license_number: string | null
  license_expiry_date: string | null
  bio: string | null
  trade_category: { slug: string | null; category_name: string | null } | null
}

async function fetchPro(idOrSlug: string): Promise<ProMeta | null> {
  try {
    const col = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
    const { data } = await getSupabaseAdmin()
      .from('pros')
      .select('id, slug, full_name, city, state, license_number, license_expiry_date, bio, trade_category:trade_categories(slug, category_name)')
      .eq(col, idOrSlug)
      .maybeSingle()
    return (data as ProMeta | null) ?? null
  } catch {
    return null
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const pro = await fetchPro(id)

  if (!pro) {
    // Unknown id/slug — don't let crawlers index a not-found shell.
    return {
      title: 'Contractor Profile | ProGuild',
      robots: { index: false, follow: true },
    }
  }

  const displayName = proDisplayName(pro.full_name || '') || 'Contractor'
  const rawTrade = tradeDisplayName(pro.trade_category?.slug || pro.trade_category?.category_name)
  const trade = rawTrade === '—' ? 'Contractor' : rawTrade
  const location = [pro.city, pro.state].filter(Boolean).join(', ') || 'Florida'
  const canonicalPath = `/pro/${pro.slug || pro.id}`
  const canonical = `https://proguild.ai${canonicalPath}`

  const title = `${displayName} — Licensed ${trade} in ${location} | ProGuild`
  const licenseLine = pro.license_number
    ? ` License #${pro.license_number} — Active through ${
        pro.license_expiry_date
          ? new Date(pro.license_expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          : 'current'
      }.`
    : ''
  const description = `Contact ${displayName}, a DBPR-verified ${trade.toLowerCase()} in ${location}.${licenseLine}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: canonical,
      siteName: 'ProGuild',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function Page() {
  return <ProfileClient />
}
