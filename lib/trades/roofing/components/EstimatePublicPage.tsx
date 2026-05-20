'use client'
// lib/trades/roofing/components/EstimatePublicPage.tsx
// The homeowner-facing roofing proposal page.
// Accessed via /estimate/[id] — no auth required.
// Includes: GBB tier selection, scope of work, payment schedule,
//           canvas e-sign, and tier-selection → approve flow.

import React, { useState, useRef, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TierLineItem {
  id: string; name: string; qty: number; unit: string
  unit_price: number; amount: number
}
interface Tier {
  key: 'standard' | 'upgraded' | 'premium'
  label: string; shingle_brand: string; warranty: string
  items: TierLineItem[]; subtotal: number
}
interface PaymentMilestone {
  id: string; name: string; pct: number; amount: number; due_when: string
}
export interface PublicRoofingEstimate {
  id: string; estimate_number: string
  status: 'sent' | 'viewed' | 'approved' | 'declined'
  lead_name: string
  property_address?: string
  square_count?: number; pitch?: string
  valid_until: string
  estimate_type: 'standard' | 'tiered'
  tiered_data?: { tiers: Tier[]; selected_tier?: 'standard' | 'upgraded' | 'premium' }
  items?: TierLineItem[]
  subtotal: number; tax_rate: number; tax_amount: number; total: number
  scope_of_work?: string; terms?: string
  payment_milestones?: PaymentMilestone[]
  deposit_percent?: number
  // Insurance
  insurance_claim?: boolean; deductible?: number
  // Pro info
  pro_name?: string; pro_city?: string; pro_state?: string
  pro_phone?: string; pro_license?: string
}

interface Props {
  estimate: PublicRoofingEstimate
  onApprove: (tieredKey?: 'standard' | 'upgraded' | 'premium', sigDataUrl?: string) => Promise<void>
}

// ── Design ─────────────────────────────────────────────────────────────────────
const C = {
  teal: '#0F766E', tealLight: '#F0FDFA', tealDark: '#0A4F49',
  navy: '#0C3547', navyDark: '#061D2B',
  bg: '#F8FAFC', card: '#FFFFFF',
  text: '#0F172A', secondary: '#64748B', muted: '#94A3B8',
  border: '#E2E8F0', amber: '#F59E0B', amberBg: '#FFFBEB',
  green: '#16A34A', greenBg: '#ECFDF5', danger: '#DC2626',
}
const font = "'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif"
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 })

