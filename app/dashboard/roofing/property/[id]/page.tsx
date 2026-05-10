'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell, { IlluIconMeasure, IlluIconCalculator, IlluIconGenerateReport } from '@/components/layout/DashboardShell'
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
  const [reportErr, setReportErr] = useState<string | null>(null)
  const [reports, setReports] = useState<RoofReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)

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
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EFF6FF', border: '1.5px solid #BFDBFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><rect x="9" y="12" width="6" height="9" rx="1"/></svg>
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
                    style={{ padding: '8px 18px', borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
              {/* ProMeasure */}
              <button
                onClick={() => router.push('/dashboard/roofing/promeasure?address=' + encodeURIComponent(property.address_line1 + (property.city ? ', ' + property.city : '')))}
                style={{ padding: '18px 16px', borderRadius: 16, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,184,166,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                <IlluIconMeasure s={44} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri, marginBottom: 2 }}>ProMeasure</div>
                  <div style={{ fontSize: 12, color: t.textSubtle }}>Satellite polygon tool</div>
                </div>
                <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              {/* Calculator */}
              <button
                onClick={() => router.push('/dashboard/roofing/calculator' + (property.sq_footage ? '?sq=' + Math.round(property.sq_footage / 100) : ''))}
                style={{ padding: '18px 16px', borderRadius: 16, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(20,184,166,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                <IlluIconCalculator s={44} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri, marginBottom: 2 }}>Calculator</div>
                  <div style={{ fontSize: 12, color: t.textSubtle }}>Material quantities</div>
                </div>
                <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              {/* Generate Report */}
              <button
                onClick={generateReport}
                disabled={generating}
                style={{ padding: '18px 16px', borderRadius: 16, border: `1.5px solid ${generating ? t.cardBorder : '#0D9488'}`, background: generating ? t.cardBg : 'linear-gradient(135deg,#0F766E 0%,#0D9488 100%)', cursor: generating ? 'wait' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.15s', opacity: generating ? 0.7 : 1 }}
                onMouseEnter={e => { if (!generating) e.currentTarget.style.boxShadow = '0 6px 20px rgba(15,118,110,0.35)' }}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                <IlluIconGenerateReport s={44} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: generating ? t.textPri : 'white', marginBottom: 2 }}>
                    {generating ? 'Generating…' : 'Generate Report'}
                  </div>
                  <div style={{ fontSize: 12, color: generating ? t.textSubtle : '#99f6e4' }}>
                    {generating ? 'Fetching satellite data' : 'Squares · pitch · waste PDF'}
                  </div>
                </div>
                <svg style={{ marginLeft: 'auto', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={generating ? t.textSubtle : 'rgba(255,255,255,0.7)'} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
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
                    <div key={report.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: t.cardBgAlt }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: t.textPri, margin: '0 0 2px' }}>
                          {report.total_squares_order.toFixed(1)} sq · {report.dominant_pitch} · {report.waste_factor}% waste
                        </p>
                        <p style={{ fontSize: 12, color: t.textSubtle, margin: 0 }}>
                          {report.facet_count} facets · Imagery: {report.imagery_date} · {timeAgo(report.created_at)}
                        </p>
                      </div>
                      <a href={report.r2_url} target="_blank" rel="noopener noreferrer"
                        style={{ padding: '7px 14px', borderRadius: 10, border: `1.5px solid #0F766E`, background: '#F0FDFA', color: '#0F766E', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Download PDF
                      </a>
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
