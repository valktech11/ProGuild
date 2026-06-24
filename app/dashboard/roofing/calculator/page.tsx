// app/dashboard/roofing/calculator/page.tsx
// Reads pg_report_data from sessionStorage (set by satellite report pipeline).
// Pre-populates squares, pitch, waste. Runs roofing calculator formula.
// Pushes line items directly into a new or existing estimate via /api/estimates.
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'
import { Card } from '@/components/ui/Card'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme, T } from '@/lib/tokens'

// ── Tokens ────────────────────────────────────────────────────────────────────
const TEAL   = '#0F766E'
const TEAL_L = '#14B8A6'
const NAVY   = '#0A1628'
const CREAM  = '#F7F6F3'
const BORDER = '#E2E8F0'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ReportData {
  squares:     number
  pitch:       string
  waste:       number
  address:     string
  reportId?:   string
  storedAt?:   number
  propertyId?: string | null
  // Linear footage from DSM — auto-fills Section 2
  ridgeLF?:    number
  eaveLF?:     number
  perimLF?:    number
  hipLF?:      number
  valleyLF?:   number
  rakeLF?:     number
  lines?:      { type:string; lf:number; user_adjusted:boolean; source:string }[]
}


// ── Pitch factors ─────────────────────────────────────────────────────────────
import { PITCH_FACTORS, PITCH_OPTIONS, getPitchFactor } from '@/lib/roofing/pitchFactors'
import { calculateMaterials, DEFAULT_PRICES, settingsToCalculatorPrices, type CalcLineItem as LineItem } from '@/lib/roofing/calculator'
import { computeInsuranceReconciliation } from '@/lib/insurance/reconciliation'
import { groundSupplementFlags } from '@/lib/fl/supplement'

