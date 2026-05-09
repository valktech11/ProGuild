'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TradeCategory, Session } from '@/types'
import { US_STATES, fetchCitiesForState } from '@/lib/utils'

function LoginPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [tab, setTab] = useState<'login' | 'signup'>(params.get('tab') === 'signup' ? 'signup' : 'login')

  // Redirect if already logged in
  useEffect(() => {
    if (sessionStorage.getItem('pg_pro')) router.replace('/dashboard')
  }, [])

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* Left hero panel — desktop only */}
      <div className="hidden md:flex md:w-[45%] flex-col justify-between p-12"
        style={{ background: 'linear-gradient(160deg, #0A1628 0%, #0F3D38 60%, #0F766E 100%)' }}>
        <div>
          {/* Logo mark */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#0F766E' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">ProGuild.ai</span>
          </div>
          {/* Headline */}
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Your CRM for<br/>winning more jobs
          </h1>
          <p className="text-teal-200 text-lg leading-relaxed mb-10">
            Manage leads, send estimates, and collect payment — all in one place built for trade pros.
          </p>
          {/* Feature bullets */}
          {[
            'Pipeline & lead tracking',
            'Professional estimates & invoices',
            'Review management',
          ].map(f => (
            <div key={f} className="flex items-center gap-3 mb-4">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(20,184,166,0.25)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <span className="text-teal-100 text-base">{f}</span>
            </div>
          ))}
        </div>
        <p className="text-teal-300 text-sm opacity-60">© 2026 ProGuild.ai</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-2 px-6 pt-8 pb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0F766E' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">ProGuild.ai</span>
        </div>

        <main className="flex-1 flex items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-sm">
            {/* Tab toggle */}
            <div className="flex rounded-xl p-1 mb-8" style={{ background: '#F1F5F9' }}>
              <button onClick={() => setTab('login')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Log in
              </button>
              <button onClick={() => setTab('signup')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${tab === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Join as pro
              </button>
            </div>

            {tab === 'login' ? <LoginForm onSwitchTab={() => setTab('signup')} router={router} /> : <SignupForm onSwitchTab={() => setTab('login')} router={router} />}
          </div>
        </main>
      </div>
    </div>
  )
}


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginForm({ onSwitchTab, router }: { onSwitchTab: () => void; router: any }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [proName, setProName] = useState('')

  async function handleLogin() {
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address.'); return }
    setLoading(true); setError('')
    const r = await fetch('/api/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const d = await r.json()
    setLoading(false)
    if (!r.ok) { setError(d.error || 'Something went wrong.'); return }
    sessionStorage.setItem('pg_pro', JSON.stringify(d.session))
    setProName(d.session.name.split(' ')[0])
    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 1200)
  }

  return (
    <div>
      {success ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#F0FDFA' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back, {proName}!</h2>
          <p className="text-sm text-gray-400">Redirecting to your dashboard...</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
          <p className="text-sm text-gray-500 mb-7">Enter your email to access your dashboard.</p>
          {error && <div className="mb-5 p-3 rounded-xl text-sm font-medium" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>{error}</div>}
          <div className="mb-5">
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-2">Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com"
              className="w-full px-4 py-3.5 text-sm text-gray-900 rounded-xl transition-all outline-none"
              style={{ border: '2px solid #CBD5E1', background: 'white' }}
              onFocus={e => (e.target.style.borderColor = '#0F766E')}
              onBlur={e => (e.target.style.borderColor = '#CBD5E1')} />
          </div>
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-3.5 text-sm font-bold text-white rounded-xl transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)', boxShadow: '0 4px 14px rgba(15,118,110,0.35)' }}>
            {loading ? 'Checking...' : 'Continue to dashboard →'}
          </button>
          <p className="text-xs text-gray-400 text-center mt-5">
            No account? <button onClick={onSwitchTab} className="font-semibold" style={{ color: '#0F766E' }}>Join as a pro →</button>
          </p>
        </>
      )}
    </div>
  )
}

