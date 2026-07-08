// app/dashboard/settings/price-book/page.tsx
// Price book management — list, add, edit, delete items.
'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-fetch'

interface Item {
  id: string; name: string; description: string; category: string;
  unit: string; unit_price: number; sort_order: number
}

const UNITS = ['each','sq','lf','hr','day','lb','bundle','sheet','roll','box']
const CATS  = ['general','material','labor','equipment','permit','other']

export default function PriceBookPage() {
  const [items, setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]     = useState({ name:'', description:'', category:'general', unit:'each', unit_price:'' })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch('/api/price-book')
    if (r.ok) { const d = await r.json(); setItems(d.items ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addItem() {
    if (!form.name || !form.unit_price) { setErr('Name and unit price required'); return }
    setSaving(true); setErr(null)
    const r = await apiFetch('/api/price-book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, unit_price: parseFloat(form.unit_price) }),
    })
    if (r.ok) { setForm({ name:'', description:'', category:'general', unit:'each', unit_price:'' }); await load() }
    else { const d = await r.json(); setErr(d.error ?? 'Save failed') }
    setSaving(false)
  }

  async function deleteItem(id: string) {
    await apiFetch(`/api/price-book/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const inp = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))
  const T = { teal: '#0F766E', navy: '#0A1628', sub: '#64748B', border: '#E2E8F0' }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 60px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.navy, marginBottom: 4 }}>Price Book</h1>
      <p style={{ fontSize: 13, color: T.sub, marginBottom: 24 }}>Your products and prices. Applied to estimates when you select a line item.</p>

      {/* Add form */}
      <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Add Item</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input value={form.name} onChange={e=>inp('name',e.target.value)} placeholder="Item name *"
            style={{ padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, gridColumn: '1/-1' }} />
          <input value={form.description} onChange={e=>inp('description',e.target.value)} placeholder="Description (optional)"
            style={{ padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, gridColumn: '1/-1' }} />
          <select value={form.category} onChange={e=>inp('category',e.target.value)}
            style={{ padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13 }}>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={form.unit} onChange={e=>inp('unit',e.target.value)}
            style={{ padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13 }}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={form.unit_price} onChange={e=>inp('unit_price',e.target.value)} placeholder="Unit price *" type="number" min="0" step="0.01"
            style={{ padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, gridColumn: '1/-1' }} />
        </div>
        {err && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>{err}</div>}
        <button onClick={addItem} disabled={saving}
          style={{ background: T.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : '+ Add to price book'}
        </button>
      </div>

      {/* Item list */}
      {loading ? <div style={{ color: T.sub, fontSize: 13 }}>Loading…</div> : (
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {items.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: T.sub, fontSize: 13 }}>No items yet. Add your first product or service above.</div>
          ) : items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: T.navy }}>{item.name}</div>
                {item.description && <div style={{ fontSize: 11.5, color: T.sub, marginTop: 1 }}>{item.description}</div>}
                <div style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>{item.category} · per {item.unit}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.navy }}>${item.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <button onClick={() => deleteItem(item.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18, padding: '4px 8px' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
