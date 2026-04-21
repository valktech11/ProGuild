import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import TradeLandingClient from './TradeLandingClient'
import GroupLandingPage from './GroupLandingPage'

// ── Shared data ───────────────────────────────────────────────────────────────
export const STATE_MAP: Record<string, { name: string; abbr: string }> = {
  fl: { name: 'Florida',        abbr: 'FL' },
  tx: { name: 'Texas',          abbr: 'TX' },
  ca: { name: 'California',     abbr: 'CA' },
  ny: { name: 'New York',       abbr: 'NY' },
  ga: { name: 'Georgia',        abbr: 'GA' },
  nc: { name: 'North Carolina', abbr: 'NC' },
  az: { name: 'Arizona',        abbr: 'AZ' },
  co: { name: 'Colorado',       abbr: 'CO' },
  wa: { name: 'Washington',     abbr: 'WA' },
  il: { name: 'Illinois',       abbr: 'IL' },
  oh: { name: 'Ohio',           abbr: 'OH' },
  pa: { name: 'Pennsylvania',   abbr: 'PA' },
  nj: { name: 'New Jersey',     abbr: 'NJ' },
  va: { name: 'Virginia',       abbr: 'VA' },
  tn: { name: 'Tennessee',      abbr: 'TN' },
  mi: { name: 'Michigan',       abbr: 'MI' },
  sc: { name: 'South Carolina', abbr: 'SC' },
  nv: { name: 'Nevada',         abbr: 'NV' },
}

export const TRADE_GROUPS: Record<string, {
  label: string; icon: string; accent: string; description: string
  trades: { label: string; slug: string }[]
}> = {
  mechanical: {
    label: 'Mechanical', icon: '⚡', accent: '#14B8A6',
    description: 'HVAC technicians, electricians, plumbers, and other mechanical trade professionals.',
    trades: [
      { label: 'HVAC Technician',       slug: 'hvac-technician' },
      { label: 'Electrician',           slug: 'electrician' },
      { label: 'Plumber',               slug: 'plumber' },
      { label: 'Solar Installer',       slug: 'solar-installer' },
      { label: 'Gas Fitter',            slug: 'gas-fitter' },
      { label: 'Fire Sprinkler',        slug: 'fire-sprinkler' },
    ],
  },
  structural: {
    label: 'Structural', icon: '🏗', accent: '#6366F1',
    description: 'General contractors, roofers, carpenters, and structural trade professionals.',
    trades: [
      { label: 'Roofer',                  slug: 'roofer' },
      { label: 'General Contractor',      slug: 'general-contractor' },
      { label: 'Impact Window & Shutter', slug: 'impact-window-shutter' },
      { label: 'Framing Carpenter',       slug: 'carpenter' },
      { label: 'Mason',                   slug: 'mason' },
      { label: 'Concrete',               slug: 'concrete-contractor' },
      { label: 'Foundation',             slug: 'foundation-specialist' },
    ],
  },
  finishing: {
    label: 'Finishing', icon: '🎨', accent: '#F59E0B',
    description: 'Painters, flooring installers, drywall, tile, and finishing trade professionals.',
    trades: [
      { label: 'Painter',           slug: 'painter' },
      { label: 'Flooring',          slug: 'flooring' },
      { label: 'Drywall',           slug: 'drywall' },
      { label: 'Tile Setter',       slug: 'tile-setter' },
      { label: 'Insulation',        slug: 'insulation-contractor' },
      { label: 'Windows & Doors',   slug: 'windows-doors' },
    ],
  },
  property: {
    label: 'Property', icon: '🌿', accent: '#10B981',
    description: 'Pool & spa, landscapers, pest control, and property maintenance professionals.',
    trades: [
      { label: 'Pool & Spa',        slug: 'pool-spa' },
      { label: 'Landscaper',        slug: 'landscaper' },
      { label: 'Pest Control',      slug: 'pest-control' },
      { label: 'Irrigation',        slug: 'irrigation' },
      { label: 'Handyman',          slug: 'handyman' },
      { label: 'Home Inspector',    slug: 'home-inspector' },
    ],
  },
  specialty: {
    label: 'Specialty', icon: '🔐', accent: '#8B5CF6',
    description: 'Marine/dock builders, alarm installers, welders, and specialty trade professionals.',
    trades: [
      { label: 'Marine / Dock',     slug: 'marine-contractor' },
      { label: 'Alarm & Security',  slug: 'alarm-security' },
      { label: 'Low-Voltage / AV',  slug: 'low-voltage' },
      { label: 'Septic & Drain',    slug: 'septic-drain' },
      { label: 'Welder',            slug: 'welder' },
      { label: 'Elevator Tech',     slug: 'elevator-technician' },
    ],
  },
}

