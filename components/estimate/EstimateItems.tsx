'use client'

import { Dispatch, SetStateAction, useState } from 'react'
import { Plus, Pencil, Copy, Trash2, GripVertical } from 'lucide-react'
import { Estimate, EstimateItem } from '@/app/dashboard/estimates/[id]/page'

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function recalc(items: EstimateItem[], tax: number, discount: number) {
  const subtotal   = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const discounted = Math.max(0, subtotal - discount)
  const tax_amount = discounted * (tax / 100)
  return { subtotal, tax_amount, total: discounted + tax_amount }
}

function money(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function EstimateItems({
  estimate, setEstimate, darkMode, onSaveTemplate, onOpenTemplatePicker,
}: {
  estimate: Estimate
  setEstimate: Dispatch<SetStateAction<Estimate | null>>
  darkMode: boolean
  onSaveTemplate?: () => void
  onOpenTemplatePicker?: () => void
}) {
  const dk = darkMode
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [draft,       setDraft]       = useState<Partial<EstimateItem>>({})
  const [showDiscount,  setShowDiscount]  = useState(estimate.discount > 0)
  const [discountType,  setDiscountType]  = useState<'$' | '%'>('$')
  const [discountInput, setDiscountInput] = useState<number>(estimate.discount || 0)

  // ── Design tokens ────────────────────────────────────────────────────────
  const border   = dk ? '#334155' : '#D1D5DB'          // visible borders
  const borderSoft = dk ? '#1e293b' : '#E8E2D9'        // table inner dividers
  const bgCard   = dk ? '#1E293B' : '#ffffff'
  const bgEdit   = dk ? '#1a2e44' : '#F0FDF9'
  const bgInput  = dk ? '#0f172a' : '#ffffff'
  const col      = dk ? '#f1f5f9' : '#111827'          // primary text
  const colBody  = dk ? '#cbd5e1' : '#374151'          // body text / values
  const colMuted = dk ? '#94a3b8' : '#6B7280'          // labels
  const colSub   = dk ? '#64748b' : '#6B7280'          // column headers — same as muted, not #9CA3AF

  // ── Helpers ──────────────────────────────────────────────────────────────
  function startEdit(item: EstimateItem) {
    setDraft({ name: item.name, description: item.description, qty: item.qty, unit_price: item.unit_price })
    setEditingId(item.id)
  }
  function commitEdit(id: string) {
    const updated = estimate.items.map(i => i.id === id ? {
      ...i,
      name:        (draft.name        ?? i.name).trim(),
      description: (draft.description ?? i.description).trim(),
      qty:          draft.qty         ?? i.qty,
      unit_price:   draft.unit_price  ?? i.unit_price,
      amount:      (draft.qty ?? i.qty) * (draft.unit_price ?? i.unit_price),
    } : i)
    setEstimate(prev => prev ? { ...prev, items: updated, ...recalc(updated, prev.tax_rate, prev.discount) } : prev)
    setEditingId(null); setDraft({})
  }
  function cancelEdit() { setEditingId(null); setDraft({}) }

  function addItem() {
    const item: EstimateItem = { id: uid(), name: '', description: '', qty: 1, unit_price: 0, amount: 0 }
    const items = [...estimate.items, item]
    setEstimate(prev => prev ? { ...prev, items, ...recalc(items, prev.tax_rate, prev.discount) } : prev)
    setDraft({ name: '', description: '', qty: 1, unit_price: 0 })
    setEditingId(item.id)
  }
  function duplicate(item: EstimateItem) {
    const items = [...estimate.items, { ...item, id: uid() }]
    setEstimate(prev => prev ? { ...prev, items, ...recalc(items, prev.tax_rate, prev.discount) } : prev)
  }
  function remove(id: string) {
    if (editingId === id) cancelEdit()
    const items = estimate.items.filter(i => i.id !== id)
    setEstimate(prev => prev ? { ...prev, items, ...recalc(items, prev.tax_rate, prev.discount) } : prev)
  }
  function updateDiscount(val: number) {
    setEstimate(prev => prev ? { ...prev, discount: val, ...recalc(prev.items, prev.tax_rate, val) } : prev)
  }
  function updateTaxRate(val: number) {
    setEstimate(prev => prev ? { ...prev, tax_rate: val, ...recalc(prev.items, val, prev.discount) } : prev)
  }

  const hdStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: colSub,
  }
  const inputStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '8px 12px', fontSize: 14, borderRadius: 8,
    border: `1.5px solid ${border}`, background: bgInput,
    color: col, outline: 'none', boxSizing: 'border-box', ...extra,
  })
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase', color: colMuted, marginBottom: 6, display: 'block',
  }

  // Grid: drag | # | item | qty | unit price | amount | actions
  const GRID = '22px 26px 1fr 80px 110px 110px 100px'

  return (
    <div>
      {/* ── Column headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', padding: '0 8px 10px' }}>
        <span /><span />
        <span style={hdStyle}>Item</span>
        <span style={{ ...hdStyle, textAlign: 'center' }}>QTY</span>
        <span style={{ ...hdStyle, textAlign: 'right' }}>Unit Price</span>
        <span style={{ ...hdStyle, textAlign: 'right' }}>Amount</span>
        <span />
      </div>

      {/* ── Table container ── */}
      <div style={{ border: `1.5px solid ${border}`, borderRadius: 12, overflow: 'hidden', background: bgCard }}>

        {estimate.items.length === 0 && (
          <div style={{ padding: '36px 24px', textAlign: 'center', color: colMuted, fontSize: 14 }}>
            No items yet — click <strong style={{ color: '#0F766E' }}>+ Add Item</strong> to get started
          </div>
        )}

        {estimate.items.map((item, idx) => {
          const isEditing = editingId === item.id
          const rowAmount = item.qty * item.unit_price
          const isLast    = idx === estimate.items.length - 1

          return (
            <div key={item.id} style={{ borderBottom: `1px solid ${borderSoft}` }}>
              {/* Display row */}
              <div style={{
                display: 'grid', gridTemplateColumns: GRID, gap: '0 12px',
                alignItems: 'center', padding: '14px 8px',
                background: isEditing ? bgEdit : bgCard,
              }}>
                <GripVertical size={13} style={{ color: colMuted, opacity: 0.4, cursor: 'grab' }} />
                <span style={{ fontSize: 13, color: colMuted, fontWeight: 500 }}>{idx + 1}</span>

                {/* Name + description */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: col, lineHeight: 1.3 }}>
                    {item.name || <span style={{ color: colMuted, fontStyle: 'italic' }}>Unnamed item</span>}
                  </div>
                  {item.description && <div style={{ fontSize: 12, color: colMuted, marginTop: 2 }}>{item.description}</div>}
                </div>

                {/* QTY — bordered box */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 38, height: 32, borderRadius: 7,
                    border: `1.5px solid ${border}`, background: bgInput,
                    fontSize: 14, fontWeight: 500, color: colBody,
                  }}>{item.qty}</div>
                  <div style={{ fontSize: 10, color: colMuted, marginTop: 2 }}>job</div>
                </div>

                {/* Unit price — bordered box (same as QTY) */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end',
                    padding: '4px 10px', borderRadius: 7,
                    border: `1.5px solid ${border}`, background: bgInput,
                    fontSize: 14, fontWeight: 500, color: colBody, minWidth: 80,
                  }}>
                    {item.unit_price > 0 ? money(item.unit_price) : <span style={{ color: colMuted }}>—</span>}
                  </div>
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: col }}>
                  {rowAmount > 0 ? money(rowAmount) : <span style={{ color: colMuted }}>—</span>}
                </div>

                {/* Action buttons — always visible, clear styling */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                  {([
                    { icon: <Pencil size={14} />, action: () => isEditing ? cancelEdit() : startEdit(item), title: 'Edit',
                      bg: isEditing ? '#0F766E' : bgInput, fg: isEditing ? '#fff' : '#374151',
                      hoverBg: '#0F766E', hoverFg: '#fff', bd: isEditing ? '#0F766E' : border },
                    { icon: <Copy size={14} />, action: () => duplicate(item), title: 'Duplicate',
                      bg: bgInput, fg: '#374151', hoverBg: '#0F766E', hoverFg: '#fff', bd: border },
                    { icon: <Trash2 size={14} />, action: () => remove(item.id), title: 'Delete',
                      bg: bgInput, fg: '#374151', hoverBg: '#fee2e2', hoverFg: '#dc2626', bd: border },
                  ] as const).map(({ icon, action, title, bg, fg, hoverBg, hoverFg, bd }) => (
                    <button key={title} onClick={action} title={title}
                      style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${bd}`, borderRadius: 8, background: bg, color: fg, cursor: 'pointer' }}
                      onMouseEnter={e => { const b = e.currentTarget; b.style.background = hoverBg; b.style.color = hoverFg; b.style.borderColor = hoverBg }}
                      onMouseLeave={e => { const b = e.currentTarget; b.style.background = bg; b.style.color = fg; b.style.borderColor = bd }}
                    >{icon}</button>
                  ))}
                </div>
              </div>

              {/* Edit panel */}
              {isEditing && (
                <div style={{ padding: '16px 20px 20px', background: bgEdit, borderTop: `1px solid ${dk ? '#1e3a5f' : '#ccfbf1'}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Item Name</label>
                      <input autoFocus value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                        placeholder="e.g. Interior Wall Painting" style={inputStyle()} onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                      <input value={draft.description ?? ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                        placeholder="e.g. Premium quality paint" style={inputStyle()} onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input type="number" min={1} value={draft.qty ?? 1}
                        onChange={e => setDraft(d => ({ ...d, qty: Math.max(1, Number(e.target.value)) }))}
                        style={inputStyle()} onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Unit Price ($)</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colMuted, fontSize: 14 }}>$</span>
                        <input type="number" min={0} step={0.01} value={draft.unit_price ?? ''} placeholder="0.00"
                          onChange={e => setDraft(d => ({ ...d, unit_price: Number(e.target.value) }))}
                          style={inputStyle({ paddingLeft: 24 })} onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: colMuted }}>
                      Line total: <strong style={{ color: '#0F766E' }}>{money((draft.qty ?? item.qty) * (draft.unit_price ?? item.unit_price))}</strong>
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={cancelEdit}
                        style={{ padding: '7px 16px', fontSize: 13, borderRadius: 8, border: `1.5px solid ${border}`, background: 'transparent', color: colMuted, cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={() => commitEdit(item.id)}
                        style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#0F766E', color: '#fff', cursor: 'pointer' }}>
                        ✓ Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Discount row — with $ / % toggle */}
        {showDiscount && (
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', alignItems: 'center', padding: '10px 8px', borderBottom: `1px solid ${borderSoft}`, background: bgCard }}>
            <span /><span />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, color: colMuted }}>Discount</span>
              {/* $ / % toggle */}
              <div style={{ display: 'flex', border: `1.5px solid ${border}`, borderRadius: 6, overflow: 'hidden' }}>
                {(['$', '%'] as const).map(t => (
                  <button key={t} onClick={() => {
                    setDiscountType(t)
                    const flat = t === '%' ? estimate.subtotal * (discountInput / 100) : discountInput
                    updateDiscount(flat)
                  }}
                    style={{ padding: '2px 7px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: discountType === t ? '#0F766E' : 'transparent',
                      color: discountType === t ? '#fff' : colMuted }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <span />
            <div style={{ position: 'relative' }}>
              <input type="number" min={0} max={discountType === '%' ? 100 : undefined}
                value={discountInput || ''}
                onChange={e => {
                  const v = Number(e.target.value)
                  setDiscountInput(v)
                  const flat = discountType === '%' ? estimate.subtotal * (v / 100) : v
                  updateDiscount(flat)
                }}
                placeholder={discountType === '%' ? '0' : '0.00'}
                style={{ width: '100%', padding: `5px ${discountType === '%' ? '22px' : '8px'} 5px 8px`, fontSize: 13, borderRadius: 7,
                  border: `1.5px solid ${border}`, background: bgInput, color: col, outline: 'none', boxSizing: 'border-box' as const, textAlign: 'right' }} />
              {discountType === '%' && (
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: colMuted, fontSize: 12, pointerEvents: 'none' }}>%</span>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
              {estimate.discount > 0 ? `− ${money(estimate.discount)}` : '—'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowDiscount(false); setDiscountInput(0); updateDiscount(0) }}
                style={{ fontSize: 12, color: colMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                title="Remove discount">✕</button>
            </div>
          </div>
        )}

        {/* Tax row — always visible (auto-filled from state) */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 12px', alignItems: 'center', padding: '10px 8px', borderBottom: `1px solid ${borderSoft}`, background: dk ? '#1a2030' : '#FAFAF9' }}>
          <span /><span />
          <div>
            <span style={{ fontSize: 14, color: colMuted }}>Sales Tax</span>
            {estimate.tax_rate > 0 && (
              <span style={{ fontSize: 11, marginLeft: 8, color: '#d97706', background: '#fef3c7', padding: '1px 7px', borderRadius: 10 }}>
                Base state rate — adjust for your county
              </span>
            )}
          </div>
          <span />
          <div style={{ position: 'relative', textAlign: 'right' }}>
            <input type="number" min={0} max={30} step={0.25} value={estimate.tax_rate || ''}
              onChange={e => updateTaxRate(Number(e.target.value))}
              placeholder="0"
              style={{ width: '100%', padding: '5px 28px 5px 8px', fontSize: 13, borderRadius: 7, border: `1.5px solid ${border}`, background: bgInput, color: col, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }} />
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: colMuted, fontSize: 12, pointerEvents: 'none' }}>%</span>
          </div>
          <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: colBody }}>
            {estimate.tax_amount > 0 ? money(estimate.tax_amount) : '—'}
          </div>
          <span />
        </div>

        {/* + Add Item */}
        <button onClick={addItem}
          style={{ width: '100%', padding: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, fontSize: 14, fontWeight: 500, color: '#0F766E', background: 'transparent', border: 'none',
            borderTop: `1.5px dashed ${dk ? '#1e3a5f' : '#99f6e4'}`, cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = dk ? '#1a2e44' : '#f0fdf9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <Plus size={15} />
          Add Item
        </button>
      </div>

      {/* ── Modifier pills ── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {!showDiscount && (
          <button onClick={() => setShowDiscount(true)}
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: `1px solid ${border}`, background: 'transparent', color: colMuted, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = colMuted }}>
            + Discount
          </button>
        )}
      </div>

    </div>
  )
}
