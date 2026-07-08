'use client'
import { useState, useEffect, useCallback } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { apiFetch } from '@/lib/api-fetch'

interface Item {
  id: string; name: string; description: string; category: string
  unit: string; unit_price: number; sort_order: number
}

const UNITS = ['each','sq','lf','hr','day','lb','bundle','sheet','roll','box']
const CATS  = ['general','material','labor','equipment','permit','other']

export default function PriceBookPage() {
  const { session, loading: authLoading } = useProSession()
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1')
  const toggleDark = () => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }

  const [items,   setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState({ name:'', description:'', category:'general', unit:'each', unit_price:'' })
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState<string|null>(null)

  const bg   = dk ? '#0F172A' : '#F8FAFC'
  const card = dk ? '#1E293B' : '#FFFFFF'
  const bdr  = dk ? '#334155' : '#E2E8F0'
  const tp   = dk ? '#F1F5F9' : '#0A1628'
  const sub  = dk ? '#94A3B8' : '#64748B'
  const TEAL = '#0F766E'

  const load = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch('/api/price-book')
    if (r.ok) { const d = await r.json(); setItems(d.items ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => { if (session) load() }, [session, load])

  async function addItem() {
    if (!form.name || !form.unit_price) { setErr('Name and unit price required'); return }
    setSaving(true); setErr(null)
    const r = await apiFetch('/api/price-book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, unit_price: parseFloat(form.unit_price) }),
    })
    if (r.ok) {
      setForm({ name:'', description:'', category:'general', unit:'each', unit_price:'' })
      await load()
    } else { const d = await r.json(); setErr(d.error ?? 'Save failed') }
    setSaving(false)
  }

  async function deleteItem(id: string) {
    await apiFetch(`/api/price-book/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  if (authLoading) return null

  return (
    <DashboardShell session={session} newLeads={0} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: bg, minHeight: '100vh', padding: '24px 20px 60px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: tp, margin: 0, letterSpacing: '-0.02em' }}>Price Book</h1>
            <p style={{ fontSize: 13.5, color: sub, marginTop: 4 }}>Your products and prices — applied to estimates when you select a line item.</p>
          </div>

          {/* Add form */}
          <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Add Item</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                placeholder="Item name *"
                style={{ gridColumn:'1/-1', padding:'10px 13px', border:`1px solid ${bdr}`, borderRadius:9, fontSize:13.5, background:bg, color:tp, outline:'none' }} />
              <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                placeholder="Description (optional)"
                style={{ gridColumn:'1/-1', padding:'10px 13px', border:`1px solid ${bdr}`, borderRadius:9, fontSize:13.5, background:bg, color:tp, outline:'none' }} />
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                style={{ padding:'10px 13px', border:`1px solid ${bdr}`, borderRadius:9, fontSize:13.5, background:bg, color:tp }}>
                {CATS.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}
                style={{ padding:'10px 13px', border:`1px solid ${bdr}`, borderRadius:9, fontSize:13.5, background:bg, color:tp }}>
                {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
              <input value={form.unit_price} onChange={e=>setForm(f=>({...f,unit_price:e.target.value}))}
                placeholder="Unit price *" type="number" min="0" step="0.01"
                style={{ gridColumn:'1/-1', padding:'10px 13px', border:`1px solid ${bdr}`, borderRadius:9, fontSize:13.5, background:bg, color:tp, outline:'none' }} />
            </div>
            {err && <div style={{ fontSize:12, color:'#DC2626', marginBottom:10 }}>{err}</div>}
            <button onClick={addItem} disabled={saving}
              style={{ background:TEAL, color:'#fff', border:'none', borderRadius:9, padding:'11px 22px',
                fontSize:13.5, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? 'Saving…' : '+ Add to price book'}
            </button>
          </div>

          {/* Item list */}
          <div style={{ background:card, border:`1px solid ${bdr}`, borderRadius:14, overflow:'hidden' }}>
            {loading ? (
              <div style={{ padding:24, textAlign:'center', color:sub, fontSize:13 }}>Loading…</div>
            ) : items.length === 0 ? (
              <div style={{ padding:32, textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
                <div style={{ fontSize:14, fontWeight:700, color:tp, marginBottom:4 }}>No items yet</div>
                <div style={{ fontSize:13, color:sub }}>Add your first product or service above.</div>
              </div>
            ) : items.map((item, i) => (
              <div key={item.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px',
                borderTop: i>0 ? `1px solid ${bdr}` : 'none' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:tp }}>{item.name}</div>
                  {item.description && <div style={{ fontSize:12, color:sub, marginTop:2 }}>{item.description}</div>}
                  <div style={{ display:'flex', gap:8, marginTop:5 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:sub, background:dk?'#0F172A':'#F1F5F9',
                      padding:'2px 8px', borderRadius:4 }}>{item.category}</span>
                    <span style={{ fontSize:11, color:sub }}>per {item.unit}</span>
                  </div>
                </div>
                <div style={{ fontSize:17, fontWeight:800, color:tp }}>
                  ${item.unit_price.toLocaleString('en-US',{minimumFractionDigits:2})}
                </div>
                <button onClick={()=>deleteItem(item.id)}
                  style={{ background:'none', border:`1px solid ${bdr}`, borderRadius:7, cursor:'pointer',
                    color:'#DC2626', fontSize:13, padding:'5px 10px', fontWeight:600 }}>
                  Remove
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>
    </DashboardShell>
  )
}
