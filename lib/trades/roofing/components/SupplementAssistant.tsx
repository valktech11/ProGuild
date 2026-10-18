'use client'
import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { SUPPLEMENT_DISCLAIMER, FL_UNIT_RATES, groundSupplementFlags, itemNameToCorpusKey, type SupplementResult, type SupplementItem, type MeasuredLinearFootage, type GroundedSupplementFlag, type DBLineItem, type FLUnitRateKey } from '@/lib/fl/supplement'
import type { EvidenceMap } from '@/app/api/roofing/supplement/evidence/route'
import { Card } from '@/components/ui/Card'

interface Props {
  leadId:             string
  proId:              string
  propertyState?:     string | null
  propertyAddress?:   string | null  // fallback FL detection when contact_state is blank
  hasClaim:           boolean   // roofing_job_data.insurance_claim
  darkMode:           boolean
  measuredLF?:        MeasuredLinearFootage | null  // synthesized linear_footage from the lead (human ProMeasure LF)
  groundedFlags?:     GroundedSupplementFlag[] | null  // server-computed (Bible §28); falls back to local compute if absent
  checklistItems?:    DBLineItem[] | null             // Phase A: DB-driven checklist (fetched by parent or page)
  onAnalyzingChange?: (analyzing: boolean) => void   // lets parent disable "Mark supplement filed" during analysis
}

const TEAL = '#0F766E'
const NAVY = '#0A1628'

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