function normalizePitch(raw: string | number): string {
  if (typeof raw === 'number') return '6/12'
  const s = String(raw).trim()
  if (PITCH_FACTORS[s]) return s
  const n = s.replace(':', '/').replace(/\.0\//,'/')
  return PITCH_FACTORS[n] ? n : '6/12'
}

// Clean address — remove duplicate city segments from Solar API geocode results
function cleanAddress(raw: string): string {
  if (!raw) return raw
  // "3919 Highgate Court, Jacksonville, Jacksonville, FL 32216, USA"
  // Split, dedupe consecutive identical parts (case-insensitive), rejoin
  const parts = raw.replace(', USA', '').split(', ')
  const deduped: string[] = []
  for (const p of parts) {
    if (deduped.length === 0 || p.toLowerCase() !== deduped[deduped.length - 1].toLowerCase()) {
      deduped.push(p)
    }
  }
  return deduped.join(', ')
}

// ── Focused input helper ──────────────────────────────────────────────────────
function FInput({ label, hint, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const [f, setF] = useState(false)
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:7 }}>
        {label}{hint && <span style={{ color:'#64748B', fontWeight:400, textTransform:'none' as const, letterSpacing:0, marginLeft:6, fontSize:11 }}>{hint}</span>}
      </label>
      <input {...p}
        onFocus={e => { setF(true); (p as any).onFocus?.(e) }}
        onBlur={e => { setF(false); (p as any).onBlur?.(e) }}
        style={{
          width:'100%', boxSizing:'border-box' as const,
          padding:'9px 12px',
          border:`1.5px solid ${f ? TEAL : BORDER}`,
          borderRadius:9, fontSize:14, outline:'none',
          background: f ? '#fff' : CREAM, color: NAVY,
          boxShadow: f ? '0 0 0 3px rgba(15,118,110,0.1)' : 'none',
          transition:'all 0.15s',
          ...(p.style||{}),
        }}
      />
    </div>
  )
}
function FSelect({ label, hint, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const [f, setF] = useState(false)
  return (
    <div>
      <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#475569', textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:7 }}>
        {label}{hint && <span style={{ color:'#64748B', fontWeight:400, textTransform:'none' as const, letterSpacing:0, marginLeft:6, fontSize:11 }}>{hint}</span>}
      </label>
      <select {...p}
        onFocus={e => { setF(true); (p as any).onFocus?.(e) }}
        onBlur={e => { setF(false); (p as any).onBlur?.(e) }}
        style={{
          width:'100%', boxSizing:'border-box' as const,
          padding:'9px 12px',
          border:`1.5px solid ${f ? TEAL : BORDER}`,
          borderRadius:9, fontSize:14, outline:'none',
          background: f ? '#fff' : CREAM, color: NAVY,
          boxShadow: f ? '0 0 0 3px rgba(15,118,110,0.1)' : 'none',
          transition:'all 0.15s', cursor:'pointer',
          ...(p.style||{}),
        }}>
        {children}
      </select>
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────────
function Section({ n, label, sub, children, right }: { n: string; label: string; sub: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ background:'#fff', borderRadius:14, border:`1px solid ${BORDER}`, overflow:'hidden', boxShadow:'0 2px 10px rgba(10,22,40,0.05)', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'14px 20px 0', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
          <div style={{ width:30, height:30, borderRadius:9, background:`linear-gradient(135deg,${TEAL},${TEAL_L})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0 }}>{n}</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:800, color:NAVY, letterSpacing:'-0.02em' }}>{label}</div>
            <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>{sub}</div>
          </div>
        </div>
        {right && <div style={{ flexShrink:0 }}>{right}</div>}
      </div>
      <div style={{ padding:'0 20px 20px' }}>{children}</div>
    </div>
  )
}

// ── Inner page ────────────────────────────────────────────────────────────────
function CalculatorInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)

  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [squares,    setSquares]    = useState('')
  const [pitch,      setPitch]      = useState('6/12')
  const [waste,      setWaste]      = useState('10')
  const [ridgeLF,    setRidgeLF]    = useState('')
  const [hipLF,      setHipLF]      = useState('')
  const [valleyLF,   setValleyLF]   = useState('')
  const [eaveLF,     setEaveLF]     = useState('')
  const [perimLF,    setPerimLF]    = useState('')
  const [pipeBoots,  setPipeBoots]  = useState('3')
  const [tearoff,    setTearoff]    = useState('1')
  const [labour,     setLabour]     = useState('')
  const [prices,     setPrices]     = useState<Record<string,number>>({ ...DEFAULT_PRICES })
  const [lineItems,  setLineItems]  = useState<LineItem[]>([])
  const [adjSq,      setAdjSq]      = useState(0)
  const [saving,     setSaving]     = useState(false)
  const [insurance,  setInsurance]  = useState<{
    isInsurance: boolean; approvedAmount: number; supplement: number; deductible: number; claimStatus: string
  } | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState<string | null>(null)
  const [editPrices, setEditPrices] = useState(false)
  // If this lead already has a live (non-void) estimate, pricing will UPDATE it
  // rather than create a new one (server dedupes). Surface that so the roofer knows.
  const [existingEstimate, setExistingEstimate] = useState<{ number: string; status: string } | null>(null)
  const [customLines, setCustomLines] = useState<{ name: string; amount: number }[]>([])
  // Real tax rate from the calculator-state endpoint (replaces the hardcoded 6%
  // preview, so the total is right off-FL too). Null until the librarian answers.
  const [taxRatePct, setTaxRatePct] = useState<number | null>(null)
  // True when applying would convert a Good/Better/Best estimate to a single
  // Standard price. The tiers are preserved (reversible), but we still flag it.
  const [isGbbEstimate, setIsGbbEstimate] = useState(false)

  const leadId     = searchParams.get('lead_id')     ?? null
  const propertyId = searchParams.get('property_id') ?? null
  const fromSq     = searchParams.get('sq')           ?? null  // sq footage from property (fallback)

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    const proId = session.id

    // Legacy fresh bootstrap — pro's saved prices (settings units → calc units).
    // Only used when there's NO lead to ask the librarian about; with a lead the
    // calculator-state endpoint already returns the right prices.
    const loadSettingsPrices = () => {
      fetch(`/api/roofing/settings?pro_id=${proId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const sp = d?.material_prices
          if (!sp) return
          setPrices(prev => ({ ...prev, ...settingsToCalculatorPrices(sp) }))
        })
        .catch(() => {})
    }

    // Just-generated report numbers live in sessionStorage before they're saved to
    // the lead. Used as the fresh bootstrap (no lead), and as an overlay when a lead
    // exists but has no estimate yet (numbers the roofer just produced should win).
    const applySessionReport = () => {
      const raw = sessionStorage.getItem('pg_report_data')
      if (raw) {
        try {
          const d = JSON.parse(raw) as ReportData
          const storedAt  = d.storedAt as number | undefined
          const ageMs     = storedAt ? (Date.now() - storedAt) : Infinity
          const noContext = !propertyId && !leadId
          const fromPromeasure = searchParams.get('from') === 'promeasure'
          // ProMeasure standalone has no lead/property context by design — exempt it
          // from the noContext stale gate; use age-only (10 min).
          const isStale   = ageMs > 10 * 60 * 1000 || (!fromPromeasure && noContext)
          if (isStale) {
            sessionStorage.removeItem('pg_report_data')
            if (fromSq) setSquares(fromSq)
          } else {
            setReportData({ ...d, address: cleanAddress(d.address) })
            setSquares(String(Math.round(d.squares * 10) / 10))
            setPitch(normalizePitch(d.pitch))
            setWaste(String(Math.round(d.waste)))
            // Normalize snake_case (ProMeasure) + camelCase (satellite report) keys
            const ridgeLF = d.ridgeLF ?? (d as any).ridge_lf ?? 0
            const hipLF   = (d as any).hip_lf ?? 0
            const valleyLF= (d as any).valley_lf ?? 0
            const eaveLF  = d.eaveLF  ?? (d as any).eave_lf  ?? 0
            const perimLF = d.perimLF ?? (d as any).perimeter ?? 0
            if (ridgeLF  > 0) setRidgeLF(String(Math.round(ridgeLF)))
            if (hipLF    > 0) setHipLF(String(Math.round(hipLF)))
            if (valleyLF > 0) setValleyLF(String(Math.round(valleyLF)))
            if (eaveLF   > 0) setEaveLF(String(Math.round(eaveLF)))
            if (perimLF  > 0) setPerimLF(String(Math.round(perimLF)))
          }
        } catch { sessionStorage.removeItem('pg_report_data') }
      } else if (fromSq) {
        setSquares(fromSq)
      }
    }

    // ── No lead → legacy fresh bootstrap; nothing to ask the librarian. ──
    if (!leadId) {
      loadSettingsPrices()
      applySessionReport()
      return
    }

    // ── Lead present → the librarian is the SINGLE source for every input. ──
    // One call decides estimate-vs-fresh and returns measurements, prices, labour,
    // custom lines, tax, and (if an estimate exists) its number/status. The old
    // per-field fetches (settings, estimates list, leads labour/LF) are gone, so
    // web and mobile load identically and can't race or disagree.
    fetch(`/api/roofing/calculator-state?lead_id=${leadId}&pro_id=${proId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { loadSettingsPrices(); applySessionReport(); return }
        const m = d.measurements ?? {}
        if (m.squares        != null) setSquares(String(m.squares))
        if (m.pitch          != null) setPitch(String(m.pitch))
        if (m.waste_pct      != null) setWaste(String(m.waste_pct))
        if (m.ridge_lf       != null) setRidgeLF(String(m.ridge_lf))
        if (m.eave_lf        != null) setEaveLF(String(m.eave_lf))
        if (m.perimeter_lf   != null) setPerimLF(String(m.perimeter_lf))
        if (m.pipe_boots     != null) setPipeBoots(String(m.pipe_boots))
        if (m.tearoff_layers != null) setTearoff(String(m.tearoff_layers))
        setPrices({ ...DEFAULT_PRICES, ...(d.price_overrides ?? {}) })
        setLabour(d.labour_amount > 0 ? String(d.labour_amount) : '')
        setCustomLines(
          (d.custom_items ?? []).map((it: any) => ({
            name:   String(it.description ?? 'Custom line'),
            amount: Number(it.amount) || 0,
          }))
        )
        if (d.tax_rate != null) setTaxRatePct(Number(d.tax_rate))
        if (d.source === 'estimate' && d.estimate_number) {
          setExistingEstimate({ number: String(d.estimate_number), status: String(d.status ?? '') })
        }
        setIsGbbEstimate(d.source === 'estimate' && d.estimate_type === 'tiered')
        // Fresh lead (no estimate yet): let a just-generated report overlay the
        // librarian's saved numbers, since those are the freshest the roofer has.
        if (d.source === 'fresh') applySessionReport()
      })
      .catch(() => { loadSettingsPrices(); applySessionReport() })

    // Insurance reconciliation panel — read live from the lead. Not a calculator
    // pricing input, so it stays a separate read; touches different rjd fields, no
    // overlap with anything the librarian sets.
    fetch(`/api/leads/${leadId}?pro_id=${proId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const rjd = d?.lead?.roofing_job_data
        if (rjd?.insurance_claim) {
          setInsurance({
            isInsurance:    true,
            approvedAmount: Number(rjd.approved_amount)   || 0,
            supplement:     Number(rjd.supplement_amount) || 0,
            deductible:     Number(rjd.deductible)        || 0,
            claimStatus:    String(rjd.claim_status ?? ''),
          })
        }
        // Pre-fill LF from the lead's linear_footage (human ProMeasure lines win
        // via GET precedence). Only set fields the user hasn't already typed.
        const lf = rjd?.linear_footage
        if (lf) {
          if (lf.ridge_ft  > 0) setRidgeLF(p => p || String(Math.round(lf.ridge_ft)))
          if (lf.hip_ft    > 0) setHipLF(p => p || String(Math.round(lf.hip_ft)))
          if (lf.valley_ft > 0) setValleyLF(p => p || String(Math.round(lf.valley_ft)))
          if (lf.eave_ft   > 0) setEaveLF(p => p || String(Math.round(lf.eave_ft)))
        }
      })
      .catch(() => {})
  }, [session, router, fromSq, leadId])

  useEffect(() => {
    const sq = parseFloat(squares)
    if (!sq || sq <= 0) { setLineItems([]); setAdjSq(0); return }
    const { items, adjustedSquares } = calculateMaterials({
      squares: sq, pitchKey: pitch, wastePct: parseFloat(waste) || 0,
      ridgeLF: parseFloat(ridgeLF) || 0, eaveLF: parseFloat(eaveLF) || 0, perimLF: parseFloat(perimLF) || 0,
      hipLF: parseFloat(hipLF) || 0, valleyLF: parseFloat(valleyLF) || 0,
      prices, pipeBoots: parseInt(pipeBoots) || 0, tearoffLayers: parseInt(tearoff) || 0,
    })
    setLineItems(items)
    setAdjSq(adjustedSquares)
  }, [squares, pitch, waste, ridgeLF, eaveLF, perimLF, hipLF, valleyLF, prices, pipeBoots, tearoff])

  // Labour is persisted server-side from the estimate's saved line on Apply
  // (lib/roofing/labour-cache.ts). The calculator no longer writes labour_amount.

  const materialTotal = lineItems.reduce((s, i) => s + i.total, 0)
  // Items still missing their linear footage (shown in the LF nudge below the table).
  const missingItems = lineItems.filter(i => i.isPlaceholder).map(i => i.description)
  const labourAmount  = parseFloat(labour) || 0
  const grandTotal    = materialTotal + labourAmount
  const needsLF       = !parseFloat(ridgeLF) || !parseFloat(eaveLF) || !parseFloat(perimLF)

  // Deterministic supplement flags from human-traced LF. Detected-only (derived, no
  // persistence). Rendered only on insurance jobs, below the reconciliation panel.
  const supplementFlags = groundSupplementFlags({
    ridge_ft:  parseFloat(ridgeLF)  || 0,
    hip_ft:    parseFloat(hipLF)    || 0,
    valley_ft: parseFloat(valleyLF) || 0,
  })

  // Tax preview — mirrors server logic so the roofer sees the real total before clicking Apply.
  // Update path: stored estimate tax_rate (unknown client-side) ?? 6. Create path: STATE_TAX_RATES[state] ?? 0.
  // We always show ?? 6 as a conservative preview (matches what the server will use for FL and most states).
  const STATE_TAX_RATES_PREVIEW: Record<string, number> = {
    AL:4.0,AK:0.0,AZ:5.6,AR:6.5,CA:7.25,CO:2.9,CT:6.35,DE:0.0,FL:6.0,GA:4.0,
    HI:4.0,ID:6.0,IL:6.25,IN:7.0,IA:6.0,KS:6.5,KY:6.0,LA:4.45,ME:5.5,MD:6.0,
    MA:6.25,MI:6.0,MN:6.875,MS:7.0,MO:4.225,MT:0.0,NE:5.5,NV:6.85,NH:0.0,NJ:6.625,
    NM:5.125,NY:4.0,NC:4.75,ND:5.0,OH:5.75,OK:4.5,OR:0.0,PA:6.0,RI:7.0,SC:6.0,
    SD:4.5,TN:7.0,TX:6.25,UT:5.95,VT:6.0,VA:5.3,WA:6.5,WV:6.0,WI:5.0,WY:4.0,DC:6.0,
  }
  const proState   = (session?.state ?? '').toUpperCase()
  const taxRate    = taxRatePct ?? (existingEstimate
    ? 6  // update path: server uses stored tax_rate ?? 6; we show 6 as the safe preview
    : (STATE_TAX_RATES_PREVIEW[proState] ?? 0))
  const taxAmount  = Math.round(grandTotal * taxRate / 100 * 100) / 100
  const totalWithTax = grandTotal + taxAmount
  // Hand-added custom lines live on the estimate and are added on top, taxed too.
  // We surface them read-only so the roofer sees the true final estimate total.
  const customTotal        = customLines.reduce((s, l) => s + l.amount, 0)
  const estSubtotalWithCustom = grandTotal + customTotal
  const estTaxWithCustom   = Math.round(estSubtotalWithCustom * taxRate / 100 * 100) / 100
  const estTotalWithCustom = Math.round((estSubtotalWithCustom + estTaxWithCustom) * 100) / 100

  const handleApply = useCallback(async () => {
    if (!session || lineItems.length === 0) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const allItems = [
        ...lineItems.filter(i => !i.isPlaceholder).map(i => ({
          description: i.description,
          quantity:    i.quantity,
          unit_price:  i.unitPrice,
        })),
        ...(labourAmount > 0 ? [{ description: 'Labour & installation', quantity: 1, unit_price: labourAmount }] : []),
      ]
      const res = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:           session.id,
          lead_id:          leadId,
          lead_name:        reportData?.address ?? 'New Estimate',
          trade:            session.trade      ?? 'Roofing',
          trade_slug:       session.trade_slug ?? 'roofer',
          state:            session.state      ?? '',
          source:           'roofing_calculator',
          square_count:     parseFloat(squares) || null,
          pitch:            pitch,
          waste_pct:        parseFloat(waste) || 10,
          ridge_lf:         parseFloat(ridgeLF) || null,
          hip_lf:           parseFloat(hipLF)   || null,
          valley_lf:        parseFloat(valleyLF)|| null,
          lines:            reportData?.lines ?? null,
          eave_lf:          parseFloat(eaveLF)  || null,
          perimeter_lf:     parseFloat(perimLF) || null,
          pipe_boots:       parseInt(pipeBoots, 10) || null,
          tearoff_layers:   Number.isFinite(parseInt(tearoff, 10)) ? parseInt(tearoff, 10) : null,
          property_address: reportData?.address ?? null,
          report_data:      reportData,
          line_items:       allItems,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(()=>({}))
        throw new Error((d as any).error ?? `HTTP ${res.status}`)
      }
      const respData = await res.json() as { id?: string; estimate?: { id: string }; existed?: boolean; revised?: boolean; revision_number?: number; custom_lines_preserved?: number }
      const estimateId = respData.id ?? respData.estimate?.id
      // Labour cache is written server-side from the persisted estimate line
      // (lib/roofing/labour-cache.ts) — no client PATCH needed here.
      sessionStorage.removeItem('pg_report_data')
      const msg = respData.revised
        ? `Revision ${respData.revision_number ?? ''} created — the signed original is kept on record. Taking you to the new draft…`
        : (respData.existed ? 'Estimate updated' : 'Estimate created') + ' — taking you there now…'
      setSuccess(msg)
      setTimeout(() => router.push(`/dashboard/estimates/${estimateId}${leadId ? `?from=calculator&lead_id=${leadId}` : '?from=calculator'}`), 1200)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create estimate')
    } finally { setSaving(false) }
  }, [session, lineItems, leadId, reportData, router, labour, labourAmount, squares, pitch, waste])

  if (!session) return null

  const pitchFactor = PITCH_FACTORS[pitch] ?? 1.118

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}>

      <div style={{ maxWidth:820, margin:'0 auto', padding:'0 4px 48px', fontFamily:"'DM Sans',system-ui,-apple-system,sans-serif" }}>

        {/* ── Page header ── */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:24, paddingTop:4 }}>
          <div style={{ width:46, height:46, borderRadius:13, background:`linear-gradient(135deg,${TEAL},${TEAL_L})`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 6px 18px rgba(15,118,110,0.35)`, flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <rect x="4" y="2" width="16" height="20" rx="2"/>
              <line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/>
              <line x1="8" y1="14" x2="12" y2="14"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize:24, fontWeight:800, color:t.textPri, margin:0, letterSpacing:'-0.03em', fontFamily:"'DM Sans',system-ui,sans-serif" }}>Roofing Calculator</h1>
            <p style={{ fontSize:13, color: reportData ? TEAL : t.textSubtle, margin:0, marginTop:3, fontWeight: reportData ? 600 : 400, display:'flex', alignItems:'center', gap:5 }}>
              {reportData ? (
                <><span style={{ width:6, height:6, borderRadius:'50%', background:TEAL, display:'inline-block', boxShadow:`0 0 6px ${TEAL}80` }}/> Pre-filled from report: {reportData.address}</>
              ) : 'Enter roof measurements to calculate materials and build an estimate'}
            </p>
          </div>
        </div>

        {/* ── Section 1: Measurements ── */}
        <Section n="1" label="Roof Measurements" sub="How big is the roof — satellite or manual entry">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <FInput label="Squares (flat area)" hint="from report or manual"
              type="number" min="0" step="0.1" value={squares} placeholder="e.g. 22.5"
              onChange={e => setSquares(e.target.value)} />
            <FSelect label="Pitch" hint="steeper roof = more material"
              value={pitch} onChange={e => setPitch(e.target.value)}>
              {PITCH_OPTIONS.map(p => (
                <option key={p} value={p}>{p} (×{PITCH_FACTORS[p].toFixed(3)})</option>
              ))}
            </FSelect>
            <FInput label="Waste %" hint="10% simple roof, 15% hips/valleys"
              type="number" min="0" max="30" step="1" value={waste}
              onChange={e => setWaste(e.target.value)} />
          </div>

          {/* Adjusted squares summary */}
          {adjSq > 0 && (
            <div style={{ display:'flex', gap:10, marginTop:14, flexWrap:'wrap' as const }}>
              {[
                { label:'Flat sq', value: squares },
                { label:'Waste', value: `+${waste}%` },
                { label:'Sq to order ▶', value: String(adjSq), highlight: true },
              ].map(s => (
                <div key={s.label} style={{
                  padding:'8px 14px', borderRadius:9,
                  background: s.highlight ? `linear-gradient(135deg,${TEAL},${TEAL_L})` : CREAM,
                  border: s.highlight ? 'none' : `1px solid ${BORDER}`,
                }}>
                  <div style={{ fontSize:10, fontWeight:700, color: s.highlight ? 'rgba(255,255,255,0.85)' : '#64748B', textTransform:'uppercase' as const, letterSpacing:'0.07em' }}>{s.label}</div>
                  <div style={{ fontSize:16, fontWeight:800, color: s.highlight ? '#fff' : NAVY, letterSpacing:'-0.02em', marginTop:2 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Section 2: Linear footage ── */}
        {parseFloat(squares) > 0 && (
          <Section n="2" label="Edge & Ridge Lengths" sub="For ridge cap, valley, starter strip & drip edge — type below or measure with ProMeasure"
            right={
              needsLF ? (
                leadId ? (
                  <button
                    onClick={()=>{
                      // Pass lead_id only — ProMeasure fetches the lead's authoritative
                      // property_address itself, avoiding a stale address from reportData.
                      router.push(`/dashboard/roofing/promeasure?lead_id=${leadId}&from=calculator`)
                    }}
                    style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:100, background:'#0F766E', border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                    Measure with ProMeasure →
                  </button>
                ) : (
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:100, background:'#FFFBEB', border:'1px solid rgba(245,158,11,0.3)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span style={{ fontSize:10, fontWeight:700, color:'#B45309' }}>Enter linear footage below</span>
                  </div>
                )
              ) : (
                <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:100, background:'#F0FDF4', border:'1px solid rgba(5,150,105,0.2)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize:10, fontWeight:700, color:'#059669' }}>Complete</span>
                </div>
              )
            }>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:14 }}>
              <FInput label="Ridge LF" hint="for ridge cap bundles"
                type="number" min="0" step="1" value={ridgeLF} placeholder="e.g. 48"
                onChange={e => setRidgeLF(e.target.value)} />
              <FInput label="Hip LF" hint="for hip cap bundles"
                type="number" min="0" step="1" value={hipLF} placeholder="e.g. 60"
                onChange={e => setHipLF(e.target.value)} />
              <FInput label="Valley LF" hint="for valley lining"
                type="number" min="0" step="1" value={valleyLF} placeholder="e.g. 24"
                onChange={e => setValleyLF(e.target.value)} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:14 }}>
              <FInput label="Eave LF" hint="for starter strip + eave membrane"
                type="number" min="0" step="1" value={eaveLF} placeholder="e.g. 120"
                onChange={e => setEaveLF(e.target.value)} />
              <FInput label="Perimeter LF" hint="for drip edge"
                type="number" min="0" step="1" value={perimLF} placeholder="e.g. 280"
                onChange={e => setPerimLF(e.target.value)} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <FInput label="Pipe boots / vents" hint="pipes, vents, skylights"
                type="number" min="0" step="1" value={pipeBoots} placeholder="e.g. 3"
                onChange={e => setPipeBoots(e.target.value)} />
              <FSelect label="Tear-off layers" hint="affects disposal cost"
                value={tearoff} onChange={e => setTearoff(e.target.value)}>
                <option value="0">None — new construction</option>
                <option value="1">1 layer (standard)</option>
                <option value="2">2 layers (+50% disposal)</option>
              </FSelect>
            </div>
          </Section>
        )}

        {/* ── Supplement flags — directly below LF entry, before materials ── */}
        {insurance?.isInsurance && supplementFlags.length > 0 && (
          <Card dk={false} variant="default" accent="#0F766E" pad="none" style={{ marginBottom:14 }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #99F6E4', display:'flex', alignItems:'center', gap:8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span style={{ fontSize:13, fontWeight:800, color:'#065F46' }}>Supplement items from your measurements</span>
            </div>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:12 }}>
              {supplementFlags.map(f => (
                <div key={f.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:'#0F172A' }}>{f.item}</div>
                    <div style={{ fontSize:12, color:'#475569', marginTop:2, lineHeight:1.45 }}>
                      {f.basis === 'code' ? 'Code-required' : 'Standard supplement'} — track for supplement recovery when the carrier responds.
                    </div>
                    <span style={{ display:'inline-block', marginTop:5, fontSize:10.5, fontWeight:600, letterSpacing:'0.02em', color:'#94A3B8', fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{f.code}</span>
                  </div>
                  <div style={{ whiteSpace:'nowrap', textAlign:'right' as const }}>
                    <span style={{ fontSize:18, fontWeight:800, color:'#0F766E', letterSpacing:'-0.02em' }}>{f.measured_lf}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#0F766E', opacity:0.6, marginLeft:3 }}>LF</span>
                  </div>
                </div>
              ))}
              <div style={{ fontSize:11, color:'#64748B', lineHeight:1.45 }}>
                Based on your traced lines. Informational — verify against the carrier scope; not legal or public-adjuster advice.
              </div>
            </div>
          </Card>
        )}

        {/* ── Section 3: Materials ── */}
        {lineItems.length > 0 && (
          <Section n="3" label="Material Quantities" sub="Quantities calculated from your measurements — tap Edit prices to adjust"
            right={
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {editPrices && session && (
                  <button
                    onClick={async () => {
                      // Convert calculator units back to settings units for saving
                      const toSave = {
                        shingles_upgraded: Math.round(prices.shingles * 3),
                        underlayment:      prices.underlayment,
                        ice_water:         prices.iceWater,
                        ridge_cap:         +(prices.ridgeCap     / 35).toFixed(2),
                        starter_strip:     +(prices.starterStrip / 105).toFixed(2),
                        drip_edge:         +(prices.dripEdge     / 10).toFixed(2),
                      }
                      await fetch('/api/roofing/settings', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pro_id: session.id, material_prices: toSave }),
                      })
                      setEditPrices(false)
                    }}
                    style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'5px 12px', borderRadius:8, background:`linear-gradient(135deg,${TEAL},#14B8A6)`, border:'none', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 6px rgba(15,118,110,0.3)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Save as defaults
                  </button>
                )}
                <button onClick={() => setEditPrices(e => !e)}
                  style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, background: editPrices ? `rgba(15,118,110,0.1)` : '#fff', border:`1.5px solid ${editPrices ? TEAL : TEAL}`, color: TEAL, fontSize:12, fontWeight:700, cursor:'pointer', boxShadow: editPrices ? 'none' : '0 1px 4px rgba(15,118,110,0.15)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  {editPrices ? 'Cancel' : 'Edit prices'}
                </button>
              </div>
            }>

            <table style={{ width:'100%', borderCollapse:'collapse' as const }}>
              <thead>
                <tr style={{
                  background:'linear-gradient(90deg,rgba(15,118,110,0.05) 0%,rgba(20,184,166,0.03) 100%)',
                  borderBottom:`1.5px solid rgba(15,118,110,0.12)`,
                }}>
                  {(['Material','Breakdown','Qty','Unit', editPrices ? 'Unit Price' : null,'Total'] as (string|null)[]).filter(Boolean).map(h => (
                    <th key={h} style={{ padding:'9px 10px', fontSize:10, fontWeight:700, color:'#64748B', textTransform:'uppercase' as const, letterSpacing:'0.08em', textAlign: h==='Material'||h==='Breakdown' ? 'left' as const : 'right' as const }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item.key}
                    style={{
                      borderBottom:`1px solid rgba(15,118,110,0.06)`,
                      background: item.isPlaceholder
                        ? (i%2===0 ? 'transparent' : 'rgba(15,118,110,0.012)')
                        : (i%2===0 ? 'transparent' : 'rgba(15,118,110,0.016)'),
                      opacity: item.isPlaceholder ? 0.5 : 1,
                    }}>
                    <td style={{ padding:'10px', fontSize:13, fontWeight:600, color:NAVY, minWidth:160 }}>
                      {item.description}
                      {item.isPlaceholder && (
                        <span style={{ marginLeft:6, display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700, color:'#B45309', background:'#FFFBEB', border:'1px solid rgba(180,83,9,0.2)', borderRadius:100, padding:'1px 6px' }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          needs LF
                        </span>
                      )}
                    </td>
                    <td style={{ padding:'10px', fontSize:12, color:'#64748B', maxWidth:200 }}>
                      {item.note}
                    </td>
                    <td style={{ padding:'10px', textAlign:'right' as const, fontSize:13, fontWeight:item.isPlaceholder?400:700, color:item.isPlaceholder?'#94A3B8':NAVY }}>
                      {item.isPlaceholder ? '—' : item.quantity}
                    </td>
                    <td style={{ padding:'10px', textAlign:'right' as const, fontSize:12, color:'#64748B' }}>
                      {item.unit}
                    </td>
                    {editPrices && (
                      <td style={{ padding:'10px', textAlign:'right' as const }}>
                        <div style={{ display:'inline-flex', alignItems:'center', gap:3, background:'#fff', border:`1.5px solid ${BORDER}`, borderRadius:7, padding:'4px 8px' }}>
                          <span style={{ fontSize:11, color:'#64748B' }}>$</span>
                          <input type="number" min="0" step="0.01"
                            value={prices[item.key]}
                            onChange={e => setPrices(p => ({ ...p, [item.key]: parseFloat(e.target.value)||0 }))}
                            style={{ width:56, border:'none', outline:'none', fontSize:13, fontWeight:600, color:NAVY, background:'transparent', textAlign:'right' as const }}
                          />
                        </div>
                      </td>
                    )}
                    <td style={{ padding:'10px', textAlign:'right' as const, fontSize:13, fontWeight:700, color: item.isPlaceholder ? '#94A3B8' : TEAL }}>
                      {item.isPlaceholder ? '—' : `$${item.total.toLocaleString()}`}
                    </td>
                  </tr>
                ))}

                {/* Materials subtotal */}
                <tr style={{ borderTop:`2px solid rgba(15,118,110,0.12)`, background:'rgba(15,118,110,0.03)' }}>
                  <td colSpan={editPrices ? 5 : 4} style={{ padding:'12px 10px', fontSize:14, fontWeight:800, color:NAVY }}>
                    Materials subtotal
                  </td>
                  <td style={{ padding:'12px 10px', textAlign:'right' as const, fontSize:15, fontWeight:800, color:TEAL, letterSpacing:'-0.02em' }}>
                    ${materialTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            {missingItems.length > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, padding:'10px 14px', borderRadius:9, background:'#FFFBEB', border:'1px solid rgba(245,158,11,0.25)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span style={{ fontSize:12, color:'#B45309', fontWeight:500 }}>{missingItems.join(', ')} {missingItems.length === 1 ? 'needs' : 'need'} linear footage. Enter it in Section 2, or measure precisely with ProMeasure, for a complete total.</span>
              </div>
            )}
          </Section>
        )}

        {/* ── Section 4: Labour ── */}
        {lineItems.length > 0 && (
          <Section n="4" label="Labour & Installation" sub="Your install cost — not included in materials above">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:14, alignItems:'end' }}>
              <div>
                <FInput label="Labour Amount ($)" hint="total install cost"
                  type="number" min="0" step="100" value={labour} placeholder="e.g. 4500"
                  onChange={e => setLabour(e.target.value)} />
              </div>
              <div style={{ padding:'12px 16px', borderRadius:10, background: labourAmount > 0 ? 'rgba(15,118,110,0.05)' : CREAM, border:`1px solid ${labourAmount > 0 ? 'rgba(15,118,110,0.2)' : BORDER}` }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'#64748B', fontWeight:600 }}>Materials</span>
                  <span style={{ fontSize:14, fontWeight:700, color:NAVY }}>${materialTotal.toLocaleString()}</span>
                </div>
                {labourAmount > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                    <span style={{ fontSize:12, color:'#64748B', fontWeight:600 }}>Labour</span>
                    <span style={{ fontSize:14, fontWeight:700, color:NAVY }}>+${labourAmount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ height:1, background: labourAmount > 0 ? 'rgba(15,118,110,0.2)' : BORDER, margin:'8px 0' }}/>
                {taxRate > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:12, color:'#64748B', fontWeight:600 }}>Tax ({proState || 'state'} {taxRate}%)</span>
                    <span style={{ fontSize:14, fontWeight:700, color:NAVY }}>+${taxAmount.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, fontWeight:800, color:NAVY }}>Calculated total{taxRate > 0 ? ' (incl. tax)' : ''}</span>
                  <span style={{ fontSize:20, fontWeight:900, color:TEAL, letterSpacing:'-0.03em' }}>${totalWithTax.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                </div>
                <div style={{ fontSize:12, color:'#64748B', marginTop:6, lineHeight:1.45 }}>
                  Materials + labour for this roof. {existingEstimate ? 'Any custom lines already on the estimate are added on top — see the estimate for the final total.' : 'The estimate total may differ if you add custom lines.'}
                </div>
                {customLines.length > 0 && (
                  <div style={{ marginTop:12, paddingTop:12, borderTop:`1px dashed ${BORDER}` }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>
                      Also on the estimate · kept, not priced here
                    </div>
                    {customLines.map((l, i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:13, color:'#475569' }}>{l.name}</span>
                        <span style={{ fontSize:13, fontWeight:600, color:'#475569' }}>+${l.amount.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                      </div>
                    ))}
                    <div style={{ height:1, background:BORDER, margin:'8px 0' }}/>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:NAVY }}>Estimate total (incl. these)</span>
                      <span style={{ fontSize:15, fontWeight:800, color:NAVY, letterSpacing:'-0.02em' }}>${estTotalWithCustom.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                    </div>
                    <div style={{ fontSize:11, color:'#94A3B8', marginTop:6 }}>Edit these lines on the estimate — applying here keeps them.</div>
                  </div>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* ── Insurance Reconciliation Panel ── */}
        {insurance?.isInsurance && (insurance.claimStatus === 'Approved' || insurance.claimStatus === 'Supplement Approved') && lineItems.length > 0 && (() => {
          const { insurancePays, outOfPocket, fullyCovered } = computeInsuranceReconciliation({
            jobCost:        estTotalWithCustom,
            approvedAmount: insurance.approvedAmount,
            supplement:     insurance.supplement,
            deductible:     insurance.deductible,
          })

          return (
            <div style={{
              marginBottom: 14, borderRadius: 12, overflow: 'hidden',
              border: `1.5px solid ${fullyCovered ? '#BBF7D0' : '#FED7AA'}`,
              background: fullyCovered ? '#F0FDF4' : '#FFFBEB',
            }}>
              {/* Header */}
              <div style={{ padding:'12px 16px', borderBottom:`1px solid ${fullyCovered ? '#BBF7D0' : '#FED7AA'}`, display:'flex', alignItems:'center', gap:8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={fullyCovered?'#059669':'#D97706'} strokeWidth="2.5" strokeLinecap="round">
                  {fullyCovered ? <polyline points="20 6 9 17 4 12"/> : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                </svg>
                <span style={{ fontSize:13, fontWeight:800, color: fullyCovered?'#065F46':'#92400E' }}>
                  {fullyCovered ? 'Insurance fully covers this job' : 'Insurance breakdown'}
                </span>
              </div>

              {/* 3 lines */}
              <div style={{ padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:13, color:'#64748B', fontWeight:600 }}>Full job cost</div>
                    <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>incl. tax &amp; all estimate lines</div>
                  </div>
                  <span style={{ fontSize:14, fontWeight:700, color:'#0F172A' }}>${estTotalWithCustom.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <span style={{ fontSize:13, color:'#64748B', fontWeight:600 }}>Insurance pays homeowner</span>
                  <span style={{ fontSize:14, fontWeight:700, color:'#059669' }}>${Math.max(insurancePays,0).toLocaleString()}</span>
                </div>
                <div style={{ height:1, background:'rgba(0,0,0,0.08)', marginBottom:10 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:14, fontWeight:800, color:'#0F172A' }}>Homeowner out of pocket</span>
                  <span style={{ fontSize:20, fontWeight:900, letterSpacing:'-0.03em', color: fullyCovered?'#059669':'#D97706' }}>
                    ${Math.max(outOfPocket,0).toLocaleString()}
                  </span>
                </div>

              </div>
            </div>
          )
        })()}

        {/* Error / success */}
        {existingEstimate && !success && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderRadius:10, background:'#FFFBEB', border:'1px solid #FDE68A', marginBottom:14 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span style={{ fontSize:13, color:'#92400E', fontWeight:600 }}>
              {['approved','invoiced','paid'].includes(existingEstimate.status)
                ? `Estimate #${existingEstimate.number} is already signed. Applying creates a new revision and keeps the original on record — it won't change the signed one.`
                : `This lead already has estimate #${existingEstimate.number}. Applying updates it (your hand-added lines are kept), it won't create a duplicate.`}
            </span>
          </div>
        )}
        {isGbbEstimate && !success && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderRadius:10, background:'#F0FDFA', border:'1px solid #99F6E4', marginBottom:14 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span style={{ fontSize:13, color:'#0F766E', fontWeight:600 }}>
              This job is currently a Good / Better / Best proposal (3 options). Applying the calculator shows it as a single price — your 3 options are kept and you can switch back anytime on the estimate.
            </span>
          </div>
        )}
        {error && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderRadius:10, background:'#FEF2F2', border:'1px solid #FECACA', marginBottom:14 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize:13, color:'#DC2626', fontWeight:600 }}>{error}</span>
          </div>
        )}
        {success && (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px', borderRadius:10, background:'#F0FDF4', border:'1px solid #BBF7D0', marginBottom:14 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ fontSize:13, color:'#059669', fontWeight:600 }}>{success}</span>
          </div>
        )}

        {/* ── CTA ── */}
        {lineItems.length > 0 && (
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleApply} disabled={saving}
              style={{
                flex:1, padding:'14px 24px', borderRadius:11, border:'none',
                background: saving ? '#94A3B8' : `linear-gradient(135deg,${TEAL},${TEAL_L})`,
                color:'#fff', fontSize:15, fontWeight:800, cursor: saving ? 'wait' : 'pointer',
                boxShadow: saving ? 'none' : `0 6px 20px rgba(15,118,110,0.38)`,
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                letterSpacing:'-0.01em', transition:'all 0.15s',
              }}>
              {saving
                ? <><div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', animation:'pg-spin 0.7s linear infinite' }}/> {existingEstimate ? (['approved','invoiced','paid'].includes(existingEstimate.status) ? 'Creating revision…' : 'Updating estimate…') : 'Creating estimate…'}</>
                : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> {existingEstimate ? (['approved','invoiced','paid'].includes(existingEstimate.status) ? `Create Revision of #${existingEstimate.number}` : `Update Estimate #${existingEstimate.number}`) : 'Apply to Estimate'}</>
              }
            </button>
            <button onClick={() => router.back()}
              style={{ padding:'14px 22px', borderRadius:11, background:'#fff', border:`1.5px solid ${BORDER}`, color:'#64748B', fontSize:14, fontWeight:600, cursor:'pointer' }}>
              Back
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes pg-spin{to{transform:rotate(360deg)}}`}</style>
    </DashboardShell>
  )
}

export default function CalculatorPage() {
  return (
    <Suspense fallback={null}>
      <CalculatorInner />
    </Suspense>
  )
}
