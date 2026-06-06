'use client'
// lib/trades/roofing/components/EstimatePublicPage.tsx
// Homeowner-facing roofing proposal.
// Improvements v2:
//  1. Two-column desktop layout (≥960px) — left: tiers + scope + payment; right sticky: summary + contractor
//  2. Financing line per tier (from $X/mo)
//  3. Price typography at 48px
//  4. Contractor card in sticky right panel
//  5. "Estimated Install" and deposit due in right panel

import React, { useState, useRef, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TierLineItem {
  id: string; name: string; qty: number; unit: string
  unit_price: number; amount: number
}
interface Tier {
  key: 'standard' | 'upgraded' | 'premium'
  label: string; shingle_brand: string; warranty: string
  items: TierLineItem[]; subtotal: number
  financing_monthly?: number   // optional — show if set
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
  insurance_claim?: boolean; deductible?: number
  approved_amount?: number; supplement_amount?: number; claim_status?: string | null
  insurance_company?: string; claim_number?: string
  pro_id?: string
  pro_name?: string; pro_city?: string; pro_state?: string
  pro_phone?: string; pro_email?: string; pro_license?: string
  pro_signature?: string  // R2 key or data URL of pro's signature
}

interface Props {
  estimate: PublicRoofingEstimate
  onApprove: (tieredKey?: 'standard' | 'upgraded' | 'premium', sigDataUrl?: string) => Promise<void>
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  teal: '#0F766E', tealLight: '#F0FDFA', tealDark: '#0A4F49',
  navy: '#0C3547', navyDark: '#061D2B',
  bg: '#F1F5F9', card: '#FFFFFF',
  text: '#0F172A', secondary: '#64748B', muted: '#94A3B8',
  border: '#E2E8F0', amber: '#F59E0B', amberBg: '#FFFBEB',
  green: '#16A34A', greenBg: '#ECFDF5', danger: '#DC2626',
  greenLight: '#D1FAE5',
}
const font  = "'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif"
const fmt   = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 })
const SHAD  = '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)'
const SHAD2 = '0 4px 20px rgba(0,0,0,0.08)'

