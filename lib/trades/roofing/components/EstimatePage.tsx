'use client'
// lib/trades/roofing/components/EstimatePage.tsx
// Roofing-specific estimate builder. Rendered by app/dashboard/estimates/[id]/page.tsx
// when session.trade_slug is roofing. DashboardShell is NOT rendered here — shell wraps this.

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TierKey = 'standard' | 'upgraded' | 'premium'

export interface TierLineItem {
  id: string
  name: string
  qty: number
  unit: string        // 'sq' | 'ea' | 'lf' | 'hr'
  unit_price: number
  amount: number
}

export interface Tier {
  key: TierKey
  label: string           // editable — default: Standard / Upgraded / Premium
  shingle_brand: string
  warranty: string
  items: TierLineItem[]
  subtotal: number
}

export interface PaymentMilestone {
  id: string
  name: string
  pct: number
  amount: number
  due_when: string
}

export interface RoofingEstimate {
  id: string
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'declined' | 'invoiced' | 'paid' | 'void'
  lead_id?: string
  lead_name: string
  contact_phone?: string
  contact_email?: string
  property_address?: string
  created_at: string
  updated_at?: string
  valid_until: string
  // Proposal type
  estimate_type: 'standard' | 'tiered'
  tiered_data?: { tiers: Tier[]; selected_tier?: TierKey }
  // Standard estimate items
  items?: TierLineItem[]
  // Roofing measurements (from roofing_job_data)
  square_count?: number
  pitch?: string
  waste_pct?: number
  // Insurance
  insurance_claim?: boolean
  insurance_company?: string
  claim_number?: string
  adjuster_name?: string
  approved_amount?: number
  deductible?: number
  supplement_amount?: number
  // Financials
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  scope_of_work?: string
  terms?: string
  payment_milestones?: PaymentMilestone[]
  // Timeline
  timeline?: { event: string; label: string; timestamp: string | null }[]
  // Pro info
  pro_name?: string
  pro_phone?: string
  pro_email?: string
}

export interface GBBTemplate {
  id: string
  name: string
  use_count: number
  last_used?: string
  tiers: { standard_ppsq: number; upgraded_ppsq: number; premium_ppsq: number }
}

interface Props {
  estimate: RoofingEstimate
  templates?: GBBTemplate[]
  onSave: (updates: Partial<RoofingEstimate>) => Promise<void>
  onSend: () => Promise<void>
  onBack: () => void
  darkMode?: boolean
  // Called when roofer edits address/measurements — updates lead + roofing_estimate_data
  onMeasurementsUpdate?: (fields: { property_address?: string; square_count?: number; pitch?: string; waste_pct?: number }) => Promise<void>
  materialPrices?: Record<string, number> | null
  onDirty?: () => void
  // Allows parent (page.tsx) to surface messages in the toolbar — onSend/onSave errors
  externalSaveMsg?: string | null
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  teal:       '#0F766E',
  tealLight:  '#F0FDFA',
  tealGlow:   'rgba(15,118,110,0.12)',
  navy:       '#0C3547',
  navyDark:   '#0A2535',
  bg:         '#F1F5F9',
  card:       '#FFFFFF',
  text:       '#0F172A',
  secondary:  '#64748B',
  muted:      '#94A3B8',
  border:     '#E2E8F0',
  amber:      '#F59E0B',
  amberBg:    '#FFFBEB',
  amberBorder:'#FDE68A',
  green:      '#16A34A',
  greenBg:    '#ECFDF5',
  danger:     '#DC2626',
}

const SHADOW_SM  = '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'
const SHADOW_MD  = '0 4px 16px rgba(0,0,0,0.08)'
const SHADOW_SEL = '0 8px 32px rgba(15,118,110,0.16)'

const font = "'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif"

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtDec = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function newId() { return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6) + '-4' + Math.random().toString(36).slice(2, 5) + '-' + Math.random().toString(36).slice(2, 10) }

const DEFAULT_MILESTONES = (total: number): PaymentMilestone[] => [
  { id: newId(), name: 'Deposit',              pct: 30, amount: Math.round(total * 0.3), due_when: 'Due at signing' },
  { id: newId(), name: 'At Material Delivery', pct: 40, amount: Math.round(total * 0.4), due_when: 'Due at delivery' },
  { id: newId(), name: 'On Completion',        pct: 30, amount: Math.round(total * 0.3), due_when: 'Due on completion' },
]

// ── Market-rate FL defaults — overridden by pro's material prices settings ──
const MARKET_DEFAULTS = {
  shingles_standard: 285, shingles_upgraded: 340, shingles_premium: 420,
  underlayment: 22, ice_water: 35, ridge_cap: 4, starter_strip: 2,
  drip_edge: 3, nails: 2.5, labor_standard: 85, labor_upgraded: 90, labor_premium: 100,
}

