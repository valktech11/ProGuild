'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TradeCategory, Session } from '@/types'
import { US_STATES, fetchCitiesForState } from '@/lib/utils'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  teal:    '#0F766E',
  tealL:   '#14B8A6',
  tealD:   '#0A5F58',
  navy:    '#0A1628',
  navyM:   '#0F2137',
  cream:   '#F7F6F3',
  border:  '#E2DDD6',
  muted:   '#7C8A96',
  text:    '#0A1628',
  error:   '#DC2626',
  errorBg: '#FEF2F2',
}

// ── Animated background ───────────────────────────────────────────────────────
const HeroPanel = () => (
  <div className="hidden md:flex md:w-[46%] flex-col justify-between relative overflow-hidden"
    style={{ background: `linear-gradient(160deg, ${C.navy} 0%, #0B2A3E 50%, #0D4A44 100%)` }}>

    {/* Geometric texture */}
    <div style={{ position:'absolute', inset:0, opacity:0.04,
      backgroundImage:`repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.5) 39px,rgba(255,255,255,.5) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.5) 39px,rgba(255,255,255,.5) 40px)` }} />

    {/* Glow orbs */}
    <div style={{ position:'absolute', width:420, height:420, borderRadius:'50%', background:'radial-gradient(circle, rgba(15,118,110,0.18) 0%, transparent 70%)', top:-80, right:-80, pointerEvents:'none' }} />
    <div style={{ position:'absolute', width:320, height:320, borderRadius:'50%', background:'radial-gradient(circle, rgba(20,184,166,0.1) 0%, transparent 70%)', bottom:80, left:-60, pointerEvents:'none' }} />

    <div style={{ position:'relative', padding:'52px 48px', zIndex:1 }}>
      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:64 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(15,118,110,0.5)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <span style={{ color:'#fff', fontWeight:700, fontSize:20, letterSpacing:'-0.02em', fontFamily:'system-ui' }}>ProGuild.ai</span>
      </div>

      {/* Headline */}
      <div style={{ marginBottom:40 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(15,118,110,0.2)', border:'1px solid rgba(20,184,166,0.3)', borderRadius:100, padding:'4px 14px', marginBottom:20 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:C.tealL, boxShadow:`0 0 8px ${C.tealL}` }} />
          <span style={{ color:C.tealL, fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>Florida Contractors</span>
        </div>
        <h1 style={{ color:'#fff', fontSize:38, fontWeight:800, lineHeight:1.15, letterSpacing:'-0.03em', margin:0, fontFamily:'system-ui' }}>
          Your license is<br/>already waiting.
        </h1>
        <p style={{ color:'rgba(180,210,220,0.8)', fontSize:16, lineHeight:1.65, marginTop:16, maxWidth:340 }}>
          124,503 FL contractors pre-loaded from DBPR. Claim your verified profile and start receiving exclusive leads — no bidding, no sharing.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:40 }}>
        {[
          { n:'124,503', l:'FL pros verified' },
          { n:'$0', l:'per-lead fee. Ever.' },
          { n:'$49/mo', l:'flat rate, all tools' },
          { n:'1 lead', l:'per job. Not 4.' },
        ].map(s => (
          <div key={s.n} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 16px', backdropFilter:'blur(4px)' }}>
            <div style={{ color:'#fff', fontSize:20, fontWeight:800, letterSpacing:'-0.02em', fontFamily:'system-ui' }}>{s.n}</div>
            <div style={{ color:'rgba(180,210,220,0.65)', fontSize:12, marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Trust badges */}
      {[
        { icon:'🔐', t:'DBPR-Verified Profiles', s:'State license database' },
        { icon:'📋', t:'Full CRM Built In', s:'Estimates, invoices, pipeline' },
        { icon:'⚡', t:'Leads Arrive Instantly', s:'Direct to your dashboard' },
      ].map(f => (
        <div key={f.t} style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'rgba(15,118,110,0.2)', border:'1px solid rgba(20,184,166,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{f.icon}</div>
          <div>
            <div style={{ color:'#fff', fontSize:13, fontWeight:600, fontFamily:'system-ui' }}>{f.t}</div>
            <div style={{ color:'rgba(180,210,220,0.55)', fontSize:12 }}>{f.s}</div>
          </div>
        </div>
      ))}
    </div>

    {/* Bottom quote */}
    <div style={{ position:'relative', padding:'0 48px 40px', zIndex:1 }}>
      <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:24 }}>
        <p style={{ color:'rgba(180,210,220,0.5)', fontSize:12, margin:0 }}>&ldquo;Finally a CRM that understands roofing.&rdquo;</p>
        <p style={{ color:'rgba(180,210,220,0.35)', fontSize:11, marginTop:4 }}>— Tampa roofer, 14 years</p>
      </div>
    </div>
  </div>
)

// ── Floating input ────────────────────────────────────────────────────────────
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom:20 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:7, fontFamily:'system-ui' }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize:11, color:C.muted, marginTop:4 }}>{hint}</p>}
    </div>
  )
}

