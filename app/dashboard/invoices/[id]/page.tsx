'use client'
import { fmtCurrency } from '@/lib/utils'

import React, { use, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Send, CreditCard, Link2, Check } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme, T } from '@/lib/tokens'
import { invoiceStatusStyle } from '@/lib/design'

type InvoiceItem = { id: string; name: string; description: string; qty: number; unit_price: number; amount: number }

type Invoice = {
  id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'viewed' | 'partial_payment' | 'paid' | 'void'
  estimate_id: string | null
  lead_id: string | null
  lead_name: string
  trade: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  items: InvoiceItem[]
  subtotal: number
  discount: number
  discount_type: string
  tax_rate: number
  tax_amount: number
  total: number
  deposit_paid: number
  balance_due: number
  amount_paid: number
  payment_terms: string
  issue_date: string
  due_date: string | null
  sent_at: string | null
  viewed_at: string | null
  paid_at: string | null
  notes: string | null
  terms: string | null
  created_at: string
}

const PAYMENT_TERMS: Record<string, string> = {
  due_on_receipt: 'Due on receipt',
  net_7:  'Net 7',
  net_14: 'Net 14',
  net_30: 'Net 30',
}



function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

type ThemeType = ReturnType<typeof theme>
const ThemeCtx = React.createContext<{ t: ThemeType; dk: boolean }>({ t: theme(false), dk: false })

