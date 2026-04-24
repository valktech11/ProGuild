'use client'
import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import ProCard from '@/components/ui/ProCard'

const PAGE_SIZE = 12

// Same groups as homepage/search — for related trades sidebar
const TRADE_GROUPS = [
  { id: 'mechanical', label: 'Mechanical', icon: '⚡', accent: '#0F766E',
    trades: ['hvac-technician','electrician','plumber','solar-installer','gas-fitter','fire-sprinkler'] },
  { id: 'structural', label: 'Structural', icon: '🏗', accent: '#6366F1',
    trades: ['roofer','general-contractor','impact-window-shutter','carpenter','mason','concrete-contractor','foundation-specialist'] },
  { id: 'finishing', label: 'Finishing', icon: '🎨', accent: '#F59E0B',
    trades: ['painter','flooring','drywall','tile-setter','insulation-contractor','windows-doors'] },
  { id: 'property', label: 'Property', icon: '🌿', accent: '#10B981',
    trades: ['pool-spa','landscaper','pest-control','irrigation','handyman','home-inspector'] },
  { id: 'specialty', label: 'Specialty', icon: '🔐', accent: '#8B5CF6',
    trades: ['marine-contractor','alarm-security','low-voltage','septic-drain','welder','elevator-technician'] },
]

function slugToTitle(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-5 animate-pulse" style={{ border: '1px solid #E8E2D9' }}>
      <div className="flex gap-3 mb-4">
        <div className="w-11 h-11 rounded-full flex-shrink-0" style={{ background: '#FAF9F6' }} />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-3/5 rounded" style={{ background: '#FAF9F6' }} />
          <div className="h-3 w-2/5 rounded" style={{ background: '#FAF9F6' }} />
        </div>
      </div>
      <div className="h-3 w-4/5 rounded mb-2" style={{ background: '#FAF9F6' }} />
      <div className="h-8 w-full rounded-lg" style={{ background: '#FAF9F6' }} />
    </div>
  )
}

interface Props {
  stateSlug: string
  stateName: string
  stateAbbr: string
  tradeSlug: string
  tradeTitle: string
  tradeCategoryId: string
  initialPros: any[]
  totalCount: number
}

