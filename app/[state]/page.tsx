import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase'

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

const TRADE_GROUPS = [
  { id: 'mechanical', label: 'Mechanical', icon: '⚡', accent: '#0F766E',
    trades: [
      { label: 'HVAC Technician',       slug: 'hvac-technician' },
      { label: 'Electrician',           slug: 'electrician' },
      { label: 'Plumber',               slug: 'plumber' },
      { label: 'Solar Installer',       slug: 'solar-installer' },
      { label: 'Gas Fitter',            slug: 'gas-fitter' },
      { label: 'Fire Sprinkler',        slug: 'fire-sprinkler' },
    ]},
  { id: 'structural', label: 'Structural', icon: '🏗', accent: '#6366F1',
    trades: [
      { label: 'Roofer',                    slug: 'roofer' },
      { label: 'General Contractor',        slug: 'general-contractor' },
      { label: 'Impact Window & Shutter',   slug: 'impact-window-shutter' },
      { label: 'Framing Carpenter',         slug: 'carpenter' },
      { label: 'Mason',                     slug: 'mason' },
      { label: 'Concrete',                  slug: 'concrete-contractor' },
      { label: 'Foundation',               slug: 'foundation-specialist' },
    ]},
  { id: 'finishing', label: 'Finishing', icon: '🎨', accent: '#F59E0B',
    trades: [
      { label: 'Painter',             slug: 'painter' },
      { label: 'Flooring',            slug: 'flooring' },
      { label: 'Drywall',             slug: 'drywall' },
      { label: 'Tile Setter',         slug: 'tile-setter' },
      { label: 'Insulation',          slug: 'insulation-contractor' },
      { label: 'Windows & Doors',     slug: 'windows-doors' },
    ]},
  { id: 'property', label: 'Property', icon: '🌿', accent: '#10B981',
    trades: [
      { label: 'Pool & Spa',          slug: 'pool-spa' },
      { label: 'Landscaper',          slug: 'landscaper' },
      { label: 'Pest Control',        slug: 'pest-control' },
      { label: 'Irrigation',          slug: 'irrigation' },
      { label: 'Handyman',            slug: 'handyman' },
      { label: 'Home Inspector',      slug: 'home-inspector' },
    ]},
  { id: 'specialty', label: 'Specialty', icon: '🔐', accent: '#8B5CF6',
    trades: [
      { label: 'Marine / Dock',       slug: 'marine-contractor' },
      { label: 'Alarm & Security',    slug: 'alarm-security' },
      { label: 'Low-Voltage / AV',    slug: 'low-voltage' },
      { label: 'Septic & Drain',      slug: 'septic-drain' },
      { label: 'Welder',              slug: 'welder' },
      { label: 'Elevator Tech',       slug: 'elevator-technician' },
    ]},
]

export async function generateMetadata(
  { params }: { params: Promise<{ state: string }> }
): Promise<Metadata> {
  const { state } = await params
  const info = STATE_MAP[state.toLowerCase()]
  const name = info?.name || state.toUpperCase()
  return {
    title: `Verified Trade Professionals in ${name} — ProGuild.ai`,
    description: `Find DBPR-licensed electricians, plumbers, HVAC techs, roofers and more in ${name}. Zero lead fees. License verified. ProGuild.ai`,
    alternates: { canonical: `https://proguild.ai/${state.toLowerCase()}` },
  }
}

async function getProCount(stateAbbr: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from('pros').select('id', { count: 'exact', head: true })
    .ilike('state', stateAbbr).eq('profile_status', 'Active')
  return count || 0
}