function SignupForm({ onSwitchTab, router }: { onSwitchTab: () => void; router: any }) {
  const [cats, setCats] = useState<TradeCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [fname, setFname] = useState('')
  const [lname, setLname] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [trade, setTrade] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [otherCity, setOtherCity] = useState('')
  const [yrs, setYrs] = useState('')

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || []))
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

  function formatPhone(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  }

  async function handleSignup() {
    if (!fname || !lname || !email || !phone || !trade || !city) {
      setError('Please fill in all required fields.'); return
    }
    if (!email.includes('@')) { setError('Please enter a valid email address.'); return }
    setLoading(true); setError('')

    const finalCity = city === '__other__' ? otherCity : city

    const r = await fetch('/api/pros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: `${fname} ${lname}`,
        email, phone,
        trade_category_id: trade,
        state, city: finalCity,
        years_experience: yrs ? parseInt(yrs) : undefined,
      }),
    })
    const d = await r.json()
    setLoading(false)
    if (!r.ok) { setError(d.error || 'Could not create account.'); return }

    const selectedCat = cats.find(c => c.id === trade)
    const session = {
      id: d.pro.id,
      name: d.pro.full_name,
      email: d.pro.email,
      plan: d.pro.plan_tier,
      trade:      selectedCat?.category_name || null,
      trade_slug: selectedCat?.slug || null,
      city: finalCity, state,
      slug: null,
    }
    sessionStorage.setItem('pg_pro', JSON.stringify(session))
    setSuccess(true)
    setTimeout(() => router.push('/onboarding'), 1400)
  }

  if (success) return (
    <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
      <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-teal-700">✓</div>
      <h2 className="font-serif text-2xl text-gray-900 mb-2">You're on ProGuild.ai!</h2>
      <p className="text-sm text-gray-400">Redirecting to your dashboard...</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Join as a pro</h1>
      <p className="text-sm text-gray-500 mb-6">Create your free profile and start receiving leads.</p>
      {error && <div className="mb-4 p-3 rounded-xl text-sm font-medium" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>{error}</div>}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">First name</label>
          <input value={fname} onChange={e => setFname(e.target.value)} placeholder="James" className={inp()} />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Last name</label>
          <input value={lname} onChange={e => setLname(e.target.value)} placeholder="Harrington" className={inp()} />
        </div>
      </div>

      {[
        { label: 'Email', value: email, set: setEmail, placeholder: 'you@example.com', type: 'email' },
      ].map(f => (
        <div key={f.label} className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
          <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className={inp()} />
        </div>
      ))}

      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Phone</label>
        <input type="tel" value={phone}
          onChange={e => setPhone(formatPhone(e.target.value))}
          placeholder="(555) 000-0000"
          maxLength={14}
          className={inp()} />
        <p className="text-[11px] text-gray-400 mt-1">Format: (xxx) xxx-xxxx</p>
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Trade</label>
        <select value={trade} onChange={e => setTrade(e.target.value)} className={inp()}>
          <option value="">Select your trade...</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
        </select>
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">State</label>
        <select value={state} onChange={e => { setState(e.target.value); setCity('') }} className={inp()}>
          <option value="">Select state...</option>
          {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
        </select>
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">City</label>
        <select value={city} onChange={e => setCity(e.target.value)} disabled={!state} className={inp()}>
          <option value="">{!state ? 'Select state first' : citiesLoading ? 'Loading cities...' : 'Select city...'}</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__other__">Other (type below)</option>
        </select>
        {city === '__other__' && (
          <input value={otherCity} onChange={e => setOtherCity(e.target.value)} placeholder="Type your city..." className={inp() + ' mt-2'} />
        )}
      </div>

      <div className="mb-6">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Years of experience</label>
        <input type="number" value={yrs} onChange={e => setYrs(e.target.value)} placeholder="e.g. 10" min="0" max="60" className={inp()} />
      </div>

      <button onClick={handleSignup} disabled={loading}
        className="w-full py-3.5 text-sm font-bold text-white rounded-xl transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)', boxShadow: '0 4px 14px rgba(15,118,110,0.35)' }}>
        {loading ? 'Creating profile...' : 'Create my profile'}
      </button>
      <p className="text-xs text-gray-400 text-center mt-4">
        Already have an account? <button onClick={onSwitchTab} className="font-semibold" style={{ color: '#0F766E' }}>Log in →</button>
      </p>
    </div>
  )
}

function inp() {
  return 'w-full px-4 py-3 border-2 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none transition-all bg-white'
  + ' focus:border-teal-600'
  + ' [border-color:#CBD5E1]'
}
