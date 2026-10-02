'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import ProCard from '@/components/ui/ProCard'
import { Pro } from '@/types'

// Homepage "Verified pros across Florida" band — real pros from /api/pros, reusing the
// same ProCard as /search so it reads production-accurate. Staging trial.
export default function VerifiedProsBand() {
  const [pros, setPros]   = useState<Pro[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pros?limit=6&sort=default')
      .then(r => r.json())
      .then(d => { setPros(d.pros || []); setTotal(d.total || 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="max-w-6xl mx-auto px-6 pt-4 pb-12">
      <div className="flex items-end justify-between gap-5 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold mb-2" style={{ color: '#0F766E' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>
            </svg>
            Florida · license-verified
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: '#0A1628', fontFamily: "'DM Serif Display', serif" }}>
            Verified pros across Florida
          </h2>
          <p className="text-sm" style={{ color: '#6E6456' }}>
            Every pro here holds a current state license we&apos;ve checked. Reach them directly — no shared leads.
          </p>
        </div>
        <Link href="/search"
          className="flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-full border transition-colors"
          style={{ color: '#0A1628', borderColor: '#E8E2D9', background: '#FFFFFF' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E2D9'; e.currentTarget.style.color = '#0A1628' }}>
          View all{total ? ` ${total.toLocaleString()}` : ''} verified pros →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border rounded-xl p-5 animate-pulse" style={{ borderColor: '#E8E2D9' }}>
              <div className="flex gap-3 mb-4">
                <div className="w-11 h-11 rounded-full flex-shrink-0" style={{ background: '#FAF9F6' }} />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 w-3/5 rounded" style={{ background: '#FAF9F6' }} />
                  <div className="h-3 w-2/5 rounded" style={{ background: '#FAF9F6' }} />
                </div>
              </div>
              <div className="h-8 w-full rounded-lg" style={{ background: '#FAF9F6' }} />
            </div>
          ))
          : pros.map((pro, i) => <ProCard key={pro.id} pro={pro} index={i} />)
        }
      </div>
    </section>
  )
}
