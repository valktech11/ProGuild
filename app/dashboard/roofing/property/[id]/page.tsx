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
  lat?: number
  lng?: number
  address?: string
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
  async function getLinearFootageAndPDF(report: RoofReport & { lat?: number; lng?: number }) {
    if (!canAccessPremium || !session) return
    if (!report.lat || !report.lng) {
      setReportErr('Location data missing — please generate a new report to use this feature.')
      return
    }
    setDsmLoadingId(report.id)
    setReportErr(null)
    try {
      // Step 1: Run DSM — stores linear_footage in DB (up to 60s)
      console.log('[ui] calling DSM for report:', report.id, 'lat:', report.lat, 'lng:', report.lng)
      const dsmRes = await fetch('/api/roofing/dsm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: report.lat, lng: report.lng, report_id: report.id, pro_id: session.id }),
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

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>

        {/* Back */}
        <button onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: t.textMuted, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Ic><polyline points="15 18 9 12 15 6" /></Ic> Back
        </button>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: t.textSubtle }}>Loading property...</div>
        ) : !property ? (
          <div style={{ textAlign: 'center', padding: 80, color: t.textSubtle }}>Property not found</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F0FDFA', border: '1.5px solid #99F6E4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                  </div>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: t.textPri, margin: 0 }}>
                    {property.address_line1}
                  </h1>
                </div>
                <p style={{ fontSize: 14, color: t.textMuted, margin: 0 }}>
                  {[property.city, property.state, property.zip_code].filter(Boolean).join(', ')} . Added {timeAgo(property.created_at)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {editing ? (
                  <>
                    <button onClick={() => { setEditing(false); setForm(property) }}
                      style={{ padding: '8px 16px', borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: '#0F766E', color: 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)}
                    style={{ padding: '8px 18px', borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                )}
              </div>
            </div>

            {saveErr && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13, marginBottom: 16 }}>
                {saveErr}
              </div>
            )}

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>

              {/* Address Card */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round"><path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z" fill="#16A34A" stroke="#16A34A" strokeWidth="1"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle }}>PROPERTY ADDRESS</span>
                </div>
                <div style={{ display: 'grid', gap: 14 }}>
                  {field('address_line1', 'Street Address')}
                  {field('address_line2', 'Unit / Suite')}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: 10 }}>
                    {field('city', 'City')}
                    {field('state', 'State')}
                    {field('zip_code', 'ZIP')}
                  </div>
                </div>
              </div>

              {/* Roof Details Card */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/><path d="M15 4h2v4"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle }}>ROOF DETAILS</span>
                </div>
                <div style={{ display: 'grid', gap: 14 }}>
                  {field('roof_type', 'Roof Type', 'select', ROOF_TYPES)}
                  {field('roof_material', 'Material', 'select', ROOF_MATS)}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {field('sq_footage', 'Sq Footage', 'number')}
                    {field('roof_age_years', 'Age (years)', 'number')}
                    {field('stories', 'Stories', 'select', STORIES_OPTS.map(String))}
                  </div>
                </div>
              </div>

              {/* Insurance Card */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3v20z" fill="#7C3AED" opacity="0.9"/><path d="M12 2L4 5v7c0 6 8 10 8 10" stroke="#7C3AED" strokeWidth="2"/><line x1="12" y1="2" x2="12" y2="22" stroke="#7C3AED" strokeWidth="1.5"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle }}>INSURANCE</span>
                </div>
                <div style={{ display: 'grid', gap: 14 }}>
                  {field('insurance_carrier', 'Insurance Carrier')}
                  {field('insurance_policy_number', 'Policy Number')}
                </div>
              </div>

              {/* Notes Card */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle }}>NOTES</span>
                </div>
                {editing ? (
                  <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                    rows={4}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                ) : (
                  <p style={{ fontSize: 14, color: property.notes ? t.textBody : t.textSubtle, lineHeight: 1.6, margin: 0 }}>
                    {property.notes || 'No notes yet.'}
                  </p>
                )}
              </div>
            </div>

            {/* Job History */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20, marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, margin: 0 }}>JOB HISTORY ({leads.length})</h2>
                </div>
              </div>

              {leads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: t.textSubtle, fontSize: 14 }}>
                  No jobs linked to this property yet.<br />
                  <span style={{ fontSize: 13 }}>Open a lead and assign it to this property address.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {leads.map(lead => {
                    const stage = stages.find(s => s.key === lead.lead_status) || stages[0]
                    const ss = stageStyle(lead.lead_status, dk)
                    return (
                      <div key={lead.id}
                        onClick={() => router.push('/dashboard/pipeline/' + lead.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.cardBorder}`, cursor: 'pointer', background: t.cardBgAlt, transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = t.cardBgHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = t.cardBgAlt)}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: t.textPri, margin: '0 0 2px' }}>{capName(lead.contact_name)}</p>
                          <p style={{ fontSize: 12, color: t.textSubtle, margin: 0 }}>{timeAgo(lead.created_at)}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {lead.quoted_amount && (
                            <span style={{ fontSize: 13, fontWeight: 700, color: t.textBody }}>{fmtCurrency(lead.quoted_amount)}</span>
                          )}
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: ss.bg, color: ss.color }}>
                            {stage.label}
                          </span>
                          <Ic size={14} color={t.textSubtle}><polyline points="9 18 15 12 9 6" /></Ic>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── TOOL SUITE ─────────────────────────────────────── */}
            <style>{`
              .tool-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
              .tool-btn { position: relative; display: flex; flex-direction: row; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; cursor: pointer; border: 1.5px solid; text-align: left; transition: transform 0.12s ease, box-shadow 0.12s ease; min-height: 60px; }
              .tool-btn:hover { transform: translateY(-1px); }
              .tool-btn:active { transform: translateY(0px); }
              .report-card { position: relative; display: flex; align-items: center; gap: 16px; padding: 18px 20px; border-radius: 18px; cursor: pointer; border: none; width: 100%; text-align: left; margin-top: 10px; transition: transform 0.12s ease, box-shadow 0.15s ease; overflow: hidden; }
              .report-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(15,118,110,0.45) !important; }
              .report-card:active { transform: translateY(0); }
              .report-card:disabled { cursor: wait; opacity: 0.8; transform: none !important; }
              @media (max-width: 480px) {
                .tool-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
                .report-card { padding: 14px 14px !important; }
              }
              @media (max-width: 560px) {
                .rpt-row-actions { flex-direction: row !important; flex-wrap: wrap !important; justify-content: flex-end !important; }
              }
            `}</style>

            {/* Row 1 — Tool tiles */}
            <div className="tool-grid">

              {/* ProMeasure */}
              <button className="tool-btn"
                onClick={() => router.push('/dashboard/roofing/promeasure?address=' + encodeURIComponent(property.address_line1 + (property.city ? ', ' + property.city : '')))}
                style={{ background: dk ? '#0F1E2E' : '#F0FDFA', borderColor: dk ? '#1E3A4A' : '#CCFBF1' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,118,110,0.18)'; e.currentTarget.style.borderColor = '#0F766E' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = dk ? '#1E3A4A' : '#CCFBF1' }}>
                {/* Icon */}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#0F766E,#14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 10px rgba(15,118,110,0.3)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3,20 12,4 21,20" fill="rgba(255,255,255,0.15)"/>
                    <line x1="3" y1="20" x2="21" y2="20"/>
                    <line x1="7" y1="20" x2="7" y2="16"/>
                    <line x1="12" y1="20" x2="12" y2="14"/>
                    <line x1="17" y1="20" x2="17" y2="16"/>
                    <line x1="5.5" y1="14" x2="18.5" y2="14" strokeDasharray="2 1.5" opacity="0.6"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: dk ? '#E2E8F0' : '#0A1628', letterSpacing: '-0.01em', marginBottom: 1 }}>ProMeasure</div>
                  <div style={{ fontSize: 11, color: dk ? '#64748B' : '#0F766E', fontWeight: 500 }}>Draw roof polygons</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dk ? '#64748B' : '#0F766E'} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              {/* Calculator */}
              <button className="tool-btn"
                onClick={() => router.push('/dashboard/roofing/calculator' + (property.sq_footage ? '?sq=' + Math.round(property.sq_footage / 100) : ''))}
                style={{ background: dk ? '#0F1829' : '#EFF6FF', borderColor: dk ? '#1E2D45' : '#BFDBFE' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.18)'; e.currentTarget.style.borderColor = '#2563EB' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = dk ? '#1E2D45' : '#BFDBFE' }}>
                {/* Icon */}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#1D4ED8,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 10px rgba(37,99,235,0.3)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="3" width="16" height="18" rx="3" fill="rgba(255,255,255,0.12)"/>
                    <rect x="7" y="6" width="10" height="3" rx="1.2" fill="rgba(255,255,255,0.9)" stroke="none"/>
                    <circle cx="8.5" cy="13" r="1" fill="white" stroke="none"/>
                    <circle cx="12" cy="13" r="1" fill="white" stroke="none"/>
                    <circle cx="15.5" cy="13" r="1" fill="white" stroke="none"/>
                    <circle cx="8.5" cy="16.5" r="1" fill="white" stroke="none"/>
                    <circle cx="12" cy="16.5" r="1" fill="white" stroke="none"/>
                    <rect x="14" y="15.5" width="3" height="2.5" rx="0.8" fill="rgba(147,210,255,0.9)" stroke="none"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: dk ? '#E2E8F0' : '#0A1628', letterSpacing: '-0.01em', marginBottom: 1 }}>Calculator</div>
                  <div style={{ fontSize: 11, color: dk ? '#64748B' : '#1D4ED8', fontWeight: 500 }}>Material costs</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dk ? '#64748B' : '#1D4ED8'} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            {/* Row 2 — Generate Report (launch card) */}
            <button className="report-card"
              onClick={generateReport}
              disabled={generating}
              style={{
                background: generating
                  ? (dk ? '#1A2535' : '#F8FAFC')
                  : 'linear-gradient(135deg, #0A1628 0%, #0F766E 60%, #14B8A6 100%)',
                boxShadow: generating ? 'none' : '0 8px 32px rgba(15,118,110,0.3)',
              }}>

              {/* Subtle grid texture overlay */}
              {!generating && (
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(20,184,166,0.15) 0%, transparent 60%)', pointerEvents: 'none' }} />
              )}

              {/* Icon container */}
              <div style={{ width: 52, height: 52, borderRadius: 14, background: generating ? (dk ? '#2D3748' : '#E2E8F0') : 'rgba(255,255,255,0.12)', border: generating ? 'none' : '1.5px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backdropFilter: 'blur(8px)' }}>
                {generating ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke={dk ? '#64748B' : '#94A3B8'} strokeWidth="2">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </path>
                  </svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="rgba(255,255,255,0.18)" stroke="white" strokeWidth="1.6"/>
                    <polyline points="14 2 14 8 20 8" stroke="white" strokeWidth="1.6"/>
                    <line x1="8" y1="18" x2="8" y2="13" stroke="#5EEAD4" strokeWidth="2.2"/>
                    <line x1="12" y1="18" x2="12" y2="11" stroke="#5EEAD4" strokeWidth="2.2"/>
                    <line x1="16" y1="18" x2="16" y2="14" stroke="#5EEAD4" strokeWidth="2.2"/>
                    <circle cx="19" cy="5" r="4" fill="#0F766E" stroke="none"/>
                    <path d="M17.5 5l1 1 2-2" stroke="white" strokeWidth="1.4"/>
                  </svg>
                )}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: generating ? (dk ? '#E2E8F0' : '#0A1628') : 'white', marginBottom: 3 }}>
                  {generating ? 'Generating Report...' : 'Generate Report'}
                </div>
                <div style={{ fontSize: 11.5, color: generating ? (dk ? '#64748B' : '#94A3B8') : 'rgba(255,255,255,0.7)', fontWeight: 500, lineHeight: 1.4 }}>
                  {generating
                    ? 'Fetching satellite data — up to 60 seconds'
                    : 'Satellite measurement PDF · No site visit needed'}
                </div>
                {!generating && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                    {['Squares', 'Pitch', 'Waste', 'Imagery', 'AI Condition'].map(tag => (
                      <span key={tag} style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', padding: '2px 7px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.15)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div style={{ flexShrink: 0 }}>
                {generating ? (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: dk ? '#2D3748' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 16, height: 16, border: `2px solid ${dk ? '#4A5568' : '#CBD5E0'}`, borderTopColor: '#0F766E', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                )}
              </div>
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>


            {/* Report error */}
            {reportErr && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13, marginTop: 10 }}>
                {reportErr}
              </div>
            )}

            {/* Report History */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20, marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, flexShrink: 0 }}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
                <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, margin: 0 }}>
                  Reports ({reports.length})
                </h2>
              </div>
              {reportsLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: t.textSubtle, fontSize: 13 }}>Loading...</div>
              ) : reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: t.textSubtle, fontSize: 14 }}>
                  No reports yet.<br />
                  <span style={{ fontSize: 13 }}>Click &ldquo;Generate Report&rdquo; to create your first satellite measurement report.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reports.map(report => (
                    <div key={report.id}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${t.cardBorder}`,
                        background: t.cardBg,
                        overflow: 'hidden',
                        transition: 'box-shadow 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

                      {/* Main row: data left, actions right */}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 12 }}>

                        {/* Left: report type icon */}
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F0FDFA', border: '1px solid #CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            <line x1="8" y1="18" x2="8" y2="13"/><line x1="12" y1="18" x2="12" y2="11"/><line x1="16" y1="18" x2="16" y2="14"/>
                          </svg>
                        </div>

                        {/* Center: labelled metrics */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Line 1: labelled key numbers */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 1 }}>Roof Area</div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: t.textPri, letterSpacing: '-0.02em' }}>{report.total_squares_order.toFixed(1)} sq</div>
                            </div>
                            <div style={{ width: 1, height: 28, background: t.cardBorder, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 1 }}>Pitch</div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F766E', letterSpacing: '-0.02em' }}>{report.dominant_pitch}</div>
                            </div>
                            <div style={{ fontSize: 11, color: t.textSubtle, marginLeft: 2 }}>
                              {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {' · '}
                              {new Date(report.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>

                        {/* Right: action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {/* Bid Report */}
                          <a href={report.r2_url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 120, padding: '7px 0', borderRadius: 8, border: '1.5px solid #0F766E', background: '#F0FDFA', color: '#0F766E', fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Bid Report
                          </a>

                          {/* Material Order — Pro only */}
                          {canAccessPremium && (
                            report.premium_r2_url ? (
                              <a href={report.premium_r2_url} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 140, padding: '7px 0', borderRadius: 8, border: '1.5px solid #7C3AED', background: '#F5F3FF', color: '#7C3AED', fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                Material Order
                              </a>
                            ) : dsmLoadingId === report.id ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: 140, padding: '7px 0', borderRadius: 8, border: '1.5px solid #E9D5FF', background: '#FAF5FF', color: '#7C3AED', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.2s" repeatCount="indefinite"/>
                                  </path>
                                </svg>
                                {premiumLoadingId === report.id ? 'Building PDF...' : 'Analyzing...'}
                              </div>
                            ) : (
                              <button onClick={() => getLinearFootageAndPDF(report)}
                                disabled={dsmLoadingId === report.id || premiumLoadingId === report.id}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 140, padding: '7px 0', borderRadius: 8, border: '1.5px solid #7C3AED', background: '#FAF5FF', color: '#7C3AED', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                                </svg>
                                Material Order
                              </button>
                            )
                          )}

                          {/* Delete — red trash icon */}
                          <button
                            onClick={() => deleteReport(report.id)}
                            disabled={deletingReportId === report.id}
                            title="Delete report"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: deletingReportId === report.id ? 'wait' : 'pointer', opacity: deletingReportId === report.id ? 0.4 : 1, flexShrink: 0, transition: 'background 0.12s, border-color 0.12s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#DC2626'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = '#DC2626' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FECACA' }}>
                            {deletingReportId === report.id ? (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                            ) : (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
