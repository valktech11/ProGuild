'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TradeCategory, Session } from '@/types'
import { US_STATES, fetchCitiesForState } from '@/lib/utils'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import OAuthButtons from '@/components/auth/OAuthButtons'

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
        <h1 style={{ color:'#fff', fontSize:38, fontWeight:800, lineHeight:1.12, letterSpacing:'-0.03em', margin:0, fontFamily:'system-ui' }}>
          Claim your verified<br/>contractor profile.
        </h1>
        <p style={{ color:'rgba(180,210,220,0.8)', fontSize:16, lineHeight:1.6, marginTop:16, maxWidth:360 }}>
          Already preloaded from Florida DBPR records. Get found by homeowners in minutes.
        </p>
        {/* Trust pills — contractors scan, they don't read */}
        <div style={{ display:'flex', gap:20, flexWrap:'wrap', marginTop:22 }}>
          {[
            { t:'State verified', s:'DBPR records' },
            { t:'Secure & private', s:'Your data is protected' },
            { t:'You own your profile', s:'Claim only your business' },
          ].map(p => (
            <div key={p.t} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.tealL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><polyline points="20 6 9 17 4 12"/></svg>
              <div>
                <div style={{ color:'#fff', fontSize:12.5, fontWeight:600, lineHeight:1.2 }}>{p.t}</div>
                <div style={{ color:'rgba(180,210,220,0.55)', fontSize:11 }}>{p.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:36 }}>
        {[
          { n:'124,503', l:'Licensed Florida contractors' },
          { n:'$0', l:'Per-lead fee. Ever.' },
          { n:'$49/mo', l:'Flat rate, all tools included' },
          { n:'1st lead', l:'Pays for your subscription' },
        ].map(s => (
          <div key={s.n} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'14px 16px', backdropFilter:'blur(4px)' }}>
            <div style={{ color:'#fff', fontSize:20, fontWeight:800, letterSpacing:'-0.02em', fontFamily:'system-ui' }}>{s.n}</div>
            <div style={{ color:'rgba(180,210,220,0.65)', fontSize:12, marginTop:2, lineHeight:1.35 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Benefits — outcomes, not features */}
      {[
        { icon:'🔎', t:'Get found by homeowners', s:'Appear in local searches and ProGuild listings' },
        { icon:'📄', t:'Send estimates in minutes', s:'Custom proposals, invoices, and contracts built in' },
        { icon:'📱', t:'Manage jobs from your phone', s:'Track leads, messages & updates on the go' },
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
      <label style={{ display:'block', fontSize:11.5, fontWeight:700, color:'#33414E', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:7, fontFamily:'system-ui' }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize:11.5, color:'#5A6775', marginTop:5 }}>{hint}</p>}
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
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [focused, setFocused]   = useState<string | null>(null)

  async function handleLogin() {
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address.'); return }
    if (!password) { setError('Please enter your password.'); return }
    setLoading(true); setError(''); setResetMsg('')

    const supabase = getSupabaseBrowser()
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (signInErr) {
      setLoading(false)
      const m = signInErr.message.toLowerCase()
      if (m.includes('invalid')) setError('Incorrect email or password.')
      else if (m.includes('not confirmed')) setError('Please confirm your email first.')
      else setError(signInErr.message)
      return
    }

    // Session is now set. Route through callback resolver for consistent routing.
    router.push('/auth/callback')
  }

  async function handleForgotPassword() {
    if (!email.trim() || !email.includes('@')) {
      setError('Enter your email above first, then tap "Forgot password".')
      return
    }
    setError(''); setResetMsg('')
    const supabase = getSupabaseBrowser()
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/reset` }
    )
    if (resetErr) { setError(resetErr.message); return }
    setResetMsg('Check your email for a password reset link.')
  }

  return (
    <div>
      <h2 style={{ fontSize:26, fontWeight:800, color:C.text, margin:'0 0 6px', letterSpacing:'-0.02em', fontFamily:'system-ui' }}>Welcome back</h2>
      <p style={{ color:C.muted, fontSize:14, margin:'0 0 28px', lineHeight:1.6 }}>Log in to your ProGuild account.</p>

      {/* OAuth (Google / Apple) + divider */}
      <OAuthButtons mode="login" />

      {error && (
        <div style={{ background:C.errorBg, border:`1px solid #FECACA`, borderRadius:10, padding:'12px 16px', marginBottom:20, color:C.error, fontSize:13, fontWeight:500 }}>
          {error}
        </div>
      )}
      {resetMsg && (
        <div style={{ background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:10, padding:'12px 16px', marginBottom:20, color:'#047857', fontSize:13, fontWeight:500 }}>
          {resetMsg}
        </div>
      )}

      <Field label="Email address">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
          placeholder="you@example.com"
          style={inputStyle(focused === 'email')} />
      </Field>

      <Field label="Password">
        <div style={{ position:'relative' }}>
          <input type={showPw ? 'text' : 'password'} value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
            placeholder="Your password"
            style={{ ...inputStyle(focused === 'password'), paddingRight:44 }} />
          <button type="button" onClick={() => setShowPw(s => !s)}
            style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:C.muted, fontSize:12, fontWeight:600, padding:0 }}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>

      <div style={{ textAlign:'right', marginTop:-8, marginBottom:20 }}>
        <button type="button" onClick={handleForgotPassword}
          style={{ background:'none', border:'none', color:C.teal, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'system-ui' }}>
          Forgot password?
        </button>
      </div>

      <button onClick={handleLogin} disabled={loading} style={{
        width:'100%', padding:'14px', background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
        color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700,
        cursor: loading ? 'wait' : 'pointer', boxShadow:`0 4px 16px rgba(15,118,110,0.35)`,
        opacity: loading ? 0.7 : 1, transition:'all 0.15s', letterSpacing:'-0.01em',
        fontFamily:'system-ui',
      }}>
        {loading ? 'Signing in…' : 'Log in →'}
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
  const params = useSearchParams()
  const claimId = params.get('claim') || ''
  const isClaiming = !!claimId

  const [step, setStep] = useState(0) // 0: identity, 1: trade+location, 2: contact
  const [cats, setCats] = useState<TradeCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Fields
  const [fname, setFname] = useState('')
  const [lname, setLname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [trade, setTrade] = useState('')
  const [stateVal, setStateVal] = useState('')
  const [city, setCity] = useState('')
  const [otherCity, setOtherCity] = useState('')
  const [yrs, setYrs] = useState('')
  const [cities, setCities] = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)

  // Claim mode — license verification + the profile being claimed
  const [claimName, setClaimName] = useState('')
  const [claimLicense, setClaimLicense] = useState('')
  const [claimExpiry, setClaimExpiry] = useState('')

  // Focus states
  const [focused, setFocused] = useState<string | null>(null)
  const f = (name: string) => ({ onFocus: () => setFocused(name), onBlur: () => setFocused(null) })

  useEffect(() => { fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || [])) }, [])

  // Claim mode: fetch the pre-built DBPR profile and pre-fill what we know.
  useEffect(() => {
    if (!claimId) return
    fetch(`/api/pros/${claimId}`)
      .then(r => r.json())
      .then(d => {
        const p = d.pro
        if (!p) return
        if (p.is_claimed) { router.replace('/login'); return }  // already claimed
        setClaimName(p.full_name || '')
        const parts = (p.full_name || '').trim().split(/\s+/)
        setFname(parts[0] || '')
        setLname(parts.length > 1 ? parts.slice(1).join(' ') : '')
        if (p.trade_category_id) setTrade(p.trade_category_id)
        if (p.state) setStateVal(p.state)
        if (p.license_number) setClaimLicense(p.license_number)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId])

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
      if (!password || password.length < 8) return 'Password must be at least 8 characters'
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

    const r = await fetch('/api/auth/signup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        email,
        password,
        full_name:`${fname} ${lname}`,
        phone,
        trade_category_id:trade,
        state:stateVal,
        city:finalCity,
        years_experience:yrs ? parseInt(yrs) : undefined,
        ...(isClaiming ? {
          claim_pro_id: claimId,
          claim_license: claimLicense.trim() || null,
          claim_license_expiry: claimExpiry || null,
        } : {}),
      }),
    })
    const d = await r.json()
    if (!r.ok) { setLoading(false); setError(d.error || 'Could not create account.'); return }

    // Account created on the server. Now establish a real browser session.
    const supabase = getSupabaseBrowser()
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    setLoading(false)
    if (signInErr) {
      // Account exists but auto-login failed — send them to login
      setError('Account created. Please log in.')
      onSwitchTab()
      return
    }

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
        {isClaiming && claimName ? (
          <>
            {/* License-found success banner — "claim an asset", not "fill a form" */}
            {claimLicense && (
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:'rgba(15,118,110,0.06)', border:`1px solid rgba(15,118,110,0.18)`, marginBottom:20 }}>
                <span style={{ flexShrink:0, width:32, height:32, borderRadius:'50%', background:'rgba(15,118,110,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 9.5 11 14.5 8 11.5"/></svg>
                </span>
                <div style={{ lineHeight:1.35 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.teal }}>Florida License Found</div>
                  <div style={{ fontSize:12.5, color:C.muted }}><span style={{ fontWeight:600, color:C.text }}>{claimLicense}</span> has been matched to your business.</div>
                </div>
              </div>
            )}
            {/* Avatar + welcome — makes ownership feel real */}
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24 }}>
              <div style={{ flexShrink:0, width:52, height:52, borderRadius:'50%', background:'#D7EFE9', color:'#0A5F58', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:18, fontFamily:'system-ui' }}>
                {claimName.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize:23, fontWeight:800, color:C.text, margin:0, letterSpacing:'-0.02em', fontFamily:'system-ui' }}>Welcome, {claimName.split(' ')[0]}</h2>
                <p style={{ color:C.muted, fontSize:13, margin:'2px 0 0', lineHeight:1.5, maxWidth:340 }}>This profile was created from state records. Claim ownership to unlock it.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize:24, fontWeight:800, color:C.text, margin:'0 0 4px', letterSpacing:'-0.02em', fontFamily:'system-ui' }}>Claim your free profile</h2>
            <p style={{ color:C.muted, fontSize:13, margin:'0 0 28px', lineHeight:1.6 }}>Your FL license is already in our system. Takes 60 seconds.</p>
          </>
        )}
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
          {/* OAuth — generic signup only; claiming ties to the license, so email/password */}
          {!isClaiming && <OAuthButtons mode="signup" />}
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

          {/* Claim verification — framed as confirmation, not a form to fill */}
          {isClaiming && (
            <div style={{ padding:'16px', borderRadius:12, background:'rgba(15,118,110,0.04)', border:`1px solid rgba(15,118,110,0.12)`, marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <span style={{ flexShrink:0, width:24, height:24, borderRadius:'50%', background:C.teal, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <div>
                  <div style={{ fontSize:13.5, fontWeight:700, color:C.text, fontFamily:'system-ui' }}>We found your license</div>
                  <div style={{ fontSize:12, color:C.muted }}>Confirm the details to claim this profile.</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:7 }}>License #</label>
                  <input value={claimLicense} onChange={e => setClaimLicense(e.target.value)} placeholder="CGC059304"
                    style={inputStyle(focused==='lic')} {...f('lic')} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.text, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:7 }}>Expiration date</label>
                  <input type="date" value={claimExpiry} onChange={e => setClaimExpiry(e.target.value)}
                    style={inputStyle(focused==='exp')} {...f('exp')} />
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3z"/><path d="m9 12 2 2 4-4"/></svg>
                <span style={{ fontSize:11.5, color:C.muted }}>Matches Florida DBPR records. You can still claim and verify later.</span>
              </div>
            </div>
          )}

          <Field label="Email address">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle(focused==='email')} {...f('email')} />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Create a password"
              style={inputStyle(focused==='password')} {...f('password')} />
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
        {loading ? (isClaiming ? 'Claiming your profile…' : 'Creating your profile…')
          : step === 0 ? 'Continue →'
          : step === 1 ? 'Almost done →'
          : isClaiming ? '🔒 Claim my profile →'
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
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
    })
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
