'use client'

import { Dispatch, SetStateAction, useState } from 'react'
import { Plus, Copy, Trash2, GripVertical, BookOpen, Save, X } from 'lucide-react'
import { Estimate, EstimateItem } from '@/app/dashboard/estimates/[id]/page'

function generateId() { return Math.random().toString(36).slice(2, 10) }

function recalcTotals(items: EstimateItem[], taxRate: number, discount: number) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const discounted = Math.max(0, subtotal - discount)
  const tax_amount = discounted * (taxRate / 100)
  return { subtotal, tax_amount, total: discounted + tax_amount }
}

type Template = { id: string; name: string; items: EstimateItem[] }

export default function EstimateItems({
  estimate, setEstimate, darkMode,
}: {
  estimate: Estimate
  setEstimate: Dispatch<SetStateAction<Estimate | null>>
  darkMode: boolean
}) {
  const dk = darkMode
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showSaveTemplate,   setShowSaveTemplate]   = useState(false)
  const [templateName,       setTemplateName]       = useState('')
  const [templates,          setTemplates]          = useState<Template[]>([])
  const [loadingTpl,         setLoadingTpl]         = useState(false)
  const [savingTpl,          setSavingTpl]          = useState(false)
  const [showDiscount,       setShowDiscount]       = useState(estimate.discount > 0)
  const [showTax,            setShowTax]            = useState(estimate.tax_rate > 0)

  const muted    = dk ? 'text-slate-400'   : 'text-[#9CA3AF]'
  const textMain = dk ? 'text-white'       : 'text-gray-900'
  const divider  = dk ? 'border-[#334155]' : 'border-[#E8E2D9]'
  const rowHover = dk ? 'hover:bg-[#0F172A]' : 'hover:bg-[#FAFAF8]'
  const pillBg   = dk ? '#1e3a5f' : '#F0F0EC'

  const updateItem = (id: string, field: keyof EstimateItem, raw: string | number) => {
    const value = (field === 'qty' || field === 'unit_price') ? Number(raw) : raw
    const updated = estimate.items.map(i =>
      i.id === id ? {
        ...i, [field]: value,
        amount: field === 'qty'
          ? (value as number) * i.unit_price
          : field === 'unit_price' ? i.qty * (value as number) : i.amount,
      } : i
    )
    const t = recalcTotals(updated, estimate.tax_rate, estimate.discount)
    setEstimate(prev => prev ? { ...prev, items: updated, ...t } : prev)
  }

  const addItem = () => {
    const items = [...estimate.items, { id: generateId(), name: '', description: '', qty: 1, unit_price: 0, amount: 0 }]
    setEstimate(prev => prev ? { ...prev, items, ...recalcTotals(items, prev.tax_rate, prev.discount) } : prev)
  }

  const duplicateItem = (item: EstimateItem) => {
    const items = [...estimate.items, { ...item, id: generateId() }]
    setEstimate(prev => prev ? { ...prev, items, ...recalcTotals(items, prev.tax_rate, prev.discount) } : prev)
  }

  const deleteItem = (id: string) => {
    const items = estimate.items.filter(i => i.id !== id)
    setEstimate(prev => prev ? { ...prev, items, ...recalcTotals(items, prev.tax_rate, prev.discount) } : prev)
  }

  const updateDiscount = (val: number) => {
    const t = recalcTotals(estimate.items, estimate.tax_rate, val)
    setEstimate(prev => prev ? { ...prev, discount: val, ...t } : prev)
  }

  const updateTaxRate = (val: number) => {
    const t = recalcTotals(estimate.items, val, estimate.discount)
    setEstimate(prev => prev ? { ...prev, tax_rate: val, ...t } : prev)
  }

  const openTemplatePicker = async () => {
    setShowTemplatePicker(true)
    setLoadingTpl(true)
    try {
      const s = JSON.parse(sessionStorage.getItem('pg_pro') || '{}')
      const d = await fetch(`/api/estimate-templates?pro_id=${s.id}`).then(r => r.json())
      setTemplates(d.templates || [])
    } catch { setTemplates([]) }
    finally { setLoadingTpl(false) }
  }

  const applyTemplate = (tpl: Template) => {
    const newItems = tpl.items.map(i => ({ ...i, id: generateId() }))
    const items = [...estimate.items, ...newItems]
    setEstimate(prev => prev ? { ...prev, items, ...recalcTotals(items, prev.tax_rate, prev.discount) } : prev)
    setShowTemplatePicker(false)
  }

  const saveTemplate = async () => {
    if (!templateName.trim() || estimate.items.length === 0) return
    setSavingTpl(true)
    try {
      const s = JSON.parse(sessionStorage.getItem('pg_pro') || '{}')
      await fetch('/api/estimate-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: s.id, name: templateName.trim(), items: estimate.items }),
      })
      setShowSaveTemplate(false)
      setTemplateName('')
    } catch { /* silent */ }
    finally { setSavingTpl(false) }
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  return (
    <div>
      {/* Column headers */}
      <div className={`grid grid-cols-[18px_24px_1fr_68px_100px_84px_48px] gap-x-3 px-3 pb-2 text-[10.5px] font-semibold tracking-widest uppercase ${muted}`}>
        <span /><span>#</span>
        <span>Item / Description</span>
        <span className="text-right">QTY</span>
        <span className="text-right">Unit Price</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      {/* Item rows — clean table style, no box border */}
      <div>
        {estimate.items.map((item, idx) => (
          <div key={item.id}
            className={`grid grid-cols-[18px_24px_1fr_68px_100px_84px_48px] gap-x-3 items-center px-3 py-2.5 border-b ${divider} ${rowHover} transition-colors group`}>
            <span className={`cursor-grab opacity-0 group-hover:opacity-100 transition-opacity ${muted}`}>
              <GripVertical size={12} />
            </span>
            <span className={`text-[11px] font-medium ${muted}`}>{idx + 1}</span>

            {/* Name + description — transparent, no ring */}
            <div className="min-w-0">
              <input
                value={item.name}
                onChange={e => updateItem(item.id, 'name', e.target.value)}
                placeholder="Item name"
                className={`w-full text-sm font-semibold ${textMain} placeholder:text-gray-300 focus:placeholder:text-transparent`}
              />
              <input
                value={item.description}
                onChange={e => updateItem(item.id, 'description', e.target.value)}
                placeholder="Add description"
                className={`w-full text-xs mt-0.5 ${muted} placeholder:text-gray-300 focus:placeholder:text-transparent`}
              />
            </div>

            {/* QTY — pill bg */}
            <input type="number" min={0}
              value={item.qty || ''}
              onChange={e => updateItem(item.id, 'qty', e.target.value)}
              className="est-pill text-center"
              style={{ background: pillBg, color: dk ? '#e2e8f0' : '#111827' }}
            />

            {/* Unit Price — pill bg */}
            <div className="relative">
              <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none ${muted}`}>$</span>
              <input type="number" min={0}
                value={item.unit_price || ''}
                onChange={e => updateItem(item.id, 'unit_price', e.target.value)}
                className="est-pill pl-4"
                style={{ background: pillBg, color: dk ? '#e2e8f0' : '#111827' }}
              />
            </div>

            {/* Amount — calculated */}
            <span className={`text-sm font-semibold text-right ${textMain}`}>
              {fmt(item.qty * item.unit_price)}
            </span>

            {/* Row actions */}
            <div className={`flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${muted}`}>
              <button onClick={() => duplicateItem(item)} className="p-1 rounded hover:text-[#0F766E] transition-colors" title="Duplicate">
                <Copy size={11} />
              </button>
              <button onClick={() => deleteItem(item.id)} className="p-1 rounded hover:text-red-500 transition-colors" title="Delete">
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}

        {/* Discount row */}
        {showDiscount && (
          <div className={`grid grid-cols-[18px_24px_1fr_68px_100px_84px_48px] gap-x-3 items-center px-3 py-2 border-b ${divider} ${rowHover} group transition-colors`}>
            <span /><span />
            <span className={`text-sm ${muted}`}>Discount</span>
            <span />
            <div className="relative">
              <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none ${muted}`}>$</span>
              <input type="number" min={0}
                value={estimate.discount || ''}
                onChange={e => updateDiscount(Number(e.target.value))}
                className="est-pill pl-4"
                style={{ background: pillBg, color: dk ? '#e2e8f0' : '#111827' }}
              />
            </div>
            <span className="text-sm font-medium text-green-600 text-right">− {fmt(estimate.discount)}</span>
            <button onClick={() => { setShowDiscount(false); updateDiscount(0) }}
              className={`flex justify-end opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-500 ${muted}`}>
              <X size={11} />
            </button>
          </div>
        )}

        {/* Tax row */}
        {showTax && (
          <div className={`grid grid-cols-[18px_24px_1fr_68px_100px_84px_48px] gap-x-3 items-center px-3 py-2 border-b ${divider} ${rowHover} group transition-colors`}>
            <span /><span />
            <span className={`text-sm ${muted}`}>Tax Rate</span>
            <span />
            <div className="relative">
              <input type="number" min={0} max={100} step={0.5}
                value={estimate.tax_rate || ''}
                onChange={e => updateTaxRate(Number(e.target.value))}
                className="est-pill pr-5"
                style={{ background: pillBg, color: dk ? '#e2e8f0' : '#111827' }}
              />
              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none ${muted}`}>%</span>
            </div>
            <span className={`text-sm font-medium text-right ${textMain}`}>{fmt(estimate.tax_amount)}</span>
            <button onClick={() => { setShowTax(false); updateTaxRate(0) }}
              className={`flex justify-end opacity-0 group-hover:opacity-100 p-1 rounded hover:text-red-500 ${muted}`}>
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <button onClick={addItem}
          className="flex items-center gap-1.5 text-sm font-medium text-[#0F766E] border border-[#0F766E] px-3.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">
          <Plus size={13} /> Add Item
        </button>
        <button onClick={openTemplatePicker}
          className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg border transition-colors ${
            dk ? 'border-[#334155] text-slate-400 hover:border-[#0F766E] hover:text-[#0F766E]'
               : 'border-[#E8E2D9] text-[#6B7280] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
          <BookOpen size={13} /> Add from Template
        </button>
        {!showDiscount && (
          <button onClick={() => setShowDiscount(true)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              dk ? 'border-[#334155] text-slate-500 hover:border-[#0F766E] hover:text-[#0F766E]'
                 : 'border-[#E8E2D9] text-[#9CA3AF] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
            + Discount
          </button>
        )}
        {!showTax && (
          <button onClick={() => setShowTax(true)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              dk ? 'border-[#334155] text-slate-500 hover:border-[#0F766E] hover:text-[#0F766E]'
                 : 'border-[#E8E2D9] text-[#9CA3AF] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
            + Tax
          </button>
        )}
        {estimate.items.length > 0 && (
          <button onClick={() => setShowSaveTemplate(true)}
            className={`ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              dk ? 'border-[#334155] text-slate-400 hover:border-[#0F766E] hover:text-[#0F766E]'
                 : 'border-[#E8E2D9] text-[#9CA3AF] hover:border-[#0F766E] hover:text-[#0F766E]'}`}>
            <Save size={11} /> Save as Template
          </button>
        )}
      </div>

      {/* Save template inline form */}
      {showSaveTemplate && (
        <div className={`mt-3 flex items-center gap-2 p-3 rounded-xl border ${dk ? 'border-[#334155] bg-[#0F172A]' : 'border-[#E8E2D9] bg-[#F9FAFB]'}`}>
          <input autoFocus
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); if (e.key === 'Escape') setShowSaveTemplate(false) }}
            placeholder="Template name (e.g. Interior Paint 2BHK)"
            className={`flex-1 text-sm px-3 py-1.5 rounded-lg ${dk ? 'bg-[#1E293B] text-white' : 'bg-white text-gray-900'}`}
            style={{ boxShadow: '0 0 0 1px #E8E2D9' }}
          />
          <button onClick={saveTemplate} disabled={savingTpl || !templateName.trim()}
            className="px-3 py-1.5 text-sm font-medium bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
            {savingTpl ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setShowSaveTemplate(false)} className={`p-1.5 rounded hover:text-red-500 ${muted}`}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Template picker modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowTemplatePicker(false)}>
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${divider}`}>
              <h3 className={`font-semibold ${textMain}`}>Add from Template</h3>
              <button onClick={() => setShowTemplatePicker(false)} className={`p-1 rounded hover:text-red-500 ${muted}`}>
                <X size={15} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loadingTpl ? (
                <div className={`p-8 text-center text-sm ${muted}`}>Loading...</div>
              ) : templates.length === 0 ? (
                <div className="p-8 text-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3 ${dk ? 'bg-[#0F172A]' : 'bg-gray-100'}`}>
                    <BookOpen size={18} className={muted} />
                  </div>
                  <p className={`text-sm font-semibold ${textMain}`}>No templates yet</p>
                  <p className={`text-xs mt-1 ${muted}`}>Build an estimate and click "Save as Template" to reuse it.</p>
                </div>
              ) : templates.map(tpl => (
                <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                  className={`w-full text-left px-5 py-3.5 border-b last:border-b-0 transition-colors ${divider} ${rowHover}`}>
                  <p className={`text-sm font-semibold ${textMain}`}>{tpl.name}</p>
                  <p className={`text-xs mt-0.5 ${muted}`}>
                    {tpl.items.length} item{tpl.items.length !== 1 ? 's' : ''} · {tpl.items.reduce((s, i) => s + i.unit_price, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