export default function TradeLandingClient({
  stateSlug, stateName, stateAbbr, tradeSlug, tradeTitle, tradeCategoryId, initialPros, totalCount
}: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const fromAI       = searchParams.get('from') === 'ai'
  const aiQuery      = searchParams.get('q') || ''
  const [showAIBanner, setShowAIBanner] = useState(fromAI)
  const [pros, setPros]           = useState(initialPros)
  const [total]                   = useState(totalCount)
  const [hasMore, setHasMore]     = useState(totalCount > PAGE_SIZE)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const offset = useRef(PAGE_SIZE)

  // Find which group this trade belongs to
  const activeGroup = TRADE_GROUPS.find(g => g.trades.includes(tradeSlug)) || null

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        trade: tradeCategoryId,
        state: stateAbbr,
        limit: String(PAGE_SIZE),
        offset: String(offset.current),
        sort: 'rating',
      })
      const r = await fetch(`/api/pros?${params}`)
      const d = await r.json()
      setPros(prev => [...prev, ...(d.pros || [])])
      setHasMore(d.hasMore || false)
      offset.current += PAGE_SIZE
    } catch {}
    setLoading(false)
  }

  function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!search.trim()) return
    router.push(`/search?q=${encodeURIComponent(search)}&trade=${tradeSlug}`)
  }

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#tlg)"/>
                <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                <defs><linearGradient id="tlg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs>
              </svg>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-bold text-sm" style={{ color: '#0A1628' }}>ProGuild</span>
              <span className="font-medium text-sm" style={{ color: '#0F766E' }}>.ai</span>
            </div>
          </Link>

          {/* Inline search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl">
            <div className="flex rounded-xl overflow-hidden border bg-white" style={{ borderColor: '#E8E2D9' }}>
              <input
                type="text" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${tradeTitle.toLowerCase()}s in ${stateName}...`}
                className="flex-1 px-4 py-2 text-sm outline-none"
                style={{ background: 'transparent', color: '#0A1628' }}
              />
              <button type="submit"
                className="px-4 py-2 text-sm font-bold text-white hover:opacity-90 transition-all"
                style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
                Search
              </button>
            </div>
          </form>

          <div className="flex items-center gap-3 ml-auto flex-shrink-0">
            <Link href="/login" className="text-sm hidden sm:block transition-colors" style={{ color: '#6B7280' }}>Log in</Link>
            <Link href="/login?tab=signup"
              className="text-xs font-bold px-4 py-2 rounded-lg text-white hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
              Join Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── AI MATCH BANNER ───────────────────────────────────────────── */}
      {showAIBanner && aiQuery && (
        <div className="border-b" style={{ background: 'rgba(15,118,110,0.06)', borderColor: 'rgba(15,118,110,0.2)' }}>
          <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm" style={{ color: '#0C5F57' }}>
              <span style={{ color: '#0F766E' }}>✦</span>
              <span>Based on <strong>"{aiQuery}"</strong> — showing {tradeTitle}s in {stateName}</span>
            </div>
            <button onClick={() => setShowAIBanner(false)}
              className="text-xs flex-shrink-0 hover:opacity-70 transition-opacity"
              style={{ color: '#0C5F57' }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── VISUAL ANCHOR — category DNA header ──────────────────────────── */}
      {activeGroup && (
        <div className="bg-white border-b" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border flex-shrink-0"
              style={{ borderColor: activeGroup.accent, borderTopWidth: '2px', background: activeGroup.accent + '08' }}>
              <span className="text-lg">{activeGroup.icon}</span>
              <span className="text-xs font-bold" style={{ color: activeGroup.accent }}>{activeGroup.label}</span>
            </div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs overflow-x-auto scrollbar-hide" style={{ color: '#A89F93' }}>
              <Link href="/" style={{ color: '#A89F93' }}>Home</Link>
              <span>›</span>
              <Link href={`/${stateSlug}`} style={{ color: '#A89F93' }}>{stateName}</Link>
              <span>›</span>
              <span className="font-semibold flex-shrink-0" style={{ color: activeGroup.accent }}>{tradeTitle}s</span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">

        {/* ── SIDEBAR — static navigation, no accordion ─────────────── */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-24 space-y-5">

            {/* Active group trades — always shown, static */}
            {activeGroup && (
              <div>
                <div className="flex items-center gap-2 mb-3 px-2">
                  <span className="text-base">{activeGroup.icon}</span>
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: activeGroup.accent }}>
                    {activeGroup.label}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {activeGroup.trades.map(slug => (
                    <Link key={slug}
                      href={`/${stateSlug}/${slug}`}
                      className="flex items-center justify-between text-sm px-2.5 py-2 rounded-lg transition-colors"
                      style={slug === tradeSlug
                        ? { background: '#FAF9F6', color: activeGroup.accent, fontWeight: 600 }
                        : { color: '#6B7280' }}
                      onMouseEnter={e => { if (slug !== tradeSlug) { e.currentTarget.style.background = '#FAF9F6'; e.currentTarget.style.color = activeGroup.accent } }}
                      onMouseLeave={e => { if (slug !== tradeSlug) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' } }}>
                      <span>{slugToTitle(slug)}</span>
                      {slug === tradeSlug && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: activeGroup.accent }} />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Thin divider */}
            <div style={{ height: '1px', background: '#E8E2D9' }} />

            {/* Other groups — single line links to search page, no expansion */}
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-3 px-2" style={{ color: '#A89F93' }}>
                Other trades
              </div>
              <div className="space-y-0.5">
                {TRADE_GROUPS.filter(g => g.id !== activeGroup?.id).map(group => (
                  <Link key={group.id}
                    href={`/search?group=${group.id}`}
                    className="flex items-center gap-2.5 text-sm px-2.5 py-2 rounded-lg transition-colors"
                    style={{ color: '#6B7280' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FAF9F6'; e.currentTarget.style.color = group.accent }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
                    <span className="text-base flex-shrink-0">{group.icon}</span>
                    <span>{group.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* SEO headline */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2"
              style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
              {tradeTitle}s in {stateName}
            </h1>
            <p className="text-sm leading-relaxed mb-4" style={{ color: '#6B7280' }}>
              Find verified, DBPR-licensed {tradeTitle.toLowerCase()}s in {stateName}.
              Every pro on ProGuild is license-checked against the state database.
              Zero lead fees — contact them directly.
            </p>
            <div className="flex items-center gap-4 text-xs" style={{ color: '#A89F93' }}>
              <span>
                <span className="font-bold" style={{ color: '#0A1628' }}>{total.toLocaleString()}</span>
                {' '}verified {tradeTitle.toLowerCase()}s in {stateName}
              </span>
              <span>·</span>
              <span>DBPR license verified</span>
              <span>·</span>
              <span>Zero lead fees</span>
            </div>
          </div>

          {/* Pro grid — SSR initial data, then load more */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {pros.map((pro, i) => (
              <div key={pro.id} className="card-enter" style={{ animationDelay: `${Math.min(i * 25, 150)}ms` }}>
                <ProCard pro={pro} index={i} />
              </div>
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="text-center pb-16">
              <button onClick={loadMore} disabled={loading}
                className="px-8 py-3 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50"
                style={{ color: '#0A1628', borderColor: '#E8E2D9', background: '#FFFFFF' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E2D9'; e.currentTarget.style.color = '#0A1628' }}>
                {loading
                  ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-t-teal-500 rounded-full animate-spin" style={{ borderColor: '#E8E2D9', borderTopColor: '#0F766E' }} />Loading...</span>
                  : `Load more (${(total - pros.length).toLocaleString()} remaining)`}
              </button>
            </div>
          )}
          {!hasMore && pros.length > 0 && (
            <div className="text-center pb-16 text-xs" style={{ color: '#C4BAB0' }}>
              All {total.toLocaleString()} verified {tradeTitle.toLowerCase()}s shown
            </div>
          )}

          {pros.length === 0 && (
            <div className="text-center py-20">
              <div className="text-5xl mb-4 opacity-20">🔍</div>
              <div className="font-bold mb-2" style={{ color: '#0A1628' }}>No {tradeTitle.toLowerCase()}s found in {stateName}</div>
              <div className="text-sm mb-5" style={{ color: '#A89F93' }}>
                This trade may not have verified pros in this state yet.
              </div>
              <Link href="/search"
                className="text-sm font-medium transition-colors"
                style={{ color: '#0F766E' }}>
                Browse all trades →
              </Link>
            </div>
          )}

          {/* SEO footer content — rich text for Google */}
          <div className="border-t pt-10 mt-4" style={{ borderColor: '#E8E2D9' }}>
            <h2 className="text-lg font-bold mb-3" style={{ color: '#0A1628' }}>
              Hiring a {tradeTitle} in {stateName}
            </h2>
            <p className="text-sm leading-relaxed mb-4" style={{ color: '#6B7280' }}>
              ProGuild verifies every {tradeTitle.toLowerCase()} in {stateName} against the{' '}
              {stateAbbr === 'FL' ? 'Florida DBPR (Department of Business and Professional Regulation)' : `${stateName} state licensing board`}.
              This means you can hire with confidence — every pro listed here holds an active,
              state-issued license.
            </p>
            <p className="text-sm leading-relaxed mb-6" style={{ color: '#6B7280' }}>
              Unlike other platforms, ProGuild charges pros a flat monthly fee — not per-lead charges.
              That means {tradeTitle.toLowerCase()}s are motivated to respond to you because they're
              not paying $50+ every time they make contact. You get faster responses, better service,
              and lower prices.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: '🛡', title: 'License Verified', desc: `Every ${tradeTitle.toLowerCase()} checked against ${stateName} state database` },
                { icon: '✦', title: 'Zero Lead Fees', desc: 'Pros pay flat monthly fee — not per contact' },
                { icon: '⭐', title: 'Real Reviews', desc: 'Verified reviews from real customers' },
              ].map(item => (
                <div key={item.title} className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E8E2D9' }}>
                  <div className="text-xl mb-2">{item.icon}</div>
                  <div className="font-bold text-sm mb-1" style={{ color: '#0A1628' }}>{item.title}</div>
                  <div className="text-xs leading-relaxed" style={{ color: '#A89F93' }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t py-8 px-6 mt-8" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-0.5">
            <span className="font-bold" style={{ color: '#0A1628' }}>ProGuild</span>
            <span className="font-medium" style={{ color: '#0F766E' }}>.ai</span>
          </div>
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: '#A89F93' }}>
            <Link href="/" style={{ color: '#A89F93' }}>Home</Link>
            <Link href="/search" style={{ color: '#A89F93' }}>Find a Pro</Link>
            <Link href="/community" style={{ color: '#A89F93' }}>Community</Link>
            <Link href="/privacy" style={{ color: '#A89F93' }}>Privacy</Link>
            <Link href="/terms" style={{ color: '#A89F93' }}>Terms</Link>
          </div>
          <div className="text-xs" style={{ color: '#C4BAB0' }}>© 2026 ProGuild.ai</div>
        </div>
      </footer>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .card-enter { animation: fadeUp 0.2s ease-out both; }
      `}</style>
    </div>
  )
}
