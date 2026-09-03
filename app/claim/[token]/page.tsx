'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const C = {
  bg:      '#0a0f0f',
  card:    '#111918',
  border:  'rgba(255,255,255,0.08)',
  teal:    '#14B8A6',
  muted:   '#94A3B8',
  green:   '#22C55E',
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

export default function ClaimPage() {
  const { token } = useParams() as { token: string }
  const router    = useRouter()

  const [pro,     setPro]     = useState<any>(null)
  const [status,  setStatus]  = useState<'loading'|'ready'|'sent'|'error'>('loading')
  const [errMsg,  setErrMsg]  = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/claim/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrMsg(d.error); setStatus('error') }
        else         { setPro(d); setStatus('ready') }
      })
      .catch(() => { setErrMsg('Something went wrong. Please try again.'); setStatus('error') })
  }, [token])

  async function handleClaim() {
    setSending(true)
    const r = await fetch(`/api/claim/${token}`, { method: 'POST' })
    const d = await r.json()
    if (d.ok) {
      setStatus('sent')
      ;(pro as any)._maskedEmail = d.email
      setPro({ ...pro, _maskedEmail: d.email })
    } else {
      setErrMsg(d.error || 'Failed to send claim email.')
      setStatus('error')
    }
    setSending(false)
  }

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
          {status === 'loading' && (
            <div style={{ padding: '48px 32px', textAlign: 'center', color: C.muted }}>
              Verifying your profile…
            </div>
          )}

          {/* Error */}
          {status === 'error' && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Link issue</div>
              <div style={{ color: C.muted, fontSize: 14, marginBottom: 24 }}>{errMsg}</div>
              <a href="mailto:support@proguild.ai" style={{ color: C.teal, fontSize: 14 }}>Contact support →</a>
            </div>
          )}

          {/* Ready — show profile card */}
          {status === 'ready' && pro && (
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
                <div style={{ color: '#fff', fontSize: 17, fontWeight: 600, marginBottom: 8 }}>
                  Your verified profile is live on ProGuild
                </div>
                <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                  We've pre-built your profile from Florida DBPR records. Claim it to manage your listing, add photos, and receive job inquiries — free for 90 days.
                </div>

                {/* Benefits */}
                {[
                  'DBPR-verified badge on your profile',
                  'Free satellite roof measurements ($35 value each)',
                  'Job pipeline, invoicing & mobile app',
                  'Homeowners in your area can find and contact you',
                ].map(b => (
                  <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke={C.teal} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span style={{ color: '#CBD5E1', fontSize: 13 }}>{b}</span>
                  </div>
                ))}

                <button
                  onClick={handleClaim}
                  disabled={sending}
                  style={{
                    width: '100%', padding: '14px', marginTop: 24,
                    background: sending ? '#0F766E99' : C.teal,
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    border: 'none', borderRadius: 12, cursor: sending ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.15s',
                  }}>
                  {sending ? 'Sending claim link…' : 'This is me — claim my profile →'}
                </button>
                <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
                  We'll send a one-click login link to your email on file. No password needed.
                </div>
              </div>
            </>
          )}

          {/* Sent */}
          {status === 'sent' && (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Check your inbox</div>
              <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
                We sent a one-click claim link to
              </div>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 20 }}>
                {pro?._maskedEmail}
              </div>
              <div style={{ color: C.muted, fontSize: 13 }}>
                Click the link in that email to complete your claim and access your dashboard.
              </div>
              <div style={{ marginTop: 24, padding: '12px 16px', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 10, color: '#5EEAD4', fontSize: 13 }}>
                Link not in inbox? Check your spam folder or{' '}
                <button onClick={handleClaim} style={{ color: C.teal, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13, padding: 0 }}>
                  resend it
                </button>.
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, color: C.muted, fontSize: 12 }}>
          ProGuild.ai · Florida's Verified Trades Network · <a href="/pro/search" style={{ color: C.muted }}>Browse pros</a>
        </div>
      </div>
    </div>
  )
}
