// app/dashboard/roofing/calculator/page.tsx
// Reads pg_report_data from sessionStorage (set by satellite report pipeline).
// Pre-populates squares, pitch, waste. Runs roofing calculator formula.
// Pushes line items directly into a new or existing estimate via /api/estimates.
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/theme'

// ── Types ──────────────────────────────────────────────────────────────────
interface ReportData {
  squares:      number
  pitch:        string   // e.g. "6/12"
  waste:        number   // percentage, e.g. 10
  address:      string
  reportId:     string
}

interface LineItem {
  description: string
  quantity:    number
  unit:        string
  unitPrice:   number
  total:       number
}

// Pitch factor lookup — matches lib/roofing/reportPdf.ts degreesToPitch()
const PITCH_FACTORS: Record<string, number> = {
  '2/12': 1.014,
  '3/12': 1.031,
  '4/12': 1.054,
  '5/12': 1.083,
  '6/12': 1.118,
  '7/12': 1.158,
  '8/12': 1.202,
  '9/12': 1.250,
  '10/12': 1.302,
  '11/12': 1.357,
  '12/12': 1.414,
}

const PITCH_OPTIONS = Object.keys(PITCH_FACTORS)

// Default material prices — pro overrides in Settings (future)
// These are reasonable FL market defaults
const DEFAULT_PRICES: Record<string, number> = {
  shingles:      95,   // per bundle (3 bundles = 1 square)
  underlayment:  45,   // per square
  ridgeCap:      55,   // per bundle (35 LF/bundle)
  starterStrip:  50,   // per bundle (105 LF/bundle)
  nails:          8,   // per lb
  dripEdge:      12,   // per 10ft piece
  iceWater:      75,   // per square
  pipeBoot:      35,   // per boot (standard residential mix)
  disposal:     375,   // dumpster flat rate (single layer tearoff)
}

// ── Calculator logic — pure function, no side effects ─────────────────────
function calculateMaterials(
  squares: number,
  pitchKey: string,
  wastePct: number,
  ridgeLF: number,
  eaveLF: number,
  perimLF: number,
  prices: Record<string, number>,
  pipeBoots: number,
  tearoffLayers: number,
): { items: LineItem[]; adjustedSquares: number } {
  const pitchFactor    = PITCH_FACTORS[pitchKey] ?? 1.118
  const adjustedSquares = squares * pitchFactor * (1 + wastePct / 100)

  const ridgeBundles   = ridgeLF  > 0 ? Math.ceil(ridgeLF / 35)  : null
  const starterBundles = eaveLF   > 0 ? Math.ceil(eaveLF / 105)  : null
  const dripPieces     = perimLF  > 0 ? Math.ceil(perimLF / 10)  : null
  const iceSquares     = eaveLF   > 0 ? Math.ceil((eaveLF * 3) / 100) : null

  const items: LineItem[] = [
    {
      description: `Architectural shingles (${pitchKey} pitch, ${wastePct}% waste)`,
      quantity:    Math.ceil(adjustedSquares * 3),
      unit:        'bundles',
      unitPrice:   prices.shingles,
      total:       Math.ceil(adjustedSquares * 3) * prices.shingles,
    },
    {
      description: 'Synthetic underlayment',
      quantity:    Math.ceil(adjustedSquares * 1.1 * 10) / 10,
      unit:        'squares',
      unitPrice:   prices.underlayment,
      total:       Math.ceil(adjustedSquares * 1.1) * prices.underlayment,
    },
    {
      description: ridgeBundles ? 'Ridge cap shingles' : 'Ridge cap shingles (enter ridge LF below)',
      quantity:    ridgeBundles ?? 0,
      unit:        'bundles',
      unitPrice:   prices.ridgeCap,
      total:       (ridgeBundles ?? 0) * prices.ridgeCap,
    },
    {
      description: starterBundles ? 'Starter strip' : 'Starter strip (enter eave LF below)',
      quantity:    starterBundles ?? 0,
      unit:        'bundles',
      unitPrice:   prices.starterStrip,
      total:       (starterBundles ?? 0) * prices.starterStrip,
    },
    {
      description: 'Roofing nails',
      quantity:    Math.ceil(adjustedSquares * 2.5),
      unit:        'lbs',
      unitPrice:   prices.nails,
      total:       Math.ceil(adjustedSquares * 2.5) * prices.nails,
    },
    {
      description: dripPieces ? 'Drip edge' : 'Drip edge (enter perimeter LF below)',
      quantity:    dripPieces ?? 0,
      unit:        'pieces',
      unitPrice:   prices.dripEdge,
      total:       (dripPieces ?? 0) * prices.dripEdge,
    },
    {
      description: iceSquares ? 'Ice and water shield (FL code — 3ft from eave)' : 'Ice and water shield (enter eave LF below)',
      quantity:    iceSquares ?? 0,
      unit:        'squares',
      unitPrice:   prices.iceWater,
      total:       (iceSquares ?? 0) * prices.iceWater,
    },
  ]

  // Pipe boots — fixed count, user-entered
  if (pipeBoots > 0) {
    items.push({
      description: `Pipe boots / vent flashing (${pipeBoots})`,
      quantity:    pipeBoots,
      unit:        'each',
      unitPrice:   prices.pipeBoot,
      total:       pipeBoots * prices.pipeBoot,
    })
  }

  // Disposal — dumpster flat rate, scales with layers and squares
  const disposalCost = tearoffLayers === 0 ? 0
    : tearoffLayers === 1 ? prices.disposal
    : Math.round(prices.disposal * 1.5)  // double layer = ~50% more
  if (tearoffLayers > 0) {
    items.push({
      description: `Tear-off disposal — ${tearoffLayers === 1 ? 'single' : 'double'} layer (${Math.round(squares)} sq)`,
      quantity:    1,
      unit:        'dumpster',
      unitPrice:   disposalCost,
      total:       disposalCost,
    })
  }

  return { items, adjustedSquares: Math.round(adjustedSquares * 10) / 10 }
}

