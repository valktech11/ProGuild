'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { timeAgo } from '@/lib/utils'

const BUDGETS = ['Under $500','$500–$2K','$2K–$10K','$10K+','Negotiable']

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Open:       'bg-green-50 text-green-700 border-green-200',
    In_Progress:'bg-blue-50 text-blue-700 border-blue-200',
    Filled:     'bg-gray-100 text-gray-500 border-gray-200',
    Expired:    'bg-red-50 text-red-500 border-red-200',
    Cancelled:  'bg-gray-100 text-gray-400 border-gray-200',
  }
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${styles[status] || styles.Open}`}>
      {status.replace('_',' ')}
    </span>
  )
}

export default function JobsPage() {
  const [jobs, setJobs]           = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeTrade, setActiveTrade] = useState('')
  const [activeStatus, setActiveStatus] = useState('Open')

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ status: activeStatus, limit: '50' })
    if (activeTrade) params.set('trade', activeTrade)
    fetch(`/api/jobs?${params}`)
      .then(r => r.json())
      .then(d => { setJobs(d.jobs || []); setLoading(false) })
  }, [activeTrade, activeStatus])

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl text-gray-900 mb-1">Job Board</h1>
            <p className="text-gray-400 text-sm">Homeowners looking to hire trade professionals</p>
          </div>
          <Link href="/post-job"
            className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
            + Post a job
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Status filter */}
          <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1">
            {['Open','In_Progress','Filled'].map(s => (
              <button key={s} onClick={() => setActiveStatus(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeStatus === s ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}>
                {s.replace('_',' ')}
              </button>
            ))}
          </div>

          {/* Trade filter */}
          <select value={activeTrade} onChange={e => setActiveTrade(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-teal-400">
            <option value="">All trades</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.category_name}</option>
            ))}
          </select>
        </div>

        {/* Job list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl py-16 text-center">
            <div className="text-4xl mb-3 opacity-20">📋</div>
            <h2 className="font-serif text-xl text-gray-700 mb-2">No {activeStatus.toLowerCase()} jobs</h2>
            <p className="text-sm text-gray-400 mb-6">Be the first to post a job in your area.</p>
            <Link href="/post-job" className="inline-block px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              Post a job →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job: any) => (
              <div key={job.id} className="bg-white border border-gray-100 rounded-2xl p-6 hover:border-teal-200 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h2 className="font-semibold text-gray-900">{job.title}</h2>
                      <StatusBadge status={job.job_status} />
                      {job.is_boosted && (
                        <span className="text-xs font-semibold px-2 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full">
                          ⭐ Featured
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                      {job.trade_category && (
                        <span className="flex items-center gap-1">
                          🔧 {job.trade_category.category_name}
                        </span>
                      )}
                      {(job.city || job.state) && (
                        <span className="flex items-center gap-1">
                          📍 {[job.city, job.state].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {job.budget_range && (
                        <span className="flex items-center gap-1">
                          💰 {job.budget_range}
                        </span>
                      )}
                      <span>{timeAgo(job.posted_at)}</span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-2">
                  {job.description}
                </p>

                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <div className="text-sm text-gray-500">
                    Posted by <span className="font-medium text-gray-900">{job.homeowner_name}</span>
                  </div>
                  <Link href={`/?trade=${job.trade_category_id || ''}`}
                    className="text-sm font-semibold text-teal-600 hover:text-teal-800 transition-colors">
                    Find a {job.trade_category?.category_name || 'pro'} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
