'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'
import { stageStyle } from '@/lib/design'
import { capName, fmtCurrency, timeAgo } from '@/lib/utils'
import { getPipelineStages } from '@/components/ui/LeadPipeline'

const ROOF_TYPES   = ['Shingle', 'Metal', 'Tile', 'Flat/TPO', 'Modified Bitumen', 'EPDM', 'Built-Up', 'Other']
const ROOF_MATS    = ['3-Tab Asphalt', 'Architectural/Dimensional', 'Designer/Premium', 'Metal Standing Seam', 'Metal Corrugated', 'Clay Tile', 'Concrete Tile', 'Slate', 'TPO Membrane', 'EPDM Rubber', 'Other']
const STORIES_OPTS = [1, 2, 3, 4]

interface Property {
  id: string; pro_id: string; address_line1: string; address_line2: string | null
  city: string | null; state: string | null; zip_code: string | null
  roof_type: string | null; roof_age_years: number | null; roof_material: string | null
  sq_footage: number | null; stories: number | null
  insurance_carrier: string | null; insurance_policy_number: string | null
  notes: string | null; created_at: string; updated_at: string
}

interface LinkedLead {
  id: string; contact_name: string; lead_status: string
  quoted_amount: number | null; created_at: string; scheduled_date: string | null
}

interface LinearFootage {
  ridge_ft: number
  hip_ft: number
  valley_ft: number
  rake_ft: number
  eave_ft: number
  total_linear_ft: number
  accuracy_note: string
  facet_count: number
}

interface RoofReport {
  id: string
  created_at: string
  total_squares_raw: number
  total_squares_order: number
  dominant_pitch: string
  facet_count: number
  waste_factor: number
  imagery_date: string
  r2_url: string
  linear_footage?: LinearFootage | null
  premium_r2_url?: string | null
}

function Ic({ children, size = 16, color = 'currentColor' }: { children: React.ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  )
}

