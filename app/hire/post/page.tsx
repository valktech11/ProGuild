'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { US_STATES } from '@/lib/utils'

const JOB_TYPES  = ['Full-time','Part-time','Contract','Temporary','Apprentice']
const PAY_TYPES  = ['hourly','daily','weekly','monthly','project']
const CO_TYPES   = ['General Contractor','Property Manager','HOA','Commercial Builder','Other']

export default function PostHireJobPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')

  const [form, setForm] = useState({
    company_name: '', company_email: '', company_type: '',
    title: '', trade_category_id: '', job_type: 'Full-time',
    city: '', state: '', description: '',
    pay_range_min: '', pay_range_max: '', pay_type: 'hourly',
    duration: '', requirements: '',
  })

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit() {
    if (!form.title || !form.description || !form.company_name || !form.company_email) {
      setError('Please fill in all required fields'); return
    }
    setSubmitting(true); setError('')
    const r = await fetch('/api/b2b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        pay_range_min: form.pay_range_min ? parseInt(form.pay_range_min) : null,
        pay_range_max: form.pay_range_max ? parseInt(form.pay_range_max) : null,
      }),
    })
    const d = await r.json()
    setSubmitting(false)
    if (r.ok) setSubmitted(true)
    else setError(d.error || 'Could not post job')
  }

  const inp = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors'
  const lbl = 'text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5'

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto px-6 py-12">

        <div className="mb-8">
          <Link href="/hire" className="text-sm text-gray-400 hover:text-teal-600 transition-colors">← Back to hiring board</Link>
          <h1 className="font-serif text-3xl text-gray-900 mt-3 mb-1">Post a trade job</h1>
          <p className="text-gray-400 text-sm">Reach verified, licensed trade professionals. Free to post.</p>
        </div>

        {submitted ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="font-serif text-2xl text-gray-900 mb-2">Job posted!</h2>
            <p className="text-gray-400 text-sm mb-6">Your job is now live on the hiring board. Verified pros can apply immediately.</p>
            <div className="flex gap-3 justify-center">
              <Link href="/hire" className="px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
                View hiring board →
              </Link>
              <button onClick={() => { setSubmitted(false); setForm({ company_name:'',company_email:'',company_type:'',title:'',trade_category_id:'',job_type:'Full-time',city:'',state:'',description:'',pay_range_min:'',pay_range_max:'',pay_type:'hourly',duration:'',requirements:'' }) }}
                className="px-6 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                Post another
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">

            {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl">{error}</div>}

            {/* Company info */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
                Company information
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={lbl}>Company name *</label>
                  <input value={form.company_name} onChange={set('company_name')} placeholder="Harrington Construction" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Company email *</label>
                  <input type="email" value={form.company_email} onChange={set('company_email')} placeholder="jobs@company.com" className={inp} />
                </div>
              </div>
              <div>
                <label className={lbl}>Company type</label>
                <select value={form.company_type} onChange={set('company_type')} className={inp}>
                  <option value="">Select type...</option>
                  {CO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Job details */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
                Job details
              </div>
              <div className="mb-4">
                <label className={lbl}>Job title *</label>
                <input value={form.title} onChange={set('title')} placeholder="Licensed Electrician — Commercial projects" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={lbl}>Trade *</label>
                  <select value={form.trade_category_id} onChange={set('trade_category_id')} className={inp}>
                    <option value="">Select trade...</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Job type</label>
                  <select value={form.job_type} onChange={set('job_type')} className={inp}>
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={lbl}>City</label>
                  <input value={form.city} onChange={set('city')} placeholder="Jacksonville" className={inp} />
                </div>
                <div>
                  <label className={lbl}>State</label>
                  <select value={form.state} onChange={set('state')} className={inp}>
                    <option value="">Select state...</option>
                    {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className={lbl}>Duration / timeline</label>
                <input value={form.duration} onChange={set('duration')} placeholder="e.g. 6-month project, Ongoing, Starting June 2026" className={inp} />
              </div>
              <div>
                <label className={lbl}>Job description *</label>
                <textarea value={form.description} onChange={set('description')} rows={5}
                  placeholder="Describe the role, responsibilities, and what a typical day looks like..."
                  className={inp + ' resize-none'} />
              </div>
            </div>

            {/* Pay */}
            <div className="bg-white border border-gray-100 rounded-2xl p-7">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">
                Pay & requirements
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={lbl}>Min pay ($)</label>
                  <input type="number" value={form.pay_range_min} onChange={set('pay_range_min')} placeholder="25" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Max pay ($)</label>
                  <input type="number" value={form.pay_range_max} onChange={set('pay_range_max')} placeholder="45" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Pay type</label>
                  <select value={form.pay_type} onChange={set('pay_type')} className={inp}>
                    {PAY_TYPES.map(t => <option key={t} value={t}>/{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Requirements <span className="text-gray-300 font-normal normal-case tracking-normal">(optional)</span></label>
                <textarea value={form.requirements} onChange={set('requirements')} rows={3}
                  placeholder="e.g. Valid FL electrical license required. OSHA 10 preferred. Must have own tools."
                  className={inp + ' resize-none'} />
              </div>
            </div>

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-3.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {submitting ? 'Posting...' : 'Post job — free →'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Job will be live for 30 days · Zero per-application fees · Reach verified licensed professionals
            </p>
          </div>
        )}
      </div>
    </>
  )
}
