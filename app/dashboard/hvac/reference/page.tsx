'use client'
// Field Reference — P-T charts, fault codes, manual lookup.
// Mirrors mobile lib/features/hvac/reference/hvac_reference_screen.dart.
// All data is static (lib/hvac/referenceData.ts) — no API calls.

import { useState, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/theme'
import {
  REFRIGERANTS, CHARGE_TARGETS, FAULT_CODES, psiForTemp, tempForPsi,
} from '@/lib/hvac/referenceData'

type Tab = 'pt' | 'codes' | 'manuals'

function ReferenceInner() {
  const params = useSearchParams()
  const { session } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n)
  }
  const t = theme(dk)

  // Prefill from an equipment record link: ?brand=Goodman&model=GSX16&tab=manuals
  const qBrand = params.get('brand') ?? ''
  const qModel = params.get('model') ?? ''
  const qTab   = (params.get('tab') as Tab) || 'pt'

  const [tab, setTab] = useState<Tab>(qTab)

  // P-T state
  const [refrigIdx, setRefrigIdx] = useState(0)
  const [tempIn, setTempIn] = useState('')
  const [psiIn,  setPsiIn]  = useState('')
  const r = REFRIGERANTS[refrigIdx]

  const lookup = useMemo(() => {
    if (tempIn.trim()) {
      const v = parseFloat(tempIn)
      if (isNaN(v)) return null
      const p = psiForTemp(r, v)
      const keys = Object.keys(r.pt).map(Number).sort((a, b) => a - b)
      return p === null
        ? `Outside the table range (${keys[0]}–${keys[keys.length - 1]} °F)`
        : `${v.toFixed(0)} °F  →  ${p.toFixed(1)} psig`
    }
    if (psiIn.trim()) {
      const v = parseFloat(psiIn)
      if (isNaN(v)) return null
      const tv = tempForPsi(r, v)
      return tv === null ? 'Outside the table range' : `${v.toFixed(1)} psig  →  ${tv.toFixed(1)} °F sat`
    }
    return null
  }, [tempIn, psiIn, r])

  // Fault state — preselect the brand if we arrived from an equipment record
  const [brandIdx, setBrandIdx] = useState(() => {
    if (!qBrand) return 0
    const b = qBrand.toLowerCase()
    const i = FAULT_CODES.findIndex(f =>
      f.brand.toLowerCase().includes(b) || f.alsoKnownAs.toLowerCase().includes(b))
    return i >= 0 ? i : 0
  })
  const [codeQuery, setCodeQuery] = useState('')
  const bf = FAULT_CODES[brandIdx]
  const codes = codeQuery.trim()
    ? bf.codes.filter(c =>
        c.code.toLowerCase().includes(codeQuery.toLowerCase()) ||
        c.meaning.toLowerCase().includes(codeQuery.toLowerCase()))
    : bf.codes

  // Manual state
  const [mBrand, setMBrand] = useState(qBrand)
  const [mModel, setMModel] = useState(qModel)
  const openManual = () => {
    if (!mBrand.trim() && !mModel.trim()) return
    const q = encodeURIComponent(`${mBrand} ${mModel} service manual filetype:pdf`)
    window.open(`https://www.google.com/search?q=${q}`, '_blank', 'noopener')
  }

  const card: React.CSSProperties = {
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16,
  }
  const label: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', color: t.textMuted,
  }
  const input: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 10,
    border: `1px solid ${t.border}`, background: t.pageBg, color: t.textPri, outline: 'none',
  }
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '8px 14px', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer',
    background: on ? '#0F766E' : t.cardBg, color: on ? '#fff' : t.textPri,
    border: `1px solid ${on ? '#0F766E' : t.border}`,
  })
  const tabBtn = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 700, borderRadius: 9, cursor: 'pointer',
    background: on ? '#0F766E' : 'transparent', color: on ? '#fff' : t.textMuted, border: 'none',
  })

  const temps = Object.keys(r.pt).map(Number).sort((a, b) => a - b)

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 40px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0 }}>Field Reference</h1>
            <p style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
              Pressure charts, fault codes and manual lookup
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: 4, marginBottom: 18,
            background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12 }}>
            <button style={tabBtn(tab === 'pt')}      onClick={() => setTab('pt')}>P–T Chart</button>
            <button style={tabBtn(tab === 'codes')}   onClick={() => setTab('codes')}>Fault Codes</button>
            <button style={tabBtn(tab === 'manuals')} onClick={() => setTab('manuals')}>Manuals</button>
          </div>

          {/* ── P-T ─────────────────────────────────────────────────────── */}
          {tab === 'pt' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REFRIGERANTS.map((x, i) => (
                  <button key={x.key} style={chip(i === refrigIdx)}
                    onClick={() => { setRefrigIdx(i); setTempIn(''); setPsiIn('') }}>
                    {x.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: -10 }}>{r.note}</div>

              <div style={card}>
                <div style={label}>QUICK LOOKUP</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <input style={input} placeholder="Temp °F" value={tempIn} inputMode="decimal"
                    onChange={e => { setTempIn(e.target.value); setPsiIn('') }} />
                  <span style={{ fontSize: 12, color: t.textMuted }}>or</span>
                  <input style={input} placeholder="Pressure psig" value={psiIn} inputMode="decimal"
                    onChange={e => { setPsiIn(e.target.value); setTempIn('') }} />
                </div>
                {lookup && (
                  <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.35)',
                    fontSize: 15, fontWeight: 800, color: '#0F766E' }}>
                    {lookup}
                  </div>
                )}
              </div>

              <div>
                <div style={{ ...label, marginBottom: 8 }}>CHARGE TARGETS</div>
                <div style={card}>
                  {CHARGE_TARGETS.map((c, i) => (
                    <div key={c.system} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
                      paddingTop: i === 0 ? 0 : 14, marginTop: i === 0 ? 0 : 14,
                      borderTop: i === 0 ? 'none' : `1px solid ${t.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: t.textPri }}>{c.system}</div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{c.detail}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0F766E', whiteSpace: 'nowrap' }}>{c.target}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ ...label, marginBottom: 8 }}>{r.label} SATURATION TABLE</div>
                <div style={card}>
                  <div style={{ display: 'flex', paddingBottom: 10, borderBottom: `1px solid ${t.border}` }}>
                    <div style={{ flex: 1, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: t.textMuted }}>TEMP °F</div>
                    <div style={{ flex: 1, textAlign: 'right', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: t.textMuted }}>PSIG</div>
                  </div>
                  {temps.map((tp, i) => (
                    <div key={tp} style={{ display: 'flex', padding: '9px 0',
                      borderTop: i === 0 ? 'none' : `1px solid ${t.border}55` }}>
                      <div style={{ flex: 1, fontSize: 13.5, color: t.textPri }}>{tp}</div>
                      <div style={{ flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: t.textPri }}>
                        {r.pt[tp].toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, fontStyle: 'italic', color: t.textMuted, marginTop: 12 }}>
                  Reference values — confirm against your gauge manufacturer&rsquo;s chart before making a charging decision.
                </div>
              </div>
            </div>
          )}

          {/* ── Fault codes ─────────────────────────────────────────────── */}
          {tab === 'codes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {FAULT_CODES.map((f, i) => (
                  <button key={f.brand} style={chip(i === brandIdx)} onClick={() => setBrandIdx(i)}>
                    {f.brand}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: -6 }}>
                Also: {bf.alsoKnownAs} &middot; {bf.indicator}
              </div>
              <input style={input} placeholder="Search code or symptom…"
                value={codeQuery} onChange={e => setCodeQuery(e.target.value)} />
              {codes.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, fontSize: 14, color: t.textMuted }}>
                  No codes match &ldquo;{codeQuery}&rdquo;
                </div>
              )}
              {codes.map(c => (
                <div key={c.code} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ padding: '4px 9px', borderRadius: 6, fontSize: 12.5, fontWeight: 800,
                      background: 'rgba(15,118,110,0.10)', color: '#0F766E', whiteSpace: 'nowrap' }}>
                      {c.code}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>{c.meaning}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 7 }}>{c.action}</div>
                </div>
              ))}
              <div style={{ fontSize: 11.5, fontStyle: 'italic', color: t.textMuted }}>
                Common codes only. Always confirm against the unit&rsquo;s service manual — code meanings vary by model and year.
              </div>
            </div>
          )}

          {/* ── Manuals ─────────────────────────────────────────────────── */}
          {tab === 'manuals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={card}>
                <div style={label}>FIND A SERVICE MANUAL</div>
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4 }}>
                  Opens a web search for the manufacturer PDF.
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.textPri, marginBottom: 5 }}>Brand</div>
                  <input style={input} placeholder="e.g. Goodman, Carrier"
                    value={mBrand} onChange={e => setMBrand(e.target.value)} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.textPri, marginBottom: 5 }}>Model number</div>
                  <input style={input} placeholder="e.g. GSX160361F"
                    value={mModel} onChange={e => setMModel(e.target.value)} />
                </div>
                <button onClick={openManual}
                  disabled={!mBrand.trim() && !mModel.trim()}
                  style={{ width: '100%', marginTop: 16, padding: '13px 0', fontSize: 14.5, fontWeight: 700,
                    borderRadius: 12, border: 'none', cursor: (mBrand.trim() || mModel.trim()) ? 'pointer' : 'not-allowed',
                    background: (mBrand.trim() || mModel.trim()) ? '#0F766E' : t.border,
                    color: (mBrand.trim() || mModel.trim()) ? '#fff' : t.textMuted }}>
                  Search for manual
                </button>
              </div>
              <div>
                <div style={{ ...label, marginBottom: 8 }}>TIP</div>
                <div style={{ ...card, fontSize: 13, lineHeight: 1.45, color: t.textMuted }}>
                  The model number is on the data plate — usually the outdoor unit side panel or inside
                  the furnace door. Photograph it into the equipment record and this form fills itself next time.
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </DashboardShell>
  )
}

export default function HvacReferencePage() {
  return (
    <Suspense fallback={null}>
      <ReferenceInner />
    </Suspense>
  )
}