function slugToTitle(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getTradeCategory(slug: string) {
  const { data } = await getSupabaseAdmin()
    .from('trade_categories').select('id, category_name, slug').eq('slug', slug).single()
  return data
}

async function getTopPros(tradeId: string, stateAbbr: string) {
  // Claimed pros first (ordered by rating), then unclaimed to fill the page
  const { data: claimed } = await getSupabaseAdmin()
    .from('pros')
    .select('id, full_name, city, state, avg_rating, review_count, is_verified, available_for_work, profile_photo_url, plan_tier, years_experience, is_claimed, license_number, trade_category:trade_categories(category_name, slug)')
    .eq('trade_category_id', tradeId).ilike('state', stateAbbr)
    .eq('profile_status', 'Active')
    .eq('is_claimed', true)
    .order('avg_rating', { ascending: false, nullsFirst: false })
    .limit(12)

  const claimedList = claimed || []

  // If we have fewer than 12 claimed, pad with unclaimed (those with license numbers)
  if (claimedList.length < 12) {
    const needed = 12 - claimedList.length
    const { data: unclaimed } = await getSupabaseAdmin()
      .from('pros')
      .select('id, full_name, city, state, avg_rating, review_count, is_verified, available_for_work, profile_photo_url, plan_tier, years_experience, is_claimed, license_number, trade_category:trade_categories(category_name, slug)')
      .eq('trade_category_id', tradeId).ilike('state', stateAbbr)
      .eq('profile_status', 'Active')
      .eq('is_claimed', false)
      .not('license_number', 'is', null)
      .order('full_name', { ascending: true })
      .limit(needed)
    return [...claimedList, ...(unclaimed || [])]
  }

  return claimedList
}

async function getProCount(tradeId: string, stateAbbr: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from('pros').select('id', { count: 'exact', head: true })
    .eq('trade_category_id', tradeId).ilike('state', stateAbbr).eq('profile_status', 'Active')
  return count || 0
}

async function getGroupProCount(slugs: string[], stateAbbr: string): Promise<number> {
  const { data: cats } = await getSupabaseAdmin()
    .from('trade_categories').select('id').in('slug', slugs)
  if (!cats?.length) return 0
  const { count } = await getSupabaseAdmin()
    .from('pros').select('id', { count: 'exact', head: true })
    .in('trade_category_id', cats.map(c => c.id))
    .ilike('state', stateAbbr).eq('profile_status', 'Active')
  return count || 0
}

async function getTradeCounts(slugs: string[], stateAbbr: string): Promise<Record<string, number>> {
  const { data: cats } = await getSupabaseAdmin()
    .from('trade_categories').select('id, slug').in('slug', slugs)
  if (!cats?.length) return {}
  const counts: Record<string, number> = {}
  await Promise.all(cats.map(async cat => {
    const { count } = await getSupabaseAdmin()
      .from('pros').select('id', { count: 'exact', head: true })
      .eq('trade_category_id', cat.id).ilike('state', stateAbbr).eq('profile_status', 'Active')
    counts[cat.slug] = count || 0
  }))
  return counts
}

// ── Metadata ──────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ state: string; slug: string }> }
): Promise<Metadata> {
  const { state, slug } = await params
  const info  = STATE_MAP[state.toLowerCase()]
  const name  = info?.name || state.toUpperCase()
  const grp   = TRADE_GROUPS[slug.toLowerCase()]

  if (grp) {
    return {
      title: `${grp.label} Contractors in ${name} — ProGuild.ai`,
      description: `Find verified ${grp.label.toLowerCase()} contractors in ${name}. ${grp.description} DBPR-licensed. Zero lead fees.`,
      alternates: { canonical: `https://proguild.ai/${state.toLowerCase()}/${slug.toLowerCase()}` },
    }
  }
  const tradeTitle = slugToTitle(slug)
  return {
    title: `${tradeTitle}s in ${name} — ProGuild.ai`,
    description: `Find verified, DBPR-licensed ${tradeTitle.toLowerCase()}s in ${name}. Zero lead fees on ProGuild.ai.`,
    alternates: { canonical: `https://proguild.ai/${state.toLowerCase()}/${slug.toLowerCase()}` },
  }
}

