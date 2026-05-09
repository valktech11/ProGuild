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
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDFA', border: '1.5px solid #14B8A6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ic size={18} color="#0F766E">
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </Ic>
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
                <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 16, marginTop: 0 }}>
                  📍 Property Address
                </h2>
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
                <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 16, marginTop: 0 }}>
                  🏠 Roof Details
                </h2>
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
                <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 16, marginTop: 0 }}>
                  🛡️ Insurance
                </h2>
                <div style={{ display: 'grid', gap: 14 }}>
                  {field('insurance_carrier', 'Insurance Carrier')}
                  {field('insurance_policy_number', 'Policy Number')}
                </div>
              </div>

              {/* Notes Card */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
                <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, marginBottom: 16, marginTop: 0 }}>
                  📝 Notes
                </h2>
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
                <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle, margin: 0 }}>
                  Job History ({leads.length})
                </h2>
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

            {/* ProMeasure & Calculator CTAs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
              <button onClick={() => router.push('/dashboard/roofing/promeasure?address=' + encodeURIComponent(property.address_line1 + (property.city ? ', ' + property.city : '')))}
                style={{ padding: '14px 18px', borderRadius: 14, border: `1.5px solid #0F766E`, background: '#F0FDFA', color: '#0F766E', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>📐</div>
                Measure with ProMeasure
                <div style={{ fontSize: 12, fontWeight: 400, color: '#14B8A6', marginTop: 2 }}>Satellite polygon tool</div>
              </button>
              <button onClick={() => router.push('/dashboard/roofing/calculator' + (property.sq_footage ? '?sq=' + Math.round(property.sq_footage / 100) : ''))}
                style={{ padding: '14px 18px', borderRadius: 14, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textPri, fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>🔢</div>
                Roofing Calculator
                <div style={{ fontSize: 12, fontWeight: 400, color: t.textSubtle, marginTop: 2 }}>Material quantities</div>
              </button>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
