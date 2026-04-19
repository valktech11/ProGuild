'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Colour tokens ─────────────────────────────────────────────────────────────
// BG:      #F5F0E8  warm cream (Claude-inspired)
// NAV:     #FFFFFF  white card
// CARD:    #FFFFFF  white
// DARK:    #0A1628  navy (headlines, footer)
// TEAL:    #14B8A6  primary accent
// BORDER:  #E8E2D9  warm gray

// ── Static data ───────────────────────────────────────────────────────────────
// PRIMARY_COUNT = trades shown by default on card (mobile launchpad)
const PRIMARY_COUNT = 4

const TRADE_GROUPS = [
  {
    id: 'mechanical',
    label: 'Mechanical',
    icon: '⚡',
    accent: '#14B8A6',
    trades: [
      // Florida-first: HVAC is #1 search, then Electrician, Plumber, Solar
      { label: 'HVAC Technician',     slug: 'hvac-technician' },
      { label: 'Electrician',         slug: 'electrician' },
      { label: 'Plumber',             slug: 'plumber' },
      { label: 'Solar Installer',     slug: 'solar-installer' },
      { label: 'Gas Fitter',          slug: 'gas-fitter' },
      { label: 'Fire Sprinkler',      slug: 'fire-sprinkler' },
    ],
  },
  {
    id: 'structural',
    label: 'Structural',
    icon: '🏗',
    accent: '#6366F1',
    trades: [
      // Roofer #1 in FL post-hurricane season, GC #2, Impact Windows added
      { label: 'Roofer',                      slug: 'roofer' },
      { label: 'General Contractor',          slug: 'general-contractor' },
      { label: 'Impact Window & Shutter',     slug: 'impact-window-shutter' },
      { label: 'Framing Carpenter',           slug: 'carpenter' },
      { label: 'Mason',                       slug: 'mason' },
      { label: 'Concrete',                    slug: 'concrete-contractor' },
      { label: 'Foundation',                  slug: 'foundation-specialist' },
    ],
  },
  {
    id: 'finishing',
    label: 'Finishing',
    icon: '🎨',
    accent: '#F59E0B',
    trades: [
      { label: 'Painter',             slug: 'painter' },
      { label: 'Flooring',            slug: 'flooring' },
      { label: 'Drywall',             slug: 'drywall' },
      { label: 'Tile Setter',         slug: 'tile-setter' },
      { label: 'Insulation',          slug: 'insulation-contractor' },
      { label: 'Windows & Doors',     slug: 'windows-doors' },
    ],
  },
  {
    id: 'property',
    label: 'Property',
    icon: '🌿',
    accent: '#10B981',
    trades: [
      // Pool & Spa #1 in FL — daily search term
      { label: 'Pool & Spa',          slug: 'pool-spa' },
      { label: 'Landscaper',          slug: 'landscaper' },
      { label: 'Pest Control',        slug: 'pest-control' },
      { label: 'Irrigation',          slug: 'irrigation' },
      { label: 'Handyman',            slug: 'handyman' },
      { label: 'Home Inspector',      slug: 'home-inspector' },
    ],
  },
  {
    id: 'specialty',
    label: 'Specialty',
    icon: '🔐',
    accent: '#8B5CF6',
    trades: [
      // Marine/Dock #1 in coastal FL — Jacksonville, Miami, Tampa
      { label: 'Marine / Dock',       slug: 'marine-contractor' },
      { label: 'Alarm & Security',    slug: 'alarm-security' },
      { label: 'Low-Voltage / AV',    slug: 'low-voltage' },
      { label: 'Septic & Drain',      slug: 'septic-drain' },
      { label: 'Welder',              slug: 'welder' },
      { label: 'Elevator Tech',       slug: 'elevator-technician' },
    ],
  },
]

const HOW_STEPS_HOMEOWNER = [
  { n: '01', title: 'Search', desc: 'Enter your trade and city. Every result is DBPR license-verified.' },
  { n: '02', title: 'Compare', desc: 'See ProGuild Score, reviews, credentials, and project photos side by side.' },
  { n: '03', title: 'Hire Direct', desc: 'Contact the pro directly. No middleman. No lead fees charged to them.' },
]