export default function PropertyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
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

  const [property, setProperty] = useState<Property | null>(null)
  const [leads, setLeads] = useState<LinkedLead[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // Report generation
  const [generating, setGenerating] = useState(false)
  const [lastReport, setLastReport] = useState(0) // timestamp of last generate click
  const [reportErr, setReportErr] = useState<string | null>(null)
  const [reports, setReports] = useState<RoofReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)
  const [dsmLoadingId, setDsmLoadingId] = useState<string | null>(null)
  const [premiumLoadingId, setPremiumLoadingId] = useState<string | null>(null)

  // Edit form state
  const [form, setForm] = useState<Partial<Property>>({})

  useEffect(() => { if (!session) router.push('/login') }, [session, router])

  useEffect(() => {
    if (!session) return
    fetch(`/api/properties/${id}?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.property) { setProperty(d.property); setForm(d.property) }
        setLeads(d.leads || [])
      })
      .catch(() => { setLoading(false) })
      .finally(() => setLoading(false))
  }, [id, session])

  useEffect(() => {
    if (!session) return
    setReportsLoading(true)
    fetch(`/api/roofing/reports?pro_id=${session.id}&property_id=${id}`)
      .then(r => r.json())
      .then(d => setReports(d.reports || []))
      .catch(() => setReportErr('Failed to load reports — please refresh'))
      .finally(() => setReportsLoading(false))
  }, [id, session])

  async function generateReport() {
    if (!session || !property) return
    setGenerating(true)
    setReportErr(null)
    const now = Date.now()
    if (now - lastReport < 30000) { setGenerating(false); return } // 30-second debounce
    setLastReport(now)
    const fullAddress = [
      property.address_line1,
      property.city,
      property.state,
      property.zip_code,
    ].filter(Boolean).join(', ')

    try {
      const r = await fetch('/api/roofing/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: fullAddress, pro_id: session.id, property_id: id }),
      })
      const d = await r.json()
      if (!r.ok) { setReportErr(d.error || 'Report generation failed'); return }

      // Auto-run DSM linear footage computation on the new report row.
      // Runs in background — does not block the UI or show an error if it fails
      // (roofer can still use the Quick Bid report; Material Order will recompute on demand).
      if (d.reportRowId) {
        fetch('/api/roofing/dsm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_id: d.reportRowId, pro_id: session.id }),
        }).catch(e => console.warn('[ui] background DSM failed:', e))
      }

      // Refresh report list (PDF available via Download button in row)
      const refreshed = await fetch(`/api/roofing/reports?pro_id=${session.id}&property_id=${id}`)
      const rd = await refreshed.json()
      setReports(rd.reports || [])
      // Auto-push measurements to Calculator via sessionStorage
      if (d.measurements) {
        sessionStorage.setItem('pg_roof_measurements', JSON.stringify({
          squares: d.measurements.totalSquaresOrder,
          pitch: d.measurements.dominantPitch,
          source: 'roof_report',
          address: fullAddress,
        }))
      }
    } catch {
      setReportErr('Network error — please retry')
    } finally {
      setGenerating(false)
    }
  }

  async function deleteReport(reportId: string) {
    if (!session) return
    if (!confirm('Delete this report? This cannot be undone.')) return
    setDeletingReportId(reportId)
    try {
      await fetch(`/api/roofing/reports?id=${reportId}&pro_id=${session.id}`, { method: 'DELETE' })
      setReports(prev => prev.filter(r => r.id !== reportId))
    } catch { /* silently ignore -- row already gone */ }
    finally { setDeletingReportId(null) }
  }


  // Staging: always show premium. Prod: check plan when Stripe is live.
  // Staging gate: NEXT_PUBLIC_VERCEL_ENV is auto-set by Vercel ('production'|'preview'|'development')
  // In production: replace with Stripe plan check (session.plan === 'pro' || 'elite')
  const canAccessPremium = process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'

  // Step 1: Run DSM analysis → stores linear_footage on report row
  async function getLinearFootageAndPDF(report: RoofReport) {
    if (!canAccessPremium || !session) return
    setDsmLoadingId(report.id)
    setReportErr(null)
    try {
      // Step 1: Compute linear footage from Solar API segment geometry (fast, no GeoTIFF)
      console.log('[ui] calling segment analysis for report:', report.id)
      const dsmRes = await fetch('/api/roofing/dsm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: report.id, pro_id: session.id }),
      })
      const dsmData = await dsmRes.json()
      console.log('[ui] DSM response:', JSON.stringify(dsmData).slice(0, 200))

      if (!dsmRes.ok || !dsmData.linear_footage) {
        setReportErr('Could not compute linear footage: ' + (dsmData.error || dsmData.detail || 'Unknown error'))
        return
      }

      // Update the row immediately with DSM results
      setReports(prev => prev.map(r =>
        r.id === report.id ? { ...r, linear_footage: dsmData.linear_footage } : r
      ))

      // Step 2: Generate Premium PDF (fast — reads existing data + renders)
      setPremiumLoadingId(report.id)
      console.log('[ui] calling premium-pdf for report:', report.id)
      const pdfRes = await fetch('/api/roofing/premium-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: report.id, pro_id: session.id }),
      })
      const pdfData = await pdfRes.json()
      console.log('[ui] PDF response:', JSON.stringify(pdfData).slice(0, 200))

      if (!pdfRes.ok) {
        setReportErr('PDF generation failed: ' + (pdfData.error || '') + (pdfData.detail ? ' — ' + pdfData.detail : ''))
        return
      }

      if (pdfData.url) window.open(pdfData.url, '_blank')

      // Refresh list to show Linear Footage PDF download button
      const refreshed = await fetch(`/api/roofing/reports?pro_id=${session?.id}&property_id=${id}`)
      const rd = await refreshed.json()
      setReports(rd.reports || [])

    } catch (e) {
      setReportErr('Network error: ' + String(e).slice(0, 100))
      console.error('[ui] getLinearFootageAndPDF error:', e)
    } finally {
      setDsmLoadingId(null)
      setPremiumLoadingId(null)
    }
  }


  async function handleSave() {
    if (!session || !property) return
    setSaving(true); setSaveErr(null)
    const r = await fetch(`/api/properties/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session.id, ...form }),
    })
    const d = await r.json()
    if (!r.ok) { setSaveErr(d.error || 'Save failed'); setSaving(false); return }
    setProperty(d.property)
    setForm(d.property)
    setEditing(false)
    setSaving(false)
  }

  function field(key: keyof Property, label: string, type: 'text' | 'number' | 'select' = 'text', opts?: string[]) {
    const val = form[key] as string | number | null ?? ''
    const display = property?.[key]
    if (!editing) {
      return (
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 3 }}>{label}</p>
          <p style={{ fontSize: 15, fontWeight: 600, color: display ? t.textPri : t.textSubtle }}>
            {display || '--'}
          </p>
        </div>
      )
    }
    if (type === 'select' && opts) {
      return (
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, display: 'block', marginBottom: 4 }}>{label}</label>
          <select value={val} onChange={e => setForm(f => ({ ...f, [key]: e.target.value || null }))}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14 }}>
            <option value="">-- select --</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )
    }
    return (
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, display: 'block', marginBottom: 4 }}>{label}</label>
        <input type={type} value={val} onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? (Number(e.target.value) || null) : (e.target.value || null) }))}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14 }} />
      </div>
    )
  }

  if (!session) return null

  const stages = getPipelineStages('roofing-contractor')
  const latestReport = reports[0] ?? null

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 14px' }}>

        <button onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: t.textMuted, marginBottom: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Ic><polyline points="15 18 9 12 15 6" /></Ic> Back
        </button>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: t.textSubtle }}>Loading property...</div>
        ) : !property ? (
          <div style={{ textAlign: 'center', padding: 80, color: t.textSubtle }}>Property not found</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F0FDFA', border: '1.5px solid #99F6E4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ fontSize: 17, fontWeight: 800, color: t.textPri, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {property.address_line1}
                  </h1>
                  <p style={{ fontSize: 12, color: t.textMuted, margin: 0 }}>
                    {[property.city, property.state, property.zip_code].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditing(e => !e)}
                style={{ padding: '7px 14px', borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: editing ? '#0F766E' : t.cardBg, color: editing ? 'white' : t.textMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {editing ? 'Done' : 'Edit'}
              </button>
            </div>

            {/* Stats strip */}
            {latestReport && (
              <div style={{ display: 'flex', background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
                {([
                  { label: 'Sq', value: latestReport.total_squares_order.toFixed(1), color: '#0F766E' },
                  { label: 'Pitch', value: latestReport.dominant_pitch, color: '#2563EB' },
                  { label: 'Facets', value: String(latestReport.facet_count), color: '#7C3AED' },
                  { label: 'Waste', value: latestReport.waste_factor + '%', color: '#D97706' },
                ] as { label: string; value: string; color: string }[]).map((s, i) => (
                  <div key={s.label} style={{ flex: 1, padding: '10px 0', textAlign: 'center', borderRight: i < 3 ? `1px solid ${t.cardBorder}` : 'none' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: t.textSubtle, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginTop: 1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Action row */}
            <style>{`
              .action-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }
              .action-btn { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 11px 6px; border-radius: 12px; border: 1.5px solid; cursor: pointer; font-size: 11px; font-weight: 700; transition: transform 0.1s; background: none; }
              .action-btn:active { transform: scale(0.97); }
              .rpt-row { display: flex; align-items: center; padding: 11px 12px; gap: 10px; }
              .rpt-acts { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
              @media (max-width: 420px) { .rpt-row { flex-wrap: wrap; } .rpt-acts { width: 100%; justify-content: flex-end; padding: 0 12px 10px; } }
              @keyframes pg-spin { to { transform: rotate(360deg); } }
            `}</style>

            <div className="action-row">
              <button className="action-btn"
                onClick={() => router.push('/dashboard/roofing/promeasure?address=' + encodeURIComponent(property.address_line1 + (property.city ? ', ' + property.city : '')))}
                style={{ borderColor: '#CCFBF1', color: '#0F766E', background: dk ? '#0F1E2E' : '#F0FDFA' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#0F766E,#14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><polygon points="3,20 12,4 21,20" fill="rgba(255,255,255,0.15)"/><line x1="3" y1="20" x2="21" y2="20"/><line x1="7" y1="20" x2="7" y2="16"/><line x1="12" y1="20" x2="12" y2="14"/><line x1="17" y1="20" x2="17" y2="16"/></svg>
                </div>
                <span style={{ color: dk ? '#94A3B8' : '#0F766E' }}>ProMeasure</span>
              </button>

              <button className="action-btn"
                onClick={() => router.push('/dashboard/roofing/calculator' + (property.sq_footage ? '?sq=' + Math.round(property.sq_footage / 100) : ''))}
                style={{ borderColor: '#BFDBFE', color: '#2563EB', background: dk ? '#0F1829' : '#EFF6FF' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#1D4ED8,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="3" width="16" height="18" rx="3" fill="rgba(255,255,255,0.12)"/><rect x="7" y="6" width="10" height="3" rx="1.2" fill="rgba(255,255,255,0.9)" stroke="none"/><circle cx="8.5" cy="13" r="1" fill="white" stroke="none"/><circle cx="12" cy="13" r="1" fill="white" stroke="none"/><circle cx="15.5" cy="13" r="1" fill="white" stroke="none"/><circle cx="8.5" cy="16.5" r="1" fill="white" stroke="none"/><circle cx="12" cy="16.5" r="1" fill="white" stroke="none"/></svg>
                </div>
                <span style={{ color: dk ? '#93C5FD' : '#2563EB' }}>Calculator</span>
              </button>

              <button className="action-btn"
                onClick={generateReport}
                disabled={generating}
                style={{ borderColor: 'transparent', background: generating ? (dk ? '#1A2535' : '#F1F5F9') : 'linear-gradient(135deg,#0A1628,#0F766E)', opacity: generating ? 0.75 : 1 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {generating
                    ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'pg-spin 0.8s linear infinite' }} />
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="rgba(255,255,255,0.15)"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="18" x2="8" y2="13"/><line x1="12" y1="18" x2="12" y2="11"/><line x1="16" y1="18" x2="16" y2="14"/></svg>
                  }
                </div>
                <span style={{ color: generating ? t.textSubtle : 'white' }}>{generating ? 'Generating...' : latestReport ? 'Re-run' : 'Generate'}</span>
              </button>
            </div>

            {reportErr && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13, marginBottom: 10 }}>
                {reportErr}
              </div>
            )}

            {/* Reports list */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: reports.length > 0 ? `1px solid ${t.cardBorder}` : 'none' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 7 }}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle }}>Reports ({reports.length})</span>
              </div>
              {reportsLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: t.textSubtle, fontSize: 13 }}>Loading...</div>
              ) : reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: t.textSubtle, fontSize: 13 }}>No reports yet — tap Generate above.</div>
              ) : (
                <div>
                  {reports.map((report, idx) => (
                    <div key={report.id} style={{ borderTop: idx > 0 ? `1px solid ${t.cardBorder}` : 'none' }}>
                      <div className="rpt-row">
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0FDFA', border: '1px solid #CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="18" x2="8" y2="13"/><line x1="12" y1="18" x2="12" y2="11"/><line x1="16" y1="18" x2="16" y2="14"/></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: t.textPri }}>{report.total_squares_order.toFixed(1)} sq</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F766E' }}>{report.dominant_pitch}</span>
                            <span style={{ fontSize: 11, color: t.textSubtle }}>{report.facet_count} facets</span>
                          </div>
                          <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 1 }}>
                            {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' · '}{new Date(report.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="rpt-acts">
                          <a href={report.r2_url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 8, border: '1.5px solid #0F766E', background: '#F0FDFA', color: '#0F766E', fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Quick Bid
                          </a>
                          {canAccessPremium && (
                            dsmLoadingId === report.id || premiumLoadingId === report.id ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1.5px solid #E9D5FF', background: '#FAF5FF', color: '#7C3AED', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' as const }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.2s" repeatCount="indefinite"/>
                                  </path>
                                </svg>
                                {premiumLoadingId === report.id ? 'Building...' : 'Analyzing...'}
                              </div>
                            ) : (
                              <button onClick={() => getLinearFootageAndPDF(report)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 8, border: '1.5px solid #7C3AED', background: '#FAF5FF', color: '#7C3AED', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                Material Order
                              </button>
                            )
                          )}
                          <button onClick={() => deleteReport(report.id)} disabled={deletingReportId === report.id}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.color = 'white' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626' }}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', flexShrink: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Property details — always visible, editable when Edit tapped */}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginBottom: 12 }}>
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 12 }}>Address</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {field('address_line1', 'Street Address')}
                  {field('address_line2', 'Unit / Suite')}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 90px', gap: 8 }}>
                    {field('city', 'City')}{field('state', 'State')}{field('zip_code', 'ZIP')}
                  </div>
                </div>
              </div>
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 12 }}>Roof Details</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {field('roof_type', 'Roof Type', 'select', ROOF_TYPES)}
                  {field('roof_material', 'Material', 'select', ROOF_MATS)}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {field('sq_footage', 'Sq Ft', 'number')}{field('roof_age_years', 'Age (yrs)', 'number')}{field('stories', 'Stories', 'select', STORIES_OPTS.map(String))}
                  </div>
                </div>
              </div>
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 12 }}>Insurance</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {field('insurance_carrier', 'Carrier')}{field('insurance_policy_number', 'Policy #')}
                </div>
              </div>
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 12 }}>Notes</div>
                {editing
                  ? <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                      rows={3} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                  : <p style={{ fontSize: 13, color: property.notes ? t.textBody : t.textSubtle, margin: 0, lineHeight: 1.6 }}>{property.notes || 'No notes yet.'}</p>
                }
              </div>
            </div>
            {editing && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => { setEditing(false); setForm(property) }}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}

            {/* Job History */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: leads.length > 0 ? `1px solid ${t.cardBorder}` : 'none' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 7 }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle }}>Job History ({leads.length})</span>
              </div>
              {leads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: t.textSubtle, fontSize: 13 }}>
                  No jobs linked yet. Open a lead and assign it to this address.
                </div>
              ) : (
                <div>
                  {leads.map((lead, idx) => {
                    const stage = stages.find(s => s.key === lead.lead_status) || stages[0]
                    const ss = stageStyle(lead.lead_status, dk)
                    return (
                      <div key={lead.id}
                        onClick={() => router.push('/dashboard/pipeline/' + lead.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderTop: idx > 0 ? `1px solid ${t.cardBorder}` : 'none', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = t.cardBgHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: t.textPri, margin: '0 0 2px' }}>{capName(lead.contact_name)}</p>
                          <p style={{ fontSize: 11, color: t.textSubtle, margin: 0 }}>{timeAgo(lead.created_at)}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {lead.quoted_amount && <span style={{ fontSize: 13, fontWeight: 700, color: t.textBody }}>{fmtCurrency(lead.quoted_amount)}</span>}
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: ss.bg, color: ss.color }}>{stage.label}</span>
                          <Ic size={13} color={t.textSubtle}><polyline points="9 18 15 12 9 6" /></Ic>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
