'use client'
import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
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

function PropertyProfilePageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const leadId = searchParams.get('lead_id') || null
  const [applyingToLead, setApplyingToLead] = useState(false)
  const [appliedToLead, setAppliedToLead] = useState(false)
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
  const [leads,  setLeads]  = useState<LinkedLead[]>([])
  const [client, setClient] = useState<{ id: string; full_name: string; phone: string | null; email: string | null; tags: string[] } | null>(null)
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
        setClient(d.client || null)
      })
      .catch(() => { setLoading(false) })
      .finally(() => setLoading(false))
  }, [id, session])

  useEffect(() => {
    if (!session) return
    setReportsLoading(true)
    fetch(`/api/roofing/reports?pro_id=${session.id}&property_id=${id}`)
      .then(r => r.json())
      .then(async d => {
        const linked = d.reports || []
        if (linked.length > 0) { setReports(linked); return }
        // No linked reports — fallback: show all pro reports (orphans from lead detail)
        // and backfill property_id so they appear here on next load
        try {
          const allRes = await fetch(`/api/roofing/reports?pro_id=${session.id}`)
          const allD   = allRes.ok ? await allRes.json() : { reports: [] }
          const all    = allD.reports || []
          if (all.length > 0) {
            setReports(all)
            // Silently backfill any unlinked reports to this property
            for (const r of all.filter((r: any) => !r.property_id)) {
              fetch('/api/roofing/reports', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: r.id, pro_id: session.id, property_id: id }),
              }).catch(() => {})
            }
          }
        } catch {}
      })
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
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 90000) // 90s — Solar API can be slow
      let r: Response
      try {
        r = await fetch('/api/roofing/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: fullAddress, pro_id: session.id, property_id: id }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      let d: Record<string, unknown>
      try { d = await r.json() } catch { setReportErr('Server returned an invalid response — please retry'); return }
      if (!r.ok) { setReportErr((d.error as string) || 'Report generation failed'); return }

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
      // Push measurements to Calculator via sessionStorage (pg_promeasure = key calculator reads)
      const measurements = d.measurements as Record<string, unknown> | undefined
      if (measurements) {
        try {
          // Use Google's normalised formattedAddress if available (avoids duplicate city segments)
          // Fall back to fullAddress (what we typed) if not in response
          const geocodedAddress = (d.debug as any)?.formattedAddress
            ? String((d.debug as any).formattedAddress).replace(', USA', '')
            : fullAddress
          const reportSessionData = {
            squares:   Number(measurements.totalSquaresOrder) || 0,
            pitch:     (measurements.dominantPitch as string) ?? '4/12',
            waste:     Number(measurements.wasteFactor) || 12,
            source:    'roof_report',
            address:   geocodedAddress,
            storedAt:  Date.now(),
            propertyId: id,
            // Linear footage — populated by DSM (async). Will be updated once DSM completes.
            ridgeLF:  0, eaveLF: 0, perimLF: 0, hipLF: 0, valleyLF: 0, rakeLF: 0,
          }
          sessionStorage.setItem('pg_promeasure',   JSON.stringify(reportSessionData))
          sessionStorage.setItem('pg_report_data',  JSON.stringify(reportSessionData))
        } catch {
          // sessionStorage unavailable (private browsing quota) — non-fatal
        }
      }
    } catch {
      setReportErr('Network error — please retry')
    } finally {
      setGenerating(false)
    }
  }

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  async function deleteReport(reportId: string) {
    if (!session) return
    setDeleteConfirmId(reportId) // show confirmation modal, not browser confirm()
  }

  async function confirmDeleteReport() {
    if (!session || !deleteConfirmId) return
    const idToDelete = deleteConfirmId  // capture before nulling
    setDeletingReportId(idToDelete)
    setDeleteConfirmId(null)
    try {
      await fetch(`/api/roofing/reports?id=${idToDelete}&pro_id=${session.id}`, { method: 'DELETE' })
      setReports(prev => prev.filter(r => r.id !== idToDelete))
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
      // Step 1: Compute linear footage from Solar API segment geometry
      const dsmController = new AbortController()
      const dsmTimer = setTimeout(() => dsmController.abort(), 60000)
      let dsmRes: Response
      try {
        dsmRes = await fetch('/api/roofing/dsm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_id: report.id, pro_id: session.id }),
          signal: dsmController.signal,
        })
      } finally {
        clearTimeout(dsmTimer)
      }
      let dsmData: Record<string, unknown>
      try { dsmData = await dsmRes.json() } catch { setReportErr('DSM service returned invalid response — please retry'); return }
      console.log('[ui] DSM response:', JSON.stringify(dsmData).slice(0, 200))

      if (!dsmRes.ok || !dsmData.linear_footage) {
        const errMsg = String(dsmData.error ?? dsmData.detail ?? 'Unknown error')
        if (dsmRes.status === 422 && errMsg.toLowerCase().includes('solar')) {
          setReportErr('⚠️ This report needs a refresh — click Re-run (30 seconds) then try Material Order again.')
        } else {
          setReportErr('Could not compute linear footage: ' + errMsg)
        }
        return
      }

      // Update the row immediately with DSM results (cast is safe — shape validated by API)
      const freshLf = dsmData.linear_footage as LinearFootage
      setReports(prev => prev.map(r =>
        r.id === report.id ? { ...r, linear_footage: freshLf } : r
      ))
      // Update sessionStorage with linear footage so Calculator Section 2 auto-fills
      try {
        const existingRaw = sessionStorage.getItem('pg_report_data')
        if (existingRaw) {
          const existing = JSON.parse(existingRaw)
          const updated = {
            ...existing,
            ridgeLF:   freshLf.ridge_ft   || 0,
            eaveLF:    freshLf.eave_ft    || 0,
            perimLF:   (freshLf.eave_ft || 0) + (freshLf.rake_ft || 0), // drip edge = eave + rake
            hipLF:     freshLf.hip_ft     || 0,
            valleyLF:  freshLf.valley_ft  || 0,
            rakeLF:    freshLf.rake_ft    || 0,
          }
          sessionStorage.setItem('pg_report_data', JSON.stringify(updated))
          sessionStorage.setItem('pg_promeasure',  JSON.stringify(updated))
        }
      } catch { /* non-fatal */ }

      // Step 2: Generate Premium PDF
      setPremiumLoadingId(report.id)
      const pdfController = new AbortController()
      const pdfTimer = setTimeout(() => pdfController.abort(), 60000)
      let pdfRes: Response
      try {
        pdfRes = await fetch('/api/roofing/premium-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_id: report.id, pro_id: session.id }),
          signal: pdfController.signal,
        })
      } finally {
        clearTimeout(pdfTimer)
      }
      let pdfData: Record<string, unknown>
      try { pdfData = await pdfRes.json() } catch { setReportErr('PDF service returned invalid response — please retry'); return }
      console.log('[ui] PDF response:', JSON.stringify(pdfData).slice(0, 200))

      if (!pdfRes.ok) {
        setReportErr('PDF generation failed: ' + String(pdfData.error ?? '') + (pdfData.detail ? ' — ' + String(pdfData.detail) : ''))
        return
      }

      if (typeof pdfData.url === 'string' && pdfData.url) window.open(pdfData.url, '_blank')

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
    <>
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 14px' }}>

        {/* Delete confirmation modal */}
        {deleteConfirmId && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
              </div>
              <p style={{ fontSize: 16, fontWeight: 800, color: t.textPri, margin: '0 0 6px' }}>Delete report?</p>
              <p style={{ fontSize: 13, color: t.textSubtle, margin: '0 0 20px', lineHeight: 1.5 }}>This removes the PDF and all measurement data permanently. It cannot be undone.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setDeleteConfirmId(null)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={confirmDeleteReport} disabled={!!deletingReportId}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#DC2626', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

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
                {latestReport?.r2_url ? (
                  <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${t.cardBorder}` }}>
                    <div style={{ width: '100%', height: '100%', background: '#F0FDFA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                    </div>
                  </div>
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F0FDFA', border: '1.5px solid #99F6E4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                  </div>
                )}
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

            {/* Apply to Lead — visible when opened from a lead detail page */}
            {latestReport && leadId && (
              <div style={{ marginBottom: 12 }}>
                {appliedToLead ? (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: '#ECFDF5',
                    border: '1px solid #6EE7B7', fontSize: 13, fontWeight: 700, color: '#065F46',
                    display: 'flex', alignItems: 'center', gap: 8 }}>
                    ✓ Measurements saved to lead — {latestReport.total_squares_order.toFixed(1)} sq applied
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      if (!session || !leadId) return
                      setApplyingToLead(true)
                      try {
                        await fetch(`/api/leads/${leadId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            pro_id:       session.id,
                            square_count: latestReport.total_squares_order,
                            pitch:        latestReport.dominant_pitch,
                            waste_pct:    latestReport.waste_factor,
                          }),
                        })
                        setAppliedToLead(true)
                      } catch { /* non-fatal */ }
                      finally { setApplyingToLead(false) }
                    }}
                    disabled={applyingToLead}
                    style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg, #0F766E, #0D9488)',
                      color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {applyingToLead ? 'Saving...' : `↩ Apply ${latestReport.total_squares_order.toFixed(1)} sq to Lead`}
                  </button>
                )}
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
              @keyframes pg-spin { to { transform: rotate(360deg); } } @keyframes pg-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
            `}</style>

            <div className="action-row">
              <button className="action-btn"
                onClick={() => router.push('/dashboard/roofing/promeasure?address=' + encodeURIComponent(property.address_line1 + (property.city ? ', ' + property.city : '')))}
                style={{ borderColor: '#CCFBF1', color: '#0F766E', background: dk ? '#0F1E2E' : '#F0FDFA' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#0F766E,#14B8A6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20M2 12l4-4M2 12l4 4M12 2v20M12 2l-4 4M12 2l4 4" opacity="0"/><rect x="3" y="7" width="18" height="10" rx="2" fill="rgba(255,255,255,0.15)"/><line x1="7" y1="7" x2="7" y2="10"/><line x1="11" y1="7" x2="11" y2="12"/><line x1="15" y1="7" x2="15" y2="10"/><line x1="19" y1="7" x2="19" y2="10"/></svg>
                </div>
                <span style={{ color: dk ? '#94A3B8' : '#0F766E' }}>ProMeasure</span>
              </button>

              <button className="action-btn"
                onClick={() => {
                  const calcPath = latestReport
                    ? `/dashboard/roofing/calculator?from=promeasure&property_id=${id}`
                    : `/dashboard/roofing/calculator?property_id=${id}` + (property.sq_footage ? '&sq=' + Math.round(property.sq_footage / 100) : '')
                  router.push(calcPath)
                }}
                style={{ borderColor: '#BFDBFE', color: '#2563EB', background: dk ? '#0F1829' : '#EFF6FF' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#1D4ED8,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="3" width="16" height="18" rx="3" fill="rgba(255,255,255,0.12)"/><rect x="7" y="6" width="10" height="3" rx="1.2" fill="rgba(255,255,255,0.9)" stroke="none"/><circle cx="8.5" cy="13" r="1" fill="white" stroke="none"/><circle cx="12" cy="13" r="1" fill="white" stroke="none"/><circle cx="15.5" cy="13" r="1" fill="white" stroke="none"/><circle cx="8.5" cy="16.5" r="1" fill="white" stroke="none"/><circle cx="12" cy="16.5" r="1" fill="white" stroke="none"/></svg>
                </div>
                <span style={{ color: dk ? '#93C5FD' : '#2563EB' }}>Calculator</span>
              </button>

              <button className="action-btn"
                onClick={generateReport}
                disabled={generating}
                style={{ borderColor: 'transparent', background: generating ? 'linear-gradient(135deg,#0F766E,#14B8A6)' : 'linear-gradient(135deg,#0A1628,#0F766E)', opacity: 1, position: 'relative' as const, overflow: 'hidden' }}>
                {generating && (
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)', animation: 'pg-shimmer 1.4s ease-in-out infinite' }} />
                )}
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {generating
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.2s" repeatCount="indefinite"/></path></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" fill="rgba(255,255,255,0.15)"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="18" x2="8" y2="13"/><line x1="12" y1="18" x2="12" y2="11"/><line x1="16" y1="18" x2="16" y2="14"/></svg>
                  }
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 1 }}>
                  <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{generating ? 'Analyzing…' : latestReport ? 'Re-run' : 'Generate'}</span>
                  {generating && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>~30 seconds</span>}
                </div>
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
                          {/* Linear footage breakdown — shown when DSM has run */}
                          {report.linear_footage && (
                            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px 10px', marginTop: 5 }}>
                              {[
                                { label: 'Ridge',  val: report.linear_footage.ridge_ft,  color: '#7C3AED' },
                                { label: 'Hip',    val: report.linear_footage.hip_ft,    color: '#0891B2' },
                                { label: 'Valley', val: report.linear_footage.valley_ft, color: '#EA580C' },
                                { label: 'Rake',   val: report.linear_footage.rake_ft,   color: '#D97706' },
                                { label: 'Eave',   val: report.linear_footage.eave_ft,   color: '#059669' },
                              ].map(m => (
                                <span key={m.label} style={{ fontSize: 10, fontWeight: 600, color: m.color }}>
                                  {m.label} {Math.round(m.val)}ft
                                </span>
                              ))}
                              <span style={{ fontSize: 10, fontWeight: 700, color: t.textSubtle }}>
                                · {Math.round(report.linear_footage.total_linear_ft)}ft total
                              </span>
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3 }}>
                            {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' · '}{new Date(report.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {!report.linear_footage && (
                              <span style={{ marginLeft: 6, color: '#7C3AED', fontWeight: 600 }}>· Tap Material Order for linear footage</span>
                            )}
                          </div>
                        </div>
                        <div className="rpt-acts">
                          {/* Use in Calculator — loads this report's measurements into Calculator */}
                          <button onClick={() => {
                              const lf = report.linear_footage
                              const payload = {
                                squares:    report.total_squares_order || 0,
                                pitch:      report.dominant_pitch || '6/12',
                                waste:      report.waste_factor || 12,
                                source:     'roof_report',
                                address:    property.address_line1 + (property.city ? ', ' + property.city : ''),
                                storedAt:   Date.now(),
                                propertyId: id,
                                ridgeLF:    lf ? Math.round(lf.ridge_ft) : 0,
                                eaveLF:     lf ? Math.round(lf.eave_ft)  : 0,
                                perimLF:    lf ? Math.round((lf.eave_ft || 0) + (lf.rake_ft || 0)) : 0,
                                hipLF:      lf ? Math.round(lf.hip_ft)   : 0,
                                valleyLF:   lf ? Math.round(lf.valley_ft): 0,
                                rakeLF:     lf ? Math.round(lf.rake_ft)  : 0,
                              }
                              try {
                                sessionStorage.setItem('pg_report_data', JSON.stringify(payload))
                                sessionStorage.setItem('pg_promeasure',  JSON.stringify(payload))
                              } catch {}
                              router.push(`/dashboard/roofing/calculator?property_id=${id}`)
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 8, border: '1.5px solid #0F766E', background: '#F0FDFA', color: '#0F766E', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>
                            Calculator
                          </button>
                          <a href={report.r2_url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 8, border: '1.5px solid #0F766E', background: '#F0FDFA', color: '#0F766E', fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Quick Bid
                          </a>
                          {/* Share with Homeowner */}
                          <button onClick={() => {
                              const url = report.r2_url
                              if (navigator.share) {
                                navigator.share({ title: 'Roof Measurement Report', text: `Your roof measurement report for ${property.address_line1}`, url }).catch(() => {})
                              } else {
                                navigator.clipboard?.writeText(url).then(() => { /* copied */ }).catch(() => {
                                  window.open(url, '_blank')
                                })
                              }
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 8, border: '1.5px solid #0284C7', background: '#E0F2FE', color: '#0284C7', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            Share
                          </button>
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
                          <button onClick={() => setDeleteConfirmId(report.id)} disabled={deletingReportId === report.id}
                            title="Delete report"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.color = 'white'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#DC2626' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#FECACA' }}>
                            {deletingReportId === report.id
                              ? <div style={{ width: 10, height: 10, border: '1.5px solid #DC2626', borderTopColor: 'transparent', borderRadius: '50%', animation: 'pg-spin 0.8s linear infinite' }} />
                              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Homeowner contact card ─────────────────────────────── */}
            {client && (
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Avatar */}
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F0FDFA', border: '2px solid #0F766E22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: t.textPri, letterSpacing: '-0.01em' }}>{capName(client.full_name)}</div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' as const }}>
                      {client.phone && (
                        <a href={`tel:${client.phone}`} style={{ fontSize: 12, color: '#0F766E', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11 19.79 19.79 0 01.01 2.38a2 2 0 012-2.18h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                          {client.phone}
                        </a>
                      )}
                      {client.email && (
                        <a href={`mailto:${client.email}`} style={{ fontSize: 12, color: t.textMuted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          {client.email}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {/* View Client link */}
                <a href={`/dashboard/clients/${client.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 8, border: '1.5px solid #0F766E', background: '#F0FDFA', color: '#0F766E', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                  View Client
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </a>
              </div>
            )}

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


    </>
  )
}

export default function PropertyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <PropertyProfilePageInner params={params} />
    </Suspense>
  )
}
