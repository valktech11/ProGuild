'use client'
import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { capName, timeAgo, avatarColor, initials } from '@/lib/utils'
import { theme } from '@/lib/theme'

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Residential: { bg: '#EFF6FF', text: '#1D4ED8' },
  Commercial:  { bg: '#F5F3FF', text: '#6D28D9' },
  Repeat:      { bg: '#F0FDF4', text: '#15803D' },
  VIP:         { bg: '#FFFBEB', text: '#B45309' },
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n)
  }

  const [client,  setClient]  = useState<any>(null)
  const [leads,   setLeads]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState({ full_name: '', phone: '', email: '', notes: '', tags: [] as string[] })

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    Promise.all([
      fetch(`/api/clients?pro_id=${session.id}`).then(r => r.json()),
      fetch(`/api/leads?pro_id=${session.id}`).then(r => r.json()),
    ]).then(([clientsData, leadsData]) => {
      const found = (clientsData.clients || []).find((c: any) => c.id === id)
      if (!found) { router.push('/dashboard/clients'); return }
      setClient(found)
      setForm({ full_name: found.full_name, phone: found.phone || '', email: found.email || '', notes: found.notes || '', tags: found.tags || [] })
      setLeads((leadsData.leads || []).filter((l: any) => l.client_id === id))
      setLoading(false)
    })
  }, [session, id, router])

  async function saveEdit() {
    if (!session) return
    setSaving(true)
    const r = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, pro_id: session.id }),
    })
    const d = await r.json()
    setSaving(false)
    if (r.ok) { setClient((prev: any) => ({ ...prev, ...form })); setEditing(false) }
  }

  const t = theme(dk)
  const [avBg, avFg] = client ? avatarColor(client.full_name) : ['#E5E7EB', '#6B7280']
  const lifetimeValue = leads.filter(l => l.lead_status === 'Paid').reduce((s: number, l: any) => s + (l.quoted_amount || 0), 0)

  const STAGE_COLOR: Record<string, string> = {
    New:'#D97706', Contacted:'#2563EB', Quoted:'#7C3AED', Scheduled:'#0F766E', Completed:'#374151', Paid:'#15803D', Lost:'#DC2626'
  }

  if (!session || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: t.pageBg }}>
      <div style={{ width:32, height:32, borderRadius:'50%', border:'2px solid #0F766E', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight:'100vh', padding:'16px 16px 40px' }}>
        <div style={{ maxWidth: 720, margin:'0 auto' }}>

          {/* Breadcrumb */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:20, fontSize:13 }}>
            <Link href="/dashboard/clients" style={{ color: t.textMuted, textDecoration:'none' }}>Clients</Link>
            <span style={{ color: t.textSubtle }}>/</span>
            <span style={{ fontWeight:600, color: t.textPri }}>{client?.full_name}</span>
          </div>

          {/* Profile card */}
          <div style={{ background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:16, padding:'24px', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ width:60, height:60, borderRadius:'50%', background: avBg, color: avFg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, flexShrink:0 }}>
                  {initials(client.full_name)}
                </div>
                <div>
                  <h1 style={{ fontSize:22, fontWeight:800, color: t.textPri, margin:0 }}>{capName(client.full_name)}</h1>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, flexWrap:'wrap' }}>
                    {(client.tags || []).map((tag: string) => {
                      const tc = TAG_COLORS[tag] || { bg: t.cardBgAlt, text: t.textMuted }
                      return <span key={tag} style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, background:tc.bg, color:tc.text }}>{tag}</span>
                    })}
                    <span style={{ fontSize:12, color: t.textSubtle }}>Added {timeAgo(client.created_at)}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setEditing(e => !e)}
                style={{ padding:'8px 16px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background:'transparent', color: t.textMuted, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display:'flex', gap:24, marginTop:20, paddingTop:16, borderTop:`1px solid ${t.divider}`, flexWrap:'wrap' }}>
              {[
                { label:'Jobs', value: leads.length },
                { label:'Lifetime Value', value: lifetimeValue > 0 ? `$${lifetimeValue.toLocaleString()}` : '—' },
                { label:'Last Contact', value: timeAgo(client.last_contact || client.created_at) },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textSubtle, marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontSize:18, fontWeight:800, color: s.label === 'Lifetime Value' && lifetimeValue > 0 ? '#0F766E' : t.textPri }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Edit form */}
            {editing && (
              <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${t.divider}`, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { label:'Full Name', key:'full_name', type:'text', placeholder:'John Smith' },
                  { label:'Phone', key:'phone', type:'tel', placeholder:'(555) 555-5555' },
                  { label:'Email', key:'email', type:'email', placeholder:'john@example.com' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                    <input
                      type={f.type} value={(form as any)[f.key]} placeholder={f.placeholder}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, boxSizing:'border-box' }}
                    />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>Tags</label>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {['Residential','Commercial','Repeat','VIP'].map(tag => (
                      <button key={tag} onClick={() => setForm(p => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter(t => t !== tag) : [...p.tags, tag] }))}
                        style={{ fontSize:12, fontWeight:600, padding:'6px 14px', borderRadius:20, cursor:'pointer', border:`1.5px solid ${form.tags.includes(tag) ? '#0F766E' : t.inputBorder}`, background: form.tags.includes(tag) ? '#0F766E' : 'transparent', color: form.tags.includes(tag) ? 'white' : t.textMuted }}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    rows={3} placeholder="Gate code, preferences, notes..."
                    style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
                </div>
                <button onClick={saveEdit} disabled={saving}
                  style={{ padding:'11px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}

            {/* Contact info (view mode) */}
            {!editing && (
              <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${t.divider}`, display:'flex', flexDirection:'column', gap:8 }}>
                {client.phone && (
                  <a href={`tel:${client.phone}`} style={{ display:'flex', alignItems:'center', gap:8, fontSize:14, color:'#0F766E', textDecoration:'none', fontWeight:600 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
                    {client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} style={{ display:'flex', alignItems:'center', gap:8, fontSize:14, color:'#0F766E', textDecoration:'none', fontWeight:600 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
                    {client.email}
                  </a>
                )}
                {client.notes && (
                  <p style={{ fontSize:13, color: t.textMuted, marginTop:4, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{client.notes}</p>
                )}
              </div>
            )}
          </div>

          {/* Job history */}
          <div style={{ background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:16, overflow:'hidden' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.divider}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h2 style={{ fontSize:15, fontWeight:700, color: t.textPri, margin:0 }}>Job History ({leads.length})</h2>
            </div>
            {leads.length === 0 ? (
              <div style={{ padding:'40px 24px', textAlign:'center' }}>
                <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
                <p style={{ fontSize:14, color: t.textMuted }}>No jobs recorded yet</p>
              </div>
            ) : leads.map((lead, i) => (
              <div key={lead.id}
                onClick={() => router.push(`/dashboard/pipeline/${lead.id}?from=clients`)}
                style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderTop: i > 0 ? `1px solid ${t.divider}` : 'none', cursor:'pointer', background: i % 2 === 1 ? t.tableRowAlt : 'transparent', transition:'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = t.tableRowHover)}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? t.tableRowAlt : 'transparent')}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, color: t.textPri }}>{capName(lead.contact_name)}</div>
                  <div style={{ fontSize:12, color: t.textSubtle, marginTop:2 }}>{timeAgo(lead.created_at)}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  {lead.quoted_amount > 0 && (
                    <span style={{ fontSize:13, fontWeight:700, color:'#0F766E' }}>${lead.quoted_amount.toLocaleString()}</span>
                  )}
                  <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:12, background: STAGE_COLOR[lead.lead_status] + '18', color: STAGE_COLOR[lead.lead_status] || t.textMuted }}>
                    {lead.lead_status === 'Paid' ? 'Job Won' : lead.lead_status}
                  </span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            ))}
          </div>

        </div>
      </div>
    </DashboardShell>
  )
}
