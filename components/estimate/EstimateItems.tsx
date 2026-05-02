'use client'

import { Dispatch, SetStateAction, useState, useRef, useEffect } from 'react'
import { Plus, Pencil, Copy, Trash2, GripVertical, BookOpen, Save } from 'lucide-react'
import { Estimate, EstimateItem } from '@/app/dashboard/estimates/[id]/page'

function uid() { return Math.random().toString(36).slice(2, 9) }

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
  // Which row is open for editing (id or null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Draft values while editing
  const [draft, setDraft] = useState<Partial<EstimateItem>>({})

  const border  = dk ? '#334155' : '#E8E2D9'
  const bgCard  = dk ? '#1E293B' : '#ffffff'
  const bgPage  = dk ? '#0A1628' : '#F5F4F0'
  const bgEdit  = dk ? '#1a2e44' : '#F0FDF9'
  const col     = dk ? '#f1f5f9' : '#111827'
  const colMuted= dk ? '#94a3b8' : '#6B7280'
  const colSub  = dk ? '#64748b' : '#9CA3AF'

  function startEdit(item: EstimateItem) {
    setDraft({ name: item.name, description: item.description, qty: item.qty, unit_price: item.unit_price })
    setEditingId(item.id)
  }

  function commitEdit(id: string) {
    const updated = estimate.items.map(i =>
      i.id === id ? {
        ...i,
        name:        (draft.name        ?? i.name).trim(),
        description: (draft.description ?? i.description).trim(),
        qty:          draft.qty         ?? i.qty,
        unit_price:   draft.unit_price  ?? i.unit_price,
        amount:      (draft.qty ?? i.qty) * (draft.unit_price ?? i.unit_price),
      } : i
    )
    setEstimate(prev => prev ? { ...prev, items: updated, ...recalc(updated, prev.tax_rate, prev.discount) } : prev)
    setEditingId(null)
    setDraft({})
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
    const dup   = { ...item, id: uid() }
    const items = [...estimate.items, dup]
    setEstimate(prev => prev ? { ...prev, items, ...recalc(items, prev.tax_rate, prev.discount) } : prev)
  }

  function remove(id: string) {
    if (editingId === id) cancelEdit()
    const items = estimate.items.filter(i => i.id !== id)
    setEstimate(prev => prev ? { ...prev, items, ...recalc(items, prev.tax_rate, prev.discount) } : prev)
  }

  const hdStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: colSub, padding: '0 0 10px 0',
  }

  const inputStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '8px 12px', fontSize: 14, borderRadius: 8,
    border: `1px solid ${border}`, background: dk ? '#0f172a' : '#fff',
    color: col, outline: 'none', boxSizing: 'border-box', ...extra,
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase', color: colMuted, marginBottom: 5, display: 'block',
  }

  return (
    <div>
      {/* ── Column headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '24px 28px 1fr 80px 110px 110px 96px', gap: '0 12px', padding: '0 8px 8px' }}>
        <span /><span />
        <span style={hdStyle}>Item</span>
        <span style={{ ...hdStyle, textAlign: 'center' }}>QTY</span>
        <span style={{ ...hdStyle, textAlign: 'right' }}>Unit Price</span>
        <span style={{ ...hdStyle, textAlign: 'right' }}>Amount</span>
        <span />
      </div>

      {/* ── Rows ── */}
      <div style={{ border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', background: bgCard }}>
        {estimate.items.length === 0 && (
          <div style={{ padding: '32px 24px', textAlign: 'center', color: colMuted, fontSize: 14 }}>
            No items yet — click <strong>+ Add Item</strong> to get started
          </div>
        )}

        {estimate.items.map((item, idx) => {
          const isEditing = editingId === item.id
          const rowAmount = item.qty * item.unit_price

          return (
            <div key={item.id} style={{ borderBottom: idx < estimate.items.length - 1 || isEditing ? `1px solid ${border}` : 'none' }}>

              {/* ── Display row ── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 28px 1fr 80px 110px 110px 96px',
                  gap: '0 12px',
                  alignItems: 'center',
                  padding: '14px 8px',
                  background: isEditing ? bgEdit : bgCard,
                  cursor: 'default',
                }}
              >
                {/* Drag */}
                <GripVertical size={13} style={{ color: colSub, opacity: 0.5 }} />

                {/* # */}
                <span style={{ fontSize: 13, color: colSub, fontWeight: 500 }}>{idx + 1}</span>

                {/* Name + description */}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: col, lineHeight: 1.3 }}>
                    {item.name || <span style={{ color: colSub, fontStyle: 'italic' }}>Unnamed item</span>}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: 12, color: colMuted, marginTop: 2 }}>{item.description}</div>
                  )}
                </div>

                {/* QTY box */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 32, borderRadius: 7,
                    border: `1px solid ${border}`, background: dk ? '#0f172a' : '#fff',
                    fontSize: 14, fontWeight: 500, color: col,
                  }}>
                    {item.qty}
                  </div>
                  <div style={{ fontSize: 10, color: colSub, marginTop: 2 }}>job</div>
                </div>

                {/* Unit price */}
                <div style={{ textAlign: 'right', fontSize: 14, color: colMuted }}>
                  {item.unit_price > 0 ? money(item.unit_price) : <span style={{ color: colSub }}>—</span>}
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: col }}>
                  {rowAmount > 0 ? money(rowAmount) : <span style={{ color: colSub }}>—</span>}
                </div>

                {/* Action buttons — always visible */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  {[
                    { icon: <Pencil size={14} />, action: () => isEditing ? cancelEdit() : startEdit(item), title: 'Edit',      bg: isEditing ? '#0F766E' : 'transparent', fg: isEditing ? '#fff' : '#374151', hoverBg: '#0F766E', hoverFg: '#fff' },
                    { icon: <Copy size={14} />,   action: () => duplicate(item),  title: 'Duplicate', bg: 'transparent', fg: '#374151', hoverBg: '#0F766E', hoverFg: '#fff' },
                    { icon: <Trash2 size={14} />, action: () => remove(item.id),  title: 'Delete',    bg: 'transparent', fg: '#374151', hoverBg: '#fee2e2', hoverFg: '#dc2626' },
                  ].map(({ icon, action, title, bg, fg, hoverBg, hoverFg }) => (
                    <button key={title} onClick={action} title={title}
                      style={{
                        width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${border}`, borderRadius: 8,
                        background: bg, color: fg, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = hoverBg; (e.currentTarget as HTMLButtonElement).style.color = hoverFg; (e.currentTarget as HTMLButtonElement).style.borderColor = hoverBg }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = bg; (e.currentTarget as HTMLButtonElement).style.color = fg; (e.currentTarget as HTMLButtonElement).style.borderColor = border }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Edit panel — slides open below the row ── */}
              {isEditing && (
                <div style={{ padding: '16px 20px 20px', background: bgEdit, borderTop: `1px solid ${dk ? '#1e3a5f' : '#ccfbf1'}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Item Name</label>
                      <input
                        autoFocus
                        value={draft.name ?? ''}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                        placeholder="e.g. Interior Wall Painting"
                        style={inputStyle()}
                        onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                      <input
                        value={draft.description ?? ''}
                        onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                        placeholder="e.g. Premium quality paint"
                        style={inputStyle()}
                        onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input
                        type="number" min={1}
                        value={draft.qty ?? 1}
                        onChange={e => setDraft(d => ({ ...d, qty: Math.max(1, Number(e.target.value)) }))}
                        style={inputStyle()}
                        onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Unit Price</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colMuted, fontSize: 14 }}>$</span>
                        <input
                          type="number" min={0} step={0.01}
                          value={draft.unit_price ?? ''}
                          placeholder="0.00"
                          onChange={e => setDraft(d => ({ ...d, unit_price: Number(e.target.value) }))}
                          style={inputStyle({ paddingLeft: 24 })}
                          onKeyDown={e => e.key === 'Enter' && commitEdit(item.id)}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: colMuted }}>
                      Line total: <strong style={{ color: col }}>
                        {money((draft.qty ?? item.qty) * (draft.unit_price ?? item.unit_price))}
                      </strong>
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={cancelEdit}
                        style={{ padding: '7px 16px', fontSize: 13, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: colMuted, cursor: 'pointer' }}>
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

        {/* + Add Item — full-width dashed button */}
        <button onClick={addItem}
          style={{
            width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, fontSize: 14, fontWeight: 500, color: '#0F766E',
            background: 'transparent', border: 'none',
            borderTop: estimate.items.length > 0 ? `1.5px dashed ${dk ? '#1e3a5f' : '#99f6e4'}` : 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = dk ? '#1a2e44' : '#f0fdf9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Plus size={15} />
          Add Item
        </button>
      </div>

      {/* ── Save time with templates nudge ── */}
      <div style={{
        marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderRadius: 12, border: `1px solid ${border}`, background: bgCard,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: dk ? '#0f172a' : '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={17} color="#0F766E" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: col }}>Save time with templates</div>
            <div style={{ fontSize: 12, color: colMuted, marginTop: 2 }}>Create reusable templates for your common jobs and send estimates in seconds.</div>
          </div>
        </div>
        <button onClick={onOpenTemplatePicker}
          style={{ flexShrink: 0, marginLeft: 16, padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: col, cursor: 'pointer', whiteSpace: 'nowrap' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#0F766E'; (e.currentTarget as HTMLButtonElement).style.color = '#0F766E' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = border; (e.currentTarget as HTMLButtonElement).style.color = col }}
        >
          Manage Templates
        </button>
      </div>
    </div>
  )
}
