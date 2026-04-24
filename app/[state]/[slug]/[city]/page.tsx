import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getDBPRTrade, slugToCity, cityToSlug, FL_SEO_CITIES } from '@/config/dbpr-trades'

// ProCard uses onError — must be rendered inside a client component
import ProCardGrid from './ProCardGrid'

const STATE_MAP: Record<string, { name: string; abbr: string }> = {
  fl: { name: 'Florida', abbr: 'FL' },
}

function slugToTitle(slug: string) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

async function getTradeCategory(slug: string) {
  const { data } = await getSupabaseAdmin()
    .from('trade_categories').select('id, category_name, slug').eq('slug', slug).single()
  return data
}

async function getCityPros(tradeId: string, stateAbbr: string, city: string) {
  // Claimed pros first
  const { data: claimed } = await getSupabaseAdmin()
    .from('pros')
    .select('id, full_name, city, state, avg_rating, review_count, is_verified, available_for_work, profile_photo_url, plan_tier, years_experience, is_claimed, license_number, trade_category:trade_categories(category_name, slug)')
    .eq('trade_category_id', tradeId)
    .ilike('state', stateAbbr)
    .ilike('city', city)
    .eq('profile_status', 'Active')
    .eq('is_claimed', true)
    .order('avg_rating', { ascending: false, nullsFirst: false })
    .limit(12)

  const claimedList = claimed || []

  if (claimedList.length < 12) {
    const needed = 12 - claimedList.length
    const { data: unclaimed } = await getSupabaseAdmin()
      .from('pros')
      .select('id, full_name, city, state, avg_rating, review_count, is_verified, available_for_work, profile_photo_url, plan_tier, years_experience, is_claimed, license_number, trade_category:trade_categories(category_name, slug)')
      .eq('trade_category_id', tradeId)
      .ilike('state', stateAbbr)
      .ilike('city', city)
      .eq('profile_status', 'Active')
      .eq('is_claimed', false)
      .not('license_number', 'is', null)
      .limit(needed)
    return [...claimedList, ...(unclaimed || [])]
  }
  return claimedList
}

async function getProCount(tradeId: string, stateAbbr: string, city: string) {
  const { count } = await getSupabaseAdmin()
    .from('pros')
    .select('id', { count: 'exact', head: true })
    .eq('trade_category_id', tradeId)
    .ilike('state', stateAbbr)
    .ilike('city', city)
    .eq('profile_status', 'Active')
  return count || 0
}