const inputStyle = (focused?: boolean): React.CSSProperties => ({
  width:'100%', padding:'12px 16px',
  border:`2px solid ${focused ? C.teal : C.border}`,
  borderRadius:10, background:'#fff', color:C.text,
  fontSize:14, outline:'none', boxSizing:'border-box',
  boxShadow: focused ? `0 0 0 4px rgba(15,118,110,0.08)` : 'none',
  transition:'all 0.15s',
})
const selectStyle = (focused?: boolean): React.CSSProperties => ({
  ...inputStyle(focused),
  appearance:'none', cursor:'pointer',
  backgroundImage:`url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 5L7 9L11 5' stroke='%237C8A96' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat:'no-repeat', backgroundPosition:'calc(100% - 14px) center',
  paddingRight:38,
})

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display:'flex', gap:6, marginBottom:32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          height:3, borderRadius:100, flex:1,
          background: i < step ? C.teal : i === step ? `linear-gradient(90deg, ${C.teal}, ${C.tealL})` : C.border,
          transition:'all 0.3s',
          opacity: i <= step ? 1 : 0.4,
        }} />
      ))}
    </div>
  )
}

// ── Login form ────────────────────────────────────────────────────────────────
function LoginForm({ onSwitchTab, router }: { onSwitchTab: () => void; router: any }) {
  const [email, setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [proName, setProName] = useState('')
  const [focused, setFocused] = useState(false)

  async function handleLogin() {
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address.'); return }
    setLoading(true); setError('')
    const r = await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email }) })
    const d = await r.json()
    setLoading(false)
    if (!r.ok) { setError(d.error || 'Something went wrong.'); return }
    sessionStorage.setItem('pg_pro', JSON.stringify(d.session))
    setProName(d.session.name.split(' ')[0])
    setSuccess(true)
    setTimeout(() => router.push('/dashboard'), 1200)
  }

  if (success) return (
    <div style={{ textAlign:'center', padding:'48px 0' }}>
      <div style={{ width:60, height:60, borderRadius:'50%', background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:`0 8px 24px rgba(15,118,110,0.35)` }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2 style={{ fontSize:24, fontWeight:800, color:C.text, margin:'0 0 8px', fontFamily:'system-ui' }}>Welcome back, {proName}!</h2>
      <p style={{ color:C.muted, fontSize:14 }}>Taking you to your dashboard…</p>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontSize:26, fontWeight:800, color:C.text, margin:'0 0 6px', letterSpacing:'-0.02em', fontFamily:'system-ui' }}>Welcome back</h2>
      <p style={{ color:C.muted, fontSize:14, margin:'0 0 32px', lineHeight:1.6 }}>Enter your email — we'll log you in instantly.</p>

      {error && (
        <div style={{ background:C.errorBg, border:`1px solid #FECACA`, borderRadius:10, padding:'12px 16px', marginBottom:20, color:C.error, fontSize:13, fontWeight:500 }}>
          {error}
        </div>
      )}

      <Field label="Email address">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="you@example.com"
          style={inputStyle(focused)} />
      </Field>

      <button onClick={handleLogin} disabled={loading} style={{
        width:'100%', padding:'14px', background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
        color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700,
        cursor: loading ? 'wait' : 'pointer', boxShadow:`0 4px 16px rgba(15,118,110,0.35)`,
        opacity: loading ? 0.7 : 1, transition:'all 0.15s', letterSpacing:'-0.01em',
        fontFamily:'system-ui',
      }}>
        {loading ? 'Checking…' : 'Continue to dashboard →'}
      </button>

      <p style={{ textAlign:'center', fontSize:13, color:C.muted, marginTop:24 }}>
        No account?{' '}
        <button onClick={onSwitchTab} style={{ color:C.teal, fontWeight:700, background:'none', border:'none', cursor:'pointer', fontSize:13 }}>
          Join as a pro →
        </button>
      </p>
    </div>
  )
}

