'use client'
// lib/trades/roofing/components/EstimatePage.tsx
// Roofing-specific estimate builder. Rendered by app/dashboard/estimates/[id]/page.tsx
// when session.trade_slug is roofing. DashboardShell is NOT rendered here — shell wraps this.

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
  claim_status?: string | null
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
  backLabel?: string
  darkMode?: boolean
  // Called when roofer edits address/measurements — updates lead + roofing_estimate_data
  onMeasurementsUpdate?: (fields: { property_address?: string; square_count?: number; pitch?: string; waste_pct?: number }) => Promise<void>
  materialPrices?: Record<string, number> | null
  onDirty?: () => void
  // Lock all editing when estimate is approved/void/declined/paid
  isLocked?: boolean
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

const DEFAULT_MILESTONES = (total: number): PaymentMilestone[] => {
  // Round the first two; the last absorbs the remainder so the three always
  // sum to EXACTLY the total (no leftover cents from independent rounding).
  const dep = Math.round(total * 0.3 * 100) / 100
  const mat = Math.round(total * 0.4 * 100) / 100
  const com = Math.round((total - dep - mat) * 100) / 100
  return [
    { id: newId(), name: 'Deposit',              pct: 30, amount: dep, due_when: 'Due at signing' },
    { id: newId(), name: 'At Material Delivery', pct: 40, amount: mat, due_when: 'Due at delivery' },
    { id: newId(), name: 'On Completion',        pct: 30, amount: com, due_when: 'Due on completion' },
  ]
}

// ── Market-rate FL defaults — overridden by pro's material prices settings ──
const MARKET_DEFAULTS = {
  shingles_standard: 285, shingles_upgraded: 340, shingles_premium: 420,
  underlayment: 22, ice_water: 35, ridge_cap: 4, starter_strip: 2,
  drip_edge: 3, nails: 2.5, labor_standard: 85, labor_upgraded: 90, labor_premium: 100,
}

import { PITCH_FACTORS as SHARED_PITCH_FACTORS, getPitchFactor } from '@/lib/roofing/pitchFactors'

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

