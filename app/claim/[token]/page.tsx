'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const C = {
  bg:     '#0a0f0f',
  card:   '#111918',
  border: 'rgba(255,255,255,0.08)',
  teal:   '#14B8A6',
  muted:  '#94A3B8',
  error:  '#F87171',
}

function ShieldBadge() {
  return (
    <svg width={20} height={20} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#pg)"/>
      <path d="M11 16l3 3 7-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs><linearGradient id="pg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/>
      </linearGradient></defs>
    </svg>
  )
}

function Check() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
        <path d="M2 5l2 2 4-4" stroke={C.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

type Stage = 'loading' | 'preview' | 'password' | 'done' | 'error'

export default function ClaimPage() {
  const { token } = useParams() as { token: string }
  const router    = useRouter()

  const [pro,      setPro]      = useState<any>(null)
  const [stage,    setStage]    = useState<Stage>('loading')
  const [errMsg,   setErrMsg]   = useState('')
  const [pw,       setPw]       = useState('')
  const [pwConf,   setPwConf]   = useState('')
  const [pwErr,    setPwErr]    = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [busy,     setBusy]     = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/claim/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrMsg(d.error); setStage('error') }
        else         { setPro(d); setStage('preview') }
      })
      .catch(() => { setErrMsg('Something went wrong. Please try again.'); setStage('error') })
  }, [token])

  function validatePw(): boolean {
    if (pw.length < 8)      { setPwErr('Password must be at least 8 characters.'); return false }
    if (pw !== pwConf)      { setPwErr('Passwords don\'t match.'); return false }
    setPwErr('')
    return true
  }

  async function handleClaim() {
    if (!validatePw()) return
    setBusy(true)
    setPwErr('')
    try {
      const r = await fetch(`/api/claim/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: pw }),
      })
      const d = await r.json()
      if (d.ok) {
        // Server confirmed claim — sign in client-side to establish session
        const supabase = createClientComponentClient()
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email:    pro.email,
          password: pw,
        })
        if (signInErr) {
          // Account was claimed but session failed — send them to login with prefilled email
          router.replace(`/login?email=${encodeURIComponent(pro.email)}&claimed=1`)
          return
        }
        setStage('done')
        setTimeout(() => router.replace('/dashboard'), 1800)
      } else {
        setPwErr(d.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setPwErr('Network error. Please try again.')
    }
    setBusy(false)
  }

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${focused ? C.teal : C.border}`,
    borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
    transition: 'border-color 0.15s',
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: C.teal, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔧</div>
            <span style={{ color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>ProGuild.ai</span>
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>

          {/* Loading */}
          {stage === 'loading' && (
            <div style={{ padding: '48px 32px', textAlign: 'center', color: C.muted }}>
              Verifying your profile…
            </div>
          )}

          {/* Error */}
          {stage === 'error' && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Link issue</div>
              <div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>{errMsg}</div>
              <a href="mailto:support@proguild.ai" style={{ color: C.teal, fontSize: 14 }}>Contact support →</a>
            </div>
          )}

          {/* Preview — profile card + "This is me" CTA */}
          {stage === 'preview' && pro && (
            <>
              <div style={{ background: 'linear-gradient(135deg, #0F766E, #065F46)', padding: '24px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ShieldBadge />
                  <span style={{ color: '#5EEAD4', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>DBPR Verified</span>
                </div>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{pro.full_name}</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 4 }}>
                  {pro.trade}{pro.city ? ` · ${pro.city}, FL` : ' · Florida'}
                </div>
              </div>

              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ color: '#fff', fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Your verified profile is live on ProGuild</div>
                <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                  Pre-built from Florida DBPR records. Claim it to manage your listing, add photos, and receive job inquiries — free for 90 days.
                </div>

                {[
                  'DBPR-verified badge on your profile',
                  'Free satellite roof measurements ($35 value each)',
                  'Job pipeline, estimates & invoicing',
                  'Mobile app (iOS + Android)',
                ].map(b => (
                  <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Check />
                    <span style={{ color: '#CBD5E1', fontSize: 13 }}>{b}</span>
                  </div>
                ))}

                <button
                  onClick={() => setStage('password')}
                  style={{
                    width: '100%', padding: '14px', marginTop: 24,
                    background: C.teal, color: '#fff',
                    fontSize: 15, fontWeight: 700,
                    border: 'none', borderRadius: 12, cursor: 'pointer',
                  }}>
                  This is me — claim my profile →
                </button>
                <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
                  Not you? <a href="mailto:support@proguild.ai" style={{ color: C.muted, textDecoration: 'underline' }}>Let us know</a>
                </div>
              </div>
            </>
          )}

          {/* Password stage — inline, no redirect */}
          {stage === 'password' && pro && (
            <>
              <div style={{ background: 'linear-gradient(135deg, #0F766E, #065F46)', padding: '20px 28px' }}>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Set your password</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 }}>
                  One step to unlock {pro.full_name.split(' ')[0]}'s dashboard
                </div>
              </div>

              <div style={{ padding: '28px 28px 32px' }}>
                {/* Email — read-only, shows ownership */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your email</div>
                  <input
                    type="email"
                    value={pro.email}
                    readOnly
                    style={{ ...inputStyle(false), opacity: 0.6, cursor: 'default' }}
                  />
                </div>

                {/* Password */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Create password</div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={pw}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPw(e.target.value); setPwErr('') }}
                      placeholder="Min 8 characters"
                      style={inputStyle(document.activeElement?.id === 'pw')}
                      id="pw"
                      autoFocus
                    />
                    <button
                      onClick={() => setShowPw((s: boolean) => !s)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}>
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {/* Confirm */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm password</div>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pwConf}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPwConf(e.target.value); setPwErr('') }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleClaim()}
                    placeholder="Repeat password"
                    style={inputStyle(document.activeElement?.id === 'pwc')}
                    id="pwc"
                  />
                </div>

                {/* Inline error */}
                {pwErr && (
                  <div style={{ color: C.error, fontSize: 13, marginBottom: 8, marginTop: 4 }}>{pwErr}</div>
                )}

                <button
                  onClick={handleClaim}
                  disabled={busy}
                  style={{
                    width: '100%', padding: '14px', marginTop: 16,
                    background: busy ? '#0F766E99' : C.teal,
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    border: 'none', borderRadius: 12,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.15s',
                  }}>
                  {busy ? 'Claiming…' : 'Claim my profile & go to dashboard →'}
                </button>

                <button
                  onClick={() => setStage('preview')}
                  style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}>
                  ← Back
                </button>
              </div>
            </>
          )}

          {/* Done */}
          {stage === 'done' && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Profile claimed!</div>
              <div style={{ color: C.muted, fontSize: 14, marginTop: 8 }}>Taking you to your dashboard…</div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, color: C.muted, fontSize: 12 }}>
          ProGuild.ai · Florida's Verified Trades Network
        </div>
      </div>
    </div>
  )
}
