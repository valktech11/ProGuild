'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/theme'
import { timeAgo } from '@/lib/utils'

const REFRIGERANT_TYPES = ['R-22','R-410A','R-32','R-454B','R-407C','Other']

const EMPTY_LOG = {
  refrigerant_type: 'R-410A',
  amount_added_lbs: '',
  amount_recovered_lbs: '',
  cylinder_id: '',
  leak_detected: false,
  technician_cert_number: '',
  notes: '',
}

export default function RefrigerantLogPage() {
  const router = useRouter()
  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => {
    const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n)
  }

  const [logs,    setLogs]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState({ ...EMPTY_LOG })
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    fetch(`/api/hvac/refrigerant-log?pro_id=${session.id}`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session, router])

  async function saveLog() {
    if (!session) return
    setSaving(true); setErr('')
    const r = await fetch('/api/hvac/refrigerant-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: session.id,
        refrigerant_type: form.refrigerant_type,
        amount_added_lbs: form.amount_added_lbs ? parseFloat(form.amount_added_lbs) : null,
        amount_recovered_lbs: form.amount_recovered_lbs ? parseFloat(form.amount_recovered_lbs) : null,
        cylinder_id: form.cylinder_id || null,
        leak_detected: form.leak_detected,
        technician_cert_number: form.technician_cert_number || null,
        notes: form.notes || null,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setErr(d.error || 'Save failed'); return }
    setLogs(prev => [d.log, ...prev])
    setShowAdd(false)
    setForm({ ...EMPTY_LOG })
  }

  async function deleteLog(id: string) {
    if (!session) return
    await fetch('/api/hvac/refrigerant-log', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id, id }) })
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  const t = theme(dk)

  if (!session || loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background: t.pageBg }}>
      <div style={{ width:32, height:32, borderRadius:'50%', border:'2px solid #0F766E', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
    </div>
  )

  const totalAdded    = logs.reduce((s, l) => s + (l.amount_added_lbs || 0), 0)
  const totalRecovered = logs.reduce((s, l) => s + (l.amount_recovered_lbs || 0), 0)
  const leakCount     = logs.filter(l => l.leak_detected).length

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight:'100vh', padding:'16px 16px 40px' }}>
        <div style={{ maxWidth: 720, margin:'0 auto' }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div>
              <h1 style={{ fontSize:22, fontWeight:800, color: t.textPri, margin:0 }}>Refrigerant Log</h1>
              <p style={{ fontSize:13, color: t.textMuted, marginTop:2 }}>EPA compliance tracking for all refrigerant work</p>
            </div>
            <button onClick={() => setShowAdd(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Add Entry
            </button>
          </div>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:20 }}>
            {[
              { label:'Total Added', value:`${totalAdded.toFixed(2)} lbs`, color:'#0F766E' },
              { label:'Total Recovered', value:`${totalRecovered.toFixed(2)} lbs`, color:'#2563EB' },
              { label:'Leak Detected', value: leakCount, color: leakCount > 0 ? '#DC2626' : t.textMuted },
            ].map(s => (
              <div key={s.label} style={{ background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:12, padding:'16px' }}>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textSubtle, marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Log table */}
          <div style={{ background: t.cardBg, border:`1px solid ${t.cardBorder}`, borderRadius:16, overflow:'hidden' }}>
            {logs.length === 0 ? (
              <div style={{ padding:'48px 24px', textAlign:'center' }}>
                <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:15, fontWeight:700, color: t.textPri, marginBottom:6 }}>No entries yet</div>
                <p style={{ fontSize:13, color: t.textMuted, maxWidth:260, margin:'0 auto 16px' }}>Log your refrigerant usage for EPA compliance and job records.</p>
                <button onClick={() => setShowAdd(true)}
                  style={{ padding:'10px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                  Add First Entry
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 60px 40px', gap:8, padding:'10px 16px', borderBottom:`1px solid ${t.divider}`, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textSubtle }}>
                  <span>Refrigerant / Date</span><span style={{ textAlign:'right' }}>Added</span><span style={{ textAlign:'right' }}>Recovered</span><span>Cylinder</span><span>Leak</span><span/>
                </div>
                {logs.map((log, i) => (
                  <div key={log.id} style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 80px 60px 40px', gap:8, padding:'12px 16px', borderTop: i > 0 ? `1px solid ${t.divider}` : 'none', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color: t.textPri }}>{log.refrigerant_type}</div>
                      <div style={{ fontSize:12, color: t.textSubtle }}>{timeAgo(log.created_at)}</div>
                      {log.notes && <div style={{ fontSize:11, color: t.textMuted, marginTop:2 }}>{log.notes}</div>}
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color: t.textPri, textAlign:'right' }}>{log.amount_added_lbs ? `${log.amount_added_lbs} lbs` : '—'}</div>
                    <div style={{ fontSize:13, fontWeight:600, color: t.textPri, textAlign:'right' }}>{log.amount_recovered_lbs ? `${log.amount_recovered_lbs} lbs` : '—'}</div>
                    <div style={{ fontSize:12, color: t.textSubtle }}>{log.cylinder_id || '—'}</div>
                    <div>
                      {log.leak_detected
                        ? <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#FEE2E2', color:'#DC2626' }}>YES</span>
                        : <span style={{ fontSize:11, color: t.textSubtle }}>No</span>}
                    </div>
                    <button onClick={() => deleteLog(log.id)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid #FEE2E2', background:'transparent', color:'#DC2626', fontSize:11, cursor:'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', background: t.cardBg, borderRadius:'20px 20px 0 0', width:'100%', maxWidth:600, maxHeight:'92dvh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px', borderBottom:`1px solid ${t.divider}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div style={{ fontSize:16, fontWeight:800, color: t.textPri }}>Add Refrigerant Entry</div>
              <button onClick={() => setShowAdd(false)} style={{ width:32, height:32, borderRadius:'50%', border:`1px solid ${t.inputBorder}`, background:'transparent', color: t.textMuted, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>Refrigerant Type</label>
                <select value={form.refrigerant_type} onChange={e => setForm(p => ({ ...p, refrigerant_type: e.target.value }))}
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13 }}>
                  {REFRIGERANT_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { label:'Added (lbs)', key:'amount_added_lbs', placeholder:'0.00' },
                  { label:'Recovered (lbs)', key:'amount_recovered_lbs', placeholder:'0.00' },
                  { label:'Cylinder ID', key:'cylinder_id', placeholder:'CYL-001' },
                  { label:'Tech Cert #', key:'technician_cert_number', placeholder:'EPA cert number' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                    <input value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:10, background: form.leak_detected ? '#FEF2F2' : t.cardBgAlt, border:`1.5px solid ${form.leak_detected ? '#FCA5A5' : t.inputBorder}`, cursor:'pointer' }}
                onClick={() => setForm(p => ({ ...p, leak_detected: !p.leak_detected }))}>
                <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${form.leak_detected ? '#DC2626' : t.inputBorder}`, background: form.leak_detected ? '#DC2626' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {form.leak_detected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
                <span style={{ fontSize:13, fontWeight:600, color: form.leak_detected ? '#DC2626' : t.textPri }}>Leak detected — report required by EPA</span>
              </div>

              <div>
                <label style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color: t.textMuted, display:'block', marginBottom:4 }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} placeholder="Job notes, system details…"
                  style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
              </div>

              {err && <div style={{ padding:'10px 14px', borderRadius:10, background:'#FEF2F2', color:'#DC2626', fontSize:13 }}>{err}</div>}
            </div>

            <div style={{ padding:'16px 20px', borderTop:`1px solid ${t.divider}`, flexShrink:0 }}>
              <button onClick={saveLog} disabled={saving}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:14, fontWeight:700, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : '+ Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
