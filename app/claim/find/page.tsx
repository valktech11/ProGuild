'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { proFirstName } from '@/lib/utils'

const C = {
  bg: '#0a0f0f', card: '#111918', border: 'rgba(255,255,255,0.08)',
  teal: '#14B8A6', muted: '#94A3B8', error: '#F87171',
}

type Stage = 'search' | 'preview' | 'done'

export default function ClaimFindPage() {
  const router = useRouter()
  const [license, setLicense]         = useState('')
  const [email, setEmail]             = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pw, setPw]                   = useState('')
  const [pwConf, setPwConf]           = useState('')
  const [pro, setPro]                 = useState<any>(null)
  const [stage, setStage]             = useState<Stage>('search')
  const [errMsg, setErrMsg]           = useState('')
  const [pwErr, setPwErr]             = useState('')
  const [busy, setBusy]               = useState(false)
  const [focused, setFocused]         = useState<string | null>(null)

  const inp = (name: string): React.CSSProperties => ({
    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
    background: focused === name ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${focused === name ? C.teal : C.border}`,
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', transition: 'all 0.15s',
  })

  async function handleLookup() {
    const lic = license.trim().toUpperCase()
    if (!lic) { setErrMsg('Enter your Florida license number (e.g. CCC123456)'); return }
    setBusy(true); setErrMsg('')
    const res = await fetch(`/api/claim/by-license?license=${encodeURIComponent(lic)}`)
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { setErrMsg(d.error || 'Not found.'); return }
    setPro(d)
    setDisplayName(d.first_name || proFirstName(d.full_name || ''))
    setStage('preview')
  }

  async function handleClaim() {
    setPwErr('')
    if (!email.trim() || !email.includes('@')) { setPwErr('Valid email address is required.'); return }
    if (pw.length < 8) { setPwErr('Password must be at least 8 characters.'); return }
    if (pw !== pwConf) { setPwErr("Passwords don't match."); return }
    setBusy(true)
    const res = await fetch('/api/claim/by-license', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_number: pro.license_number,
        email: email.trim(),
        password: pw,
        display_name: displayName.trim() || undefined,
      }),
    })
    const d = await res.json()
    if (!res.ok) { setPwErr(d.error || 'Something went wrong.'); setBusy(false); return }
    setStage('done')
    const supabase = getSupabaseBrowser()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (signInErr) { setTimeout(() => router.replace(`/login?email=${encodeURIComponent(email.trim())}&claimed=1`), 1500); return }
    await new Promise<void>(res => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
        if (event === 'SIGNED_IN' && newSession) { subscription.unsubscribe(); res() }
      })
      setTimeout(res, 3000)
    })
    window.location.href = '/dashboard'
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="ProGuild" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>ProGuild.ai</span>
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Verified Licensed Contractors</div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>

          {stage === 'search' && (
            <div style={{ padding: '36px 32px' }}>
              <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Find your profile</h1>
              <p style={{ color: C.muted, fontSize: 14, margin: '0 0 28px', lineHeight: 1.6 }}>
                Enter your Florida DBPR license number to find and claim your pre-built profile.
              </p>
              <label style={{ display: 'block', color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>License Number</label>
              <input value={license} onChange={e => setLicense(e.target.value.toUpperCase())}
                onFocus={() => setFocused('lic')} onBlur={() => setFocused(null)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder="e.g. CCC123456 or CBC789012"
                style={{ ...inp('lic'), marginBottom: 16 }} />
              {errMsg && <div style={{ color: C.error, fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)' }}>{errMsg}</div>}
              <button onClick={handleLookup} disabled={busy}
                style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg, #0F766E, #14B8A6)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Searching…' : 'Find My Profile →'}
              </button>
              <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, marginTop: 20 }}>
                Have a claim link? <a href="/login?tab=signup" style={{ color: C.teal, fontWeight: 600 }}>Use it here →</a>
              </p>
              <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, marginTop: 8 }}>
                Already claimed? <a href="/login" style={{ color: C.teal, fontWeight: 600 }}>Log in →</a>
              </p>
            </div>
          )}

          {stage === 'preview' && pro && (
            <div style={{ padding: '36px 32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)', marginBottom: 24 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="16 9.5 11 14.5 8 11.5"/></svg>
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ color: C.teal, fontSize: 12, fontWeight: 700 }}>License Found — {pro.license_number}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>Matched to your DBPR record</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${C.border}` }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
                  {(pro.full_name || 'P').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{proFirstName(pro.full_name || '')}</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>{pro.trade} · {pro.city}, {pro.state}</div>
                </div>
              </div>

              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>This is your ProGuild profile. Fill in your details to claim it.</p>

              <label style={{ display: 'block', color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Display Name <span style={{ color: '#6B7280', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(how you appear on ProGuild)</span></label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                onFocus={() => setFocused('dn')} onBlur={() => setFocused(null)}
                placeholder="e.g. John Smith"
                style={{ ...inp('dn'), marginBottom: 12 }} />

              <label style={{ display: 'block', color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                placeholder="you@example.com" style={{ ...inp('email'), marginBottom: 12 }} />
              <label style={{ display: 'block', color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                onFocus={() => setFocused('pw')} onBlur={() => setFocused(null)}
                placeholder="At least 8 characters" style={{ ...inp('pw'), marginBottom: 12 }} />
              <label style={{ display: 'block', color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirm Password</label>
              <input type="password" value={pwConf} onChange={e => setPwConf(e.target.value)}
                onFocus={() => setFocused('pwc')} onBlur={() => setFocused(null)}
                placeholder="Repeat password" style={{ ...inp('pwc'), marginBottom: 16 }} />
              {pwErr && <div style={{ color: C.error, fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)' }}>{pwErr}</div>}
              <button onClick={handleClaim} disabled={busy}
                style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg, #0F766E, #14B8A6)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Claiming…' : 'Claim My Profile →'}
              </button>
              <button onClick={() => { setStage('search'); setPro(null); setErrMsg('') }}
                style={{ width: '100%', marginTop: 10, padding: '10px', background: 'transparent', color: C.muted, border: 'none', fontSize: 13, cursor: 'pointer' }}>
                ← Search again
              </button>
            </div>
          )}

          {stage === 'done' && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg, #0F766E, #14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(15,118,110,0.35)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Profile claimed!</h2>
              <p style={{ color: C.muted, fontSize: 14 }}>Setting up your dashboard…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
