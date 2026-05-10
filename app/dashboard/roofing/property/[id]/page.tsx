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
      .finally(() => setLoading(false))
  }, [id, session])

  useEffect(() => {
    if (!session) return
    setReportsLoading(true)
    fetch(`/api/roofing/reports?pro_id=${session.id}&property_id=${id}`)
      .then(r => r.json())
      .then(d => setReports(d.reports || []))
      .finally(() => setReportsLoading(false))
  }, [id, session])

  async function generateReport() {
    const now = Date.now()
    if (now - lastReport < 30000) return // 30-second debounce
    setLastReport(now)
    if (!session || !property) return
    setGenerating(true)
    setReportErr(null)
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
      // Open PDF in new tab
      window.open(d.url, '_blank')
      // Refresh report list
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
    } catch (e) {
      setReportErr('Network error — please try again')
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
    } catch { /* silently ignore — row already gone */ }
    finally { setDeletingReportId(null) }
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
            {display || '—'}
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
            <option value="">— select —</option>
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
          <div style={{ textAlign: 'center', padding: 80, color: t.textSubtle }}>Loading property…</div>
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
                  {[property.city, property.state, property.zip_code].filter(Boolean).join(', ')} · Added {timeAgo(property.created_at)}
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
                      {saving ? 'Saving…' : 'Save'}
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

            {/* ProMeasure, Calculator & Generate Report CTAs */}
            {/* Mobile: 2-col top row + Generate Report full-width below. Desktop: 3-col. */}
            <style>{`
              @media (max-width: 600px) {
                .cta-grid { display: flex !important; flex-direction: column !important; }
                .cta-top-row { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
                .report-row { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
                .report-actions { display: flex !important; flex-direction: row !important; gap: 8px !important; width: 100% !important; }
                .report-actions a, .report-actions button { flex: 1 !important; text-align: center !important; justify-content: center !important; }
              }
              @media (min-width: 601px) {
                .cta-grid { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 12px !important; }
                .cta-top-row { display: contents !important; }
              }
            `}</style>
            <div className="cta-grid" style={{ marginTop: 16, gap: 12 }}>
              <div className="cta-top-row">
              {/* ProMeasure */}
              <button
                onClick={() => router.push('/dashboard/roofing/promeasure?address=' + encodeURIComponent(property.address_line1 + (property.city ? ', ' + property.city : '')))}
                style={{ padding: '16px 14px', borderRadius: 14, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,184,166,0.12)'; e.currentTarget.style.borderColor = '#14B8A6' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = t.cardBorder }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0FDFA', border: '1.5px solid #CCFBF1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {/* Drafting set-square: right-angle triangle with ruler tick marks */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3,21 3,5 19,21" fill="#CCFBF1" stroke="#0F766E" strokeWidth="2" strokeLinejoin="round"/>
                    <line x1="3" y1="21" x2="19" y2="21"/>
                    <line x1="3" y1="5" x2="3" y2="21"/>
                    <line x1="3" y1="13" x2="6" y2="13"/>
                    <line x1="3" y1="17" x2="5" y2="17"/>
                    <line x1="9" y1="21" x2="9" y2="18"/>
                    <line x1="14" y1="21" x2="14" y2="19"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.textPri, marginBottom: 1 }}>ProMeasure</div>
                  <div style={{ fontSize: 11, color: t.textSubtle }}>Satellite polygon tool</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              {/* Calculator */}
              <button
                onClick={() => router.push('/dashboard/roofing/calculator' + (property.sq_footage ? '?sq=' + Math.round(property.sq_footage / 100) : ''))}
                style={{ padding: '16px 14px', borderRadius: 14, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'box-shadow 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,184,166,0.12)'; e.currentTarget.style.borderColor = '#14B8A6' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = t.cardBorder }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {/* Solid blue badge with white numpad dot grid — matches reference exactly */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="4" width="16" height="16" rx="3" fill="white" opacity="0.15"/>
                    <circle cx="9" cy="9" r="1.6" fill="white"/>
                    <circle cx="12" cy="9" r="1.6" fill="white"/>
                    <circle cx="15" cy="9" r="1.6" fill="white"/>
                    <circle cx="9" cy="12" r="1.6" fill="white"/>
                    <circle cx="12" cy="12" r="1.6" fill="white"/>
                    <circle cx="15" cy="12" r="1.6" fill="white"/>
                    <circle cx="9" cy="15" r="1.6" fill="white"/>
                    <circle cx="12" cy="15" r="1.6" fill="white"/>
                    <rect x="13.4" y="13.4" width="3.2" height="3.2" rx="1" fill="white"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.textPri, marginBottom: 1 }}>Calculator</div>
                  <div style={{ fontSize: 11, color: t.textSubtle }}>Material quantities</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              </div>

              {/* Generate Report — full-width on mobile, 1 col on desktop */}
              <button
                onClick={generateReport}
                disabled={generating || (Date.now() - lastReport < 30000 && lastReport > 0)}
                style={{ padding: '16px 14px', borderRadius: 14, border: `1.5px solid ${generating ? t.cardBorder : '#0D9488'}`, background: generating ? t.cardBg : 'linear-gradient(135deg,#0F766E,#0D9488)', cursor: generating ? 'wait' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s', opacity: generating ? 0.75 : 1 }}
                onMouseEnter={e => { if (!generating) e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,118,110,0.4)' }}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: generating ? t.cardBgAlt : 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {/* Document with bar chart — bold white strokes on teal bg */}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                      fill={generating ? 'none' : 'rgba(255,255,255,0.15)'}
                      stroke={generating ? t.textMuted : 'white'} strokeWidth="1.8"/>
                    <polyline points="14 2 14 8 20 8" stroke={generating ? t.textMuted : 'white'} strokeWidth="1.8"/>
                    <line x1="8" y1="18" x2="8" y2="13" stroke={generating ? t.textMuted : 'white'} strokeWidth="2.2"/>
                    <line x1="12" y1="18" x2="12" y2="11" stroke={generating ? t.textMuted : 'white'} strokeWidth="2.2"/>
                    <line x1="16" y1="18" x2="16" y2="14" stroke={generating ? t.textMuted : 'white'} strokeWidth="2.2"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: generating ? t.textPri : 'white', marginBottom: 1 }}>
                    {generating ? 'Generating…' : 'Generate Report'}
                  </div>
                  <div style={{ fontSize: 11, color: generating ? t.textSubtle : '#99f6e4' }}>
                    {generating ? 'Fetching satellite data…' : 'Squares · pitch · waste PDF'}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={generating ? t.textSubtle : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

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
                  ROOF REPORTS ({reports.length})
                </h2>
              </div>
              {reportsLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: t.textSubtle, fontSize: 13 }}>Loading…</div>
              ) : reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: t.textSubtle, fontSize: 14 }}>
                  No reports yet.<br />
                  <span style={{ fontSize: 13 }}>Click &ldquo;Generate Report&rdquo; to create your first satellite measurement report.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reports.map(report => (
                    <div key={report.id} className="report-row"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: t.cardBgAlt }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: t.textPri, margin: '0 0 2px' }}>
                          {report.total_squares_order.toFixed(1)} sq · {report.dominant_pitch} · {report.waste_factor}% waste
                        </p>
                        <p style={{ fontSize: 12, color: t.textSubtle, margin: 0 }}>
                          {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date(report.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {report.facet_count} facets · {timeAgo(report.created_at)}
                        </p>
                      </div>
                      <div className="report-actions" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <a href={report.r2_url} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '7px 14px', borderRadius: 10, border: `1.5px solid #0F766E`, background: '#F0FDFA', color: '#0F766E', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Download PDF
                        </a>
                        <button
                          onClick={() => deleteReport(report.id)}
                          disabled={deletingReportId === report.id}
                          style={{ padding: '7px 10px', borderRadius: 10, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#991B1B', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: deletingReportId === report.id ? 0.5 : 1 }}>
                          {deletingReportId === report.id ? '…' : 'Delete'}
                        </button>
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
