'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'
import { fmtCurrency } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Tier {
  label: string            // Standard / Upgraded / Premium
  shingle_brand: string
  shingle_model: string
  warranty_term: string    // 25 Year / Lifetime
  price_per_sq: number
  includes: string[]       // bullet list shown to homeowner
}

interface GBBData {
  squares: number
  pitch: string
  tiers: [Tier, Tier, Tier]
  lead_id: string | null
  lead_name: string
}

const DEFAULT_TIERS: [Tier, Tier, Tier] = [
  {
    label: 'Good', shingle_brand: 'Owens Corning', shingle_model: 'Duration', warranty_term: '25 Year',
    price_per_sq: 380,
    includes: ['25-year architectural shingles', 'Synthetic underlayment', 'Standard ridge cap', 'Tear-off included'],
  },
  {
    label: 'Better', shingle_brand: 'Owens Corning', shingle_model: 'Duration Flex', warranty_term: '30 Year',
    price_per_sq: 430,
    includes: ['30-year Class 4 impact shingles', 'Premium synthetic underlayment', 'Ventilated ridge cap', 'Drip edge included', 'Tear-off included'],
  },
  {
    label: 'Best', shingle_brand: 'GAF', shingle_model: 'Timberline HDZ', warranty_term: 'Lifetime',
    price_per_sq: 510,
    includes: ['Lifetime Designer shingles', 'Ice & water shield at eaves', 'Ventilated ridge cap', 'New drip edge', 'Starter strip upgrade', 'Tear-off included', 'Post-job walkthrough'],
  },
]

const WARRANTY_OPTS = ['10 Year', '20 Year', '25 Year', '30 Year', 'Lifetime']

function Ic({ children, size = 16, color = 'currentColor' }: { children: React.ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  )
}

// Tier accent colours
const TIER_COLORS = [
  { border: '#9CA3AF', bg: '#F9FAFB', accent: '#4B5563', badge: 'GOOD'    },
  { border: '#0F766E', bg: '#F0FDFA', accent: '#0F766E', badge: 'BETTER ★' },
  { border: '#B45309', bg: '#FFFBEB', accent: '#B45309', badge: 'BEST'    },
]