const HOW_STEPS_PRO = [
  { n: '01', title: 'Join Free', desc: 'Create your profile. Your DBPR license is already in our database.' },
  { n: '02', title: 'Get Discovered', desc: 'Homeowners find you by trade and city. Your ProGuild Score builds over time.' },
  { n: '03', title: 'Keep Every Dollar', desc: 'One flat monthly fee. Zero per-lead charges. Ever.' },
]

// ── Scope helpers ─────────────────────────────────────────────────────────────
function getScopeState(): string {
  return (process.env.NEXT_PUBLIC_LAUNCH_SCOPE || 'FL').split(',')[0].trim().toUpperCase()
}

function getScopeLabel(): string {
  const scope = (process.env.NEXT_PUBLIC_LAUNCH_SCOPE || 'FL').toUpperCase()
  if (scope === 'NATIONAL') return 'Nationwide'
  const names: Record<string, string> = { FL: 'Florida', TX: 'Texas', CA: 'California', NY: 'New York', GA: 'Georgia' }
  const states = scope.split(',').map(s => names[s.trim()] || s.trim())
  if (states.length === 1) return states[0]
  if (states.length === 2) return `${states[0]} & ${states[1]}`
  return `${states.slice(0, -1).join(', ')} & ${states[states.length - 1]}`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [search, setSearch]       = useState('')
  const [activeTab, setActiveTab] = useState<'homeowner' | 'pro'>('homeowner')
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scopeLabel = getScopeLabel()
  const scopeState = getScopeState().toLowerCase()

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!search.trim()) { inputRef.current?.focus(); return }
    router.push(`/search?q=${encodeURIComponent(search.trim())}`)
  }

  return (
    <div className="min-h-screen" style={{ background: '#F5F0E8', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#ng)"/>
                <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                <defs><linearGradient id="ng" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#2DD4BF"/><stop offset="1" stopColor="#0D7377"/></linearGradient></defs>
              </svg>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-lg font-bold" style={{ color: '#0A1628' }}>ProGuild</span>
              <span className="text-lg font-light" style={{ color: '#14B8A6' }}>.ai</span>
            </div>
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-1">
            {[
              ['/search',    'Find a Pro'],
              ['/post-job',  'Post a Job'],
              ['/community', 'Community'],
              ['/jobs',      'Jobs'],
            ].map(([href, label]) => (
              <Link key={href} href={href}
                className="text-sm px-3 py-2 rounded-lg transition-colors font-medium"
                style={{ color: '#6B7280' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#0A1628')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}>
                {label}
              </Link>
            ))}
          </div>

          {/* Auth */}
          <div className="flex items-center gap-3">
            <Link href="/login"
              className="text-sm font-medium hidden sm:block transition-colors"
              style={{ color: '#6B7280' }}>
              Pro Log In
            </Link>
            <Link href="/login?tab=signup"
              className="text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
              Join Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">

        {/* Live badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8 border"
          style={{ background: 'rgba(20,184,166,0.08)', borderColor: 'rgba(20,184,166,0.25)', color: '#0D7377' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
          📍 Now live in {scopeLabel}
        </div>

        {/* Headline */}
        <h1 className="font-bold leading-none tracking-tight mb-6"
          style={{ fontSize: 'clamp(3.5rem, 9vw, 7rem)', fontFamily: "'DM Serif Display', serif", color: '#0A1628' }}>
          CRAFT.<br />
          <span style={{ color: '#14B8A6' }}>GUILD.</span><br />
          VERIFIED.
        </h1>

        <p className="text-lg mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: '#6B7280' }}>
          {scopeLabel}'s verified trades network — for homeowners who need a pro, and pros who deserve better.
        </p>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-4">
          <div className="flex rounded-2xl overflow-hidden shadow-sm border bg-white"
            style={{ borderColor: '#E8E2D9' }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={`Electrician, plumber... city or ZIP in ${scopeLabel}...`}
              className="flex-1 px-5 py-4 text-sm outline-none"
              style={{ background: 'transparent', color: '#0A1628' }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}
                className="px-3 text-gray-300 hover:text-gray-500 transition-colors">×</button>
            )}
            <button type="submit"
              className="px-7 py-4 text-sm font-bold text-white transition-all hover:opacity-90 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
              Search
            </button>
          </div>
        </form>

        {/* Trust line */}
        <p className="text-xs" style={{ color: '#A89F93' }}>
          134,000+ DBPR-verified {scopeLabel} pros · Zero lead fees · License checked
        </p>
      </section>

      {/* ── DUAL GATEWAY ─────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Homeowner card */}
          <div className="bg-white rounded-2xl p-7 border" style={{ borderColor: '#E8E2D9' }}>
            <div className="text-2xl mb-3">🏠</div>
            <div className="font-bold text-lg mb-1.5" style={{ color: '#0A1628' }}>I need a pro</div>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: '#6B7280' }}>
              Find a DBPR-licensed, ID-verified tradesperson near you. Read real reviews. Hire with confidence.
            </p>
            <Link href="/search"
              className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
              Find a Pro →
            </Link>
          </div>

          {/* Pro card */}
          <div className="bg-white rounded-2xl p-7 border" style={{ borderColor: '#E8E2D9' }}>
            <div className="text-2xl mb-3">🔧</div>
            <div className="font-bold text-lg mb-1.5" style={{ color: '#0A1628' }}>I am a pro</div>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: '#6B7280' }}>
              Other platforms charge you $18–$200 per lead. We charge one flat fee. Join {scopeLabel}'s verified trades guild.
            </p>
            <Link href="/login?tab=signup"
              className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl border transition-all hover:bg-gray-50"
              style={{ color: '#0A1628', borderColor: '#E8E2D9' }}>
              Join Free →
            </Link>
          </div>
        </div>
      </section>

      {/* ── TRADE CATEGORIES ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#A89F93' }}>Browse by trade</div>
          <h2 className="text-2xl font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            Find the right professional
          </h2>
        </div>

        {/* Global hover expansion style — desktop only */}
        <style>{`
          @media (hover: hover) {
            .trade-card-extra { max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.25s ease, opacity 0.2s ease; }
            .trade-card:hover .trade-card-extra { max-height: 200px; opacity: 1; }
            .trade-card { position: relative; }
            .trade-card:hover { z-index: 10; box-shadow: 0 8px 24px rgba(0,0,0,0.10); }
          }
        `}</style>

        {/* Top 3 — large cards with progressive disclosure */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4" style={{ position: 'relative' }}>
          {TRADE_GROUPS.slice(0, 3).map(group => (
            <div key={group.id}
              className="trade-card bg-white rounded-2xl border overflow-hidden transition-all duration-200"
              style={{ borderColor: '#E8E2D9', borderTopWidth: '3px', borderTopColor: group.accent }}>
              <div className="p-5">
                {/* Card header */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{group.icon}</span>
                  <span className="font-bold text-base" style={{ color: '#0A1628' }}>{group.label}</span>
                </div>

                {/* Primary trades — always visible (mobile launchpad) */}
                <div className="space-y-1">
                  {group.trades.slice(0, PRIMARY_COUNT).map(trade => (
                    <Link key={trade.slug}
                      href={`/${scopeState}/${trade.slug}`}
                      className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg transition-all group/link"
                      style={{ color: '#4B5563' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F5F0E8'; e.currentTarget.style.color = group.accent }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4B5563' }}>
                      <span>{trade.label}</span>
                      <span className="opacity-0 group-hover/link:opacity-100 transition-opacity text-xs">→</span>
                    </Link>
                  ))}
                </div>

                {/* Secondary trades — desktop hover reveal only */}
                {group.trades.length > PRIMARY_COUNT && (
                  <div className="trade-card-extra">
                    <div className="pt-2 space-y-1 border-t mt-2" style={{ borderColor: '#F5F0E8' }}>
                      {group.trades.slice(PRIMARY_COUNT).map(trade => (
                        <Link key={trade.slug}
                          href={`/${scopeState}/${trade.slug}`}
                          className="flex items-center justify-between py-1 px-2 rounded-lg transition-all group/link2"
                          style={{ color: '#A89F93', fontSize: '11px' }}
                          onMouseEnter={e => { e.currentTarget.style.color = group.accent }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#A89F93' }}>
                          <span>{trade.label}</span>
                          <span className="opacity-0 group-hover/link2:opacity-100 transition-opacity" style={{ fontSize: '10px' }}>→</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Browse All — mobile tap target + desktop fallback */}
                <Link
                  href={`/search?group=${group.id}`}
                  className="mt-4 flex items-center justify-between w-full text-xs font-bold py-2.5 px-3 rounded-xl border transition-all"
                  style={{ color: group.accent, borderColor: group.accent + '40', background: group.accent + '08' }}
                  onMouseEnter={e => { e.currentTarget.style.background = group.accent + '15' }}
                  onMouseLeave={e => { e.currentTarget.style.background = group.accent + '08' }}>
                  <span>Browse all {group.label}</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom 2 — compact cards with Browse All */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TRADE_GROUPS.slice(3).map(group => (
            <div key={group.id}
              className="trade-card bg-white rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-md"
              style={{ borderColor: '#E8E2D9', borderTopWidth: '3px', borderTopColor: group.accent }}>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{group.icon}</span>
                  <span className="font-bold" style={{ color: '#0A1628' }}>{group.label}</span>
                </div>
                {/* Primary trades as pills */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {group.trades.slice(0, PRIMARY_COUNT).map(trade => (
                    <Link key={trade.slug}
                      href={`/${scopeState}/${trade.slug}`}
                      className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all"
                      style={{ color: '#4B5563', borderColor: '#E8E2D9', background: '#F5F0E8' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = group.accent; e.currentTarget.style.color = group.accent; e.currentTarget.style.background = '#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E2D9'; e.currentTarget.style.color = '#4B5563'; e.currentTarget.style.background = '#F5F0E8' }}>
                      {trade.label}
                    </Link>
                  ))}
                </div>
                {/* Browse All button */}
                <Link
                  href={`/search?group=${group.id}`}
                  className="flex items-center justify-between w-full text-xs font-bold py-2 px-3 rounded-xl border transition-all"
                  style={{ color: group.accent, borderColor: group.accent + '40', background: group.accent + '08' }}
                  onMouseEnter={e => { e.currentTarget.style.background = group.accent + '15' }}
                  onMouseLeave={e => { e.currentTarget.style.background = group.accent + '08' }}>
                  <span>Browse all {group.label}</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUST STRIP ──────────────────────────────────────────────────── */}
      <section className="py-12 px-6 border-y" style={{ background: '#FFFFFF', borderColor: '#E8E2D9' }}>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {[
            { icon: '🛡', title: 'DBPR License Verified', sub: 'Every pro checked against Florida state database' },
            { icon: '✦', title: 'Zero Lead Fees. Ever.', sub: 'One flat monthly subscription — keep every dollar' },
            { icon: '✓', title: 'ID + Background Checked', sub: 'Didit-powered identity verification on signup' },
          ].map(item => (
            <div key={item.title}>
              <div className="text-3xl mb-3">{item.icon}</div>
              <div className="font-bold text-sm mb-1" style={{ color: '#0A1628' }}>{item.title}</div>
              <div className="text-xs leading-relaxed" style={{ color: '#A89F93' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#A89F93' }}>How it works</div>
          <h2 className="text-2xl font-bold mb-6" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            Simple. Direct. Transparent.
          </h2>
          {/* Tab switcher */}
          <div className="inline-flex rounded-xl border p-1" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
            {(['homeowner', 'pro'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                style={activeTab === tab
                  ? { background: '#14B8A6', color: '#FFFFFF' }
                  : { color: '#6B7280' }}>
                {tab === 'homeowner' ? '🏠 For homeowners' : '🔧 For pros'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {(activeTab === 'homeowner' ? HOW_STEPS_HOMEOWNER : HOW_STEPS_PRO).map((step, i) => (
            <div key={step.n} className="relative">
              {i < 2 && (
                <div className="hidden md:block absolute top-5 left-full w-full h-px"
                  style={{ background: 'linear-gradient(90deg, #E8E2D9, transparent)' }} />
              )}
              <div className="text-3xl font-bold mb-4" style={{ color: '#E8E2D9', fontFamily: "'DM Serif Display', serif" }}>
                {step.n}
              </div>
              <div className="font-bold mb-2" style={{ color: '#0A1628' }}>{step.title}</div>
              <div className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRO CTA BANNER ───────────────────────────────────────────────── */}
      <section className="mx-6 mb-16">
        <div className="max-w-5xl mx-auto rounded-2xl p-10 text-center"
          style={{ background: 'linear-gradient(135deg, #0A1628, #0D2D4A)' }}>
          <div className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#5EEAD4' }}>
            For trade professionals
          </div>
          <h2 className="text-2xl font-bold text-white mb-3"
            style={{ fontFamily: "'DM Serif Display', serif" }}>
            Your craft shouldn't cost you a lead fee.
          </h2>
          <p className="mb-8 text-sm leading-relaxed max-w-md mx-auto" style={{ color: '#94A3B8' }}>
            Other platforms charge pros per lead — sometimes more than the job is worth. ProGuild is one flat fee. Zero per-lead charges. Your clients, your income.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login?tab=signup"
              className="px-8 py-3.5 rounded-xl font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #14B8A6, #0D7377)' }}>
              Join the Guild — Free
            </Link>
            <Link href="/community"
              className="px-8 py-3.5 rounded-xl font-semibold border transition-all hover:bg-white/5"
              style={{ color: '#94A3B8', borderColor: 'rgba(255,255,255,0.15)' }}>
              Explore the Community
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t py-12 px-6" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap items-start justify-between gap-10 mb-10">
            <div className="max-w-xs">
              <div className="flex items-baseline gap-0.5 mb-3">
                <span className="text-xl font-bold" style={{ color: '#0A1628' }}>ProGuild</span>
                <span className="text-xl font-light" style={{ color: '#14B8A6' }}>.ai</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#A89F93' }}>
                {scopeLabel}'s verified professional trades network. DBPR-integrated. Zero lead fees. Your Craft. Your Guild.
              </p>
            </div>

            <div className="flex gap-16 text-sm">
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#A89F93' }}>Platform</div>
                <div className="space-y-3">
                  {[['/search','Find a Pro'],['/post-job','Post a Job'],['/jobs','Browse Jobs'],['/community','Community']].map(([href, label]) => (
                    <Link key={href} href={href}
                      className="block transition-colors text-sm"
                      style={{ color: '#6B7280' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#14B8A6')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#A89F93' }}>Company</div>
                <div className="space-y-3">
                  {[['/about','About'],['/contact','Contact'],['/privacy','Privacy'],['/terms','Terms']].map(([href, label]) => (
                    <Link key={href} href={href}
                      className="block transition-colors text-sm"
                      style={{ color: '#6B7280' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#14B8A6')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#A89F93' }}>Top Trades</div>
                <div className="space-y-3">
                  {[['electrician','Electrician'],['plumber','Plumber'],['hvac-technician','HVAC'],['general-contractor','General Contractor']].map(([slug, label]) => (
                    <Link key={slug} href={`/${scopeState}/${slug}`}
                      className="block transition-colors text-sm"
                      style={{ color: '#6B7280' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#14B8A6')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-6 flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: '#E8E2D9' }}>
            <div className="text-xs" style={{ color: '#C4BAB0' }}>© 2026 ProGuild.ai · Univaro Technologies Pvt Ltd</div>
            <div className="text-xs" style={{ color: '#C4BAB0' }}>Verified against Florida DBPR · OSHA · State licensing boards</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
