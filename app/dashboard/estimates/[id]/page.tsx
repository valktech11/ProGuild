'use client'

import React, { use, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Send, Save, Check } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import EstimateItems from '@/components/estimate/EstimateItems'
import EstimateSummary from '@/components/estimate/EstimateSummary'
import PaymentPanel from '@/components/estimate/PaymentPanel'
import SmartNudges from '@/components/estimate/SmartNudges'
import EstimateProgressBar from '@/components/estimate/EstimateProgressBar'
import { Session } from '@/types'
import { theme, T } from '@/lib/tokens'
import { estimateStatusStyle } from '@/lib/design'
import { isRoofing, getTradeConfig } from '@/lib/trades/_registry'
import RoofingEstimatePage from '@/lib/trades/roofing/components/EstimatePage'
import { timeAgo } from '@/lib/utils'

export type EstimateItem = {
  id: string
  name: string
  description: string
  qty: number
  unit_price: number
  amount: number
}

export type Estimate = {
  id: string
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'declined' | 'invoiced' | 'paid' | 'void'
  lead_id?: string
  invoice_id?: string
  lead_name: string
  lead_source: string
  trade: string
  job_description: string
  created_at: string
  updated_at?: string
  valid_until: string
  subtotal: number
  discount: number
  discount_type: '$' | '%'
  tax_rate: number
  tax_amount: number
  total: number
  deposit_percent: number
  require_deposit: boolean
  terms: string
  items: EstimateItem[]
  notes?: string
  contact_phone?: string
  contact_email?: string
  declined_at?: string
  decline_reason?: string
  voided_at?: string
  void_reason?: string
  timeline: { event: string; label: string; timestamp: string | null }[]
}

// Status styles: use estimateStatusStyle() from @/lib/design

// Whether line items should be locked (post-approval)
function isLocked(status: Estimate['status']) {
  return ['approved', 'invoiced', 'paid', 'void'].includes(status)
}

// Whether the estimate is in a terminal/read-only state
function isTerminal(status: Estimate['status']) {
  return ['invoiced', 'paid', 'void'].includes(status)
}

