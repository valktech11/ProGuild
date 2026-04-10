'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { timeAgo } from '@/lib/utils'

const JOB_TYPES = ['Full-time','Part-time','Contract','Temporary','Apprentice']

function PayBadge({ min, max, type }: { min?: number; max?: number; type?: string }) {
  if (!min && !max) return null
  const range = min && max ? `$${min}–$${max}` : min ? `From $${min}` : `Up to $${max}`
  return (
    <span className="text-xs font-semibold px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
      {range}/{type || 'hr'}
    </span>
  )
}

function JobTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    'Full-time':  'bg-blue-50 text-blue-700 border-blue-200',
    'Part-time':  'bg-purple-50 text-purple-700 border-purple-200',
    'Contract':   'bg-amber-50 text-amber-700 border-amber-200',
    'Temporary':  'bg-orange-50 text-orange-700 border-orange-200',
    'Apprentice': 'bg-teal-50 text-teal-700 border-teal-200',
  }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${colors[type] || 'bg-gray-50 text-gray-600'}`}>
      {type}
    </span>
  )
}

export default function HirePage() {
  const [jobs, setJobs]           = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [session, setSession]     = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [applying, setApplying]   = useState<string | null>(null)
  const [applied, setApplied]     = useState<Set<string>>(new Set())
  const [toast, setToast]         = useState('')
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())

  // Filters
  const [tradeFil, setTradeFil]   = useState('')
  const [typeFil, setTypeFil]     = useState('')
  const [stateFil, setStateFil]   = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    if (raw) setSession(JSON.parse(raw))
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tradeFil) params.set('trade', tradeFil)
    if (typeFil)  params.set('job_type', typeFil)
    if (stateFil) params.set('state', stateFil)
    fetch(`/api/b2b?${params}`)
      .then(r => r.json())
      .then(d => { setJobs(d.jobs || []); setLoading(false) })
  }, [tradeFil, typeFil, stateFil])

  async function applyToJob(jobId: string) {
    if (!session) { window.location.href = '/login'; return }
    setApplying(jobId)
    const r = await fetch('/api/b2b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apply', job_id: jobId, pro_id: session.id }),
    })
    setApplying(null)
    if (r.ok) {
      setApplied(prev => new Set([...prev, jobId]))
      setToast('Application sent! ✓')
      setTimeout(() => setToast(''), 3000)
    } else {
      const d = await r.json()
      setToast(d.error === 'Already applied' ? 'Already applied to this job' : 'Could not apply — try again')
      setTimeout(() => setToast(''), 3000)
    }
  }

  return (
    <>
      <Navbar />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Hero */}
      <div className="bg-gradient-to-br from-gray-900 to-teal-900 text-white py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase bg-teal-500/20 border border-teal-500/30 text-teal-300 px-3 py-1 rounded-full mb-5">
            B2B Hiring Board
          </span>
          <h1 className="font-serif text-4xl md:text-5xl mb-4">
            Trade jobs from real companies
          </h1>
          <p className="text-lg text-gray-300 font-light mb-8 max-w-2xl mx-auto">
            Construction companies, property managers and commercial builders posting verified trade positions.
            No per-application fees. Your verified license is your resume.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/hire/post"
              className="px-6 py-3 bg-teal-500 text-white font-semibold rounded-xl hover:bg-teal-400 transition-colors">
              Post a job →
            </Link>
            <Link href="#jobs"
              className="px-6 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors border border-white/20">
              Browse jobs
            </Link>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex gap-8">
            {[
              { label: 'Active jobs', value: jobs.length },
              { label: 'Job types', value: JOB_TYPES.length },
              { label: 'Zero per-application fees', value: '✓' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-lg font-bold text-teal-600">{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
          {!session && (
            <Link href="/login" className="text-sm text-teal-600 font-medium hover:underline">
              Log in to apply with 1 tap →
            </Link>
          )}
        </div>
      </div>

      <div id="jobs" className="max-w-4xl mx-auto px-6 py-10">

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-7">
          <select value={tradeFil} onChange={e => setTradeFil(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-teal-400">
            <option value="">All trades</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
          </select>
          <select value={typeFil} onChange={e => setTypeFil(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-teal-400">
            <option value="">All types</option>
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={stateFil} onChange={e => setStateFil(e.target.value)}
            placeholder="Filter by state (e.g. FL)"
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white focus:outline-none focus:border-teal-400 w-44" />
          {(tradeFil || typeFil || stateFil) && (
            <button onClick={() => { setTradeFil(''); setTypeFil(''); setStateFil('') }}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
              Clear filters ×
            </button>
          )}
        </div>

        {/* Jobs */}
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/3 mb-5" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-4/5" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl py-20 text-center">
            <div className="text-5xl mb-4 opacity-20">🏗</div>
            <h2 className="font-serif text-xl text-gray-700 mb-2">No jobs posted yet</h2>
            <p className="text-sm text-gray-400 mb-6">Be the first to post a trade job for your company.</p>
            <Link href="/hire/post"
              className="inline-block px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              Post a job →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job: any) => {
              const isApplied = applied.has(job.id)
              return (
                <div key={job.id} className="bg-white border border-gray-100 rounded-2xl p-6 hover:border-teal-200 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Company */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                          {job.company?.name?.charAt(0) || 'C'}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-700">{job.company?.name}</div>
                          <div className="text-xs text-gray-400">{[job.company?.city, job.company?.state].filter(Boolean).join(', ')}</div>
                        </div>
                        {job.company?.is_verified && (
                          <span className="text-xs text-teal-600 font-semibold">✓ Verified</span>
                        )}
                      </div>

                      <a href={`/hire/${job.id}`} className="hover:text-teal-600 transition-colors">
                        <h2 className="font-semibold text-gray-900 text-lg mb-2">{job.title}</h2>
                      </a>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        <JobTypeBadge type={job.job_type} />
                        <PayBadge min={job.pay_range_min} max={job.pay_range_max} type={job.pay_type} />
                        {job.trade_category && (
                          <span className="text-xs font-medium px-2.5 py-1 bg-stone-50 text-gray-600 rounded-full border border-gray-200">
                            🔧 {job.trade_category.category_name}
                          </span>
                        )}
                        {(job.city || job.state) && (
                          <span className="text-xs font-medium px-2.5 py-1 bg-stone-50 text-gray-600 rounded-full border border-gray-200">
                            📍 {[job.city, job.state].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>

                      <div className="mb-3">
                        <p className={`text-sm text-gray-600 leading-relaxed ${expanded.has(job.id) ? '' : 'line-clamp-2'}`}>
                          {job.description}
                        </p>
                        {job.description && job.description.length > 120 && (
                          <button onClick={() => setExpanded(prev => {
                            const next = new Set(prev)
                            next.has(job.id) ? next.delete(job.id) : next.add(job.id)
                            return next
                          })} className="text-xs text-teal-600 hover:text-teal-800 font-medium mt-1 transition-colors">
                            {expanded.has(job.id) ? 'Show less ↑' : 'Show more ↓'}
                          </button>
                        )}
                      </div>

                      {job.requirements && (
                        <div className="text-xs text-gray-400 mb-2">
                          <span className="font-medium text-gray-600">Requirements: </span>
                          {job.requirements}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                        <span>{timeAgo(job.posted_at)}</span>
                        {job.duration && <span>· {job.duration}</span>}
                        <span>· {job.applications_count} applicant{job.applications_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>

                    {/* Apply button */}
                    <div className="flex-shrink-0">
                      {session ? (
                        <button
                          onClick={() => applyToJob(job.id)}
                          disabled={applying === job.id || isApplied}
                          className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                            isApplied
                              ? 'bg-teal-50 text-teal-700 border border-teal-200 cursor-default'
                              : 'bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50'
                          }`}>
                          {applying === job.id ? '...' : isApplied ? '✓ Applied' : 'Apply'}
                        </button>
                      ) : (
                        <Link href="/login"
                          className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                          Log in to apply
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA for companies */}
        <div className="mt-12 bg-gradient-to-r from-gray-900 to-teal-900 rounded-2xl p-8 text-white text-center">
          <h2 className="font-serif text-2xl mb-3">Hiring trade professionals?</h2>
          <p className="text-gray-300 text-sm mb-6 max-w-lg mx-auto leading-relaxed">
            Post a job and get applications from verified, licensed professionals.
            All pros on TradesNetwork have been cross-referenced with state licensing databases.
          </p>
          <Link href="/hire/post"
            className="inline-block px-8 py-3 bg-teal-500 text-white font-semibold rounded-xl hover:bg-teal-400 transition-colors">
            Post your first job — free →
          </Link>
        </div>
      </div>

      <footer className="border-t border-gray-100 mt-8 py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-gray-400">© 2026 TradesNetwork</div>
          <div className="flex gap-5 text-sm">
            {[['/', 'Find a pro'], ['/jobs', 'Post a job'], ['/hire', 'Hiring board'], ['/contact', 'Contact']].map(([href, label]) => (
              <Link key={href} href={href} className="text-gray-400 hover:text-teal-600 transition-colors">{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </>
  )
}