// ── Inner component (needs useSearchParams — must be inside Suspense) ──────
function CalculatorInner() {
  const router        = useRouter()
  const searchParams  = useSearchParams()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })

  // ── Pre-fill state from sessionStorage report data ─────────────────────
  const [reportData,  setReportData]  = useState<ReportData | null>(null)
  const [squares,     setSquares]     = useState<string>('')
  const [pitch,       setPitch]       = useState<string>('6/12')
  const [waste,       setWaste]       = useState<string>('10')
  const [lineItems,   setLineItems]   = useState<LineItem[]>([])
  const [adjSq,       setAdjSq]       = useState<number>(0)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState<string | null>(null)

  // ── Linear footage inputs (for ridge cap, starter strip, drip edge, ice/water) ─
  const [ridgeLF,     setRidgeLF]     = useState<string>('')
  const [eaveLF,      setEaveLF]      = useState<string>('')
  const [perimLF,     setPerimLF]     = useState<string>('')
  const [pipeBoots,   setPipeBoots]   = useState<string>('3')
  const [tearoffLayers, setTearoffLayers] = useState<string>('1')

  // ── Unit price overrides (editable inline, default to DEFAULT_PRICES) ──
  const [prices, setPrices] = useState<Record<string, number>>({ ...DEFAULT_PRICES })

  // leadId can come from URL param (if opened from a lead detail page)
  const leadId = searchParams.get('lead_id') ?? null

  useEffect(() => {
    if (!session) { router.push('/login'); return }

    // Read report data from sessionStorage — set by satellite report pipeline
    const raw = sessionStorage.getItem('pg_report_data')
    if (raw) {
      try {
        const data = JSON.parse(raw) as ReportData
        setReportData(data)
        setSquares(String(Math.round(data.squares * 10) / 10))
        // Normalize pitch — report stores e.g. "6/12" or numeric
        const pitchKey = normalizePitch(data.pitch)
        setPitch(pitchKey)
        setWaste(String(Math.round(data.waste)))
      } catch {
        // sessionStorage had bad data — start fresh
        sessionStorage.removeItem('pg_report_data')
      }
    }
  }, [session, router])

  // Recalculate whenever inputs change
  useEffect(() => {
    const sq = parseFloat(squares)
    if (!sq || sq <= 0) { setLineItems([]); setAdjSq(0); return }
    const { items, adjustedSquares } = calculateMaterials(
      sq, pitch, parseFloat(waste) || 0,
      parseFloat(ridgeLF) || 0,
      parseFloat(eaveLF)  || 0,
      parseFloat(perimLF) || 0,
      prices,
      parseInt(pipeBoots) || 0,
      parseInt(tearoffLayers) || 0,
    )
    setLineItems(items)
    setAdjSq(adjustedSquares)
  }, [squares, pitch, waste, ridgeLF, eaveLF, perimLF, prices, pipeBoots, tearoffLayers])

  // Push to estimate
  const handleApplyToEstimate = useCallback(async () => {
    if (!session || lineItems.length === 0) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          lead_id:       leadId,
          lead_name:     reportData?.address ?? 'New Estimate',
          trade:         session.trade         ?? 'Roofing',
          trade_slug:    session.trade_slug    ?? 'roofing-contractor',
          state:         session.state         ?? '',
          source:        'roofing_calculator',
          // Measurements — written to roofing_estimate_data
          square_count:  parseFloat(squares) || null,
          pitch:         pitch                ?? null,
          waste_pct:     parseFloat(waste)    || 10,
          property_address: reportData?.address ?? null,
          report_data:   reportData,
          line_items:    lineItems.filter(i => i.quantity > 0).map(i => ({
            description: i.description.replace(' (enter ridge LF below)', '').replace(' (enter eave LF below)', '').replace(' (enter perimeter LF below)', ''),
            quantity:    i.quantity,
            unit_price:  i.unitPrice,
          })),
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as {error?:string}).error ?? `HTTP ${res.status}`)
      }

      const { id: estimateId } = await res.json() as { id: string }

      // Clear sessionStorage — report data consumed
      sessionStorage.removeItem('pg_report_data')

      setSuccess('Estimate created with calculator line items.')

      // Navigate to the new estimate after a brief moment
      setTimeout(() => {
        router.push(`/dashboard/estimates/${estimateId}`)
      }, 1200)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create estimate'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [session, lineItems, leadId, reportData, router])

  if (!session) return null
  const t = theme(dk)

  const totalCost = lineItems.reduce((s, i) => s + i.total, 0)

  return (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={() => {
        const n = !dk
        localStorage.setItem('pg_darkmode', n ? '1' : '0')
        setDk(n)
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: t.textPri, margin: 0 }}>
            Roofing Calculator
          </h1>
          {reportData && (
            <p style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>
              Pre-filled from report: {reportData.address}
            </p>
          )}
        </div>

        {/* Inputs */}
        <div style={{
          background: t.cardBg,
          border: `1px solid ${t.cardBorder}`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: t.textPri, marginBottom: 16 }}>
            Measurements
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {/* Squares */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                Squares (flat area)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={squares}
                onChange={e => setSquares(e.target.value)}
                placeholder="e.g. 28.5"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1.5px solid ${t.inputBorder}`,
                  background: t.cardBg,
                  color: t.textPri,
                  fontSize: 14,
                }}
              />
            </div>

            {/* Pitch */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                Pitch
              </label>
              <select
                value={pitch}
                onChange={e => setPitch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1.5px solid ${t.inputBorder}`,
                  background: t.cardBg,
                  color: t.textPri,
                  fontSize: 14,
                }}
              >
                {PITCH_OPTIONS.map(p => (
                  <option key={p} value={p}>
                    {p} (×{PITCH_FACTORS[p].toFixed(3)})
                  </option>
                ))}
              </select>
            </div>

            {/* Waste */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                Waste %
              </label>
              <input
                type="number"
                min="0"
                max="30"
                step="1"
                value={waste}
                onChange={e => setWaste(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1.5px solid ${t.inputBorder}`,
                  background: t.cardBg,
                  color: t.textPri,
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          {adjSq > 0 && (
            <div style={{
              marginTop: 16,
              padding: '10px 14px',
              background: '#F0FDFA',
              borderRadius: 8,
              fontSize: 13,
              color: '#0F766E',
            }}>
              Adjusted squares: <strong>{adjSq}</strong> &nbsp;·&nbsp;
              Pitch factor: <strong>{PITCH_FACTORS[pitch]?.toFixed(3)}</strong>
            </div>
          )}
        </div>

        {/* Linear footage inputs */}
        {parseFloat(squares) > 0 && (
          <div style={{
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: t.textPri, margin: 0 }}>
                Linear Footage
              </h2>
              <span style={{ fontSize: 12, color: t.textMuted }}>
                Auto-filled when Quick Bid Report is run
              </span>
            </div>
            <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 16, marginTop: 4 }}>
              Needed for ridge cap, starter strip, drip edge, and ice & water shield. Enter manually or run a satellite report.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                  Ridge LF
                </label>
                <input type="number" min="0" step="1" value={ridgeLF} onChange={e => setRidgeLF(e.target.value)}
                  placeholder="e.g. 48"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${t.inputBorder}`, background: t.cardBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                  Eave LF
                </label>
                <input type="number" min="0" step="1" value={eaveLF} onChange={e => setEaveLF(e.target.value)}
                  placeholder="e.g. 120"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${t.inputBorder}`, background: t.cardBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                  Perimeter LF
                </label>
                <input type="number" min="0" step="1" value={perimLF} onChange={e => setPerimLF(e.target.value)}
                  placeholder="e.g. 280"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${t.inputBorder}`, background: t.cardBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            </div>

          {/* Pipe boots + tearoff layers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                Pipe boots / vents
              </label>
              <input type="number" min="0" step="1" value={pipeBoots} onChange={e => setPipeBoots(e.target.value)}
                placeholder="e.g. 3"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${t.inputBorder}`, background: t.cardBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' as const }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: t.textMuted, marginBottom: 6 }}>
                Tear-off layers
              </label>
              <select value={tearoffLayers} onChange={e => setTearoffLayers(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${t.inputBorder}`, background: t.cardBg, color: t.textPri, fontSize: 14 }}
              >
                <option value="0">No tear-off (new construction)</option>
                <option value="1">1 layer</option>
                <option value="2">2 layers</option>
              </select>
            </div>
          </div>
        </div>
        )}

        {/* Material output table — always visible once squares entered */}
        {lineItems.length > 0 && (
          <div style={{
            background: t.cardBg,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: t.textPri, margin: 0 }}>
                Material Quantities
              </h2>
              <span style={{ fontSize: 12, color: t.textMuted }}>Unit prices editable below</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${t.cardBorder}` }}>
                  {['Material', 'Qty', 'Unit', 'Unit price', 'Total'].map(h => (
                    <th key={h} style={{
                      padding: '6px 8px',
                      textAlign: h === 'Material' ? 'left' : 'right',
                      color: t.textMuted,
                      fontWeight: 500,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => {
                  const priceKey = ['shingles','underlayment','ridgeCap','starterStrip','nails','dripEdge','iceWater','pipeBoot','disposal'][i]
                  const isPlaceholder = item.quantity === 0
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${t.cardBorder}`, opacity: isPlaceholder ? 0.45 : 1 }}>
                      <td style={{ padding: '8px', color: t.textPri, fontSize: 12 }}>
                        {item.description.replace(' (enter ridge LF below)', '').replace(' (enter eave LF below)', '').replace(' (enter perimeter LF below)', '')}
                        {isPlaceholder && <span style={{ fontSize: 11, color: '#F59E0B', marginLeft: 6 }}>⚠ needs LF</span>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: t.textPri, fontWeight: isPlaceholder ? 400 : 600 }}>
                        {isPlaceholder ? '—' : item.quantity}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: t.textMuted }}>{item.unit}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <span style={{ color: t.textMuted }}>$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={prices[priceKey]}
                            onChange={e => setPrices(p => ({ ...p, [priceKey]: parseFloat(e.target.value) || 0 }))}
                            style={{ width: 60, padding: '3px 6px', borderRadius: 6, border: `1px solid ${t.inputBorder}`, background: t.cardBg, color: t.textPri, fontSize: 13, textAlign: 'right' }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: isPlaceholder ? t.textMuted : '#0F766E', fontWeight: 600 }}>
                        {isPlaceholder ? '—' : `$${item.total.toLocaleString()}`}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ background: '#F0FDFA' }}>
                  <td colSpan={4} style={{ padding: '12px 8px', fontWeight: 700, color: t.textPri, fontSize: 14 }}>
                    Materials total
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, fontSize: 16, color: '#0F766E' }}>
                    ${totalCost.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            {(!parseFloat(ridgeLF) || !parseFloat(eaveLF) || !parseFloat(perimLF)) && (
              <p style={{ fontSize: 12, color: '#F59E0B', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠ Some items need linear footage — enter Ridge LF, Eave LF, and Perimeter LF above for a complete total.
              </p>
            )}
          </div>
        )}

        {/* Error / success */}
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: '#FEF2F2', color: '#DC2626',
            fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}
        {success && (
          <div style={{
            padding: '10px 14px', borderRadius: 8,
            background: '#F0FDF4', color: '#15803D',
            fontSize: 13, marginBottom: 16,
          }}>{success}</div>
        )}

        {/* Actions */}
        {lineItems.length > 0 && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleApplyToEstimate}
              disabled={saving}
              style={{
                flex: 1,
                padding: '12px 24px',
                borderRadius: 8,
                background: saving ? '#9CA3AF' : '#0F766E',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Creating estimate…' : 'Apply to estimate →'}
            </button>

            <button
              onClick={() => router.back()}
              style={{
                padding: '12px 20px',
                borderRadius: 8,
                background: 'transparent',
                color: t.textMuted,
                fontWeight: 500,
                fontSize: 14,
                border: `1px solid ${t.cardBorder}`,
                cursor: 'pointer',
              }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function normalizePitch(raw: string | number): string {
  if (typeof raw === 'number') {
    // Convert degrees to pitch if needed (satellite report stores dominant pitch as string)
    return '6/12'
  }
  const s = String(raw).trim()
  if (PITCH_FACTORS[s]) return s
  // Handle "6:12" or "6.0/12" formats
  const normalized = s.replace(':', '/').replace(/\.0\//,'/')
  return PITCH_FACTORS[normalized] ? normalized : '6/12'
}

// ── Page export — Suspense required for useSearchParams ───────────────────
export default function CalculatorPage() {
  return (
    <Suspense fallback={null}>
      <CalculatorInner />
    </Suspense>
  )
}
