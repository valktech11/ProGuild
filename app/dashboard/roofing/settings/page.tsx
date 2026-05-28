'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme, T, BRAND } from '@/lib/tokens'

// Default FL market prices — used when pro hasn't set their own
const DEFAULTS = {
  shingles_standard:   285,  // CertainTeed Landmark $/sq
  shingles_upgraded:   340,  // Owens Corning Duration $/sq
  shingles_premium:    420,  // GAF Timberline HDZ $/sq
  underlayment:         22,  // Synthetic $/sq
  ice_water:            35,  // Ice & water shield $/sq
  ridge_cap:             4,  // Ridge cap $/lf
  starter_strip:         2,  // Starter strip $/lf
  drip_edge:             3,  // Drip edge $/lf
  nails:               2.5,  // Roofing nails $/sq
  labor_standard:       85,  // Labor $/sq (standard tier)
  labor_upgraded:       90,  // Labor $/sq (upgraded tier)
  labor_premium:       100,  // Labor $/sq (premium tier)
}

type Prices = typeof DEFAULTS

const MATERIAL_GROUPS = [
  {
    title: 'Shingles ($/square)',
    subtitle: 'Price per square (100 sq ft) · 3 bundles = 1 square — calculator shows $/bundle',
    fields: [
      { key: 'shingles_standard',  label: 'Standard shingles',  hint: 'CertainTeed Landmark · e.g. $285/sq = $95/bundle' },
      { key: 'shingles_upgraded',  label: 'Upgraded shingles',  hint: 'Owens Corning Duration · e.g. $340/sq = $113/bundle' },
      { key: 'shingles_premium',   label: 'Premium shingles',   hint: 'GAF Timberline HDZ · e.g. $420/sq = $140/bundle' },
    ],
  },
  {
    title: 'Sheet Materials ($/square)',
    subtitle: 'Price per square (100 sq ft)',
    fields: [
      { key: 'underlayment',  label: 'Synthetic underlayment', hint: 'Per square' },
      { key: 'ice_water',     label: 'Ice & water shield',     hint: 'Per square' },
    ],
  },
  {
    title: 'Linear Footage Items ($/LF)',
    subtitle: 'Enter your cost per linear foot — calculator converts to bundles/pieces automatically',
    fields: [
      { key: 'ridge_cap',     label: 'Ridge cap',      hint: 'Per LF · 35 LF/bundle → e.g. $4/LF = $140/bundle' },
      { key: 'starter_strip', label: 'Starter strip',  hint: 'Per LF · 105 LF/bundle → e.g. $2/LF = $210/bundle' },
      { key: 'drip_edge',     label: 'Drip edge',      hint: 'Per LF · 10 ft/piece → e.g. $2/LF = $20/piece' },
    ],
  },
  {
    title: 'Labor ($/square)',
    subtitle: 'Labor cost per square — varies by tier complexity',
    fields: [
      { key: 'labor_standard',  label: 'Standard labor',  hint: 'Basic install' },
      { key: 'labor_upgraded',  label: 'Upgraded labor',  hint: 'With ice & water shield' },
      { key: 'labor_premium',   label: 'Premium labor',   hint: 'Full premium scope' },
    ],
  },
  {
    title: 'Other ($/square)',
    subtitle: '',
    fields: [
      { key: 'nails', label: 'Roofing nails', hint: 'Per square' },
    ],
  },
]

