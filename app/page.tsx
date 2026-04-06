'use client'
import { useState, useEffect } from 'react'
import Navbar from '@/components/layout/Navbar'
import ProCard from '@/components/ui/ProCard'
import { Pro, TradeCategory } from '@/types'

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
  const [pros, setPros] = useState<Pro[]>([])
  const [categories, setCategories] = useState<TradeCategory[]>([])
  const [stats, setStats] = useState({ pros: 0, trades: 0, reviews: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [activeTrade, setActiveTrade] = useState('')
  const [sort, setSort] = useState('rating')

  useEffect(() => {
    Promise.all([
      fetch('/api/pros').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/reviews').then(r => r.json()),
    ]).then(([prosData, catsData, revsData]) => {
      setPros(prosData.pros || [])
      setCategories(catsData.categories || [])
      setStats({
        pros: (prosData.pros || []).length,
        trades: (catsData.categories || []).length,
        reviews: (revsData.reviews || []).length,
      })
      setLoading(false)
    }).catch(() => {
      setError('Could not load pros. Please refresh.')
      setLoading(false)
    })
  }, [])

  const filtered = pros
    .filter(p => {
      if (activeTrade && p.trade_category_id !== activeTrade) return false
      if (activeSearch) {
        const q = activeSearch.toLowerCase()
        const name  = (p.full_name || '').toLowerCase()
        const city  = (p.city || '').toLowerCase()
        const zip   = (p.zip_code || '').toLowerCase()
        const trade = (p.trade_category?.category_name || '').toLowerCase()
        if (!name.includes(q) && !city.includes(q) && !zip.includes(q) && !trade.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sort === 'rating')     return (b.avg_rating || 0) - (a.avg_rating || 0)
      if (sort === 'experience') return (b.years_experience || 0) - (a.years_experience || 0)
      if (sort === 'reviews')    return (b.review_count || 0) - (a.review_count || 0)
      if (sort === 'name')       return a.full_name.localeCompare(b.full_name)
      return 0
    })

  return (
    <>
      <Navbar />

      <section className="max-w-2xl mx-auto px-6 pt-16 pb-12 text-center">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-50 px-3 py-1 rounded-full mb-5">
          Trusted skilled trades
        </span>
        <h1 className="font-serif text-5xl text-gray-900 leading-tight tracking-tight mb-4">
          Find the right pro for <em className="not-italic text-teal-600">any job</em>
        </h1>
        <p className="text-lg text-gray-400 font-light mb-9 leading-relaxed">
          Browse verified electricians, plumbers, HVAC techs and more — read real reviews, get quotes, hire with confidence.
        </p>
        <div className="flex gap-2 bg-white border border-gray-200 rounded-full px-5 py-2 shadow-sm max-w-xl mx-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setActiveSearch(search)}
            placeholder="Trade, name, city or zip code..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 placeholder-gray-400"
          />
          <button
            onClick={() => setActiveSearch(search)}
            className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-full hover:bg-teal-700 transition-colors"
          >
            Search
          </button>
        </div>
      </section>

      <div className="border-y border-gray-100 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-6 flex justify-center gap-12">
          {[
            { n: loading ? '—' : stats.pros, l: 'Verified pros' },
            { n: loading ? '—' : stats.trades, l: 'Trade categories' },
            { n: loading ? '—' : stats.reviews, l: 'Reviews posted' },
          ].map(s => (
            <div key={s.l} className="text-center">
              <div className="font-serif text-3xl text-teal-600">{s.n}</div>
              <div className="text-xs text-gray-400 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="py-6">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Browse by trade</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveTrade('')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${activeTrade === '' ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-500 hover:border-teal-300'}`}>
              All trades
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveTrade(activeTrade === cat.id ? '' : cat.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${activeTrade === cat.id ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-500 hover:border-teal-300'}`}>
                {cat.category_name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-5">
          <span className="text-sm text-gray-400">
            {loading ? 'Loading...' : `${filtered.length} pro${filtered.length !== 1 ? 's' : ''} found`}
          </span>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none">
            <option value="rating">Highest rated</option>
            <option value="experience">Most experienced</option>
            <option value="reviews">Most reviews</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-16">
          {loading ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />) :
           error ? <div className="col-span-3 text-center py-16 text-gray-400">{error}</div> :
           filtered.length === 0 ? (
             <div className="col-span-3 text-center py-16">
               <div className="text-4xl mb-3 opacity-30">🔍</div>
               <div className="font-semibold text-gray-700 mb-2">No pros found</div>
               <div className="text-sm text-gray-400">Try a different trade or search term.</div>
             </div>
           ) : filtered.map((pro, i) => <ProCard key={pro.id} pro={pro} index={i} />)
          }
        </div>
      </div>

      <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
        © 2026 TradesNetwork · <a href="#" className="text-teal-600">Privacy</a> · <a href="#" className="text-teal-600">Terms</a>
      </footer>
    </>
  )
}
