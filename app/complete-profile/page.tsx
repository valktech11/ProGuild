// app/complete-profile/page.tsx
// Where a newly-authenticated user with NO pros record lands (e.g. signed up with Google).
// Collects the same business questions as form signup Steps 1-2 (trade, state, city,
// phone, years), then creates their pros record linked to their auth identity.

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { TradeCategory } from '@/types'
import { US_STATES, fetchCitiesForState } from '@/lib/utils'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

const C = {
  teal: '#0F766E', tealL: '#14B8A6', navy: '#0A1628',
  border: '#E2DDD6', muted: '#7C8A96', text: '#0A1628',
  error: '#DC2626', errorBg: '#FEF2F2',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:7 }}>{label}</label>
      {children}
    </div>
  )
}

const selectStyle = (focused?: boolean): React.CSSProperties => ({
  width:'100%', padding:'12px 16px', border:`2px solid ${focused ? C.teal : C.border}`,
  borderRadius:10, background:'#fff', color:C.text, fontSize:14, outline:'none',
  boxSizing:'border-box', cursor:'pointer', appearance:'none',
})
const inputStyle = (focused?: boolean): React.CSSProperties => ({
  width:'100%', padding:'12px 16px', border:`2px solid ${focused ? C.teal : C.border}`,
  borderRadius:10, background:'#fff', color:C.text, fontSize:14, outline:'none', boxSizing:'border-box',
})

