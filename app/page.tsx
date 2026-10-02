'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import SearchAutocomplete from '@/components/ui/SearchAutocomplete'
import VerifiedProsBand from '@/components/ui/VerifiedProsBand'

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

// ── Secondary-trade mini icons (14px line icons for the "More trades" rail) ────
const sico = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const SECONDARY_TRADE_ICONS: Record<string, React.ReactNode> = {
  'painter':               (<svg {...sico}><path d="M3 21c0-2.4 1.7-4 3.5-4L9 19.3C9 21.1 7.2 22.5 5 22.5"/><path d="M8.5 16.5 18 7a2 2 0 0 0-3-3L5.5 13.5z"/></svg>),
  'landscaper':            (<svg {...sico}><path d="M4 20c0-8 6-13 16-13 0 10-6 14-16 13z"/><path d="M4 20c4-5 8-8 12-9.5"/></svg>),
  'solar-energy':          (<svg {...sico}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></svg>),
  'drywall':               (<svg {...sico}><rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 12h17M12 5v14"/></svg>),
  'impact-window-shutter': (<svg {...sico}><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 3v18M5 12h14"/></svg>),
  'flooring':              (<svg {...sico}><rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3 11h18M3 15.5h18M9 5.5V11M15 11v4.5M9 15.5V18.5"/></svg>),
  'pest-control':          (<svg {...sico}><ellipse cx="12" cy="13.5" rx="4.5" ry="5.5"/><path d="M12 8V4.5M9.5 6 8 4M14.5 6 16 4M7.5 11 4.5 9.5M16.5 11l3-1.5M7.2 16 4.2 17.5M16.8 16l3 1.5"/></svg>),
  'marine-contractor':     (<svg {...sico}><circle cx="12" cy="4.5" r="2"/><path d="M12 6.5v13M6.5 12.5H5a7 7 0 0 0 14 0h-1.5M8 11l-2.5 1.5M16 11l2.5 1.5"/></svg>),
  'carpenter':             (<svg {...sico}><path d="M5 4v15h15"/><path d="M5 9h6M5 14h11"/></svg>),
  'irrigation':            (<svg {...sico}><path d="M12 3.5c3.5 4.5 5.5 7.4 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10.9 8.5 8 12 3.5z"/></svg>),
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
  { n: '01', title: 'Tell us what you need', desc: 'Search by trade and city, or describe the job in plain words.' },
  { n: '02', title: 'Compare pros side by side', desc: 'See profiles, license numbers and trade details for each match.' },
  { n: '03', title: 'Reach out directly', desc: 'Message, call or send an inquiry straight to the pro you pick.' },
]

const HOW_STEPS_PRO = [
  { n: '01', title: 'Claim Free', desc: 'Your state license is already in our database. Claim your profile in 30 seconds.' },
  { n: '02', title: 'Get Discovered', desc: 'Homeowners find you by trade and city. Zero per-lead fees — ever.' },
  { n: '03', title: 'Keep Every Dollar', desc: 'One flat monthly fee. Unlimited leads, estimates, invoices, and measurements.' },
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

// ── Hero verified-pro card — shows a REAL verified pro (license masked), with an
//    illustrative fallback so the hero never renders empty or broken ───────────
function VerifiedProCard() {
  const [pro, setPro] = useState<HomePro | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const cat = await fetch('/api/categories').then(r => (r.ok ? r.json() : { categories: [] }))
        const roofId = (cat.categories || []).find((c: { slug: string; id: string }) => c.slug === 'roofing')?.id
        const url = roofId
          ? `/api/pros?trade=${roofId}&limit=1&status=Active&sort=verified`
          : `/api/pros?limit=1&status=Active&sort=verified`
        const d = await fetch(url).then(r => (r.ok ? r.json() : { pros: [] }))
        const p = Array.isArray(d.pros) && d.pros[0] ? (d.pros[0] as HomePro) : null
        if (alive && p && p.is_verified) setPro(p)
      } catch { /* keep illustrative fallback */ }
    })()
    return () => { alive = false }
  }, [])

  // Real pro when it loads; otherwise a clearly-illustrative preview of the feature.
  const name  = pro ? formatName(pro.full_name) : 'Coastline Roofing'
  const trade = pro ? (pro.trade_category?.category_name || 'Contractor') : 'Roofing'
  const loc   = pro
    ? [titleCase(pro.city || ''), (pro.state || '').toUpperCase()].filter(Boolean).join(', ')
    : 'Cape Coral, FL'
  const lic   = pro?.license_number ? maskLicense(pro.license_number) : 'CCC# ••• 4021'

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
            style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>{initials(name)}</div>
          <div className="min-w-0">
            <div className="font-semibold text-[15px] leading-tight truncate" style={{ color: '#0A1628' }}>{name}</div>
            <div className="text-xs mt-0.5 truncate" style={{ color: '#6B7280' }}>{trade}{loc ? ` · ${loc}` : ''}</div>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium mb-4"
          style={{ background: 'rgba(15,118,110,0.08)', color: '#0C5F57' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6l7-3z"/></svg>
          {lic}
        </div>
        <div className="flex items-center gap-2 mb-4 pb-4 border-b" style={{ borderColor: '#F0EBE3' }}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white shrink-0" style={{ background: '#0F766E' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
          </span>
          <span className="text-[13px] font-bold" style={{ color: '#0A1628' }}>Guild Verified</span>
        </div>
        {pro
          ? <a href={`/pro/${pro.id}`} className="block rounded-xl py-2.5 text-center text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>Send an inquiry →</a>
          : <div className="rounded-xl py-2.5 text-center text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#0F766E,#0C5F57)' }}>Send an inquiry →</div>}
      </div>
      {/* floating verification pill — sits below the card, clear of content */}
      <div className="pg-float absolute -bottom-4 left-6 rounded-full bg-white border px-3 py-1.5 text-xs font-bold flex items-center gap-1.5"
        style={{ borderColor: '#E8E2D9', color: '#0C5F57', boxShadow: '0 12px 26px -12px rgba(10,22,40,0.28)', animationDelay: '1.2s' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 pg-pulse" /> License verified
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

// Title-case a business / person / city string, preserving common all-caps tokens
// so real, messy source data ("roofing boys inc", "apolo beach") renders cleanly.
function titleCase(raw: string): string {
  const KEEP = new Set(['LLC', 'INC', 'HVAC', 'AC', 'PLLC', 'PA', 'CO', 'USA', 'II', 'III', 'IV'])
  return (raw || '').split(/\s+/).filter(Boolean).map(x => {
    const bare = x.replace(/[.,]/g, '').toUpperCase()
    if (KEEP.has(bare)) return x.toUpperCase()
    return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()
  }).join(' ')
}

function formatName(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return ''
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(p => p.trim())
    return `${titleCase(first)} ${titleCase(last)}`.trim()
  }
  return titleCase(s)
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return (p[0][0] + (p[1]?.[0] || '')).toUpperCase()
}

// Mask a license number to its type prefix + last 4 (e.g. "CCC1334021" → "CCC# ••• 4021").
function maskLicense(ln: string): string {
  const s = (ln || '').trim()
  const letters = (s.match(/^[A-Za-z]+/)?.[0] || '').toUpperCase()
  const last4 = s.replace(/\D/g, '').slice(-4)
  if (!last4) return 'License on file'
  return `${letters ? letters + '# ' : '#'}••• ${last4}`
}

function VerifiedProsBand({ scopeLabel, scopeState }: { scopeLabel: string; scopeState: string }) {
  const [pros, setPros] = useState<HomePro[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    // Query a few specific trades directly (the unfiltered feed is ~all General
    // Contractors, the densest trade) so the band shows real marketplace variety.
    // 'roofing' is intentionally excluded — the hero card already features a
    // verified roofing pro, so the band shows other trades (no duplicate business).
    const targets = ['hvac-technician', 'electrician', 'plumber', 'pool-spa', 'general-contractor']
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
    <section className="max-w-5xl mx-auto px-6 pt-2 pb-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl sm:text-[1.75rem] font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>Verified pros on ProGuild</h2>
          <p className="text-sm mt-1" style={{ color: '#4B5563' }}>Real, licensed contractors — every license checked against state records.</p>
        </div>
        <a href={`/${scopeState}`} className="hidden sm:inline-flex items-center gap-1 text-sm font-bold shrink-0 ml-4 px-3.5 py-2 rounded-lg border transition-colors"
          style={{ color: '#0F766E', borderColor: 'rgba(15,118,110,0.3)', background: 'rgba(15,118,110,0.05)' }}>Browse all pros →</a>
      </div>
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-1 -mx-6 px-6 sm:mx-0 sm:px-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border p-4 min-w-[68%] snap-start sm:min-w-0" style={{ borderColor: '#E8E2D9', background: '#fff' }}>
                <div className="skeleton w-10 h-10 rounded-full mb-3" />
                <div className="skeleton h-3 w-3/4 mb-2" />
                <div className="skeleton h-2.5 w-1/2" />
              </div>
            ))
          : pros.map(p => {
              const name = formatName(p.full_name)
              const trade = p.trade_category?.category_name || 'Contractor'
              const loc = [titleCase(p.city || ''), (p.state || '').toUpperCase()].filter(Boolean).join(', ')
              return (
                <a key={p.id} href={`/pro/${p.id}`} className="pg-tile rounded-2xl border p-4 flex flex-col min-w-[68%] snap-start sm:min-w-0"
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
                      <div className="text-[11px] truncate" style={{ color: '#6B7280' }}>{trade}{loc ? ` · ${loc}` : ''}</div>
                    </div>
                  </div>
                  {p.license_number && (
                    <div className="text-[11px] font-medium mt-auto pt-2" style={{ color: '#6B7280' }}>Lic #{p.license_number.toUpperCase()}</div>
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
        {/* Atmosphere: blueprint grid + teal glow */}
        <div className="pointer-events-none absolute inset-0 pg-grid" aria-hidden />
        <div className="pointer-events-none absolute left-1/2 top-[-60px] -z-0 pg-hero-glow" aria-hidden
          style={{ width: 720, height: 420, background: 'radial-gradient(ellipse at center, rgba(15,118,110,0.20), rgba(15,118,110,0) 70%)', filter: 'blur(6px)' }} />

        <div className="relative max-w-6xl mx-auto px-6 pt-16 lg:pt-20 pb-10">
         <div className="grid lg:grid-cols-2 gap-10 lg:gap-10 lg:items-start items-center">
          {/* LEFT — copy + search */}
          <div className="text-center lg:text-left">

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

          <p className="pg-rise text-lg mb-7 max-w-xl mx-auto lg:mx-0 leading-relaxed" style={{ color: '#4B5563', animationDelay: '.12s' }}>
            Tell us what you need, or search by trade and city — then reach the
            right {scopeLabel} pro directly.
          </p>

          {/* Search + AI helper share ONE column wrapper, each w-full — this
              guarantees an identical width and left edge (no sibling drift) */}
          <div className="pg-rise w-full max-w-xl lg:max-w-none mx-auto lg:mx-0" style={{ animationDelay: '.18s' }}>
            {/* Search bar (component renders its own rounded box) */}
            <div className="relative mb-4" style={{ zIndex: 50 }}>
              <SearchAutocomplete
                tradeValue={trade}
                cityValue={city}
                onTradeChange={setTrade}
                onCityChange={setCity}
                onSearch={(t, c) => handleSearch(undefined, t, c)}
                loading={zipResolving || searching}
              />
            </div>
            {/* Trust bar — the three differentiators, above the fold, flush under search */}
            <div className="w-full flex flex-wrap items-center gap-x-5 gap-y-2.5">
              {['License-verified', 'No shared leads', 'Always free for homeowners'].map(label => (
                <span key={label} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#0A1628' }}>
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white shrink-0" style={{ background: '#0F766E' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  </span>
                  {label}
                </span>
              ))}
            </div>
          </div>
          </div>{/* /LEFT */}

          {/* RIGHT — floating Guild Verified card (desktop only) */}
          <div className="hidden lg:block pg-rise lg:mt-12" style={{ animationDelay: '.36s' }}>
            <VerifiedProCard />
          </div>
         </div>{/* /grid */}
        </div>
      </section>

      {/* ── VERIFIED PROS BAND (staging trial — real pros from /api/pros) ── */}
      <VerifiedProsBand />

      {/* ── BROWSE BY TRADE (primary orientation for first-time users) ───── */}
      <section className="max-w-5xl mx-auto px-6 pb-10 pt-6">
        <div className="text-center mb-7">
          <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#6E6456' }}>Explore trades</div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            Browse by trade
          </h2>
          <p className="text-sm" style={{ color: '#4B5563' }}>
            {city.trim() ? `Will search near "${city.trim()}"` : 'Choose a trade to browse verified pros, or search by city for local results.'}
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
              <span className="text-base font-bold mb-0.5" style={{ color: '#0A1628' }}>{t.label}</span>
              <span className="text-xs font-medium" style={{ color: '#6E6456' }}>Licensed &amp; verified</span>
              <span className="text-xs font-semibold mt-3 inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: '#0F766E' }}>
                {city.trim() ? `Near ${city.trim()}` : 'Find pros'} →
              </span>
            </button>
          ))}
        </div>

        {/* More trades — refined capsule rail with tiny trade icons */}
        <div className="text-center mb-3 mt-1">
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6E6456' }}>More trades</span>
        </div>
        <div className="flex flex-wrap gap-2.5 justify-center">
          {SECONDARY_TRADES.map(t => (
            <button key={t.slug} onClick={() => handleTileTap(t.slug)}
              className="pg-pill group inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-full border cursor-pointer"
              style={{ color: '#4B5563', borderColor: '#E4DED4', background: 'rgba(15,118,110,0.035)' }}>
              <span className="shrink-0" style={{ color: '#0F766E', opacity: 0.8 }}>{SECONDARY_TRADE_ICONS[t.slug]}</span>
              {t.label}
            </button>
          ))}
          <a href={`/${scopeState}`}
            className="pg-pill inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-full border transition-all"
            style={{ color: '#0F766E', borderColor: 'rgba(15,118,110,0.5)', background: 'rgba(15,118,110,0.1)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
            All trades →
          </a>
        </div>
      </section>

      {/* ── ROOF MEASUREMENT (homeowner acquisition hook) ───────────────── */}
      <div className="max-w-5xl mx-auto px-6 pb-8">
        <a href="/roof-size-calculator"
          className="group flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center rounded-xl border px-5 py-3.5 text-sm transition-colors"
          style={{ background: 'rgba(15,118,110,0.06)', borderColor: 'rgba(15,118,110,0.3)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M3 11.5 12 4l9 7.5"/><path d="M6 10.2V20h12v-9.8"/></svg>
          <span style={{ color: '#4B5563' }}><span className="font-bold text-[15px]" style={{ color: '#0C5F57' }}>Roof problem?</span> Get a free roof measurement before you call a pro</span>
          <span className="font-bold shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: '#0F766E' }}>→</span>
        </a>
      </div>

      {/* ── VERIFIED PROS (real inventory — proof, before process) ──────── */}
      <VerifiedProsBand scopeLabel={scopeLabel} scopeState={scopeState} />

      {/* ── HOW IT WORKS (compact — process/reassurance, after the proof) ── */}
      <section className="border-y px-6 py-12" style={{ background: '#FFFFFF', borderColor: '#E8E2D9' }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
            <div>
              <div className="text-xs font-bold tracking-widest uppercase mb-1.5" style={{ color: '#6E6456' }}>How it works</div>
              <h2 className="text-2xl sm:text-[1.75rem] font-bold" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
                Simple. Direct. Transparent.
              </h2>
            </div>
            <div className="inline-flex self-start sm:self-auto rounded-xl border p-1" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
              {(['homeowner', 'pro'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                  style={activeTab === tab
                    ? { background: '#0F766E', color: '#FFFFFF' }
                    : { color: '#4B5563' }}>
                  {tab === 'homeowner' ? '🏠 For homeowners' : '🔧 For pros'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
            {(activeTab === 'homeowner' ? HOW_STEPS_HOMEOWNER : HOW_STEPS_PRO).map(step => (
              <div key={step.n} className="flex gap-3.5">
                <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold"
                  style={{ background: 'rgba(15,118,110,0.10)', color: '#0F766E', fontFamily: "'DM Serif Display', serif" }}>
                  {step.n}
                </div>
                <div>
                  <div className="font-bold text-[15px] mb-0.5" style={{ color: '#0A1628' }}>{step.title}</div>
                  <div className="text-sm leading-snug" style={{ color: '#4B5563' }}>{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MORE THAN A DIRECTORY (product band) ─────────────────────────── */}
      <section className="border-t" style={{ background: '#F5F2EC', borderColor: '#E8E2D9' }}>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <div className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#6E6456' }}>For the pros behind the work</div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              Built to run the whole job.
            </h2>
            <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: '#4B5563' }}>
              The pros on ProGuild don&rsquo;t just get listed — they run the whole job here:
              leads, estimates, measurements and invoices, all in one place.
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
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>Roofing · Tampa, FL</div>
                  </div>
                </div>
                <div className="mt-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: 'rgba(15,118,110,0.09)', color: '#0C5F57' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                  Guild Verified
                </div>
              </div>
              <div className="font-bold text-[15px] mb-1" style={{ color: '#0A1628' }}>Guild Verified profiles</div>
              <div className="text-[13px] leading-relaxed" style={{ color: '#7C7368' }}>Every license checked against official state licensing records — a badge, never a paywall.</div>
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
              <div className="text-[13px] leading-relaxed" style={{ color: '#7C7368' }}>Every inquiry tracked from first contact to payment — with estimates and invoices built in.</div>
            </div>

            {/* Panel 3 — ProMeasure */}
            <div className="rounded-2xl border p-5" style={{ background: '#FFFFFF', borderColor: '#E8E2D9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="rounded-xl border p-3 mb-4 relative overflow-hidden" style={{ borderColor: '#F0EBE3', background: '#FDFCFA', minHeight: 78 }}>
                <svg viewBox="0 0 120 60" className="w-full h-[70px]" fill="none" stroke="#0F766E" strokeWidth="1.6" strokeLinejoin="round">
                  <path d="M20 44 L60 20 L100 44" opacity="0.9" />
                  <path d="M28 44 L60 25 L92 44" opacity="0.4" strokeDasharray="3 3" />
                  <line x1="20" y1="50" x2="100" y2="50" stroke="#6B7280" strokeWidth="1" strokeDasharray="2 2" />
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
      <section className="mx-6 mb-14 mt-10">
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
              We imported every {scopeLabel} contractor license from public state records — so your
              profile already exists, waiting to be claimed. Search your name and claim your profile free in about 30 seconds.
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
              <p className="text-base leading-relaxed" style={{ color: '#6E6456' }}>
                Verified licensed contractors in {scopeLabel}. Zero lead fees. Your Craft. Your Guild.
              </p>
            </div>

            <div className="flex gap-16 text-sm">
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#6E6456' }}>Platform</div>
                <div className="space-y-3">
                  {[['/search','Find a Pro'],['/post-job','Request a Pro'],['/jobs','Find Work'],['/contractors','For Contractors'],['/community','Community']].map(([href, label]) => (
                    <Link key={href} href={href}
                      className="block transition-colors text-sm"
                      style={{ color: '#4B5563' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#4B5563')}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#6E6456' }}>Company</div>
                <div className="space-y-3">
                  {[['/about','About'],['/contact','Contact'],['/privacy','Privacy'],['/terms','Terms']].map(([href, label]) => (
                    <Link key={href} href={href}
                      className="block transition-colors text-sm"
                      style={{ color: '#4B5563' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#4B5563')}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-bold mb-4 text-xs uppercase tracking-widest" style={{ color: '#6E6456' }}>Top Trades</div>
                <div className="space-y-3">
                  {[['electrician','Electrician'],['plumber','Plumber'],['hvac-technician','HVAC'],['roofer','Roofer']].map(([slug, label]) => (
                    <Link key={slug} href={`/${scopeState}/${slug}`}
                      className="block transition-colors text-sm"
                      style={{ color: '#4B5563' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#4B5563')}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-6 flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: '#E8E2D9' }}>
            <div className="text-xs" style={{ color: '#6B7280' }}>© 2026 ProGuild.ai</div>
            <div className="text-xs" style={{ color: '#6B7280' }}>License verified against official state licensing boards</div>
          </div>
        </div>
      </footer>
    </div>
  )
}