// ── Page — routes to group or trade view ─────────────────────────────────────
export default async function SlugPage(
  { params }: { params: Promise<{ state: string; slug: string }> }
) {
  const { state, slug } = await params
  const stateSlug = state.toLowerCase()
  const slugLower = slug.toLowerCase()
  const info = STATE_MAP[stateSlug]
  if (!info) notFound()

  // Check if slug is a group ID
  const grp = TRADE_GROUPS[slugLower]
  if (grp) {
    const tradeSlugs = grp.trades.map(t => t.slug)
    const [totalCount, tradeCounts] = await Promise.all([
      getGroupProCount(tradeSlugs, info.abbr),
      getTradeCounts(tradeSlugs, info.abbr),
    ])
    return (
      <GroupLandingPage
        stateSlug={stateSlug}
        stateName={info.name}
        stateAbbr={info.abbr}
        groupSlug={slugLower}
        group={grp}
        totalCount={totalCount}
        tradeCounts={tradeCounts}
      />
    )
  }

  // Otherwise treat as a trade slug
  const category = await getTradeCategory(slugLower)
  if (!category) notFound()

  const [pros, count] = await Promise.all([
    getTopPros(category.id, info.abbr),
    getProCount(category.id, info.abbr),
  ])

  // Build JSON-LD schema for Google
  const siteUrl = 'https://proguild.ai'
  const pageUrl = `${siteUrl}/${stateSlug}/${slugLower}`
  const tradeLabel = category.category_name || slugToTitle(slugLower)

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${tradeLabel}s in ${info.name}`,
    description: `DBPR-verified ${tradeLabel.toLowerCase()}s in ${info.name}. Zero per-lead fees.`,
    url: pageUrl,
    numberOfItems: count,
    itemListElement: pros.slice(0, 10).map((pro: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': ['LocalBusiness', 'ProfessionalService'],
        '@id': `${siteUrl}/pro/${pro.id}`,
        name: pro.full_name,
        url: `${siteUrl}/pro/${pro.id}`,
        description: `Licensed ${tradeLabel} in ${pro.city || info.name}, ${info.abbr}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: pro.city || info.name,
          addressRegion: info.abbr,
          addressCountry: 'US',
        },
        ...(pro.avg_rating > 0 ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: pro.avg_rating.toFixed(1),
            reviewCount: pro.review_count || 1,
          }
        } : {}),
      }
    }))
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <TradeLandingClient
      stateSlug={stateSlug}
      stateName={info.name}
      stateAbbr={info.abbr}
      tradeSlug={slugLower}
      tradeTitle={category.category_name || slugToTitle(slugLower)}
      tradeCategoryId={category.id}
      initialPros={pros as any[]}
      totalCount={count}
    />
    </>
  )
}
