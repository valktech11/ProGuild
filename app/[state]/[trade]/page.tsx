import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import TradeLandingClient from './TradeLandingClient'

// ── State map ─────────────────────────────────────────────────────────────────
const STATE_MAP: Record<string, { name: string; abbr: string }> = {
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

function slugToTitle(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

async function getTradeCategory(slug: string) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('trade_categories')
    .select('id, category_name, slug')
    .eq('slug', slug)
    .single()
  return data
}

async function getTopPros(tradeId: string, stateAbbr: string) {
  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('pros')
    .select('id, full_name, city, state, avg_rating, review_count, is_verified, available_for_work, profile_photo_url, plan_tier, years_experience, trade_category:trade_categories(category_name, slug)')
    .eq('trade_category_id', tradeId)
    .ilike('state', stateAbbr)
    .eq('profile_status', 'Active')
    .order('avg_rating', { ascending: false, nullsFirst: false })
    .limit(12)
  return data || []
}

async function getProCount(tradeId: string, stateAbbr: string): Promise<number> {
  const sb = getSupabaseAdmin()
  const { count } = await sb
    .from('pros')
    .select('id', { count: 'exact', head: true })
    .eq('trade_category_id', tradeId)
    .ilike('state', stateAbbr)
    .eq('profile_status', 'Active')
  return count || 0
}

// ── Metadata ──────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ state: string; trade: string }> }
): Promise<Metadata> {
  const { state, trade } = await params
  const stateInfo  = STATE_MAP[state.toLowerCase()]
  const tradeTitle = slugToTitle(trade)
  const stateName  = stateInfo?.name || state.toUpperCase()
  const title       = `${tradeTitle}s in ${stateName} — ProGuild.ai`
  const description = `Find verified, DBPR-licensed ${tradeTitle.toLowerCase()}s in ${stateName}. Read real reviews, compare credentials, hire direct. Zero lead fees on ProGuild.ai.`
  return {
    title,
    description,
    openGraph: { title, description, siteName: 'ProGuild.ai' },
    alternates: {
      canonical: `https://proguild.ai/${state.toLowerCase()}/${trade.toLowerCase()}`,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function TradeLandingPage(
  { params }: { params: Promise<{ state: string; trade: string }> }
) {
  // Next.js 16 — params is a Promise, must await
  const { state, trade } = await params

  const stateSlug = state.toLowerCase()
  const tradeSlug = trade.toLowerCase()
  const stateInfo = STATE_MAP[stateSlug]

  if (!stateInfo) notFound()

  const category = await getTradeCategory(tradeSlug)
  if (!category) notFound()

  const [pros, count] = await Promise.all([
    getTopPros(category.id, stateInfo.abbr),
    getProCount(category.id, stateInfo.abbr),
  ])

  const tradeTitle = category.category_name || slugToTitle(tradeSlug)

  return (
    <TradeLandingClient
      stateSlug={stateSlug}
      stateName={stateInfo.name}
      stateAbbr={stateInfo.abbr}
      tradeSlug={tradeSlug}
      tradeTitle={tradeTitle}
      tradeCategoryId={category.id}
      initialPros={pros as any[]}
      totalCount={count}
    />
  )
}