// ── SearchParams reader (must be in Suspense per App Router rules) ─────────────
function BackNav({ router }: { router: ReturnType<typeof useRouter> }) {
  const params = useSearchParams()
  const from   = params.get('from')
  const leadId = params.get('lead_id')
  const estId  = params.get('est_id')
  const { t }  = React.useContext(ThemeCtx)

  const { label, href } =
    from === 'pipeline' && leadId ? { label: '← Back to Lead',     href: `/dashboard/pipeline/${leadId}` } :
    from === 'estimates' && estId ? { label: '← Back to Estimate', href: `/dashboard/estimates/${estId}` } :
                                    { label: '← Back to Invoices', href: '/dashboard/invoices' }

  return (
    <button onClick={() => router.push(href)}
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20 }}>
      {label}
    </button>
  )
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = use(params)
  const router   = useRouter()

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
    const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0')
  }

  const [invoice,       setInvoice]      = useState<Invoice | null>(null)
  const [loading,       setLoading]      = useState(true)
  const [saveMsg,       setSaveMsg]      = useState<string | null>(null)
  const [saving,        setSaving]       = useState(false)
  const [showMarkPaid,  setShowMarkPaid] = useState(false)
  const [payAmount,     setPayAmount]    = useState('')
  const [payMethod,     setPayMethod]    = useState('cash')
  const [payNotes,      setPayNotes]     = useState('')
  const [markingPaid,   setMarkingPaid]  = useState(false)

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    fetch(`/api/invoices/${id}`)
      .then(r => r.json())
      .then(d => { if (d.invoice) setInvoice(d.invoice) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, session, router])

  const patchInvoice = async (fields: Record<string, unknown>) => {
    if (!invoice) return
    const r = await fetch(`/api/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const d = await r.json()
    if (r.ok && d.invoice) setInvoice(d.invoice)
    return r.ok
  }

  const handleMarkSent = async () => {
    setSaving(true)
    const sentAt = new Date().toISOString()
    const ok = await patchInvoice({ status: 'sent', sent_at: sentAt })
    setSaving(false)
    setSaveMsg(ok ? 'Marked as sent ✓' : 'Failed to update')
    setTimeout(() => setSaveMsg(null), 3000)
  }

  const handleMarkPaid = async () => {
    if (!invoice) return
    setMarkingPaid(true)
    const amount = parseFloat(payAmount) || invoice.balance_due
    const r = await fetch('/api/invoices/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_id:     invoice.id,
        amount,
        payment_method: payMethod,
        notes:          payNotes || undefined,
      }),
    })
    const d = await r.json()
    setMarkingPaid(false)
    if (r.ok) {
      setInvoice(prev => prev ? {
        ...prev,
        status:      d.status,
        balance_due: d.balance_due,
        paid_at:     d.status === 'paid' ? new Date().toISOString() : null,
        amount_paid: amount,
      } : prev)
      setShowMarkPaid(false)
      setSaveMsg(d.status === 'paid' ? 'Invoice marked as paid ✓' : 'Partial payment recorded ✓')
      setTimeout(() => setSaveMsg(null), 4000)
    } else {
      setSaveMsg(d.error || 'Failed to record payment')
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  const t = theme(dk)

  if (loading || !session) return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontSize: 15, color: t.textMuted }}>Loading invoice…</div>
      </div>
    </DashboardShell>
  )

  if (!invoice) return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: t.textMuted }}>Invoice not found.</p>
        <button onClick={() => router.push('/dashboard/invoices')} style={{ marginTop: 12, color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>← Back to Invoices</button>
      </div>
    </DashboardShell>
  )

  const ss        = invoiceStatusStyle(invoice.status)
  const isPaid    = invoice.status === 'paid'
  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && !isPaid

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 20px 60px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Toast */}
          {saveMsg && (
            <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 200, padding: '12px 24px', borderRadius: 12, background: saveMsg.includes('✓') ? '#0F766E' : '#EF4444', color: '#fff', fontSize: 15, fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
              {saveMsg}
            </div>
          )}

          {/* Back nav */}
          <ThemeCtx.Provider value={{ t, dk }}>
            <Suspense fallback={<div style={{ height: 36 }} />}>
              <BackNav router={router} />
            </Suspense>
          </ThemeCtx.Provider>

          <div className="xl:flex xl:gap-6 xl:items-start">
            {/* ── Left column ── */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Header card */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '20px 24px' }}>
                <div className="flex flex-col xl:flex-row xl:items-start xl:gap-6 gap-3">
                  {/* Col 1 */}
                  <div className="xl:flex-1" style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPri, margin: 0 }}>Invoice #{invoice.invoice_number}</h1>
                      <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: dk ? t.cardBgAlt : ss.bg, color: ss.text }}>{ss.label}</span>
                      {isOverdue && <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: '#FEF2F2', color: '#B91C1C' }}>Overdue</span>}
                    </div>
                    <p style={{ fontSize: 15, color: t.textMuted, margin: '0 0 4px' }}>
                      {invoice.lead_id ? (
                        <span
                          onClick={() => router.push(`/dashboard/pipeline/${invoice.lead_id}?from=invoices&inv_id=${invoice.id}`)}
                          style={{ color: '#0F766E', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'rgba(15,118,110,0.3)' }}
                          onMouseEnter={e => (e.currentTarget.style.textDecorationColor = '#0F766E')}
                          onMouseLeave={e => (e.currentTarget.style.textDecorationColor = 'rgba(15,118,110,0.3)')}>
                          {invoice.lead_name}
                        </span>
                      ) : (
                        <span>{invoice.lead_name}</span>
                      )}
                    </p>
                    {invoice.trade && (
                      <p style={{ fontSize: 13, color: t.textSubtle, margin: '0 0 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, background: dk ? '#1E293B' : '#F3F4F6', border: `1px solid ${t.cardBorder}` }}>
                          {invoice.trade}
                        </span>
                      </p>
                    )}
                    {invoice.estimate_id && (
                      <p style={{ fontSize: 14, color: t.textSubtle, margin: '0 0 12px' }}>
                        From Estimate · <span style={{ color: '#0F766E', cursor: 'pointer' }} onClick={() => router.push(`/dashboard/estimates/${invoice.estimate_id}`)}>View Estimate</span>
                      </p>
                    )}
                    {/* Metadata row */}
                    <div className="flex flex-col xl:flex-row xl:items-center xl:gap-0 gap-2">
                      {[
                        { label: 'Issued',        value: new Date(invoice.issue_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), amber: false },
                        { label: 'Due',           value: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : PAYMENT_TERMS[invoice.payment_terms], amber: !!isOverdue },
                        { label: 'Payment Terms', value: PAYMENT_TERMS[invoice.payment_terms] || invoice.payment_terms, amber: false },
                      ].map(({ label, value, amber }, i) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                          {i > 0 && <span className="hidden xl:block" style={{ margin: '0 16px', color: t.cardBorder }}>|</span>}
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.textMuted, margin: '0 0 2px' }}>{label}</p>
                            <p style={{ fontSize: 14, fontWeight: 700, margin: 0, color: amber ? '#F59E0B' : t.textPri }}>{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Col 2 — primary CTA */}
                  <div className="xl:shrink-0 xl:ml-auto">
                    {isPaid ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: '#F0FDF4', color: '#15803D', fontSize: 15, fontWeight: 600 }}>
                        <Check size={16} /> Paid in Full
                      </div>
                    ) : (
                      <button onClick={() => { setPayAmount(String(invoice.balance_due)); setShowMarkPaid(true) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        <CreditCard size={16} /> Record Payment
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Line items — locked */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: `1px solid ${t.cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: t.textPri, margin: 0 }}>Invoice Items</h3>
                  <span style={{ fontSize: 13, color: t.textSubtle, background: t.cardBgAlt, padding: '3px 10px', borderRadius: 20 }}>Locked — work completed</span>
                </div>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px', gap: 12, padding: '10px 24px', borderBottom: `1px solid ${t.divider}` }}>
                  {['Item', 'Qty', 'Unit Price', 'Amount'].map(h => (
                    <span key={h} style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.textSubtle }}>{h}</span>
                  ))}
                </div>
                {invoice.items.map((item, i) => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px', gap: 12, padding: '14px 24px', borderBottom: i < invoice.items.length - 1 ? `1px solid ${t.divider}` : 'none', background: i % 2 === 1 ? t.tableRowAlt : 'transparent' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: t.textPri }}>{item.name}</div>
                      {item.description && <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{item.description}</div>}
                    </div>
                    <div style={{ fontSize: 15, color: t.textBody }}>{item.qty}<span style={{ fontSize: 12, color: t.textSubtle }}> job</span></div>
                    <div style={{ fontSize: 15, color: t.textBody }}>{fmt(item.unit_price)}</div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: t.textPri }}>{fmt(item.amount)}</div>
                  </div>
                ))}

                {/* Totals */}
                <div style={{ padding: '16px 24px', borderTop: `1px solid ${t.cardBorder}`, background: t.cardBgAlt, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                    <Row label="Subtotal"    value={fmt(invoice.subtotal)} t={t} />
                    {invoice.discount > 0 && <Row label="Discount" value={`− ${fmt(invoice.discount)}`} t={t} valueColor="#16a34a" />}
                    {invoice.tax_rate > 0 && <Row label={`Tax (${invoice.tax_rate}%)`} value={fmt(invoice.tax_amount)} t={t} />}
                    <div style={{ borderTop: `1px solid ${t.cardBorder}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: t.textPri }}>Total</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: t.textPri }}>{fmt(invoice.total)}</span>
                    </div>
                    {invoice.deposit_paid > 0 && <Row label="Deposit paid" value={`− ${fmt(invoice.deposit_paid)}`} t={t} valueColor="#0F766E" />}
                    {invoice.deposit_paid > 0 && (
                      <div style={{ borderTop: `2px solid ${t.cardBorder}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: t.textPri }}>Balance Due</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: isPaid ? '#15803D' : '#0F766E' }}>{fmt(invoice.balance_due)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Terms */}
              {invoice.terms && (
                <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '20px 24px' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: t.textPri, marginBottom: 8 }}>Terms & Conditions</h3>
                  <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6, margin: 0 }}>{invoice.terms}</p>
                </div>
              )}

              {/* Client actions */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '16px 20px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: t.textMuted, marginBottom: 14 }}>Client Actions</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button onClick={() => window.open(`${window.location.origin}/invoice/${id}`, '_blank')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', flex: '1 1 auto' }}>
                    <Link2 size={14} /> View Invoice
                  </button>
                  {invoice.status === 'draft' && (
                    <button onClick={handleMarkSent} disabled={saving}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: `2px solid #0F766E`, background: 'transparent', color: '#0F766E', fontSize: 14, fontWeight: 600, cursor: 'pointer', flex: '1 1 auto' }}>
                      <Send size={14} /> Mark as Sent
                    </button>
                  )}
                  {!isPaid && (
                    <button onClick={() => { setPayAmount(String(invoice.balance_due)); setShowMarkPaid(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: `1.5px solid ${t.btnBorder}`, background: 'transparent', color: t.btnText, fontSize: 14, fontWeight: 500, cursor: 'pointer', flex: '1 1 auto' }}>
                      <CreditCard size={14} /> Record Payment
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right sidebar ── */}
            <div className="xl:w-72 xl:flex-shrink-0 mt-4 xl:mt-0" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Payment status */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: t.textPri, marginBottom: 16, margin: '0 0 16px' }}>Payment Status</h3>
                {[
                  { label: 'Invoice sent',     ts: invoice.sent_at },
                  { label: 'Viewed by client', ts: invoice.viewed_at },
                  { label: 'Payment received', ts: invoice.paid_at },
                ].map((item, i, arr) => {
                  const done = !!item.ts
                  return (
                    <div key={item.label} style={{ display: 'flex', gap: 12, paddingBottom: i < arr.length - 1 ? 12 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? '#0F766E' : t.cardBgAlt, color: done ? '#fff' : t.textSubtle, fontSize: 13, border: done ? 'none' : `1px solid ${t.cardBorder}`, flexShrink: 0 }}>
                          {done ? <Check size={13} /> : <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.inputBorder, display: 'block' }} />}
                        </div>
                        {i < arr.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 12, background: done ? '#0F766E' : t.cardBorder, margin: '4px 0' }} />}
                      </div>
                      <div style={{ paddingBottom: i < arr.length - 1 ? 12 : 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: done ? t.textPri : t.textMuted, margin: 0 }}>{item.label}</p>
                        <p style={{ fontSize: 12, color: t.textSubtle, margin: '2px 0 0' }}>
                          {item.ts ? new Date(item.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at ' + new Date(item.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Pending'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Balance summary */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: t.textPri, margin: '0 0 16px' }}>Summary</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                  <Row label="Invoice total"  value={fmt(invoice.total)}        t={t} />
                  {invoice.deposit_paid > 0 && <Row label="Deposit paid" value={`− ${fmt(invoice.deposit_paid)}`} t={t} valueColor="#0F766E" />}
                  {invoice.amount_paid  > 0 && <Row label="Amount paid"  value={`− ${fmt(invoice.amount_paid)}`}  t={t} valueColor="#0F766E" />}
                </div>
                <div style={{ borderTop: `1px solid ${t.cardBorder}`, marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: t.textPri }}>Balance due</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: isPaid ? '#15803D' : '#0F766E' }}>{fmt(invoice.balance_due)}</span>
                </div>
              </div>

              {/* Payment terms selector */}
              {!isPaid && (
                <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: t.textPri, margin: '0 0 12px' }}>Payment Terms</h3>
                  <select
                    value={invoice.payment_terms}
                    onChange={async e => {
                      const terms = e.target.value
                      // A11 FIX: calculate due date from issue_date, not today
                      const base = new Date(invoice.issue_date)
                      if (terms === 'net_7')  base.setDate(base.getDate() + 7)
                      if (terms === 'net_14') base.setDate(base.getDate() + 14)
                      if (terms === 'net_30') base.setDate(base.getDate() + 30)
                      await patchInvoice({ payment_terms: terms, due_date: base.toISOString() })
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, outline: 'none' }}
                  >
                    {Object.entries(PAYMENT_TERMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mark as Paid modal */}
      {showMarkPaid && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setShowMarkPaid(false)}>
          <div style={{ background: t.cardBg, borderRadius: 20, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: t.textPri, marginBottom: 6 }}>Record Payment</h3>
            <p style={{ fontSize: 14, color: t.textMuted, marginBottom: 20 }}>Balance due: <strong>{fmt(invoice.balance_due)}</strong></p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.textMuted, display: 'block', marginBottom: 6 }}>Amount Received</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: t.textMuted, fontSize: 15 }}>$</span>
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    style={{ width: '100%', paddingLeft: 28, paddingRight: 12, paddingTop: 10, paddingBottom: 10, borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.textMuted, display: 'block', marginBottom: 6 }}>Payment Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 15, outline: 'none' }}>
                  {['cash','check','card','venmo','zelle','bank_transfer','other'].map(m => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1).replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.textMuted, display: 'block', marginBottom: 6 }}>Notes (optional)</label>
                <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)}
                  placeholder="Check #1234, paid in full..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowMarkPaid(false)}
                style={{ flex: 1, padding: 13, borderRadius: 12, border: `2px solid ${t.cardBorder}`, background: 'transparent', color: t.textMuted, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleMarkPaid} disabled={markingPaid}
                style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: markingPaid ? 0.7 : 1 }}>
                {markingPaid ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

function Row({ label, value, t, valueColor }: { label: string; value: string; t: ReturnType<typeof theme>; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: t.textMuted }}>{label}</span>
      <span style={{ fontWeight: 500, color: valueColor || t.textBody }}>{value}</span>
    </div>
  )
}