// ── Metadata ──────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ state: string; slug: string; city: string }> }
): Promise<Metadata> {
  const { state, slug, city } = await params
  const info      = STATE_MAP[state.toLowerCase()]
  if (!info) return {}
  const cityName  = slugToCity(city) || city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const category  = await getTradeCategory(slug)
  const tradeName = category?.category_name || slugToTitle(slug)
  const dbpr      = getDBPRTrade(slug)
  const licenseNote = dbpr ? ` ${dbpr.licenseLabel} (${dbpr.licenseCodes.join('/')}).` : ''

  return {
    title: `Licensed ${tradeName}s in ${cityName}, ${info.abbr} — DBPR Verified | ProGuild.ai`,
    description: `Find DBPR-verified ${tradeName.toLowerCase()}s in ${cityName}, ${info.name}.${licenseNote} Zero lead fees. Contact pros directly on ProGuild.ai.`,
    alternates: {
      canonical: `https://proguild.ai/${state.toLowerCase()}/${slug.toLowerCase()}/${city.toLowerCase()}`,
    },
    openGraph: {
      title: `${tradeName}s in ${cityName}, FL — DBPR Verified`,
      description: `Licensed ${tradeName.toLowerCase()}s in ${cityName}, Florida. Verified against Florida DBPR. Zero lead fees.`,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function CityTradePage(
  { params }: { params: Promise<{ state: string; slug: string; city: string }> }
) {
  const { state, slug, city } = await params
  const info = STATE_MAP[state.toLowerCase()]
  if (!info) notFound()

  const cityDisplay = slugToCity(city) || city.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  const category    = await getTradeCategory(slug)
  if (!category) notFound()

  const tradeName   = category.category_name || slugToTitle(slug)
  const dbpr        = getDBPRTrade(slug)

  const [pros, count] = await Promise.all([
    getCityPros(category.id, info.abbr, cityDisplay),
    getProCount(category.id, info.abbr, cityDisplay),
  ])

  // JSON-LD schema
  const siteUrl   = 'https://proguild.ai'
  const pageUrl   = `${siteUrl}/${state.toLowerCase()}/${slug}/${city}`

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Florida', item: `${siteUrl}/fl` },
      { '@type': 'ListItem', position: 2, name: `${tradeName}s in Florida`, item: `${siteUrl}/fl/${slug}` },
      { '@type': 'ListItem', position: 3, name: `${tradeName}s in ${cityDisplay}`, item: pageUrl },
    ],
  }

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Licensed ${tradeName}s in ${cityDisplay}, FL`,
    description: `DBPR-verified ${tradeName.toLowerCase()}s in ${cityDisplay}, Florida.`,
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
        description: `Licensed ${tradeName} in ${cityDisplay}, ${info.abbr}`,
        address: {
          '@type': 'PostalAddress',
          addressLocality: cityDisplay,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />

      <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>

        {/* Breadcrumb */}
        <div className="border-b bg-white" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-2 text-xs overflow-x-auto" style={{ color: '#A89F93' }}>
            <Link href="/" style={{ color: '#A89F93' }} className="hover:text-teal-600 transition-colors">Home</Link>
            <span>›</span>
            <Link href={`/${state.toLowerCase()}`} style={{ color: '#A89F93' }} className="hover:text-teal-600 transition-colors">{info.name}</Link>
            <span>›</span>
            <Link href={`/${state.toLowerCase()}/${slug}`} style={{ color: '#A89F93' }} className="hover:text-teal-600 transition-colors">{tradeName}s in {info.name}</Link>
            <span>›</span>
            <span className="font-semibold flex-shrink-0" style={{ color: '#0F766E' }}>{cityDisplay}</span>
          </div>
        </div>

        {/* Hero */}
        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-7xl mx-auto px-6 py-10">
            <h1 className="text-3xl font-bold mb-2" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              Licensed {tradeName}s in {cityDisplay}, FL
            </h1>
            <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
              {count > 0 ? `${count} DBPR-verified ${tradeName.toLowerCase()}s` : `DBPR-verified ${tradeName.toLowerCase()}s`} in {cityDisplay}, Florida.
              {dbpr && ` All hold a ${dbpr.licenseLabel} (${dbpr.licenseCodes.join('/')}) from the Florida DBPR.`}
              {' '}Zero lead fees. Contact them directly.
            </p>

            {/* DBPR info badge */}
            {dbpr && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(15,118,110,0.08)', color: '#0C5F57', border: '1px solid rgba(15,118,110,0.2)' }}>
                🛡 License verified: {dbpr.licenseLabel} · Florida DBPR
              </div>
            )}
          </div>
        </div>

        {/* Pro grid */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {pros.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-4">🔍</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: '#0A1628' }}>No claimed pros in {cityDisplay} yet</h2>
              <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
                Browse all {tradeName.toLowerCase()}s in Florida, or check nearby cities.
              </p>
              <Link href={`/${state.toLowerCase()}/${slug}`}
                className="inline-block px-6 py-2.5 rounded-xl font-semibold text-white text-sm"
                style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                See all {tradeName}s in Florida →
              </Link>
            </div>
          ) : (
            <>
              <ProCardGrid pros={pros} />
              <div className="text-center mt-8">
                <Link href={`/${state.toLowerCase()}/${slug}`}
                  className="text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                  See all {tradeName.toLowerCase()}s in {info.name} →
                </Link>
              </div>
            </>
          )}

          {/* Other cities */}
          <div className="mt-12 pt-8 border-t" style={{ borderColor: '#E8E2D9' }}>
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: '#A89F93' }}>
              {tradeName}s in other Florida cities
            </h2>
            <div className="flex flex-wrap gap-2">
              {FL_SEO_CITIES.filter(c => c !== cityDisplay).map(c => (
                <Link key={c} href={`/${state.toLowerCase()}/${slug}/${cityToSlug(c)}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all hover:border-teal-400 hover:text-teal-700"
                  style={{ color: '#6B7280', borderColor: '#E8E2D9', background: '#FAF9F6' }}>
                  {tradeName}s in {c}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Pre-generate top trade × city combinations at build time
export async function generateStaticParams() {
  const topTrades = [
    'hvac-technician', 'electrician', 'plumber', 'roofer',
    'general-contractor', 'pool-spa', 'painter', 'solar-installer',
  ]
  const params = []
  for (const slug of topTrades) {
    for (const city of FL_SEO_CITIES) {
      params.push({ state: 'fl', slug, city: cityToSlug(city) })
    }
  }
  return params
}