export default function GBBNewPage() {
  const router = useRouter()
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)

  const [squares, setSquares] = useState(0)
  const [leadId, setLeadId] = useState('')
  const [leadName, setLeadName] = useState('')
  const [leads, setLeads] = useState<{ id: string; contact_name: string }[]>([])
  const [tiers, setTiers] = useState<[Tier, Tier, Tier]>(DEFAULT_TIERS)
  const [editTier, setEditTier] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [templates, setTemplates] = useState<GBBData[]>([])
  const [templateName, setTemplateName] = useState('')

  useEffect(() => { if (!session) router.push('/login') }, [session, router])

  // Load leads for selector + GBB templates
  useEffect(() => {
    if (!session) return
    fetch(`/api/leads?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => setLeads((d.leads || []).filter((l: { lead_status: string }) => !['Paid','Lost','Archived'].includes(l.lead_status))))
    fetch(`/api/roofing/settings?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => { if (d.gbb_templates) setTemplates(d.gbb_templates) })
  }, [session])

  // Calculator-prefill from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('pg_calc_items')
    if (raw) {
      const data = JSON.parse(raw)
      if (data.squares) setSquares(+data.squares.toFixed(1))
    }
  }, [])

  function updateTier(idx: number, field: keyof Tier, value: string | number | string[]) {
    setTiers(prev => {
      const next = [...prev] as [Tier, Tier, Tier]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function tierTotal(tier: Tier) {
    return squares > 0 ? tier.price_per_sq * squares : 0
  }

  async function saveTemplate() {
    if (!session || !templateName.trim()) return
    const newTemplates = [...templates, { squares, pitch: '4/12', tiers, lead_id: null, lead_name: templateName }]
    await fetch('/api/roofing/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, gbb_templates: newTemplates }),
    })
    setTemplates(newTemplates)
    setTemplateName('')
    alert('Template saved!')
  }

  async function handleCreate() {
    if (!session) return
    setSaving(true); setSaveErr(null)
    try {
      // Create estimate via API
      const r = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id: session.id,
          lead_id: leadId || null,
          lead_name: leadName || (leadId ? leads.find(l => l.id === leadId)?.contact_name : '') || 'Client',
          trade: session.trade || 'Roofing',
          state: session.state || 'FL',
          force_new: true,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setSaveErr(d.error || 'Failed to create estimate'); return }

      const estId = d.estimate.id

      // PATCH with estimate_type and tiered_data
      await fetch(`/api/estimates/${estId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id: session.id,
          estimate_type: 'tiered',
          tiered_data: { squares, tiers },
          // Set total to the middle tier for pipeline value tracking
          subtotal: tierTotal(tiers[1]),
          total: tierTotal(tiers[1]),
        }),
      })

      router.push(`/dashboard/estimates/tiered/${estId}`)
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  if (!session) return null

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

        {/* Header */}
        <button onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px' }}>
          <Ic size={14}><polyline points="15 18 9 12 15 6"/></Ic> Back
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0 }}>Good / Better / Best Estimate</h1>
            <p style={{ fontSize: 14, color: t.textSubtle, marginTop: 2 }}>Three-tier proposal — homeowner taps to select</p>
          </div>
          <button onClick={handleCreate} disabled={saving || !leadName.trim()}
            style={{ padding: '11px 22px', borderRadius: 12, border: 'none', background: (saving || !leadName.trim()) ? '#9CA3AF' : '#0F766E', color: 'white', fontSize: 14, fontWeight: 700, cursor: (saving || !leadName.trim()) ? 'default' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {saving ? 'Creating…' : 'Create & Send →'}
          </button>
        </div>

        {saveErr && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13, marginBottom: 16 }}>{saveErr}</div>
        )}

        {/* Lead + squares */}
        <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, margin: '0 0 16px' }}>Job Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>LINK TO LEAD (optional)</label>
              <select value={leadId} onChange={e => { setLeadId(e.target.value); if (e.target.value) { const l = leads.find(x => x.id === e.target.value); if (l) setLeadName(l.contact_name) } }}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13 }}>
                <option value="">— no lead —</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.contact_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>CLIENT NAME *</label>
              <input value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Jane Smith"
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>SQUARES</label>
              <input type="number" min={0} step={0.5} value={squares || ''} onChange={e => setSquares(+e.target.value || 0)} placeholder="0"
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
        </div>

        {/* Three tier columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
          {tiers.map((tier, idx) => {
            const col = TIER_COLORS[idx]
            const total = tierTotal(tier)
            const isEditing = editTier === idx

            return (
              <div key={idx} style={{ background: col.bg, border: `2px solid ${col.border}`, borderRadius: 18, padding: 18, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: col.border, color: 'white', letterSpacing: '0.05em' }}>
                    {col.badge}
                  </span>
                  <button onClick={() => setEditTier(isEditing ? null : idx)}
                    style={{ fontSize: 12, color: col.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                </div>

                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {([
                      ['label', 'Tier Label', 'text'],
                      ['shingle_brand', 'Brand', 'text'],
                      ['shingle_model', 'Model', 'text'],
                    ] as [keyof Tier, string, string][]).map(([field, label]) => (
                      <div key={field}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 3 }}>{label}</label>
                        <input value={tier[field] as string} onChange={e => updateTier(idx, field, e.target.value)}
                          style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid #D1D5DB`, background: 'white', fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 3 }}>WARRANTY</label>
                      <select value={tier.warranty_term} onChange={e => updateTier(idx, 'warranty_term', e.target.value)}
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid #D1D5DB`, background: 'white', fontSize: 13 }}>
                        {WARRANTY_OPTS.map(w => <option key={w}>{w}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 3 }}>PRICE PER SQ ($)</label>
                      <input type="number" min={0} value={tier.price_per_sq} onChange={e => updateTier(idx, 'price_per_sq', +e.target.value || 0)}
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid #D1D5DB`, background: 'white', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 3 }}>INCLUDES (one per line)</label>
                      <textarea value={tier.includes.join('\n')} onChange={e => updateTier(idx, 'includes', e.target.value.split('\n').filter(Boolean))}
                        rows={5} style={{ width: '100%', padding: '7px 9px', borderRadius: 8, border: `1px solid #D1D5DB`, background: 'white', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '0 0 1px' }}>{tier.shingle_brand}</p>
                      <p style={{ fontSize: 14, color: '#374151', margin: '0 0 4px' }}>{tier.shingle_model}</p>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: col.border + '22', color: col.accent }}>
                        {tier.warranty_term} warranty
                      </span>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', margin: '0 0 6px' }}>INCLUDES</p>
                      {tier.includes.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                          <Ic size={13} color={col.accent}><polyline points="20 6 9 17 4 12"/></Ic>
                          <span style={{ fontSize: 13, color: '#374151' }}>{item}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: `1px solid ${col.border}55`, paddingTop: 12, marginTop: 'auto' }}>
                      <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 2px' }}>${tier.price_per_sq}/sq{squares > 0 ? ` · ${squares} sq` : ''}</p>
                      <p style={{ fontSize: 24, fontWeight: 900, color: col.accent, margin: 0 }}>
                        {total > 0 ? fmtCurrency(total) : '—'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Summary */}
        {squares > 0 && (
          <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 11, color: t.textSubtle, margin: '0 0 2px' }}>Good</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#4B5563', margin: 0 }}>{fmtCurrency(tierTotal(tiers[0]))}</p>
            </div>
            <div style={{ fontSize: 18, color: t.textSubtle }}>→</div>
            <div>
              <p style={{ fontSize: 11, color: t.textSubtle, margin: '0 0 2px' }}>Better ★</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#0F766E', margin: 0 }}>{fmtCurrency(tierTotal(tiers[1]))}</p>
            </div>
            <div style={{ fontSize: 18, color: t.textSubtle }}>→</div>
            <div>
              <p style={{ fontSize: 11, color: t.textSubtle, margin: '0 0 2px' }}>Best</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#B45309', margin: 0 }}>{fmtCurrency(tierTotal(tiers[2]))}</p>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 13, color: t.textSubtle }}>
              Most homeowners choose <strong style={{ color: '#0F766E' }}>Better</strong> — avg ticket +35%
            </div>
          </div>
        )}

        {/* Save as template */}
        <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: t.textMuted, flexShrink: 0 }}>Save as template:</span>
          <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. 3-tab vs architectural"
            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 13 }} />
          <button onClick={saveTemplate} disabled={!templateName.trim()}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: templateName.trim() ? '#0F766E' : '#9CA3AF', color: 'white', fontSize: 13, fontWeight: 700, cursor: templateName.trim() ? 'pointer' : 'default' }}>
            Save
          </button>
        </div>
      </div>
    </DashboardShell>
  )
}