function buildDefaultTiers(prices?: Record<string, number> | null): Tier[] {
  const p = { ...MARKET_DEFAULTS, ...(prices ?? {}) }
  return [
    {
      key: 'standard', label: 'Standard',
      shingle_brand: 'CertainTeed Landmark', warranty: '30-year warranty',
      subtotal: 0,
      items: [
        { id: newId(), name: 'Shingles',              qty: 0, unit: 'sq', unit_price: p.shingles_standard, amount: 0 },
        { id: newId(), name: 'Synthetic underlayment', qty: 0, unit: 'sq', unit_price: p.underlayment,       amount: 0 },
        { id: newId(), name: 'Ridge cap',              qty: 0, unit: 'lf', unit_price: p.ridge_cap,         amount: 0 },
        { id: newId(), name: 'Starter strip',          qty: 0, unit: 'lf', unit_price: p.starter_strip,     amount: 0 },
        { id: newId(), name: 'Labor',                  qty: 0, unit: 'sq', unit_price: p.labor_standard,    amount: 0 },
      ],
    },
    {
      key: 'upgraded', label: 'Upgraded',
      shingle_brand: 'Owens Corning Duration', warranty: '30-year warranty',
      subtotal: 0,
      items: [
        { id: newId(), name: 'Shingles',              qty: 0, unit: 'sq', unit_price: p.shingles_upgraded, amount: 0 },
        { id: newId(), name: 'Synthetic underlayment', qty: 0, unit: 'sq', unit_price: p.underlayment,      amount: 0 },
        { id: newId(), name: 'Ice & water shield',    qty: 0, unit: 'sq', unit_price: p.ice_water,         amount: 0 },
        { id: newId(), name: 'Ridge cap',             qty: 0, unit: 'lf', unit_price: p.ridge_cap,         amount: 0 },
        { id: newId(), name: 'Starter strip',         qty: 0, unit: 'lf', unit_price: p.starter_strip,     amount: 0 },
        { id: newId(), name: 'Labor',                 qty: 0, unit: 'sq', unit_price: p.labor_upgraded,    amount: 0 },
      ],
    },
    {
      key: 'premium', label: 'Premium',
      shingle_brand: 'GAF Timberline HDZ', warranty: 'Lifetime warranty',
      subtotal: 0,
      items: [
        { id: newId(), name: 'Shingles',              qty: 0, unit: 'sq', unit_price: p.shingles_premium,  amount: 0 },
        { id: newId(), name: 'Synthetic underlayment', qty: 0, unit: 'sq', unit_price: p.underlayment,      amount: 0 },
        { id: newId(), name: 'Ice & water shield',    qty: 0, unit: 'sq', unit_price: p.ice_water,         amount: 0 },
        { id: newId(), name: 'Drip edge upgrade',     qty: 0, unit: 'lf', unit_price: p.drip_edge,         amount: 0 },
        { id: newId(), name: 'Ridge cap',             qty: 0, unit: 'lf', unit_price: p.ridge_cap,         amount: 0 },
        { id: newId(), name: 'Starter strip',         qty: 0, unit: 'lf', unit_price: p.starter_strip,     amount: 0 },
        { id: newId(), name: 'Labor',                 qty: 0, unit: 'sq', unit_price: p.labor_premium,     amount: 0 },
      ],
    },
  ]
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function RoofingEstimatePage({ estimate, templates = [], onSave, onSend, onBack, darkMode, onMeasurementsUpdate, materialPrices, onDirty, externalSaveMsg }: Props) {
  const dk = darkMode ?? false

  // Proposal type
  const [estType, setEstType] = useState<'standard' | 'tiered'>(
    estimate.estimate_type ?? 'tiered'
  )

  // Measurements state — editable inline
  const [addrVal,   setAddrVal]   = useState<string>(estimate.property_address ?? '')
  const [sqCount,   setSqCount]   = useState<string>(String(estimate.square_count ?? ''))
  const [pitchVal,  setPitchVal]  = useState<string>(estimate.pitch ?? '6/12')
  const [wastePct,  setWastePct]  = useState<string>(String(estimate.waste_pct ?? 10))
  const [perimLF,   setPerimLF]   = useState<number | undefined>((estimate as any).perimeter ?? undefined)
  const [editMeas,  setEditMeas]  = useState(false)
  const [savingMeas,setSavingMeas]= useState(false)


  // GBB state — initialise from DB or defaults
  const [tiers, setTiers] = useState<Tier[]>(() => {
    if (estimate.tiered_data?.tiers?.length) return estimate.tiered_data.tiers
    // Pre-fill quantities from square_count + perimeter
    // Use real perimeter from ProMeasure if available, else estimate sq * 10
    const sq = estimate.square_count ?? 0
    const perim = (estimate as any).perimeter ?? Math.round(sq * 10)
    return buildDefaultTiers(materialPrices).map(t => ({
      ...t,
      items: t.items.map(item => {
        const qty = item.unit === 'sq' ? sq : item.unit === 'lf' ? perim : 0
        return { ...item, qty, amount: Math.round(qty * item.unit_price) }
      }),
      subtotal: t.items.reduce((s, item) => {
        const qty = item.unit === 'sq' ? sq : item.unit === 'lf' ? perim : 0
        return s + Math.round(qty * item.unit_price)
      }, 0),
    }))
  })

  const [selectedTier, setSelectedTier] = useState<TierKey>(
    estimate.tiered_data?.selected_tier ?? 'upgraded'
  )

  // Standard items
  const [stdItems, setStdItems] = useState<TierLineItem[]>(
    estimate.items ?? buildDefaultTiers(materialPrices)[0].items
  )

  // Other fields
  const [scope, setScope]       = useState(estimate.scope_of_work ?? '')
  const [terms, setTerms]       = useState(estimate.terms ?? 'This proposal is valid for 14 days. Payment is due per the schedule above. A deposit is required before work begins. Prices may adjust if insurance supplements are approved.')
  const [showTerms, setShowTerms]         = useState(false)  // collapsed by default
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const savedEstType                       = useRef<string>(estimate.estimate_type ?? 'tiered')
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<'standard' | 'tiered' | null>(null)

  // Payment milestones — derived from selected tier total
  const activeTierSubtotal = estType === 'tiered'
    ? (tiers.find(t => t.key === selectedTier)?.subtotal ?? 0)
    : (stdItems.reduce((s, i) => s + i.amount, 0))

  const taxAmt  = Math.round(activeTierSubtotal * (estimate.tax_rate / 100))
  const total   = activeTierSubtotal + taxAmt

  const [milestones, setMilestones] = useState<PaymentMilestone[]>(
    estimate.payment_milestones ?? DEFAULT_MILESTONES(total)
  )

  // Recalc milestone amounts when total changes
  const recalcMilestones = useCallback((newTotal: number) => {
    setMilestones(ms => ms.map(m => ({ ...m, amount: Math.round(newTotal * m.pct / 100) })))
  }, [])

  // Recalc all tier quantities + amounts when measurements change
  const recalcTiersFromSq = useCallback((sq: number, selTier?: TierKey, perimLF?: number): number => {
    let selSubtotal = 0
    // LF fallback: use real perimeter if available, otherwise estimate as sq * 10
    // Real perimeter comes from roofing_job_data (ProMeasure polygon perimeter)
    const lfQty = perimLF ?? Math.round(sq * 10)
    setTiers(prev => prev.map(tier => {
      const items = tier.items.map(item => {
        const qty = item.unit === 'sq' ? sq : item.unit === 'lf' ? lfQty : item.qty
        return { ...item, qty, amount: Math.round(qty * item.unit_price) }
      })
      const subtotal = items.reduce((s, i) => s + i.amount, 0)
      if (tier.key === (selTier ?? 'upgraded')) selSubtotal = subtotal
      return { ...tier, items, subtotal }
    }))
    return selSubtotal
  }, [])

  // Save measurements + address — updates roofing_estimate_data + lead
  const saveMeasurements = useCallback(async () => {
    setSavingMeas(true)
    const sq = parseFloat(sqCount) || 0
    const wp = parseFloat(wastePct) || 10
    const newSubtotal = recalcTiersFromSq(sq, selectedTier, perimLF)
    const newTotal = newSubtotal + Math.round(newSubtotal * (estimate.tax_rate / 100))
    recalcMilestones(newTotal)
    try {
      await onSave({ square_count: sq, pitch: pitchVal, waste_pct: wp } as any)
      if (onMeasurementsUpdate) {
        await onMeasurementsUpdate({
          property_address: addrVal || undefined,
          square_count: sq,
          pitch: pitchVal,
          waste_pct: wp,
        })
      }
    } finally {
      setSavingMeas(false)
      setEditMeas(false)
    }
  }, [addrVal, sqCount, pitchVal, wastePct, selectedTier, recalcTiersFromSq, recalcMilestones, onSave, onMeasurementsUpdate, estimate.tax_rate])

  // ── Tier item editing ────────────────────────────────────────────────────────

  const updateTierItem = (tierKey: TierKey, itemId: string, field: keyof TierLineItem, val: string | number) => {
    setIsDirty(true)
    setTiers(prev => prev.map(t => {
      if (t.key !== tierKey) return t
      const items = t.items.map(item => {
        if (item.id !== itemId) return item
        const updated = { ...item, [field]: val }
        updated.amount = Math.round(Number(updated.qty) * Number(updated.unit_price))
        return updated
      })
      const subtotal = items.reduce((s, i) => s + i.amount, 0)
      return { ...t, items, subtotal }
    }))
  }

  const addTierItem = (tierKey: TierKey) => {
    setIsDirty(true)
    setTiers(prev => prev.map(t => {
      if (t.key !== tierKey) return t
      const newItem: TierLineItem = { id: newId(), name: 'New item', qty: 1, unit: 'sq', unit_price: 0, amount: 0 }
      return { ...t, items: [...t.items, newItem] }
    }))
  }

  const deleteTierItem = (tierKey: TierKey, itemId: string) => {
    setIsDirty(true)
    setTiers(prev => prev.map(t => {
      if (t.key !== tierKey) return t
      const items    = t.items.filter(i => i.id !== itemId)
      const subtotal = items.reduce((s, i) => s + i.amount, 0)
      return { ...t, items, subtotal }
    }))
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        estimate_type:      estType,
        tiered_data:        estType === 'tiered' ? { tiers, selected_tier: selectedTier } : undefined,
        items:              estType === 'standard' ? stdItems : undefined,
        scope_of_work:      scope,
        terms,
        payment_milestones: milestones,
        subtotal:           activeTierSubtotal,
        tax_amount:         taxAmt,
        total,
      })
      setIsDirty(false)
      setSaveMsg('Saved ✓')
    } catch { setSaveMsg('Save failed') }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 2500) }
  }

  // Auto-save removed — universal Save button handles all saves

  // ── Selected tier data for right panel ───────────────────────────────────────
  const selTierData = tiers.find(t => t.key === selectedTier)
  const tierLabels: Record<TierKey, string> = {
    standard: tiers[0]?.label ?? 'Standard',
    upgraded: tiers[1]?.label ?? 'Upgraded',
    premium:  tiers[2]?.label ?? 'Premium',
  }
  const tierTotals: Record<TierKey, number> = {
    standard: tiers[0]?.subtotal ?? 0,
    upgraded: tiers[1]?.subtotal ?? 0,
    premium:  tiers[2]?.subtotal ?? 0,
  }

  const pct21 = tierTotals.standard > 0
    ? Math.round(((tierTotals.upgraded - tierTotals.standard) / tierTotals.standard) * 100)
    : 0

  // ── Render ───────────────────────────────────────────────────────────────────
  const bg    = dk ? '#0A1628' : C.bg
  const card  = dk ? '#0F1E35' : C.card
  const textP = dk ? '#F1F5F9' : C.text
  const textS = dk ? '#94A3B8' : C.secondary
  const border= dk ? '#1E293B' : C.border

  return (
    <div style={{ fontFamily: font, background: bg, minHeight: '100vh', color: textP }}>

      {/* ── Top header ── */}
      <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: '14px 32px',
        display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 30,
        boxShadow: SHADOW_SM }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: textS, background: 'none',
            border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Jobs
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
            #{estimate.estimate_number}
          </span>
          <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
            background: estimate.status === 'draft' ? '#FEF9C3' : C.tealLight,
            color: estimate.status === 'draft' ? '#854D0E' : C.teal }}>
            {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
          </span>
          {(saveMsg || externalSaveMsg) && (
            <span style={{ fontSize: 13, fontWeight: 600, color: (saveMsg || externalSaveMsg)!.includes('✓') ? C.green : C.danger }}>
              {saveMsg || externalSaveMsg}
            </span>
          )}
        </div>


        <button onClick={handleSave} disabled={saving}
          style={{
            padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
            transition: 'all 0.2s',
            // Dirty: teal filled — demands attention. Clean: grey outline — quiet
            border: isDirty ? 'none' : `1.5px solid ${border}`,
            background: saving ? '#CBD5E1' : isDirty ? C.teal : 'transparent',
            color: isDirty ? '#fff' : textS,
            boxShadow: isDirty && !saving ? '0 2px 8px rgba(15,118,110,0.3)' : 'none',
          }}>
          {saving ? 'Saving…' : isDirty ? '● Save changes' : 'Saved'}
        </button>

        {(() => {
          const hasEmail = !!(estimate.contact_email)
          const alreadySent = !['draft', 'viewed'].includes(estimate.status)
          if (alreadySent) return null
          if (!hasEmail) return (
            <button
              onClick={() => {
                // Scroll to recipient card in right panel
                document.getElementById('pg-recipient-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              style={{ padding: '9px 22px', borderRadius: 10, border: '2px solid #F59E0B',
                background: '#FFFBEB', color: '#92400E', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Add email to send
            </button>
          )
          return (
            <button onClick={onSend}
              style={{ padding: '9px 22px', borderRadius: 10, border: 'none',
                background: `linear-gradient(135deg, ${C.teal}, #0D9488)`,
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Send to Homeowner
            </button>
          )
        })()}
        <div style={{ fontSize: 12, color: textS }}>Client can approve &amp; pay instantly</div>
      </div>

      {/* ── Progress timeline ── */}
      <ProgressTimeline timeline={estimate.timeline ?? []} border={border} textS={textS} card={card} />

      {/* ── Two-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, padding: '24px 32px',
        alignItems: 'start', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Property + measurements */}
          <PropertyCard
            estimate={estimate} card={card} border={border} textP={textP} textS={textS}
            addrVal={addrVal} setAddrVal={setAddrVal}
            sqCount={sqCount} setSqCount={setSqCount}
            pitchVal={pitchVal} setPitchVal={setPitchVal}
            wastePct={wastePct} setWastePct={setWastePct}
            editMeas={editMeas} setEditMeas={setEditMeas}
            savingMeas={savingMeas} onSaveMeas={saveMeasurements}
          />

          {/* Proposal type toggle */}
          <ProposalTypeToggle
            value={pendingTypeSwitch ?? estType} onChange={v => {
            if (v === estType) return
            // Don't silently switch — show confirmation banner
            setPendingTypeSwitch(v as 'standard' | 'tiered')
          }}
            card={card} border={border} textP={textP} textS={textS}
          />

          {/* GBB tiers OR standard items */}
          {/* ── Pending type switch confirmation ─────────────────────────────── */}
          {pendingTypeSwitch && (
            <div style={{
              margin: '12px 0', padding: '14px 18px', borderRadius: 10,
              background: '#FFFBEB', border: '1px solid #FDE68A',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>
                  Switch to {pendingTypeSwitch === 'tiered' ? 'Good / Better / Best' : 'Standard'}?
                </div>
                <div style={{ fontSize: 12, color: '#B45309' }}>
                  {pendingTypeSwitch === 'standard'
                    ? 'Your GBB tiers are saved. This proposal will send as a single line-item estimate.'
                    : 'Your line items are saved. This proposal will send as a 3-tier GBB estimate.'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => setPendingTypeSwitch(null)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #FDE68A',
                    background: 'transparent', color: '#92400E', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setEstType(pendingTypeSwitch)
                    savedEstType.current = pendingTypeSwitch
                    setPendingTypeSwitch(null)
                    // Save the type switch immediately — this is a deliberate action
                    await onSave({
                      estimate_type: pendingTypeSwitch,
                      tiered_data:   pendingTypeSwitch === 'tiered' ? { tiers, selected_tier: selectedTier } : undefined,
                      items:         pendingTypeSwitch === 'standard' ? stdItems : undefined,
                      subtotal:      activeTierSubtotal,
                      tax_amount:    taxAmt,
                      total,
                    })
                  }}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none',
                    background: C.teal, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Switch & Save
                </button>
              </div>
            </div>
          )}

          {estType === 'tiered' ? (
            <GBBSection
              tiers={tiers} selectedTier={selectedTier}
              onSelect={t => { setSelectedTier(t); recalcMilestones(tierTotals[t] + Math.round(tierTotals[t] * estimate.tax_rate / 100)) }}
              onUpdateItem={updateTierItem} onAddItem={addTierItem} onDeleteItem={deleteTierItem}
              onUpdateLabel={(key, label) => setTiers(prev => prev.map(t => t.key === key ? { ...t, label } : t))}
              onUpdateBrand={(key, brand) => setTiers(prev => prev.map(t => t.key === key ? { ...t, shingle_brand: brand } : t))}
              onUpdateWarranty={(key, w) => setTiers(prev => prev.map(t => t.key === key ? { ...t, warranty: w } : t))}
              card={card} border={border} textP={textP} textS={textS}
            />
          ) : (
            <StandardSection
              items={stdItems} onUpdateItem={(id, field, val) => {
                setIsDirty(true)
                setStdItems(prev => prev.map(i => {
                  if (i.id !== id) return i
                  const up = { ...i, [field]: val }
                  up.amount = Math.round(Number(up.qty) * Number(up.unit_price))
                  return up
                }))
              }}
              onAdd={(id) => { setIsDirty(true); setStdItems(prev => [...prev, { id, name: '', qty: 1, unit: 'sq', unit_price: 0, amount: 0 }]) }}
              onDelete={(id) => { setIsDirty(true); setStdItems(prev => prev.filter(i => i.id !== id)) }}
              card={card} border={border} textP={textP} textS={textS}
            />
          )}

          {/* Scope of work */}
          <ScopeCard scope={scope} onChange={v => { setScope(v); setIsDirty(true) }} card={card} border={border} textP={textP} textS={textS} />

          {/* Insurance claim — only when relevant */}
          {estimate.insurance_claim && (
            <InsuranceCard estimate={estimate} card={card} border={border} textP={textP} textS={textS} />
          )}

          {/* Terms */}
          <TermsCard terms={terms} onChange={v => { setTerms(v); setIsDirty(true) }} show={showTerms} onToggle={() => setShowTerms(p => !p)}
            card={card} border={border} textP={textP} textS={textS} />

        </div>

        {/* ── RIGHT PANEL ── */}
        <RightPanel
          estType={estType} tiers={tiers} tierLabels={tierLabels} tierTotals={tierTotals}
          selectedTier={selectedTier} selTierData={selTierData}
          total={total} taxAmt={taxAmt} taxRate={estimate.tax_rate}
          pct21={pct21} validUntil={estimate.valid_until}
          milestones={milestones} onUpdateMilestone={(id, field, val) => {
            setIsDirty(true)
            setMilestones(prev => prev.map(m => m.id === id ? { ...m, [field]: val } : m))
          }}
          onAddMilestone={() => setMilestones(prev => [...prev, { id: newId(), name: 'Milestone', pct: 0, amount: 0, due_when: 'TBD' }])}
          estimate={estimate}
          onSave={onSave}
          card={card} border={border} textP={textP} textS={textS}
          dk={dk}
        />
      </div>
    </div>
  )
}

function ProgressTimeline({ timeline, border, textS, card }: {
  timeline: { event: string; label: string; timestamp: string | null }[]
  border: string; textS: string; card: string
}) {
  const steps = [
    { key: 'sent',     icon: '✉', label: 'Sent' },
    { key: 'viewed',   icon: '👁', label: 'Viewed' },
    { key: 'approved', icon: '✓',  label: 'Approved' },
    { key: 'invoiced', icon: '📄', label: 'Invoice' },
    { key: 'paid',     icon: '$',  label: 'Payment received' },
  ]
  const doneKeys = timeline.filter(t => t.timestamp).map(t => t.event)

  return (
    <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: '16px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 700, gap: 0 }}>
        {steps.map((step, i) => {
          const done = doneKeys.includes(step.key)
          const tl = timeline.find(t => t.event === step.key)
          return (
            <React.Fragment key={step.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                  background: done ? C.teal : '#F1F5F9',
                  color: done ? '#fff' : C.muted,
                  border: done ? 'none' : `1.5px solid ${C.border}`,
                  transition: 'all 0.2s',
                }}>
                  {step.icon}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: done ? C.teal : textS }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {tl?.timestamp ? new Date(tl.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Not yet'}
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? C.teal : C.border,
                  margin: '-20px 8px 0', transition: 'background 0.3s' }} />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}


// ── PropertyCard ───────────────────────────────────────────────────────────────
const PITCH_OPTIONS = ['3/12','4/12','5/12','6/12','7/12','8/12','9/12','10/12','12/12']

function PropertyCard({ estimate, card, border, textP, textS,
  addrVal, setAddrVal, sqCount, setSqCount, pitchVal, setPitchVal, wastePct, setWastePct,
  editMeas, setEditMeas, savingMeas, onSaveMeas }: {
  estimate: RoofingEstimate; card: string; border: string; textP: string; textS: string
  addrVal: string; setAddrVal: (v: string) => void
  sqCount: string; setSqCount: (v: string) => void
  pitchVal: string; setPitchVal: (v: string) => void
  wastePct: string; setWastePct: (v: string) => void
  editMeas: boolean; setEditMeas: (v: boolean) => void
  savingMeas: boolean; onSaveMeas: () => Promise<void>
}) {
  const hasSq = parseFloat(sqCount) > 0

  return (
    <div style={{ background: card, borderRadius: 16, padding: '20px 24px', boxShadow: SHADOW_SM,
      border: `1px solid ${border}` }}>
      {/* Address row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: editMeas ? 20 : 0 }}>
        <div style={{ width: 56, height: 48, borderRadius: 10, flexShrink: 0,
          background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: textP, marginBottom: 2 }}>
            {addrVal || estimate.property_address || 'No address on file'}
          </div>
          <div style={{ fontSize: 13, color: textS }}>{estimate.lead_name} · Lead</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Measurement pills — click to edit */}
          {hasSq ? (
            <>
              <MeasPill label={`${sqCount} sq`} warn={false} />
              <MeasPill label={`${pitchVal} pitch`} warn={false} />
              <MeasPill label={`${wastePct}% waste`} warn={false} />
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: C.danger,
              background: '#FEF2F2', border: '1px solid #FECACA',
              padding: '5px 12px', borderRadius: 8 }}>
              ⚠ No measurements — enter below
            </span>
          )}
          <button onClick={() => setEditMeas(!editMeas)}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: editMeas ? '#F1F5F9' : C.tealLight,
              color: editMeas ? textS : C.teal,
              border: `1.5px solid ${editMeas ? border : '#99F6E4'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
            {editMeas ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Inline measurement editor */}
      {editMeas && (
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: textS, marginBottom: 14 }}>
            Property &amp; Measurements
          </div>
          {/* Address — updates both roofing_estimate_data and leads.property_address */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: textS, display: 'block', marginBottom: 6 }}>
              Property Address
            </label>
            <input
              type="text"
              value={addrVal}
              onChange={e => setAddrVal(e.target.value)}
              placeholder="9933 Orchard Hills Rd, Jacksonville FL 32256"
              style={{ width: '100%', border: `1.5px solid ${border}`, borderRadius: 8,
                padding: '10px 12px', fontSize: 14, outline: 'none',
                background: '#F8FAFC', color: textP, boxSizing: 'border-box' }}
              onFocus={e => (e.target.style.borderColor = C.teal)}
              onBlur={e => (e.target.style.borderColor = border)}
            />
            <div style={{ fontSize: 11, color: textS, marginTop: 4 }}>
              Saves to this proposal and the lead record
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Squares */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: textS,
                display: 'block', marginBottom: 6 }}>Squares *</label>
              <input
                type="number" min="0" step="0.5"
                value={sqCount}
                onChange={e => setSqCount(e.target.value)}
                placeholder="e.g. 28"
                style={{ width: '100%', border: `1.5px solid ${parseFloat(sqCount) > 0 ? C.teal : border}`,
                  borderRadius: 8, padding: '10px 12px', fontSize: 16, fontWeight: 700,
                  outline: 'none', boxSizing: 'border-box',
                  background: parseFloat(sqCount) > 0 ? C.tealLight : '#F8FAFC', color: textP }}
                onFocus={e => e.target.style.borderColor = C.teal}
                onBlur={e => e.target.style.borderColor = parseFloat(sqCount) > 0 ? C.teal : border}
              />
              <div style={{ fontSize: 11, color: textS, marginTop: 4 }}>
                Drives all line item quantities
              </div>
            </div>
            {/* Pitch */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: textS,
                display: 'block', marginBottom: 6 }}>Pitch</label>
              <select
                value={pitchVal}
                onChange={e => setPitchVal(e.target.value)}
                style={{ width: '100%', border: `1.5px solid ${border}`, borderRadius: 8,
                  padding: '10px 12px', fontSize: 15, outline: 'none',
                  background: '#F8FAFC', color: textP, boxSizing: 'border-box',
                  cursor: 'pointer' }}>
                {PITCH_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {/* Waste */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: textS,
                display: 'block', marginBottom: 6 }}>Waste %</label>
              <select
                value={wastePct}
                onChange={e => setWastePct(e.target.value)}
                style={{ width: '100%', border: `1.5px solid ${border}`, borderRadius: 8,
                  padding: '10px 12px', fontSize: 15, outline: 'none',
                  background: '#F8FAFC', color: textP, boxSizing: 'border-box',
                  cursor: 'pointer' }}>
                {[10,12,15,18,20].map(w => (
                  <option key={w} value={w}>{w}%{w === 10 ? ' (standard)' : w === 15 ? ' (complex)' : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onSaveMeas} disabled={savingMeas || !parseFloat(sqCount)}
              style={{ padding: '11px 28px', borderRadius: 10, border: 'none',
                background: parseFloat(sqCount) > 0 ? `linear-gradient(135deg, ${C.teal}, #0D9488)` : '#E2E8F0',
                color: parseFloat(sqCount) > 0 ? '#fff' : C.muted,
                fontWeight: 800, fontSize: 14, cursor: parseFloat(sqCount) > 0 ? 'pointer' : 'default',
                transition: 'all 0.15s' }}>
              {savingMeas ? 'Saving...' : 'Apply & Recalculate All Tiers'}
            </button>
            {!parseFloat(sqCount) && (
              <span style={{ fontSize: 13, color: C.danger }}>Enter square count to continue</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MeasPill({ label, warn }: { label: string; warn: boolean }) {
  return (
    <span style={{ padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
      background: warn ? '#FEF2F2' : C.tealLight,
      color: warn ? C.danger : C.teal,
      border: `1px solid ${warn ? '#FECACA' : '#99F6E4'}` }}>
      {label}
    </span>
  )
}

// ── ProposalTypeToggle ──────────────────────────────────────────────────────────
function ProposalTypeToggle({ value, onChange, card, border, textP, textS }: {
  value: 'standard' | 'tiered'
  onChange: (v: 'standard' | 'tiered') => void
  card: string; border: string; textP: string; textS: string
}) {
  return (
    <div style={{ background: card, borderRadius: 16, padding: '20px 24px', boxShadow: SHADOW_SM,
      border: `1px solid ${border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: textS }}>
          Proposal Type
        </span>
        <div style={{ display: 'flex', background: '#F8FAFC', borderRadius: 10, border: `1px solid ${border}`, padding: 4, gap: 4 }}>
          {(['standard', 'tiered'] as const).map(v => (
            <button key={v} onClick={() => onChange(v)}
              style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                fontWeight: 700, fontSize: 13,
                background: value === v ? C.teal : 'transparent',
                color: value === v ? '#fff' : textS }}>
              {v === 'standard' ? 'Standard' : 'Good / Better / Best'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 13, color: textS, marginLeft: 'auto' }}>
          {value === 'tiered'
            ? '↑ Homeowners who choose close 40% higher value'
            : 'Single option estimate'}
        </span>
      </div>
    </div>
  )
}

// ── GBBSection ─────────────────────────────────────────────────────────────────
function GBBSection({ tiers, selectedTier, onSelect, onUpdateItem, onAddItem, onDeleteItem,
  onUpdateLabel, onUpdateBrand, onUpdateWarranty,
  card, border, textP, textS }: {
  tiers: Tier[]
  selectedTier: TierKey
  onSelect: (k: TierKey) => void
  onUpdateItem: (tier: TierKey, itemId: string, field: keyof TierLineItem, val: string | number) => void
  onAddItem: (tier: TierKey) => void
  onDeleteItem: (tier: TierKey, itemId: string) => void
  onUpdateLabel: (tier: TierKey, label: string) => void
  onUpdateBrand: (tier: TierKey, brand: string) => void
  onUpdateWarranty: (tier: TierKey, w: string) => void
  card: string; border: string; textP: string; textS: string
}) {
  return (
    <div style={{ background: card, borderRadius: 16, padding: '24px', boxShadow: SHADOW_SM,
      border: `1px solid ${border}` }}>
      {/* 3-col tier grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {tiers.map(tier => (
          <TierCard key={tier.key} tier={tier} selected={selectedTier === tier.key}
            onSelect={() => onSelect(tier.key)}
            onUpdateItem={(itemId, field, val) => onUpdateItem(tier.key, itemId, field, val)}
            onAddItem={() => onAddItem(tier.key)}
            onDeleteItem={(itemId) => onDeleteItem(tier.key, itemId)}
            onUpdateLabel={label => onUpdateLabel(tier.key, label)}
            onUpdateBrand={brand => onUpdateBrand(tier.key, brand)}
            onUpdateWarranty={w => onUpdateWarranty(tier.key, w)}
            border={border} textP={textP} textS={textS}
          />
        ))}
      </div>
    </div>
  )
}

// ── TierCard ───────────────────────────────────────────────────────────────────
function TierCard({ tier, selected, onSelect, onUpdateItem, onAddItem, onDeleteItem,
  onUpdateLabel, onUpdateBrand, onUpdateWarranty, border, textP, textS }: {
  key?: React.Key
  tier: Tier; selected: boolean
  onSelect: () => void
  onUpdateItem: (itemId: string, field: keyof TierLineItem, val: string | number) => void
  onAddItem: () => void
  onDeleteItem: (itemId: string) => void
  onUpdateLabel: (label: string) => void
  onUpdateBrand: (brand: string) => void
  onUpdateWarranty: (w: string) => void
  border: string; textP: string; textS: string
}) {
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const cardBg = selected ? C.tealLight : '#fff'
  const cardBorder = selected ? `2px solid ${C.teal}` : `1px solid ${border}`
  const cardShadow = selected ? SHADOW_SEL : SHADOW_SM

  return (
    <div style={{ background: cardBg, borderRadius: 16, border: cardBorder, boxShadow: cardShadow,
      padding: 20, position: 'relative', transition: 'all 0.2s',
      transform: selected ? 'translateY(-2px)' : 'none' }}>

      {/* Most popular badge */}
      {tier.key === 'upgraded' && (
        <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
          background: C.teal, color: '#fff', padding: '5px 16px', borderRadius: 999,
          fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
          👑 MOST POPULAR
        </div>
      )}

      {/* Tier label */}
      <input value={tier.label} onChange={e => onUpdateLabel(e.target.value)}
        style={{ border: 'none', background: 'transparent', fontSize: 11, fontWeight: 800,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: selected ? C.teal : textS,
          width: '100%', outline: 'none', cursor: 'text', marginBottom: 8 }} />

      {/* Brand */}
      <input value={tier.shingle_brand} onChange={e => onUpdateBrand(e.target.value)}
        style={{ border: 'none', background: 'transparent', fontSize: 18, fontWeight: 800,
          color: textP, width: '100%', outline: 'none', cursor: 'text', marginBottom: 2 }} />

      {/* Warranty */}
      <input value={tier.warranty} onChange={e => onUpdateWarranty(e.target.value)}
        style={{ border: 'none', background: 'transparent', fontSize: 13, color: textS,
          width: '100%', outline: 'none', cursor: 'text', marginBottom: 18 }} />

      {/* Line items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {tier.items.map(item => (
          <div key={item.id}>
            {editingItem === item.id ? (
              // Edit mode
              <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 10,
                padding: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input defaultValue={item.name}
                  onBlur={e => onUpdateItem(item.id, 'name', e.target.value)}
                  style={{ border: 'none', background: '#F8FAFC', padding: '6px 8px',
                    borderRadius: 6, fontSize: 12, width: 110, outline: 'none' }} />
                <input defaultValue={item.qty} type="number"
                  onBlur={e => onUpdateItem(item.id, 'qty', Number(e.target.value))}
                  style={{ border: 'none', background: '#F8FAFC', padding: '6px 6px',
                    borderRadius: 6, fontSize: 12, width: 40, outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: textS }}>{item.unit}</span>
                <span style={{ fontSize: 11, color: textS }}>@</span>
                <input defaultValue={item.unit_price} type="number"
                  onBlur={e => { onUpdateItem(item.id, 'unit_price', Number(e.target.value)); setEditingItem(null) }}
                  style={{ border: 'none', background: '#F8FAFC', padding: '6px 6px',
                    borderRadius: 6, fontSize: 12, width: 55, outline: 'none' }} />
                <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 12 }}>
                  {fmt(item.amount)}
                </span>
                <button onClick={() => setPendingDeleteId(item.id)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4,
                    color: C.danger, fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            ) : (
              // Read mode
              <button onClick={() => setEditingItem(item.id)}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left',
                  cursor: 'pointer', padding: '3px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: C.teal,
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, flexShrink: 0 }}>✓</div>
                <span style={{ fontSize: 13, color: textP, flex: 1 }}>{item.name}</span>
                {item.amount > 0 && (
                  <span style={{ fontSize: 12, color: textS, fontWeight: 600 }}>{fmt(item.amount)}</span>
                )}
              </button>
            )}
          </div>
        ))}
        {pendingDeleteId && (() => {
          const item = tier.items.find(i => i.id === pendingDeleteId)
          if (!item) return null
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderRadius: 8, background: '#FEF2F2',
              border: '1px solid #FECACA', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: '#991B1B' }}>
                Remove <strong>{item.name || 'item'}</strong>?
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPendingDeleteId(null)}
                  style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #FECACA',
                    background: 'transparent', color: '#991B1B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => { onDeleteItem(pendingDeleteId); setPendingDeleteId(null) }}
                  style={{ padding: '3px 10px', borderRadius: 6, border: 'none',
                    background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            </div>
          )
        })()}
        <button onClick={onAddItem}
          style={{ background: 'none', border: `1px dashed ${border}`, borderRadius: 8,
            padding: '6px', fontSize: 12, color: textS, cursor: 'pointer', width: '100%',
            marginTop: 4 }}>
          + Add item
        </button>
      </div>

      {/* Subtotal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        borderTop: `1px solid ${border}`, paddingTop: 14, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: textS }}>Subtotal</span>
        <span style={{ fontSize: 28, fontWeight: 900, color: selected ? C.teal : textP }}>
          {fmt(tier.subtotal)}
        </span>
      </div>

      {/* Select button */}
      <button onClick={onSelect}
        style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none',
          cursor: 'pointer', fontSize: 14, fontWeight: 700, transition: 'all 0.15s',
          background: selected ? C.green : tier.key === 'premium' ? C.navy : '#F8FAFC',
          color: selected ? '#fff' : tier.key === 'premium' ? '#fff' : textP }}>
        {selected ? '✓ Selected' : `Select ${tier.label}`}
      </button>

      {/* Recommended microcopy */}
      {selected && tier.key === 'upgraded' && (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: C.tealLight,
          fontSize: 12, color: C.teal, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Recommended for most homes in your area
        </div>
      )}
    </div>
  )
}


// ── StandardSection ────────────────────────────────────────────────────────────
function StandardSection({ items, onUpdateItem, onAdd, onDelete,
  card, border, textP, textS }: {
  items: TierLineItem[]
  onUpdateItem: (id: string, field: keyof TierLineItem, val: string | number) => void
  onAdd: (id: string) => void; onDelete: (id: string) => void
  card: string; border: string; textP: string; textS: string
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [newItemId, setNewItemId] = useState<string | null>(null)
  return (
    <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_SM,
      border: `1px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: textS, marginBottom: 16 }}>
        Line Items
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 90px 32px',
            gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 10,
            background: '#F8FAFC', border: `1px solid ${border}` }}>
            <input value={item.name} onChange={e => onUpdateItem(item.id, 'name', e.target.value)}
              placeholder="Item name"
              ref={el => { if (el && item.id === newItemId) { el.focus(); setNewItemId(null) } }}
              style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600,
                color: textP, outline: 'none', width: '100%' }} />
            <input value={item.qty} type="number" onChange={e => onUpdateItem(item.id, 'qty', Number(e.target.value))}
              style={{ background: '#fff', padding: '6px 8px', borderRadius: 6,
                border: `1px solid ${border}`,
                fontSize: 14, textAlign: 'center', outline: 'none', color: textP }} />
            <input value={item.unit_price} type="number"
              onChange={e => onUpdateItem(item.id, 'unit_price', Number(e.target.value))}
              style={{ border: `1px solid ${border}`, background: '#fff', padding: '6px 8px',
                borderRadius: 6, fontSize: 14, textAlign: 'right', outline: 'none', color: textP }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: textP, textAlign: 'right' }}>
              {fmt(item.amount)}
            </div>
            <button onClick={() => setPendingDeleteId(item.id)}
              style={{ border: 'none', background: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}>
              ×
            </button>
          </div>
        ))}

        {pendingDeleteId && (() => {
          const item = items.find(i => i.id === pendingDeleteId)
          if (!item) return null
          const fmt2 = (n: number) => '$' + Math.round(n).toLocaleString()
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 10, background: '#FEF2F2',
              border: '1.5px solid #FECACA', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#991B1B' }}>
                Remove <strong>{item.name || 'this item'}</strong> ({fmt2(item.amount)})?
              </span>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => setPendingDeleteId(null)}
                  style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #FECACA',
                    background: 'transparent', color: '#991B1B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => { onDelete(pendingDeleteId); setPendingDeleteId(null) }}
                  style={{ padding: '5px 14px', borderRadius: 7, border: 'none',
                    background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            </div>
          )
        })()}

        <button onClick={() => {
            const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
            onAdd(id)
            setNewItemId(id)
          }}
          style={{ border: `1px dashed ${border}`, borderRadius: 10, padding: '10px',
            background: 'transparent', color: textS, cursor: 'pointer', fontSize: 14,
            fontWeight: 600, textAlign: 'center' }}>
          + Add Item
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 16,
        borderTop: `1px solid ${border}` }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: textP }}>
          {fmt(items.reduce((s, i) => s + i.amount, 0))}
        </div>
      </div>


    </div>
  )
}

