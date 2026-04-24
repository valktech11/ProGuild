'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <nav className="bg-white border-b border-gray-100 px-8 h-15 flex items-center justify-between">
        <Link href="/" className="font-serif text-xl text-gray-900">
          Trades<span className="text-teal-600">Network</span>
        </Link>
        <Link href="/" className="text-sm text-gray-400 hover:text-teal-600 transition-colors">← Back to search</Link>
      </nav>

      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <div className="w-full max-w-md">
          {/* Tab toggle */}
          <div className="flex bg-stone-100 rounded-xl p-1 mb-7">
            <button onClick={() => setTab('login')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${tab === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              Log in
            </button>
            <button onClick={() => setTab('signup')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${tab === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              Join as pro
            </button>
          </div>

          {tab === 'login' ? <LoginForm onSwitchTab={() => setTab('signup')} router={router} /> : <SignupForm onSwitchTab={() => setTab('login')} router={router} />}
        </div>
      </main>

      <footer className="text-center py-6 text-sm text-gray-400 border-t border-gray-100">
        © 2026 ProGuild.ai
      </footer>
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
    <div className="bg-white border border-gray-100 rounded-2xl p-8">
      {success ? (
        <div className="text-center py-6">
          <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-teal-700">✓</div>
          <h2 className="font-serif text-2xl text-gray-900 mb-2">Welcome back, {proName}!</h2>
          <p className="text-sm text-gray-400">Redirecting to your dashboard...</p>
        </div>
      ) : (
        <>
          <h1 className="font-serif text-2xl text-gray-900 mb-2">Welcome back</h1>
          <p className="text-sm text-gray-400 mb-7">Enter your email to access your pro dashboard.</p>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{error}</div>}
          <div className="mb-5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors" />
          </div>
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
            {loading ? 'Checking...' : 'Continue to dashboard'}
          </button>
          <p className="text-xs text-gray-400 text-center mt-4">
            No account? <button onClick={onSwitchTab} className="text-teal-600 font-medium">Join as a pro →</button>
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

    const session = {
      id: d.pro.id,
      name: d.pro.full_name,
      email: d.pro.email,
      plan: d.pro.plan_tier,
      trade: cats.find(c => c.id === trade)?.category_name || null,
      city: finalCity, state,
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
    <div className="bg-white border border-gray-100 rounded-2xl p-8">
      <h1 className="font-serif text-2xl text-gray-900 mb-2">Join as a pro</h1>
      <p className="text-sm text-gray-400 mb-6">Create your free profile and start receiving leads.</p>
      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{error}</div>}

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
        { label: 'Phone', value: phone, set: setPhone, placeholder: '(555) 000-0000', type: 'tel' },
      ].map(f => (
        <div key={f.label} className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{f.label}</label>
          <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className={inp()} />
        </div>
      ))}

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
        className="w-full py-3 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
        {loading ? 'Creating profile...' : 'Create my profile'}
      </button>
      <p className="text-xs text-gray-400 text-center mt-3">
        Already have an account? <button onClick={onSwitchTab} className="text-teal-600 font-medium">Log in →</button>
      </p>
    </div>
  )
}

function inp() {
  return 'w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-stone-50 focus:outline-none focus:border-teal-400 focus:bg-white transition-colors'
}
