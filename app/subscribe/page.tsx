'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProSession } from '@/lib/hooks/useProSession'
import { apiFetch } from '@/lib/api-fetch'

const ROOFING_SLUGS = new Set(['roofing', 'roofing-contractor', 'roofer'])

export default function SubscribePage() {
  const { session, loading } = useProSession()
  const router  = useRouter()
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  // If already paid, bounce to dashboard
  useEffect(() => {
    if (loading) return
    if (!session) { router.replace('/login'); return }
    const plan   = session.plan as string | null
    const isPaid = plan === 'pro' || plan === 'elite'
    if (isPaid) router.replace('/dashboard')
  }, [loading, session, router])

  const isRoofing = ROOFING_SLUGS.has((session as any)?.trade_slug ?? '')
  const price     = isRoofing ? '$49.99' : '$29.99'
  const tradeName = isRoofing ? 'Roofing' : 'Trades'

  const trialEndsAt = (session as any)?.trial_ends_at as string | null
  const trialExpired = trialEndsAt ? new Date(trialEndsAt) < new Date() : false

  async function handleSubscribe() {
    if (!session) return
    setBusy(true); setErr('')
    try {
      const res  = await apiFetch('/api/stripe/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Could not start checkout'); setBusy(false); return }
      window.location.href = data.url
    } catch {
      setErr('Could not connect to payment processor'); setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div style={{
      minHeight: '100vh', background: '#0A1628',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: '40px 36px',
        maxWidth: 440, width: '100%', textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg,#0F766E,#0D9488)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 800, fontSize: 16,
          }}>PG</div>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#0A1628' }}>ProGuild.ai</span>
        </div>

        {/* Heading */}
        {trialExpired ? (
          <>
            <div style={{
              display: 'inline-block', background: '#FEF3C7', color: '#B45309',
              fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, marginBottom: 16,
            }}>Free Trial Ended</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0A1628', marginBottom: 12 }}>
              Your free trial has ended
            </h1>
            <p style={{ fontSize: 14.5, color: '#64748B', lineHeight: 1.6, marginBottom: 28 }}>
              Subscribe to keep accessing your CRM, leads, invoices, and verified contractor listing.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0A1628', marginBottom: 12 }}>
              Upgrade to ProGuild Pro
            </h1>
            <p style={{ fontSize: 14.5, color: '#64748B', lineHeight: 1.6, marginBottom: 28 }}>
              Get full access to your CRM, invoicing, satellite measurement, and verified contractor listing.
            </p>
          </>
        )}

        {/* Price card */}
        <div style={{
          border: '2px solid #0F766E', borderRadius: 14,
          padding: '20px 24px', marginBottom: 24, background: '#F0FDFA',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F766E', marginBottom: 4 }}>
            ProGuild Pro — {tradeName}
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#0A1628' }}>
            {price}<span style={{ fontSize: 16, fontWeight: 500, color: '#64748B' }}>/mo</span>
          </div>
          <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 8 }}>
            Cancel anytime · No contracts
          </div>
        </div>

        {/* Feature list */}
        <div style={{ textAlign: 'left', marginBottom: 28 }}>
          {[
            'Full CRM — leads, pipeline, scheduling',
            'Estimates, proposals & invoicing',
            isRoofing ? 'Insurance supplement recovery tools' : 'Job management & work orders',
            isRoofing ? 'Satellite roof measurement' : 'Equipment tracking & diagnostics',
            'Verified listing in Florida\'s contractor directory',
            'Mobile app (iOS + Android)',
          ].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div style={{ color: '#0F766E', fontSize: 16, marginTop: 1 }}>✓</div>
              <div style={{ fontSize: 13.5, color: '#374151' }}>{f}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {err && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{err}</p>}

        {/* CTA */}
        <button onClick={handleSubscribe} disabled={busy} style={{
          width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
          background: busy ? '#CBD5E1' : 'linear-gradient(135deg,#0F766E,#0D9488)',
          color: 'white', fontSize: 15, fontWeight: 700,
          cursor: busy ? 'default' : 'pointer', marginBottom: 14,
        }}>
          {busy ? 'Redirecting to checkout…' : `Subscribe for ${price}/mo →`}
        </button>

        <p style={{ fontSize: 12, color: '#94A3B8' }}>
          Secure checkout via Stripe · You'll be redirected to complete payment
        </p>

        {/* Sign out link */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #F1F5F9' }}>
          <a href="/login" style={{ fontSize: 13, color: '#94A3B8', textDecoration: 'none' }}>
            Sign in with a different account
          </a>
        </div>
      </div>
    </div>
  )
}
