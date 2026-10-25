'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { proFirstName, proDisplayName } from '@/lib/utils'
import AppStoreBadges from '@/components/ui/AppStoreBadges'

// Matches the homepage palette (app/HomeClient.tsx) — this is a marketing/
// landing touchpoint, not an app screen, so it borrows that light, familiar
// tone rather than the dashboard's dark navy theme.
const C = {
  bg:     '#FAF9F6',
  card:   '#FFFFFF',
  border: '#E8E2D9',
  teal:   '#0F766E',
  text:   '#0F172A',
  muted:  '#64748B',
  error:  '#DC2626',
}

const BENEFITS = [
  { bold: 'Unlimited roof measurements', rest: ' — no per-report charges, ever' },
  { bold: 'AI scans insurance claims', rest: ' for missed line items' },
  { bold: 'Unlimited job photos', rest: ' — no per-user fees' },
  { bold: 'Unlimited team members', rest: ' — one flat rate, no per-seat fees' },
]

function Check() {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      background: 'rgba(20,184,166,0.2)',
      border: '1.5px solid rgba(20,184,166,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width={11} height={11} viewBox="0 0 10 10" fill="none">
        <path d="M2 5l2 2 4-4" stroke="#14B8A6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

type Stage = 'loading' | 'preview' | 'password' | 'done' | 'error'

export default function ClaimPage() {
  const { token } = useParams() as { token: string }
  const router    = useRouter()

  const [pro,    setPro]    = useState<any>(null) // includes license_status
  const [stage,  setStage]  = useState<Stage>('loading')
  const [errMsg, setErrMsg] = useState('')
  const [pw,     setPw]     = useState('')
  const [pwConf, setPwConf] = useState('')
  const [pwErr,  setPwErr]  = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy,   setBusy]   = useState(false)

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
    if (pw.length < 8) { setPwErr('Password must be at least 8 characters.'); return false }
    if (pw !== pwConf)  { setPwErr("Passwords don't match."); return false }
    setPwErr(''); return true
  }

  async function handleClaim() {
    if (!validatePw()) return
    setBusy(true); setPwErr('')
    try {
      const r = await fetch(`/api/claim/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const d = await r.json()
      if (d.ok) {
        // Show success screen immediately — eliminates flicker
        setStage('done')
        const supabase = getSupabaseBrowser()
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: pro.email, password: pw })
        if (signInErr) {
          setTimeout(() => router.replace(`/login?email=${encodeURIComponent(pro.email)}&claimed=1`), 1500)
          return
        }
        // Wait for session to be fully written to storage before navigating.
        // onAuthStateChange SIGNED_IN fires after the session is persisted,
        // so the dashboard SessionProvider will find it immediately on mount.
        await new Promise<void>(res => {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
            if (event === 'SIGNED_IN' && newSession) {
              subscription.unsubscribe()
              res()
            }
          })
          setTimeout(res, 3000) // hard fallback
        })
        // Use window.location for a hard navigation so the new page starts
        // fresh with the session already in localStorage — avoids the React
        // router reusing the old SessionProvider state that starts loading:true
        window.location.href = '/dashboard'
      } else {
        setPwErr(d.error || 'Something went wrong. Please try again.')
        setBusy(false)
      }
    } catch {
      setPwErr('Network error. Please try again.')
      setBusy(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
    background: '#FFFFFF',
    border: `1px solid ${C.border}`,
    borderRadius: 10, color: C.text, fontSize: 14, outline: 'none',
  }

  // "Verified" is only accurate when we've actually confirmed the license is
  // still in force — expired or unknown licenses get neutral, non-claim copy.
  const licenseVerified = pro?.license_status === 'active' || pro?.license_status === 'expiring_soon'

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo.png" alt="ProGuild" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <span style={{ color: C.text, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>ProGuild.ai</span>
          </div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Verified Licensed Contractors</div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

          {/* Loading */}
          {stage === 'loading' && (
            <div style={{ padding: '48px 32px', textAlign: 'center', color: C.muted }}>Verifying your profile…</div>
          )}

          {/* Error */}
          {stage === 'error' && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <div style={{ color: C.text, fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Link issue</div>
              <div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>{errMsg}</div>
              <a href="mailto:support@proguild.ai" style={{ color: C.teal, fontSize: 14 }}>Contact support →</a>
            </div>
          )}

          {/* Preview */}
          {stage === 'preview' && pro && (
            <>
              {/* Profile header with gradient */}
              <div style={{ background: 'linear-gradient(135deg, #0F766E 0%, #065F46 100%)', padding: '22px 28px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {licenseVerified ? 'DBPR Verified' : 'Florida DBPR Record'}
                  </span>
                </div>
                <div style={{ color: '#fff', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{proDisplayName(pro.full_name)}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 6 }}>
                  {pro.trade}{pro.city ? ` · ${pro.city}${pro.state ? `, ${pro.state}` : ''}` : ''}
                </div>
              </div>

              {/* Card body */}
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ color: C.text, fontSize: 23, fontWeight: 700, lineHeight: 1.3, marginBottom: 10 }}>
                  {licenseVerified
                    ? <>Your verified profile is already<br />live on ProGuild</>
                    : <>Your profile is already<br />live on ProGuild</>}
                </div>
                <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>
                  Built from Florida DBPR records. Claim it to manage leads, send estimates, and collect reviews — free for 90 days.
                </div>
                <div style={{ background: '#F5F2EC', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', color: C.muted, fontSize: 12.5, lineHeight: 1.5, marginBottom: 24 }}>
                  We created this profile using publicly available Florida DBPR license records. Claiming it lets you manage your own business details — your profile stays visible to homeowners, but only you can edit it.
                </div>

                {/* Benefits */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>
                  {BENEFITS.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ marginTop: 1 }}><Check /></div>
                      <span style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
                        <strong style={{ color: C.text, fontWeight: 600 }}>{b.bold}</strong>{b.rest}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ marginTop: 1 }}><Check /></div>
                    <span style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
                      <strong style={{ color: C.text, fontWeight: 600 }}>
                        {licenseVerified ? 'DBPR-verified profile' : 'Florida DBPR profile'}
                      </strong>{' '}— get discovered by homeowners
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={() => setStage('password')}
                  style={{
                    width: '100%', padding: '15px', marginBottom: 12,
                    background: C.teal, color: '#fff',
                    fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
                    border: 'none', borderRadius: 12, cursor: 'pointer',
                  }}>
                  This is my business — claim it →
                </button>
                <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                  Free for 90 days · No credit card required · Takes 30 seconds
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>Not you? </span>
                  <a href="mailto:support@proguild.ai" style={{ color: C.muted, fontSize: 13, textDecoration: 'underline' }}>Let us know</a>
                </div>
              </div>
            </>
          )}

          {/* Password stage */}
          {stage === 'password' && pro && (
            <>
              <div style={{ background: 'linear-gradient(135deg, #0F766E, #065F46)', padding: '20px 28px' }}>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>Set your password</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 }}>
                  One step to unlock {proFirstName(pro.full_name)}'s dashboard
                </div>
              </div>
              <div style={{ padding: '28px 28px 32px' }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your email</div>
                  <input type="email" value={pro.email} readOnly style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }}/>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Create password</div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'} value={pw} autoFocus
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPw(e.target.value); setPwErr('') }}
                      placeholder="Min 8 characters" style={inputStyle}
                    />
                    <button onClick={() => setShowPw((s: boolean) => !s)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 12 }}>
                      {showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm password</div>
                  <input
                    type={showPw ? 'text' : 'password'} value={pwConf}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPwConf(e.target.value); setPwErr('') }}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleClaim()}
                    placeholder="Repeat password" style={inputStyle}
                  />
                </div>
                {pwErr && <div style={{ color: C.error, fontSize: 13, marginBottom: 8, marginTop: 4 }}>{pwErr}</div>}
                <button onClick={handleClaim} disabled={busy} style={{
                  width: '100%', padding: '15px', marginTop: 16,
                  background: busy ? '#0F766E99' : C.teal, color: '#fff',
                  fontSize: 15, fontWeight: 700, border: 'none', borderRadius: 12,
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}>
                  {busy ? 'Claiming…' : 'Claim my profile & go to dashboard →'}
                </button>
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <span style={{ color: C.muted, fontSize: 12 }}>Free for 90 days · No credit card required</span>
                </div>
                <button onClick={() => setStage('preview')}
                  style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}>
                  ← Back
                </button>
              </div>
            </>
          )}

          {/* Done */}
          {stage === 'done' && (
            <div style={{ padding: '56px 32px', textAlign: 'center' }}>
              <div style={{ 
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(20,184,166,0.15)', border: '2px solid rgba(20,184,166,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', fontSize: 28
              }}>✓</div>
              <div style={{ color: C.text, fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Profile claimed!</div>
              <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6 }}>
                Welcome to ProGuild.<br />
                Setting up your dashboard…
              </div>
              <div style={{ marginTop: 24 }}>
                <div style={{
                  height: 3, background: C.border, borderRadius: 2, overflow: 'hidden'
                }}>
                  <div style={{ 
                    height: '100%', background: C.teal, borderRadius: 2,
                    animation: 'progress 2s ease-in-out forwards',
                    width: '100%'
                  }}/>
                </div>
              </div>
            </div>
          )}
        </div>

        {(stage === 'preview' || stage === 'password') && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 10 }}>Also on your phone</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AppStoreBadges tone="light" />
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, color: C.muted, fontSize: 12 }}>
          ProGuild.ai · Verified Licensed Contractors
        </div>
      </div>
    </div>
  )
}