// ── Main component ─────────────────────────────────────────────────────────────
export default function RoofingEstimatePublicPage({ estimate, onApprove }: Props) {
  const isGBB  = estimate.estimate_type === 'tiered' && (estimate.tiered_data?.tiers?.length ?? 0) > 0
  const tiers  = estimate.tiered_data?.tiers ?? []

  const [selectedTier, setSelectedTier] = useState<'standard' | 'upgraded' | 'premium' | null>(null)
  const [stage, setStage]               = useState<'choose' | 'sign'>('choose')
  const [approved, setApproved]         = useState(estimate.status === 'approved')
  const [approving, setApproving]       = useState(false)
  const [termsOpen, setTermsOpen]       = useState(false)

  // Scroll to sign section when tier selected
  const signRef = useRef<HTMLDivElement>(null)
  const handleSelect = (key: 'standard' | 'upgraded' | 'premium') => {
    setSelectedTier(key)
    setStage('sign')
    setTimeout(() => signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100)
  }

  const handleApprove = async (sigDataUrl: string) => {
    setApproving(true)
    try { await onApprove(selectedTier ?? undefined, sigDataUrl); setApproved(true) }
    catch { /* surface error */ }
    finally { setApproving(false) }
  }

  // ── Approved state ─────────────────────────────────────────────────────────
  if (approved) {
    return (
      <div style={{ fontFamily: font, minHeight: '100vh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center',
          background: C.card, borderRadius: 24, padding: 48, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.greenBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, margin: '0 auto 24px' }}>✓</div>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 12 }}>
            Proposal Approved!
          </h2>
          <p style={{ fontSize: 16, color: C.secondary, lineHeight: 1.7, marginBottom: 24 }}>
            Thank you, {estimate.lead_name.split(' ')[0]}. Your signature has been recorded.
            {estimate.pro_name} will be in touch shortly to schedule your project.
          </p>
          <div style={{ background: C.tealLight, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, color: C.teal, fontWeight: 700, marginBottom: 4 }}>
              Next step: Deposit
            </div>
            <div style={{ fontSize: 13, color: C.secondary }}>
              Your deposit invoice will be sent to your email shortly.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: '100vh' }}>

      {/* ── Hero header ── */}
      <div style={{ background: `linear-gradient(160deg, ${C.navyDark} 0%, ${C.navy} 50%, ${C.tealDark} 100%)`,
        padding: '40px 24px 48px', color: '#fff', textAlign: 'center', position: 'relative',
        overflow: 'hidden' }}>
        {/* Subtle roof texture overlay */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
          backgroundSize: '20px 20px' }} />

        <div style={{ position: 'relative', maxWidth: 520, margin: '0 auto' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 20, fontWeight: 900 }}>
              {estimate.pro_name?.split(' ').map(n => n[0]).join('').slice(0, 2) ?? 'SR'}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{estimate.pro_name ?? 'Your Roofer'}</div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {[estimate.pro_city, estimate.pro_state].filter(Boolean).join(', ')} · Licensed &amp; Insured
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
            textTransform: 'uppercase', opacity: 0.6, marginBottom: 12 }}>
            Roofing Proposal
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-1px', marginBottom: 8 }}>
            For {estimate.lead_name}
          </h1>
          {estimate.property_address && (
            <div style={{ fontSize: 15, opacity: 0.8, marginBottom: 24 }}>
              {estimate.property_address}
            </div>
          )}

          {/* Measurement pills */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {[
              estimate.square_count && { icon: '⊞', text: `${estimate.square_count} squares` },
              estimate.pitch && { icon: '△', text: `${estimate.pitch} pitch` },
              { icon: '📅', text: `Valid until ${new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` },
            ].filter(Boolean).map((pill: any) => (
              <div key={pill.text} style={{ display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 14px',
                fontSize: 13, fontWeight: 600 }}>
                <span>{pill.icon}</span>{pill.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>

        {/* GBB section */}
        {isGBB ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: C.text, marginBottom: 8 }}>
                Choose your option
              </h2>
              <p style={{ fontSize: 14, color: C.secondary }}>
                97% of homeowners find it easier to choose when given options
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
              {[...tiers].reverse().map(tier => (
                <PublicTierCard
                  key={tier.key} tier={tier}
                  selected={selectedTier === tier.key}
                  onSelect={() => handleSelect(tier.key)}
                  insuranceDed={estimate.insurance_claim ? estimate.deductible : undefined}
                />
              ))}
            </div>
          </>
        ) : (
          /* Standard estimate summary */
          <div style={{ background: C.card, borderRadius: 20, padding: 28, marginBottom: 24,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: C.secondary, marginBottom: 16 }}>
              Estimate Summary
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 16, color: C.secondary }}>Total</span>
              <span style={{ fontSize: 36, fontWeight: 900, color: C.teal }}>{fmt(estimate.total)}</span>
            </div>
          </div>
        )}

        {/* Scope of work */}
        {estimate.scope_of_work && (
          <Section title="Scope of Work">
            <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.8, margin: 0 }}>
              {estimate.scope_of_work}
            </p>
          </Section>
        )}

        {/* Payment schedule */}
        {(estimate.payment_milestones?.length ?? 0) > 0 && (
          <Section title="Payment Schedule">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Milestone', 'Amount', 'Due'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 12, fontWeight: 700,
                      color: C.muted, padding: '0 0 10px',
                      textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estimate.payment_milestones!.map((m, i) => (
                  <tr key={m.id} style={{ borderBottom: i < estimate.payment_milestones!.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <td style={{ padding: '12px 0', fontSize: 14, color: C.text }}>{m.name}</td>
                    <td style={{ padding: '12px 0', fontSize: 14, fontWeight: 700, color: C.text }}>
                      {fmt(m.amount)} ({m.pct}%)
                    </td>
                    <td style={{ padding: '12px 0', fontSize: 13, color: C.secondary }}>{m.due_when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* Insurance deductible note */}
        {estimate.insurance_claim && estimate.deductible && (
          <div style={{ background: C.amberBg, border: `1px solid #FDE68A`, borderRadius: 14,
            padding: 16, marginBottom: 24, display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.6 }}>
              <strong>Insurance job:</strong> Your deductible of <strong>{fmt(estimate.deductible)}</strong> is
              your only out-of-pocket cost. The rest is covered by your insurance claim.
            </div>
          </div>
        )}

        {/* Terms */}
        {estimate.terms && (
          <div style={{ marginBottom: 24 }}>
            <button onClick={() => setTermsOpen(p => !p)}
              style={{ background: 'none', border: 'none', color: C.teal, fontWeight: 700,
                fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                padding: 0 }}>
              Terms &amp; Conditions {termsOpen ? '▲' : '▼'}
            </button>
            {termsOpen && (
              <div style={{ marginTop: 12, fontSize: 13, color: C.secondary,
                lineHeight: 1.8, padding: '14px 16px', background: '#F8FAFC',
                borderRadius: 10, border: `1px solid ${C.border}` }}>
                {estimate.terms}
              </div>
            )}
          </div>
        )}

        {/* Signature section */}
        <div ref={signRef}>
          {!isGBB || selectedTier ? (
            <SignatureSection
              lead_name={estimate.lead_name}
              selectedTierLabel={
                tiers.find(t => t.key === selectedTier)?.label
                ?? (isGBB ? null : 'this estimate')
              }
              onConfirm={handleApprove}
              approving={approving}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '28px 20px', background: '#F8FAFC',
              borderRadius: 16, border: `2px dashed ${C.border}` }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>☝️</div>
              <p style={{ fontSize: 15, color: C.secondary, fontWeight: 600 }}>
                Select an option above to approve this proposal
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 40, paddingTop: 24,
          borderTop: `1px solid ${C.border}` }}>
          {estimate.pro_phone && (
            <p style={{ fontSize: 14, color: C.secondary, marginBottom: 8 }}>
              <strong>Questions?</strong> Call {estimate.pro_name?.split(' ')[0] ?? 'us'} directly:{' '}
              <a href={`tel:${estimate.pro_phone}`}
                style={{ color: C.teal, fontWeight: 700, textDecoration: 'none' }}>
                {estimate.pro_phone}
              </a>
            </p>
          )}
          <p style={{ fontSize: 12, color: C.muted }}>
            Powered by <a href="https://proguild.ai" target="_blank" rel="noreferrer"
              style={{ color: C.teal, fontWeight: 700, textDecoration: 'none' }}>ProGuild.ai</a>
          </p>
        </div>
      </div>
    </div>
  )
}

// ── PublicTierCard ──────────────────────────────────────────────────────────────
function PublicTierCard({ tier, selected, onSelect, insuranceDed }: {
  key?: React.Key
  tier: Tier; selected: boolean; onSelect: () => void; insuranceDed?: number
}) {
  const isPremium  = tier.key === 'premium'
  const isUpgraded = tier.key === 'upgraded'
  const isStandard = tier.key === 'standard'

  const cardBg     = isPremium ? C.navyDark : selected ? C.tealLight : C.card
  const cardBorder = selected ? `2px solid ${C.teal}` : isPremium ? 'none' : `1px solid ${C.border}`
  const cardTextP  = isPremium ? '#fff' : C.text
  const cardTextS  = isPremium ? 'rgba(255,255,255,0.65)' : C.secondary
  const priceColor = isPremium ? '#99F6E4' : C.teal

  // 2-column feature list
  const featureCount = tier.items.length
  const half = Math.ceil(featureCount / 2)
  const col1 = tier.items.slice(0, half)
  const col2 = tier.items.slice(half)

  return (
    <div style={{ background: cardBg, borderRadius: 20, border: cardBorder,
      padding: 24, boxShadow: selected ? '0 8px 32px rgba(15,118,110,0.15)' : '0 2px 8px rgba(0,0,0,0.06)',
      transition: 'all 0.2s', position: 'relative' }}>

      {/* Most popular badge */}
      {isUpgraded && (
        <div style={{ position: 'absolute', top: -12, left: 24,
          background: C.teal, color: '#fff', padding: '4px 14px',
          borderRadius: 999, fontSize: 11, fontWeight: 800 }}>
          MOST POPULAR
        </div>
      )}

      {/* Selected checkmark */}
      {selected && !isPremium && (
        <div style={{ position: 'absolute', top: 20, right: 20, width: 28, height: 28,
          borderRadius: '50%', background: C.teal, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: cardTextS, marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPremium ? '★★' : isUpgraded ? '★' : '◇'} {tier.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: cardTextP, marginBottom: 2 }}>
            {tier.shingle_brand}
          </div>
          <div style={{ fontSize: 13, color: cardTextS }}>{tier.warranty}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: priceColor }}>
            {fmt(tier.subtotal)}
          </div>
          {insuranceDed && (
            <div style={{ fontSize: 12, color: cardTextS }}>
              You pay: {fmt(insuranceDed)}
            </div>
          )}
        </div>
      </div>

      {/* Features — 2 col */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
        margin: '16px 0 20px' }}>
        {tier.items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13,
            color: cardTextP }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={isPremium ? '#99F6E4' : C.teal} strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {item.name}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={onSelect}
        style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none',
          cursor: 'pointer', fontSize: 15, fontWeight: 800, transition: 'all 0.15s',
          background: selected ? C.green : isPremium ? C.teal : isUpgraded ? C.teal : '#F1F5F9',
          color: selected || isPremium || isUpgraded ? '#fff' : C.text }}>
        {selected ? `✓ ${tier.label} Selected` : `Select ${tier.label} →`}
      </button>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, borderRadius: 16, padding: 24,
      marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: C.teal, marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── SignatureSection ────────────────────────────────────────────────────────────
function SignatureSection({ lead_name, selectedTierLabel, onConfirm, approving }: {
  lead_name: string
  selectedTierLabel: string | null
  onConfirm: (sigDataUrl: string) => Promise<void>
  approving: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasSig, setHasSig]   = useState(false)
  const [drawing, setDrawing] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0F172A'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    setDrawing(true)
    lastPos.current = getPos(e, canvas)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    if (!ctx || !lastPos.current) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    if (!hasSig) setHasSig(true)
  }

  const endDraw = () => { setDrawing(false); lastPos.current = null }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx?.clearRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
  }

  const confirm = async () => {
    const canvas = canvasRef.current
    if (!canvas || !hasSig) return
    const dataUrl = canvas.toDataURL('image/png')
    await onConfirm(dataUrl)
  }

  return (
    <div style={{ background: C.card, borderRadius: 20, padding: 28,
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: `1px solid ${C.border}` }}>
      <h3 style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>
        Sign to approve this proposal
      </h3>
      {selectedTierLabel && (
        <p style={{ fontSize: 14, color: C.secondary, marginBottom: 20, lineHeight: 1.6 }}>
          By signing, {lead_name.split(' ')[0]}, you are approving the{' '}
          <strong style={{ color: C.teal }}>{selectedTierLabel}</strong> option
          and agree to the payment schedule and terms above.
        </p>
      )}

      {/* Canvas */}
      <div style={{ border: `2px dashed #99F6E4`, borderRadius: 14, overflow: 'hidden',
        background: '#FAFFFE', marginBottom: 14, cursor: 'crosshair', touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={520} height={160}
          style={{ width: '100%', height: 160, display: 'block' }}
          onMouseDown={startDraw} onMouseMove={draw}
          onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        {!hasSig && (
          <div style={{ position: 'relative', marginTop: -160, height: 160,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none' }}>
            <div style={{ textAlign: 'center', color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>✍️</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Sign here</div>
            </div>
          </div>
        )}
      </div>

      {/* Baseline */}
      <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: 14 }} />

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={clear}
          style={{ padding: '13px 24px', borderRadius: 12, border: `1.5px solid ${C.border}`,
            background: '#fff', fontWeight: 700, fontSize: 14,
            color: C.danger, cursor: 'pointer' }}>
          Clear
        </button>
        <button onClick={confirm} disabled={!hasSig || approving}
          style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none',
            background: hasSig ? `linear-gradient(135deg, ${C.teal}, #0D9488)` : C.border,
            color: hasSig ? '#fff' : C.muted,
            fontWeight: 800, fontSize: 15, cursor: hasSig ? 'pointer' : 'default',
            transition: 'all 0.2s' }}>
          {approving ? 'Submitting...' : '✓ Confirm & Sign'}
        </button>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: C.muted, justifyContent: 'center' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        Your signature is secure and legally binding.
      </div>
    </div>
  )
}