// ── ScopeCard ──────────────────────────────────────────────────────────────────
function ScopeCard({ scope, onChange, card, border, textP, textS }: {
  scope: string; onChange: (v: string) => void
  card: string; border: string; textP: string; textS: string
}) {
  return (
    <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_SM,
      border: `1px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: textS, marginBottom: 14 }}>
        Scope of Work
      </div>
      <textarea value={scope} onChange={e => onChange(e.target.value)}
        rows={4}
        placeholder="Describe the scope of work — materials, removal, cleanup, any special conditions..."
        style={{ width: '100%', border: `1.5px solid ${border}`, borderRadius: 10, padding: '12px 14px',
          fontSize: 14, color: textP, resize: 'vertical', lineHeight: 1.7,
          background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => (e.target.style.borderColor = C.teal)}
        onBlur={e => (e.target.style.borderColor = border)} />
      <div style={{ textAlign: 'right', fontSize: 12, color: C.muted, marginTop: 6 }}>
        {scope.length} characters
      </div>
    </div>
  )
}

// ── InsuranceCard ──────────────────────────────────────────────────────────────
function InsuranceCard({ estimate, card, border, textP, textS }: {
  estimate: RoofingEstimate; card: string; border: string; textP: string; textS: string
}) {
  const net = (estimate.approved_amount ?? 0) - (estimate.deductible ?? 0) + (estimate.supplement_amount ?? 0)
  return (
    <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_SM,
      border: `1px solid ${border}`, borderLeft: `4px solid ${C.amber}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: C.amber }}>🛡️ Insurance Claim</span>
        <span style={{ padding: '3px 10px', borderRadius: 999, background: C.green,
          color: '#fff', fontSize: 11, fontWeight: 800 }}>ON</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 14 }}>
        {[
          { label: 'Approved', value: fmtDec(estimate.approved_amount ?? 0) },
          { label: 'Deductible', value: fmtDec(estimate.deductible ?? 0) },
          { label: 'Net to collect', value: fmtDec(net) },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 12, color: textS, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: textP }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: textS }}>
        {estimate.insurance_company} · Claim #{estimate.claim_number}
        {estimate.adjuster_name ? ` · Adjuster: ${estimate.adjuster_name}` : ''}
      </div>
    </div>
  )
}

