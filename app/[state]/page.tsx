import { Metadata } from 'next'
import type { ReactNode } from 'react'
import Navbar from '@/components/layout/Navbar'
import { notFound } from 'next/navigation'
import Link from 'next/link'

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

// ── Trade-group icons (crisp inline SVG — matches the homepage icon system) ─────
const ico = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const GROUP_ICONS: Record<string, ReactNode> = {
  mechanical: (<svg {...ico}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>),
  structural: (<svg {...ico}><path d="M3 21h18"/><path d="M6 21V8l6-4 6 4v13"/><path d="M10 21v-5h4v5"/></svg>),
  finishing:  (<svg {...ico}><path d="M3 21c0-2.4 1.7-4 3.5-4L9 19.3C9 21.1 7.2 22.5 5 22.5"/><path d="M8.5 16.5 18 7a2 2 0 0 0-3-3L5.5 13.5z"/></svg>),
  property:   (<svg {...ico}><path d="M4 20c0-8 6-13 16-13 0 10-6 14-16 13z"/><path d="M4 20c4-5 8-8 12-9.5"/></svg>),
  specialty:  (<svg {...ico}><path d="M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6l7-3z"/><path d="M12 9.5v5M9.5 12h5"/></svg>),
}

const TRADE_GROUPS = [
  { id: 'mechanical', label: 'Mechanical',
    trades: [
      { label: 'HVAC Technician',       slug: 'hvac-technician' },
      { label: 'Electrician',           slug: 'electrician' },
      { label: 'Plumber',               slug: 'plumber' },
      { label: 'Solar Installer',       slug: 'solar-energy' },
      { label: 'Gas Fitter',            slug: 'gas-fitter' },
      { label: 'Fire Sprinkler',        slug: 'fire-sprinkler' },
    ]},
  { id: 'structural', label: 'Structural',
    trades: [
      { label: 'Roofer',                    slug: 'roofing' },
      { label: 'General Contractor',        slug: 'general-contractor' },
      { label: 'Impact Window & Shutter',   slug: 'impact-window-shutter' },
      { label: 'Framing Carpenter',         slug: 'carpenter' },
      { label: 'Mason',                     slug: 'mason' },
      { label: 'Concrete',                  slug: 'concrete-contractor' },
      { label: 'Foundation',               slug: 'foundation-specialist' },
    ]},
  { id: 'finishing', label: 'Finishing',
    trades: [
      { label: 'Painter',             slug: 'painter' },
      { label: 'Flooring',            slug: 'flooring' },
      { label: 'Drywall',             slug: 'drywall' },
      { label: 'Tile Setter',         slug: 'tile-setter' },
      { label: 'Insulation',          slug: 'insulation-contractor' },
      { label: 'Windows & Doors',     slug: 'windows-doors' },
    ]},
  { id: 'property', label: 'Property',
    trades: [
      { label: 'Pool & Spa',          slug: 'pool-spa' },
      { label: 'Landscaper',          slug: 'landscaper' },
      { label: 'Pest Control',        slug: 'pest-control' },
      { label: 'Irrigation',          slug: 'irrigation' },
      { label: 'Handyman',            slug: 'handyman' },
      { label: 'Home Inspector',      slug: 'home-inspector' },
    ]},
  { id: 'specialty', label: 'Specialty',
    trades: [
      { label: 'Marine / Dock',       slug: 'marine-contractor' },
      { label: 'Alarm & Security',    slug: 'alarm-security' },
      { label: 'Low-Voltage / AV',    slug: 'low-voltage' },
      { label: 'Septic & Drain',      slug: 'septic-drain' },
      { label: 'Welder',              slug: 'welder' },
      { label: 'Elevator Tech',       slug: 'elevator-technician' },
    ]},
]

// Licensing body phrasing — Florida has the DBPR; other states use the generic term
// so the multi-state template never claims the wrong board.
function licensingBody(abbr: string, name: string): string {
  return abbr === 'FL' ? 'the Florida DBPR' : `${name}’s state licensing records`
}