export default async function StateLandingPage(
  { params }: { params: Promise<{ state: string }> }
) {
  const { state } = await params
  const stateSlug = state.toLowerCase()
  const info = STATE_MAP[stateSlug]
  if (!info) notFound()

  const totalCount = await getProCount(info.abbr)

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>

      {/* NAV */}
      <nav className="sticky top-0 z-40 bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7">
              <svg viewBox="0 0 32 32" fill="none"><path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#slg)"/><text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text><defs><linearGradient id="slg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs></svg>
            </div>
            <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#0F766E', fontWeight: 300 }}>.ai</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm hidden sm:block" style={{ color: '#6B7280' }}>Log in</Link>
            <Link href="/login?tab=signup" className="text-xs font-bold px-4 py-2 rounded-lg text-white" style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>Join Free</Link>
          </div>
        </div>
      </nav>

      {/* BREADCRUMB */}
      <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-2 text-xs" style={{ color: '#A89F93' }}>
          <Link href="/" style={{ color: '#A89F93' }}>Home</Link>
          <span>›</span>
          <span className="font-semibold" style={{ color: '#0A1628' }}>{info.name}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10">

        {/* HERO */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            Verified Trade Professionals in {info.name}
          </h1>
          <p className="text-sm leading-relaxed mb-4 max-w-2xl" style={{ color: '#6B7280' }}>
            Browse {totalCount.toLocaleString()}+ DBPR-verified trade professionals across {info.name}.
            Every pro is license-checked against the state database. Zero lead fees — contact them directly.
          </p>
          <div className="flex items-center gap-4 text-xs" style={{ color: '#A89F93' }}>
            <span><span className="font-bold" style={{ color: '#0A1628' }}>{totalCount.toLocaleString()}+</span> verified pros</span>
            <span>·</span><span>DBPR license verified</span>
            <span>·</span><span>Zero lead fees</span>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="mb-10">
          <form action="/search" method="get">
            <div className="flex max-w-xl rounded-2xl overflow-hidden border bg-white shadow-sm" style={{ borderColor: '#E8E2D9' }}>
              <input name="q" type="text" placeholder={`Search trades in ${info.name}...`}
                className="flex-1 px-5 py-3.5 text-sm outline-none" style={{ background: 'transparent', color: '#0A1628' }} />
              <button type="submit" className="px-6 py-3.5 text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                Search
              </button>
            </div>
          </form>
        </div>

        {/* TRADE GROUPS — top 3 large, bottom 2 compact */}
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: '#A89F93' }}>Browse by trade group</div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {TRADE_GROUPS.slice(0, 3).map(group => (
              <div key={group.id} className="bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow"
                style={{ borderColor: '#E8E2D9', borderTopWidth: '3px', borderTopColor: group.accent }}>
                {/* Clickable header → group page */}
                <Link href={`/${stateSlug}/${group.id}`}
                  className="flex items-center gap-2.5 px-5 pt-5 pb-3 hover:opacity-80 transition-opacity"
                  style={{ textDecoration: 'none' }}>
                  <span className="text-2xl">{group.icon}</span>
                  <span className="font-bold text-base" style={{ color: '#0A1628' }}>{group.label}</span>
                  <span className="ml-auto text-xs" style={{ color: group.accent }}>→</span>
                </Link>
                {/* Individual trade links */}
                <div className="px-5 pb-5 space-y-0.5">
                  {group.trades.slice(0, 4).map(trade => (
                    <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                      className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg transition-all"
                      style={{ color: '#4B5563' }}
>
                      <span>{trade.label}</span>
                      <span className="text-xs opacity-0 hover:opacity-100">→</span>
                    </Link>
                  ))}
                  {group.trades.length > 4 && (
                    <Link href={`/${stateSlug}/${group.id}`}
                      className="text-xs px-2 py-1 block transition-colors"
                      style={{ color: group.accent }}>
                      +{group.trades.length - 4} more trades →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TRADE_GROUPS.slice(3).map(group => (
              <div key={group.id} className="bg-white rounded-2xl border overflow-hidden hover:shadow-md transition-shadow"
                style={{ borderColor: '#E8E2D9', borderTopWidth: '3px', borderTopColor: group.accent }}>
                <Link href={`/${stateSlug}/${group.id}`}
                  className="flex items-center gap-2.5 px-5 pt-4 pb-3 hover:opacity-80 transition-opacity">
                  <span className="text-xl">{group.icon}</span>
                  <span className="font-bold" style={{ color: '#0A1628' }}>{group.label}</span>
                  <span className="ml-auto text-xs" style={{ color: group.accent }}>→</span>
                </Link>
                <div className="px-5 pb-4 flex flex-wrap gap-2">
                  {group.trades.map(trade => (
                    <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all"
                      style={{ color: '#4B5563', borderColor: '#E8E2D9', background: '#FAF9F6' }}
>
                      {trade.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SEO CONTENT */}
        <div className="border-t pt-10 mt-8" style={{ borderColor: '#E8E2D9' }}>
          <h2 className="text-lg font-bold mb-3" style={{ color: '#0A1628' }}>
            Finding verified trade professionals in {info.name}
          </h2>
          <p className="text-sm leading-relaxed mb-4 max-w-3xl" style={{ color: '#6B7280' }}>
            ProGuild verifies every trade professional in {info.name} against the state licensing database.
            Whether you need an HVAC technician, electrician, plumber, roofer, or any other skilled tradesperson,
            every pro listed has an active, state-issued license. Contact them directly — no lead fees, no middleman.
          </p>
          {/* SEO footer links */}
          <div className="flex flex-wrap gap-2 mt-6">
            {TRADE_GROUPS.flatMap(g => g.trades).slice(0, 12).map(trade => (
              <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{ color: '#6B7280', borderColor: '#E8E2D9', background: '#fff' }}
>
                {trade.label}s in {info.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="border-t py-8 px-6 mt-8" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#0F766E', fontWeight: 300 }}>.ai</span></span>
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#A89F93' }}>
            {[['/', 'Home'],['/search', 'Find a Pro'],['/community', 'Community'],['/privacy', 'Privacy'],['/terms', 'Terms']].map(([href, label]) => (
              <Link key={href} href={href} style={{ color: '#A89F93' }}>{label}</Link>
            ))}
          </div>
          <div className="text-xs" style={{ color: '#C4BAB0' }}>© 2026 ProGuild.ai</div>
        </div>
      </footer>
    </div>
  )
}