// ── Item table ────────────────────────────────────────────────────────────────
function ItemTable({ items, dk, accent, evidence }: { items: SupplementItem[]; dk: boolean; accent: string; evidence: EvidenceMap }) {
  if (items.length === 0) return null
  const border   = dk ? '#334155' : '#E2E8F0'
  const sub      = dk ? '#94A3B8' : '#64748B'
  const text     = dk ? '#E2E8F0' : '#0F172A'
  const evBg     = dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC'
  const reqColor = '#DC2626'
  const optColor = sub
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => {
        const corpusKey = itemNameToCorpusKey(it.item)
        const evItems   = corpusKey ? (evidence[corpusKey] ?? []) : []
        const isCondition = evItems.length > 0 && evItems.every(e => e.evidence_type === 'photo' || e.evidence_type === 'video')
        return (
          <div key={i} style={{ borderRadius: 10, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}`, background: dk ? 'rgba(255,255,255,0.02)' : '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{it.item}</div>
                  <div style={{ fontSize: 12, color: sub, marginTop: 3, lineHeight: 1.45 }}>{it.reason}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, marginTop: 6 }}>
                    {it.fl_code && <span style={{ fontSize: 11, fontWeight: 600, color: accent, background: accent + '14', padding: '2px 7px', borderRadius: 5 }}>{it.fl_code}</span>}
                    {it.suggested_quantity && <span style={{ fontSize: 11, color: sub }}>Qty: {it.suggested_quantity}</span>}
                    {it.suggested_unit_price > 0 && <span style={{ fontSize: 11, color: sub }}>@ {money(it.suggested_unit_price)}</span>}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: text, whiteSpace: 'nowrap' as const }}>{money(it.suggested_total)}</div>
              </div>
            </div>
            {evItems.length > 0 && (
              <div style={{ borderTop: `1px solid ${border}`, background: evBg, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: isCondition ? '#D97706' : sub, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>
                  {isCondition ? 'Field evidence required' : 'Documentation checklist'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                  {evItems.map((ev, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: ev.is_required ? reqColor : optColor, flexShrink: 0, marginTop: 1 }}>
                        {ev.is_required ? '●' : '○'}
                      </span>
                      <span style={{ fontSize: 11, color: ev.is_required ? text : sub, lineHeight: 1.45 }}>{ev.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Phase A: Deterministic checklist (DB-driven, no AI call) ─────────────────
function SupplementChecklist({ items, dk }: { items: DBLineItem[]; dk: boolean }) {
  const [open, setOpen] = useState(false)
  const border = dk ? '#334155' : '#E2E8F0'
  const text   = dk ? '#E2E8F0' : '#0F172A'
  const sub    = dk ? '#94A3B8' : '#64748B'
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: 16, borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: dk ? 'rgba(15,118,110,0.12)' : '#F0FDF9', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: dk ? '#5EEAD4' : TEAL, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
            FL Supplement Checklist — {items.length} items
          </div>
          <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>Paste the adjuster scope below to scan against these.</div>
        </div>
        <span style={{ fontSize: 12, color: sub, marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' as const }}>
            {items.map((item, i) => (
              <div key={item.key} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                borderBottom: i < items.length - 1 ? `1px solid ${border}` : 'none',
                background: i % 2 === 0 ? 'transparent' : (dk ? 'rgba(255,255,255,0.01)' : '#FAFAFA'),
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: item.is_deterministic ? '#10B981' : '#F59E0B' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{item.name}</span>
                  {item.is_condition_based && (
                    <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: '#F59E0B', background: '#FEF3C7', padding: '1px 6px', borderRadius: 4 }}>FIELD EVIDENCE</span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: sub, flexShrink: 0 }}>
                  {item.category === 'condition_based' ? 'Condition' : 'Code'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ padding: '7px 14px', borderTop: `1px solid ${border}`, background: dk ? 'rgba(255,255,255,0.02)' : '#F8FAFC' }}>
            <span style={{ fontSize: 10, color: sub }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#10B981', marginRight: 5 }} />Validated argument
              <span style={{ marginLeft: 12, display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', marginRight: 5 }} />Provisional
            </span>
          </div>
        </>
      )}
    </div>
  )
}


// ── Rate Settings panel ───────────────────────────────────────────────────────
type RateMap = Record<string, number>

function RateSettings({ proId, dk }: { proId: string; dk: boolean }) {
  const border  = dk ? '#334155' : '#E2E8F0'
  const text    = dk ? '#E2E8F0' : '#0F172A'
  const sub     = dk ? '#94A3B8' : '#64748B'
  const inputBg = dk ? 'rgba(255,255,255,0.04)' : '#F8FAFC'

  const [open,     setOpen]     = useState(false)
  const [rates,    setRates]    = useState<RateMap>({})
  const [defaults, setDefaults] = useState<RateMap>({})
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [loadErr,  setLoadErr]  = useState(false)

  useEffect(() => {
    if (!open) return
    apiFetch(`/api/user/supplement-rates?pro_id=${proId}`)
      .then(r => r.json())
      .then(d => {
        if (d.effective) setRates({ ...d.effective })
        if (d.defaults)  setDefaults(d.defaults)
      })
      .catch(() => setLoadErr(true))
  }, [open, proId])

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      await apiFetch(`/api/user/supplement-rates?pro_id=${proId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rates }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch { /* non-fatal */ }
    finally { setSaving(false) }
  }

  const handleReset = () => {
    setRates({ ...defaults })
  }

  const rateKeys = Object.keys(FL_UNIT_RATES) as FLUnitRateKey[]

  return (
    <div style={{ marginTop: 14, borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', background: dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚙</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: text }}>Rate Settings</span>
          <span style={{ fontSize: 11, color: sub }}>— customize FL unit prices</span>
        </div>
        <span style={{ fontSize: 12, color: sub }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${border}`, padding: 14 }}>
          <div style={{ fontSize: 11, color: sub, marginBottom: 12, lineHeight: 1.5 }}>
            These are estimated FL market rates (2025–2026). Update with your actual accepted rates for more accurate supplements.
            <span style={{ color: TEAL, fontWeight: 600 }}> Rates are estimates — verify against your adjuster's FL price list.</span>
          </div>

          {loadErr && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 10 }}>Could not load rates. Try reopening.</div>}

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {rateKeys.map(key => {
              const meta = FL_UNIT_RATES[key]
              const val  = rates[key] ?? meta.rate
              const isCustom = defaults[key] !== undefined && val !== defaults[key]
              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: text }}>{meta.label}</span>
                    {isCustom && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: TEAL, background: TEAL + '18', padding: '1px 5px', borderRadius: 4 }}>custom</span>}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={meta.unit === 'PCT' ? 1 : 0.01}
                    value={val}
                    onChange={e => setRates(r => ({ ...r, [key]: parseFloat(e.target.value) || 0 }))}
                    style={{
                      width: 72, padding: '5px 8px', fontSize: 12, fontWeight: 600, textAlign: 'right',
                      border: `1px solid ${isCustom ? TEAL : border}`, borderRadius: 6,
                      background: inputBg, color: text,
                    }}
                  />
                  <span style={{ fontSize: 11, color: sub, width: 30 }}>/{meta.unit}</span>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button
              onClick={handleReset}
              style={{ padding: '7px 12px', borderRadius: 7, border: `1px solid ${border}`, background: 'transparent', color: sub, fontSize: 12, cursor: 'pointer' }}>
              Reset to defaults
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: saved ? '#10B981' : TEAL, color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save rates'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: sub, marginTop: 8, lineHeight: 1.4 }}>
            Saved rates apply to all future supplement analyses. Re-run Analyze Scope to use updated rates.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Result panel (collapsible sections) ──────────────────────────────────────
function ResultPanel({ result, dk, border, text, sub, evidence, copied, copyLetter }: {
  result: SupplementResult | null
  dk: boolean; border: string; text: string; sub: string
  evidence: EvidenceMap; copied: boolean; copyLetter: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  const [showLetter,  setShowLetter]  = useState(false)
  if (!result) return null

  const allItems = [...result.missing_items, ...result.underpaid_items]

  return (
    <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Total summary */}
      <div style={{ padding: '14px 16px', borderRadius: 10, background: TEAL + (dk ? '22' : '10'), border: `1px solid ${TEAL}44` }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: dk ? '#5EEAD4' : TEAL, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Estimated supplement</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: text, marginTop: 2 }}>{money(result.total_supplement_estimate)}</div>
        <div style={{ fontSize: 11.5, color: sub, marginTop: 2 }}>
          {result.missing_items.length} missing · {result.underpaid_items.length} underpaid
        </div>
      </div>

      {result.missing_items.length === 0 && result.underpaid_items.length === 0 && (
        <div style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>
          No missing or underpaid items found — the adjuster&apos;s scope looks complete against the FL checklist. That&apos;s a valid result, not an error.
        </div>
      )}

      {/* Summary table — always visible */}
      {allItems.length > 0 && (
        <div style={{ borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '8px 14px', background: dk ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderBottom: `1px solid ${border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Item</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: 'uppercase' as const, letterSpacing: '0.06em', textAlign: 'right' as const, paddingRight: 24 }}>Qty</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: 'uppercase' as const, letterSpacing: '0.06em', textAlign: 'right' as const }}>Amount</span>
          </div>
          {allItems.map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '9px 14px', borderBottom: i < allItems.length - 1 ? `1px solid ${border}` : 'none', background: i % 2 === 0 ? 'transparent' : (dk ? 'rgba(255,255,255,0.01)' : '#FAFAFA') }}>
              <div style={{ paddingRight: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{it.item}</span>
                <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 700, color: i < result.missing_items.length ? '#DC2626' : '#D97706', background: i < result.missing_items.length ? '#FEE2E2' : '#FEF3C7', padding: '1px 5px', borderRadius: 4 }}>
                  {i < result.missing_items.length ? 'MISSING' : 'UNDERPAID'}
                </span>
              </div>
              <span style={{ fontSize: 12, color: sub, textAlign: 'right' as const, paddingRight: 24, whiteSpace: 'nowrap' as const }}>{it.suggested_quantity || '1 EA'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEAL, textAlign: 'right' as const, whiteSpace: 'nowrap' as const }}>{money(it.suggested_total)}</span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '10px 14px', background: dk ? 'rgba(15,118,110,0.12)' : '#F0FDF9', borderTop: `1px solid ${TEAL}33` }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: dk ? '#5EEAD4' : TEAL }}>Total Request</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: dk ? '#5EEAD4' : TEAL }}>{money(result.total_supplement_estimate)}</span>
          </div>
        </div>
      )}

      {/* FL codes + evidence — collapsed by default */}
      {allItems.length > 0 && (
        <button
          onClick={() => setShowDetails(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: sub, fontSize: 12, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' as const }}>
          <span>{showDetails ? '▲' : '▼'}</span>
          {showDetails ? 'Hide FL codes & evidence' : `Show FL codes & evidence (${allItems.length} items)`}
        </button>
      )}
      {showDetails && allItems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          {result.missing_items.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: text, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Missing items</div>
              <ItemTable items={result.missing_items} dk={dk} accent="#DC2626" evidence={evidence} />
            </div>
          )}
          {result.underpaid_items.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: text, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>Underpaid items</div>
              <ItemTable items={result.underpaid_items} dk={dk} accent="#D97706" evidence={evidence} />
            </div>
          )}
        </div>
      )}

      {/* Draft letter — collapsed by default, Copy always visible */}
      {result.supplement_letter && (
        <div style={{ borderRadius: 10, border: `1px solid ${border}`, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC' }}>
            <button
              onClick={() => setShowLetter(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span style={{ fontSize: 14 }}>📄</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: text }}>Draft Supplement Letter</span>
              <span style={{ fontSize: 11, color: sub }}>{showLetter ? '▲' : '▼'}</span>
            </button>
            <button
              onClick={copyLetter}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${TEAL}`, background: copied ? TEAL : 'transparent', color: copied ? '#fff' : TEAL, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              {copied ? 'Copied ✓' : 'Copy Letter'}
            </button>
          </div>
          {!showLetter && (
            <div
              onClick={() => setShowLetter(true)}
              style={{ padding: '10px 14px', borderTop: `1px solid ${border}`, fontSize: 12, color: sub, lineHeight: 1.5, cursor: 'pointer', fontStyle: 'italic' as const }}>
              {result.supplement_letter.split('\n').slice(0, 3).join(' · ').slice(0, 160)}…
              <span style={{ color: TEAL, fontWeight: 600, marginLeft: 6 }}>Show full letter</span>
            </div>
          )}
          {showLetter && (
            <textarea
              readOnly
              value={result.supplement_letter}
              rows={14}
              style={{
                width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const,
                padding: '12px 14px', fontSize: 12.5, lineHeight: 1.6, fontFamily: 'inherit',
                border: 'none', borderTop: `1px solid ${border}`,
                background: dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC', color: text, display: 'block',
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default function SupplementAssistant({ leadId, proId, propertyState, propertyAddress, hasClaim, darkMode: dk, measuredLF, groundedFlags, checklistItems, onAnalyzingChange }: Props) {
  const [scope,   setScope]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [result,  setResult]  = useState<SupplementResult | null>(null)
  const [copied,  setCopied]  = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)   // ISO timestamp of last saved run
  const [restoring, setRestoring] = useState(true)
  const [dbChecklist, setDbChecklist] = useState<DBLineItem[]>([])
  const [evidence,    setEvidence]    = useState<EvidenceMap>({})

  // Mirror mobile FL detection: contact_state == 'FL' OR address contains 'FL'/'Florida'
  // (contact_state is blank on some leads created via certain web paths)
  const isFL = (propertyState ?? '').trim().toUpperCase() === 'FL' ||
    /\bFL\b/i.test(propertyAddress ?? '') ||
    (propertyAddress ?? '').toLowerCase().includes('florida')
  // Bible §28: prefer the server-computed flags; local compute is a rollout fallback only.
  const grounded = groundedFlags ?? groundSupplementFlags(measuredLF)

  // Load the most recent session + DB checklist on mount
  useEffect(() => {
    if (!isFL || !hasClaim) { setRestoring(false); return }
    // Fetch DB checklist for Phase A display (non-fatal — falls back to empty)
    apiFetch(`/api/roofing/supplement/checklist?pro_id=${proId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.items)) setDbChecklist(d.items) })
      .catch(() => {})
    apiFetch(`/api/roofing/supplement?lead_id=${leadId}&pro_id=${proId}`)
      .then(r => r.json())
      .then(d => {
        if (d.session) {
          setScope(d.session.scope_text || '')
          const restoredResult = d.session.result_json as SupplementResult
          setResult(restoredResult)
          if (restoredResult) {
            const items = [...(restoredResult.missing_items||[]), ...(restoredResult.underpaid_items||[])]
            const keys = [...new Set(items.map((i: SupplementItem) => itemNameToCorpusKey(i.item)).filter(Boolean))] as string[]
            if (keys.length > 0) apiFetch(`/api/roofing/supplement/evidence?pro_id=${proId}&keys=${keys.join(',')}`).then(r=>r.json()).then(d=>{if(d.evidence)setEvidence(d.evidence)}).catch(()=>{})
          }
          setLastRun(d.session.created_at)
        }
      })
      .catch(() => {})
      .finally(() => setRestoring(false))
  }, [leadId, proId, isFL, hasClaim])

  const analyze = useCallback(async () => {
    if (scope.trim().length < 20) { setError('Paste the adjuster\u2019s scope of loss first (a few lines).'); return }
    setLoading(true); setError(null); setResult(null); onAnalyzingChange?.(true)
    try {
      const res = await apiFetch('/api/roofing/supplement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, pro_id: proId, scope_text: scope }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
      const newResult = (data as { result: SupplementResult }).result
      setResult(newResult)
      if (newResult) {
        const items = [...(newResult.missing_items||[]), ...(newResult.underpaid_items||[])]
        const keys = [...new Set(items.map((i: SupplementItem) => itemNameToCorpusKey(i.item)).filter(Boolean))] as string[]
        if (keys.length > 0) apiFetch(`/api/roofing/supplement/evidence?pro_id=${proId}&keys=${keys.join(',')}`).then(r=>r.json()).then(d=>{if(d.evidence)setEvidence(d.evidence)}).catch(()=>{})
      }
      setLastRun(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally { setLoading(false); onAnalyzingChange?.(false) }
  }, [scope, leadId, proId, onAnalyzingChange])

  const copyLetter = useCallback(() => {
    if (!result?.supplement_letter) return
    navigator.clipboard?.writeText(result.supplement_letter).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [result])

  const border = dk ? '#334155' : '#E2E8F0'
  const text   = dk ? '#E2E8F0' : '#0F172A'
  const sub    = dk ? '#94A3B8' : '#64748B'

  // Gate: roofing FL insurance claims only.
  if (restoring) {
    return (
      <Card dk={dk} accent={TEAL} style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: dk ? '#5EEAD4' : NAVY, marginBottom: 4 }}>Supplement Assistant</div>
        <div style={{ fontSize: 12, color: sub }}>Loading previous analysis…</div>
      </Card>
    )
  }

  if (!isFL) {
    return (
      <Card dk={dk} accent={TEAL} style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: dk ? '#5EEAD4' : NAVY, marginBottom: 4 }}>Supplement Assistant</div>
        <div style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>
          The Supplement Assistant applies Florida building-code line items — it only works for FL properties. Set the lead&apos;s state to <strong style={{ color: text }}>FL</strong> in Edit (contact details) to enable it.
        </div>
      </Card>
    )
  }
  if (!hasClaim) {
    return (
      <Card dk={dk} style={{ padding: '16px 18px', color: sub, fontSize: 13, lineHeight: 1.5 }}>
        Turn on <strong style={{ color: text }}>Insurance claim</strong> above and fill in the claim details first — the Supplement Assistant uses the carrier, adjuster, and roof data to draft the request.
      </Card>
    )
  }

  return (
    <Card dk={dk} accent={TEAL} pad="none">
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' as const, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: dk ? '#5EEAD4' : NAVY, letterSpacing: '0.01em' }}>Supplement Assistant</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: TEAL }}>Recover money the carrier missed</div>
          </div>
          {lastRun && <div style={{ fontSize: 11, color: sub }}>{new Date(lastRun).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
        </div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3, lineHeight: 1.45 }}>
          Paste the adjuster&apos;s scope of loss. The assistant flags FL line items they missed or underpaid and drafts a supplement letter.
          {lastRun && <span style={{ marginLeft: 6, color: TEAL, fontWeight: 600 }}>· Last run restored</span>}
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {grounded.length > 0 && (
          <div style={{ marginBottom: 14, borderRadius: 10, border: `1px solid ${border}`, background: 'transparent', padding: '11px 13px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: dk ? '#5EEAD4' : TEAL, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>From your measurements</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {grounded.map(f => (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: text }}>{f.item}</span>
                      <span style={{ fontSize: 11, color: sub }}>· {f.basis === 'code' ? 'Code-required (FL)' : 'Standard supplement'}</span>
                    </div>
                    <span style={{ display: 'inline-block', marginTop: 2, fontSize: 12, fontWeight: 600, letterSpacing: '0.01em', color: dk ? '#94A3B8' : '#475569', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{f.code}</span>
                  </div>
                  <div style={{ whiteSpace: 'nowrap', textAlign: 'right' as const, flexShrink: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: dk ? '#5EEAD4' : TEAL, letterSpacing: '-0.02em' }}>{f.measured_lf}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: dk ? '#5EEAD4' : TEAL, opacity: 0.6, marginLeft: 3 }}>LF</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: sub, marginTop: 7, lineHeight: 1.4 }}>Measured by ProMeasure — check the pasted scope below covers these.</div>
          </div>
        )}
        {grounded.length === 0 && (
          <div style={{ marginBottom: 14, padding: '10px 13px', borderRadius: 9, background: dk ? 'rgba(148,163,184,0.08)' : '#F8FAFC', border: `1px solid ${border}`, fontSize: 12, color: sub, lineHeight: 1.5 }}>
            Once you trace ridge, hip &amp; valley via ProMeasure — or enter LF in the calculator — the items detected from your measurements appear here automatically.
          </div>
        )}

        {dbChecklist.length > 0 && (
          <SupplementChecklist items={dbChecklist} dk={dk} />
        )}

        <textarea
          value={scope}
          onChange={e => { setScope(e.target.value); setError(null) }}
          placeholder="Paste the adjuster's scope of loss here — line items, quantities, prices…"
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            padding: '11px 13px', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit',
            border: `1.5px solid ${border}`, borderRadius: 9,
            background: dk ? 'rgba(255,255,255,0.03)' : '#F8FAFC', color: text,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            onClick={analyze}
            disabled={loading}
            style={{
              padding: '10px 18px', borderRadius: 9, border: 'none',
              background: loading ? (dk ? '#334155' : '#94A3B8') : TEAL, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
            {loading
              ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'pgspin 0.7s linear infinite' }} />Analyzing scope…</>
              : 'Analyze Scope'}
          </button>
          {error && <span style={{ fontSize: 12.5, color: '#DC2626', fontWeight: 600 }}>{error}</span>}
        </div>
        <style>{`@keyframes pgspin { to { transform: rotate(360deg) } }`}</style>

        <ResultPanel result={result} dk={dk} border={border} text={text} sub={sub} evidence={evidence} copied={copied} copyLetter={copyLetter} />

        {/* Rate settings */}
        <RateSettings proId={proId} dk={dk} />

        {/* Disclaimer */}
        <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 9, background: dk ? 'rgba(148,163,184,0.10)' : '#F1F5F9', border: `1px solid ${border}` }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Disclaimer</div>
          <div style={{ fontSize: 12, color: dk ? '#94A3B8' : '#475569', lineHeight: 1.5 }}>{SUPPLEMENT_DISCLAIMER}</div>
        </div>
      </div>
    </Card>
  )
}
