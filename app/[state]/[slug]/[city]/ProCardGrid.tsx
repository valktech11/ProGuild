'use client'
import { useState } from 'react'
import ProCard from '@/components/ui/ProCard'
import Link from 'next/link'

interface Props {
  pros: any[]
  tradeSlug: string
  stateSlug: string
  tradeName: string
  cityDisplay: string
}

const SORT_OPTIONS = [
  { value: 'rating',    label: 'Highest Rated' },
  { value: 'reviews',   label: 'Most Reviews' },
  { value: 'default',   label: 'Top Credentialed' },
  { value: 'name_asc',  label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
]

export default function ProCardGrid({ pros: initialPros, tradeSlug, stateSlug, tradeName, cityDisplay }: Props) {
  const [pros, setPros]       = useState(initialPros)
  const [sort, setSort]       = useState('rating')
  const [loading, setLoading] = useState(false)

  async function changeSort(newSort: string) {
    setSort(newSort)
    setLoading(true)
    try {
      const params = new URLSearchParams({
        trade_slug: tradeSlug,
        state: stateSlug.toUpperCase(),
        city: cityDisplay,
        limit: '12',
        offset: '0',
        sort: newSort,
      })
      const res  = await fetch(`/api/pros?${params}`)
      const data = await res.json()
      if (data.pros) setPros(data.pros)
    } catch {}
    finally { setLoading(false) }
  }

  return (
    <>
      {/* Sort + count header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="text-sm" style={{ color: '#6B7280' }}>
          <span className="font-bold" style={{ color: '#0A1628' }}>{pros.length}</span>
          {' '}verified {tradeName.toLowerCase()}s in {cityDisplay}
        </div>
        <div className="relative flex-shrink-0">
          <select value={sort} onChange={e => changeSort(e.target.value)}
            className="appearance-none text-sm font-medium pl-3 pr-8 py-2 rounded-xl border outline-none cursor-pointer"
            style={{ borderColor: '#E8E2D9', color: '#0A1628', background: 'white' }}>
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: '#A89F93' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>

      {/* Pro grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6 transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
        {pros.map((pro, i) => (
          <ProCard key={pro.id} pro={pro} index={i} />
        ))}
      </div>

      {/* Request a Pro CTA */}
      <div className="mt-2 p-5 bg-white rounded-2xl border text-center" style={{ borderColor: '#E8E2D9' }}>
        <div className="text-base font-bold mb-1" style={{ color: '#0A1628' }}>Don't see the right pro?</div>
        <p className="text-sm mb-4" style={{ color: '#6B7280' }}>
          Post a request — we'll match you with a verified {tradeName.toLowerCase()} in {cityDisplay}.
        </p>
        <Link href="/post-job"
          className="inline-block px-6 py-2.5 rounded-xl font-semibold text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
          Request a Pro →
        </Link>
      </div>
    </>
  )
}
