'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'

// ── Colour tokens ─────────────────────────────────────────────────────────────
// BG:      #FAF9F6  warm cream
// CARD:    #FFFFFF  white
// DARK:    #0A1628  navy
// TEAL:    #0F766E  primary accent (v56)
// BORDER:  #E8E2D9  warm gray

// ── 6 primary trade tiles — 3×2 grid, direct to /fl/[slug] ──────────────────
const PRIMARY_TRADES = [
  { slug: 'hvac-technician',    label: 'HVAC',               icon: '❄️', count: '430+' },
  { slug: 'electrician',        label: 'Electrician',        icon: '⚡', count: '154+' },
  { slug: 'plumber',            label: 'Plumber',            icon: '🔧', count: '213+' },
  { slug: 'roofer',             label: 'Roofer',             icon: '🏠', count: '1,386+' },
  { slug: 'general-contractor', label: 'General Contractor', icon: '🏗️', count: '2,751+' },
  { slug: 'pool-spa',           label: 'Pool & Spa',         icon: '🏊', count: '128+' },
]

// Secondary trades — pills below the main grid
const SECONDARY_TRADES = [
  { slug: 'painter',                label: 'Painter' },
  { slug: 'landscaper',             label: 'Landscaper' },
  { slug: 'solar-installer',        label: 'Solar Installer' },
  { slug: 'drywall',                label: 'Drywall' },
  { slug: 'impact-window-shutter',  label: 'Impact Windows' },
  { slug: 'flooring',               label: 'Flooring' },
  { slug: 'pest-control',           label: 'Pest Control' },
  { slug: 'marine-contractor',      label: 'Marine / Dock' },
  { slug: 'carpenter',              label: 'Carpenter' },
  { slug: 'irrigation',             label: 'Irrigation' },
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
  const [trade, setTrade]               = useState('')
  const [city, setCity]                 = useState('')
  const [zipResolving, setZipResolving] = useState(false)
  const [activeTab, setActiveTab]       = useState<'homeowner' | 'pro'>('homeowner')
  const tradeRef = useRef<HTMLInputElement>(null)
  const cityRef  = useRef<HTMLInputElement>(null)

  const scopeLabel = getScopeLabel()
  const scopeState = getScopeState().toLowerCase()

  function cSlug(c: string) {
    return c.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  }

  async function resolveCity(raw: string): Promise<string | null> {
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (/^\d{5}$/.test(trimmed)) {
      setZipResolving(true)
      try {
        const res  = await fetch(`/api/zip?zip=${trimmed}`)
        const data = await res.json()
        if (data.city) return cSlug(data.city)
      } catch {}
      finally { setZipResolving(false) }
      return null
    }
    return cSlug(trimmed)
  }

  async function navigate(tradeSlug: string, rawCity?: string) {
    const citySlug = rawCity ? await resolveCity(rawCity) : null
    if (citySlug) {
      router.push(`/${scopeState}/${tradeSlug}/${citySlug}`)
    } else {
      router.push(`/${scopeState}/${tradeSlug}`)
    }
  }

  async function handleSearch(e?: React.FormEvent, overrideTrade?: string, overrideCity?: string) {
    e?.preventDefault()
    const t = (overrideTrade ?? trade).trim()
    const c = (overrideCity  ?? city).trim()
    if (!t && !c) return

    if (t) {
      const res  = await fetch('/api/match-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: t }),
      })
      const data = await res.json()
      const threshold = data.method === 'keyword' ? 0.80 : 0.85
      if (data.slug && data.confidence >= threshold) {
        await navigate(data.slug, c)
        return
      }
    }

    const params = new URLSearchParams()
    if (t) params.set('q', t)
    if (c) params.set('city', c)
    router.push(`/search?${params}`)
  }

  async function handleTileTap(slug: string) {
    await navigate(slug, city.trim() || undefined)
  }

  function detectLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        const data = await res.json()
        const detected = data.address?.city || data.address?.town || data.address?.village || ''
        if (detected) setCity(detected)
      } catch {}
    })
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>

      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">

        {/* Live badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8 border"
          style={{ background: 'rgba(20,184,166,0.08)', borderColor: 'rgba(20,184,166,0.25)', color: '#0C5F57' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
          📍 Now live in {scopeLabel}
        </div>

        {/* Headline */}
        <h1 className="font-bold leading-none tracking-tight mb-6"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', fontFamily: "'DM Serif Display', serif", color: '#0A1628' }}>
          CRAFT.<br />
          <span style={{ color: '#0F766E' }}>GUILD.</span><br />
          VERIFIED.
        </h1>

        <p className="text-lg mb-10 max-w-xl mx-auto leading-relaxed" style={{ color: '#6B7280' }}>
          {scopeLabel !== 'Florida' ? scopeLabel + "'s" : 'The'} verified trades network — for homeowners who need a pro, and pros who deserve better.
        </p>

        {/* ── SEARCH BAR — autocomplete + fuzzy matching ───────────────── */}
        <div className="max-w-3xl mx-auto mb-5">
          <SearchAutocomplete
            tradeValue={trade}
            cityValue={city}
            onTradeChange={setTrade}
            onCityChange={setCity}
            onSearch={(t, c) => handleSearch(undefined, t, c)}
            loading={zipResolving}
          />
        </div>

        {/* AI hint */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <span style={{ color: '#0F766E' }}>✦</span>
          <span className="text-sm font-medium" style={{ color: '#4B5563' }}>
            Describe your problem — AI finds the right trade automatically
          </span>
        </div>

        {/* Trust stats */}
        <div className="flex items-center justify-center gap-6 flex-wrap mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🛡</span>
            <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>134,000+</span>
            <span className="text-sm" style={{ color: '#6B7280' }}>state-verified licensed pros</span>
          </div>
          <div className="w-px h-4 bg-gray-200 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>Zero</span>
            <span className="text-sm" style={{ color: '#6B7280' }}>lead fees, ever</span>
          </div>
          <div className="w-px h-4 bg-gray-200 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>License</span>
            <span className="text-sm" style={{ color: '#6B7280' }}>state-verified</span>
          </div>
        </div>
      </section>

      {/* ── TRADE TILES ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-12">
        <div className="text-center mb-6">
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#A89F93' }}>Or tap a trade</div>
          <p className="text-sm" style={{ color: '#6B7280' }}>
            {city.trim() ? `Will search near "${city.trim()}"` : 'Enter a city above to find local pros, or tap a trade to browse'}
          </p>
        </div>

        {/* 3×2 primary trade grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {PRIMARY_TRADES.map(t => (
            <button key={t.slug} onClick={() => handleTileTap(t.slug)}
              className="group bg-white rounded-2xl border p-4 flex flex-col text-left hover:-translate-y-0.5 transition-all duration-200 cursor-pointer w-full"
              style={{ borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <span className="text-2xl mb-2">{t.icon}</span>
              <span className="text-sm font-semibold mb-0.5" style={{ color: '#0A1628' }}>{t.label}</span>
              {t.count && <span className="text-sm font-medium" style={{ color: '#6B7280' }}>{t.count} licensed</span>}
              <span className="text-xs font-semibold mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: '#0F766E' }}>
                {city.trim() ? `Near ${city.trim()} →` : 'Browse pros →'}
              </span>
            </button>
          ))}
        </div>

        {/* Secondary trades as pills */}
        <div className="flex flex-wrap gap-2 justify-center">
          {SECONDARY_TRADES.map(t => (
            <button key={t.slug} onClick={() => handleTileTap(t.slug)}
              className="text-sm font-medium px-3 py-1.5 rounded-full border transition-all hover:border-teal-400 hover:text-teal-700 cursor-pointer"
              style={{ color: '#6B7280', borderColor: '#E8E2D9', background: '#FAF9F6' }}>
              {t.label}
            </button>
          ))}
          <a href={`/${scopeState}`}
            className="text-sm font-semibold px-3 py-1.5 rounded-full border transition-all"
            style={{ color: '#0F766E', borderColor: 'rgba(15,118,110,0.3)', background: 'rgba(15,118,110,0.05)' }}>
            All trades →
          </a>
        </div>
      </section>

      {/* ── TRUST STRIP ──────────────────────────────────────────────────── */}
      <section className="py-12 px-6 border-y" style={{ background: '#FFFFFF', borderColor: '#E8E2D9' }}>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {[
            { icon: '🛡', title: 'License Verified', sub: 'Every pro checked against their state licensing board' },
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
                  ? { background: '#0F766E', color: '#FFFFFF' }
                  : { color: '#6B7280' }}>
                {tab === 'homeowner' ? '🏠 For homeowners' : '🔧 For pros'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {(activeTab === 'homeowner' ? HOW_STEPS_HOMEOWNER : HOW_STEPS_PRO).map((step, i) => (
            <div key={step.n} className="relative">

              <div className="text-3xl font-bold mb-4" style={{ color: '#A89F93', fontFamily: "'DM Serif Display', serif" }}>
                {step.n}
              </div>
              <div className="font-bold mb-2" style={{ color: '#0A1628' }}>{step.title}</div>
              <div className="text-base leading-relaxed" style={{ color: '#6B7280' }}>{step.desc}</div>
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
            Other platforms charge pros per lead — sometimes more than the job is worth. ProGuild is one flat fee. Zero per-lead charges. Every dollar you earn stays yours.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login?tab=signup"
              className="px-8 py-3.5 rounded-xl font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
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
                <span className="font-sans font-medium text-sm" style={{ color: '#0F766E' }}>.ai</span>
              </div>
              <p className="text-base leading-relaxed" style={{ color: '#A89F93' }}>
                {scopeLabel}'s verified professional trades network. State-licensed pros. Zero lead fees. Your Craft. Your Guild.
              </p>
            </div>

            <div className="flex gap-16 text-sm">
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#A89F93' }}>Platform</div>
                <div className="space-y-3">
                  {[['/search','Find a Pro'],['/post-job','Request a Pro'],['/jobs','Find Work'],['/community','Community']].map(([href, label]) => (
                    <Link key={href} href={href}
                      className="block transition-colors text-sm"
                      style={{ color: '#6B7280' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
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
                      onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
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
                      onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
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
            <div className="text-xs" style={{ color: '#C4BAB0' }}>© 2026 ProGuild.ai</div>
            <div className="text-xs" style={{ color: '#C4BAB0' }}>Verified against state licensing boards · OSHA · Background checked</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