export default function RoofingEstimatePage({ estimate, templates = [], onSave, onSend, onBack, backLabel = 'Back to Lead', darkMode, onMeasurementsUpdate, materialPrices, onDirty, externalSaveMsg, isLocked = false }: Props) {
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
    // Apply pitch + waste to get adjusted squares for initial render
    const initPitch    = estimate.pitch ?? '6/12'
    const initWaste    = Number(estimate.waste_pct ?? 10)
    const pitchFactor  = getPitchFactor(initPitch)
    const adjSqInit    = Math.round(sq * pitchFactor * (1 + initWaste / 100) * 10) / 10
    return buildDefaultTiers(materialPrices).map(t => ({
      ...t,
      items: t.items.map(item => {
        const qty = item.unit === 'sq' ? adjSqInit : item.unit === 'lf' ? perim : 0
        return { ...item, qty, amount: Math.round(qty * item.unit_price) }
      }),
      subtotal: t.items.reduce((s, item) => {
        const qty = item.unit === 'sq' ? adjSqInit : item.unit === 'lf' ? perim : 0
        return s + Math.round(qty * item.unit_price)
      }, 0),
    }))
  })

  const [selectedTier, setSelectedTier] = useState<TierKey>(
    estimate.tiered_data?.selected_tier ?? 'upgraded'
  )

  // Standard items — coerce numeric fields: DB returns numerics as strings,
  // which break sum reduces (string concat -> 0 subtotal on save).
  const [stdItems, setStdItems] = useState<TierLineItem[]>(
    (estimate.items ?? buildDefaultTiers(materialPrices)[0].items).map((i: any) => ({
      ...i,
      qty:        Number(i.qty)        || 0,
      unit_price: Number(i.unit_price) || 0,
      amount:     Number(i.amount)     || 0,
    }))
  )

  // Other fields
  const [scope, setScope]       = useState(estimate.scope_of_work ?? '')
  const [terms, setTerms]       = useState(estimate.terms ?? 'This proposal is valid for 14 days. Payment is due per the schedule above. A deposit is required before work begins. Prices may adjust if insurance supplements are approved.')
  const [showTerms, setShowTerms]         = useState(false)  // collapsed by default
  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const savedEstType     = useRef<string>(estimate.estimate_type ?? 'tiered')
  const hasInitialSynced = useRef(false)
  // Snapshot of saved state — used to detect real changes vs undo
  const initialSnapshot = useRef({
    stdItems:  JSON.stringify(estimate.items ?? []),
    scope:     estimate.scope_of_work ?? '',
    terms:     estimate.terms ?? '',
    estType:   estimate.estimate_type ?? 'tiered',
  })
  const checkDirty = (overrides: { stdItems?: TierLineItem[]; scope?: string; terms?: string; estType?: string }) => {
    const snap = initialSnapshot.current
    const cur = {
      stdItems: JSON.stringify(overrides.stdItems ?? stdItems),
      scope:    overrides.scope    ?? scope,
      terms:    overrides.terms    ?? terms,
      estType:  overrides.estType  ?? estType,
    }
    setIsDirty(
      cur.stdItems !== snap.stdItems ||
      cur.scope    !== snap.scope    ||
      cur.terms    !== snap.terms    ||
      cur.estType  !== snap.estType
    )
  }
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<'standard' | 'tiered' | null>(null)

  // Payment milestones — derived from selected tier total
  const activeTierSubtotal = estType === 'tiered'
    ? (tiers.find(t => t.key === selectedTier)?.subtotal ?? 0)
    : (stdItems.reduce((s, i) => s + (Number(i.amount) || 0), 0))

  const taxAmt  = Math.round(activeTierSubtotal * (estimate.tax_rate / 100) * 100) / 100
  const total   = activeTierSubtotal + taxAmt

  // Milestones — always locked 3-step 30/40/30, auto-calculated from total
  // Last milestone = total - sum of others to avoid rounding drift
  const LOCKED_MILESTONES = [
    { id: 'dep', name: 'Deposit',              pct: 30, due_when: 'Due at signing' },
    { id: 'mat', name: 'At Material Delivery', pct: 40, due_when: 'Due at delivery' },
    { id: 'com', name: 'On Completion',        pct: 30, due_when: 'Due on completion' },
  ]
  const milestones = (() => {
    // Cents precision; last milestone absorbs the remainder so the three always
    // sum to EXACTLY the total (including tax cents — fixes leftover-cents bug).
    const dep = Math.round(total * 0.3 * 100) / 100
    const mat = Math.round(total * 0.4 * 100) / 100
    const com = Math.round((total - dep - mat) * 100) / 100  // last absorbs rounding
    return [
      { ...LOCKED_MILESTONES[0], amount: dep },
      { ...LOCKED_MILESTONES[1], amount: mat },
      { ...LOCKED_MILESTONES[2], amount: com },
    ]
  })()
  // Keep recalcMilestones as no-op for backward compat with saveMeasurements calls
  const recalcMilestones = useCallback((_newTotal: number) => {}, [])

  // ── Initial sync: if DB total is 0 but computed total is ready, save once silently ──
  // Happens when estimate is first opened from the calculator (created with total:0)
  useEffect(() => {
    if (hasInitialSynced.current) return
    if (estimate.total > 0) { hasInitialSynced.current = true; return }
    if (total <= 0) return
    hasInitialSynced.current = true
    onSave({
      subtotal:           activeTierSubtotal,
      tax_amount:         taxAmt,
      total,
      tiered_data:        estType === 'tiered' ? { tiers, selected_tier: selectedTier } : undefined,
      estimate_type:      estType,
      payment_milestones: milestones,
    }).catch(() => {})
  }, [total]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recalc all tier quantities + amounts when measurements change
  const recalcTiersFromSq = useCallback((sq: number, selTier?: TierKey, perimLF?: number, pitch?: string, waste?: number): number => {
    // Apply pitch factor + waste to get adjusted squares (same formula as Calculator)
    const pitchFactor = getPitchFactor(pitch ?? pitchVal)
    const wasteMult   = 1 + ((waste ?? parseFloat(wastePct) ?? 10) / 100)
    const adjSq       = Math.round(sq * pitchFactor * wasteMult * 10) / 10
    const lfQty       = perimLF ?? Math.round(sq * 10)
    let selSubtotal   = 0
    setTiers(prev => prev.map(tier => {
      const items = tier.items.map(item => {
        // sq-unit items use adjusted squares; lf-unit items use real perimeter
        const qty = item.unit === 'sq' ? adjSq : item.unit === 'lf' ? lfQty : item.qty
        return { ...item, qty, amount: Math.round(qty * item.unit_price) }
      })
      const subtotal = items.reduce((s, i) => s + i.amount, 0)
      if (tier.key === (selTier ?? 'upgraded')) selSubtotal = subtotal
      return { ...tier, items, subtotal }
    }))
    return selSubtotal
  }, [pitchVal, wastePct])

  // Save measurements + address — updates roofing_estimate_data + lead
  const saveMeasurements = useCallback(async () => {
    setSavingMeas(true)
    const sq = parseFloat(sqCount) || 0
    const wp = parseFloat(wastePct) || 10
    const newSubtotal = recalcTiersFromSq(sq, selectedTier, perimLF)
    const newTotal = newSubtotal + Math.round(newSubtotal * (estimate.tax_rate / 100) * 100) / 100
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

  // ── Recalculate tiers from current material prices ───────────────────────────
  // Detects when saved unit_prices differ from materialPrices → shows Recalculate button
  const pricesMismatch = useMemo(() => {
    if (!materialPrices || Object.keys(materialPrices).length === 0) return false
    if (!tiers.length) return false
    const p = { ...MARKET_DEFAULTS, ...materialPrices }
    const priceMap: Record<string, Record<string, number>> = {
      standard: { shingles: p.shingles_standard, labor: p.labor_standard },
      upgraded: { shingles: p.shingles_upgraded, labor: p.labor_upgraded },
      premium:  { shingles: p.shingles_premium,  labor: p.labor_premium  },
    }
    return tiers.some(t => t.items.some(item => {
      const nm = item.name.toLowerCase()
      const tierPrices = priceMap[t.key] ?? {}
      if (nm.includes('shingle'))     return item.unit_price !== tierPrices.shingles
      if (nm.includes('underlayment')) return item.unit_price !== p.underlayment
      if (nm.includes('ice'))          return item.unit_price !== p.ice_water
      if (nm.includes('ridge'))        return item.unit_price !== p.ridge_cap
      if (nm.includes('starter'))      return item.unit_price !== p.starter_strip
      if (nm.includes('drip'))         return item.unit_price !== p.drip_edge
      if (nm.includes('labor'))        return item.unit_price !== tierPrices.labor
      return false
    }))
  }, [tiers, materialPrices])

  const recalcFromPrices = () => {
    if (!materialPrices) return
    const p = { ...MARKET_DEFAULTS, ...materialPrices }
    const priceMap: Record<string, Record<string, number>> = {
      standard: { shingles: p.shingles_standard, labor: p.labor_standard },
      upgraded: { shingles: p.shingles_upgraded, labor: p.labor_upgraded },
      premium:  { shingles: p.shingles_premium,  labor: p.labor_premium  },
    }
    setTiers(prev => prev.map(t => {
      const tp = priceMap[t.key] ?? {}
      const items = t.items.map(item => {
        const nm = item.name.toLowerCase()
        let up = item.unit_price
        if (nm.includes('shingle'))      up = tp.shingles    ?? up
        if (nm.includes('underlayment')) up = p.underlayment ?? up
        if (nm.includes('ice'))          up = p.ice_water    ?? up
        if (nm.includes('ridge'))        up = p.ridge_cap    ?? up
        if (nm.includes('starter'))      up = p.starter_strip ?? up
        if (nm.includes('drip'))         up = p.drip_edge    ?? up
        if (nm.includes('labor'))        up = tp.labor       ?? up
        const amount = Math.round(item.qty * up)
        return { ...item, unit_price: up, amount }
      })
      return { ...t, items, subtotal: items.reduce((s, i) => s + i.amount, 0) }
    }))
    setIsDirty(true)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    try {
      const cleanItems = estType === 'standard'
        ? stdItems.filter(i => i.name.trim() !== '' && i.unit_price > 0)
        : undefined
      await onSave({
        estimate_type:      estType,
        tiered_data:        estType === 'tiered' ? { tiers, selected_tier: selectedTier } : undefined,
        items:              cleanItems,
        scope_of_work:      scope,
        terms,
        payment_milestones: milestones,
        subtotal:           activeTierSubtotal,
        tax_amount:         taxAmt,
        total,
      })
      // Update snapshot so isDirty resets correctly
      initialSnapshot.current = {
        stdItems: JSON.stringify(cleanItems ?? stdItems),
        scope,
        terms,
        estType,
      }
      if (cleanItems) setStdItems(cleanItems)
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
          {backLabel}
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


        {isLocked ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: textS, padding: '9px 4px',
            display: 'flex', alignItems: 'center', gap: 6 }}>
            🔒 {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)} — read only
          </span>
        ) : isDirty ? (
          <button onClick={handleSave} disabled={saving}
            style={{
              padding: '9px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              transition: 'all 0.2s',
              border: 'none',
              background: saving ? '#CBD5E1' : C.teal,
              color: '#fff',
              boxShadow: saving ? 'none' : '0 2px 8px rgba(15,118,110,0.3)',
            }}>
            {saving ? 'Saving…' : '● Save changes'}
          </button>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 600, color: textS, padding: '9px 4px' }}>
            Saved
          </span>
        )}

        {(() => {
          const terminal = ['approved', 'void', 'declined', 'paid'].includes(estimate.status)
          if (terminal) return null
          const hasEmail = !!(estimate.contact_email)
          const isSent   = ['sent', 'viewed'].includes(estimate.status)
          if (!hasEmail) return (
            <button
              onClick={() => {
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
            <button onClick={async () => {
              try {
                await onSave({
                  subtotal:           activeTierSubtotal,
                  tax_amount:         taxAmt,
                  total,
                  tiered_data:        estType === 'tiered' ? { tiers, selected_tier: selectedTier } : undefined,
                  estimate_type:      estType,
                  payment_milestones: milestones,
                })
              } catch { /* proceed to send even if save fails */ }
              await onSend()
            }}
              style={{ padding: '9px 22px', borderRadius: 10, border: isSent ? `1.5px solid ${C.teal}` : 'none',
                background: isSent ? 'transparent' : `linear-gradient(135deg, ${C.teal}, #0D9488)`,
                color: isSent ? C.teal : '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              {isSent ? 'Resend' : 'Send to Homeowner'}
            </button>
          )
        })()}
        <div style={{ fontSize: 12, color: textS }}>Client can approve &amp; pay instantly</div>
      </div>

      {/* ── Progress timeline ── */}
      <ProgressTimeline timeline={estimate.timeline ?? []} border={border} textS={textS} card={card} estimate={estimate} />

      {/* ── Bounce warning banner ── */}
      {(estimate as any).email_status === 'bounced' && (
        <div style={{
          margin: '0 32px',
          padding: '14px 20px',
          borderRadius: 12,
          background: '#FEF2F2',
          border: '1.5px solid #FECACA',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: '#FEE2E2', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>⚠</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>
              Email bounced — homeowner didn't receive the proposal
            </div>
            <div style={{ fontSize: 13, color: '#B91C1C', lineHeight: 1.5 }}>
              {(estimate as any).email_bounce_reason
                ? `Reason: ${(estimate as any).email_bounce_reason}`
                : 'The email address may be invalid or misspelled.'
              }
              {' '}
              {(estimate as any).sent_to_email && (
                <span>Sent to: <strong>{(estimate as any).sent_to_email}</strong></span>
              )}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(estimate as any).lead_id && (
                <a
                  href={`/dashboard/pipeline/${(estimate as any).lead_id}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    fontSize: 13, fontWeight: 700, color: '#991B1B',
                    background: '#fff', border: '1.5px solid #FECACA',
                    padding: '6px 14px', borderRadius: 8, textDecoration: 'none',
                    cursor: 'pointer',
                  }}>
                  Fix email in Lead →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

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
            isLocked={isLocked}
          />

          {/* Client contact — only for blank estimates (no lead) */}
          <ClientContactCard
            estimate={estimate} onSave={onSave}
            card={card} border={border} textP={textP} textS={textS}
          />

          {/* Proposal type toggle — hidden when locked or insurance job */}

          {!isLocked && !estimate.insurance_claim && !estimate.approved_amount && !estimate.claim_number && (
            <ProposalTypeToggle
              value={pendingTypeSwitch ?? estType} onChange={v => {
              if (v === estType) return
              setPendingTypeSwitch(v as 'standard' | 'tiered')
            }}
              card={card} border={border} textP={textP} textS={textS}
            />
          )}

          {/* GBB tiers OR standard items */}
          {/* ── Pending type switch confirmation ─────────────────────────────── */}
          {pendingTypeSwitch && (
            <div style={{
              margin: '12px 0', padding: '16px 20px', borderRadius: 12,
              background: 'linear-gradient(135deg, #0A1628, #0F2A40)',
              border: '1px solid rgba(20,184,166,0.3)',
              boxShadow: '0 4px 20px rgba(10,22,40,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(15,118,110,0.25)',
                  border: '1px solid rgba(20,184,166,0.4)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14B8A6" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 2, letterSpacing: '-0.01em' }}>
                    Switch to {pendingTypeSwitch === 'tiered' ? 'Good / Better / Best' : 'Standard'}?
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(180,210,220,0.7)' }}>
                    {pendingTypeSwitch === 'standard'
                      ? 'GBB tiers are preserved — proposal sends as a single line-item estimate.'
                      : 'Line items are preserved — proposal sends as a 3-tier GBB estimate.'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => setPendingTypeSwitch(null)}
                  style={{ padding: '8px 16px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const newTotal = pendingTypeSwitch === 'standard'
                      ? stdItems.reduce((s,i) => s + (Number(i.amount) || 0), 0) * (1 + estimate.tax_rate/100)
                      : total
                    setEstType(pendingTypeSwitch)
                    savedEstType.current = pendingTypeSwitch
                    setPendingTypeSwitch(null)
                    recalcMilestones(Math.round(newTotal))
                    await onSave({
                      estimate_type: pendingTypeSwitch,
                      tiered_data:   pendingTypeSwitch === 'tiered' ? { tiers, selected_tier: selectedTier } : undefined,
                      items:         pendingTypeSwitch === 'standard' ? stdItems : undefined,
                      subtotal:      activeTierSubtotal,
                      tax_amount:    taxAmt,
                      total,
                    })
                  }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #0F766E, #14B8A6)',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 3px 10px rgba(15,118,110,0.4)' }}>
                  Switch & Save
                </button>
              </div>
            </div>
          )}

          {/* Recalculate from prices banner — shows when saved prices differ from material settings */}
          {estType === 'tiered' && pricesMismatch && !isLocked && (
            <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 10,
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14 }}>🔄</span>
              <span style={{ fontSize: 13, color: '#1E40AF', flex: 1 }}>
                Your material prices have changed. Tier amounts may be outdated.
              </span>
              <button onClick={recalcFromPrices}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none',
                  background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                Recalculate
              </button>
            </div>
          )}

          {estType === 'tiered' ? (
            <GBBSection
              tiers={tiers} selectedTier={selectedTier}
              onSelect={isLocked ? undefined : (t => { setSelectedTier(t); setIsDirty(true); recalcMilestones(tierTotals[t] + Math.round(tierTotals[t] * estimate.tax_rate / 100)) })}
              onUpdateItem={isLocked ? undefined : updateTierItem}
              onAddItem={isLocked ? undefined : addTierItem}
              onDeleteItem={isLocked ? undefined : deleteTierItem}
              onUpdateLabel={isLocked ? undefined : ((key, label) => { setTiers(prev => prev.map(t => t.key === key ? { ...t, label } : t)); setIsDirty(true) })}
              onUpdateBrand={isLocked ? undefined : ((key, brand) => { setTiers(prev => prev.map(t => t.key === key ? { ...t, shingle_brand: brand } : t)); setIsDirty(true) })}
              onUpdateWarranty={isLocked ? undefined : ((key, w) => { setTiers(prev => prev.map(t => t.key === key ? { ...t, warranty: w } : t)); setIsDirty(true) })}
              card={card} border={border} textP={textP} textS={textS}
              isLocked={isLocked}
              materialPrices={materialPrices}
            />
          ) : (
            <StandardSection
              items={stdItems} onUpdateItem={isLocked ? undefined : ((id, field, val) => {
                setStdItems(prev => {
                  const next = prev.map(i => {
                    if (i.id !== id) return i
                    const up = { ...i, [field]: val }
                    up.amount = Math.round(Number(up.qty) * Number(up.unit_price))
                    return up
                  })
                  checkDirty({ stdItems: next })
                  return next
                })
              })}
              onAdd={isLocked ? undefined : ((id) => {
                setStdItems(prev => { const next = [...prev, { id, name: '', qty: 1, unit: 'sq', unit_price: 0, amount: 0 }]; checkDirty({ stdItems: next }); return next })
              })}
              onDelete={isLocked ? undefined : ((id) => {
                setStdItems(prev => { const next = prev.filter(i => i.id !== id); checkDirty({ stdItems: next }); return next })
              })}
              card={card} border={border} textP={textP} textS={textS}
              isLocked={isLocked}
            />
          )}

          {/* Scope of work */}
          <ScopeCard scope={scope} onChange={isLocked ? undefined : (v => { setScope(v); checkDirty({ scope: v }) })} card={card} border={border} textP={textP} textS={textS} readOnly={isLocked} />

          {/* Insurance claim — only when relevant */}
          {(estimate.insurance_claim || !!(estimate.approved_amount || estimate.claim_number)) && (
            <InsuranceCard estimate={estimate} computedTotal={total} card={card} border={border} textP={textP} textS={textS} />
          )}

          {/* Terms */}
          <TermsCard terms={terms} onChange={isLocked ? undefined : (v => { setTerms(v); checkDirty({ terms: v }) })} show={showTerms} onToggle={() => setShowTerms(p => !p)}
            card={card} border={border} textP={textP} textS={textS} readOnly={isLocked} />

        </div>

        {/* ── RIGHT PANEL ── */}
        <RightPanel
          estType={estType} tiers={tiers} tierLabels={tierLabels} tierTotals={tierTotals}
          selectedTier={selectedTier} selTierData={selTierData}
          total={total} taxAmt={taxAmt} taxRate={estimate.tax_rate}
          pct21={pct21} validUntil={estimate.valid_until}
          milestones={milestones} onUpdateMilestone={() => {}}
          onAddMilestone={() => {}}
          estimate={estimate}
          onSave={onSave}
          card={card} border={border} textP={textP} textS={textS}
          dk={dk}
        />
      </div>
    </div>
  )
}

function ProgressTimeline({ timeline, border, textS, card, estimate }: {
  timeline: { event: string; label: string; timestamp: string | null }[]
  border: string; textS: string; card: string
  estimate?: any
}) {
  const bounced   = estimate?.email_status === 'bounced'
  const delivered = estimate?.email_status === 'delivered'
  const sentEmail = estimate?.sent_to_email ?? null
  const viewedCount = estimate?.viewed_count ?? 0

  const steps = [
    { key: 'sent',     icon: bounced ? '⚠' : '✉', label: bounced ? 'Bounced' : 'Sent' },
    { key: 'viewed',   icon: '👁', label: viewedCount > 1 ? `Viewed (${viewedCount}×)` : 'Viewed' },
    { key: 'approved', icon: '✓',  label: 'Approved' },
    { key: 'invoiced', icon: '📄', label: 'Invoice' },
    { key: 'paid',     icon: '$',  label: 'Payment received' },
  ]
  const doneKeys = timeline.filter(t => t.timestamp).map(t => t.event)

  return (
    <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: '16px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 700, gap: 0 }}>
        {steps.map((step, i) => {
          const done   = doneKeys.includes(step.key)
          const tl     = timeline.find(t => t.event === step.key)
          const isSent = step.key === 'sent'
          const sentBounced = isSent && bounced
          const bgColor = sentBounced ? '#FEF2F2' : done ? C.teal : '#F1F5F9'
          const fgColor = sentBounced ? '#EF4444' : done ? '#fff' : C.muted
          const borderColor = sentBounced ? '#FECACA' : done ? 'none' : `1.5px solid ${C.border}`
          return (
            <React.Fragment key={step.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                  background: bgColor, color: fgColor,
                  border: sentBounced ? `1.5px solid #FECACA` : done ? 'none' : `1.5px solid ${C.border}`,
                  transition: 'all 0.2s',
                }}>
                  {step.icon}
                </div>
                <div style={{ textAlign: 'center', maxWidth: 90 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: sentBounced ? '#EF4444' : done ? C.teal : textS }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {tl?.timestamp ? new Date(tl.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Not yet'}
                  </div>
                  {isSent && sentEmail && (
                    <div style={{ fontSize: 10, color: sentBounced ? '#EF4444' : C.muted,
                      marginTop: 2, wordBreak: 'break-all', maxWidth: 120 }}>
                      {sentEmail}
                    </div>
                  )}
                  {isSent && sentBounced && estimate?.email_bounce_reason && (
                    <div style={{ fontSize: 10, color: '#EF4444', marginTop: 1 }}>
                      {estimate.email_bounce_reason.slice(0, 40)}
                    </div>
                  )}
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


// ── ClientContactCard ──────────────────────────────────────────────────────────
// Shows below PropertyCard in the left panel.
// Lead-linked: read-only contact info (email resolved from lead server-side). No edit UI.
// Blank estimate (no lead_id): editable name/email/phone, saves to estimates.contact_email/phone.
function ClientContactCard({ estimate, onSave, card, border, textP, textS }: {
  estimate: RoofingEstimate
  onSave: (updates: Partial<RoofingEstimate>) => Promise<void>
  card: string; border: string; textP: string; textS: string
}) {
  const hasLead = !!(estimate as any).lead_id
  const [editing, setEditing]     = useState(false)
  const [email,   setEmail]       = useState(estimate.contact_email ?? '')
  const [phone,   setPhone]       = useState(estimate.contact_phone ?? '')
  const [saving,  setSaving]      = useState(false)

  // Lead-linked: no card at all — contact info lives on the lead
  if (hasLead) return null

  // Blank estimate: editable contact fields
  const hasEmail = !!(estimate.contact_email)

  return (
    <div id="pg-recipient-card" style={{ background: card, borderRadius: 16, padding: '18px 24px',
      boxShadow: SHADOW_SM, border: `1px solid ${!hasEmail ? '#FCA5A5' : border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const,
          letterSpacing: '0.1em', color: textS }}>Client Contact</div>
        {!editing && (
          <button onClick={() => { setEmail(estimate.contact_email ?? ''); setPhone(estimate.contact_phone ?? ''); setEditing(true) }}
            style={{ background: 'none', border: 'none', color: C.teal, fontWeight: 700,
              fontSize: 13, cursor: 'pointer', padding: 0 }}>
            {hasEmail ? 'Edit' : '+ Add contact'}
          </button>
        )}
      </div>

      {!editing ? (
        <div>
          {hasEmail ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
              <div style={{ fontSize: 14, color: textP }}>{estimate.contact_email}</div>
              {estimate.contact_phone && <div style={{ fontSize: 13, color: textS }}>{estimate.contact_phone}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>
              ⚠ No email — required to send proposal
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          <input type="email" placeholder="Email address (required to send)"
            value={email} onChange={e => setEmail(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${C.teal}`,
              fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
          <input type="tel" placeholder="Phone number"
            value={phone} onChange={e => setPhone(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${border}`,
              fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button disabled={saving} onClick={async () => {
              setSaving(true)
              try { await onSave({ contact_email: email.trim() || undefined, contact_phone: phone.trim() || undefined }); setEditing(false) }
              finally { setSaving(false) }
            }} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
              background: C.teal, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${border}`,
                background: 'none', fontSize: 13, cursor: 'pointer', color: textS }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// ── PropertyCard ───────────────────────────────────────────────────────────────
const PITCH_OPTIONS = ['3/12','4/12','5/12','6/12','7/12','8/12','9/12','10/12','12/12']

function PropertyCard({ estimate, card, border, textP, textS,
  addrVal, setAddrVal, sqCount, setSqCount, pitchVal, setPitchVal, wastePct, setWastePct,
  editMeas, setEditMeas, savingMeas, onSaveMeas, isLocked = false }: {
  estimate: RoofingEstimate; card: string; border: string; textP: string; textS: string
  addrVal: string; setAddrVal: (v: string) => void
  sqCount: string; setSqCount: (v: string) => void
  pitchVal: string; setPitchVal: (v: string) => void
  wastePct: string; setWastePct: (v: string) => void
  editMeas: boolean; setEditMeas: (v: boolean) => void
  savingMeas: boolean; onSaveMeas: () => Promise<void>
  isLocked?: boolean
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
          {!isLocked && (
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
          )}
        </div>
      </div>

      {/* Inline measurement editor */}
      {editMeas && !isLocked && (
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
// Collapsed by default — one tier expanded at a time for editing
function GBBSection({ tiers, selectedTier, onSelect, onUpdateItem, onAddItem, onDeleteItem,
  onUpdateLabel, onUpdateBrand, onUpdateWarranty,
  card, border, textP, textS, isLocked = false, materialPrices }: {
  tiers: Tier[]
  selectedTier: TierKey
  onSelect?: (k: TierKey) => void
  onUpdateItem?: (tier: TierKey, itemId: string, field: keyof TierLineItem, val: string | number) => void
  onAddItem?: (tier: TierKey) => void
  onDeleteItem?: (tier: TierKey, itemId: string) => void
  onUpdateLabel?: (tier: TierKey, label: string) => void
  onUpdateBrand?: (tier: TierKey, brand: string) => void
  onUpdateWarranty?: (tier: TierKey, w: string) => void
  card: string; border: string; textP: string; textS: string
  isLocked?: boolean
  materialPrices?: Record<string, number> | null
}) {
  // Which tier's edit modal is open — null = none
  const [editingKey, setEditingKey] = useState<TierKey | null>(null)
  // Local copy of tiers for editing — committed on Save
  const [draftTier, setDraftTier] = useState<Tier | null>(null)

  const openModal = (key: TierKey) => {
    const tier = tiers.find(t => t.key === key)
    if (!tier) return
    setDraftTier(JSON.parse(JSON.stringify(tier))) // deep clone
    setEditingKey(key)
  }

  const closeModal = () => { setEditingKey(null); setDraftTier(null) }

  const saveModal = () => {
    if (!draftTier || !editingKey) return
    // Commit all changes from draft to parent
    const orig = tiers.find(t => t.key === editingKey)
    if (!orig) return
    // Label / brand / warranty
    if (draftTier.label        !== orig.label)         onUpdateLabel?.(editingKey, draftTier.label)
    if (draftTier.shingle_brand !== orig.shingle_brand) onUpdateBrand?.(editingKey, draftTier.shingle_brand)
    if (draftTier.warranty     !== orig.warranty)      onUpdateWarranty?.(editingKey, draftTier.warranty)
    // Items — sync each field
    draftTier.items.forEach(di => {
      const oi = orig.items.find(i => i.id === di.id)
      if (oi) {
        if (di.name       !== oi.name)       onUpdateItem?.(editingKey, di.id, 'name',       di.name)
        if (di.qty        !== oi.qty)        onUpdateItem?.(editingKey, di.id, 'qty',        di.qty)
        if (di.unit_price !== oi.unit_price) onUpdateItem?.(editingKey, di.id, 'unit_price', di.unit_price)
      }
    })
    // New items (in draft but not in orig)
    draftTier.items.filter(di => !orig.items.find(oi => oi.id === di.id)).forEach(ni => {
      onAddItem?.(editingKey)
      onUpdateItem?.(editingKey, ni.id, 'name',       ni.name)
      onUpdateItem?.(editingKey, ni.id, 'qty',        ni.qty)
      onUpdateItem?.(editingKey, ni.id, 'unit_price', ni.unit_price)
    })
    // Deleted items
    orig.items.filter(oi => !draftTier.items.find(di => di.id === oi.id)).forEach(di => {
      onDeleteItem?.(editingKey, di.id)
    })
    closeModal()
  }

  // Draft tier helpers
  const draftUpdateField = (field: 'label' | 'shingle_brand' | 'warranty', val: string) => {
    if (!draftTier) return
    setDraftTier(prev => prev ? { ...prev, [field]: val } : prev)
  }

  const draftUpdateItem = (itemId: string, field: keyof TierLineItem, val: string | number) => {
    if (!draftTier) return
    setDraftTier(prev => {
      if (!prev) return prev
      const items = prev.items.map(item => {
        if (item.id !== itemId) return item
        const updated = { ...item, [field]: val }
        if (field === 'qty' || field === 'unit_price') {
          updated.amount = Math.round(Number(updated.qty) * Number(updated.unit_price))
        }
        return updated
      })
      return { ...prev, items, subtotal: items.reduce((s, i) => s + i.amount, 0) }
    })
  }

  const draftAddItem = () => {
    if (!draftTier) return
    const newItem: TierLineItem = { id: newId(), name: '', qty: 0, unit: 'sq', unit_price: 0, amount: 0 }
    setDraftTier(prev => prev ? { ...prev, items: [...prev.items, newItem] } : prev)
  }

  const draftDeleteItem = (itemId: string) => {
    if (!draftTier) return
    setDraftTier(prev => {
      if (!prev) return prev
      const items = prev.items.filter(i => i.id !== itemId)
      return { ...prev, items, subtotal: items.reduce((s, i) => s + i.amount, 0) }
    })
  }

  const usingDefaults = !materialPrices || Object.keys(materialPrices).length === 0

  return (
    <div>
      {/* Warning: using example prices */}
      {usingDefaults && !isLocked && (
        <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10,
          background: '#FFFBEB', border: '1px solid #FDE68A',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>Using example prices. </span>
            <a href="/dashboard/roofing/settings" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: '#B45309', fontWeight: 700, textDecoration: 'underline' }}>
              Set your material prices in Settings →
            </a>
            <span style={{ fontSize: 13, color: '#92400E' }}> to auto-populate your real rates.</span>
          </div>
        </div>
      )}

      {/* 3-column read-only cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {tiers.map(tier => (
          <TierCard
            key={tier.key}
            tier={tier}
            selected={selectedTier === tier.key}
            isLocked={isLocked}
            onSelect={onSelect ? () => onSelect(tier.key) : undefined}
            onEdit={isLocked ? undefined : () => openModal(tier.key)}
            border={border} textP={textP} textS={textS}
          />
        ))}
      </div>

      {/* Edit modal — rendered via portal to document.body to escape any CSS transform/overflow containment */}
      {editingKey && draftTier && typeof document !== 'undefined' && createPortal(
        <TierEditModal
          tier={draftTier}
          onUpdateField={draftUpdateField}
          onUpdateItem={draftUpdateItem}
          onAddItem={draftAddItem}
          onDeleteItem={draftDeleteItem}
          onSave={saveModal}
          onCancel={closeModal}
          border={border} textP={textP} textS={textS}
        />,
        document.body
      )}
    </div>
  )
}

// ── TierCard — pure read-only display ─────────────────────────────────────────
function TierCard({ tier, selected, isLocked = false, onSelect, onEdit, border, textP, textS }: {
  tier: Tier; selected: boolean; isLocked?: boolean
  onSelect?: () => void
  onEdit?: () => void
  border: string; textP: string; textS: string
}) {
  const isPremium  = tier.key === 'premium'
  const isUpgraded = tier.key === 'upgraded'
  const cardBg     = selected ? C.tealLight : '#FAFAFA'
  const cardBorder = selected ? `2px solid ${C.teal}` : `1px solid ${border}`

  return (
    <div style={{ background: cardBg, borderRadius: 16, border: cardBorder,
      boxShadow: selected ? SHADOW_SEL : SHADOW_SM,
      display: 'flex', flexDirection: 'column' as const,
      transition: 'all 0.2s', position: 'relative' }}>

      {/* Most popular badge */}
      {isUpgraded && (
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
          background: C.teal, color: '#fff', padding: '4px 14px', borderRadius: 999,
          fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' as const, zIndex: 2 }}>
          👑 MOST POPULAR
        </div>
      )}

      <div style={{ padding: isUpgraded ? '28px 18px 18px' : '18px',
        flex: 1, display: 'flex', flexDirection: 'column' as const }}>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color: selected ? C.teal : textS, marginBottom: 6 }}>
            {tier.label}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: textP, marginBottom: 3, lineHeight: 1.2 }}>
            {tier.shingle_brand}
          </div>
          <div style={{ fontSize: 12, color: textS }}>{tier.warranty}</div>
        </div>

        {/* Items — name + amount only, no qty/price */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 5, marginBottom: 16 }}>
          {tier.items.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: C.teal,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 900, flexShrink: 0 }}>✓</div>
              <span style={{ fontSize: 13, color: textP, flex: 1 }}>{item.name}</span>
              <span style={{ fontSize: 12, color: textS, fontWeight: 600 }}>
                {item.amount > 0 ? fmt(item.amount) : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Subtotal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          borderTop: `1px solid ${border}`, paddingTop: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: textS }}>Subtotal</span>
          <span style={{ fontSize: 24, fontWeight: 900,
            color: selected ? C.teal : textP, letterSpacing: '-0.5px' }}>
            {fmt(tier.subtotal)}
          </span>
        </div>

        {/* Buttons */}
        {isLocked ? (
          selected ? (
            <div style={{ textAlign: 'center' as const, padding: '9px', background: C.tealLight,
              borderRadius: 10, fontSize: 13, fontWeight: 700, color: C.teal }}>
              ✓ Selected by homeowner
            </div>
          ) : null
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {onSelect && (
              <button onClick={onSelect}
                style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'opacity 0.15s',
                  background: selected ? C.green : isPremium ? C.navy : isUpgraded ? C.teal : '#E2E8F0',
                  color: selected ? '#fff' : isPremium || isUpgraded ? '#fff' : textP }}>
                {selected ? '✓ Selected' : `Select ${tier.label}`}
              </button>
            )}
            {onEdit && (
              <button onClick={onEdit}
                style={{ width: '100%', padding: '7px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, border: `1px solid ${border}`,
                  background: 'transparent', color: textS }}>
                Edit items
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── TierEditModal — full-page overlay for editing one tier ─────────────────────
function TierEditModal({ tier, onUpdateField, onUpdateItem, onAddItem, onDeleteItem,
  onSave, onCancel, border, textP, textS }: {
  tier: Tier
  onUpdateField: (field: 'label' | 'shingle_brand' | 'warranty', val: string) => void
  onUpdateItem: (itemId: string, field: keyof TierLineItem, val: string | number) => void
  onAddItem: () => void
  onDeleteItem: (itemId: string) => void
  onSave: () => void
  onCancel: () => void
  border: string; textP: string; textS: string
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>

      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Modal header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: textP }}>
            Edit {tier.label} Tier
          </div>
          <button onClick={onCancel}
            style={{ border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 20, color: textS, padding: '0 4px', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' as const, padding: '20px 24px' }}>

          {/* Label / Brand / Warranty */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
            {(['label', 'shingle_brand', 'warranty'] as const).map(field => (
              <div key={field}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em', color: textS, marginBottom: 4 }}>
                  {field === 'shingle_brand' ? 'Brand' : field === 'warranty' ? 'Warranty' : 'Label'}
                </div>
                <input value={tier[field]} onChange={e => onUpdateField(field, e.target.value)}
                  style={{ width: '100%', border: `1px solid ${border}`, borderRadius: 8,
                    padding: '7px 10px', fontSize: 13, outline: 'none',
                    boxSizing: 'border-box' as const }}
                  onFocus={e => (e.target.style.borderColor = C.teal)}
                  onBlur={e => (e.target.style.borderColor = border)} />
              </div>
            ))}
          </div>

          {/* Items table */}
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const,
            letterSpacing: '0.08em', color: textS, marginBottom: 8 }}>
            Line Items
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px 80px 32px',
            gap: 8, marginBottom: 6, padding: '0 4px' }}>
            {['Item', 'Qty', 'Unit', '$/Unit', ''].map((h, i) => (
              <div key={i} style={{ fontSize: 10, fontWeight: 700, color: textS,
                textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                textAlign: i > 0 ? 'center' as const : 'left' as const }}>
                {h}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            {tier.items.map(item => (
              <div key={item.id}>
                {pendingDeleteId === item.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', borderRadius: 8, background: '#FEF2F2',
                    border: '1px solid #FECACA' }}>
                    <span style={{ fontSize: 13, color: '#991B1B' }}>
                      Remove <strong>{item.name || 'this item'}</strong>?
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setPendingDeleteId(null)}
                        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #FECACA',
                          background: 'transparent', color: '#991B1B', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={() => { onDeleteItem(item.id); setPendingDeleteId(null) }}
                        style={{ padding: '4px 12px', borderRadius: 6, border: 'none',
                          background: '#DC2626', color: '#fff', fontSize: 12,
                          fontWeight: 700, cursor: 'pointer' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px 80px 32px',
                    gap: 8, alignItems: 'center' }}>
                    <input value={item.name}
                      onChange={e => onUpdateItem(item.id, 'name', e.target.value)}
                      placeholder="Item name"
                      style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '7px 10px',
                        fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
                      onFocus={e => (e.target.style.borderColor = C.teal)}
                      onBlur={e => (e.target.style.borderColor = border)} />
                    <input value={item.qty} type="number"
                      onChange={e => onUpdateItem(item.id, 'qty', Number(e.target.value))}
                      style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '7px 6px',
                        fontSize: 13, outline: 'none', textAlign: 'center' as const,
                        width: '100%', boxSizing: 'border-box' as const }}
                      onFocus={e => (e.target.style.borderColor = C.teal)}
                      onBlur={e => (e.target.style.borderColor = border)} />
                    <div style={{ fontSize: 12, color: textS, textAlign: 'center' as const }}>
                      {item.unit}
                    </div>
                    <input value={item.unit_price} type="number"
                      onChange={e => onUpdateItem(item.id, 'unit_price', Number(e.target.value))}
                      style={{ border: `1px solid ${border}`, borderRadius: 8, padding: '7px 6px',
                        fontSize: 13, outline: 'none', textAlign: 'center' as const,
                        width: '100%', boxSizing: 'border-box' as const }}
                      onFocus={e => (e.target.style.borderColor = C.teal)}
                      onBlur={e => (e.target.style.borderColor = border)} />
                    <button onClick={() => setPendingDeleteId(item.id)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer',
                        color: '#CBD5E1', fontSize: 18, padding: 0, lineHeight: 1,
                        textAlign: 'center' as const }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.danger)}
                      onMouseLeave={e => (e.currentTarget.style.color = '#CBD5E1')}>
                      ×
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Computed amount column — shown below the inputs */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginTop: 2 }}>
            {tier.items.map(item => (
              !pendingDeleteId || pendingDeleteId !== item.id ? (
                <div key={item.id + '_amt'} style={{ display: 'flex', justifyContent: 'flex-end',
                  fontSize: 12, fontWeight: 600, color: textS, marginTop: -46, paddingRight: 48 }}>
                </div>
              ) : null
            ))}
          </div>

          <button onClick={onAddItem}
            style={{ marginTop: 12, width: '100%', background: 'none',
              border: `1px dashed ${border}`, borderRadius: 8, padding: '8px',
              fontSize: 13, color: textS, cursor: 'pointer', fontWeight: 600 }}>
            + Add item
          </button>

          {/* Subtotal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginTop: 20, paddingTop: 16, borderTop: `2px solid ${border}` }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: textP }}>Subtotal</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: C.teal, letterSpacing: '-0.5px' }}>
              {fmt(tier.subtotal)}
            </span>
          </div>
        </div>

        {/* Modal footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button onClick={onCancel}
            style={{ padding: '10px 24px', borderRadius: 10, border: `1px solid ${border}`,
              background: 'transparent', color: textS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onSave}
            style={{ padding: '10px 28px', borderRadius: 10, border: 'none',
              background: C.teal, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(15,118,110,0.3)' }}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}


function StandardSection({ items, onUpdateItem, onAdd, onDelete,
  card, border, textP, textS, isLocked = false }: {
  items: TierLineItem[]
  onUpdateItem?: (id: string, field: keyof TierLineItem, val: string | number) => void
  onAdd?: (id: string) => void; onDelete?: (id: string) => void
  card: string; border: string; textP: string; textS: string
  isLocked?: boolean
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
            <input value={item.name} onChange={e => onUpdateItem?.(item.id, 'name', e.target.value)}
              placeholder="Item name"
              ref={el => { if (el && item.id === newItemId) { el.focus(); setNewItemId(null) } }}
              style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600,
                color: textP, outline: 'none', width: '100%' }} />
            <input value={item.qty} type="number" onChange={e => onUpdateItem?.(item.id, 'qty', Number(e.target.value))}
              style={{ background: '#fff', padding: '6px 8px', borderRadius: 6,
                border: `1px solid ${border}`,
                fontSize: 14, textAlign: 'center', outline: 'none', color: textP }} />
            <input value={item.unit_price} type="number"
              onChange={e => onUpdateItem?.(item.id, 'unit_price', Number(e.target.value))}
              style={{ border: `1px solid ${border}`, background: '#fff', padding: '6px 8px',
                borderRadius: 6, fontSize: 14, textAlign: 'right', outline: 'none', color: textP }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: textP, textAlign: 'right' }}>
              {fmt(item.amount)}
            </div>
            <button onClick={() => onDelete && setPendingDeleteId(item.id)}
              style={{ border: 'none', background: 'none', color: onDelete ? C.danger : C.muted, cursor: onDelete ? 'pointer' : 'default', fontSize: 18 }}>
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
                <button onClick={() => { onDelete?.(pendingDeleteId!); setPendingDeleteId(null) }}
                  style={{ padding: '5px 14px', borderRadius: 7, border: 'none',
                    background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            </div>
          )
        })()}

        <button onClick={() => {
            if (!onAdd) return
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
function ScopeCard({ scope, onChange, card, border, textP, textS, readOnly = false }: {
  scope: string; onChange?: (v: string) => void
  card: string; border: string; textP: string; textS: string
  readOnly?: boolean
}) {
  return (
    <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_SM,
      border: `1px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: textS, marginBottom: 14 }}>
        Scope of Work
      </div>
      {readOnly ? (
        <div style={{ fontSize: 14, color: textP, lineHeight: 1.7, padding: '4px 0' }}>
          {scope || <span style={{ color: C.muted }}>No scope of work specified.</span>}
        </div>
      ) : (
        <>
          <textarea value={scope} onChange={e => onChange?.(e.target.value)}
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
        </>
      )}
    </div>
  )
}

// ── InsuranceCard ──────────────────────────────────────────────────────────────
function InsuranceCard({ estimate, computedTotal, card, border, textP, textS }: {
  estimate: RoofingEstimate; computedTotal: number; card: string; border: string; textP: string; textS: string
}) {
  const approved        = estimate.approved_amount   ?? 0
  const supplement      = estimate.supplement_amount ?? 0
  const deductible      = estimate.deductible        ?? 0
  const insurancePays   = approved + supplement - deductible
  const fullCost        = computedTotal || estimate.total || 0
  const outOfPocket     = fullCost - Math.max(insurancePays, 0)
  const fullyCovered    = outOfPocket <= 0
  const cs              = estimate.claim_status ?? null
  const payable         = cs === 'Approved' || cs === 'Supplement Approved'
  const denied          = cs === 'Denied'
  const chipBg          = payable ? C.green : denied ? '#DC2626' : '#94A3B8'
  const chipLabel       = cs || 'Pending'

  return (
    <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_SM,
      border: `1px solid ${border}`, borderLeft: `4px solid ${C.amber}` }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase' as const,
          letterSpacing: '0.08em', color: C.amber }}>🛡️ Insurance Claim</span>
        <span style={{ padding: '3px 10px', borderRadius: 999, background: chipBg,
          color: '#fff', fontSize: 11, fontWeight: 800 }}>{chipLabel}</span>
        {estimate.insurance_company && (
          <span style={{ fontSize: 12, color: textS, marginLeft: 4 }}>
            {estimate.insurance_company}
            {estimate.claim_number ? ` · Claim #${estimate.claim_number}` : ''}
          </span>
        )}
      </div>

      {/* 3-line breakdown — only when carrier has approved */}
      {payable ? (
      <div style={{ borderRadius: 12, border: `1px solid ${border}`, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px' }}>
          <span style={{ fontSize: 13, color: textS, fontWeight: 600 }}>Full job cost</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: textP }}>{fmtDec(fullCost)}</span>
        </div>
        <div style={{ height: 1, background: border }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px' }}>
          <span style={{ fontSize: 13, color: textS, fontWeight: 600 }}>Insurance pays homeowner</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{fmtDec(Math.max(insurancePays,0))}</span>
        </div>
        <div style={{ height: 1, background: border }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', background: fullyCovered ? '#F0FDF4' : '#FFF7ED' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: textP }}>Homeowner out of pocket</span>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em',
            color: fullyCovered ? C.green : '#D97706' }}>
            {fmtDec(Math.max(outOfPocket, 0))}
          </span>
        </div>
      </div>
      ) : (
      <div style={{ borderRadius: 12, border: `1px solid ${border}`, padding: '12px 16px', marginBottom: 14,
        fontSize: 13, fontWeight: 600, color: textS }}>
        {denied
          ? 'Claim denied — insurance pays nothing. Homeowner pays the full job cost.'
          : 'Insurance reconciliation appears once the carrier marks the claim Approved.'}
      </div>
      )}



      {/* Adjuster info */}
      {estimate.adjuster_name && (
        <div style={{ fontSize: 12, color: textS, marginTop: 12 }}>
          Adjuster: {estimate.adjuster_name}
        </div>
      )}
    </div>
  )
}

// ── TermsCard ──────────────────────────────────────────────────────────────────
function TermsCard({ terms, onChange, show, onToggle, card, border, textP, textS, readOnly = false }: {
  terms: string; onChange?: (v: string) => void
  show: boolean; onToggle: () => void
  card: string; border: string; textP: string; textS: string
  readOnly?: boolean
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
        <textarea value={terms} onChange={e => onChange?.(e.target.value)}
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

  return (
    <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Selected tier / summary */}
      <div style={{ background: card, borderRadius: 16, padding: 24, boxShadow: SHADOW_MD,
        border: `1px solid ${border}`, overflow: 'hidden' }}>

        {/* GBB summary — selected tier + tier comparison */}
        {estType === 'tiered' && selTierData && (
          <>
            {/* Selected tier — compact, informational */}
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase' as const,
                  letterSpacing: '0.08em' }}>
                  Selected
                </span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: textP }}>{selTierData.shingle_brand}</div>
              <div style={{ fontSize: 12, color: textS, marginTop: 2 }}>
                {selTierData.label} · {selTierData.warranty}
              </div>
            </div>

            {/* Tier price comparison */}
            <div style={{ marginBottom: 16 }}>
              {(Object.keys(tierTotals) as TierKey[]).map(k => {
                const isSelected = k === selectedTier
                const tierLabel  = tierLabels[k]
                return (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 8, padding: '4px 8px',
                    borderRadius: 8, background: isSelected ? C.tealLight : 'transparent' }}>
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 400,
                      color: isSelected ? C.teal : textS }}>
                      {tierLabel}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 800 : 500,
                      color: isSelected ? C.teal : textS }}>
                      {fmt(tierTotals[k])}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
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
                <div style={{ fontSize: 13, fontWeight: 600, color: textP }}>{m.name}</div>
                <div style={{ fontSize: 11, color: textS }}>{m.pct}% · {m.due_when}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: textP }}>{fmt(m.amount)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12,
          borderTop: `1px solid ${border}`, marginTop: 8 }}>
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

    </div>
  )
}
