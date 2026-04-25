'use client'
import Navbar from '@/components/layout/Navbar'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ProCard from '@/components/ui/ProCard'
import { Pro, TradeCategory } from '@/types'

const PAGE_SIZE = 12

// Must match homepage exactly — same order, same slugs, Florida-first
const TRADE_GROUPS = [
  {
    id: 'mechanical', label: 'Mechanical', icon: '⚡', accent: '#0F766E',
    trades: [
      { label: 'HVAC Technician',     slug: 'hvac-technician' },
      { label: 'Electrician',         slug: 'electrician' },
      { label: 'Plumber',             slug: 'plumber' },
      { label: 'Solar Installer',     slug: 'solar-installer' },
      { label: 'Gas Fitter',          slug: 'gas-fitter' },
      { label: 'Fire Sprinkler',      slug: 'fire-sprinkler' },
    ],
  },
  {
    id: 'structural', label: 'Structural', icon: '🏗', accent: '#6366F1',
    trades: [
      { label: 'Roofer',                    slug: 'roofer' },
      { label: 'General Contractor',        slug: 'general-contractor' },
      { label: 'Impact Window & Shutter',   slug: 'impact-window-shutter' },
      { label: 'Framing Carpenter',         slug: 'carpenter' },
      { label: 'Mason',                     slug: 'mason' },
      { label: 'Concrete',                  slug: 'concrete-contractor' },
      { label: 'Foundation',                slug: 'foundation-specialist' },
    ],
  },
  {
    id: 'finishing', label: 'Finishing', icon: '🎨', accent: '#F59E0B',
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
    id: 'property', label: 'Property', icon: '🌿', accent: '#10B981',
    trades: [
      { label: 'Pool & Spa',          slug: 'pool-spa' },
      { label: 'Landscaper',          slug: 'landscaper' },
      { label: 'Pest Control',        slug: 'pest-control' },
      { label: 'Irrigation',          slug: 'irrigation' },
      { label: 'Handyman',            slug: 'handyman' },
      { label: 'Home Inspector',      slug: 'home-inspector' },
    ],
  },
  {
    id: 'specialty', label: 'Specialty', icon: '🔐', accent: '#8B5CF6',
    trades: [
      { label: 'Marine / Dock',       slug: 'marine-contractor' },
      { label: 'Alarm & Security',    slug: 'alarm-security' },
      { label: 'Low-Voltage / AV',    slug: 'low-voltage' },
      { label: 'Septic & Drain',      slug: 'septic-drain' },
      { label: 'Welder',              slug: 'welder' },
      { label: 'Elevator Tech',       slug: 'elevator-technician' },
    ],
  },
]

function getScopeState(): string {
  return (process.env.NEXT_PUBLIC_LAUNCH_SCOPE || 'FL').split(',')[0].trim().toLowerCase()
}

function SkeletonCard() {
  return (
    <div className="bg-white border rounded-xl p-5 animate-pulse" style={{ borderColor: '#E8E2D9' }}>
      <div className="flex gap-3 mb-4">
        <div className="w-11 h-11 rounded-full flex-shrink-0" style={{ background: '#FAF9F6' }} />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-3/5 rounded" style={{ background: '#FAF9F6' }} />
          <div className="h-3 w-2/5 rounded" style={{ background: '#FAF9F6' }} />
        </div>
      </div>
      <div className="h-3 w-4/5 rounded mb-2" style={{ background: '#FAF9F6' }} />
      <div className="h-3 w-3/5 rounded mb-4" style={{ background: '#FAF9F6' }} />
      <div className="h-8 w-full rounded-lg" style={{ background: '#FAF9F6' }} />
    </div>
  )
}

function SearchPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const scopeState = getScopeState()

  // Detect active group — from trade slug or group param (Browse All button)
  const urlTradeSlug = searchParams.get('trade') || ''
  const urlGroupId   = searchParams.get('group') || ''
  const activeGroup  = TRADE_GROUPS.find(g =>
    g.id === urlGroupId || g.trades.some(t => t.slug === urlTradeSlug)
  ) || null

  const [pros, setPros]               = useState<Pro[]>([])
  const [categories, setCategories]   = useState<TradeCategory[]>([])
  const [total, setTotal]             = useState(0)
  const [hasMore, setHasMore]         = useState(false)
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]             = useState('')
  const [search, setSearch]           = useState(searchParams.get('q') || '')
  const [appliedSearch, setAppliedSearch] = useState(searchParams.get('q') || '')
  const [activeTradeSlug, setActiveTradeSlug] = useState(urlTradeSlug)
  const [sort, setSort]               = useState('rating')
  const [availableOnly, setAvailableOnly] = useState(false)
  const offset = useRef(0)
  const [cardKey, setCardKey] = useState(0) // increments on filter change to trigger animation

  // Load categories once — needed to resolve slug → UUID
  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  // Resolve slug to category UUID for the API
  function slugToId(slug: string): string {
    if (!slug) return ''
    const cat = categories.find(c => c.slug === slug)
    return cat?.id || ''
  }

  function buildUrl(off: number) {
    const tradeId = slugToId(activeTradeSlug)
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off), sort })
    if (tradeId)       params.set('trade', tradeId)       // UUID, not slug
    if (appliedSearch) params.set('search', appliedSearch)
    if (availableOnly) params.set('available', 'true')
    return `/api/pros?${params}`
  }

  const loadPros = useCallback(async () => {
    // Wait for categories to load before querying if we have a trade filter
    if (activeTradeSlug && categories.length === 0) return
    // Safety: if slug doesn't resolve to UUID, show empty state — never show all unfiltered pros
    if (activeTradeSlug) {
      const tradeId = slugToId(activeTradeSlug)
      if (!tradeId) {
        setPros([]); setTotal(0); setHasMore(false); setLoading(false)
        return
      }
    }
    setLoading(true); setError(''); offset.current = 0
    try {
      const r = await fetch(buildUrl(0))
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPros(d.pros || [])
      setTotal(d.total || 0)
      setHasMore(d.hasMore || false)
      offset.current = PAGE_SIZE
    } catch { setError('Could not load pros. Please refresh.') }
    setLoading(false)
  }, [activeTradeSlug, appliedSearch, sort, availableOnly, categories])

  useEffect(() => { loadPros() }, [loadPros])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const r = await fetch(buildUrl(offset.current))
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPros(prev => [...prev, ...(d.pros || [])])
      setHasMore(d.hasMore || false)
      offset.current += PAGE_SIZE
    } catch {}
    setLoadingMore(false)
  }

  function applySearch() {
    setAppliedSearch(search)
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (activeTradeSlug) params.set('trade', activeTradeSlug)
    router.replace(`/search?${params}`, { scroll: false })
  }

  function selectTrade(slug: string) {
    const next = activeTradeSlug === slug ? '' : slug
    setActiveTradeSlug(next)
    setCardKey(k => k + 1)
    setSearch(''); setAppliedSearch('')
    const params = new URLSearchParams()
    if (next) params.set('trade', next)
    router.replace(`/search?${params}`, { scroll: false })
  }

  function clearFilters() {
    setActiveTradeSlug(''); setSearch(''); setAppliedSearch(''); setAvailableOnly(false)
    router.replace('/search', { scroll: false })
  }

  const hasFilters = activeTradeSlug || appliedSearch || availableOnly

  return (
    <div className="min-h-screen" style={{ background: '#FAF9F6', fontFamily: "'DM Sans', sans-serif" }}>
      <Navbar />

      {/* Global fade-up animation */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .card-enter { animation: fadeUp 0.18s ease-out both; }
      `}</style>

      {/* ── VISUAL ANCHOR — card DNA header when arriving from a category ─── */}
      {activeGroup && (
        <div className="border-b" style={{ borderColor: '#E8E2D9', background: '#FFFFFF' }}>
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              {/* Condensed category card — same DNA as homepage */}
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border flex-shrink-0"
                style={{
                  borderColor: activeGroup.accent,
                  borderTopWidth: '3px',
                  background: `${activeGroup.accent}08`,
                }}>
                <span className="text-xl">{activeGroup.icon}</span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest" style={{ color: activeGroup.accent }}>
                    {activeGroup.label}
                  </div>
                  <div className="text-xs" style={{ color: '#A89F93' }}>
                    {activeGroup.trades.length} trades
                  </div>
                </div>
              </div>

              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs" style={{ color: '#A89F93' }}>
                <Link href="/" style={{ color: '#A89F93' }}
                  onMouseEnter={e => (e.currentTarget.style.color = activeGroup.accent)}
                  onMouseLeave={e => (e.currentTarget.style.color = '#A89F93')}>
                  Home
                </Link>
                <span>›</span>
                <button onClick={clearFilters} style={{ color: '#A89F93' }}
                  onMouseEnter={e => (e.currentTarget.style.color = activeGroup.accent)}
                  onMouseLeave={e => (e.currentTarget.style.color = '#A89F93')}>
                  {activeGroup.label}
                </button>
                {activeTradeSlug && (
                  <>
                    <span>›</span>
                    <span className="font-semibold" style={{ color: activeGroup.accent }}>
                      {activeGroup.trades.find(t => t.slug === activeTradeSlug)?.label || activeTradeSlug}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PILL STRIP — visual bridge from homepage category cards ──────── */}
      {activeGroup && (
        <div className="bg-white border-b sticky top-14 z-30" style={{ borderColor: '#E8E2D9' }}>
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
              {/* Breadcrumb */}
              <Link href="/" className="text-xs flex-shrink-0 transition-colors" style={{ color: '#A89F93' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
                onMouseLeave={e => (e.currentTarget.style.color = '#A89F93')}>
                Home
              </Link>
              <span className="text-xs flex-shrink-0" style={{ color: '#E8E2D9' }}>›</span>

              {/* Group label */}
              <span className="flex items-center gap-1 text-xs font-semibold flex-shrink-0" style={{ color: '#0A1628' }}>
                <span>{activeGroup.icon}</span>
                <span>{activeGroup.label}</span>
              </span>
              <span className="text-xs flex-shrink-0" style={{ color: '#E8E2D9' }}>›</span>

              {/* All pill */}
              <button
                onClick={() => selectTrade('')}
                className="flex-shrink-0 text-sm font-semibold px-3 py-1.5 rounded-full border transition-all"
                style={!activeTradeSlug
                  ? { background: activeGroup.accent, color: '#fff', borderColor: activeGroup.accent }
                  : { color: '#6B7280', borderColor: '#E8E2D9', background: '#fff' }}>
                All {activeGroup.label}
              </button>

              {/* Trade pills */}
              {activeGroup.trades.map(trade => (
                <button key={trade.slug}
                  onClick={() => selectTrade(trade.slug)}
                  className="flex-shrink-0 text-sm font-semibold px-3 py-1.5 rounded-full border transition-all"
                  style={activeTradeSlug === trade.slug
                    ? { background: activeGroup.accent, color: '#fff', borderColor: activeGroup.accent }
                    : { color: '#6B7280', borderColor: '#E8E2D9', background: '#fff' }}>
                  {trade.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6">

        {/* ── SIDEBAR ──────────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-28 space-y-5">

            {/* Sort */}
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#A89F93' }}>Sort by</div>
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="w-full text-sm border rounded-xl px-3 py-2 bg-white outline-none"
                style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
                <option value="rating">Highest rated</option>
                <option value="default">Top credentialed</option>
                <option value="reviews">Most reviews</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </div>

            {/* Trade groups */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#A89F93' }}>Trade</div>
                {activeTradeSlug && (
                  <button onClick={clearFilters} className="text-xs font-medium transition-colors"
                    style={{ color: '#0F766E' }}>Clear</button>
                )}
              </div>
              <div className="space-y-4">
                {TRADE_GROUPS.map(group => (
                  <div key={group.id}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-sm">{group.icon}</span>
                      <span className="text-sm font-semibold" style={{ color: '#6B7280' }}>{group.label}</span>
                    </div>
                    <div className="space-y-0.5 pl-1">
                      {group.trades.map(trade => (
                        <button key={trade.slug} onClick={() => selectTrade(trade.slug)}
                          className="w-full text-left text-sm px-2.5 py-1.5 rounded-lg transition-all"
                          style={activeTradeSlug === trade.slug
                            ? { background: '#FAF9F6', color: group.accent, fontWeight: 600 }
                            : { color: '#6B7280' }}
                          onMouseEnter={e => { if (activeTradeSlug !== trade.slug) e.currentTarget.style.background = '#FAF9F6' }}
                          onMouseLeave={e => { if (activeTradeSlug !== trade.slug) e.currentTarget.style.background = 'transparent' }}>
                          {trade.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ── RESULTS ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Results header */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm" style={{ color: '#6B7280' }}>
                {loading ? 'Searching...' : (
                  <>
                    <span className="font-bold" style={{ color: '#0A1628' }}>{total.toLocaleString()}</span>
                    {' '}verified pros
                    {activeTradeSlug && (
                      <span style={{ color: '#0F766E' }}> · {TRADE_GROUPS.flatMap(g => g.trades).find(t => t.slug === activeTradeSlug)?.label || activeTradeSlug}</span>
                    )}
                    {appliedSearch && <span style={{ color: '#A89F93' }}> for "{appliedSearch}"</span>}
                  </>
                )}
              </span>
              {hasFilters && !loading && (
                <button onClick={clearFilters}
                  className="text-xs border px-2.5 py-1 rounded-full transition-colors"
                  style={{ color: '#A89F93', borderColor: '#E8E2D9' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#A89F93')}>
                  Clear filters ×
                </button>
              )}
            </div>
            {/* Mobile sort */}
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="lg:hidden text-sm border rounded-xl px-3 py-1.5 bg-white outline-none"
              style={{ borderColor: '#E8E2D9', color: '#0A1628' }}>
              <option value="rating">Highest rated</option>
              <option value="default">Top credentialed</option>
              <option value="reviews">Most reviews</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
            </select>
          </div>

          {/* Pro grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {loading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)
              : error
                ? <div className="col-span-3 text-center py-16" style={{ color: '#A89F93' }}>{error}</div>
                : pros.length === 0
                  ? (
                    <div className="col-span-3 text-center py-20">
                      <div className="text-5xl mb-4 opacity-20">🔍</div>
                      <div className="font-bold mb-2" style={{ color: '#0A1628' }}>
                        {activeTradeSlug
                          ? `No ${TRADE_GROUPS.flatMap(g => g.trades).find(t => t.slug === activeTradeSlug)?.label || activeTradeSlug} pros found in this area`
                          : 'No pros found'}
                      </div>
                      <div className="text-sm mb-5" style={{ color: '#A89F93' }}>
                        {activeTradeSlug
                          ? 'This trade may not have verified pros in this area yet. Try browsing all trades.'
                          : 'Try a different trade or city.'}
                      </div>
                      {hasFilters && (
                        <button onClick={clearFilters}
                          className="text-sm font-medium transition-colors"
                          style={{ color: '#0F766E' }}>
                          {activeTradeSlug ? 'Browse all trades' : 'Clear filters'}
                        </button>
                      )}
                    </div>
                  )
                  : pros.map((pro, i) => (
                    <div key={`${cardKey}-${pro.id}`}
                      className="card-enter"
                      style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}>
                      <ProCard pro={pro} index={i} />
                    </div>
                  ))
            }
          </div>

          {/* Load more */}
          {!loading && hasMore && (
            <div className="text-center pb-16">
              <button onClick={loadMore} disabled={loadingMore}
                className="px-8 py-3 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50"
                style={{ color: '#0A1628', borderColor: '#E8E2D9', background: '#FFFFFF' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E2D9'; e.currentTarget.style.color = '#0A1628' }}>
                {loadingMore
                  ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-gray-200 border-t-teal-500 rounded-full animate-spin" />Loading...</span>
                  : `Load more (${(total - pros.length).toLocaleString()} remaining)`}
              </button>
            </div>
          )}
          {!loading && !hasMore && pros.length > 0 && (
            <div className="text-center pb-16 text-sm" style={{ color: '#C4BAB0' }}>
              — All {total.toLocaleString()} pros shown —
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAF9F6' }}>
        <div className="w-8 h-8 border-2 border-t-teal-500 rounded-full animate-spin" style={{ borderColor: '#E8E2D9', borderTopColor: '#0F766E' }} />
      </div>
    }>
      <SearchPageInner />
    </Suspense>
  )
}
