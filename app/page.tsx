'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Navbar from '@/components/layout/Navbar'
import ProCard from '@/components/ui/ProCard'
import { Pro, TradeCategory } from '@/types'

const PAGE_SIZE = 12

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <div className="flex gap-4 mb-4">
        <div className="w-12 h-12 rounded-full animate-shimmer flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/5 rounded animate-shimmer" />
          <div className="h-3 w-2/5 rounded animate-shimmer" />
        </div>
      </div>
      <div className="h-3 w-4/5 rounded animate-shimmer mb-2" />
      <div className="h-3 w-3/5 rounded animate-shimmer mb-4" />
      <div className="h-9 w-full rounded-lg animate-shimmer" />
    </div>
  )
}

export default function HomePage() {
  const [pros, setPros]           = useState<Pro[]>([])
  const [categories, setCategories] = useState<TradeCategory[]>([])
  const [stats, setStats]         = useState({ pros: 0, trades: 0, reviews: 0 })
  const [total, setTotal]         = useState(0)
  const [hasMore, setHasMore]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [activeTrade, setActiveTrade] = useState('')
  const [sort, setSort]           = useState('rating')
  const offset = useRef(0)

  // Fetch categories + stats once on mount
  const [tradeCounts, setTradeCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/reviews').then(r => r.json()),
      fetch('/api/stats/trades').then(r => r.json()),
    ]).then(([catsData, revsData, statsData]) => {
      setCategories(catsData.categories || [])
      setStats(s => ({ ...s, trades: (catsData.categories || []).length, reviews: (revsData.reviews || []).length }))
      // Build a map of category_id -> pro_count
      const counts: Record<string, number> = {}
      for (const t of (statsData.trades || [])) {
        counts[t.id] = t.pro_count
      }
      setTradeCounts(counts)
    })
  }, [])

  // Build query URL — city is exact filter, name is text search
  function buildUrl(off: number) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(off),
      sort,
    })
    if (activeTrade)   params.set('trade', activeTrade)
    if (appliedSearch) {
      // If search looks like a city name (no numbers), use city filter
      // Otherwise use general search
      if (/^[a-zA-Z\s]+$/.test(appliedSearch) && appliedSearch.length > 2) {
        params.set('city', appliedSearch)
      } else {
        params.set('search', appliedSearch)
      }
    }
    return `/api/pros?${params}`
  }

  // Initial load / re-load on filter change
  const loadPros = useCallback(async () => {
    setLoading(true)
    setError('')
    offset.current = 0
    try {
      const r = await fetch(buildUrl(0))
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPros(d.pros || [])
      setTotal(d.total || 0)
      setHasMore(d.hasMore || false)
      setStats(s => ({ ...s, pros: d.total || 0 }))
      offset.current = PAGE_SIZE
    } catch(e: any) {
      setError('Could not load pros. Please refresh.')
    }
    setLoading(false)
  }, [activeTrade, appliedSearch, sort])

  useEffect(() => { loadPros() }, [loadPros])

  // Load more
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
    } catch(e) {
      // silent fail on load more
    }
    setLoadingMore(false)
  }

  function applySearch() {
    setAppliedSearch(search)
  }

  function selectTrade(id: string) {
    setActiveTrade(prev => prev === id ? '' : id)
    setSearch('')
    setAppliedSearch('')
  }

  function clearFilters() {
    setActiveTrade('')
    setSearch('')
    setAppliedSearch('')
  }

  const activeCategory = categories.find(c => c.id === activeTrade)
  const hasFilters = activeTrade || appliedSearch

  return (
    <>
      <Navbar />

      {/* Hero */}
      <section className="max-w-2xl mx-auto px-6 pt-16 pb-12 text-center">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-50 px-3 py-1 rounded-full mb-5">
          Trusted skilled trades
        </span>
        <h1 className="font-serif text-5xl text-gray-900 leading-tight tracking-tight mb-4">
          Find the right pro for <em className="not-italic text-teal-600">any job</em>
        </h1>
        <p className="text-lg text-gray-400 font-light mb-9 leading-relaxed">
          Browse verified electricians, plumbers, HVAC techs and more — real reviews, real pros.
        </p>
        <div className="flex gap-2 bg-white border border-gray-200 rounded-full px-5 py-2 shadow-sm max-w-xl mx-auto">
          <input
            type="text"
            value={search}
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
      </section>

      {/* Stats */}
      <div className="border-y border-gray-100 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-6 flex justify-center gap-12">
          {[
            { n: loading ? '—' : total > 0 ? total : stats.pros, l: 'Verified pros' },
            { n: stats.trades || '—', l: 'Trade categories' },
            { n: stats.reviews || '—', l: 'Reviews posted' },
          ].map(s => (
            <div key={s.l} className="text-center">
              <div className="font-serif text-3xl text-teal-600">{s.n}</div>
              <div className="text-xs text-gray-400 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">

        {/* Trade chips */}
        <div className="py-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Browse by trade</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => selectTrade('')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                !activeTrade ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-500 hover:border-teal-300'
              }`}>
              All trades
            </button>
            {categories.map(cat => {
              const count = tradeCounts[cat.id] || 0
              return (
                <button key={cat.id} onClick={() => selectTrade(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    activeTrade === cat.id ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-500 hover:border-teal-300'
                  }`}>
                  {cat.category_name}
                  {count > 0 && (
                    <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none ${
                      activeTrade === cat.id ? 'bg-white/25 text-white' : 'bg-teal-50 text-teal-700'
                    }`}>{count}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {loading ? 'Loading...' : (
                <>
                  Showing <span className="font-semibold text-gray-900">{pros.length}</span> of{' '}
                  <span className="font-semibold text-gray-900">{total}</span>{' '}
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
            className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none">
            <option value="rating">Highest rated</option>
            <option value="experience">Most experienced</option>
            <option value="reviews">Most reviews</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </select>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-8">
          {loading
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)
            : error
              ? <div className="col-span-4 text-center py-16 text-gray-400">{error}</div>
              : pros.length === 0
                ? (
                  <div className="col-span-4 text-center py-16">
                    <div className="text-4xl mb-3 opacity-30">🔍</div>
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
              ) : (
                `Load more pros (${total - pros.length} remaining)`
              )}
            </button>
          </div>
        )}

        {/* End of results */}
        {!loading && !hasMore && pros.length > 0 && (
          <div className="text-center pb-16 text-xs text-gray-300">
            — All {total} pros shown —
          </div>
        )}

      </div>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-gray-400">© 2026 TradesNetwork · Univaro Technologies</div>
          <div className="flex items-center gap-5 text-sm">
            <a href="/about"   className="text-gray-400 hover:text-teal-600 transition-colors">About</a>
            <a href="/contact" className="text-gray-400 hover:text-teal-600 transition-colors">Contact</a>
            <a href="/privacy" className="text-gray-400 hover:text-teal-600 transition-colors">Privacy</a>
            <a href="/terms"   className="text-gray-400 hover:text-teal-600 transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </>
  )
}