// ── TermsCard ──────────────────────────────────────────────────────────────────
function TermsCard({ terms, onChange, show, onToggle, card, border, textP, textS }: {
  terms: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void
  card: string; border: string; textP: string; textS: string
}) {
  return (
    <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_SM,
      border: `1px solid ${border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: textS }}>Terms &amp; Conditions</span>
        <button onClick={onToggle}
          style={{ background: 'none', border: 'none', color: C.teal, fontWeight: 700,
            fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          {show ? 'Collapse ▲' : 'Edit ▼'}
        </button>
      </div>
      {!show && (
        <div style={{ marginTop: 10, fontSize: 13, color: textS, lineHeight: 1.6 }}>
          {terms.slice(0, 120)}{terms.length > 120 ? '...' : ''}
        </div>
      )}
      {show && (
        <textarea value={terms} onChange={e => onChange(e.target.value)}
          rows={5}
          style={{ width: '100%', marginTop: 14, border: `1.5px solid ${border}`, borderRadius: 10,
            padding: '12px 14px', fontSize: 14, color: textP, resize: 'vertical', lineHeight: 1.7,
            background: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }}
          onFocus={e => (e.target.style.borderColor = C.teal)}
          onBlur={e => (e.target.style.borderColor = border)} />
      )}
    </div>
  )
}

// ── RightPanel ─────────────────────────────────────────────────────────────────
function RightPanel({ estType, tiers, tierLabels, tierTotals, selectedTier, selTierData,
  total, taxAmt, taxRate, pct21, validUntil, milestones, onUpdateMilestone, onAddMilestone,
  estimate, onSave, card, border, textP, textS, dk }: {
  estType: 'standard' | 'tiered'
  tiers: Tier[]; tierLabels: Record<TierKey, string>; tierTotals: Record<TierKey, number>
  selectedTier: TierKey; selTierData?: Tier
  total: number; taxAmt: number; taxRate: number; pct21: number
  validUntil: string
  milestones: PaymentMilestone[]
  onUpdateMilestone: (id: string, field: string, val: unknown) => void
  onAddMilestone: () => void
  estimate: RoofingEstimate
  onSave: (updates: Partial<RoofingEstimate>) => Promise<void>
  card: string; border: string; textP: string; textS: string; dk: boolean
}) {
  const expiring = new Date(validUntil) < new Date(Date.now() + 3 * 86400000)

  // Edit contact inline state — local to RightPanel
  const [editContact,   setEditContact]   = useState(false)
  const [contactEmail,  setContactEmail]  = useState(estimate.contact_email ?? '')
  const [contactPhone,  setContactPhone]  = useState(estimate.contact_phone ?? '')
  const [savingContact, setSavingContact] = useState(false)

  return (
    <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Selected tier / summary */}
      <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_MD,
        border: `1px solid ${border}`, overflow: 'hidden' }}>

        {/* Selected tier header */}
        {estType === 'tiered' && selTierData && (
          <div style={{ background: C.tealLight, borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.teal, fontWeight: 700, marginBottom: 4 }}>
              ✓ You selected
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.teal, marginBottom: 2 }}>
              {selTierData.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: textP }}>{selTierData.shingle_brand}</div>
            <div style={{ fontSize: 12, color: textS }}>{selTierData.warranty}</div>
          </div>
        )}

        {/* Tier breakdown for GBB */}
        {estType === 'tiered' && (
          <div style={{ marginBottom: 16 }}>
            {(Object.keys(tierTotals) as TierKey[]).map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                marginBottom: 8, fontSize: 14,
                fontWeight: k === selectedTier ? 700 : 400,
                color: k === selectedTier ? C.teal : textS }}>
                <span>{tierLabels[k]}</span>
                <span>{fmt(tierTotals[k])}</span>
              </div>
            ))}
          </div>
        )}

        {/* Financials */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13,
            color: textS, marginBottom: 8 }}>
            <span>Tax ({taxRate}%)</span><span>{fmt(taxAmt)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: textP }}>
              {estType === 'tiered' ? 'Total You\'ll Earn' : 'Total'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {pct21 > 0 && estType === 'tiered' && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px',
                  borderRadius: 999, background: C.greenBg, color: C.green }}>
                  +{pct21}%
                </span>
              )}
              <span style={{ fontSize: 36, fontWeight: 900, color: C.teal }}>{fmt(total)}</span>
            </div>
          </div>
        </div>

        {/* Validity */}
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 0,
          background: expiring ? C.amberBg : '#F8FAFC',
          border: `1px solid ${expiring ? C.amberBorder : border}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: expiring ? C.amber : textS }}>
            📅 Valid until: {new Date(validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Payment schedule */}
      <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_SM,
        border: `1px solid ${border}` }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: textS, marginBottom: 16 }}>
          Payment Schedule
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {milestones.map((m, i) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto',
              gap: 10, padding: '10px 0', alignItems: 'start',
              borderBottom: i < milestones.length - 1 ? `1px solid ${border}` : 'none' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.teal,
                color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex',
                alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                {i + 1}
              </div>
              <div>
                <input value={m.name} onChange={e => onUpdateMilestone(m.id, 'name', e.target.value)}
                  style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600,
                    color: textP, outline: 'none', width: '100%' }} />
                <div style={{ fontSize: 11, color: textS }}>{m.pct}% · {m.due_when}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: textP }}>{fmt(m.amount)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12,
          borderTop: `1px solid ${border}`, marginTop: 8 }}>
          <button onClick={onAddMilestone}
            style={{ background: 'none', border: 'none', color: C.teal, fontSize: 13,
              fontWeight: 700, cursor: 'pointer' }}>
            + Add milestone
          </button>
          <div style={{ fontSize: 14, fontWeight: 800, color: textP }}>
            Total {fmt(total)}
          </div>
        </div>
      </div>

      {/* Smart nudge */}
      <div style={{ background: C.amberBg, borderRadius: 16, padding: 20,
        border: `1px solid ${C.amberBorder}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#92400E', marginBottom: 6 }}>
          ⚡ Estimates sent within 10 minutes close 2× faster
        </div>
        <div style={{ fontSize: 13, color: '#B45309', lineHeight: 1.6, marginBottom: 10 }}>
          Send this estimate now to improve your chances.
        </div>
        <button style={{ background: 'none', border: 'none', color: C.amber,
          fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          See Tips →
        </button>
      </div>

      {/* Recipient */}
      <div id="pg-recipient-card" style={{ background: card, borderRadius: 16, padding: 20, boxShadow: SHADOW_SM,
        border: `1px solid ${border}` }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: textS, marginBottom: 14 }}>Recipient</div>

        {(estimate as any).lead_id ? (
          /* ── Lead-linked estimate: read-only, edit via lead ── */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.tealLight,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 800, color: C.teal }}>
                {estimate.lead_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: textP }}>{estimate.lead_name || 'Client'}</div>
                {estimate.contact_phone && (
                  <div style={{ fontSize: 13, color: textS }}>{estimate.contact_phone}</div>
                )}
                {estimate.contact_email ? (
                  <div style={{ fontSize: 13, color: textS }}>{estimate.contact_email}</div>
                ) : (
                  <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>⚠ No email — add in lead</div>
                )}
              </div>
            </div>
            <a
              href={`/dashboard/pipeline/${(estimate as any).lead_id}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: C.teal, fontWeight: 700, textDecoration: 'none' }}>
              Edit in Lead →
            </a>
          </div>
        ) : (
          /* ── Blank estimate (no lead): editable contact fields ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!editContact ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.tealLight,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 800, color: C.teal }}>
                    {estimate.lead_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2) || '?'}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: textP }}>{estimate.lead_name || 'New Client'}</div>
                    {estimate.contact_phone && <div style={{ fontSize: 13, color: textS }}>{estimate.contact_phone}</div>}
                    {estimate.contact_email
                      ? <div style={{ fontSize: 13, color: textS }}>{estimate.contact_email}</div>
                      : <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>⚠ No email — required to send</div>
                    }
                  </div>
                </div>
                <button
                  onClick={() => { setContactEmail(estimate.contact_email ?? ''); setContactPhone(estimate.contact_phone ?? ''); setEditContact(true) }}
                  style={{ background: 'none', border: 'none', color: C.teal, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                  Edit contact
                </button>
              </>
            ) : (
              <>
                <input
                  type="email" placeholder="Email address (required to send)" value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none' }}
                />
                <input
                  type="tel" placeholder="Phone number" value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #CBD5E1', fontSize: 13, outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={savingContact}
                    onClick={async () => {
                      setSavingContact(true)
                      try {
                        await onSave({ contact_email: contactEmail.trim() || undefined, contact_phone: contactPhone.trim() || undefined })
                        setEditContact(false)
                      } finally { setSavingContact(false) }
                    }}
                    style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: 'none', background: C.teal, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {savingContact ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditContact(false)}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: 'none', fontSize: 13, cursor: 'pointer', color: '#64748B' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
