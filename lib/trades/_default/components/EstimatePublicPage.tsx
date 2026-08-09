'use client'
// lib/trades/_default/components/EstimatePublicPage.tsx
// Generic homeowner-facing service proposal for all non-roofing, non-HVAC trades
// (electrician, plumber, GC, carpenter, painter, etc.)

import React, { useState } from 'react'

export interface PublicGenericEstimate {
  id: string
  estimate_number: string
  status: 'sent' | 'viewed' | 'approved' | 'declined'
  lead_name: string
  property_address?: string | null
  valid_until: string
  items?: { id: string; name: string; amount: number; description?: string }[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  terms?: string | null
  deposit_pct?: number | null
  pro_name?: string | null
  pro_city?: string | null
  pro_state?: string | null
  pro_phone?: string | null
  trade_slug?: string | null
}

interface Props {
  estimate: PublicGenericEstimate
  onApprove: (tierKey?: string, sigDataUrl?: string) => Promise<void>
}

function money(n: number) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Trade-aware label — extend as needed
function proposalLabel(slug: string | null | undefined): string {
  if (!slug) return 'Service Proposal'
  if (slug === 'electrician') return 'Electrical Service Proposal'
  if (slug === 'plumber' || slug === 'plumbing') return 'Plumbing Service Proposal'
  if (slug === 'general-contractor' || slug === 'gc') return 'Project Proposal'
  if (slug === 'painter' || slug === 'painting') return 'Painting Proposal'
  if (slug === 'landscaper' || slug === 'landscaping') return 'Landscaping Proposal'
  if (slug === 'carpenter' || slug === 'carpentry') return 'Carpentry Proposal'
  return 'Service Proposal'
}

function tradeEmoji(slug: string | null | undefined): string {
  if (!slug) return '🔧'
  if (slug === 'electrician') return '⚡'
  if (slug.includes('plumb')) return '🔧'
  if (slug.includes('general') || slug === 'gc') return '🏗️'
  if (slug.includes('paint')) return '🎨'
  if (slug.includes('landscape')) return '🌿'
  if (slug.includes('carpet') || slug.includes('carpenter')) return '🪚'
  return '🔧'
}

const BRAND = '#0F766E'
const DARK  = '#0C1A2E'

export default function GenericEstimatePublicPage({ estimate, onApprove }: Props) {
  const [chosenSig, setChosenSig] = useState<string | null>(null)
  const [signing,   setSigning]   = useState(false)
  const [approved,  setApproved]  = useState(estimate.status === 'approved')
  const [err,       setErr]       = useState('')

  const isApproved = approved || estimate.status === 'approved'
  const isDeclined = estimate.status === 'declined'
  const depositPct = estimate.deposit_pct ?? 50
  const depositAmt = Math.round(estimate.total * (depositPct / 100) * 100) / 100
  const balanceAmt = Math.round((estimate.total - depositAmt) * 100) / 100

  const nameVariants = estimate.lead_name
    ? [
        estimate.lead_name,
        estimate.lead_name.split(' ').map((w, i) => i === 0 ? w : w[0] + '.').join(' '),
        estimate.lead_name.split(' ').map((w, i) => i === 0 ? w[0] + '.' : w).join(' '),
      ]
    : []

  const label = proposalLabel(estimate.trade_slug)
  const emoji = tradeEmoji(estimate.trade_slug)

  async function handleSign() {
    if (!chosenSig) { setErr('Please choose a signature'); return }
    setSigning(true); setErr('')
    try {
      await onApprove(undefined, chosenSig)
      setApproved(true)
    } catch { setErr('Something went wrong — please try again') }
    setSigning(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ background: DARK, padding: '32px 24px 40px', textAlign: 'center', color: 'white' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>
          {emoji}
        </div>
        {estimate.pro_name && (
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{estimate.pro_name}</div>
        )}
        {(estimate.pro_city || estimate.pro_state) && (
          <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 4 }}>
            {[estimate.pro_city, estimate.pro_state].filter(Boolean).join(', ')} · Licensed &amp; Insured
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5EEAD4', marginTop: 16, marginBottom: 8 }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {estimate.property_address ? `For ${estimate.property_address}` : `For ${estimate.lead_name}`}
        </div>
        <div style={{ fontSize: 14, color: '#94A3B8' }}>Prepared for {estimate.lead_name}</div>
        <div style={{ display: 'inline-block', marginTop: 12, padding: '6px 14px', borderRadius: 20, background: 'rgba(15,118,110,0.25)', color: '#5EEAD4', fontSize: 13, fontWeight: 600 }}>
          📅 Valid until {new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 48px' }}>

        {/* Approved banner */}
        {isApproved && (
          <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: '#065F46', fontSize: 15 }}>Proposal approved</div>
              <div style={{ fontSize: 13, color: '#047857' }}>Thank you! {estimate.pro_name ?? 'Your contractor'} will be in touch to confirm next steps.</div>
            </div>
          </div>
        )}

        {/* Line items */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #F8FAFC' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND }}>
              WHAT'S INCLUDED
            </div>
          </div>
          {(estimate.items || []).map((item, i) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 20px', borderTop: i > 0 ? '1px solid #F8FAFC' : 'none' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0F172A' }}>{item.name}</div>
                {item.description && <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{item.description}</div>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', flexShrink: 0, marginLeft: 16 }}>{money(item.amount)}</div>
            </div>
          ))}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #F0F9FF', background: '#F8FAFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748B', marginBottom: 4 }}>
              <span>Subtotal</span><span>{money(estimate.subtotal)}</span>
            </div>
            {(estimate.tax_amount ?? 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748B', marginBottom: 8 }}>
                <span>Tax ({estimate.tax_rate ?? 6}%)</span><span>{money(estimate.tax_amount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: '#0F172A' }}>
              <span>Total</span><span style={{ color: BRAND }}>{money(estimate.total)}</span>
            </div>
          </div>
        </div>

        {/* Payment schedule */}
        {estimate.total > 0 && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F8FAFC' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND }}>
                PAYMENT SCHEDULE
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '12px 20px', borderBottom: '1px solid #F8FAFC' }}>
              {['MILESTONE', 'AMOUNT', 'DUE'].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {[
              { name: 'Deposit', amount: depositAmt, due: `${depositPct}% — Due at signing` },
              { name: 'On Completion', amount: balanceAmt, due: 'Balance — Due on completion' },
            ].map((m, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '13px 20px', borderTop: '1px solid #F8FAFC' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{m.name}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: BRAND }}>{money(m.amount)}</div>
                <div style={{ fontSize: 13, color: '#64748B' }}>{m.due}</div>
              </div>
            ))}
          </div>
        )}

        {/* Terms */}
        {estimate.terms && (
          <details style={{ background: 'white', borderRadius: 14, border: '1px solid #E2E8F0', marginBottom: 16 }}>
            <summary style={{ padding: '14px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: BRAND }}>
              Terms &amp; Conditions ▾
            </summary>
            <div style={{ padding: '0 20px 16px', fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
              {estimate.terms}
            </div>
          </details>
        )}

        {/* Signature block */}
        {!isApproved && !isDeclined && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #E2E8F0', padding: '24px 20px' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Sign to approve this proposal</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
              By signing, {estimate.lead_name}, you approve this estimate and agree to the payment schedule and terms above.
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 10 }}>CHOOSE A SIGNATURE STYLE</div>
            {nameVariants.map((v, i) => (
              <div key={i} onClick={() => setChosenSig(v)}
                style={{ padding: '14px 20px', borderRadius: 10, border: `1.5px solid ${chosenSig === v ? BRAND : '#E2E8F0'}`, marginBottom: 10, cursor: 'pointer', background: chosenSig === v ? '#F0FDFA' : 'white',
                  fontFamily: ['Dancing Script, cursive', 'Pacifico, cursive', 'Caveat, cursive'][i] ?? 'cursive',
                  fontSize: [22, 20, 19][i] ?? 18, color: '#0F172A' }}>
                {v}
              </div>
            ))}
            {err && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setChosenSig(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #E2E8F0', background: 'transparent', color: '#64748B', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Clear
              </button>
              <button onClick={handleSign} disabled={signing || !chosenSig}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: signing ? '#94A3B8' : BRAND, color: 'white', fontSize: 14, fontWeight: 700, cursor: signing ? 'not-allowed' : 'pointer' }}>
                {signing ? 'Confirming...' : '✓ Confirm & Sign Proposal'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 10 }}>🔒 Your signature is secure and legally binding.</div>
          </div>
        )}

        {isDeclined && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#DC2626' }}>This proposal was declined</div>
            <div style={{ fontSize: 13, color: '#9F1239', marginTop: 4 }}>Contact {estimate.pro_name ?? 'your contractor'} to discuss alternatives.</div>
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 24 }}>
          {estimate.pro_name} · Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Powered by ProGuild.ai
        </div>
      </div>
    </div>
  )
}
