'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import ProCard from '@/components/ui/ProCard'
import { Pro, TradeCategory } from '@/types'

const PAGE_SIZE = 12

// Top 8 trade slugs to show by default (most common FL trades)
const TOP_TRADE_SLUGS = [
  'hvac-technician','electrician','plumber','general-contractor',
  'roofer','painter','carpenter','flooring',
]

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-3/5 rounded bg-gray-100 animate-pulse" />
          <div className="h-3 w-2/5 rounded bg-gray-100 animate-pulse" />
        </div>
      </div>
      <div className="h-3 w-4/5 rounded bg-gray-100 animate-pulse mb-2" />
      <div className="h-3 w-3/5 rounded bg-gray-100 animate-pulse mb-4" />
      <div className="h-8 w-full rounded-lg bg-gray-100 animate-pulse" />
    </div>
  )
}

function HomePageInner() {
  const searchParams = useSearchParams()
  const [pros, setPros]             = useState<Pro[]>([])
  const [categories, setCategories] = useState<TradeCategory[]>([])
  const [stats, setStats]           = useState({ pros: 0, trades: 0, reviews: 0 })
  const [total, setTotal]           = useState(0)
  const [hasMore, setHasMore]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]           = useState('')
  const [search, setSearch]         = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [activeTrade, setActiveTrade] = useState(() => searchParams.get('trade') || '')
  const [sort, setSort]             = useState('rating')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [showAllTrades, setShowAllTrades] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const MOBILE_MAX_PER_GROUP = 3
  const [tradeCounts, setTradeCounts] = useState<Record<string, number>>({})
  const offset = useRef(0)

  useEffect(() => {
    Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/reviews').then(r => r.json()),
      fetch('/api/stats/trades').then(r => r.json()),
    ]).then(([catsData, revsData, statsData]) => {
      setCategories(catsData.categories || [])
      setStats(s => ({ ...s, trades: (catsData.categories || []).length, reviews: (revsData.reviews || []).length }))
      const counts: Record<string, number> = {}
      for (const t of (statsData.trades || [])) counts[t.id] = t.pro_count
      setTradeCounts(counts)
    })
  }, [])

  function buildUrl(off: number) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off), sort })
    if (activeTrade)    params.set('trade', activeTrade)
    if (appliedSearch)  params.set('search', appliedSearch)
    if (availableOnly)  params.set('available', 'true')
    return `/api/pros?${params}`
  }

  const loadPros = useCallback(async () => {
    setLoading(true); setError(''); offset.current = 0
    try {
      const r = await fetch(buildUrl(0))
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPros(d.pros || [])
      setTotal(d.total || 0)
      setHasMore(d.hasMore || false)
      setStats(s => ({ ...s, pros: d.total || 0 }))
      offset.current = PAGE_SIZE
    } catch { setError('Could not load pros. Please refresh.') }
    setLoading(false)
  }, [activeTrade, appliedSearch, sort, availableOnly])

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

  function applySearch() { setAppliedSearch(search) }
  function selectTrade(id: string) { setActiveTrade(prev => prev === id ? '' : id); setSearch(''); setAppliedSearch('') }
  function clearFilters() { setActiveTrade(''); setSearch(''); setAppliedSearch(''); setAvailableOnly(false) }

  const activeCategory = categories.find(c => c.id === activeTrade)
  const hasFilters = activeTrade || appliedSearch || availableOnly

  // Trade groups with icons — slugs must match DB exactly
  const TRADE_GROUPS = [
    {
      label: 'Mechanical', icon: '⚙',
      slugs: ['electrician','plumber','hvac-technician','alarm-security','irrigation','solar-installer','solar-energy'],
    },
    {
      label: 'Structural', icon: '🏗',
      slugs: ['general-contractor','carpenter','roofer','roofing','mason','welder','structural-contractor','marine-contractor','industrial-facility'],
    },
    {
      label: 'Finishing', icon: '✦',
      slugs: ['painter','flooring','drywall','windows-doors','gutters','glass-glazing','screening-sheet-metal','tile-setter'],
    },
    {
      label: 'Property & Outdoor', icon: '🌿',
      slugs: ['landscaper','pool-spa','pest-control','handyman','other-trades'],
    },
  ]

  const TRADE_ICONS: Record<string, string> = {
    'electrician':           '⚡',
    'plumber':               '🪠',
    'hvac-technician':       '❄️',
    'alarm-security':        '🔐',
    'irrigation':            '💧',
    'solar-installer':       '☀️',
    'solar-energy':          '☀️',
    'general-contractor':    '🏗️',
    'carpenter':             '🪚',
    'roofer':                '🏠',
    'roofing':               '🏠',
    'mason':                 '🧱',
    'welder':                '🔩',
    'structural-contractor': '⚙️',
    'marine-contractor':     '⚓',
    'industrial-facility':   '🏭',
    'painter':               '🎨',
    'flooring':              '🪵',
    'drywall':               '🧰',
    'windows-doors':         '🪟',
    'gutters':               '🌧️',
    'glass-glazing':         '🔍',
    'screening-sheet-metal': '🔩',
    'tile-setter':           '🔲',
    'landscaper':            '🌿',
    'pool-spa':              '🏊',
    'pest-control':          '🪲',
    'handyman':              '🔨',
    'other-trades':          '🛠️',
  }

  // Build slug→category lookup
  const catBySlug: Record<string, typeof categories[0]> = {}
  for (const cat of categories) catBySlug[cat.slug] = cat

  // Ungrouped categories (not in any group)
  const groupedSlugs = new Set(TRADE_GROUPS.flatMap(g => g.slugs))
  const ungrouped = categories.filter(c => !groupedSlugs.has(c.slug))

  const statItems = [
    { n: loading ? '—' : (total > 0 ? total.toLocaleString() : stats.pros.toLocaleString()), l: 'Verified pros' },
    { n: stats.trades || '—', l: 'Licensed trades' },
    { n: stats.reviews || '—', l: 'Reviews posted' },
  ]

  return (
    <>
      <Navbar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 pt-14 pb-10 text-center">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-teal-700 bg-teal-50 border border-teal-100 px-3 py-1 rounded-full mb-5">
          Florida's verified trades network
        </span>
        <h1 className="font-serif text-4xl sm:text-5xl text-gray-900 leading-tight tracking-tight mb-4">
          The verified standard for{' '}
          <em className="not-italic text-teal-600">skilled trades</em>
        </h1>
        <p className="text-base sm:text-lg text-gray-400 font-light mb-8 leading-relaxed max-w-xl mx-auto">
          State-licensed pros, DBPR-verified credentials, GPS-confirmed project history.
          Hire with certainty.
        </p>

        {/* Search bar */}
        <div className="flex gap-2 bg-white border border-gray-200 rounded-full px-5 py-2 shadow-sm max-w-xl mx-auto">
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
            placeholder="Name, city or zip code..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => { setSearch(''); setAppliedSearch('') }}
              className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
          )}
          <button onClick={applySearch}
            className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-full hover:bg-teal-700 transition-colors">
            Search
          </button>
        </div>

        {/* Available now toggle */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setAvailableOnly(v => !v)}
            className={`flex items-center gap-2 text-sm px-4 py-1.5 rounded-full border transition-all font-medium ${
              availableOnly
                ? 'bg-green-600 text-white border-green-600'
                : 'border-gray-200 text-gray-500 hover:border-green-400 hover:text-green-700'
            }`}>
            <span className={`w-2 h-2 rounded-full ${availableOnly ? 'bg-white animate-pulse' : 'bg-gray-300'}`} />
            Available now
          </button>
        </div>
      </section>

      {/* ── TRUST BAR ─────────────────────────────────────────────────────── */}
      <div className="border-y border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
            {statItems.map(s => (
              <div key={s.l} className="text-center">
                <div className="font-serif text-3xl text-teal-600">{s.n}</div>
                <div className="text-xs text-gray-400 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-4 pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              Directly integrated with{' '}
              <span className="font-semibold text-gray-600">Florida DBPR</span>
              {' '}·{' '}
              <span className="font-semibold text-gray-600">OSHA</span>
              {' '}state licensing databases
            </span>
          </div>
        </div>
      </div>

      {/* ── BROWSE + RESULTS ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6">

        {/* Trade filter — grouped by industry */}
        <div className="py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Browse by trade</div>
            <button onClick={() => selectTrade('')}
              className={`text-xs px-3 py-1 rounded-full border transition-all font-medium ${
                !activeTrade ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-400 hover:border-teal-300 hover:text-teal-600'
              }`}>
              All trades
            </button>
          </div>

          <div className="space-y-4">
            {TRADE_GROUPS.map(group => {
              const groupCats = group.slugs.map(s => catBySlug[s]).filter(Boolean)
              if (groupCats.length === 0) return null
              const isExpanded = expandedGroups[group.label]
              const visibleCats = isExpanded ? groupCats : groupCats.slice(0, MOBILE_MAX_PER_GROUP)
              const hiddenCount = groupCats.length - MOBILE_MAX_PER_GROUP
              return (
                <div key={group.label}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm">{group.icon}</span>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group.label}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                    {visibleCats.map(cat => {
                      const count = tradeCounts[cat.id] || 0
                      const icon  = TRADE_ICONS[cat.slug] || ''
                      const active = activeTrade === cat.id
                      return (
                        <button key={cat.id} onClick={() => selectTrade(cat.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-sm border transition-all font-medium ${
                            active
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50'
                          }`}>
                          {icon && <span style={{fontSize:'13px'}}>{icon}</span>}
                          <span className="truncate">{cat.category_name}</span>
                          {count > 0 && (
                            <span className={`ml-auto text-xs font-bold rounded-full px-1.5 min-w-[18px] text-center leading-none py-0.5 ${
                              active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                            }`}>{count.toLocaleString()}</span>
                          )}
                        </button>
                      )
                    })}
                    {!isExpanded && hiddenCount > 0 && (
                      <button
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [group.label]: true }))}
                        className="px-3 py-1.5 rounded-xl text-sm border border-dashed border-gray-300 text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-all">
                        +{hiddenCount} more
                      </button>
                    )}
                    {isExpanded && hiddenCount > 0 && (
                      <button
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [group.label]: false }))}
                        className="px-3 py-1.5 rounded-xl text-sm border border-dashed border-gray-300 text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-all">
                        ↑ less
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Ungrouped fallback */}
            {ungrouped.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Other</span>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
                  {ungrouped.map(cat => {
                    const count = tradeCounts[cat.id] || 0
                    const active = activeTrade === cat.id
                    return (
                      <button key={cat.id} onClick={() => selectTrade(cat.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-sm border transition-all font-medium ${
                          active ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50'
                        }`}>
                        <span className="truncate">{cat.category_name}</span>
                        {count > 0 && (
                          <span className={`ml-auto text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none ${
                            active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                          }`}>{count.toLocaleString()}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500">
              {loading ? 'Loading...' : (
                <>
                  Showing <span className="font-semibold text-gray-900">{pros.length}</span> of{' '}
                  <span className="font-semibold text-gray-900">{total.toLocaleString()}</span>{' '}
                  {activeCategory ? <span className="text-teal-700">{activeCategory.category_name}s</span> : 'pros'}
                  {appliedSearch && <span className="text-gray-400"> for "<span className="text-gray-700">{appliedSearch}</span>"</span>}
                </>
              )}
            </span>
            {hasFilters && !loading && (
              <button onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-red-400 border border-gray-200 px-2.5 py-1 rounded-full transition-colors">
                Clear filters ×
              </button>
            )}
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none">
            <option value="rating">Highest rated</option>
            <option value="default">Top credentialed</option>
            <option value="reviews">Most reviews</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </select>
        </div>

        {/* Pro card grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-8">
          {loading
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)
            : error
              ? <div className="col-span-4 text-center py-16 text-gray-400">{error}</div>
              : pros.length === 0
                ? (
                  <div className="col-span-4 text-center py-16">
                    <div className="text-4xl mb-3 opacity-20">🔍</div>
                    <div className="font-semibold text-gray-700 mb-2">No pros found</div>
                    <div className="text-sm text-gray-400 mb-4">Try a different trade or search term.</div>
                    {hasFilters && (
                      <button onClick={clearFilters} className="text-sm text-teal-600 font-medium hover:underline">
                        Clear filters
                      </button>
                    )}
                  </div>
                )
                : pros.map((pro, i) => <ProCard key={pro.id} pro={pro} index={i} />)
          }
        </div>

        {/* Load more */}
        {!loading && hasMore && (
          <div className="text-center pb-16">
            <button onClick={loadMore} disabled={loadingMore}
              className="px-8 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-all disabled:opacity-50">
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-gray-300 border-t-teal-600 rounded-full animate-spin" />
                  Loading...
                </span>
              ) : `Load more pros (${(total - pros.length).toLocaleString()} remaining)`}
            </button>
          </div>
        )}
        {!loading && !hasMore && pros.length > 0 && (
          <div className="text-center pb-16 text-xs text-gray-300">— All {total.toLocaleString()} pros shown —</div>
        )}
      </div>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 mt-4">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-wrap items-start justify-between gap-8 mb-8">
            <div>
              <div className="font-serif text-xl text-gray-900 mb-2">Trades<span className="text-teal-600">Network</span></div>
              <div className="text-sm text-gray-400 max-w-xs leading-relaxed">
                The verified professional network for Florida's skilled trades. DBPR-integrated, GPS-confirmed, zero per-lead fees.
              </div>
            </div>
            <div className="flex gap-12 text-sm">
              <div>
                <div className="font-semibold text-gray-700 mb-3 text-xs uppercase tracking-widest">Platform</div>
                <div className="space-y-2">
                  {[['/', 'Find a pro'],['/post-job','Post a job'],['/jobs','Browse jobs'],['/community','Community']].map(([href, label]) => (
                    <a key={href} href={href} className="block text-gray-400 hover:text-teal-600 transition-colors">{label}</a>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold text-gray-700 mb-3 text-xs uppercase tracking-widest">Company</div>
                <div className="space-y-2">
                  {[['/about','About'],['/contact','Contact'],['/privacy','Privacy'],['/terms','Terms']].map(([href, label]) => (
                    <a key={href} href={href} className="block text-gray-400 hover:text-teal-600 transition-colors">{label}</a>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-400">© 2026 TradesNetwork · Univaro Technologies Pvt Ltd</div>
            <div className="text-xs text-gray-400">Verified against Florida DBPR · OSHA · State licensing boards</div>
          </div>
        </div>
      </footer>
    </>
  )
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <HomePageInner />
    </Suspense>
  )
}
