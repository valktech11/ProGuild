'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { timeAgo } from '@/lib/utils'

function JobTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    'Full-time':  'bg-blue-50 text-blue-700',
    'Part-time':  'bg-purple-50 text-purple-700',
    'Contract':   'bg-amber-50 text-amber-700',
    'Temporary':  'bg-orange-50 text-orange-700',
    'Apprentice': 'bg-teal-50 text-teal-700',
  }
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors[type] || 'bg-gray-100 text-gray-600'}`}>{type}</span>
}

export default function HireJobDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const [job, setJob]           = useState<any>(null)
  const [similar, setSimilar]   = useState<any[]>([])
  const [session, setSession]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied]   = useState(false)
  const [toast, setToast]       = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (raw) setSession(JSON.parse(raw))

    fetch(`/api/b2b/${id}`)
      .then(r => r.json())
      .then(d => {
        setJob(d.job)
        setLoading(false)
        // Load similar jobs
        if (d.job?.trade_category_id) {
          fetch(`/api/b2b?trade=${d.job.trade_category_id}&limit=4`)
            .then(r => r.json())
            .then(sd => setSimilar((sd.jobs || []).filter((j: any) => j.id !== id).slice(0, 3)))
        }
      })
  }, [id])

  async function applyToJob() {
    if (!session) { router.push('/login'); return }
    setApplying(true)
    const r = await fetch('/api/b2b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apply', job_id: id, pro_id: session.id }),
    })
    setApplying(false)
    if (r.ok) { setApplied(true); setToast('Application sent! ✓') }
    else {
      const d = await r.json()
      setToast(d.error === 'Already applied' ? 'You already applied to this job' : 'Could not apply — try again')
    }
    setTimeout(() => setToast(''), 3000)
  }

  if (loading) return (
    <><Navbar />
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </>
  )

  if (!job) return (
    <><Navbar />
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-center">
        <div>
          <div className="text-4xl mb-3 opacity-20">🏗</div>
          <h2 className="font-serif text-xl text-gray-700 mb-2">Job not found</h2>
          <Link href="/hire" className="text-teal-600 text-sm">← Back to hiring board</Link>
        </div>
      </div>
    </>
  )

  const payRange = job.pay_range_min && job.pay_range_max
    ? `$${job.pay_range_min}–$${job.pay_range_max}/${job.pay_type || 'hr'}`
    : job.pay_range_min ? `From $${job.pay_range_min}/${job.pay_type || 'hr'}` : null

  return (
    <>
      <Navbar />
      {toast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg z-50">{toast}</div>
      )}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/hire" className="text-sm text-gray-400 hover:text-teal-600 transition-colors mb-6 inline-block">
          ← Back to hiring board
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — main job detail */}
          <div className="lg:col-span-2 space-y-5">

            {/* Header card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-lg font-bold text-gray-500 flex-shrink-0">
                  {job.company?.name?.charAt(0) || 'C'}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{job.company?.name}</div>
                  <div className="text-sm text-gray-400">{[job.company?.city, job.company?.state].filter(Boolean).join(', ')} · {job.company?.company_type || 'Company'}</div>
                  {job.company?.is_verified && <span className="text-xs text-teal-600 font-semibold">✓ Verified company</span>}
                </div>
              </div>

              <h1 className="font-serif text-2xl text-gray-900 mb-3">{job.title}</h1>

              <div className="flex flex-wrap gap-2 mb-5">
                <JobTypeBadge type={job.job_type} />
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
                {payRange && (
                  <span className="text-xs font-semibold px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
                    💰 {payRange}
                  </span>
                )}
                {job.duration && (
                  <span className="text-xs font-medium px-2.5 py-1 bg-stone-50 text-gray-600 rounded-full border border-gray-200">
                    ⏱ {job.duration}
                  </span>
                )}
              </div>

              <div className="text-xs text-gray-400">{timeAgo(job.posted_at)} · {job.applications_count} applicant{job.applications_count !== 1 ? 's' : ''}</div>
            </div>

            {/* Job type detail */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <h2 className="font-semibold text-gray-900 mb-2">Job type</h2>
              <p className="text-teal-700 font-medium">{job.job_type}</p>
            </div>

            {/* Full description */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <h2 className="font-semibold text-gray-900 mb-4">Job description</h2>
              <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{job.description}</div>
            </div>

            {/* Requirements */}
            {job.requirements && (
              <div className="bg-white border border-gray-100 rounded-2xl p-7">
                <h2 className="font-semibold text-gray-900 mb-4">Requirements</h2>
                <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{job.requirements}</div>
              </div>
            )}
          </div>

          {/* RIGHT — apply + similar */}
          <div className="space-y-4">

            {/* Apply card */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6 sticky top-20">
              {session ? (
                <>
                  <button onClick={applyToJob} disabled={applying || applied}
                    className={`w-full py-3 text-sm font-semibold rounded-xl transition-all mb-3 ${
                      applied ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50'
                    }`}>
                    {applying ? 'Applying...' : applied ? '✓ Applied' : '🚀 Apply now'}
                  </button>
                  <p className="text-xs text-gray-400 text-center">Your verified profile is your application</p>
                </>
              ) : (
                <>
                  <Link href="/login" className="block w-full py-3 text-sm font-semibold text-center rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors mb-3">
                    Log in to apply
                  </Link>
                  <p className="text-xs text-gray-400 text-center">Your verified ProGuild.ai profile is your resume</p>
                </>
              )}

              <div className="border-t border-gray-100 mt-4 pt-4 space-y-2.5">
                {[
                  { icon: '✓', label: 'Verified pros only',    sub: 'License-checked applicants' },
                  { icon: '💰', label: 'Zero fees to apply',   sub: 'No per-application charges' },
                  { icon: '⚡', label: 'Instant application',  sub: 'One tap with your profile'  },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center text-xs flex-shrink-0">{item.icon}</div>
                    <div>
                      <div className="text-xs font-semibold text-gray-900">{item.label}</div>
                      <div className="text-xs text-gray-400">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Similar jobs */}
            {similar.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Similar jobs</div>
                <div className="space-y-4">
                  {similar.map(sj => (
                    <Link key={sj.id} href={`/hire/${sj.id}`} className="block hover:bg-stone-50 rounded-xl p-3 -mx-3 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                          {sj.company?.name?.charAt(0) || 'C'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{sj.title}</div>
                          <div className="text-xs text-gray-400">{sj.company?.name}</div>
                          <div className="flex gap-1 mt-1">
                            <JobTypeBadge type={sj.job_type} />
                            {(sj.city || sj.state) && (
                              <span className="text-xs text-gray-400">{[sj.city, sj.state].filter(Boolean).join(', ')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <Link href="/hire" className="text-xs text-teal-600 font-medium hover:underline mt-3 block text-center">
                  View all jobs →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
