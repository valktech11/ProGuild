'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'

// ── Colour tokens ─────────────────────────────────────────────────────────────
// BG:      #FAF9F6  warm cream
// CARD:    #FFFFFF  white
// DARK:    #0A1628  navy
// TEAL:    #0F766E  primary accent
// BORDER:  #E8E2D9  warm gray

// ── Trade icons (crisp inline SVG — consistent across every device) ────────────
const ico = {
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.75,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}
const TRADE_ICONS: Record<string, React.ReactNode> = {
  'hvac-technician': (
    <svg {...ico}><path d="M12 2v20M12 2l-2.5 2.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5M3.4 7l17.2 10M3.4 7l.7 3.4M3.4 7l3.4-.7M20.6 17l-.7-3.4M20.6 17l-3.4.7M20.6 7L3.4 17M20.6 7l-3.4-.7M20.6 7l-.7 3.4M3.4 17l3.4.7M3.4 17l.7-3.4"/></svg>
  ),
  'electrician': (
    <svg {...ico}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>
  ),
  'plumber': (
    <svg {...ico}><path d="M12 3c3.5 4.6 5.5 7.6 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 10.6 8.5 7.6 12 3z"/></svg>
  ),
  'roofing': (
    <svg {...ico}><path d="M3 11.5 12 4l9 7.5"/><path d="M6 10.2V20h12v-9.8"/><path d="M10.5 20v-5h3v5"/></svg>
  ),
  'general-contractor': (
    <svg {...ico}><path d="M3 19h18"/><path d="M5 19v-3a7 7 0 0 1 14 0v3"/><path d="M10 9V6h4v3"/><path d="M12 3v3"/></svg>
  ),
  'pool-spa': (
    <svg {...ico}><path d="M2 8c1.8-2 4.2-2 6 0s4.2 2 6 0 4.2-2 6 0"/><path d="M2 13c1.8-2 4.2-2 6 0s4.2 2 6 0 4.2-2 6 0"/><path d="M2 18c1.8-2 4.2-2 6 0s4.2 2 6 0 4.2-2 6 0"/></svg>
  ),
}

// ── Primary trade tiles ───────────────────────────────────────────────────────
const PRIMARY_TRADES = [
  { slug: 'hvac-technician',    label: 'HVAC' },
  { slug: 'electrician',        label: 'Electrician' },
  { slug: 'plumber',            label: 'Plumber' },
  { slug: 'roofing',            label: 'Roofer' },
  { slug: 'general-contractor', label: 'General Contractor' },
  { slug: 'pool-spa',           label: 'Pool & Spa' },
]

const SECONDARY_TRADES = [
  { slug: 'painter',                label: 'Painter' },
  { slug: 'landscaper',             label: 'Landscaper' },
  { slug: 'solar-energy',           label: 'Solar Installer' },
  { slug: 'drywall',                label: 'Drywall' },
  { slug: 'impact-window-shutter',  label: 'Impact Windows' },
  { slug: 'flooring',               label: 'Flooring' },
  { slug: 'pest-control',           label: 'Pest Control' },
  { slug: 'marine-contractor',      label: 'Marine / Dock' },
  { slug: 'carpenter',              label: 'Carpenter' },
  { slug: 'irrigation',             label: 'Irrigation' },
]

const HOW_STEPS_HOMEOWNER = [
  { n: '01', title: 'Tell us what you need', desc: 'Search by trade and city — or just describe the problem and we\'ll find the right trade.' },
  { n: '02', title: 'Compare verified pros', desc: 'View profiles, license numbers and trade details side by side. Every license state-checked.' },
  { n: '03', title: 'Contact directly', desc: 'Message, call or send an enquiry — no bidding wars, no shared leads, no middleman.' },
]

const HOW_STEPS_PRO = [
  { n: '01', title: 'Claim Free', desc: 'Your DBPR license is already in our database. Claim your profile in 30 seconds.' },
  { n: '02', title: 'Get Discovered', desc: 'Homeowners find you by trade and city. Zero per-lead fees — ever.' },
  { n: '03', title: 'Keep Every Dollar', desc: 'One flat monthly fee. Unlimited leads, estimates, invoices, and measurements.' },
]