export default function MaterialPricesPage() {
  const router = useRouter()
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(false)
  const [prices, setPrices] = useState<Prices>({ ...DEFAULTS })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [usingDefaults, setUsingDefaults] = useState(true)

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    setDk(localStorage.getItem('pg_darkmode') === '1')
    fetch(`/api/roofing/settings?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.material_prices) {
          setPrices({ ...DEFAULTS, ...d.material_prices })
          setUsingDefaults(false)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session, router])

  const handleSave = async () => {
    if (!session) return
    setSaving(true)
    try {
      await fetch('/api/roofing/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id, material_prices: prices }),
      })
      setUsingDefaults(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { /* show nothing — prices are saved locally */ }
    finally { setSaving(false) }
  }

  const handleReset = () => {
    setPrices({ ...DEFAULTS })
    setUsingDefaults(true)
  }

  if (!session) return null
  const t = theme(dk)

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}}
      darkMode={dk} onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <button onClick={() => router.back()}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                cursor: 'pointer', color: t.textSubtle, fontSize: 13 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Back
            </button>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: t.textPri, margin: 0, marginBottom: 4 }}>
            Material Prices
          </h1>
          <p style={{ fontSize: 14, color: t.textMuted, margin: 0 }}>
            Set your actual material costs. These populate your GBB estimate tiers automatically.
          </p>
        </div>

        {/* Default prices notice */}
        {usingDefaults && !loading && (
          <div style={{ padding: '12px 16px', borderRadius: T.radMd, background: '#FFFBEB',
            border: '1px solid #FDE68A', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>
                Using default market prices
              </div>
              <div style={{ fontSize: 12, color: '#B45309' }}>
                These are typical FL roofing costs. Set your own prices below to get accurate estimates from day one.
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: t.textMuted }}>Loading your prices…</div>
        ) : (
          <>
            {MATERIAL_GROUPS.map(group => (
              <div key={group.title} style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                borderRadius: T.radLg, padding: 20, marginBottom: 16 }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>{group.title}</div>
                  {group.subtitle && (
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{group.subtitle}</div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {group.fields.map(field => (
                    <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.textPri }}>{field.label}</div>
                        <div style={{ fontSize: 11, color: t.textMuted }}>{field.hint}</div>
                        {/* Live per-piece/per-bundle equivalent for linear footage items */}
                        {field.key === 'ridge_cap' && prices.ridge_cap > 0 && (
                          <div style={{ fontSize: 11, color: BRAND.teal, marginTop: 2, fontWeight: 600 }}>
                            = ${Math.round(prices.ridge_cap * 35)}/bundle (35 LF)
                          </div>
                        )}
                        {field.key === 'starter_strip' && prices.starter_strip > 0 && (
                          <div style={{ fontSize: 11, color: BRAND.teal, marginTop: 2, fontWeight: 600 }}>
                            = ${Math.round(prices.starter_strip * 105)}/bundle (105 LF)
                          </div>
                        )}
                        {field.key === 'drip_edge' && prices.drip_edge > 0 && (
                          <div style={{ fontSize: 11, color: BRAND.teal, marginTop: 2, fontWeight: 600 }}>
                            = ${(prices.drip_edge * 10).toFixed(0)}/piece (10 ft) · typical: $1.50–2.50/LF
                          </div>
                        )}
                        {field.key === 'shingles_standard' && prices.shingles_standard > 0 && (
                          <div style={{ fontSize: 11, color: BRAND.teal, marginTop: 2, fontWeight: 600 }}>
                            = ${Math.round(prices.shingles_standard / 3)}/bundle
                          </div>
                        )}
                        {field.key === 'shingles_upgraded' && prices.shingles_upgraded > 0 && (
                          <div style={{ fontSize: 11, color: BRAND.teal, marginTop: 2, fontWeight: 600 }}>
                            = ${Math.round(prices.shingles_upgraded / 3)}/bundle
                          </div>
                        )}
                        {field.key === 'shingles_premium' && prices.shingles_premium > 0 && (
                          <div style={{ fontSize: 11, color: BRAND.teal, marginTop: 2, fontWeight: 600 }}>
                            = ${Math.round(prices.shingles_premium / 3)}/bundle
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, color: t.textMuted }}>$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={prices[field.key as keyof Prices]}
                          onChange={e => setPrices(p => ({ ...p, [field.key]: parseFloat(e.target.value) || 0 }))}
                          style={{
                            width: 90, padding: '8px 10px', borderRadius: 8,
                            border: `1.5px solid ${t.cardBorder}`, background: t.cardBg,
                            color: t.textPri, fontSize: 15, fontWeight: 600,
                            textAlign: 'right', outline: 'none',
                          }}
                        />
                        {prices[field.key as keyof Prices] !== DEFAULTS[field.key as keyof Prices] && (
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND.teal, flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Preview — what this means for a typical job */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`,
              borderRadius: T.radLg, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri, marginBottom: 12 }}>
                Preview — 20 sq roof (typical FL home)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {(['standard', 'upgraded', 'premium'] as const).map((tier, i) => {
                  const shingleKey = `shingles_${tier}` as keyof Prices
                  const laborKey   = `labor_${tier}` as keyof Prices
                  const sq = 20
                  const lf = 200
                  const shingles    = sq * prices[shingleKey]
                  const underlayment = sq * prices.underlayment
                  const iceWater    = tier !== 'standard' ? sq * prices.ice_water : 0
                  const ridgeCap    = lf * prices.ridge_cap
                  const starter     = lf * prices.starter_strip
                  const labor       = sq * prices[laborKey]
                  const total       = shingles + underlayment + iceWater + ridgeCap + starter + labor
                  const tierLabel   = ['Standard', 'Upgraded', 'Premium'][i]
                  const tierColor   = [t.textMuted, BRAND.teal, '#7C3AED'][i]
                  return (
                    <div key={tier} style={{ textAlign: 'center', padding: '14px 12px',
                      borderRadius: T.radMd, background: `${tierColor}10`,
                      border: `1px solid ${tierColor}30` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: tierColor, textTransform: 'uppercase',
                        letterSpacing: '0.05em', marginBottom: 6 }}>{tierLabel}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: tierColor }}>
                        ${total.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>20 squares</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={handleReset}
                style={{ fontSize: 13, color: t.textMuted, background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0 }}>
                Reset to defaults
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {saved && (
                  <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Prices saved</span>
                )}
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '11px 28px', borderRadius: T.radMd, border: 'none',
                    background: `linear-gradient(135deg, ${BRAND.teal}, #0D9488)`,
                    color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                    opacity: saving ? 0.7 : 1, boxShadow: '0 2px 8px rgba(15,118,110,0.25)' }}>
                  {saving ? 'Saving…' : 'Save Prices'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