// ── Main ───────────────────────────────────────────────────────────────────────
export default function RoofingEstimatePublicPage({ estimate, onApprove }: Props) {
  const isGBB = estimate.estimate_type === 'tiered' && (estimate.tiered_data?.tiers?.length ?? 0) > 0
  const tiers = estimate.tiered_data?.tiers ?? []

  const [selectedTier, setSelectedTier] = useState<'standard' | 'upgraded' | 'premium' | null>(null)
  const [approved,     setApproved]     = useState(estimate.status === 'approved')
  const [approving,    setApproving]    = useState(false)
  const [termsOpen,    setTermsOpen]    = useState(false)
  const [mobile,       setMobile]       = useState(false)

  const signRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 960)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const handleSelect = (key: 'standard' | 'upgraded' | 'premium') => {
    setSelectedTier(key)
    setTimeout(() => signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
  }

  const handleApprove = async (sigDataUrl: string) => {
    setApproving(true)
    try { await onApprove(selectedTier ?? undefined, sigDataUrl); setApproved(true) }
    catch { /* noop */ }
    finally { setApproving(false) }
  }

  const selTierData  = tiers.find(t => t.key === selectedTier)
  const selSubtotal  = selTierData?.subtotal ?? estimate.subtotal
  const taxAmt       = Math.round(selSubtotal * (estimate.tax_rate / 100))
  const selTotal     = selSubtotal + taxAmt

  // Recompute milestones from selected tier total so the payment schedule
  // updates live when the homeowner switches tiers (not static DB values)
  const displayMilestones: PaymentMilestone[] = isGBB && selTotal > 0
    ? (() => {
        const dep = Math.round(selTotal * 30 / 100)
        const mat = Math.round(selTotal * 40 / 100)
        const com = selTotal - dep - mat
        return [
          { id: 'dep', name: 'Deposit',             pct: 30, amount: dep, due_when: 'Due at signing'    },
          { id: 'mat', name: 'At Material Delivery', pct: 40, amount: mat, due_when: 'Due at delivery'   },
          { id: 'com', name: 'On Completion',        pct: 30, amount: com, due_when: 'Due on completion' },
        ]
      })()
    : (estimate.payment_milestones ?? [])

  const depositAmt = displayMilestones[0]?.amount
    ?? Math.round(selTotal * ((estimate.deposit_percent ?? 30) / 100))

  // ── Approved ────────────────────────────────────────────────────────────────
  if (approved) return (
    <div style={{ fontFamily: font, minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center',
        background: C.card, borderRadius: 24, padding: 48, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.greenBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, margin: '0 auto 24px', color: C.green, fontWeight: 900 }}>✓</div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 12, letterSpacing: '-0.5px' }}>
          Proposal Approved!
        </h2>
        <p style={{ fontSize: 15, color: C.secondary, lineHeight: 1.8, marginBottom: 24 }}>
          Thank you{estimate.lead_name && !estimate.lead_name.match(/^\d/) ? `, ${estimate.lead_name.split(' ')[0]}` : ''}. Your signature has been recorded.{' '}
          {estimate.pro_name} will be in touch shortly to confirm your installation date.
        </p>
        <div style={{ background: C.tealLight, borderRadius: 14, padding: 20, textAlign: 'left' }}>
          <div style={{ fontSize: 14, color: C.teal, fontWeight: 700, marginBottom: 4 }}>Next step</div>
          <div style={{ fontSize: 13, color: C.secondary }}>
            A deposit invoice will arrive in your inbox shortly. Your project begins once the deposit is received.
          </div>
        </div>
      </div>
    </div>
  )

  // ── Main layout ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: '100vh' }}>

      {/* Hero */}
      <Hero estimate={estimate} />

      {/* Two-column body */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: mobile ? '28px 16px' : '36px 32px',
        display: mobile ? 'block' : 'grid',
        gridTemplateColumns: mobile ? undefined : '1fr 340px',
        gap: 28, alignItems: 'start',
      }}>

        {/* ── LEFT: tiers + content ── */}
        <div>
          {isGBB ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: C.text, marginBottom: 6, letterSpacing: '-0.5px' }}>
                  Choose your option
                </h2>
                <p style={{ fontSize: 14, color: C.secondary }}>
                  97% of homeowners find it easier to decide when given options
                </p>
              </div>

              {/* Tier cards — reversed (Premium first) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
                {[...tiers].reverse().map(tier => (
                  <PublicTierCard
                    key={tier.key as string}
                    tier={tier}
                    selected={selectedTier === tier.key}
                    onSelect={() => handleSelect(tier.key)}
                    insuranceDed={estimate.insurance_claim ? estimate.deductible : undefined}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {/* When items exist, total is shown inside the items section — no separate card needed */}
              {(estimate.items?.length ?? 0) === 0 && (
                <div style={{ background: C.card, borderRadius: 20, padding: 28, marginBottom: 24,
                  boxShadow: SHAD }}>
                  <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: C.secondary, marginBottom: 16 }}>
                    Estimate Total
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 16, color: C.secondary }}>Total</span>
                    <span style={{ fontSize: 48, fontWeight: 900, color: C.teal, letterSpacing: '-2px' }}>
                      {fmt(estimate.total)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Line items — standard estimate only. GBB uses tier cards above. */}
          {!isGBB && (estimate.items?.length ?? 0) > 0 && (
            <ContentSection title="What's Included">
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
                {estimate.items!.map((item, i) => (
                  <div key={item.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '11px 0',
                    borderBottom: i < estimate.items!.length - 1 ? `1px solid ${C.border}` : 'none',
                    gap: 16,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.name}</div>
                      {(item as any).description && (item as any).description !== item.name && (
                        <div style={{ fontSize: 12, color: C.secondary, marginTop: 2 }}>
                          {(item as any).description}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, flexShrink: 0 }}>
                      {fmt(item.amount)}
                    </div>
                  </div>
                ))}
                {/* Subtotal + tax + total */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `2px solid ${C.border}` }}>
                  {estimate.tax_amount > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13,
                        color: C.secondary, marginBottom: 6 }}>
                        <span>Subtotal</span>
                        <span>{fmt(estimate.subtotal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13,
                        color: C.secondary, marginBottom: 10 }}>
                        <span>Tax ({estimate.tax_rate}%)</span>
                        <span>{fmt(estimate.tax_amount)}</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Total</span>
                    <span style={{ fontSize: 26, fontWeight: 900, color: C.teal, letterSpacing: '-0.5px' }}>
                      {fmt(estimate.total)}
                    </span>
                  </div>
                </div>
              </div>
            </ContentSection>
          )}

          {/* Scope */}
          {estimate.scope_of_work && (
            <ContentSection title="Scope of Work">
              <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.8, margin: 0 }}>
                {estimate.scope_of_work}
              </p>
            </ContentSection>
          )}

          {/* Payment schedule */}
          {displayMilestones.length > 0 && (
            <ContentSection title="Payment Schedule">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Milestone', 'Amount', 'Due'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700,
                        color: C.muted, padding: '0 0 10px', textTransform: 'uppercase',
                        letterSpacing: '0.08em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayMilestones.filter(m => m.pct > 0 && m.amount > 0).map((m, i) => (
                    <tr key={m.id} style={{
                      borderBottom: i < displayMilestones.filter(m => m.pct > 0 && m.amount > 0).length - 1
                        ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '12px 0', fontSize: 14, color: C.text }}>{m.name}</td>
                      <td style={{ padding: '12px 0', fontSize: 14, fontWeight: 700, color: C.text }}>
                        {fmt(m.amount)} ({m.pct}%)
                      </td>
                      <td style={{ padding: '12px 0', fontSize: 13, color: C.secondary }}>{m.due_when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContentSection>
          )}



          {/* Insurance breakdown — shown on public proposal when insurance job */}
          {estimate.insurance_claim && estimate.approved_amount && (estimate.claim_status === 'Approved' || estimate.claim_status === 'Supplement Approved') && (() => {
            const insurancePays = (estimate.approved_amount ?? 0) + (estimate.supplement_amount ?? 0) - (estimate.deductible ?? 0)
            const outOfPocket   = estimate.total - Math.max(insurancePays, 0)
            return (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14,
                padding: 20, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 14 }}>🛡️</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.teal, textTransform: 'uppercase' as const,
                    letterSpacing: '0.07em' }}>Insurance Claim</span>
                  {estimate.insurance_company && (
                    <span style={{ fontSize: 12, color: C.secondary }}>
                      · {estimate.insurance_company}{estimate.claim_number ? ` · #${estimate.claim_number}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: C.secondary }}>Full job cost</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmt(estimate.total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: C.secondary }}>Insurance pays</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{fmt(Math.max(insurancePays, 0))}</span>
                </div>
                <div style={{ height: 1, background: C.border, marginBottom: 10 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>You pay</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: outOfPocket <= 0 ? C.teal : '#D97706',
                    letterSpacing: '-0.02em' }}>{fmt(Math.max(outOfPocket, 0))}</span>
                </div>
              </div>
            )
          })()}

          {/* Terms */}
          {estimate.terms && (
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => setTermsOpen(p => !p)}
                style={{ background: 'none', border: 'none', color: C.teal, fontWeight: 700,
                  fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center',
                  gap: 6, padding: 0 }}>
                Terms &amp; Conditions {termsOpen ? '▲' : '▼'}
              </button>
              {termsOpen && (
                <div style={{ marginTop: 12, fontSize: 13, color: C.secondary, lineHeight: 1.8,
                  padding: '14px 16px', background: '#F8FAFC', borderRadius: 10,
                  border: `1px solid ${C.border}` }}>
                  {estimate.terms}
                </div>
              )}
            </div>
          )}

          {/* Signature */}
          <div ref={signRef}>
            {!isGBB || selectedTier ? (
              <SignatureSection
                lead_name={estimate.lead_name}
                selectedTierLabel={selTierData?.label ?? (isGBB ? null : 'this estimate')}
                onConfirm={handleApprove}
                approving={approving}
              />
            ) : (
              /* GBB with no tier selected — signature hidden until tier chosen */
              /* Right panel already shows the select prompt on desktop */
              /* Mobile only: show a minimal nudge */
              mobile ? (
                <div style={{ textAlign: 'center', padding: '16px', color: C.secondary, fontSize: 14 }}>
                  ☝️ Select an option above to continue
                </div>
              ) : null
            )}
          </div>

          {/* Mobile footer */}
          {mobile && <MobileFooter estimate={estimate} />}
        </div>

        {/* ── RIGHT: sticky summary + contractor ── */}
        {!mobile && (
          <div style={{ position: 'sticky', top: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Selected package summary */}
            <div style={{ background: C.card, borderRadius: 20, padding: 24,
              boxShadow: SHAD2, border: `1px solid ${C.border}` }}>

              {(selTierData || !isGBB) ? (
                <>
                  {/* GBB: show selected package header. Standard: show Estimate Summary header */}
                  {selTierData ? (
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '0.1em',
                      textTransform: 'uppercase', marginBottom: 12, display: 'flex',
                      alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.green,
                        color: '#fff', display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 11 }}>✓</span>
                      Selected Package
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, letterSpacing: '0.1em',
                      textTransform: 'uppercase', marginBottom: 12 }}>
                      Estimate Summary
                    </div>
                  )}

                  {/* GBB only: tier label + brand + warranty */}
                  {selTierData && (
                    <>
                      <div style={{ fontSize: 28, fontWeight: 900, color: C.teal,
                        letterSpacing: '-1px', marginBottom: 2 }}>
                        {selTierData.label.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 2 }}>
                        {selTierData.shingle_brand}
                      </div>
                      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16 }}>
                        {selTierData.warranty}
                      </div>
                      {selTierData.key === 'upgraded' && (
                        <div style={{ background: C.greenBg, border: `1px solid ${C.greenLight}`,
                          borderRadius: 12, padding: 12, marginBottom: 16 }}>
                          <div style={{ fontSize: 13, color: C.green, fontWeight: 700, marginBottom: 4 }}>
                            Great choice!
                          </div>
                          <div style={{ fontSize: 12, color: C.secondary, lineHeight: 1.6 }}>
                            Most homeowners choose this for the best long-term value.
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Financials — same for both standard and GBB */}
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginBottom: 14 }}>
                    {[
                      [selTierData ? 'Roof Replacement' : 'Subtotal', fmt(selSubtotal)],
                      [`Tax (${estimate.tax_rate}%)`, fmt(taxAmt)],
                      ['Deposit Due Today', fmt(depositAmt)],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                        marginBottom: 10, fontSize: 13 }}>
                        <span style={{ color: C.secondary }}>{k}</span>
                        <span style={{ fontWeight: 700, color: k === 'Deposit Due Today' ? C.teal : C.text }}>
                          {v}
                        </span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                      <span style={{ fontWeight: 700, color: C.text }}>Total</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: C.teal }}>{fmt(selTotal)}</span>
                    </div>
                  </div>

                  {/* Install estimate */}
                  <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: C.secondary, marginBottom: 2 }}>Estimated Install</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>2–3 Business Days</div>
                  </div>
                </>
              ) : (
                /* GBB only: no tier selected — show price range teaser */
                (() => {
                  const subtotals = tiers.map((t: any) => t.subtotal ?? 0).filter(Boolean)
                  const minPrice  = Math.min(...subtotals)
                  const maxPrice  = Math.max(...subtotals)
                  const fmtP = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 })
                  return (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const,
                        letterSpacing: '0.1em', color: C.teal, marginBottom: 12 }}>
                        Your Investment Range
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 900, color: C.text,
                        letterSpacing: '-1px', marginBottom: 4 }}>
                        {fmtP(minPrice)} – {fmtP(maxPrice)}
                      </div>
                      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 20 }}>
                        Select an option above to see your exact quote
                      </div>
                      {/* Tier price pills */}
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                        {tiers.map((t: any) => (
                          <div key={t.key} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', borderRadius: 10,
                            background: t.key === 'upgraded' ? C.tealLight : '#F8FAFC',
                            border: `1px solid ${t.key === 'upgraded' ? '#99F6E4' : C.border}`,
                          }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: t.key === 'upgraded' ? C.teal : C.text }}>
                                {t.label}
                              </div>
                              <div style={{ fontSize: 11, color: C.secondary }}>{t.shingle_brand}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800,
                              color: t.key === 'upgraded' ? C.teal : C.text }}>
                              {fmtP(t.subtotal)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()
              )}
            </div>

            {/* Contractor card */}
            <div style={{ background: C.card, borderRadius: 20, padding: 24,
              boxShadow: SHAD, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text,
                marginBottom: 16 }}>Your Contractor</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.navy}, ${C.teal})`,
                  color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>
                  {estimate.pro_name?.split(' ').map(n => n[0]).join('').slice(0, 2) ?? 'SR'}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
                    {estimate.pro_name ?? 'Your Roofer'}
                  </div>
                  <div style={{ fontSize: 12, color: C.secondary }}>Licensed &amp; Insured</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {estimate.pro_phone && (
                  <a href={`tel:${estimate.pro_phone}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                      color: C.secondary, textDecoration: 'none' }}>
                    <span>📞</span>{estimate.pro_phone}
                  </a>
                )}
                {estimate.pro_email && (
                  <a href={`mailto:${estimate.pro_email}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                      color: C.secondary, textDecoration: 'none' }}>
                    <span>✉️</span>{estimate.pro_email}
                  </a>
                )}
                {(estimate.pro_city || estimate.pro_state) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, color: C.secondary }}>
                    <span>📍</span>
                    {[estimate.pro_city, estimate.pro_state].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </div>

            {/* Pro signature — auto-appended to proposal */}
            {estimate.pro_signature && (
              <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16, marginTop: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
                  letterSpacing: '0.07em', marginBottom: 8 }}>Authorized by</div>
                <img src={estimate.pro_signature} alt="Pro signature"
                  style={{ maxHeight: 48, maxWidth: 180, objectFit: 'contain', opacity: 0.85 }} />
                <div style={{ fontSize: 11, color: C.secondary, marginTop: 4 }}>
                  {estimate.pro_name}
                </div>
              </div>
            )}

            {/* ProGuild badge */}
            <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, paddingTop: 4 }}>
              Powered by{' '}
              <a href="https://proguild.ai" target="_blank" rel="noreferrer"
                style={{ color: C.teal, fontWeight: 700, textDecoration: 'none' }}>
                ProGuild.ai
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hero ───────────────────────────────────────────────────────────────────────
function Hero({ estimate }: { estimate: PublicRoofingEstimate }) {
  return (
    <div style={{ background: `linear-gradient(160deg, ${C.navyDark} 0%, ${C.navy} 50%, ${C.tealDark} 100%)`,
      padding: '40px 24px 52px', color: '#fff', textAlign: 'center', position: 'relative',
      overflow: 'hidden' }}>
      {/* Grid texture */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
        backgroundSize: '20px 20px' }} />
      <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
        {/* Pro logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 900 }}>
            {estimate.pro_name?.split(' ').map(n => n[0]).join('').slice(0, 2) ?? 'SR'}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{estimate.pro_name ?? 'Your Roofer'}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {[estimate.pro_city, estimate.pro_state].filter(Boolean).join(', ') || 'Licensed & Insured'}
              &nbsp;·&nbsp;Licensed &amp; Insured
            </div>
          </div>
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.25em',
          textTransform: 'uppercase', opacity: 0.5, marginBottom: 10 }}>
          Roofing Proposal
        </div>
        {/* Title: property address (source of truth from roofing_estimate_data) */}
        <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1px', marginBottom: 6 }}>
          For {estimate.property_address || estimate.lead_name}
        </h1>
        {/* Subtitle: client name — only if it looks like a person's name (not another address) */}
        {estimate.lead_name && estimate.property_address && estimate.lead_name !== estimate.property_address && (
          <div style={{ fontSize: 15, opacity: 0.75, marginBottom: 24 }}>
            Prepared for {estimate.lead_name}
          </div>
        )}
        {!estimate.lead_name && !estimate.property_address && (
          <div style={{ marginBottom: 24 }} />
        )}

        {/* Measurement pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          {[
            estimate.square_count ? { icon: '⊞', text: `${estimate.square_count} squares` } : null,
            estimate.pitch        ? { icon: '△', text: `${estimate.pitch} pitch` }            : null,
            { icon: '📅', text: `Valid until ${new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` },
          ].filter(Boolean).map((p: any) => (
            <div key={p.text} style={{ display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 14px',
              fontSize: 13, fontWeight: 600 }}>
              <span>{p.icon}</span>{p.text}
            </div>
          ))}
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

  const cardBg     = isPremium ? C.navyDark : selected ? C.tealLight : C.card
  const cardBorder = selected ? `2px solid ${C.teal}` : isPremium ? 'none' : `1px solid ${C.border}`
  const cardTextP  = isPremium ? '#fff' : C.text
  const cardTextS  = isPremium ? 'rgba(255,255,255,0.6)' : C.secondary
  const checkColor = isPremium ? '#99F6E4' : C.teal

  return (
    <div onClick={onSelect} style={{ background: cardBg, borderRadius: 24, border: cardBorder,
      padding: 28, cursor: 'pointer',
      boxShadow: selected ? '0 12px 36px rgba(15,118,110,0.14)' : SHAD,
      transition: 'all 0.2s', transform: selected ? 'translateY(-2px)' : 'none',
      position: 'relative' }}>

      {/* Most popular */}
      {isUpgraded && (
        <div style={{ position: 'absolute', top: -14, left: 28,
          background: C.teal, color: '#fff', padding: '5px 16px',
          borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.05em' }}>
          MOST POPULAR
        </div>
      )}

      {/* Selected indicator is shown on the button below — no overlay needed */}

      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 16 }}>
        {/* Left: tier info */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: cardTextS, marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPremium ? '★★' : isUpgraded ? '★' : '◇'} {tier.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: cardTextP,
            letterSpacing: '-0.5px', marginBottom: 2 }}>
            {tier.shingle_brand}
          </div>
          <div style={{ fontSize: 13, color: cardTextS, marginBottom: 16 }}>
            {tier.warranty}
          </div>

          {/* Features — 2-col grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
            {tier.items.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 13, color: cardTextP }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke={checkColor} strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {item.name}
              </div>
            ))}
          </div>
        </div>

        {/* Right: price + CTA */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: cardTextS, marginBottom: 4 }}>
            Total Investment
          </div>
          {/* ↑ 48px price — the key improvement */}
          <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1,
            color: isPremium ? '#99F6E4' : selected ? C.teal : C.text,
            letterSpacing: '-2px', marginBottom: 4 }}>
            {tier.subtotal > 0 ? fmt(tier.subtotal) : '—'}
          </div>
          {/* Financing line */}
          {tier.financing_monthly && (
            <div style={{ fontSize: 13, color: cardTextS, marginBottom: 16 }}>
              Financing from ${tier.financing_monthly}/mo
            </div>
          )}
          {insuranceDed && (
            <div style={{ fontSize: 12, color: cardTextS, marginBottom: 16 }}>
              You pay: {fmt(insuranceDed)}
            </div>
          )}
          <button onClick={e => { e.stopPropagation(); onSelect() }}
            style={{ padding: '13px 20px', borderRadius: 14, border: 'none',
              cursor: 'pointer', fontSize: 14, fontWeight: 800, transition: 'all 0.15s',
              background: selected ? C.green : isPremium ? C.teal : isUpgraded ? C.teal : '#F1F5F9',
              color: selected || isPremium || isUpgraded ? '#fff' : C.text,
              boxShadow: selected ? '0 6px 20px rgba(22,163,74,0.25)' : 'none',
              whiteSpace: 'nowrap' }}>
            {selected ? `✓ ${tier.label} Selected` : `Select ${tier.label} →`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ContentSection ─────────────────────────────────────────────────────────────
function ContentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, borderRadius: 16, padding: 24, marginBottom: 16,
      boxShadow: SHAD }}>
      <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.12em', color: C.teal, marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── SignatureSection ────────────────────────────────────────────────────────────