export async function generateMetadata(
  { params }: { params: Promise<{ state: string }> }
): Promise<Metadata> {
  const { state } = await params
  const info = STATE_MAP[state.toLowerCase()]
  const name = info?.name || state.toUpperCase()
  return {
    title: `Verified Trade Professionals in ${name} — ProGuild.ai`,
    description: `Find licensed electricians, plumbers, HVAC techs, roofers and more in ${name}. Every license checked against the state licensing database. Zero lead fees — contact pros directly. ProGuild.ai`,
    alternates: { canonical: `https://proguild.ai/${state.toLowerCase()}` },
  }
}

export default async function StateLandingPage(
  { params }: { params: Promise<{ state: string }> }
) {
  const { state } = await params
  const stateSlug = state.toLowerCase()
  const info = STATE_MAP[stateSlug]
  if (!info) notFound()

  const body = licensingBody(info.abbr, info.name)

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="pointer-events-none absolute inset-0 pg-grid" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-[-80px] pg-hero-glow" aria-hidden
          style={{ width: 760, height: 420, background: 'radial-gradient(ellipse at center, rgba(15,118,110,0.18), rgba(15,118,110,0) 70%)', filter: 'blur(6px)' }} />

        <div className="relative max-w-6xl mx-auto px-6 pt-6 pb-12">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs mb-8" style={{ color: '#8A8578' }}>
            <Link href="/" style={{ color: '#8A8578' }}>Home</Link>
            <span>›</span>
            <span className="font-semibold" style={{ color: '#0A1628' }}>{info.name}</span>
          </div>

          <h1 className="pg-rise font-bold leading-[1.08] tracking-tight mb-5 max-w-2xl"
            style={{ fontSize: 'clamp(2.1rem, 4.5vw, 3.2rem)', fontFamily: "'DM Serif Display', serif", color: '#0A1628' }}>
            {info.name}&rsquo;s licensed trades,{' '}
            <span className="relative inline-block">
              <span style={{ background: 'linear-gradient(100deg, #0F766E, #14B8A6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                all verified.
              </span>
              <svg className="pg-underline absolute left-0 -bottom-1.5 w-full" height="12" viewBox="0 0 300 12" fill="none" preserveAspectRatio="none" aria-hidden>
                <path d="M3 7c60-5 235-6 294-2" stroke="#14B8A6" strokeWidth="3.5" strokeLinecap="round" opacity="0.65" />
              </svg>
            </span>
          </h1>

          <p className="pg-rise text-lg leading-relaxed mb-6 max-w-xl" style={{ color: '#4B5563', animationDelay: '.06s' }}>
            Browse {info.name} contractors by trade — every license checked against {body} before they appear.
            No lead fees, no shared leads, no middleman.
          </p>

          {/* Trust chips — consistent with the homepage */}
          <div className="pg-rise flex flex-wrap items-center gap-x-5 gap-y-2.5 mb-8" style={{ animationDelay: '.1s' }}>
            {['License-verified', 'No shared leads', 'Always free for homeowners'].map(label => (
              <span key={label} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#0A1628' }}>
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white shrink-0" style={{ background: '#0F766E' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                </span>
                {label}
              </span>
            ))}
          </div>

          {/* Search */}
          <form action="/search" method="get" className="pg-rise w-full max-w-xl" style={{ animationDelay: '.14s' }}>
            <div className="flex rounded-2xl overflow-hidden bg-white border"
              style={{ borderColor: '#DDD6CA', boxShadow: '0 20px 52px -18px rgba(10,22,40,0.32)' }}>
              <div className="flex items-center pl-4" style={{ color: '#A89F93' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <input name="q" type="text" placeholder={`Search trades in ${info.name}…`}
                className="flex-1 px-3 py-4 text-base outline-none bg-transparent" style={{ color: '#0A1628' }} />
              <button type="submit" className="px-7 py-4 text-base font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                Search
              </button>
            </div>
          </form>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* ── TRADE GROUPS ───────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#6E6456' }}>Explore trades</div>
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            Browse by trade group
          </h2>
        </div>

        {/* Top row — 3 large cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {TRADE_GROUPS.slice(0, 3).map(group => (
            <div key={group.id} className="pg-tile bg-white rounded-2xl border overflow-hidden"
              style={{ borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <Link href={`/${stateSlug}/${group.id}`}
                className="group/h flex items-center gap-3 px-5 pt-5 pb-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ background: 'rgba(15,118,110,0.08)', color: '#0F766E' }}>
                  {GROUP_ICONS[group.id]}
                </span>
                <span className="font-bold text-base" style={{ color: '#0A1628' }}>{group.label}</span>
                <span className="ml-auto text-sm font-bold transition-transform group-hover/h:translate-x-0.5" style={{ color: '#0F766E' }}>→</span>
              </Link>
              <div className="px-5 pb-5 space-y-0.5">
                {group.trades.slice(0, 4).map(trade => (
                  <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                    className="flex items-center justify-between text-sm py-1.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-[rgba(15,118,110,0.05)]"
                    style={{ color: '#4B5563' }}>
                    <span>{trade.label}</span>
                  </Link>
                ))}
                {group.trades.length > 4 && (
                  <Link href={`/${stateSlug}/${group.id}`}
                    className="text-xs font-semibold px-2 pt-1.5 block" style={{ color: '#0F766E' }}>
                    +{group.trades.length - 4} more trades →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom row — 2 wide cards with pills */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TRADE_GROUPS.slice(3).map(group => (
            <div key={group.id} className="pg-tile bg-white rounded-2xl border overflow-hidden"
              style={{ borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <Link href={`/${stateSlug}/${group.id}`}
                className="group/h flex items-center gap-3 px-5 pt-5 pb-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ background: 'rgba(15,118,110,0.08)', color: '#0F766E' }}>
                  {GROUP_ICONS[group.id]}
                </span>
                <span className="font-bold text-base" style={{ color: '#0A1628' }}>{group.label}</span>
                <span className="ml-auto text-sm font-bold transition-transform group-hover/h:translate-x-0.5" style={{ color: '#0F766E' }}>→</span>
              </Link>
              <div className="px-5 pb-5 flex flex-wrap gap-2">
                {group.trades.map(trade => (
                  <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                    className="pg-pill text-sm font-medium px-3.5 py-1.5 rounded-full border"
                    style={{ color: '#4B5563', borderColor: '#E4DED4', background: 'rgba(15,118,110,0.035)' }}>
                    {trade.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── SEO CONTENT ────────────────────────────────────────────────── */}
        <div className="border-t pt-10 mt-12" style={{ borderColor: '#E8E2D9' }}>
          <h2 className="text-xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            Finding verified trade professionals in {info.name}
          </h2>
          <p className="text-sm leading-relaxed mb-6 max-w-3xl" style={{ color: '#55504A' }}>
            ProGuild checks every trade professional in {info.name} against {body}. Whether you need an HVAC
            technician, electrician, plumber, roofer, or any other skilled tradesperson, every pro listed has an
            active, state-issued license. Contact them directly — no lead fees, no middleman.
          </p>
          <div className="flex flex-wrap gap-2">
            {TRADE_GROUPS.flatMap(g => g.trades).slice(0, 12).map(trade => (
              <Link key={trade.slug} href={`/${stateSlug}/${trade.slug}`}
                className="pg-pill text-xs px-3 py-1.5 rounded-full border"
                style={{ color: '#6B7280', borderColor: '#E8E2D9', background: '#fff' }}>
                {trade.label}s in {info.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t py-8 px-6" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild<span style={{ color: '#0F766E', fontWeight: 500 }}>.ai</span></span>
          <div className="flex flex-wrap gap-5 text-xs">
            {[['/', 'Home'],['/search', 'Find a Pro'],['/community', 'Community'],['/privacy', 'Privacy'],['/terms', 'Terms']].map(([href, label]) => (
              <Link key={href} href={href} style={{ color: '#6B7280' }}>{label}</Link>
            ))}
          </div>
          <div className="text-xs" style={{ color: '#9CA3AF' }}>© 2026 ProGuild.ai</div>
        </div>
      </footer>
    </div>
  )
}
