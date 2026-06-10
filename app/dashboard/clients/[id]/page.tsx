'use client'
import { use, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { capName, timeAgo, avatarColor, initials } from '@/lib/utils'
import { theme } from '@/lib/theme'
import { getTradeConfig, isHVAC, getTradeLabels, getStageAnchors } from '@/lib/trades/_registry'

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Residential: { bg: '#EFF6FF', text: '#1D4ED8' },
  Commercial:  { bg: '#F5F3FF', text: '#6D28D9' },
  Repeat:      { bg: '#F0FDF4', text: '#15803D' },
  VIP:         { bg: '#FFFBEB', text: '#B45309' },
}

const EQUIPMENT_TYPES = ['AC_Unit','Furnace','Heat_Pump','Air_Handler','Mini_Split','Boiler','Other']
const EQUIPMENT_LABELS: Record<string, string> = {
  AC_Unit:'AC Unit', Furnace:'Furnace', Heat_Pump:'Heat Pump', Air_Handler:'Air Handler',
  Mini_Split:'Mini Split', Boiler:'Boiler', Other:'Other',
}
const REFRIGERANT_TYPES = ['R-22','R-410A','R-32','R-454B','R-407C','Other']
const EQUIP_ICONS: Record<string, string> = {
  AC_Unit:'❄️', Furnace:'🔥', Heat_Pump:'♻️', Air_Handler:'💨', Mini_Split:'🌡️', Boiler:'⚙️', Other:'🔧',
}

