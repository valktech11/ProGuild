'use client'
import React, { use, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/tokens'

// ── Types ──────────────────────────────────────────────────────────────────────
type InvoiceItem = { id: string; name: string; description?: string; qty: number; unit_price: number; amount: number }
type Milestone   = { id: string; name: string; pct: number; amount: number; due_when: string }
type Payment     = { id: string; milestone_name: string; amount: number; method: string; reference?: string; date: string; recorded_at: string }

type Invoice = {
  id: string; invoice_number: string
  status: 'draft' | 'sent' | 'viewed' | 'partial_payment' | 'paid' | 'void'
  estimate_id: string | null; lead_id: string | null
  lead_name: string; contact_name: string | null
  contact_email: string | null; contact_phone: string | null
  items: InvoiceItem[]
  subtotal: number; discount: number; discount_type: string
  tax_rate: number; tax_amount: number; total: number
  deposit_paid: number; balance_due: number; amount_paid: number
  deposit_percent: number; deposit_amount: number
  payment_terms: string; payment_milestones: Milestone[] | null
  payment_history: Payment[] | null
  issue_date: string; due_date: string | null
  sent_at: string | null; viewed_at: string | null; paid_at: string | null
  viewed_count: number
  notes: string | null; terms: string | null; trade: string
  resend_message_id: string | null; sent_to_email: string | null
  email_status: string | null
  // joined pro
  pro?: {
    full_name: string; business_name: string | null
    city: string | null; state: string | null
    phone_cell: string | null; license_number: string | null
    logo_url: string | null; plan_tier: string | null
  }
}

const C = {
  teal: '#0F766E', tealLight: '#F0FDFA', green: '#16A34A', greenBg: '#F0FDF4',
  amber: '#F59E0B', red: '#DC2626', navy: '#0A1628',
  border: '#E2E8F0', muted: '#94A3B8', text: '#0F172A',
}
const fmt = (n: number) => n?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '$0.00'
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// ── Back nav ───────────────────────────────────────────────────────────────────
function BackNav({ router }: { router: ReturnType<typeof useRouter> }) {
  const params = useSearchParams()
  const from   = params.get('from')
  const leadId = params.get('lead_id')
  const { label, href } =
    from === 'pipeline' && leadId ? { label: '← Back to Lead',     href: `/dashboard/pipeline/${leadId}` } :
                                    { label: '← Back to Invoices', href: '/dashboard/invoices' }
  return (
    <button onClick={() => router.push(href)}
      style={{ fontSize: 14, color: C.muted, background: 'none', border: 'none',
        cursor: 'pointer', marginBottom: 20, padding: 0 }}>
      {label}
    </button>
  )
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:           { label: 'Draft',           bg: '#F1F5F9', color: '#64748B' },
  sent:            { label: 'Sent',            bg: '#EFF6FF', color: '#2563EB' },
  viewed:          { label: 'Viewed',          bg: '#F0FDF4', color: '#16A34A' },
  partial_payment: { label: 'Partial Payment', bg: '#FFFBEB', color: '#D97706' },
  paid:            { label: 'Paid ✓',          bg: '#F0FDF4', color: '#15803D' },
  void:            { label: 'Void',            bg: '#FEF2F2', color: '#B91C1C' },
}

// ── Record Payment Modal ───────────────────────────────────────────────────────
function RecordPaymentModal({ invoice, paidMs, onRecord, onClose, t }: {
  invoice: Invoice
  paidMs: string[]
  onRecord: (data: { milestone_name: string; amount: number; method: string; reference: string; date: string }) => Promise<void>
  onClose: () => void
  t: ReturnType<typeof theme>
}) {
  const milestones: Milestone[] = (invoice.payment_milestones ?? []).filter(m => m.pct > 0 && m.amount > 0)

  // Sum payments per milestone to detect fully-paid vs partial
  const paidPerMs: Record<string, number> = {}
  for (const p of paidMs) {
    // paidMs here is the raw history entries (milestone_name strings)
    // We rebuild from invoice.payment_history for amounts
  }
  const msPayments: Record<string, number> = {}
  for (const p of (invoice.payment_history ?? [])) {
    msPayments[p.milestone_name] = Math.round(((msPayments[p.milestone_name] ?? 0) + (Number(p.amount) || 0)) * 100) / 100
  }
  // Show milestones that are NOT fully paid (including partial ones — remaining amount)
  const unpaidMs = milestones
    .filter(m => (msPayments[m.name] ?? 0) < m.amount - 0.005)
    .map(m => ({ ...m, amount: Math.max(0, Math.round((m.amount - (msPayments[m.name] ?? 0)) * 100) / 100) }))
  const defaultMs = unpaidMs[0] ?? null

  const [selectedMs, setSelectedMs] = useState<Milestone | null>(defaultMs)
  const [amount,    setAmount]    = useState(defaultMs ? String(defaultMs.amount) : String(invoice.balance_due))
  const [method,    setMethod]    = useState('zelle')
  const [reference, setReference] = useState('')
  const [date,      setDate]      = useState(new Date().toISOString().split('T')[0])
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState<string | null>(null)

  const handleMsSelect = (ms: Milestone | null) => {
    setSelectedMs(ms)
    setAmount(ms ? String(ms.amount) : String(invoice.balance_due))
    if (err) setErr(null)
  }

  const handle = async () => {
    const amt = parseFloat(amount) || 0
    if (amt <= 0) { setErr('Enter an amount greater than zero.'); return }
    if (amt > invoice.balance_due + 0.005) { setErr(`That's more than the ${fmt(invoice.balance_due)} balance due.`); return }
    setSaving(true)
    await onRecord({ milestone_name: selectedMs?.name ?? 'Payment', amount: amt, method, reference, date })
    setSaving(false)
  }

  const modal = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Record Payment Received</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22,
            color: C.muted, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Info note */}
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#F0FDF4',
            border: '1px solid #BBF7D0', fontSize: 12, color: '#065F46', lineHeight: 1.5 }}>
            📋 This records a payment you already received (cash, check, Zelle etc).
            It does not charge the homeowner — money was collected outside the system.
          </div>
          {/* Milestone selector — shown when milestones exist */}
          {unpaidMs.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const,
                letterSpacing: '0.08em', color: C.muted, marginBottom: 8 }}>Which milestone?</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                {unpaidMs.map(ms => (
                  <button key={ms.name} onClick={() => handleMsSelect(ms)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${selectedMs?.name === ms.name ? C.teal : C.border}`,
                      background: selectedMs?.name === ms.name ? '#F0FDFA' : '#fff',
                      cursor: 'pointer', textAlign: 'left' as const }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{ms.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{ms.pct}% · {ms.due_when}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: selectedMs?.name === ms.name ? C.teal : C.text }}>
                      {fmt(ms.amount)}
                    </div>
                  </button>
                ))}
                <button onClick={() => handleMsSelect(null)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${selectedMs === null ? C.teal : C.border}`,
                    background: selectedMs === null ? '#F0FDFA' : '#fff',
                    cursor: 'pointer', textAlign: 'left' as const }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Other / partial payment</div>
                  <div style={{ fontSize: 11, color: C.muted }}>enter amount below</div>
                </button>
              </div>
            </div>
          )}
          {/* Amount */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>Amount Received</div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: C.muted, fontSize: 15 }}>$</span>
              <input type="number" value={amount} onChange={e => { setAmount(e.target.value); if (err) setErr(null) }}
                style={{ width: '100%', paddingLeft: 28, padding: '10px 12px 10px 28px',
                  border: `1.5px solid ${err ? C.red : C.border}`, borderRadius: 10, fontSize: 15,
                  outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {err && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: C.red }}>{err}</div>}
          </div>
          {/* Method + Date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>Method</div>
              <select value={method} onChange={e => setMethod(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`,
                  borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff' }}>
                {['Cash','Check','Zelle','Venmo','Card','Bank Transfer','Other'].map(m => (
                  <option key={m} value={m.toLowerCase().replace(' ', '_')}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>Date Received</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`,
                  borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          {/* Reference */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: C.muted, marginBottom: 6 }}>Reference # (optional)</div>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="Check #1234, Zelle confirmation..."
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${C.border}`,
                borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`,
          display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.muted, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handle} disabled={saving}
            style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none',
              background: C.green, color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Recording…' : 'Mark as Received'}
          </button>
        </div>
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params)
  const router  = useRouter()

  const { session, loading: _authLoading } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => { const n = !dk; setDk(n); localStorage.setItem('pg_darkmode', n ? '1' : '0') }

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)
  const [showPayModal,  setShowPayModal]  = useState(false)
  const [sending, setSending] = useState(false)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (_authLoading) return
    if (!session) { router.replace('/login'); return }
    fetch(`/api/invoices/${id}`)
      .then(r => r.json())
      .then(d => { if (d.invoice) setInvoice(d.invoice) })
      .finally(() => setLoading(false))
  }, [id, session, router])

  const patch = async (fields: Record<string, unknown>) => {
    const r = await fetch(`/api/invoices/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const d = await r.json()
    if (r.ok && d.invoice) setInvoice(d.invoice)
    return r.ok
  }

  const handleSend = async () => {
    if (!invoice) return
    setSending(true)
    const r = await fetch('/api/invoices/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoice.id, pro_id: session?.id }),
    })
    setSending(false)
    if (r.ok) {
      // Refresh full invoice state so button label updates correctly
      fetch(`/api/invoices/${id}`)
        .then(r => r.json())
        .then(d => { if (d.invoice) setInvoice(d.invoice) })
      showToast('Invoice sent to homeowner ✓')
    } else {
      showToast('Failed to send — check email address', false)
    }
  }

  const handleRecordPayment = async (data: { milestone_name: string; amount: number; method: string; reference: string; date: string }) => {
    if (!invoice) return
    // Client sends only the payment; the server appends it and derives
    // amount_paid / balance_due / status / paid_at (lib/invoices/balances).
    const r = await fetch(`/api/invoices/${id}/record-payment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_id: session?.id, ...data }),
    })
    if (!r.ok) { showToast('Failed to record payment', false); return }
    // Re-pull the full invoice so items/timeline stay intact; balances are server-truth.
    const fd = await (await fetch(`/api/invoices/${id}`)).json()
    if (fd.invoice) setInvoice(fd.invoice)
    setShowPayModal(false)
    const paidInFull = (fd.invoice?.balance_due ?? 1) <= 0
    showToast(paidInFull ? 'Invoice paid in full ✓' : `Payment of ${fmt(data.amount)} recorded ✓`)
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
        <button onClick={() => router.push('/dashboard/invoices')}
          style={{ marginTop: 12, color: C.teal, background: 'none', border: 'none', cursor: 'pointer', fontSize: 15 }}>
          ← Back to Invoices
        </button>
      </div>
    </DashboardShell>
  )

  const isPaid    = invoice.status === 'paid'
  const isDraft   = invoice.status === 'draft'
  const canSend   = ['draft', 'sent', 'viewed', 'partial_payment'].includes(invoice.status)
  const ss        = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.draft
  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date() && !isPaid
  const pctPaid   = invoice.total > 0 ? Math.min(100, Math.round((invoice.amount_paid / invoice.total) * 100)) : 0
  const pro       = (invoice as any).pro as Invoice['pro']
  const milestones: Milestone[] = (invoice.payment_milestones ?? []).filter(m => m.pct > 0 && m.amount > 0)
  const history: Payment[]      = invoice.payment_history    ?? []

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '20px 24px 60px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Toast */}
          {toast && (
            <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
              zIndex: 3000, padding: '12px 24px', borderRadius: 12,
              background: toast.ok ? C.teal : C.red, color: '#fff',
              fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
              {toast.msg}
            </div>
          )}

          {/* Back */}
          <Suspense fallback={<div style={{ height: 32 }} />}>
            <BackNav router={router} />
          </Suspense>

          {/* Top header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: t.textPri, margin: 0, letterSpacing: '-0.5px' }}>
                #{invoice.invoice_number}
              </h1>
              <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                background: ss.bg, color: ss.color }}>
                {ss.label}
              </span>
              {isOverdue && (
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                  background: '#FEF2F2', color: '#B91C1C' }}>
                  Overdue
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {canSend && (
                <button onClick={handleSend} disabled={sending}
                  style={{ padding: '9px 20px', borderRadius: 10, border: 'none',
                    background: C.teal, color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: sending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📤 {invoice.status === 'draft' ? 'Send Invoice' : invoice.status === 'partial_payment' ? 'Resend Payment Link' : 'Resend Invoice'}
                </button>
              )}
              {!isPaid && (
                <button onClick={() => setShowPayModal(true)}
                  style={{ padding: '9px 20px', borderRadius: 10, border: 'none',
                    background: C.green, color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  💰 Record Payment
                </button>
              )}
              <button onClick={() => window.open(`/invoice/${id}`, '_blank')}
                style={{ padding: '9px 20px', borderRadius: 10, border: `1.5px solid ${t.cardBorder}`,
                  background: 'transparent', color: t.textBody, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                👁 View as Client
              </button>
            </div>
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

            {/* ── LEFT ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Invoice document header */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                borderRadius: 16, overflow: 'hidden' }}>
                {/* Dark header band */}
                <div style={{ background: C.teal, padding: '24px 28px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {/* Pro info */}
                  <div>
                    {pro?.logo_url ? (
                      <img src={pro.logo_url} alt="Logo"
                        style={{ height: 48, maxWidth: 160, objectFit: 'contain', marginBottom: 12, borderRadius: 4 }} />
                    ) : (
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                        {pro?.business_name ?? pro?.full_name ?? session?.name ?? 'Your Company'}
                      </div>
                    )}
                    {pro?.logo_url && (
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                        {pro?.business_name ?? pro?.full_name}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                      {[pro?.city, pro?.state].filter(Boolean).join(', ')}
                    </div>
                    {pro?.license_number && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                        License #{pro.license_number}
                      </div>
                    )}
                  </div>
                  {/* Invoice meta */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em',
                      textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                      Invoice
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
                      #{invoice.invoice_number}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        Issued <span style={{ color: '#fff', fontWeight: 600 }}>{fmtDate(invoice.issue_date)}</span>
                      </div>
                      {invoice.due_date && (
                        <div style={{ fontSize: 12, color: isOverdue ? '#FCA5A5' : 'rgba(255,255,255,0.5)' }}>
                          Due <span style={{ color: isOverdue ? '#FCA5A5' : '#fff', fontWeight: 600 }}>
                            {fmtDate(invoice.due_date)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bill to */}
                <div style={{ padding: '20px 28px', borderBottom: `1px solid ${t.cardBorder}`,
                  display: 'flex', gap: 40 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.1em', color: t.textSubtle, marginBottom: 8 }}>Billed To</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: t.textPri }}>
                      {invoice.contact_name ?? invoice.lead_name}
                    </div>
                    {invoice.contact_phone && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{invoice.contact_phone}</div>
                    )}
                    {invoice.contact_email && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{invoice.contact_email}</div>
                    )}
                  </div>
                  {invoice.estimate_id && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.1em', color: t.textSubtle, marginBottom: 8 }}>Reference</div>
                      <div style={{ fontSize: 13, color: t.textMuted }}>Approved Proposal</div>
                      <button onClick={() => router.push(`/dashboard/estimates/${invoice.estimate_id}`)}
                        style={{ border: 'none', background: 'none', color: C.teal, fontSize: 13,
                          fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: 2 }}>
                        View Estimate →
                      </button>
                    </div>
                  )}
                </div>

                {/* Line items */}
                <div style={{ padding: '0 28px' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 88px 88px',
                    gap: 12, padding: '12px 0', borderBottom: `1px solid ${t.divider}` }}>
                    {['Description', 'Qty', 'Unit Price', 'Amount'].map((h, i) => (
                      <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: t.textSubtle,
                        textAlign: i > 0 ? 'right' : 'left' as any }}>
                        {h}
                      </div>
                    ))}
                  </div>
                  {(invoice.items ?? []).map((item, i) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 88px 88px',
                      gap: 12, padding: '14px 0',
                      borderBottom: i < invoice.items.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>{item.name}</div>
                        {item.description && item.description !== item.name && (
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{item.description}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: t.textBody, textAlign: 'right' }}>{item.qty}</div>
                      <div style={{ fontSize: 14, color: t.textBody, textAlign: 'right' }}>{fmt(item.unit_price)}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: t.textPri, textAlign: 'right' }}>{fmt(item.amount)}</div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div style={{ padding: '16px 28px 24px', display: 'flex', justifyContent: 'flex-end',
                  borderTop: `1px solid ${t.cardBorder}` }}>
                  <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.textMuted }}>
                      <span>Subtotal</span><span>{fmt(invoice.subtotal)}</span>
                    </div>
                    {invoice.discount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: t.textMuted }}>Discount</span>
                        <span style={{ color: C.green }}>− {fmt(invoice.discount)}</span>
                      </div>
                    )}
                    {invoice.tax_rate > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: t.textMuted }}>
                        <span>Tax ({invoice.tax_rate}%)</span><span>{fmt(invoice.tax_amount)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      paddingTop: 10, borderTop: `2px solid ${t.cardBorder}` }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>Total</span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: t.textPri }}>{fmt(invoice.total)}</span>
                    </div>
                    {invoice.amount_paid > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: t.textMuted }}>Paid to date</span>
                          <span style={{ color: C.green }}>− {fmt(invoice.amount_paid)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                          paddingTop: 10, borderTop: `2px solid ${t.cardBorder}` }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>Balance Due</span>
                          <span style={{ fontSize: 22, fontWeight: 900,
                            color: isPaid ? C.green : C.teal }}>{fmt(invoice.balance_due)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment schedule */}
              {milestones.length > 0 && (
                <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                  borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: t.textSubtle, marginBottom: 16 }}>
                    Payment Schedule
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {milestones.map((m, i) => {
                      const paidAmt   = Math.round(history.filter(p => p.milestone_name === m.name).reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100
                      const paid      = paidAmt >= m.amount - 0.005
                      const isPartial = !paid && paidAmt > 0
                      const remaining = Math.max(0, Math.round((m.amount - paidAmt) * 100) / 100)
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 14,
                          padding: '12px 16px', borderRadius: 12,
                          background: paid ? C.greenBg : isPartial ? '#FFFBEB' : t.cardBgAlt,
                          border: `1px solid ${paid ? '#BBF7D0' : isPartial ? '#FDE68A' : t.cardBorder}` }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                            background: paid ? C.green : isPartial ? '#F59E0B' : '#E2E8F0',
                            color: paid || isPartial ? '#fff' : t.textSubtle,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700 }}>
                            {paid ? '✓' : isPartial ? '½' : i + 1}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPri }}>{m.name}</div>
                            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>
                              {m.pct}% · {m.due_when}
                            </div>
                            {isPartial && (
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#B45309', marginTop: 3 }}>
                                {fmt(paidAmt)} received · {fmt(remaining)} remaining
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 800,
                            color: paid ? C.green : isPartial ? '#B45309' : t.textPri }}>
                            {isPartial ? fmt(remaining) : fmt(m.amount)}
                          </div>
                          {paid && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.green,
                              padding: '2px 8px', borderRadius: 20, background: '#D1FAE5' }}>
                              Received
                            </div>
                          )}
                          {isPartial && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309',
                              padding: '2px 8px', borderRadius: 20, background: '#FEF3C7' }}>
                              Partial
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Terms */}
              {invoice.terms && (
                <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                  borderRadius: 16, padding: '20px 24px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: t.textSubtle, marginBottom: 10 }}>
                    Terms & Conditions
                  </div>
                  <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.7, margin: 0 }}>{invoice.terms}</p>
                </div>
              )}
            </div>

            {/* ── RIGHT SIDEBAR ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 20 }}>

              {/* Balance due */}
              {(() => {
                const radius = 44
                const circ   = 2 * Math.PI * radius
                const filled = circ * (pctPaid / 100)
                const gap    = circ - filled
                const doneColor  = isPaid ? C.green : C.teal
                const restColor  = '#E2E8F0'
                return (
                  <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`,
                    borderRadius: 16, padding: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const,
                      letterSpacing: '0.1em', color: t.textSubtle, marginBottom: 16 }}>
                      {isPaid ? 'Paid in Full ✓' : 'Balance Due'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      {/* Donut */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <svg width={100} height={100} viewBox="0 0 100 100">
                          <circle cx={50} cy={50} r={radius} fill="none"
                            stroke={restColor} strokeWidth={10} />
                          <circle cx={50} cy={50} r={radius} fill="none"
                            stroke={doneColor} strokeWidth={10}
                            strokeDasharray={`${filled} ${gap}`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)" />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex',
                          flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: doneColor, lineHeight: 1 }}>{pctPaid}%</span>
                          <span style={{ fontSize: 9, fontWeight: 600, color: t.textSubtle, marginTop: 2 }}>paid</span>
                        </div>
                      </div>
                      {/* Amounts */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {!isPaid && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 600, color: t.textSubtle, marginBottom: 2 }}>Remaining</div>
                            <div style={{ fontSize: 26, fontWeight: 900, color: '#0F172A',
                              letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 8 }}>
                              {fmt(invoice.balance_due)}
                            </div>
                          </>
                        )}
                        {invoice.amount_paid > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: t.textSubtle }}>Paid</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>{fmt(invoice.amount_paid)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: t.textSubtle }}>Total</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: t.textPri }}>{fmt(invoice.total)}</span>
                        </div>
                        {isPaid && (
                          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: C.green }}>
                            Paid in Full ✓
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Email status */}
              <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: t.textSubtle, marginBottom: 12 }}>Email Status</div>
                {invoice.sent_at ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 13, color: t.textPri }}>
                      ✉ Sent {new Date(invoice.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    {invoice.sent_to_email && (
                      <div style={{ fontSize: 12, color: t.textMuted }}>→ {invoice.sent_to_email}</div>
                    )}
                    {invoice.viewed_at && (
                      <div style={{ fontSize: 12, color: C.green }}>
                        👁 Viewed{invoice.viewed_count > 1 ? ` ${invoice.viewed_count}×` : ''}
                      </div>
                    )}
                    {invoice.email_status === 'bounced' && (
                      <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>⚠ Email bounced</div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: t.textMuted }}>Not sent yet</div>
                )}
              </div>

              {/* Payment history */}
              {history.length > 0 && (
                <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.1em', color: t.textSubtle, marginBottom: 12 }}>Payment History</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {history.map(p => (
                      <div key={p.id} style={{ paddingBottom: 10, borderBottom: `1px solid ${t.divider}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{p.milestone_name}</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{fmt(p.amount)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                          {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {' · '}{p.method.charAt(0).toUpperCase() + p.method.slice(1).replace('_', ' ')}
                          {p.reference ? ` · ${p.reference}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick links — lead only; estimate link already in invoice header Reference section */}
              {invoice.lead_id && (
                <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: 18 }}>
                  <button onClick={() => router.push(`/dashboard/pipeline/${invoice.lead_id}`)}
                    style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: `1px solid ${t.cardBorder}`,
                      background: 'transparent', color: t.textBody, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'left' }}>
                    → Open Lead
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Record payment modal */}
      {showPayModal && (
        <RecordPaymentModal
          invoice={invoice}
          paidMs={history.map(p => p.milestone_name)}
          onRecord={handleRecordPayment}
          onClose={() => setShowPayModal(false)}
          t={t}
        />
      )}
    </DashboardShell>
  )
}
