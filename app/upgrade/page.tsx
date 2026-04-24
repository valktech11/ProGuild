'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Session } from '@/types'

const PLANS = {
  pro:   { label: 'Pro',   founding: 19, regular: 29, annualFounding: 190, annualRegular: 290, color: 'teal',   badge: 'Most popular' },
  elite: { label: 'Elite', founding: 39, regular: 59, annualFounding: 390, annualRegular: 590, color: 'purple', badge: 'Best value'    },
}

const PRO_FEATURES   = ['Unlimited leads + contact details','Email lead notifications','Pro badge on profile','Priority search placement','Up to 10 job applications/month','Review request reminders']
const ELITE_FEATURES = ['Everything in Pro','Featured listing — pinned at top','Verified Elite badge','Unlimited job applications','Profile analytics dashboard','SMS lead notifications','First look on new job posts','Dedicated support']

export default function UpgradePage() {
  const [annual, setAnnual] = useState(false)
  const [spots, setSpots]   = useState(73)
  const [session, setSession] = useState<Session | null>(null)
  const [modal, setModal]   = useState<'pro' | 'elite' | null>(null)
  const [name, setName]     = useState('')
  const [card, setCard]     = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc]       = useState('')
  const [paying, setPaying]  = useState(false)
  const [done, setDone]     = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (raw) { const s = JSON.parse(raw); setSession(s) }
    const interval = setInterval(() => setSpots(s => Math.random() < 0.08 && s > 40 ? s - 1 : s), 9000)
    return () => clearInterval(interval)
  }, [])

  async function pay() {
    if (!session) { window.location.href = '/login'; return }
    const plan = modal === 'pro'
      ? (annual ? 'Pro_Founding_Annual' : 'Pro_Founding')
      : (annual ? 'Elite_Founding_Annual' : 'Elite_Founding')
    setPaying(true)
    const r = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, plan_tier: plan }),
    })
    const d = await r.json()
    setPaying(false)
    if (r.ok && d.url) {
      window.location.href = d.url
    } else {
      alert(d.error || 'Could not start checkout. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="bg-white border-b border-gray-100 px-8 h-[60px] flex items-center justify-between">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-teal-600 transition-colors">← Back to dashboard</Link>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-14">
        {/* Header */}
        <div className="text-center mb-6">
          <span className="inline-block text-xs font-semibold tracking-widest uppercase text-teal-600 bg-teal-50 px-3 py-1 rounded-full mb-4">Simple pricing · No contracts</span>
          <h1 className="font-serif text-4xl text-gray-900 mb-3">Grow your trades business</h1>
          <p className="text-gray-400 font-light max-w-lg mx-auto leading-relaxed">One job from ProGuild.ai pays for months of your subscription. Start free, upgrade when ready.</p>
        </div>

        {/* Founding banner */}
        <div className="max-w-2xl mx-auto mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-4">
          <span className="text-2xl flex-shrink-0">⭐</span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-800 mb-0.5">Founding member pricing — locked in forever</div>
            <div className="text-xs text-amber-700">Join now and pay your founding price for life. Price never increases for founding members.</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-serif text-3xl text-amber-600">{spots}</div>
            <div className="text-xs text-amber-700 font-medium">spots left</div>
          </div>
        </div>

        {/* Annual toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-sm ${!annual ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>Monthly</span>
          <button onClick={() => setAnnual(a => !a)}
            className={`w-11 h-6 rounded-full transition-colors relative ${annual ? 'bg-teal-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${annual ? 'translate-x-5' : ''}`} />
          </button>
          <span className={`text-sm ${annual ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>Annual</span>
          {annual && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Save 2 months</span>}
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
          {/* Free */}
          <div className="bg-white border border-gray-100 rounded-2xl p-7 flex flex-col">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Free</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-serif text-4xl text-gray-900">$0</span>
              <span className="text-sm text-gray-400">/ month</span>
            </div>
            <p className="text-xs text-gray-400 mb-5 leading-relaxed">Get discovered. Build your presence and collect your first reviews.</p>
            <div className="border-t border-gray-100 pt-5 mb-6 flex-1">
              {['Public profile listing','Up to 2 leads visible','Collect reviews','Basic search placement'].map(f => (
                <div key={f} className="flex gap-2 text-xs text-gray-500 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-teal-500">✓</span>{f}
                </div>
              ))}
              {['Full lead contact details','Lead notifications','Pro badge'].map(f => (
                <div key={f} className="flex gap-2 text-xs text-gray-300 py-2 border-b border-gray-50 last:border-0 line-through">
                  <span>✗</span>{f}
                </div>
              ))}
            </div>
            <Link href="/dashboard" className="block w-full py-2.5 text-center text-sm font-medium border border-gray-200 text-gray-400 rounded-xl">Current plan</Link>
          </div>

          {/* Pro */}
          <div className="bg-white border-2 border-teal-400 rounded-2xl p-7 flex flex-col relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-xs font-semibold px-4 py-1 rounded-full">Most popular</div>
            <div className="text-xs font-semibold text-teal-700 uppercase tracking-widest mb-4">Pro</div>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-serif text-4xl text-gray-900">${annual ? Math.round(PLANS.pro.annualFounding/12) : PLANS.pro.founding}</span>
              <span className="text-sm text-gray-400">/ {annual ? 'mo billed yearly' : 'month'}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Founding</span>
            </div>
            <div className="text-xs text-gray-400 mb-4">Regular ${annual ? PLANS.pro.annualRegular : PLANS.pro.regular}{annual ? '/yr' : '/mo'}</div>
            <p className="text-xs text-gray-400 mb-5 leading-relaxed">Full leads, priority placement, and Pro visibility.</p>
            <div className="border-t border-gray-100 pt-5 mb-6 flex-1">
              {PRO_FEATURES.map(f => (
                <div key={f} className="flex gap-2 text-xs text-gray-600 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-teal-500 font-semibold">✓</span>{f}
                </div>
              ))}
            </div>
            <button onClick={() => setModal('pro')} className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              Get Pro →
            </button>
          </div>

          {/* Elite */}
          <div className="bg-white border-2 border-purple-400 rounded-2xl p-7 flex flex-col relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-semibold px-4 py-1 rounded-full">Best value</div>
            <div className="text-xs font-semibold text-purple-700 uppercase tracking-widest mb-4">Elite</div>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-serif text-4xl text-gray-900">${annual ? Math.round(PLANS.elite.annualFounding/12) : PLANS.elite.founding}</span>
              <span className="text-sm text-gray-400">/ {annual ? 'mo billed yearly' : 'month'}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Founding</span>
            </div>
            <div className="text-xs text-gray-400 mb-4">Regular ${annual ? PLANS.elite.annualRegular : PLANS.elite.regular}{annual ? '/yr' : '/mo'}</div>
            <p className="text-xs text-gray-400 mb-5 leading-relaxed">Dominate your trade category with featured placement and analytics.</p>
            <div className="border-t border-gray-100 pt-5 mb-6 flex-1">
              {ELITE_FEATURES.map(f => (
                <div key={f} className="flex gap-2 text-xs text-gray-600 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-purple-500 font-semibold">✓</span>{f}
                </div>
              ))}
            </div>
            <button onClick={() => setModal('elite')} className="w-full py-3 bg-purple-600 text-white text-sm font-semibold rounded-xl hover:bg-purple-700 transition-colors">
              Get Elite →
            </button>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-xl mx-auto">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-5">Frequently asked questions</div>
          {[
            ['Is the founding member price really locked forever?', 'Yes — 100%. Your price never increases as long as you remain subscribed.'],
            ['Can I cancel anytime?', 'Absolutely. Cancel with one click from your dashboard, no questions asked.'],
            ['What is the featured listing?', 'Elite members are pinned to the top of search results for their trade in their city.'],
            ['Do homeowners pay anything?', 'Never. Posting jobs and contacting pros is completely free for homeowners.'],
          ].map(([q, a]) => (
            <details key={q as string} className="border-b border-gray-100 py-4 group">
              <summary className="text-sm font-semibold text-gray-800 cursor-pointer list-none flex justify-between items-center">
                {q}<span className="text-gray-400 group-open:rotate-45 transition-transform text-lg font-light">+</span>
              </summary>
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Payment modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
            {done ? (
              <div className="text-center py-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-semibold ${modal === 'pro' ? 'bg-teal-50 text-teal-700' : 'bg-purple-50 text-purple-700'}`}>✓</div>
                <h3 className="font-serif text-2xl text-gray-900 mb-2">You're now {modal === 'pro' ? 'Pro' : 'Elite'}!</h3>
                <p className="text-sm text-gray-400 mb-6">Your founding rate is locked in. Welcome to the inner circle.</p>
                <Link href="/dashboard" className={`inline-block px-6 py-2.5 text-sm font-semibold text-white rounded-lg ${modal === 'pro' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                  Go to dashboard →
                </Link>
              </div>
            ) : (
              <>
                <button onClick={() => setModal(null)} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 text-sm">✕</button>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full mb-3 inline-block ${modal === 'pro' ? 'bg-teal-50 text-teal-700' : 'bg-purple-50 text-purple-700'}`}>{modal === 'pro' ? 'Pro' : 'Elite'}</span>
                <h2 className="font-serif text-2xl text-gray-900 mb-1">Upgrade to {modal === 'pro' ? 'Pro' : 'Elite'}</h2>
                <p className="text-sm text-gray-400 mb-4">Founding member rate — locked in forever.</p>
                <div className={`flex items-baseline gap-2 p-4 rounded-xl mb-4 ${modal === 'pro' ? 'bg-teal-50' : 'bg-purple-50'}`}>
                  <span className="font-serif text-3xl text-gray-900">${annual ? Math.round((modal === 'pro' ? PLANS.pro : PLANS.elite).annualFounding/12) : (modal === 'pro' ? PLANS.pro : PLANS.elite).founding}</span>
                  <span className="text-sm text-gray-400">/ {annual ? 'mo billed annually' : 'month'}</span>
                  <span className="text-xs text-gray-400 ml-auto">Regular ${annual ? (modal === 'pro' ? PLANS.pro : PLANS.elite).annualRegular : (modal === 'pro' ? PLANS.pro : PLANS.elite).regular}{annual ? '/yr' : '/mo'}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800 font-medium">
                  ⚠ Demo mode — no real charge. Stripe integration coming soon.
                </div>
                <div className="flex gap-2 mb-4">
                  {['VISA','MC','AMEX','DISC'].map(c => <span key={c} className="text-xs font-semibold bg-gray-100 px-2 py-1 rounded text-gray-500">{c}</span>)}
                </div>
                {[
                  { label: 'Name on card', value: name, set: setName, placeholder: 'James Harrington', type: 'text' },
                  { label: 'Card number', value: card, set: (v: string) => setCard(v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim()), placeholder: '4242 4242 4242 4242', type: 'text', maxLength: 19 },
                ].map(f => (
                  <div key={f.label} className="mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{f.label}</label>
                    <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} maxLength={(f as any).maxLength}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {[
                    { label: 'Expiry', value: expiry, set: (v: string) => { const d = v.replace(/\D/g,'').slice(0,4); setExpiry(d.length >= 3 ? d.slice(0,2)+' / '+d.slice(2) : d) }, placeholder: 'MM / YY' },
                    { label: 'CVC', value: cvc, set: setCvc, placeholder: '123' },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{f.label}</label>
                      <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} maxLength={7}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 transition-colors" />
                    </div>
                  ))}
                </div>
                <button onClick={pay} disabled={paying}
                  className={`w-full py-3 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 ${modal === 'pro' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                  {paying ? 'Processing...' : `Activate ${modal === 'pro' ? 'Pro' : 'Elite'}`}
                </button>
                <p className="text-xs text-gray-400 text-center mt-3">Secured by Stripe · Cancel anytime</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
export const dynamic = 'force-dynamic'
