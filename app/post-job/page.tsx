'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import { TradeCategory } from '@/types'
import { US_STATES, fetchCitiesForState } from '@/lib/utils'

const BUDGETS = ['Under $500', '$500–$2K', '$2K–$10K', '$10K+', 'Negotiable']

export default function PostJobPage() {
  const [step, setStep] = useState(1)
  const [categories, setCategories] = useState<TradeCategory[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Step 1
  const [title, setTitle] = useState('')
  const [trade, setTrade] = useState('')
  const [description, setDescription] = useState('')
  const [budget, setBudget] = useState('Negotiable')

  // Step 2
  const [hwName, setHwName] = useState('')
  const [hwEmail, setHwEmail] = useState('')
  const [hwPhone, setHwPhone] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [otherCity, setOtherCity] = useState('')
  const [zip, setZip] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  useEffect(() => {
    if (!state) { setCities([]); return }
    setCitiesLoading(true)
    setCity('')
    fetchCitiesForState(state).then(list => {
      setCities(list)
      setCitiesLoading(false)
    })
  }, [state])

  const [cities, setCities] = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)

  function validate1() {
    const e: Record<string, string> = {}
    if (!title.trim()) e.title = 'Please enter a job title'
    if (!trade) e.trade = 'Please select a trade'
    if (!description.trim()) e.description = 'Please describe the job'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validate2() {
    const e: Record<string, string> = {}
    if (!hwName.trim()) e.hwName = 'Please enter your name'
    if (!hwEmail.trim() || !hwEmail.includes('@')) e.hwEmail = 'Please enter a valid email'
    if (!city) e.city = 'Please select a city'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate2()) return
    setSubmitting(true)
    const finalCity = city === '__other__' ? otherCity : city
    const r = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, description, budget_range: budget,
        trade_category_id: trade,
        homeowner_name: hwName,
        homeowner_email: hwEmail,
        homeowner_phone: hwPhone || undefined,
        state, city: finalCity, zip_code: zip || undefined,
      }),
    })
    setSubmitting(false)
    if (r.ok) setSubmitted(true)
    else {
      const d = await r.json()
      setErrors({ submit: d.error || 'Could not post job. Please try again.' })
    }
  }

  if (submitted) return (
    <>
      <Navbar />
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-5 text-3xl text-teal-700 font-semibold">✓</div>
        <h2 className="font-serif text-3xl text-gray-900 mb-3">Your job is posted!</h2>
        <p className="text-gray-400 mb-8 leading-relaxed">Qualified pros in your area will be in touch soon. Keep an eye on your email.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors">Browse pros</Link>
          <Link href="/post-job" className="px-5 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">Post another</Link>
        </div>
      </div>
    </>
  )

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">

        {/* FORM */}
        <div className="lg:col-span-2">
          <div className="mb-2">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-50 px-3 py-1 rounded-full mb-4">Free to post</span>
            <h1 className="font-serif text-3xl text-gray-900 mb-2">Request a Pro — get matched fast</h1>
            <p className="text-gray-400 font-light">Describe what you need and qualified professionals will reach out.</p>
          </div>

          {/* Steps */}
          <div className="flex gap-0 my-7">
            {[1, 2, 3].map(n => (
              <div key={n} className="flex-1 flex items-center">
                <div className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center border-2 transition-all ${
                  step > n ? 'bg-teal-50 border-teal-400 text-teal-700' :
                  step === n ? 'bg-teal-600 border-teal-600 text-white' :
                  'bg-white border-gray-200 text-gray-400'
                }`}>{step > n ? '✓' : n}</div>
                <div className={`text-xs ml-2 ${step === n ? 'text-teal-700 font-medium' : 'text-gray-400'}`}>
                  {n === 1 ? 'Job details' : n === 2 ? 'Contact' : 'Done'}
                </div>
                {n < 3 && <div className="flex-1 h-px bg-gray-200 mx-3" />}
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-7">
            {step === 1 && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">About the job</div>
                <Field label="Job title" required error={errors.title}>
                  <input value={title} onChange={e => { setTitle(e.target.value); setErrors(p => ({...p, title: ''})) }}
                    placeholder="e.g. Fix leaking kitchen sink, Install ceiling fan..." className={input(errors.title)} />
                </Field>
                <Field label="Trade category" required error={errors.trade}>
                  <select value={trade} onChange={e => { setTrade(e.target.value); setErrors(p => ({...p, trade: ''})) }} className={input(errors.trade)}>
                    <option value="">Select a trade...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                  </select>
                </Field>
                <Field label="Description" required error={errors.description}>
                  <textarea value={description} onChange={e => { setDescription(e.target.value); setErrors(p => ({...p, description: ''})) }}
                    placeholder="Describe the work needed..." rows={4} className={input(errors.description) + ' resize-none'} />
                </Field>
                <div className="mb-6">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">Budget range</label>
                  <div className="grid grid-cols-3 gap-2">
                    {BUDGETS.map(b => (
                      <label key={b} className={`text-center px-3 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-all ${
                        budget === b ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-500 hover:border-teal-300'
                      }`}>
                        <input type="radio" name="budget" value={b} checked={budget === b} onChange={() => setBudget(b)} className="sr-only" />
                        {b}
                      </label>
                    ))}
                  </div>
                </div>
                <button onClick={() => validate1() && setStep(2)}
                  className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                  Continue → Contact details
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5 pb-3 border-b border-gray-100">Your contact details</div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Your name" required error={errors.hwName}>
                    <input value={hwName} onChange={e => { setHwName(e.target.value); setErrors(p => ({...p, hwName: ''})) }}
                      placeholder="John Smith" className={input(errors.hwName)} />
                  </Field>
                  <Field label="Email" required error={errors.hwEmail}>
                    <input type="email" value={hwEmail} onChange={e => { setHwEmail(e.target.value); setErrors(p => ({...p, hwEmail: ''})) }}
                      placeholder="john@example.com" className={input(errors.hwEmail)} />
                  </Field>
                </div>
                <Field label="Phone (optional)">
                  <input type="tel" value={hwPhone} onChange={e => setHwPhone(e.target.value)} placeholder="(555) 000-0000" className={input()} />
                </Field>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 mt-2 pt-4 border-t border-gray-100">Job location</div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="State" required>
                    <select value={state} onChange={e => { setState(e.target.value); setCity('') }} className={input()}>
                      <option value="">Select state...</option>
                      {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                    </select>
                  </Field>
                  <Field label="City" required error={errors.city}>
                    <select value={city} onChange={e => { setCity(e.target.value); setErrors(p => ({...p, city: ''})) }}
                      disabled={!state} className={input(errors.city)}>
                      <option value="">{!state ? 'Select state first' : citiesLoading ? 'Loading cities...' : 'Select city...'}</option>
                      {cities.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="__other__">Other (type below)</option>
                    </select>
                    {city === '__other__' && (
                      <input value={otherCity} onChange={e => setOtherCity(e.target.value)} placeholder="Type your city..." className={input() + ' mt-2'} />
                    )}
                  </Field>
                </div>
                <Field label="Zip code (optional)">
                  <input value={zip} onChange={e => setZip(e.target.value)} placeholder="33101" className={input() + ' max-w-xs'} />
                </Field>
                {errors.submit && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{errors.submit}</div>}
                <div className="flex gap-3 mt-2">
                  <button onClick={() => setStep(1)} className="px-5 py-3 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                    ← Back
                  </button>
                  <button onClick={handleSubmit} disabled={submitting}
                    className="flex-1 py-3 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                    {submitting ? 'Posting...' : 'Post my job'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 text-center mt-3">Your contact details are only shared with interested pros.</p>
              </>
            )}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <div className="text-sm font-semibold text-gray-700 mb-4">Tips for a great post</div>
            <ul className="space-y-3">
              {['Be specific about what needs doing', 'Include your timeline — urgent jobs get faster responses', 'Mention if materials need sourcing', 'Note any access requirements', 'Add your budget to filter serious enquiries'].map(tip => (
                <li key={tip} className="flex gap-3 text-sm text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-6">
            <div className="text-sm font-semibold text-gray-700 mb-4">Why ProGuild.ai?</div>
            {[['✓', 'Verified professionals', 'Background checked'],['★', 'Real reviews', 'From verified customers'],['0', 'Free to post', 'No fees ever']].map(([icon, title, sub]) => (
              <div key={title as string} className="flex gap-3 items-center py-3 border-b border-gray-100 last:border-0">
                <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center text-teal-700 text-sm font-semibold flex-shrink-0">{icon}</div>
                <div><div className="text-sm font-medium text-gray-700">{title}</div><div className="text-sm text-gray-400">{sub}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function input(error?: string) {
  return `w-full px-4 py-2.5 border rounded-lg text-sm text-gray-900 bg-stone-50 focus:outline-none focus:bg-white transition-colors ${
    error ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-teal-400'
  }`
}