function CompleteProfileInner() {
  const router = useRouter()

  const [checking, setChecking]   = useState(true)
  const [token, setToken]         = useState<string | null>(null)
  const [greetingName, setGreetingName] = useState('')

  const [cats, setCats]           = useState<TradeCategory[]>([])
  const [trade, setTrade]         = useState('')
  const [stateVal, setStateVal]   = useState('')
  const [city, setCity]           = useState('')
  const [cities, setCities]       = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [otherCity, setOtherCity] = useState('')
  const [phone, setPhone]         = useState('')
  const [yrs, setYrs]             = useState('')

  const [focused, setFocused]     = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)

  // Verify the user is authenticated; if they already have a profile, bounce to dashboard.
  useEffect(() => {
    async function check() {
      const supabase = getSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }
      setToken(session.access_token)
      setGreetingName(
        (session.user.user_metadata?.full_name as string) ||
        (session.user.user_metadata?.name as string) ||
        session.user.email?.split('@')[0] || ''
      )
      // If they already have a pros record, skip this page
      try {
        const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const d = await r.json()
        if (r.ok && d.session) { router.replace('/dashboard'); return }
      } catch {}
      setChecking(false)
    }
    check()
  }, [router])

  useEffect(() => { fetch('/api/categories').then(r => r.json()).then(d => setCats(d.categories || [])) }, [])

  useEffect(() => {
    if (!stateVal) { setCities([]); return }
    setCitiesLoading(true); setCity('')
    fetchCitiesForState(stateVal).then(list => { setCities(list); setCitiesLoading(false) })
  }, [stateVal])

  async function handleSubmit() {
    if (!trade)    { setError('Please select your trade'); return }
    if (!stateVal) { setError('Please select your state'); return }
    setLoading(true); setError('')
    const finalCity = city === '__other__' ? otherCity : city

    const r = await fetch('/api/auth/complete-profile', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify({
        full_name: greetingName,
        phone,
        trade_category_id: trade,
        state: stateVal,
        city: finalCity,
        years_experience: yrs ? parseInt(yrs) : undefined,
      }),
    })
    const d = await r.json()
    setLoading(false)
    if (!r.ok) { setError(d.error || 'Could not complete your profile.'); return }

    // Profile created — mark as fresh signup so onboarding shows
    sessionStorage.setItem('pg_just_signed_up', '1')
    setSuccess(true)
    setTimeout(() => router.push('/onboarding'), 1300)
  }

  if (checking) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
        <div style={{ width:40, height:40, border:`3px solid ${C.border}`, borderTopColor:C.teal, borderRadius:'50%', animation:'pgspin 0.8s linear infinite' }} />
        <style>{`@keyframes pgspin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff', flexDirection:'column', gap:16, fontFamily:'system-ui' }}>
        <div style={{ width:60, height:60, borderRadius:'50%', background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 8px 24px rgba(15,118,110,0.35)` }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 style={{ fontSize:24, fontWeight:800, color:C.text, margin:0 }}>You're all set!</h2>
        <p style={{ color:C.muted, fontSize:14 }}>Taking you to finish your profile…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff', padding:'40px 24px', fontFamily:'system-ui' }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <h1 style={{ fontSize:26, fontWeight:800, color:C.text, margin:'0 0 6px', letterSpacing:'-0.02em' }}>
          {greetingName ? `Welcome, ${greetingName.split(' ')[0]}!` : 'Almost there!'}
        </h1>
        <p style={{ color:C.muted, fontSize:14, margin:'0 0 28px', lineHeight:1.6 }}>
          Tell us about your business so we can set up your ProGuild profile.
        </p>

        {error && (
          <div style={{ background:C.errorBg, border:'1px solid #FECACA', borderRadius:10, padding:'12px 16px', marginBottom:20, color:C.error, fontSize:13, fontWeight:500 }}>
            {error}
          </div>
        )}

        <Field label="Trade">
          <select value={trade} onChange={e => setTrade(e.target.value)}
            onFocus={() => setFocused('trade')} onBlur={() => setFocused(null)}
            style={selectStyle(focused==='trade')}>
            <option value="">Select your trade…</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
          </select>
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="State">
            <select value={stateVal} onChange={e => { setStateVal(e.target.value); setCity('') }}
              onFocus={() => setFocused('state')} onBlur={() => setFocused(null)}
              style={selectStyle(focused==='state')}>
              <option value="">State…</option>
              {US_STATES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
            </select>
          </Field>
          <Field label="City">
            <select value={city} onChange={e => setCity(e.target.value)} disabled={!stateVal}
              onFocus={() => setFocused('city')} onBlur={() => setFocused(null)}
              style={{ ...selectStyle(focused==='city'), opacity: !stateVal ? 0.5 : 1 }}>
              <option value="">{!stateVal ? 'State first…' : citiesLoading ? 'Loading…' : 'City…'}</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__other__">Other</option>
            </select>
          </Field>
        </div>

        {city === '__other__' && (
          <Field label="Enter your city">
            <input value={otherCity} onChange={e => setOtherCity(e.target.value)}
              onFocus={() => setFocused('otherCity')} onBlur={() => setFocused(null)}
              placeholder="City name" style={inputStyle(focused==='otherCity')} />
          </Field>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Phone (optional)">
            <input value={phone} onChange={e => setPhone(e.target.value)}
              onFocus={() => setFocused('phone')} onBlur={() => setFocused(null)}
              placeholder="(555) 123-4567" style={inputStyle(focused==='phone')} />
          </Field>
          <Field label="Years in trade (optional)">
            <input value={yrs} onChange={e => setYrs(e.target.value.replace(/\D/g, ''))}
              onFocus={() => setFocused('yrs')} onBlur={() => setFocused(null)}
              placeholder="10" style={inputStyle(focused==='yrs')} />
          </Field>
        </div>

        <button onClick={handleSubmit} disabled={loading} style={{
          width:'100%', padding:'14px', background:`linear-gradient(135deg, ${C.teal}, ${C.tealL})`,
          color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:700,
          cursor: loading ? 'wait' : 'pointer', boxShadow:`0 4px 16px rgba(15,118,110,0.35)`,
          opacity: loading ? 0.7 : 1, marginTop:8,
        }}>
          {loading ? 'Setting up…' : 'Create my profile →'}
        </button>
      </div>
    </div>
  )
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', background:'#fff' }} />}>
      <CompleteProfileInner />
    </Suspense>
  )
}