function SignatureSection({ lead_name, selectedTierLabel, onConfirm, approving }: {
  lead_name: string; selectedTierLabel: string | null
  onConfirm: (sigDataUrl: string) => Promise<void>; approving: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasSig,  setHasSig]  = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [sigMode, setSigMode] = useState<'pick' | 'draw'>('pick')
  const [pickedSig, setPickedSig] = useState<string | null>(null)

  // Generate 3 signature style options from lead_name
  const sigStyles = React.useMemo(() => {
    const name = lead_name ?? ''
    const parts = name.trim().split(' ')
    const first = parts[0] ?? ''
    const last  = parts[parts.length - 1] ?? ''
    const initial = first ? first[0] + '.' : ''
    return [
      { label: name,                    font: 'Dancing Script, cursive' },
      { label: `${first} ${last[0]}.`,  font: 'Pacifico, cursive' },
      { label: `${initial} ${last}`,    font: 'Great Vibes, cursive' },
    ].filter(s => s.label.trim().length > 1)
  }, [lead_name])
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0F172A'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect()
    const sx = c.width / r.width, sy = c.height / r.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy }
    }
    return { x: ((e as React.MouseEvent).clientX - r.left) * sx,
             y: ((e as React.MouseEvent).clientY - r.top) * sy }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current; if (!c) return
    e.preventDefault(); setDrawing(true); lastPos.current = getPos(e, c)
  }
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return
    const c = canvasRef.current; if (!c) return
    e.preventDefault()
    const ctx = c.getContext('2d'); if (!ctx || !lastPos.current) return
    const pos = getPos(e, c)
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y); ctx.stroke()
    lastPos.current = pos
    if (!hasSig) setHasSig(true)
  }
  const endDraw = () => { setDrawing(false); lastPos.current = null }
  const clear = () => {
    const c = canvasRef.current; if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setHasSig(false)
  }
  const confirm = async () => {
    if (pickedSig) {
      // Typed signature: render to an offscreen canvas — the on-screen canvas
      // only mounts in draw mode, so canvasRef is null here.
      const c = document.createElement('canvas')
      c.width = 520; c.height = 160
      const ctx = c.getContext('2d')
      if (!ctx) return
      const pickedFont = sigStyles.find(s => s.label === pickedSig)?.font ?? sigStyles[0]?.font ?? 'cursive'
      ctx.font = `48px ${pickedFont}`
      ctx.fillStyle = '#0F172A'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(pickedSig, c.width / 2, c.height / 2)
      await onConfirm(c.toDataURL('image/png'))
      return
    }
    const c = canvasRef.current; if (!c || !hasSig) return
    await onConfirm(c.toDataURL('image/png'))
  }

  return (
    <div style={{ background: C.card, borderRadius: 20, padding: 28,
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: `1px solid ${C.border}` }}>
      <h3 style={{ fontSize: 20, fontWeight: 900, color: C.text,
        letterSpacing: '-0.5px', marginBottom: 6 }}>
        Sign to approve this proposal
      </h3>
      {selectedTierLabel && (
        <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.7, marginBottom: 20 }}>
          By signing, {lead_name && !lead_name.match(/^\d/) ? lead_name.split(' ')[0] : 'below'}, you approve the{' '}
          <strong style={{ color: C.teal }}>{selectedTierLabel}</strong> option
          and agree to the payment schedule and terms above.
        </p>
      )}

      {/* Google Fonts for signature styles */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Pacifico&family=Great+Vibes&display=swap" />

      {/* Signature style picker */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.secondary, marginBottom: 10,
          textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
          Choose a signature style
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {sigStyles.map((s, i) => (
            <div key={i} onClick={() => { setPickedSig(s.label); setSigMode('pick'); setHasSig(true) }}
              style={{ padding: '14px 18px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                border: `2px solid ${pickedSig === s.label ? C.teal : C.border}`,
                background: pickedSig === s.label ? C.tealLight : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: s.font, fontSize: 28, color: '#0F172A', lineHeight: 1 }}>
                {s.label}
              </span>
              {pickedSig === s.label && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
          ))}
          <div onClick={() => { setPickedSig(null); setSigMode('draw'); setHasSig(false) }}
            style={{ padding: '12px 18px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
              border: `2px solid ${sigMode === 'draw' ? C.teal : C.border}`,
              background: sigMode === 'draw' ? C.tealLight : '#fff',
              fontSize: 14, fontWeight: 600, color: sigMode === 'draw' ? C.teal : C.secondary,
              display: 'flex', alignItems: 'center', gap: 8 }}>
            ✏️ Draw my own signature
          </div>
        </div>
      </div>

      {/* Canvas — shown only in draw mode */}
      {sigMode === 'draw' && <div style={{ border: '2px dashed #99F6E4', borderRadius: 14, overflow: 'hidden',
        background: '#FAFFFE', marginBottom: 12, cursor: 'crosshair', touchAction: 'none',
        position: 'relative' }}>
        <canvas ref={canvasRef} width={520} height={160}
          style={{ width: '100%', height: 160, display: 'block' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
        {!hasSig && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ textAlign: 'center', color: C.muted }}>
              <div style={{ fontSize: 26, marginBottom: 4 }}>✍️</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Sign here</div>
            </div>
          </div>
        )}
      </div>}

      <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: 16 }} />

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={clear}
          style={{ padding: '13px 24px', borderRadius: 12, border: `1.5px solid ${C.border}`,
            background: '#fff', fontWeight: 700, fontSize: 14, color: C.danger, cursor: 'pointer' }}>
          Clear
        </button>
        <button onClick={confirm} disabled={!hasSig || approving}
          style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', fontWeight: 800,
            fontSize: 15, transition: 'all 0.2s',
            background: hasSig ? `linear-gradient(135deg, ${C.teal}, #0D9488)` : '#E2E8F0',
            color: hasSig ? '#fff' : C.muted,
            cursor: hasSig ? 'pointer' : 'default',
            boxShadow: hasSig ? '0 6px 20px rgba(15,118,110,0.2)' : 'none' }}>
          {approving ? 'Submitting...' : '✓ Confirm & Sign Proposal'}
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

// ── MobileFooter ───────────────────────────────────────────────────────────────
function MobileFooter({ estimate }: { estimate: PublicRoofingEstimate }) {
  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}`,
      textAlign: 'center' }}>
      {estimate.pro_phone && (
        <p style={{ fontSize: 14, color: C.secondary, marginBottom: 8 }}>
          <strong>Questions?</strong> Call{' '}
          <a href={`tel:${estimate.pro_phone}`}
            style={{ color: C.teal, fontWeight: 700, textDecoration: 'none' }}>
            {estimate.pro_phone}
          </a>
        </p>
      )}
      <p style={{ fontSize: 12, color: C.muted }}>
        Powered by{' '}
        <a href="https://proguild.ai" target="_blank" rel="noreferrer"
          style={{ color: C.teal, fontWeight: 700, textDecoration: 'none' }}>
          ProGuild.ai
        </a>
      </p>
    </div>
  )
}
