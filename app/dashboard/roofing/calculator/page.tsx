'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'
import { fmtCurrency } from '@/lib/utils'

// Pitch factor lookup
const PITCH_FACTORS: Record<string, number> = {
  '2/12': 1.014, '3/12': 1.031, '4/12': 1.054, '5/12': 1.083,
  '6/12': 1.118, '7/12': 1.158, '8/12': 1.202, '9/12': 1.250,
  '10/12': 1.302, '11/12': 1.357, '12/12': 1.414,
}

interface MaterialPrices {
  shingle_cost: number       // per square
  underlayment_cost: number  // per square
  ridge_cap_cost: number     // per bundle (35 LF each)
  starter_strip_cost: number // per bundle (105 LF each)
  nail_cost: number          // per lb
  // labour
  labor_cost: number         // per square installed
  tear_off_cost: number      // per square (optional)
}

const DEFAULT_PRICES: MaterialPrices = {
  shingle_cost: 120,      // ~$120/sq for architectural shingles
  underlayment_cost: 18,
  ridge_cap_cost: 55,
  starter_strip_cost: 45,
  nail_cost: 4.50,
  labor_cost: 150,
  tear_off_cost: 45,
}

interface LineItem {
  description: string
  qty: number
  unit: string
  unit_price: number
  total: number
}

function Ic({ children, size = 16, color = 'currentColor' }: { children: React.ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  )
}

function CalculatorInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromProMeasure = searchParams.get('from') === 'promeasure'
  const sqParam = searchParams.get('sq')

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)

  // Inputs
  const [squares, setSquares] = useState(sqParam ? Number(sqParam) : 0)
  const [pitch, setPitch] = useState('4/12')
  const [waste, setWaste] = useState(10)
  const [ridgeLF, setRidgeLF] = useState(0)    // linear feet of ridge
  const [eaveLF, setEaveLF] = useState(0)       // linear feet of eave
  const [tearOff, setTearOff] = useState(true)
  const [prices, setPrices] = useState<MaterialPrices>(DEFAULT_PRICES)
  const [editPrices, setEditPrices] = useState(false)
  const [savingPrices, setSavingPrices] = useState(false)
  const [pricesSaved, setPricesSaved] = useState(false)
  const [sendingToEstimate, setSendingToEstimate] = useState(false)

  // Load saved prices and ProMeasure data
  useEffect(() => {
    if (!session) return

    // Load ProMeasure data if coming from ProMeasure
    if (fromProMeasure) {
      const raw = sessionStorage.getItem('pg_promeasure')
      if (raw) {
        const data = JSON.parse(raw)
        if (data.squares) setSquares(+data.squares.toFixed(1))
        if (data.pitch) setPitch(data.pitch)
        if (data.waste) setWaste(data.waste)
        if (data.perimeter) setEaveLF(Math.round(data.perimeter))
      }
    }

    // Load saved material prices
    fetch(`/api/roofing/settings?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => { if (d.material_prices) setPrices({ ...DEFAULT_PRICES, ...d.material_prices }) })
  }, [session, fromProMeasure])

  async function savePrices() {
    if (!session) return
    setSavingPrices(true)
    await fetch('/api/roofing/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, material_prices: prices }),
    })
    setSavingPrices(false)
    setPricesSaved(true)
    setEditPrices(false)
    setTimeout(() => setPricesSaved(false), 2000)
  }

  // ── Calculations (Founders Bible formula) ─────────────────────────────────
  const pitchFactor = PITCH_FACTORS[pitch] ?? 1.054
  const adjustedSq  = squares * pitchFactor * (1 + waste / 100)

  const shingleBundles   = Math.ceil(adjustedSq * 3)           // 3 bundles per square
  const underlaymentSq   = adjustedSq * 1.1                    // 10% overlap
  const ridgeCapBundles  = ridgeLF > 0 ? Math.ceil(ridgeLF / 35) : Math.ceil(adjustedSq * 0.08)  // estimate if no LF
  const starterBundles   = eaveLF > 0 ? Math.ceil(eaveLF / 105) : Math.ceil(adjustedSq * 0.06)
  const nailLbs          = adjustedSq * 2.5

  const lineItems: LineItem[] = [
    {
      description: 'Architectural Shingles',
      qty: shingleBundles, unit: 'bundle',
      unit_price: prices.shingle_cost / 3,
      total: shingleBundles * (prices.shingle_cost / 3),
    },
    {
      description: 'Synthetic Underlayment',
      qty: +underlaymentSq.toFixed(1), unit: 'sq',
      unit_price: prices.underlayment_cost,
      total: underlaymentSq * prices.underlayment_cost,
    },
    {
      description: 'Ridge Cap Shingles',
      qty: ridgeCapBundles, unit: 'bundle',
      unit_price: prices.ridge_cap_cost,
      total: ridgeCapBundles * prices.ridge_cap_cost,
    },
    {
      description: 'Starter Strip',
      qty: starterBundles, unit: 'bundle',
      unit_price: prices.starter_strip_cost,
      total: starterBundles * prices.starter_strip_cost,
    },
    {
      description: 'Coil Nails',
      qty: +nailLbs.toFixed(1), unit: 'lb',
      unit_price: prices.nail_cost,
      total: nailLbs * prices.nail_cost,
    },
    {
      description: 'Labor — Installation',
      qty: +adjustedSq.toFixed(1), unit: 'sq',
      unit_price: prices.labor_cost,
      total: adjustedSq * prices.labor_cost,
    },
    ...(tearOff ? [{
      description: 'Tear-Off & Disposal',
      qty: +adjustedSq.toFixed(1), unit: 'sq',
      unit_price: prices.tear_off_cost,
      total: adjustedSq * prices.tear_off_cost,
    }] : []),
  ]

  const materialTotal = lineItems.slice(0, 5).reduce((s, i) => s + i.total, 0)
  const laborTotal    = lineItems.slice(5).reduce((s, i) => s + i.total, 0)
  const grandTotal    = materialTotal + laborTotal

  async function pushToEstimate() {
    // Store line items in sessionStorage and navigate to estimate builder
    const payload = {
      items: lineItems.map(i => ({
        description: i.description,
        quantity: i.qty,
        unit: i.unit,
        unit_price: +i.unit_price.toFixed(2),
        total: +i.total.toFixed(2),
      })),
      squares: +adjustedSq.toFixed(2),
      source: 'roofing-calculator',
    }
    setSendingToEstimate(true)
    sessionStorage.setItem('pg_calc_items', JSON.stringify(payload))
    // Navigate to new estimate — pipeline page with create param
    router.push('/dashboard/estimates?new=1&from=calculator')
  }

  if (!session) return null

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <button onClick={() => router.back()}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 6px' }}>
              <Ic size={14}><polyline points="15 18 9 12 15 6"/></Ic> Back
            </button>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0 }}>🔢 Roofing Calculator</h1>
            <p style={{ fontSize: 14, color: t.textSubtle, marginTop: 2 }}>Material quantities & cost estimate</p>
          </div>
          {fromProMeasure && (
            <div style={{ padding: '6px 14px', borderRadius: 20, background: '#F0FDFA', border: '1.5px solid #14B8A6', color: '#0F766E', fontSize: 12, fontWeight: 700 }}>
              📐 From ProMeasure
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>

          {/* Inputs */}
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 16, marginTop: 0 }}>Inputs</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>ROOF AREA (squares)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min={0} step={0.5} value={squares || ''} onChange={e => setSquares(+e.target.value || 0)}
                    placeholder="0"
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 15, fontWeight: 700 }} />
                  <span style={{ fontSize: 13, color: t.textSubtle }}>sq</span>
                </div>
                <p style={{ fontSize: 12, color: t.textSubtle, margin: '4px 0 0' }}>1 square = 100 sq ft. {squares > 0 && `= ${(squares * 100).toLocaleString()} sq ft`}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>PITCH</label>
                  <select value={pitch} onChange={e => setPitch(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13 }}>
                    {Object.entries(PITCH_FACTORS).map(([p, f]) => <option key={p} value={p}>{p} (×{f})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>WASTE %</label>
                  <select value={waste} onChange={e => setWaste(Number(e.target.value))}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13 }}>
                    {[5,8,10,12,15,20].map(w => <option key={w} value={w}>{w}%</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>RIDGE LF (optional)</label>
                  <input type="number" min={0} value={ridgeLF || ''} onChange={e => setRidgeLF(+e.target.value || 0)} placeholder="auto"
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>EAVE LF (optional)</label>
                  <input type="number" min={0} value={eaveLF || ''} onChange={e => setEaveLF(+e.target.value || 0)} placeholder="auto"
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={tearOff} onChange={e => setTearOff(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#0F766E', cursor: 'pointer' }} />
                <span style={{ fontSize: 14, color: t.textBody, fontWeight: 600 }}>Include tear-off & disposal</span>
              </label>

              {/* Adjusted output */}
              {squares > 0 && (
                <div style={{ background: '#F0FDFA', border: '1.5px solid #14B8A6', borderRadius: 12, padding: '12px 14px' }}>
                  <p style={{ fontSize: 11, color: '#14B8A6', margin: '0 0 2px' }}>Adjusted squares</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: '#0F766E', margin: '0 0 2px' }}>{adjustedSq.toFixed(2)}</p>
                  <p style={{ fontSize: 11, color: '#14B8A6', margin: 0 }}>{squares} × {pitchFactor} pitch × {1 + waste/100} waste</p>
                </div>
              )}
            </div>
          </div>

          {/* Material prices */}
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, margin: 0 }}>Material Prices</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {pricesSaved && <span style={{ fontSize: 12, color: '#0F766E', fontWeight: 700 }}>✓ Saved</span>}
                {editPrices ? (
                  <>
                    <button onClick={() => setEditPrices(false)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textMuted, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={savePrices} disabled={savingPrices} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: 'none', background: '#0F766E', color: 'white', cursor: 'pointer', fontWeight: 700 }}>{savingPrices ? '…' : 'Save'}</button>
                  </>
                ) : (
                  <button onClick={() => setEditPrices(true)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, cursor: 'pointer' }}>Edit prices</button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                ['shingle_cost',       'Shingles (per sq)'],
                ['underlayment_cost',  'Underlayment (per sq)'],
                ['ridge_cap_cost',     'Ridge Cap (per bundle)'],
                ['starter_strip_cost', 'Starter Strip (per bundle)'],
                ['nail_cost',          'Nails (per lb)'],
                ['labor_cost',         'Labor (per sq installed)'],
                ['tear_off_cost',      'Tear-Off (per sq)'],
              ] as [keyof MaterialPrices, string][]).map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: t.textBody }}>{label}</span>
                  {editPrices ? (
                    <input type="number" min={0} step={0.5} value={prices[key]}
                      onChange={e => setPrices(p => ({ ...p, [key]: +e.target.value || 0 }))}
                      style={{ width: 80, padding: '5px 8px', borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13, textAlign: 'right' }} />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>${prices[key].toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
            {!editPrices && (
              <p style={{ fontSize: 11, color: t.textSubtle, marginTop: 12 }}>Prices are saved to your account and pre-fill every new estimate.</p>
            )}
          </div>
        </div>

        {/* Line items output */}
        {squares > 0 && (
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, margin: 0 }}>Material Takeoff</h2>
              <button onClick={pushToEstimate} disabled={sendingToEstimate}
                style={{ padding: '9px 18px', borderRadius: 11, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {sendingToEstimate ? 'Loading…' : <>Push to Estimate <Ic size={13} color="white"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Ic></>}
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${t.cardBorder}` }}>
                    {['Description', 'Qty', 'Unit', 'Unit Price', 'Total'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Description' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${t.divider}`, background: i % 2 === 1 ? t.tableRowAlt : 'transparent' }}>
                      <td style={{ padding: '10px 10px', fontSize: 14, color: t.textBody, fontWeight: 500 }}>{item.description}</td>
                      <td style={{ padding: '10px 10px', fontSize: 14, color: t.textPri, fontWeight: 700, textAlign: 'right' }}>{item.qty.toLocaleString()}</td>
                      <td style={{ padding: '10px 10px', fontSize: 13, color: t.textSubtle, textAlign: 'right' }}>{item.unit}</td>
                      <td style={{ padding: '10px 10px', fontSize: 13, color: t.textSubtle, textAlign: 'right' }}>{fmtCurrency(item.unit_price)}</td>
                      <td style={{ padding: '10px 10px', fontSize: 14, color: t.textPri, fontWeight: 700, textAlign: 'right' }}>{fmtCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Subtotals */}
            <div style={{ borderTop: `2px solid ${t.cardBorder}`, marginTop: 8, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, color: t.textMuted }}>Materials</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.textBody }}>{fmtCurrency(materialTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, color: t.textMuted }}>Labor</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.textBody }}>{fmtCurrency(laborTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${t.cardBorder}`, paddingTop: 8, marginTop: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: t.textPri }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#0F766E' }}>{fmtCurrency(grandTotal)}</span>
              </div>
              <p style={{ fontSize: 11, color: t.textSubtle, margin: '4px 0 0' }}>
                {fmtCurrency(grandTotal / (squares || 1))}/sq · Tax not included
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

export default function CalculatorPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading calculator…</div>}>
      <CalculatorInner />
    </Suspense>
  )
}