// ── Signup form — 3 steps ─────────────────────────────────────────────────────
function SignupForm({ onSwitchTab, router }: { onSwitchTab: () => void; router: any }) {
  const [step, setStep] = useState(0) // 0: identity, 1: trade+location, 2: contact
  const [cats, setCats] = useState<TradeCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Fields
  const [fname, setFname] = useState('')
  const [lname, setLname] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [trade, setTrade] = useState('')
  const [stateVal, setStateVal] = useState('')
  const [city, setCity] = useState('')
  const [otherCity, setOtherCity] = useState('')
  const [yrs, setYrs] = useState('')
  const [cities, setCities] = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)

  // Focus states
  const [focused, setFocused] = useState<string | null>(null)
  const f = (name: string) => ({ onFocus: () => setFocused(name), onBlur: () => setFocused(null) })

  useEffect(() => { fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || [])) }, [])

  useEffect(() => {
    if (!stateVal) { setCities([]); return }
    setCitiesLoading(true); setCity('')
    fetchCitiesForState(stateVal).then(list => { setCities(list); setCitiesLoading(false) })
  }, [stateVal])

  function formatPhone(val: string) {
    const d = val.replace(/\D/g,'').slice(0,10)
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  }

  function validateStep(): string {
    if (step === 0) {
      if (!fname.trim()) return 'First name is required'
      if (!lname.trim()) return 'Last name is required'
      if (!email.trim() || !email.includes('@')) return 'Valid email is required'
    }
    if (step === 1) {
      if (!trade) return 'Please select your trade'
      if (!stateVal) return 'Please select your state'
      if (!city) return 'Please select your city'
    }
    if (step === 2) {
      if (!phone.trim()) return 'Phone number is required'
    }
    return ''
  }

  function handleNext() {
    setError('')
    const err = validateStep()
    if (err) { setError(err); return }
    setStep(s => s + 1)
  }

  async function handleSignup() {
    setError('')
    const err = validateStep()
    if (err) { setError(err); return }
    setLoading(true)
    const finalCity = city === '__other__' ? otherCity : city
    const r = await fetch('/api/pros', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ full_name:`${fname} ${lname}`, email, phone, trade_category_id:trade, state:stateVal, city:finalCity, years_experience:yrs ? parseInt(yrs) : undefined }),
    })
    const d = await r.json()
    setLoading(false)
    if (!r.ok) { setError(d.error || 'Could not create account.'); return }

    const selectedCat = cats.find(c => c.id === trade)
    sessionStorage.setItem('pg_pro', JSON.stringify({
      id:d.pro.id, name:d.pro.full_name, email:d.pro.email, plan:d.pro.plan_tier,
      trade:selectedCat?.category_name||null,
      trade_slug:d.pro.trade_slug || selectedCat?.slug || null,
      city:finalCity, state:stateVal, slug:null,
    }))
    setSuccess(true)
    setTimeout(() => router.push('/onboarding'), 1400)
  }

  if (success) return (
    <div style={{ textAlign:'center', padding:'48px 0' }}>
      <div style={{ width:60, height:60, borderRadius:'50%', background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', boxShadow:`0 8px 24px rgba(15,118,110,0.35)` }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2 style={{ fontSize:24, fontWeight:800, color:C.text, margin:'0 0 8px', fontFamily:'system-ui' }}>You're on ProGuild.ai!</h2>
      <p style={{ color:C.muted, fontSize:14 }}>Setting up your dashboard…</p>
    </div>
  )

  const stepLabels = ['Your identity', 'Your trade', 'Contact']
  const selectedTrade = cats.find(c => c.id === trade)

  return (
    <div>
      {/* Step header */}
      <div style={{ marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:11, fontWeight:700, color:C.teal, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui' }}>
            Step {step + 1} of 3 — {stepLabels[step]}
          </span>
          {step > 0 && (
            <button onClick={() => { setError(''); setStep(s => s - 1) }}
              style={{ fontSize:12, color:C.muted, background:'none', border:'none', cursor:'pointer', fontFamily:'system-ui' }}>
              ← Back
            </button>
          )}
        </div>
        <StepBar step={step} total={3} />
      </div>

      {/* Step title */}
      {step === 0 && <>
        <h2 style={{ fontSize:24, fontWeight:800, color:C.text, margin:'0 0 4px', letterSpacing:'-0.02em', fontFamily:'system-ui' }}>Claim your free profile</h2>
        <p style={{ color:C.muted, fontSize:13, margin:'0 0 28px', lineHeight:1.6 }}>Your FL license is already in our system. Takes 60 seconds.</p>
      </>}
      {step === 1 && <>
        <h2 style={{ fontSize:24, fontWeight:800, color:C.text, margin:'0 0 4px', letterSpacing:'-0.02em', fontFamily:'system-ui' }}>Your trade &amp; location</h2>
        <p style={{ color:C.muted, fontSize:13, margin:'0 0 28px', lineHeight:1.6 }}>We'll match you with homeowners in your area.</p>
      </>}
      {step === 2 && <>
        <h2 style={{ fontSize:24, fontWeight:800, color:C.text, margin:'0 0 4px', letterSpacing:'-0.02em', fontFamily:'system-ui' }}>Almost done, {fname}.</h2>
        <p style={{ color:C.muted, fontSize:13, margin:'0 0 28px', lineHeight:1.6 }}>Add your phone and we'll create your profile.</p>
      </>}

      {/* Error */}
      {error && (
        <div style={{ background:C.errorBg, border:`1px solid #FECACA`, borderRadius:10, padding:'11px 16px', marginBottom:20, color:C.error, fontSize:13, fontWeight:500 }}>
          {error}
        </div>
      )}

      {/* Step 0: Identity */}
      {step === 0 && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="First name">
              <input value={fname} onChange={e => setFname(e.target.value)} placeholder="James"
                style={inputStyle(focused==='fname')} {...f('fname')} />
            </Field>
            <Field label="Last name">
              <input value={lname} onChange={e => setLname(e.target.value)} placeholder="Harrington"
                style={inputStyle(focused==='lname')} {...f('lname')} />
            </Field>
          </div>
          <Field label="Email address">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle(focused==='email')} {...f('email')} />
          </Field>
        </div>
      )}

      {/* Step 1: Trade + Location */}
      {step === 1 && (
        <div>
          <Field label="Trade">
            <select value={trade} onChange={e => setTrade(e.target.value)}
              style={selectStyle(focused==='trade')} {...f('trade')}>
              <option value="">Select your trade…</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
            </select>
          </Field>
          {trade && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:`rgba(15,118,110,0.06)`, border:`1px solid rgba(15,118,110,0.15)`, borderRadius:8, marginTop:-8, marginBottom:20 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize:13, color:C.teal, fontWeight:600 }}>{selectedTrade?.category_name} selected</span>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="State">
              <select value={stateVal} onChange={e => { setStateVal(e.target.value); setCity('') }}
                style={selectStyle(focused==='state')} {...f('state')}>
                <option value="">State…</option>
                {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
              </select>
            </Field>
            <Field label="City">
              <select value={city} onChange={e => setCity(e.target.value)} disabled={!stateVal}
                style={{ ...selectStyle(focused==='city'), opacity: !stateVal ? 0.5 : 1 }} {...f('city')}>
                <option value="">{!stateVal ? 'State first…' : citiesLoading ? 'Loading…' : 'City…'}</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__other__">Other</option>
              </select>
            </Field>
          </div>
          {city === '__other__' && (
            <Field label="Your city">
              <input value={otherCity} onChange={e => setOtherCity(e.target.value)}
                placeholder="Type your city…" style={inputStyle(focused==='othercity')} {...f('othercity')} />
            </Field>
          )}
          <Field label="Years of experience (optional)">
            <input type="number" value={yrs} onChange={e => setYrs(e.target.value)}
              placeholder="e.g. 10" min="0" max="60" style={inputStyle(focused==='yrs')} {...f('yrs')} />
          </Field>
        </div>
      )}

      {/* Step 2: Phone */}
      {step === 2 && (
        <div>
          {/* Summary card */}
          <div style={{ background:C.cream, border:`1px solid ${C.border}`, borderRadius:12, padding:'16px 18px', marginBottom:24 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Your profile</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                { l:'Name', v:`${fname} ${lname}` },
                { l:'Email', v:email },
                { l:'Trade', v:selectedTrade?.category_name || '—' },
                { l:'Location', v:`${city === '__other__' ? otherCity : city}, ${stateVal}` },
              ].map(r => (
                <div key={r.l}>
                  <div style={{ fontSize:10, color:C.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{r.l}</div>
                  <div style={{ fontSize:13, color:C.text, fontWeight:600, marginTop:2 }}>{r.v}</div>
                </div>
              ))}
            </div>
          </div>

          <Field label="Mobile phone" hint="You'll get lead notifications here">
            <input type="tel" value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="(813) 555-0100" maxLength={14}
              style={inputStyle(focused==='phone')} {...f('phone')} />
          </Field>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={step < 2 ? handleNext : handleSignup}
        disabled={loading}
        style={{
          width:'100%', padding:'14px',
          background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
          color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700,
          cursor: loading ? 'wait' : 'pointer',
          boxShadow:`0 4px 16px rgba(15,118,110,0.35)`,
          opacity: loading ? 0.7 : 1, transition:'all 0.15s',
          letterSpacing:'-0.01em', fontFamily:'system-ui',
        }}>
        {loading ? 'Creating your profile…'
          : step === 0 ? 'Continue →'
          : step === 1 ? 'Almost done →'
          : 'Create my profile →'}
      </button>

      <p style={{ textAlign:'center', fontSize:13, color:C.muted, marginTop:20 }}>
        Already have an account?{' '}
        <button onClick={onSwitchTab} style={{ color:C.teal, fontWeight:700, background:'none', border:'none', cursor:'pointer', fontSize:13 }}>
          Log in →
        </button>
      </p>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────
function LoginPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [tab, setTab] = useState<'login' | 'signup'>(params.get('tab') === 'signup' ? 'signup' : 'login')

  useEffect(() => {
    if (sessionStorage.getItem('pg_pro')) router.replace('/dashboard')
  }, [])

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'row', fontFamily:'system-ui, -apple-system, sans-serif' }}>

      {/* Left hero */}
      <HeroPanel />

      {/* Right form */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#fff' }}>

        {/* Mobile top bar */}
        <div className="md:hidden" style={{ display:'flex', alignItems:'center', gap:10, padding:'24px 24px 0' }}>
          <div style={{ width:34, height:34, borderRadius:8, background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <span style={{ fontWeight:700, fontSize:17, color:C.navy }}>ProGuild.ai</span>
        </div>

        <main style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 32px' }}>
          <div style={{ width:'100%', maxWidth:400 }}>

            {/* Tab toggle */}
            <div style={{ display:'flex', background:C.cream, borderRadius:12, padding:4, marginBottom:36, border:`1px solid ${C.border}` }}>
              {(['login','signup'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex:1, padding:'10px 0', fontSize:14, fontWeight:700, borderRadius:9, border:'none',
                  cursor:'pointer', transition:'all 0.18s', fontFamily:'system-ui',
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? C.text : C.muted,
                  boxShadow: tab === t ? '0 1px 6px rgba(10,22,40,0.1)' : 'none',
                }}>
                  {t === 'login' ? 'Log in' : 'Join as pro'}
                </button>
              ))}
            </div>

            {tab === 'login'
              ? <LoginForm onSwitchTab={() => setTab('signup')} router={router} />
              : <SignupForm onSwitchTab={() => setTab('login')} router={router} />}

          </div>
        </main>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ color:C.muted, fontSize:14 }}>Loading…</div>
      </div>
    }>
      <LoginPageInner />
    </Suspense>
  )
}