const EMPTY_EQUIP = {
  equipment_type: 'AC_Unit', brand: '', model_number: '', serial_number: '',
  installation_date: '', warranty_expiry: '', filter_size: '', refrigerant_type: '',
  last_service_date: '', next_service_date: '', notes: '',
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n)
  }

  const [client,    setClient]    = useState<any>(null)
  const [leads,     setLeads]     = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [activeTab, setActiveTab] = useState<'jobs'|'equipment'>('jobs')
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', notes: '', tags: [] as string[] })

  const [equipModal,    setEquipModal]    = useState(false)
  const [editingEquip,  setEditingEquip]  = useState<any>(null)
  const [equipForm,     setEquipForm]     = useState<typeof EMPTY_EQUIP>({ ...EMPTY_EQUIP })
  const [equipSaving,   setEquipSaving]   = useState(false)
  const [equipErr,      setEquipErr]      = useState('')
  const [deletingEquip, setDeletingEquip] = useState<string|null>(null)

  const hvac = isHVAC(getTradeConfig(session?.trade_slug))

  const loadEquipment = useCallback(async () => {
    if (!session || !hvac) return
    const r = await fetch(`/api/hvac/equipment?pro_id=${session.id}&client_id=${id}`)
    const d = await r.json()
    setEquipment(d.equipment || [])
  }, [session, id, hvac])

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
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
    loadEquipment()
  }, [session, id, router, loadEquipment])

  async function saveEdit() {
    if (!session) return
    setSaving(true)
    const r = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, pro_id: session.id }),
    })
    setSaving(false)
    if (r.ok) { setClient((prev: any) => ({ ...prev, ...form })); setEditing(false) }
  }

  function openNewEquip() {
    setEditingEquip(null)
    setEquipForm({ ...EMPTY_EQUIP })
    setEquipErr('')
    setEquipModal(true)
  }

  function openEditEquip(eq: any) {
    setEditingEquip(eq)
    setEquipForm({
      equipment_type: eq.equipment_type || 'AC_Unit',
      brand: eq.brand || '', model_number: eq.model_number || '', serial_number: eq.serial_number || '',
      installation_date: eq.installation_date || '', warranty_expiry: eq.warranty_expiry || '',
      filter_size: eq.filter_size || '', refrigerant_type: eq.refrigerant_type || '',
      last_service_date: eq.last_service_date || '', next_service_date: eq.next_service_date || '',
      notes: eq.notes || '',
    })
    setEquipErr('')
    setEquipModal(true)
  }

  async function saveEquipment() {
    if (!session) return
    setEquipSaving(true)
    setEquipErr('')
    const url = editingEquip ? `/api/hvac/equipment/${editingEquip.id}` : '/api/hvac/equipment'
    const method = editingEquip ? 'PATCH' : 'POST'
    const body = editingEquip
      ? { pro_id: session.id, ...equipForm }
      : { pro_id: session.id, client_id: id, ...equipForm }
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json()
    setEquipSaving(false)
    if (!r.ok) { setEquipErr(d.error || 'Save failed'); return }
    setEquipModal(false)
    loadEquipment()
  }

  async function deleteEquipment(eqId: string) {
    if (!session) return
    setDeletingEquip(eqId)
    await fetch(`/api/hvac/equipment/${eqId}?pro_id=${session.id}`, { method: 'DELETE' })
    setDeletingEquip(null)
    loadEquipment()
  }

  const t = theme(dk)
  const [avBg, avFg] = client ? avatarColor(client.full_name) : ['#E5E7EB', '#6B7280']
  const clientAnchors  = getStageAnchors(session?.trade_slug)
  const lifetimeValue  = leads.filter((l: any) => l.lead_status === clientAnchors.won || l.lead_status === 'Paid').reduce((s: number, l: any) => s + (l.quoted_amount || 0), 0)

  const STAGE_COLOR: Record<string, string> = {
    New:'#D97706', Contacted:'#2563EB', Quoted:'#7C3AED', Scheduled:'#0F766E', Completed:'#374151', Paid:'#15803D', Lost:'#DC2626'
  }

  if (!session || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: t.pageBg }}>
      <div style={{ width:32, height:32, borderRadius:'50%', border:'2px solid #0F766E', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
    </div>
  )
  if (!client) return null

  const tabs = hvac
    ? [{ key:'jobs', label:`Job History (${leads.length})` }, { key:'equipment', label:`Equipment (${equipment.length})` }]
    : [{ key:'jobs', label:`Job History (${leads.length})` }]

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight:'100vh', padding:'16px 16px 40px' }}>
        <div style={{ maxWidth: 720, margin:'0 auto' }}>

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

            <div style={{ display:'flex', gap:24, marginTop:20, paddingTop:16, borderTop:`1px solid ${t.divider}`, flexWrap:'wrap' }}>
              {[
                { label: getTradeLabels(session?.trade_slug).pipeline, value: leads.length },
                { label:'Lifetime Value', value: lifetimeValue > 0 ? `$${lifetimeValue.toLocaleString()}` : '—' },
                { label:'Last Contact', value: timeAgo(client.last_contact || client.created_at) },
                ...(hvac ? [{ label:'Equipment', value: equipment.length }] : []),
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textSubtle, marginBottom:2 }}>{s.label}</div>
                  <div style={{ fontSize:18, fontWeight:800, color: s.label === 'Lifetime Value' && lifetimeValue > 0 ? '#0F766E' : t.textPri }}>{s.value}</div>
                </div>
              ))}
            </div>

            {editing && (
              <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${t.divider}`, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  { label:'Full Name', key:'full_name', type:'text', placeholder:'John Smith' },
                  { label:'Phone', key:'phone', type:'tel', placeholder:'(555) 555-5555' },
                  { label:'Email', key:'email', type:'email', placeholder:'john@example.com' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                    <input type={f.type} value={(form as any)[f.key]} placeholder={f.placeholder}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, boxSizing:'border-box' }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>Tags</label>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {['Residential','Commercial','Repeat','VIP'].map(tag => (
                      <button key={tag} onClick={() => setForm(p => ({ ...p, tags: p.tags.includes(tag) ? p.tags.filter(t2 => t2 !== tag) : [...p.tags, tag] }))}
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

          {/* Tabs */}
          <div style={{ background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:16, overflow:'hidden' }}>
            <div style={{ display:'flex', borderBottom:`1px solid ${t.divider}` }}>
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as 'jobs'|'equipment')}
                  style={{ flex:1, padding:'14px 16px', fontSize:13, fontWeight:700, border:'none', background:'transparent', cursor:'pointer', color: activeTab === tab.key ? '#0F766E' : t.textMuted, borderBottom: activeTab === tab.key ? '2px solid #0F766E' : '2px solid transparent', transition:'all 0.15s' }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'jobs' && (
              leads.length === 0 ? (
                <div style={{ padding:'40px 24px', textAlign:'center' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>📋</div>
                  <p style={{ fontSize:14, color: t.textMuted }}>No jobs recorded yet</p>
                </div>
              ) : leads.map((lead: any, i: number) => (
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
                      {lead.lead_status === clientAnchors.won || lead.lead_status === 'Paid' ? getTradeLabels(session?.trade_slug).wonStage : lead.lead_status}
                    </span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))
            )}

            {activeTab === 'equipment' && hvac && (
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom: equipment.length > 0 ? `1px solid ${t.divider}` : 'none' }}>
                  <span style={{ fontSize:13, color: t.textMuted }}>{equipment.length === 0 ? 'No equipment on record' : `${equipment.length} unit${equipment.length !== 1 ? 's' : ''} on record`}</span>
                  <button onClick={openNewEquip}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                    Add Equipment
                  </button>
                </div>

                {equipment.length === 0 ? (
                  <div style={{ padding:'40px 24px', textAlign:'center' }}>
                    <div style={{ fontSize:40, marginBottom:12 }}>❄️</div>
                    <div style={{ fontSize:15, fontWeight:700, color: t.textPri, marginBottom:6 }}>No equipment recorded</div>
                    <p style={{ fontSize:13, color: t.textMuted, maxWidth:280, margin:'0 auto 16px' }}>Add their AC unit, furnace, or heat pump to track service history and maintenance dates.</p>
                    <button onClick={openNewEquip}
                      style={{ padding:'10px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                      Add First Unit
                    </button>
                  </div>
                ) : equipment.map((eq: any, i: number) => {
                  const nextService = eq.next_service_date ? new Date(eq.next_service_date) : null
                  const today = new Date()
                  const daysUntil = nextService ? Math.ceil((nextService.getTime() - today.getTime()) / (1000*60*60*24)) : null
                  const overdue = daysUntil !== null && daysUntil < 0
                  const dueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 30
                  return (
                    <div key={eq.id} style={{ borderTop: i > 0 ? `1px solid ${t.divider}` : 'none', padding:'16px 20px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:12, flex:1, minWidth:0 }}>
                          <div style={{ width:40, height:40, borderRadius:10, background: dk ? 'rgba(15,118,110,0.15)' : '#F0FDFA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                            {EQUIP_ICONS[eq.equipment_type] || '🔧'}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <span style={{ fontSize:15, fontWeight:700, color: t.textPri }}>{EQUIPMENT_LABELS[eq.equipment_type] || eq.equipment_type}</span>
                              {eq.brand && <span style={{ fontSize:12, color: t.textMuted }}>{eq.brand}</span>}
                              {overdue && <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#FEE2E2', color:'#DC2626' }}>⚠ Service Overdue</span>}
                              {dueSoon && !overdue && <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#FEF3C7', color:'#B45309' }}>Service due in {daysUntil}d</span>}
                            </div>
                            <div style={{ display:'flex', gap:16, marginTop:4, flexWrap:'wrap' }}>
                              {eq.model_number && <span style={{ fontSize:12, color: t.textSubtle }}>Model: {eq.model_number}</span>}
                              {eq.serial_number && <span style={{ fontSize:12, color: t.textSubtle }}>S/N: {eq.serial_number}</span>}
                              {eq.filter_size && <span style={{ fontSize:12, color: t.textSubtle }}>Filter: {eq.filter_size}</span>}
                              {eq.refrigerant_type && <span style={{ fontSize:12, color: t.textSubtle }}>Ref: {eq.refrigerant_type}</span>}
                            </div>
                            <div style={{ display:'flex', gap:16, marginTop:4, flexWrap:'wrap' }}>
                              {eq.installation_date && <span style={{ fontSize:12, color: t.textSubtle }}>Installed: {eq.installation_date}</span>}
                              {eq.last_service_date && <span style={{ fontSize:12, color: t.textSubtle }}>Last service: {eq.last_service_date}</span>}
                              {eq.next_service_date && <span style={{ fontSize:12, fontWeight:600, color: overdue ? '#DC2626' : dueSoon ? '#B45309' : t.textSubtle }}>Next: {eq.next_service_date}</span>}
                            </div>
                            {eq.notes && <p style={{ fontSize:12, color: t.textMuted, marginTop:4, lineHeight:1.5 }}>{eq.notes}</p>}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <button onClick={() => openEditEquip(eq)}
                            style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${t.inputBorder}`, background:'transparent', color: t.textMuted, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                            Edit
                          </button>
                          <button onClick={() => deleteEquipment(eq.id)} disabled={deletingEquip === eq.id}
                            style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #FEE2E2', background:'transparent', color:'#DC2626', fontSize:12, fontWeight:600, cursor:'pointer', opacity: deletingEquip === eq.id ? 0.5 : 1 }}>
                            {deletingEquip === eq.id ? '…' : '✕'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Equipment modal */}
      {equipModal && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setEquipModal(false) }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', background: t.cardBg, borderRadius:'20px 20px 0 0', width:'100%', maxWidth:600, maxHeight:'92dvh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.divider}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color: t.textPri }}>{editingEquip ? 'Edit Equipment' : 'Add Equipment'}</div>
                <div style={{ fontSize:12, color: t.textMuted, marginTop:2 }}>{capName(client.full_name)}</div>
              </div>
              <button onClick={() => setEquipModal(false)} style={{ width:32, height:32, borderRadius:'50%', border:`1px solid ${t.inputBorder}`, background:'transparent', color: t.textMuted, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' as any, padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:8 }}>Equipment Type</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8 }}>
                  {EQUIPMENT_TYPES.map(type => (
                    <button key={type} onClick={() => setEquipForm(p => ({ ...p, equipment_type: type }))}
                      style={{ padding:'10px 6px', borderRadius:10, border:`1.5px solid ${equipForm.equipment_type === type ? '#0F766E' : t.inputBorder}`, background: equipForm.equipment_type === type ? (dk ? 'rgba(15,118,110,0.2)' : '#F0FDFA') : 'transparent', cursor:'pointer', textAlign:'center' }}>
                      <div style={{ fontSize:20, marginBottom:2 }}>{EQUIP_ICONS[type]}</div>
                      <div style={{ fontSize:10, fontWeight:600, color: equipForm.equipment_type === type ? '#0F766E' : t.textMuted }}>{EQUIPMENT_LABELS[type]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { label:'Brand', key:'brand', placeholder:'Carrier, Lennox, Trane…' },
                  { label:'Model Number', key:'model_number', placeholder:'24ACC636A003' },
                  { label:'Serial Number', key:'serial_number', placeholder:'4507X12345' },
                  { label:'Filter Size', key:'filter_size', placeholder:'16x25x1' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                    <input value={(equipForm as any)[f.key]} onChange={e => setEquipForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>

              <div>
                <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>Refrigerant Type</label>
                <select value={equipForm.refrigerant_type} onChange={e => setEquipForm(p => ({ ...p, refrigerant_type: e.target.value }))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13 }}>
                  <option value="">— Select —</option>
                  {REFRIGERANT_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { label:'Installation Date', key:'installation_date' },
                  { label:'Warranty Expiry', key:'warranty_expiry' },
                  { label:'Last Service Date', key:'last_service_date' },
                  { label:'Next Service Date', key:'next_service_date' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                    <input type="date" value={(equipForm as any)[f.key]} onChange={e => setEquipForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>

              <div>
                <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>Notes</label>
                <textarea value={equipForm.notes} onChange={e => setEquipForm(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Any additional details…"
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
              </div>

              {equipErr && <div style={{ padding:'10px 14px', borderRadius:10, background:'#FEF2F2', color:'#DC2626', fontSize:13 }}>{equipErr}</div>}

              {equipForm.next_service_date && (
                <div style={{ padding:'10px 14px', borderRadius:10, background: dk ? 'rgba(15,118,110,0.1)' : '#F0FDFA', border:`1px solid ${dk ? 'rgba(15,118,110,0.3)' : '#99F6E4'}`, fontSize:12, color:'#0F766E' }}>
                  💡 A maintenance reminder will be auto-created for {equipForm.next_service_date}
                </div>
              )}
            </div>

            <div style={{ padding:'16px 20px', borderTop:`1px solid ${t.divider}`, flexShrink:0 }}>
              <button onClick={saveEquipment} disabled={equipSaving || !equipForm.equipment_type}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer', opacity: equipSaving ? 0.7 : 1 }}>
                {equipSaving ? 'Saving…' : editingEquip ? 'Save Changes' : '+ Save Equipment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