// ── Trust-strip icons ──────────────────────────────────────────────────────────
const TRUST = [
  {
    title: 'Florida License Verified',
    sub: 'Every contractor is checked against Florida’s state licensing records before they appear — verification via the Florida DBPR.',
    icon: (<svg {...ico} width={26} height={26}><path d="M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>),
  },
  {
    title: 'Zero Lead Fees. Ever.',
    sub: 'Pros pay one flat monthly fee. No per-lead charges means they focus on your job, not chasing credits.',
    icon: (<svg {...ico} width={26} height={26}><path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>),
  },
  {
    title: 'No Shared Leads.',
    sub: 'Your enquiry goes only to the one pro you choose — never resold to five contractors. No bidding wars, no spam calls.',
    icon: (<svg {...ico} width={26} height={26}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>),
  },
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

// ── Hero verified-pro card (illustrative sample — demonstrates the Guild
//    Verified feature; not a real business record, license is masked) ──────────
function VerifiedProCard() {
  return (
    <div className="relative w-full max-w-sm mx-auto lg:ml-auto">
      {/* depth card behind */}
      <div className="absolute -right-3 -top-3 w-full h-full rounded-2xl border" aria-hidden
        style={{ borderColor: '#E8E2D9', background: '#FFFFFF', opacity: 0.5 }} />
      {/* main card */}
      <div className="pg-float relative rounded-2xl bg-white border p-5"
        style={{ borderColor: '#E8E2D9', boxShadow: '0 34px 64px -26px rgba(10,22,40,0.38)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>CR</div>
          <div className="min-w-0">
            <div className="font-semibold text-[15px] leading-tight" style={{ color: '#0A1628' }}>Coastline Roofing</div>
            <div className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>Roofing · Cape Coral, FL</div>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium mb-4"
          style={{ background: 'rgba(15,118,110,0.08)', color: '#0C5F57' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6l7-3z"/></svg>
          CCC# ••• 4021
        </div>
        <div className="flex items-center gap-2 mb-4 pb-4 border-b" style={{ borderColor: '#F0EBE3' }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white shrink-0" style={{ background: '#0F766E' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </span>
          <span className="text-[13px] font-bold" style={{ color: '#0A1628' }}>Guild Verified</span>
          <span className="text-[11px]" style={{ color: '#9CA3AF' }}>· license active in DBPR</span>
        </div>
        <div className="rounded-xl py-2.5 text-center text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>Send an enquiry →</div>
      </div>
      {/* floating DBPR pill — sits below the card, clear of content */}
      <div className="pg-float absolute -bottom-4 left-6 rounded-full bg-white border px-3 py-1.5 text-xs font-bold flex items-center gap-1.5"
        style={{ borderColor: '#E8E2D9', color: '#0C5F57', boxShadow: '0 12px 26px -12px rgba(10,22,40,0.28)', animationDelay: '1.2s' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 pg-pulse" /> DBPR verified
      </div>
    </div>
  )
}

// ── Verified pros band (REAL data, honest fields only — no ratings/jobs/reviews
//    because those aren't populated; section hides itself if none return) ──────
type HomePro = {
  id: string
  full_name: string
  city: string | null
  state: string | null
  license_number: string | null
  is_verified: boolean | null
  trade_category: { category_name: string; slug: string } | null
}

function formatName(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return ''
  const tc = (w: string) => w.split(/\s+/).filter(Boolean).map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ')
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(p => p.trim())
    return `${tc(first)} ${tc(last)}`.trim()
  }
  return s
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

function VerifiedProsBand({ scopeLabel, scopeState }: { scopeLabel: string; scopeState: string }) {
  const [pros, setPros] = useState<HomePro[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    // Query a few specific trades directly (the unfiltered feed is ~all General
    // Contractors, the densest trade) so the band shows real marketplace variety.
    const targets = ['roofing', 'hvac-technician', 'electrician', 'plumber', 'pool-spa', 'general-contractor']
    ;(async () => {
      try {
        const catRes = await fetch('/api/categories').then(r => (r.ok ? r.json() : { categories: [] }))
        const idBySlug = new Map<string, string>()
        for (const c of (catRes.categories || [])) idBySlug.set(c.slug, c.id)
        const ids = targets.map(s => idBySlug.get(s)).filter(Boolean) as string[]
        const results = await Promise.all(
          ids.map(id =>
            fetch(`/api/pros?trade=${id}&limit=1&status=Active&sort=verified`)
              .then(r => (r.ok ? r.json() : { pros: [] }))
              .then(d => (Array.isArray(d.pros) && d.pros[0] ? (d.pros[0] as HomePro) : null))
              .catch(() => null)
          )
        )
        if (!alive) return
        setPros(results.filter(Boolean).slice(0, 4) as HomePro[])
      } catch {
        // leave empty — section hides itself
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  if (!loading && pros.length === 0) return null

  return (
    <section className="max-w-5xl mx-auto px-6 pt-4 pb-12">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>Verified {scopeLabel} pros</h2>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Real contractors — every license checked against state records.</p>
        </div>
        <a href={`/${scopeState}`} className="hidden sm:inline text-sm font-semibold shrink-0 ml-4" style={{ color: '#0F766E' }}>Browse all pros →</a>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border p-4" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                <div className="skeleton w-10 h-10 rounded-full mb-3" />
                <div className="skeleton h-3 w-3/4 mb-2" />
                <div className="skeleton h-2.5 w-1/2" />
              </div>
            ))
          : pros.map(p => {
              const name = formatName(p.full_name)
              const trade = p.trade_category?.category_name || 'Contractor'
              const loc = [p.city, p.state].filter(Boolean).join(', ')
              return (
                <a key={p.id} href={`/pro/${p.id}`} className="pg-tile rounded-2xl border p-4 flex flex-col"
                  style={{ borderColor: '#E8E2D9', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  {p.is_verified && (
                    <div className="inline-flex items-center gap-1 self-start px-2 py-0.5 rounded-md text-[10px] font-bold mb-3" style={{ background: 'rgba(15,118,110,0.09)', color: '#0C5F57' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                      Verified
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>{initials(name)}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: '#0A1628' }}>{name}</div>
                      <div className="text-[11px] truncate" style={{ color: '#9CA3AF' }}>{trade}{loc ? ` · ${loc}` : ''}</div>
                    </div>
                  </div>
                  {p.license_number && (
                    <div className="text-[11px] font-medium mt-auto pt-2" style={{ color: '#9CA3AF' }}>Lic #{p.license_number}</div>
                  )}
                  <div className="text-xs font-semibold mt-2" style={{ color: '#0F766E' }}>View profile →</div>
                </a>
              )
            })}
      </div>
    </section>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [trade, setTrade]               = useState('')
  const [city, setCity]                 = useState('')
  const [zipResolving, setZipResolving] = useState(false)
  const [searching, setSearching]       = useState(false)
  const [activeTab, setActiveTab]       = useState<'homeowner' | 'pro'>('homeowner')

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

    setSearching(true)
    try {
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
    } finally {
      setSearching(false)
    }
  }

  async function handleTileTap(slug: string) {
    await navigate(slug, city.trim() || undefined)
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>

      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Atmosphere: dot-grid + teal glow */}
        <div className="pointer-events-none absolute inset-0 pg-dotgrid" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-[-60px] -z-0 pg-hero-glow" aria-hidden
          style={{ width: 720, height: 420, background: 'radial-gradient(ellipse at center, rgba(15,118,110,0.20), rgba(15,118,110,0) 70%)', filter: 'blur(6px)' }} />

        <div className="relative max-w-6xl mx-auto px-6 pt-16 lg:pt-20 pb-16">
         <div className="grid lg:grid-cols-2 gap-10 lg:gap-10 lg:items-start items-center">
          {/* LEFT — copy + search */}
          <div className="text-center lg:text-left">

          {/* Badge */}
          <div className="pg-rise inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-8 border"
            style={{ background: 'rgba(20,184,166,0.08)', borderColor: 'rgba(20,184,166,0.25)', color: '#0C5F57' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 pg-pulse" />
            Every contractor verified with Florida&rsquo;s licensing database
          </div>

          {/* Headline */}
          <h1 className="pg-rise font-bold leading-[1.05] tracking-tight mb-6"
            style={{ fontSize: 'clamp(2.3rem, 5vw, 3.7rem)', fontFamily: "'DM Serif Display', serif", color: '#0A1628', animationDelay: '.05s' }}>
            Find a licensed contractor<br />
            <span className="relative inline-block">
              <span style={{ background: 'linear-gradient(100deg, #0F766E, #14B8A6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                you can actually reach.
              </span>
              {/* hand-drawn underline */}
              <svg className="pg-underline absolute left-0 -bottom-2 w-full" height="14" viewBox="0 0 300 14" fill="none" preserveAspectRatio="none" aria-hidden>
                <path d="M3 8c60-6 235-8 294-3" stroke="#14B8A6" strokeWidth="3.5" strokeLinecap="round" opacity="0.65" />
              </svg>
            </span>
          </h1>

          <p className="pg-rise text-lg mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed" style={{ color: '#6B7280', animationDelay: '.12s' }}>
            Search {scopeLabel}&rsquo;s licensed contractors by trade and city, and reach
            them directly — no middleman, no lead fees.
          </p>

          {/* Search bar — elevated */}
          <div className="pg-rise pg-search-wrap w-full max-w-xl lg:max-w-none mx-auto lg:mx-0 mb-4 rounded-2xl bg-white p-2 border"
            style={{ borderColor: '#E8E2D9', boxShadow: '0 12px 40px -16px rgba(10,22,40,0.22)', animationDelay: '.18s', position: 'relative', zIndex: 50 }}>
            <SearchAutocomplete
              tradeValue={trade}
              cityValue={city}
              onTradeChange={setTrade}
              onCityChange={setCity}
              onSearch={(t, c) => handleSearch(undefined, t, c)}
              loading={zipResolving || searching}
            />
          </div>

          {/* AI matching — promoted */}
          <div className="pg-rise flex justify-center lg:justify-start mb-9" style={{ animationDelay: '.24s' }}>
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm border"
              style={{ background: 'rgba(15,118,110,0.06)', borderColor: 'rgba(15,118,110,0.16)' }}>
              <span style={{ color: '#0F766E' }}>✦</span>
              <span className="font-semibold" style={{ color: '#0C5F57' }}>Not sure who to call?</span>
              <span style={{ color: '#4B5563' }}>Describe the problem — we&rsquo;ll match the trade.</span>
            </div>
          </div>

          {/* Trust stat band — honest (no supply counts: only ~5.7K of the DBPR
              set are contactable, so a total would misrepresent "reachable") */}
          <div className="pg-rise mx-auto lg:mx-0 max-w-md grid grid-cols-3 gap-px rounded-2xl overflow-hidden border"
            style={{ borderColor: '#E8E2D9', background: '#E8E2D9', animationDelay: '.3s' }}>
            {[
              { num: '$0', label: 'Lead fees, ever' },
              { num: '100%', label: 'Licenses verified' },
              { num: 'No', label: 'Shared leads' },
            ].map((s, i) => (
              <div key={i} className="bg-white py-5 px-3 text-center">
                <div className="text-2xl sm:text-[1.65rem] font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>{s.num}</div>
                <div className="text-[11px] font-medium mt-1 tracking-wide" style={{ color: '#9CA3AF' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Secondary path — for pros */}
          <div className="pg-rise mt-5 text-sm" style={{ animationDelay: '.36s', color: '#6B7280' }}>
            Are you a contractor?{' '}
            <Link href="/login?tab=signup" className="font-semibold underline decoration-transparent hover:decoration-inherit transition"
              style={{ color: '#0F766E' }}>Claim your free profile →</Link>
          </div>
          </div>{/* /LEFT */}

          {/* RIGHT — floating Guild Verified card (desktop only) */}
          <div className="hidden lg:block pg-rise lg:mt-12" style={{ animationDelay: '.36s' }}>
            <VerifiedProCard />
          </div>
         </div>{/* /grid */}
        </div>
      </section>

      {/* ── VERIFIED PROS (real inventory) ───────────────────────────────── */}
      <VerifiedProsBand scopeLabel={scopeLabel} scopeState={scopeState} />

      {/* ── TRADE TILES ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-14 pt-2">
        <div className="text-center mb-7">
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#A89F93' }}>Browse by trade</div>
          <p className="text-sm" style={{ color: '#6B7280' }}>
            {city.trim() ? `Will search near "${city.trim()}"` : 'Enter a city above to find local pros, or tap a trade to browse'}
          </p>
        </div>

        {/* 3×2 primary trade grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
          {PRIMARY_TRADES.map(t => (
            <button key={t.slug} onClick={() => handleTileTap(t.slug)}
              className="pg-tile group bg-white rounded-2xl border p-5 flex flex-col text-left cursor-pointer w-full"
              style={{ borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <span className="pg-tile-ico inline-flex items-center justify-center w-11 h-11 rounded-xl mb-3"
                style={{ background: 'rgba(15,118,110,0.08)', color: '#0F766E' }}>
                {TRADE_ICONS[t.slug]}
              </span>
              <span className="text-[15px] font-semibold mb-0.5" style={{ color: '#0A1628' }}>{t.label}</span>
              <span className="text-xs font-medium" style={{ color: '#9CA3AF' }}>Licensed &amp; verified</span>
              <span className="text-xs font-semibold mt-3 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: '#0F766E' }}>
                {city.trim() ? `Near ${city.trim()}` : 'Find pros'} →
              </span>
            </button>
          ))}
        </div>

        {/* Secondary trades as pills */}
        <div className="flex flex-wrap gap-2 justify-center">
          {SECONDARY_TRADES.map(t => (
            <button key={t.slug} onClick={() => handleTileTap(t.slug)}
              className="pg-pill text-sm font-medium px-3.5 py-1.5 rounded-full border cursor-pointer"
              style={{ color: '#6B7280', borderColor: '#E8E2D9', background: '#FFFFFF' }}>
              {t.label}
            </button>
          ))}
          <a href={`/${scopeState}`}
            className="text-sm font-semibold px-3.5 py-1.5 rounded-full border transition-all"
            style={{ color: '#0F766E', borderColor: 'rgba(15,118,110,0.3)', background: 'rgba(15,118,110,0.05)' }}>
            All trades →
          </a>
        </div>
      </section>

      {/* ── TRUST STRIP ──────────────────────────────────────────────────── */}
      <section className="py-14 px-6 border-y" style={{ background: '#FFFFFF', borderColor: '#E8E2D9' }}>
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {TRUST.map(item => (
            <div key={item.title} className="pg-trust rounded-2xl p-6 text-center md:text-left border"
              style={{ borderColor: '#F0EBE3', background: '#FDFCFA' }}>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
                style={{ background: 'rgba(15,118,110,0.09)', color: '#0F766E' }}>
                {item.icon}
              </div>
              <div className="font-bold text-[15px] mb-1.5" style={{ color: '#0A1628' }}>{item.title}</div>
              <div className="text-[13px] leading-relaxed" style={{ color: '#7C7368' }}>{item.sub}</div>
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
          {(activeTab === 'homeowner' ? HOW_STEPS_HOMEOWNER : HOW_STEPS_PRO).map(step => (
            <div key={step.n} className="relative pl-2">
              <div className="text-3xl font-bold mb-3" style={{ color: 'rgba(15,118,110,0.28)', fontFamily: "'DM Serif Display', serif" }}>
                {step.n}
              </div>
              <div className="font-bold mb-2 text-[17px]" style={{ color: '#0A1628' }}>{step.title}</div>
              <div className="text-base leading-relaxed" style={{ color: '#6B7280' }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MORE THAN A DIRECTORY (product band) ─────────────────────────── */}
      <section className="border-t" style={{ background: '#F5F2EC', borderColor: '#E8E2D9' }}>
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-10">
            <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#A89F93' }}>For the pros behind the work</div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              Built to run the whole job.
            </h2>
            <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: '#6B7280' }}>
              The contractor you reach runs their business on ProGuild — verified profile, leads,
              estimates and measurements — so they&rsquo;re set up to actually deliver.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Panel 1 — Verified profile */}
            <div className="rounded-2xl border p-5" style={{ background: '#FFFFFF', borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="rounded-xl border p-3 mb-4" style={{ borderColor: '#F0EBE3', background: '#FDFCFA' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>PR</div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: '#0A1628' }}>Verified Roofing Co.</div>
                    <div className="text-[10px]" style={{ color: '#9CA3AF' }}>Roofing · Tampa, FL</div>
                  </div>
                </div>
                <div className="mt-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: 'rgba(15,118,110,0.09)', color: '#0C5F57' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  Guild Verified
                </div>
              </div>
              <div className="font-bold text-[15px] mb-1" style={{ color: '#0A1628' }}>Guild Verified profiles</div>
              <div className="text-[13px] leading-relaxed" style={{ color: '#7C7368' }}>Every license checked against Florida&rsquo;s DBPR records — a badge, never a paywall.</div>
            </div>

            {/* Panel 2 — Pipeline / CRM */}
            <div className="rounded-2xl border p-5" style={{ background: '#FFFFFF', borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="rounded-xl border p-3 mb-4 grid grid-cols-3 gap-1.5" style={{ borderColor: '#F0EBE3', background: '#FDFCFA' }}>
                {[['Lead', 2, '#0F766E'], ['Quoted', 1, '#B45309'], ['Won', 1, '#15803D']].map(([label, n, c]) => (
                  <div key={label as string}>
                    <div className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: c as string }}>{label}</div>
                    {Array.from({ length: n as number }).map((_, i) => (
                      <div key={i} className="h-5 rounded mb-1" style={{ background: '#EFECE5' }} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="font-bold text-[15px] mb-1" style={{ color: '#0A1628' }}>Lead &amp; job pipeline</div>
              <div className="text-[13px] leading-relaxed" style={{ color: '#7C7368' }}>Every enquiry tracked from first contact to paid — estimates and invoices built in.</div>
            </div>

            {/* Panel 3 — ProMeasure */}
            <div className="rounded-2xl border p-5" style={{ background: '#FFFFFF', borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="rounded-xl border p-3 mb-4 relative overflow-hidden" style={{ borderColor: '#F0EBE3', background: '#FDFCFA', minHeight: 78 }}>
                <svg viewBox="0 0 120 60" className="w-full h-[70px]" fill="none" stroke="#0F766E" strokeWidth="1.6" strokeLinejoin="round">
                  <path d="M20 44 L60 20 L100 44" opacity="0.9" />
                  <path d="M28 44 L60 25 L92 44" opacity="0.4" strokeDasharray="3 3" />
                  <line x1="20" y1="50" x2="100" y2="50" stroke="#9CA3AF" strokeWidth="1" strokeDasharray="2 2" />
                </svg>
                <div className="absolute right-2 top-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ background: '#0F766E' }}>24.3 sq</div>
              </div>
              <div className="font-bold text-[15px] mb-1" style={{ color: '#0A1628' }}>Instant roof measurements</div>
              <div className="text-[13px] leading-relaxed" style={{ color: '#7C7368' }}>Satellite measurements built in — accurate area and squares without a ladder.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRO CTA BANNER ───────────────────────────────────────────────── */}
      <section className="mx-6 mb-16 mt-16">
        <div className="relative overflow-hidden max-w-5xl mx-auto rounded-3xl p-10 sm:p-12 text-center"
          style={{ background: 'linear-gradient(135deg, #0A1628, #0D2D4A)' }}>
          <div className="pointer-events-none absolute inset-0 pg-cta-grid" aria-hidden />
          <div className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full" aria-hidden
            style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.18), transparent 70%)' }} />
          <div className="relative">
            <div className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#5EEAD4' }}>
              For trade professionals
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3"
              style={{ fontFamily: "'DM Serif Display', serif" }}>
              Your license is already on ProGuild.
            </h2>
            <p className="mb-8 text-sm leading-relaxed max-w-md mx-auto" style={{ color: '#94A3B8' }}>
              We imported every {scopeLabel} contractor license from the DBPR database.
              Search your name — your profile is waiting. Claim it free in 30 seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/login?tab=signup"
                className="pg-cta px-8 py-3.5 rounded-xl font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                Claim Your Profile — Free
              </Link>
              <Link href="/contractors"
                className="px-8 py-3.5 rounded-xl font-semibold border transition-all hover:bg-white/5"
                style={{ color: '#2DD4BF', borderColor: 'rgba(45,212,191,0.3)' }}>
                See All Features →
              </Link>
            </div>
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
                Verified licensed contractors in {scopeLabel}. Zero lead fees. Your Craft. Your Guild.
              </p>
            </div>

            <div className="flex gap-16 text-sm">
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#A89F93' }}>Platform</div>
                <div className="space-y-3">
                  {[['/search','Find a Pro'],['/post-job','Request a Pro'],['/jobs','Find Work'],['/contractors','For Contractors'],['/community','Community']].map(([href, label]) => (
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
                  {[['electrician','Electrician'],['plumber','Plumber'],['hvac-technician','HVAC'],['roofer','Roofer']].map(([slug, label]) => (
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
            <div className="text-xs" style={{ color: '#C4BAB0' }}>License verified against state licensing boards · DBPR</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