export default function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router      = useRouter()
  const searchParams = useSearchParams()
  const _from       = searchParams.get('from')   // 'pipeline' | 'calendar' | null
  const fromLeadId  = searchParams.get('lead_id')
  const fromPipeline = _from === 'pipeline' || _from === 'calendar'  // calendar goes via pipeline lead

  // Back nav resolver
  function backNav() {
    if ((_from === 'pipeline' || _from === 'calendar') && fromLeadId)
      return { label: 'Back to Lead', href: `/dashboard/pipeline/${fromLeadId}?from=${_from}` }
    return { label: 'Back to Estimates', href: '/dashboard/estimates' }
  }

  // Read session synchronously to avoid flicker
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })

  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [materialPrices, setMaterialPrices] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [confirmDeleteTpl, setConfirmDeleteTpl] = useState<{ id: string; name: string } | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceTerms, setInvoiceTerms] = useState('due_on_receipt')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [depositCollected, setDepositCollected] = useState(false)
  const [showMoreMenu,    setShowMoreMenu]    = useState(false)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [voidReason,      setVoidReason]      = useState('')
  const [voiding,         setVoiding]         = useState(false)
  const [duplicating,     setDuplicating]     = useState(false)
  const [activeTab, setActiveTab] = useState<'items' | 'notes'>('items')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [previewTpl, setPreviewTpl] = useState<string | null>(null)
  const [showSaveTemplate,   setShowSaveTemplate]   = useState(false)
  const [templateName,       setTemplateName]       = useState('')
  const [savingTemplate,     setSavingTemplate]     = useState(false)
  const [templates,          setTemplates]          = useState<{ id: string; name: string; items: any[] }[]>([])
  const [loadingTemplates,   setLoadingTemplates]   = useState(false)
  const [editingTerms,       setEditingTerms]       = useState(false)
  const [termsValue,         setTermsValue]         = useState('')

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    // Fetch material prices for this pro so EstimatePage uses real costs
    if (session) {
      fetch(`/api/roofing/settings?pro_id=${session.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.material_prices) setMaterialPrices(d.material_prices) })
        .catch(() => null)
    }
    fetch(`/api/estimates/${id}`)
      .then(r => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        if (d.estimate) {
          setEstimate(d.estimate)
        } else {
          console.error('[estimates page] API returned no estimate:', d)
          setNotFound(true)
        }
        setLoading(false)
      })
      .catch(() => {
        setNotFound(true)
        setLoading(false)
      })
  }, [id, session, router])

  // Wrap setEstimate for user edits — marks form dirty
  const setEstimateDirty: typeof setEstimate = (val) => {
    setEstimate(val)
    setIsDirty(true)
  }

  const openInvoiceModal = () => {
    if (!estimate || !session) return
    if (estimate.invoice_id) { router.push(`/dashboard/invoices/${estimate.invoice_id}`); return }
    // Pre-calculate due date for Net 30 default
    const d = new Date(); d.setDate(d.getDate() + 30)
    setInvoiceTerms('net_30')
    setInvoiceDueDate(d.toISOString().split('T')[0])
    setShowInvoiceModal(true)
  }

  const handleCreateInvoice = async () => {
    if (!estimate || !session || creatingInvoice) return
    if (estimate.invoice_id) { router.push(`/dashboard/invoices/${estimate.invoice_id}`); return }
    setCreatingInvoice(true)
    setShowInvoiceModal(false)
    try {
      const r = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_id:        session.id,
          estimate_id:   estimate.id,
          lead_id:       estimate.lead_id,
          lead_name:     estimate.lead_name,
          trade:         estimate.trade,
          contact_name:  estimate.lead_name,
          contact_email: estimate.contact_email,
          contact_phone: estimate.contact_phone,
          payment_terms: invoiceTerms,
          due_date:      invoiceDueDate ? new Date(invoiceDueDate + 'T23:59:59').toISOString() : undefined,
          deposit_paid:  depositCollected ? (estimate.total * (estimate.deposit_percent || 50) / 100) : 0,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      // Update local estimate state to reflect invoiced status
      setEstimate(prev => prev ? { ...prev, status: 'invoiced', invoice_id: d.invoice.id } : prev)
      router.push(`/dashboard/invoices/${d.invoice.id}`)
    } catch (e: any) {
      setSaveMsg(`Failed to create invoice: ${e.message}`)
      setTimeout(() => setSaveMsg(null), 4000)
    } finally {
      setCreatingInvoice(false)
    }
  }

  const handleVoid = async () => {
    if (!estimate || voiding) return
    setVoiding(true)
    try {
      await fetch(`/api/estimates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...estimate,
          status:    'void',
          voided_at: new Date().toISOString(),
          void_reason: voidReason || null,
        }),
      })
      setEstimate(prev => prev ? { ...prev, status: 'void', voided_at: new Date().toISOString() } : prev)
      setShowVoidConfirm(false)
      setVoidReason('')
      // Navigate back to list with voided flag so list can show confirmation toast
      router.push(`/dashboard/estimates?voided=${estimate?.estimate_number}`)
    } catch { setSaveMsg('Failed to void estimate') }
    finally { setVoiding(false) }
  }

  const handleDuplicate = async () => {
    if (!estimate || !session || duplicating) return
    setDuplicating(true)
    try {
      const r = await fetch('/api/estimates/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimate_id: estimate.id, pro_id: session.id }),
      })
      const d = await r.json()
      if (d.estimate?.id) router.push(`/dashboard/estimates/${d.estimate.id}`)
    } catch { setSaveMsg('Failed to duplicate') }
    finally { setDuplicating(false) }
  }

  const handleSave = async () => {
    if (!estimate) return
    // Don't save mock data
    if (false) { // removed mock guard
      setSaveMsg('Run v75-estimates-sql.sql on staging DB first')
      setTimeout(() => setSaveMsg(null), 5000)
      return
    }
    setSaving(true)
    try {
      const r = await fetch(`/api/estimates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estimate),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setSaveMsg(err.error || 'Save failed — check DB')
      } else {
        setSaveMsg('Saved ✓')
        setIsDirty(false)
      }
    } catch {
      setSaveMsg('Network error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  const toggleDark = () => {
    const next = !dk
    localStorage.setItem('pg_darkmode', next ? '1' : '0')
    setDk(next)
  }

  // ── Template handlers ──────────────────────────────────────────────────────
  const openTemplatePicker = async () => {
    setShowTemplatePicker(true)
    setLoadingTemplates(true)
    try {
      const r = await fetch(`/api/estimate-templates?pro_id=${session!.id}`)
      const d = await r.json()
      setTemplates(d.templates || [])
    } catch { setTemplates([]) }
    finally { setLoadingTemplates(false) }
  }

  const applyTemplate = (tpl: { id: string; name: string; items: any[] }) => {
    if (!estimate) return
    const newItems = tpl.items.map((i: any) => ({
      ...i, id: crypto.randomUUID()
    }))
    const merged   = [...estimate.items, ...newItems]
    const subtotal = merged.reduce((s: number, i: any) => s + i.qty * i.unit_price, 0)
    const tax_amount = subtotal * (estimate.tax_rate / 100)
    setEstimate(prev => prev ? { ...prev, items: merged, subtotal, tax_amount, total: subtotal + tax_amount } : prev)
    setShowTemplatePicker(false)
  }

  const saveTemplate = async () => {
    if (!estimate || !templateName.trim()) return
    setSavingTemplate(true)
    try {
      await fetch('/api/estimate-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session!.id, name: templateName.trim(), items: estimate.items }),
      })
      setShowSaveTemplate(false)
      setTemplateName('')
    } catch { /* silent */ }
    finally { setSavingTemplate(false) }
  }

  if (!session) return null

  // Theme tokens — must be declared before any usage
  const t     = theme(dk)
  const muted = t.textMuted   // color value for inline styles

  // ── Trade routing — use estimate.trade_slug, NOT session.trade_slug ──────
  // estimate.trade_slug comes from the DB via the pro join in GET /api/estimates/[id]
  // This is the correct source of truth. Session can be stale or unloaded.
  const estTradeSlug = (estimate as any)?.trade_slug ?? session?.trade_slug ?? ''
  if (notFound) return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Estimate not found</div>
        <div style={{ fontSize: 14, marginBottom: 20 }}>This estimate may have been deleted or you may not have access.</div>
        <button onClick={() => router.push('/dashboard/estimates')}
          style={{ padding: '10px 20px', borderRadius: 8, background: '#0F766E', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          Back to Estimates
        </button>
      </div>
    </DashboardShell>
  )

  if (!loading && estimate && isRoofing(getTradeConfig(estTradeSlug))) {
    return (
      <DashboardShell session={session} newLeads={0} onAddLead={() => {}}
        darkMode={dk} onToggleDark={toggleDark}>
        <RoofingEstimatePage
          estimate={{
            ...(estimate as any),
            estimate_number:   estimate.estimate_number,
            estimate_type:     (estimate as any).estimate_type ?? 'tiered',
            tiered_data:       (estimate as any).tiered_data,
            scope_of_work:     (estimate as any).scope_of_work,
            square_count:      (estimate as any).square_count,
            pitch:             (estimate as any).pitch,
            waste_pct:         (estimate as any).waste_pct,
            insurance_claim:   (estimate as any).insurance_claim,
            insurance_company: (estimate as any).insurance_company,
            claim_number:      (estimate as any).claim_number,
            adjuster_name:     (estimate as any).adjuster_name,
            approved_amount:   (estimate as any).approved_amount,
            deductible:        (estimate as any).deductible,
            payment_milestones:(estimate as any).payment_milestones,
            pro_name:          (estimate as any).pro_name  ?? session?.name,
            pro_phone:         (estimate as any).pro_phone ?? null,
          }}
          templates={(estimate as any).gbb_templates ?? []}
          materialPrices={materialPrices}
          onDirty={() => setIsDirty(true)}
          onMeasurementsUpdate={async (fields) => {
            const leadId = (estimate as any).lead_id
            if (leadId) {
              // Write measurements to roofing_job_data (via leads PATCH ROOFING_JOB_FIELDS handler)
              // Write property_address to leads.property_address (via leads STRING_FIELDS)
              await fetch(`/api/leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...(fields.property_address ? { property_address: fields.property_address } : {}),
                  square_count: fields.square_count,
                  pitch:        fields.pitch,
                  waste_pct:    fields.waste_pct,
                }),
              })
            }
            // property_address is golden-sourced from leads — no duplicate write to roofing_estimate_data
          }}
          onSave={async (updates) => {
            setSaving(true)
            try {
              // Only send known PATCH fields — never spread the full estimate object
              // which contains nested join objects (pro, lead, roofing) that break the API
              const payload = {
                // Only include items if explicitly provided — undefined means GBB mode (no standard items)
                ...(updates.items !== undefined ? { items: updates.items } : {}),
                subtotal:           updates.subtotal           ?? estimate.subtotal,
                discount:           (estimate as any).discount,
                discount_type:      (estimate as any).discount_type,
                tax_rate:           estimate.tax_rate,
                tax_amount:         updates.tax_amount         ?? estimate.tax_amount,
                total:              updates.total              ?? estimate.total,
                require_deposit:    (estimate as any).require_deposit,
                deposit_percent:    (estimate as any).deposit_percent,
                terms:              updates.terms              ?? estimate.terms,
                status:             estimate.status,
                notes:              (estimate as any).notes,
                contact_email:      updates.contact_email      ?? estimate.contact_email,
                contact_phone:      updates.contact_phone      ?? estimate.contact_phone,
                // Roofing-specific
                estimate_type:      (updates as any).estimate_type      ?? (estimate as any).estimate_type,
                tiered_data:        (updates as any).tiered_data        ?? (estimate as any).tiered_data,
                scope_of_work:      (updates as any).scope_of_work      ?? (estimate as any).scope_of_work,
                payment_milestones: (updates as any).payment_milestones ?? (estimate as any).payment_milestones,
                property_address:   (updates as any).property_address   ?? (estimate as any).property_address,
                square_count:       (updates as any).square_count       ?? (estimate as any).square_count,
                pitch:              (updates as any).pitch              ?? (estimate as any).pitch,
                waste_pct:          (updates as any).waste_pct          ?? (estimate as any).waste_pct,
              }
              const r = await fetch(`/api/estimates/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              if (!r.ok) { const e = await r.json().catch(()=>{}); throw new Error((e as any)?.error || 'Save failed') }
              setEstimate(prev => prev ? { ...prev, ...updates } as any : prev)
              setSaveMsg('Saved ✓')
              setTimeout(() => setSaveMsg(null), 2500)
            } catch (err: any) { setSaveMsg(err?.message || 'Save failed'); setTimeout(() => setSaveMsg(null), 3000) }
            finally { setSaving(false) }
          }}
          onSend={async () => {
            if (isSending) return
            if (isDirty) {
              setSaveMsg('Save changes before sending')
              setTimeout(() => setSaveMsg(null), 3000)
              return
            }
            setIsSending(true)
            setSaveMsg('Sending…')
            try {
              const sentAt = new Date().toISOString()
              // 1. Mark as sent
              const patchR = await fetch(`/api/estimates/${id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'sent', sent_at: sentAt }),
              })
              if (!patchR.ok) throw new Error('Failed to update estimate status')
              // 2. Send email
              const sendR = await fetch('/api/estimates/send', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estimateId: id, pro_id: session?.id }),
              })
              if (!sendR.ok) {
                const e = await sendR.json().catch(() => ({}))
                throw new Error((e as any)?.error || 'Email failed to send')
              }
              setEstimate(prev => prev ? { ...prev, status: 'sent' } as any : prev)
              setSaveMsg('Sent to homeowner ✓')
              setTimeout(() => setSaveMsg(null), 3000)
            } catch (err: any) {
              setSaveMsg(err?.message || 'Send failed — try again')
              setTimeout(() => setSaveMsg(null), 4000)
            } finally {
              setIsSending(false)
            }
          }}
          onBack={() => router.push(backNav().href)}
          darkMode={dk}
          externalSaveMsg={saveMsg}
          isLocked={['approved','void','declined','paid'].includes((estimate as any).status)}
        />
      </DashboardShell>
    )
  }

  return (
    <>
    {/* ── Create Invoice Modal ─────────────────────────────────────────── */}
    {showInvoiceModal && estimate && (
      <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(2px)' }}
        onClick={() => setShowInvoiceModal(false)}>
        <div style={{ background: t.cardBg, borderRadius:20, padding:28, width:'100%', maxWidth:440, boxShadow:'0 24px 48px rgba(0,0,0,0.18)', borderTop:'4px solid #0F766E' }}
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize: 18, fontWeight:800, color: t.textPri, marginBottom:4 }}>Create Invoice</div>
            <div style={{ fontSize: 14, color: t.textMuted }}>
              From Estimate #{estimate.estimate_number} · Total <strong style={{ color:'#0F766E' }}>${estimate.total.toLocaleString('en-US', { minimumFractionDigits:2 })}</strong>
            </div>
          </div>

          {/* Line items preview */}
          <div style={{ background: t.cardBgAlt, borderRadius:10, padding:'10px 14px', marginBottom:20 }}>
            {(estimate.items || []).slice(0,3).map((item: any) => (
              <div key={item.id} style={{ display:'flex', justifyContent:'space-between', fontSize: 14, padding:'4px 0', borderBottom: '1px solid ' + t.cardBgAlt }}>
                <span style={{ color: t.textBody, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%' }}>{item.name}</span>
                <span style={{ color: t.textMuted, flexShrink:0, marginLeft:8 }}>${(item.qty * item.unit_price).toLocaleString('en-US', { minimumFractionDigits:2 })}</span>
              </div>
            ))}
            {(estimate.items || []).length > 3 && (
              <div style={{ fontSize: 12, color: t.textSubtle, paddingTop:4 }}>+{estimate.items.length - 3} more items</div>
            )}
          </div>

          {/* Payment Terms */}
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize: 13, fontWeight:700, color: t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Payment Terms</label>
            <select value={invoiceTerms} onChange={e => {
              const val = e.target.value
              setInvoiceTerms(val)
              const days: Record<string,number> = { due_on_receipt:0, net_7:7, net_15:15, net_30:30, net_60:60 }
              const d = new Date(); d.setDate(d.getDate() + (days[val] ?? 30))
              setInvoiceDueDate(d.toISOString().split('T')[0])
              setIsDirty(true)
            }}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border: '1.5px solid ' + t.cardBorder, background: dk ? '#0F172A' : 'white', color: t.textPri, fontSize: 15, cursor:'pointer' }}>
              <option value="due_on_receipt">Due on Receipt</option>
              <option value="net_7">Net 7 days</option>
              <option value="net_15">Net 15 days</option>
              <option value="net_30">Net 30 days</option>
              <option value="net_60">Net 60 days</option>
            </select>
          </div>

          {/* Due Date */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize: 13, fontWeight:700, color: t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Due Date</label>
            <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:10, border: '1.5px solid ' + t.cardBorder, background: dk ? '#0F172A' : 'white', color: t.textPri, fontSize: 15, boxSizing:'border-box' }} />
          </div>

          {/* Deposit collected */}
          {estimate.require_deposit && (
            <div style={{ marginBottom:20, padding:'12px 14px', borderRadius:10, background: t.cardBgAlt, border: '1.5px solid ' + depositCollected ? '#0F766E' : (t.cardBorder) }}>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <div onClick={() => setDepositCollected(v => !v)}
                  style={{ width:20, height:20, borderRadius:6, border: '2px solid ' + depositCollected ? '#0F766E' : (t.inputBorder), background: depositCollected ? '#0F766E' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, cursor:'pointer', transition:'all 0.15s' }}>
                  {depositCollected && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight:600, color: t.textPri }}>
                    Deposit already collected
                  </div>
                  <div style={{ fontSize: 12, color: t.textSubtle, marginTop:1 }}>
                    {estimate.deposit_percent || 50}% deposit = ${((estimate.total || 0) * (estimate.deposit_percent || 50) / 100).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })} will be credited
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setShowInvoiceModal(false)}
              style={{ flex:1, padding:'11px', borderRadius:10, border: '1.5px solid ' + t.cardBorder, background:'transparent', color: t.textMuted, fontSize: 15, fontWeight:600, cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={handleCreateInvoice} disabled={creatingInvoice}
              style={{ flex:2, padding:'11px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize: 15, fontWeight:700, cursor:'pointer', opacity: creatingInvoice ? 0.7 : 1 }}>
              {creatingInvoice ? 'Creating…' : 'Create Invoice →'}
            </button>
          </div>
        </div>
      </div>
    )}

    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={toggleDark}
      fullBleed={true}
    >
      <div style={{ height: '100%', overflowY: 'auto' }}>
        <div className="w-full max-w-[1200px] mx-auto px-3 py-4 lg:px-4 lg:py-6 space-y-5 min-w-0">

          {/* ── Top action bar ── */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push(backNav().href)}
              className="flex items-center gap-1.5 text-sm font-medium hover:text-[#0F766E] transition-colors" style={{ color: muted }}
            >
              <ArrowLeft size={16} />
              {backNav().label}
            </button>

            <div className="flex items-center gap-3">
              {saveMsg && (
                <span className={`text-sm font-medium ${saveMsg.includes('✓') ? 'text-teal-600' : 'text-red-500'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <EstimateSkeleton dk={dk} />
          ) : estimate ? (
            <>
              {/* ── Estimate header ── */}
              <div style={{ borderRadius: 12, border: '1px solid ' + t.cardBorder, padding: '20px 24px', background: t.cardBg }}>
                <div className="flex flex-col xl:flex-row xl:items-start xl:gap-6 gap-3">
                  {/* Col 1: Name H1 + EST# line 2 */}
                  <div className="xl:flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {estimate.lead_id ? (
                        <button onClick={() => router.push(`/dashboard/pipeline/${estimate.lead_id}?from=estimates`)}
                          className={`text-[22px] font-bold leading-tight hover:text-[#0F766E] transition-colors text-left ${dk ? 'text-white' : 'text-gray-900'}`}>
                          {estimate.lead_name}
                        </button>
                      ) : (
                        <h1 className={`text-[22px] font-bold leading-tight ${dk ? 'text-white' : 'text-gray-900'}`}>{estimate.lead_name}</h1>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-100 shrink-0">Lead</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap" style={{ fontSize: 14 }}>
                      <span style={{ fontWeight: 600, color: t.textBody }}>#{estimate.estimate_number}</span>
                      <span style={{ opacity: 0.35 }}>·</span>
                      <span style={{ color: estimateStatusStyle(estimate.status, dk).text, fontWeight: 600 }}>{estimateStatusStyle(estimate.status, dk).label}</span>
                      {estimate.trade && <><span style={{ opacity: 0.35 }}>·</span><span style={{ color: t.textMuted }}>{estimate.trade}</span></>}
                      <span style={{ opacity: 0.35 }}>·</span>
                      <span style={{ fontSize: 13, color: t.textSubtle }}>Last edited {timeAgo(estimate.updated_at || estimate.created_at)}</span>
                    </div>
                  </div>

                  {/* Col 2: Lead Source | Created | Valid Until */}
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-0">
                    {[
                      { label: 'Lead Source', value: estimate.lead_source || '—', amber: false },
                      { label: 'Created',     value: new Date(estimate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), amber: false },
                      { label: 'Valid Until', value: new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), amber: true },
                    ].map(({ label, value, amber }, i) => (
                      <div key={label} className="flex items-center gap-0">
                        {i > 0 && <span className="hidden xl:block mx-5 select-none" style={{ color: t.inputBorder }}>|</span>}
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", lineHeight: 1, color: muted }}>{label}</p>
                          <p style={{ fontSize: 14, fontWeight: 700, marginTop: 4, color: amber ? '#F59E0B' : t.textPri }}>{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Col 3: ··· menu + status-based primary CTA */}
                  <div className="flex flex-col items-start xl:items-end gap-2 xl:shrink-0 xl:ml-auto">
                    <div className="flex items-center gap-2">

                      {/* ··· More menu */}
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setShowMoreMenu(m => !m)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1.5px solid ' + t.inputBorder, background: 'transparent', color: t.textBody, cursor: 'pointer', fontSize: 18, letterSpacing: 1 }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = t.inputBorder }}>
                          {'···'}
                        </button>
                        {/* D4: backdrop for outside-click close */}
                        {showMoreMenu && (
                          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setShowMoreMenu(false)} />
                        )}
                        {showMoreMenu && (
                          <div
                            style={{ position: 'fixed', top: 'auto', left: '50%', transform: 'translateX(-50%)', bottom: 'auto', zIndex: 50, background: t.cardBg, border: '1px solid ' + t.cardBorder, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 220, width: '90vw', maxWidth: 280, overflow: 'hidden' }}>
                            {[
                              {
                                label: 'Download PDF', icon: '↓',
                                action: async () => {
                                  setShowMoreMenu(false)
                                  if (!estimate) return
                                  setSaveMsg('Generating PDF...')
                                  try {
                                    const r = await fetch(`/api/estimates/pdf?id=${id}&pro_id=${session?.id}`)
                                    if (!r.ok) throw new Error('fail')
                                    const blob = await r.blob()
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a'); a.href = url; a.download = `Estimate-${estimate.estimate_number}.pdf`; a.click()
                                    URL.revokeObjectURL(url)
                                    setSaveMsg('PDF downloaded ✓')
                                  } catch { setSaveMsg('PDF failed') }
                                  setTimeout(() => setSaveMsg(null), 4000)
                                },
                              },
                              {
                                // D6: copy estimate link
                                label: 'Copy Estimate Link', icon: '🔗',
                                action: () => {
                                  setShowMoreMenu(false)
                                  navigator.clipboard.writeText(`${window.location.origin}/estimate/${id}`)
                                    .then(() => { setSaveMsg('Link copied ✓'); setTimeout(() => setSaveMsg(null), 2500) })
                                    .catch(() => { setSaveMsg('Copy failed'); setTimeout(() => setSaveMsg(null), 2500) })
                                },
                              },
                              {
                                label: duplicating ? 'Duplicating...' : 'Duplicate Estimate', icon: '⎘',
                                action: () => { setShowMoreMenu(false); handleDuplicate() },
                              },
                              // D5: delete only for draft estimates
                              ...(estimate.status === 'draft' ? [{
                                label: 'Delete Estimate', icon: '🗑', danger: true,
                                action: () => { setShowMoreMenu(false); setShowDeleteConfirm(true) },
                              }] : []),
                              ...(!isTerminal(estimate.status) && estimate.status !== 'void' && estimate.status !== 'declined' ? [{
                                label: 'Void Estimate', icon: '✕', danger: true,
                                action: () => { setShowMoreMenu(false); setShowVoidConfirm(true) },
                              }] : []),
                            ].map(item => (
                              <button key={item.label} onClick={item.action}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', fontSize: 14, fontWeight: 500, background: 'transparent', border: 'none', color: (item as any).danger ? '#EF4444' : t.textBody, cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => { e.currentTarget.style.background = dk ? '#1a2940' : '#F9FAFB' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                <span style={{ fontSize: 15, width: 16, textAlign: 'center' }}>{item.icon}</span>
                                {item.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Preview — always visible except void */}
                      {estimate.status !== 'void' && (
                        <button
                          onClick={() => window.open(`${window.location.origin}/estimate/${id}`, '_blank')}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, border: '1.5px solid ' + t.inputBorder, background: 'transparent', color: t.textBody, cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = t.inputBorder; e.currentTarget.style.color = t.textBody }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          Preview
                        </button>
                      )}

                      {/* Primary CTA — per status */}
                      {estimate.status === 'draft' && (
                        <button onClick={async () => {
                          if (estimate.items.length === 0) { setSaveMsg('Add items before sending'); setTimeout(() => setSaveMsg(null), 3000); return }
                          if (estimate.total <= 0) { setSaveMsg('Total must be greater than $0'); setTimeout(() => setSaveMsg(null), 3000); return }
                          // Email resolved server-side from lead — no client-side gate needed

                          const sentAt = new Date().toISOString()
                          await handleSave()

                          // Call proper initial-send route (not reminder)
                          const [, sendResult] = await Promise.all([
                            fetch(`/api/estimates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...estimate, status: 'sent', sent_at: sentAt }) }),
                            fetch('/api/estimates/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estimateId: id, pro_id: session?.id }) }),
                          ])

                          const sendOk = sendResult.ok
                          setEstimate(prev => prev ? { ...prev, status: 'sent', timeline: prev.timeline.map(tl => tl.event === 'sent' ? { ...tl, timestamp: sentAt } : tl) } : prev)
                          setSaveMsg(sendOk ? 'Estimate sent to client ✓' : 'Status updated — email failed (check Resend)')
                          setTimeout(() => setSaveMsg(null), 4000)
                        }} disabled={saving}
                          className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                          style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)' }}>
                          <Send size={14} /> Send Estimate
                        </button>
                      )}
                      {(estimate.status === 'sent' || estimate.status === 'viewed') && (
                        <button onClick={async () => {
                          // Email resolved server-side from lead — no client-side gate needed
                          const r = await fetch('/api/estimates/send-reminder', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ estimateId: id, contactEmail: estimate.contact_email, pro_id: session?.id }),
                          })
                          setSaveMsg(r.ok ? 'Reminder sent to client ✓' : 'Failed to send reminder')
                          setTimeout(() => setSaveMsg(null), 3000)
                        }}
                          className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 whitespace-nowrap"
                          style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 1h3"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          Send Reminder
                        </button>
                      )}
                      {estimate.status === 'declined' && (
                        <button onClick={handleDuplicate} disabled={duplicating}
                          className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                          style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          {duplicating ? 'Creating...' : 'Revise & Resend'}
                        </button>
                      )}
                      {(estimate.status === 'invoiced' || estimate.status === 'paid') && (
                        <button onClick={() => estimate.invoice_id && router.push(`/dashboard/invoices/${estimate.invoice_id}`)}
                          className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 whitespace-nowrap"
                          style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          View Invoice
                        </button>
                      )}
                      {estimate.status === 'void' && (
                        <button onClick={handleDuplicate} disabled={duplicating}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                          style={{ border: '1.5px solid ' + t.inputBorder, background: 'transparent', color: t.textBody }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                          {duplicating ? 'Creating...' : 'Start New Estimate'}
                        </button>
                      )}
                    </div>
                    {estimate.status !== 'void' && estimate.status !== 'declined' && (
                      <p style={{ fontSize: 11, textAlign: "right" as const, color: muted }}>Client can approve &amp; pay instantly</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Status banners for terminal/declined states ── */}
              {estimate.status === 'void' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderRadius: 14, border: '1px solid #FECACA', background: dk ? 'rgba(239,68,68,0.08)' : '#FEF2F2' }}>
                  <span style={{ fontSize: 18 }}>⛔</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#DC2626', margin: 0 }}>This estimate has been voided</p>
                    <p style={{ fontSize: 13, color: dk ? '#FDA4AF' : '#9F1239', margin: '2px 0 0' }}>
                      {estimate.void_reason ? `Reason: ${estimate.void_reason}` : 'No reason provided.'}
                    </p>
                  </div>
                  <button onClick={handleDuplicate} disabled={duplicating}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1.5px solid #FECACA', background: 'transparent', color: '#DC2626', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {duplicating ? 'Creating...' : 'Start New Estimate'}
                  </button>
                </div>
              )}
              {estimate.status === 'declined' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderRadius: 14, border: '1px solid #FECACA', background: dk ? 'rgba(239,68,68,0.08)' : '#FFF1F1' }}>
                  <span style={{ fontSize: 18 }}>❌</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#DC2626', margin: 0 }}>Client declined this estimate</p>
                    <p style={{ fontSize: 13, color: dk ? '#FDA4AF' : '#9F1239', margin: '2px 0 0' }}>
                      {estimate.decline_reason ? `"${estimate.decline_reason}"` : 'No reason provided.'}
                    </p>
                  </div>
                  <button onClick={handleDuplicate} disabled={duplicating}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {duplicating ? 'Creating...' : 'Revise & Resend'}
                  </button>
                </div>
              )}

              {/* Horizontal progress bar */}
              <EstimateProgressBar timeline={estimate.timeline} darkMode={dk} />

              {/* Context-aware smart nudge — not shown for void/declined */}
              {!['void', 'declined'].includes(estimate.status) && (
                <SmartNudges
                  darkMode={dk}
                  status={estimate.status}
                  invoiceId={estimate.invoice_id}
                  onCta={() => {
                    if (estimate.status === 'approved') openInvoiceModal()
                    else if (estimate.status === 'invoiced' && estimate.invoice_id) router.push(`/dashboard/invoices/${estimate.invoice_id}`)
                  }}
                />
              )}

              {/* ── Main 2-col layout ── */}
              <div className="flex flex-col xl:flex-row gap-5 items-start">

                {/* Left — items + tabs */}
                <div className="flex-1 min-w-0 space-y-5 min-w-0">

                  {/* ── Tab strip — matches reference: tabs left, buttons right ── */}
                  <div style={{ borderRadius: 12, border: '1px solid ' + t.cardBorder, background: t.cardBg }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid ' + t.cardBorder }}>
                      {/* Tabs */}
                      <div style={{ display: 'flex' }}>
                        {(['items', 'notes'] as const).map(tab => (
                          <button key={tab} onClick={() => setActiveTab(tab)}
                            style={{ padding: '12px 24px', fontSize: 14, fontWeight: 500, position: 'relative', border: 'none', background: 'transparent', cursor: 'pointer',
                              color: activeTab === tab ? '#0F766E' : t.textMuted,
                              borderBottom: activeTab === tab ? '2px solid #0F766E' : '2px solid transparent',
                            }}>
                            {tab === 'items' ? 'Estimate Items' : 'Notes & Attachments'}
                          </button>
                        ))}
                      </div>
                      {/* Use Previous Job button */}
                      {activeTab === 'items' && (
                        <div style={{ paddingRight: 16 }}>
                          <button onClick={openTemplatePicker}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: '1.5px solid ' + t.btnBorder, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = t.btnBorder; e.currentTarget.style.color = t.textMuted }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                            Use Previous Job
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 24 }}>
                      {activeTab === 'items' ? (
                        <>
                          {isLocked(estimate.status) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: dk ? 'rgba(245,158,11,0.08)' : '#FFFBEB', border: '1px solid #FCD34D', marginBottom: 16 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                              <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>
                                {estimate.status === 'approved'
                                  ? `Items locked — client approved on ${estimate.timeline.find(t => t.event === 'approved')?.timestamp ? new Date(estimate.timeline.find(t => t.event === 'approved')!.timestamp!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'this date'}. Create an invoice to proceed.`
                                  : 'Items are locked — this estimate has been invoiced.'}
                              </p>
                            </div>
                          )}
                          <EstimateItems
                            estimate={estimate}
                            setEstimate={setEstimateDirty}
                            darkMode={dk}
                            onOpenTemplatePicker={openTemplatePicker}
                            onSaveTemplate={() => {
                              if (estimate.items.length === 0) { setSaveMsg('Add items before saving a template'); setTimeout(() => setSaveMsg(null), 3000); return }
                              setShowSaveTemplate(true)
                            }}
                            locked={isLocked(estimate.status)}
                          />
                        </>
                      ) : (
                        <NotesTab estimate={estimate} setEstimate={setEstimate} darkMode={dk} />
                      )}
                    </div>
                  </div>

                  {/* ── Dirty-state Save bar — sticky bottom, only when unsaved changes exist ── */}
                  {activeTab === 'items' && isDirty && (
                    <div style={{
                      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 8, padding: '14px 32px',
                      background: dk ? '#1E2530' : '#fff',
                      borderTop: `2px solid #F59E0B`,
                      boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', display: 'inline-block', flexShrink: 0 }} />
                        {saveMsg ? (
                          <span style={{ fontSize: 14, fontWeight: 600, color: saveMsg.includes('✓') ? '#0F766E' : '#EF4444' }}>{saveMsg}</span>
                        ) : (
                          <span style={{ fontSize: 14, fontWeight: 600, color: dk ? '#F1F5F9' : '#0F172A' }}>
                            Unsaved changes · <span style={{ color: '#F59E0B' }}>${(estimate?.total ?? 0).toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={async () => {
                          if (estimate.items.length === 0) { setSaveMsg('Add items before saving a template'); setTimeout(() => setSaveMsg(null), 3000); return }
                          if (isDirty) await handleSave()
                          setShowSaveTemplate(true)
                        }}
                          style={{ fontSize: 13, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}>
                          Save as template
                        </button>
                        <button
                          onClick={() => {
                            // Discard — reload estimate from server
                            setIsDirty(false)
                            setSaveMsg(null)
                            fetch(`/api/estimates/${id}`)
                              .then(r => r.json())
                              .then(d => { if (d.estimate) setEstimate(d.estimate) })
                              .catch(() => null)
                          }}
                          style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${dk ? '#334155' : '#CBD5E1'}`, background: 'transparent', color: t.textBody, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                          Discard
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', background: '#0F766E', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, boxShadow: '0 2px 8px rgba(15,118,110,0.3)' }}>
                          <Save size={14} />
                          {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Spacer so content isn't hidden behind sticky bar */}
                  {activeTab === 'items' && isDirty && <div style={{ height: 68 }} />}
                  {/* Post-save confirmation — shown briefly after save */}
                  {activeTab === 'items' && !isDirty && saveMsg && saveMsg.includes('✓') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: `1px solid #99F6E4`, background: dk ? 'rgba(15,118,110,0.1)' : '#F0FDFA' }}>
                      <Check size={14} color="#0F766E" />
                      <span style={{ fontSize: 14, color: '#0F766E', fontWeight: 500 }}>{saveMsg}</span>
                    </div>
                  )}

                  {/* ── Save as template — slim text link ── */}
                  {activeTab === 'items' && !isDirty && (
                    <div style={{ textAlign: 'center', padding: '2px 0 4px' }}>
                      <button onClick={() => {
                          if (estimate.items.length === 0) { setSaveMsg('Add items before saving a template'); setTimeout(() => setSaveMsg(null), 3000); return }
                          setShowSaveTemplate(true)
                        }}
                        style={{ fontSize: 13, color: t.textSubtle, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#0F766E')}
                        onMouseLeave={e => (e.currentTarget.style.color = t.textSubtle)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                        Save as reusable template
                      </button>
                    </div>
                  )}

                  {/* ── Terms & Conditions — editable ── */}
                  <div style={{ borderRadius: 12, border: '1px solid ' + t.cardBorder, background: t.cardBg, padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: t.textPri }}>Terms & Conditions</h3>
                      {!editingTerms && (
                        <button
                          onClick={() => { setTermsValue(estimate.terms); setEditingTerms(true) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1.5px solid ' + t.btnBorder, background: 'transparent', color: t.btnText, cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = t.btnBorder; e.currentTarget.style.color = t.btnText }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                      )}
                    </div>
                    {editingTerms ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <textarea
                          value={termsValue}
                          onChange={e => setTermsValue(e.target.value)}
                          rows={4}
                          style={{ width: '100%', fontSize: 14, borderRadius: 8, padding: '10px 12px', lineHeight: 1.6, resize: 'vertical', background: t.inputBg, color: t.textPri, boxSizing: 'border-box', boxShadow: '0 0 0 1.5px #0F766E', border: 'none', outline: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditingTerms(false)}
                            style={{ padding: '6px 14px', fontSize: 14, borderRadius: 8, border: '1.5px solid ' + t.cardBorder, background: 'transparent', color: t.textMuted, cursor: 'pointer' }}>
                            Cancel
                          </button>
                          <button
                            onClick={() => { setEstimate(prev => prev ? { ...prev, terms: termsValue } : prev); setEditingTerms(false); setIsDirty(true) }}
                            style={{ padding: '6px 14px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', background: '#0F766E', color: '#fff', cursor: 'pointer' }}>
                            Save Terms
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: t.textMuted, wordBreak: 'break-word', overflowWrap: 'break-word' }}>{estimate.terms}</p>
                    )}
                  </div>

                  {/* ── Secondary actions — slim row ── */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {/* Download PDF */}
                    <button
                      onClick={async () => {
                        if (!estimate) return
                        setSaveMsg('Generating PDF...')
                        try {
                          const r = await fetch(`/api/estimates/pdf?id=${id}`)
                          if (!r.ok) throw new Error('PDF failed')
                          const blob = await r.blob()
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url; a.download = `Estimate-${estimate.estimate_number}.pdf`; a.click()
                          URL.revokeObjectURL(url)
                          setSaveMsg('PDF downloaded ✓')
                        } catch { setSaveMsg('PDF generation failed') }
                        setTimeout(() => setSaveMsg(null), 4000)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, border: '1.5px solid ' + t.inputBorder, background: 'transparent', color: t.textBody, cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = t.inputBorder; e.currentTarget.style.color = t.textBody }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download PDF
                    </button>
                    {/* Mark as Sent / Sent state */}
                    {['sent','viewed','approved','invoiced','paid'].includes(estimate.status) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, color: '#0F766E', background: '#F0FDFA', border: '1px solid #99F6E4' }}>
                        <Check size={13} /> Marked as Sent
                      </div>
                    ) : (
                      <button
                        onClick={async () => {
                          if (!estimate) return
                          const sentAt = new Date().toISOString()
                          await fetch(`/api/estimates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...estimate, status: 'sent', sent_at: sentAt }) })
                          setEstimate(prev => {
                            if (!prev) return prev
                            return { ...prev, status: 'sent', timeline: prev.timeline.map(tl => tl.event === 'sent' ? { ...tl, timestamp: sentAt } : tl) }
                          })
                          setSaveMsg('Marked as sent ✓'); setTimeout(() => setSaveMsg(null), 3000)
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 500, border: '1.5px solid ' + t.inputBorder, background: 'transparent', color: t.textBody, cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.color = '#0F766E' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = t.inputBorder; e.currentTarget.style.color = t.textBody }}>
                        <Send size={13} /> Mark as Sent
                      </button>
                    )}
                  </div>
                </div>

                {/* Right sidebar */}
                <div className="w-full xl:w-[340px] xl:shrink-0 space-y-5">
                  <EstimateSummary estimate={estimate} darkMode={dk} />
                  <PaymentPanel
                    estimate={estimate}
                    setEstimate={setEstimate}
                    darkMode={dk}
                    onAction={msg => { setSaveMsg(msg); setTimeout(() => setSaveMsg(null), 4000) }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ borderRadius: 12, border: '1px solid ' + t.cardBorder, padding: "48px 24px", textAlign: "center" as const, background: t.cardBg, color: muted }}>
              Estimate not found.
            </div>
          )}
        </div>
      </div>
    {/* ── D5: Delete confirm modal (draft only) ── */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowDeleteConfirm(false)}>
          <div style={{ background: t.cardBg, borderRadius: 20, width: '100%', maxWidth: 380, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>
              Delete {estimate?.estimate_number}?
            </h3>
            <p style={{ fontSize: 14, color: t.textMuted, marginBottom: 20 }}>
              This will permanently remove the estimate and all its line items. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDeleteConfirm(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid ' + t.cardBorder, background: 'transparent', color: t.textMuted, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={async () => {
                setShowDeleteConfirm(false)
                await fetch(`/api/estimates/${id}`, { method: 'DELETE' })
                router.push('/dashboard/estimates')
              }}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Delete Estimate
              </button>
            </div>
          </div>
        </div>
      )}

    {/* ── Void confirm modal ── */}
      {showVoidConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowVoidConfirm(false)}>
          <div style={{ background: t.cardBg, borderRadius: 20, width: '100%', maxWidth: 400, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: t.textPri, marginBottom: 6 }}>Void this estimate?</h3>
            <p style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>This cannot be undone. You can duplicate it to start a new estimate.</p>
            <input
              type="text"
              placeholder="Reason (optional) — e.g. Wrong price, job cancelled"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid ' + t.inputBorder, background: t.inputBg, color: t.textPri, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowVoidConfirm(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid ' + t.cardBorder, background: 'transparent', color: t.textMuted, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleVoid} disabled={voiding}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#EF4444', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: voiding ? 0.7 : 1 }}>
                {voiding ? 'Voiding...' : 'Void Estimate'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowTemplatePicker(false)}>
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
              <h3 className={`font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Use Previous Job</h3>
              <button onClick={() => setShowTemplatePicker(false)} className={muted}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loadingTemplates ? (
                <div style={{ padding: 32, textAlign: "center" as const, fontSize: 14, color: muted }}>Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="p-8 text-center">
                  <p className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>No templates yet</p>
                  <p style={{ fontSize: 12, marginTop: 4, color: muted }}>Build an estimate and click "Save as Template" to reuse it.</p>
                </div>
              ) : templates.map(tpl => (
                <div key={tpl.id} className={`border-b last:border-b-0 ${dk ? 'border-[#334155]' : 'border-[#E8E2D9]'}`}>
                  <div className={`flex items-center`}>
                    <button onClick={() => applyTemplate(tpl)}
                      className={`flex-1 text-left px-5 py-3.5 transition-colors ${dk ? 'hover:bg-[#0F172A]' : 'hover:bg-[#F9FAFB]'}`}>
                      <p className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>{tpl.name}</p>
                      <p style={{ fontSize: 12, marginTop: 2, color: muted }}>{tpl.items.length} item{tpl.items.length !== 1 ? 's' : ''} · ${tpl.items.reduce((s: number, i: any) => s + i.qty * i.unit_price, 0).toLocaleString()}</p>
                    </button>
                    {/* Preview toggle */}
                    <button onClick={e => { e.stopPropagation(); setPreviewTpl(previewTpl === tpl.id ? null : tpl.id) }}
                      className={`px-3 py-3.5 shrink-0 transition-colors ${dk ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-700'}`}
                      title="Preview items">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        {previewTpl === tpl.id ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
                      </svg>
                    </button>
                    {/* Delete */}
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteTpl({ id: tpl.id, name: tpl.name }) }}
                      title="Delete template"
                      className="px-4 py-3.5 shrink-0 text-gray-400 hover:text-red-500 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                  {/* Item preview — expands on chevron click */}
                  {previewTpl === tpl.id && (
                    <div className={`px-5 pb-3 ${dk ? 'bg-[#0F172A]' : 'bg-[#F9FAFB]'}`}>
                      {tpl.items.map((item: any, idx: number) => (
                        <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom: idx < tpl.items.length-1 ? '1px solid ' + t.divider : 'none' }}>
                          <span className={`text-xs ${dk ? 'text-slate-300' : 'text-gray-700'}`}>{item.name || 'Unnamed item'}</span>
                          <span className={`text-xs font-semibold ${dk ? 'text-slate-400' : 'text-gray-500'}`}>{item.qty} × ${item.unit_price?.toLocaleString()}</span>
                        </div>
                      ))}
                      <button onClick={() => applyTemplate(tpl)}
                        className="w-full mt-2 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        style={{ background: '#0F766E', color: 'white', border: 'none', cursor: 'pointer' }}>
                        Use this template →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Save template modal ── */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowSaveTemplate(false)}>
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <h3 className={`font-semibold mb-1 ${dk ? 'text-white' : 'text-gray-900'}`}>Save as Template</h3>
            <p style={{ fontSize: 14, marginBottom: 16, color: muted }}>Name this template so you can reuse it on future estimates.</p>
            <input autoFocus value={templateName} onChange={e => setTemplateName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTemplate(); if (e.key === 'Escape') setShowSaveTemplate(false) }}
              placeholder="e.g. Interior Paint 2BHK"
              className={`w-full text-sm px-3 py-2.5 rounded-lg mb-4 ${dk ? 'bg-[#0F172A] text-white' : 'bg-[#F5F4F0] text-gray-900'}`}
              style={{ boxShadow: '0 0 0 1.5px #0F766E' }}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveTemplate(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm border ${dk ? 'border-[#334155] text-slate-400' : 'border-[#E8E2D9] text-gray-600'}`}>Cancel</button>
              <button onClick={saveTemplate} disabled={savingTemplate || !templateName.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white hover:opacity-90 disabled:opacity-50">
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Delete template confirmation modal ── */}
      {confirmDeleteTpl && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmDeleteTpl(null)}>
          <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${dk ? 'bg-[#1E293B]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FEE2E2' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
              <div>
                <h3 className={`font-bold text-base ${dk ? 'text-white' : 'text-gray-900'}`}>Delete template?</h3>
                <p className={`text-sm mt-0.5 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>"{confirmDeleteTpl.name}" will be permanently removed.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteTpl(null)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 ${dk ? 'border-[#334155] text-slate-300' : 'border-gray-200 text-gray-700'}`}>
                Cancel
              </button>
              <button onClick={async () => {
                await fetch(`/api/estimate-templates?id=${confirmDeleteTpl.id}`, { method: 'DELETE' })
                setTemplates(prev => prev.filter(t => t.id !== confirmDeleteTpl!.id))
                setConfirmDeleteTpl(null)
              }} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#DC2626' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>

    {/* Mobile sticky bottom CTA — primary action above fold */}
    {estimate && !['void','declined','invoiced','paid'].includes(estimate.status) && (
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 py-3"
        style={{ background: dk ? 'rgba(10,22,40,0.96)' : 'rgba(255,255,255,0.96)', backdropFilter:'blur(8px)', borderTop: '1px solid ' + t.cardBorder, boxShadow:'0 -4px 20px rgba(0,0,0,0.10)' }}>
        <div className="flex gap-2">
          {estimate.status === 'draft' && (
            <button
              onClick={async () => {
                // Email resolved server-side from lead — no client-side gate needed
                if (!estimate.items?.length || estimate.total <= 0) { setSaveMsg('Add at least one item before sending'); setTimeout(() => setSaveMsg(null), 3000); return }
                const sentAt = new Date().toISOString()
                await handleSave()
                const [, sendResult] = await Promise.all([
                  fetch(`/api/estimates/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...estimate, status:'sent', sent_at: sentAt }) }),
                  fetch('/api/estimates/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ estimateId: id, pro_id: session?.id }) }),
                ])
                setEstimate(prev => prev ? { ...prev, status:'sent', timeline: prev.timeline.map(tl => tl.event === 'sent' ? { ...tl, timestamp: sentAt } : tl) } : prev)
                setSaveMsg(sendResult.ok ? 'Estimate sent ✓' : 'Status updated — email failed')
                setTimeout(() => setSaveMsg(null), 4000)
              }}
              disabled={saving}
              style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize: 15, fontWeight:700, cursor:'pointer' }}>
              Send Estimate
            </button>
          )}
          {estimate.status === 'approved' && (
            <button onClick={openInvoiceModal}
              style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#15803D,#16A34A)', color:'white', fontSize: 15, fontWeight:700, cursor:'pointer' }}>
              Create Invoice
            </button>
          )}
          {(estimate.status === 'sent' || estimate.status === 'viewed') && (
            <button onClick={async () => {
              // Email resolved server-side from lead — no client-side gate needed
              const r = await fetch('/api/estimates/send-reminder', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ estimateId: id, contactEmail: estimate.contact_email, pro_id: session?.id }) })
              setSaveMsg(r.ok ? 'Reminder sent ✓' : 'Failed to send reminder')
              setTimeout(() => setSaveMsg(null), 3000)
            }}
              style={{ flex:1, padding:'13px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7C3AED,#6D28D9)', color:'white', fontSize: 15, fontWeight:700, cursor:'pointer' }}>
              Send Reminder
            </button>
          )}
          <button onClick={() => router.back()}
            style={{ width:48, padding:'13px', borderRadius:12, border: '1.5px solid ' + t.cardBorder, background:'transparent', color: t.textMuted, fontSize: 18, cursor:'pointer' }}>
            ←
          </button>
        </div>
      </div>
    )}
    </>
  )
}

// ── Notes & Attachments tab ────────────────────────────────────────────────
function NotesTab({ estimate, setEstimate, darkMode }: {
  estimate: Estimate
  setEstimate: React.Dispatch<React.SetStateAction<Estimate | null>>
  darkMode: boolean
}) {
  const dk = darkMode
  const t = theme(dk)
  const [note, setNote] = React.useState(estimate.notes || '')
  const [saving, setSaving] = React.useState(false)
  const [saved,  setSaved]  = React.useState(false)

  const border  = t.cardBorder
  const bgCard  = t.cardBg
  const col     = t.textPri
  const colMuted= t.textMuted

  // C8 FIX: save to DB, not just local state
  const saveNote = async () => {
    setSaving(true)
    try {
      await fetch(`/api/estimates/${estimate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: note }),
      })
      setEstimate(prev => prev ? { ...prev, notes: note } : prev)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch { /* silent — toast not critical here */ }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Internal notes */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#6B7280', marginBottom: 8, display: 'block' }}>
          Internal Notes
        </label>
        <textarea
          value={note}
          onChange={e => { setNote(e.target.value); setSaved(false) }}
          placeholder="Add notes visible only to you — job details, client preferences, reminders..."
          rows={5}
          style={{
            width: '100%', padding: '12px 14px', fontSize: 15, borderRadius: 10,
            border: '1.5px solid ' + border, background: dk ? '#0f172a' : '#f9fafb',
            color: col, resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' as const,
          }}
          onFocus={e => (e.target.style.borderColor = '#0F766E')}
          onBlur={e => (e.target.style.borderColor = border)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8, alignItems: 'center' }}>
          {saved && <span style={{ fontSize: 14, color: '#0F766E' }}>✓ Saved</span>}
          <button onClick={saveNote} disabled={saving}
            style={{ padding: '7px 18px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', background: '#0F766E', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>

      {/* Attachments placeholder */}
      <div style={{ border: '1.5px dashed ' + border, borderRadius: 12, padding: '28px 20px', textAlign: 'center' as const }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: dk ? '#0f172a' : '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, color: col, marginBottom: 4 }}>File Attachments</p>
        <p style={{ fontSize: 14, color: colMuted, marginBottom: 12 }}>Attach photos, contracts, or reference documents to this estimate.</p>
        <button style={{ padding: '8px 18px', fontSize: 14, fontWeight: 500, borderRadius: 8, border: '1.5px solid ' + border, background: 'transparent', color: colMuted, cursor: 'not-allowed', opacity: 0.5 }}>
          Upload Files — coming in v76
        </button>
      </div>
    </div>
  )
}


function EstimateSkeleton({ dk }: { dk: boolean }) {
  const shimmer = dk ? 'bg-[#1E293B] animate-pulse' : 'bg-gray-100 animate-pulse'
  return (
    <div className="space-y-5">
      <div className={`h-32 rounded-xl ${shimmer}`} />
      <div className="flex gap-5">
        <div className={`flex-1 h-96 rounded-xl ${shimmer}`} />
        <div className={`w-[340px] h-96 rounded-xl ${shimmer}`} />
      </div>
    </div>
  )
}

// MOCK_ESTIMATE removed — API is now fully built
