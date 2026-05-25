'use client'
import { use, useEffect, useState } from 'react'

// ── Milestone Payment Flow ─────────────────────────────────────────────────────
// Homeowner selects which milestone to pay, enters payment method + confirmation.
// When Stripe is activated: replace the confirmation step with a Stripe Checkout redirect.
type Milestone = { id: string; name: string; pct: number; amount: number; due_when: string }

function MilestonePaySection({
  invoiceId, milestones, paidMilestones, balanceDue, total, onPaid
}: {
  invoiceId: string
  milestones: Milestone[]
  paidMilestones: string[]
  balanceDue: number
  total: number
  onPaid: (milestoneName: string, amount: number) => void
}) {
  const fmtLocal = (n: number | null | undefined) =>
    '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })

  const unpaid = milestones.filter(m => !paidMilestones.includes(m.name))
  const nextDue = unpaid[0] ?? null

  const [step, setStep]         = useState<'select' | 'confirm' | 'success'>('select')
  const [selMilestone, setSel]  = useState<Milestone | null>(nextDue)
  const [method, setMethod]     = useState<string>('zelle')
  const [reference, setRef]     = useState('')
  const [submitting, setSub]    = useState(false)
  const [error, setError]       = useState<string | null>(null)

  if (!nextDue && milestones.length > 0) return (
    <div className="text-center py-6">
      <div className="text-4xl mb-3">🎉</div>
      <p className="text-base font-bold text-green-700">All payments received!</p>
      <p className="text-sm text-gray-500 mt-1">This invoice has been paid in full.</p>
    </div>
  )

  if (step === 'success') return (
    <div className="text-center py-6">
      <div className="text-4xl mb-3">✅</div>
      <p className="text-base font-bold text-green-700">Payment recorded!</p>
      <p className="text-sm text-gray-500 mt-1">
        {fmtLocal(selMilestone?.amount)} · {selMilestone?.name}
      </p>
      <p className="text-xs text-gray-400 mt-3">Your contractor has been notified.</p>
    </div>
  )

  const handleConfirm = async () => {
    if (!selMilestone) return
    setSub(true); setError(null)
    try {
      const r = await fetch(`/api/invoices/public/${invoiceId}/pay-milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestone_name: selMilestone.name,
          amount: selMilestone.amount,
          method,
          reference,
          date: new Date().toISOString().split('T')[0],
        }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Failed') }
      onPaid(selMilestone.name, selMilestone.amount)
      setStep('success')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSub(false)
    }
  }

  return (
    <div>
      {step === 'select' && (
        <div>
          {/* Milestone selector */}
          <p className="text-sm text-gray-600 mb-4">
            Select the payment you'd like to make:
          </p>
          <div className="space-y-3 mb-5">
            {milestones.map(m => {
              const paid   = paidMilestones.includes(m.name)
              const isSel  = selMilestone?.id === m.id
              return (
                <label key={m.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    paid    ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50' :
                    isSel   ? 'border-[#0F766E] bg-[#F0FDFA]' :
                              'border-gray-200 bg-white hover:border-[#0F766E]'
                  }`}
                  onClick={() => !paid && setSel(m)}>
                  {paid ? (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  ) : (
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                      isSel ? 'border-[#0F766E] bg-[#0F766E]' : 'border-gray-300'
                    }`}>
                      {isSel && <div className="w-full h-full rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className={`text-sm font-bold ${paid ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {m.name}
                    </div>
                    <div className="text-xs text-gray-500">{m.pct}% · {m.due_when}</div>
                  </div>
                  <div className={`text-base font-bold ${
                    paid ? 'text-gray-400 line-through' : isSel ? 'text-[#0F766E]' : 'text-gray-700'
                  }`}>
                    {fmtLocal(m.amount)}
                  </div>
                  {paid && (
                    <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">Paid</span>
                  )}
                </label>
              )
            })}
          </div>
          <button
            disabled={!selMilestone || paidMilestones.includes(selMilestone?.name ?? '')}
            onClick={() => selMilestone && setStep('confirm')}
            className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all"
            style={{
              background: selMilestone ? 'linear-gradient(135deg,#0F766E,#0D9488)' : '#CBD5E1',
              cursor: selMilestone ? 'pointer' : 'default',
              boxShadow: selMilestone ? '0 2px 12px rgba(15,118,110,0.3)' : 'none',
            }}>
            {selMilestone
              ? `Continue to Pay ${fmtLocal(selMilestone.amount)}`
              : 'Select a payment above'}
          </button>
        </div>
      )}

      {step === 'confirm' && selMilestone && (
        <div>
          {/* Payment summary */}
          <div className="bg-[#F0FDFA] border border-[#99F6E4] rounded-xl p-4 mb-5">
            <div className="text-xs font-bold text-[#0F766E] uppercase tracking-wide mb-1">Paying</div>
            <div className="text-2xl font-black text-[#0F766E]">{fmtLocal(selMilestone.amount)}</div>
            <div className="text-sm text-gray-600 mt-1">{selMilestone.name} · {selMilestone.pct}%</div>
          </div>

          {/* Payment method */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              How are you paying?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'zelle',  label: 'Zelle',  icon: '💜' },
                { key: 'venmo',  label: 'Venmo',  icon: '💙' },
                { key: 'check',  label: 'Check',  icon: '📝' },
                { key: 'cash',   label: 'Cash',   icon: '💵' },
                { key: 'card',   label: 'Card',   icon: '💳' },
                { key: 'other',  label: 'Other',  icon: '🏦' },
              ].map(m => (
                <button key={m.key} onClick={() => setMethod(m.key)}
                  className={`py-2.5 px-3 rounded-lg border-2 text-sm font-semibold transition-all text-center ${
                    method === m.key
                      ? 'border-[#0F766E] bg-[#F0FDFA] text-[#0F766E]'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <div>{m.icon}</div>
                  <div className="text-xs mt-0.5">{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Reference */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Reference / Confirmation # (optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={e => setRef(e.target.value)}
              placeholder="e.g. Zelle conf #8821, Check #1234..."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0F766E] transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('select')}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600">
              ← Back
            </button>
            <button onClick={handleConfirm} disabled={submitting}
              className="flex-2 py-3 px-6 rounded-xl font-bold text-white text-sm transition-all"
              style={{
                flex: 2,
                background: submitting ? '#CBD5E1' : 'linear-gradient(135deg,#0F766E,#0D9488)',
                cursor: submitting ? 'default' : 'pointer',
              }}>
              {submitting ? 'Recording…' : `Confirm ${fmtLocal(selMilestone.amount)} Payment`}
            </button>
          </div>
          <p className="text-xs text-center text-gray-400 mt-3">
            🔒 Your contractor will be notified immediately
          </p>
        </div>
      )}
    </div>
  )
}


import { CheckCircle2, FileText } from 'lucide-react'

type InvoiceItem = {
  id: string
  name: string
  description: string
  qty: number
  unit_price: number
  amount: number
}

type PublicInvoice = {
  id: string
  invoice_number: string
  status: 'sent' | 'viewed' | 'partial_payment' | 'paid' | 'void'
  contact_name: string
  lead_name: string
  contact_email: string | null
  contact_phone: string | null
  issue_date: string
  due_date: string | null
  payment_terms: string
  subtotal: number
  discount: number
  tax_rate: number
  tax_amount: number
  total: number
  amount_paid: number
  balance_due: number
  deposit_paid: number
  notes: string | null
  terms: string | null
  items: InvoiceItem[]
  payment_milestones: Array<{ id: string; name: string; pct: number; amount: number; due_when: string }> | null
  payment_history: Array<{ id: string; milestone_name: string; amount: number; method: string; reference?: string; date: string }> | null
}

const fmt = (n: number | null | undefined) =>
  '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TERMS_LABEL: Record<string, string> = {
  due_on_receipt: 'Due on Receipt',
  net_7:  'Net 7 days',
  net_15: 'Net 15 days',
  net_30: 'Net 30 days',
  net_60: 'Net 60 days',
}

export default function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [invoice, setInvoice]       = useState<PublicInvoice | null>(null)
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [paidMilestones, setPaidMs] = useState<string[]>([])

  // Derive paid milestones from payment_history on load
  useEffect(() => {
    if (invoice?.payment_history) {
      setPaidMs(invoice.payment_history.map(p => p.milestone_name))
    }
  }, [invoice?.payment_history])

  useEffect(() => {
    fetch(`/api/invoices/public/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); setLoading(false); return null }; return r.json() })
      .then(d => {
        if (!d) return
        setInvoice(d.invoice)
        setLoading(false)
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-[#F5F4F0] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[#6B7280]">Loading invoice...</p>
      </div>
    </div>
  )

  if (notFound || !invoice) return (
    <div className="min-h-screen bg-[#F5F4F0] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-[#E8E2D9] p-10 text-center max-w-sm w-full">
        <FileText size={40} className="text-gray-300 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">Invoice not available</h1>
        <p className="text-sm text-[#6B7280]">This invoice may not have been sent yet, or the link is incorrect.</p>
      </div>
    </div>
  )

  const isPaid     = invoice.status === 'paid'
  const isPartial  = invoice.status === 'partial_payment'
  const isOverdue  = invoice.due_date ? new Date(invoice.due_date) < new Date() && !isPaid : false
  const balanceDue = invoice.balance_due ?? (invoice.total - (invoice.amount_paid || 0) - (invoice.deposit_paid || 0))

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      {/* Top bar */}
      <div className="bg-white border-b border-[#E8E2D9]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F766E] flex items-center justify-center">
              <span className="text-white text-xs font-bold">PG</span>
            </div>
            <span className="font-bold text-gray-900 text-sm">ProGuild</span>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            isPaid    ? 'bg-green-50 text-green-700' :
            isPartial ? 'bg-blue-50 text-blue-700' :
            isOverdue ? 'bg-red-50 text-red-600' :
                        'bg-amber-50 text-amber-700'
          }`}>
            {isPaid ? 'Paid' : isPartial ? 'Partially Paid' : isOverdue ? 'Overdue' : 'Awaiting Payment'}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* Paid banner */}
        {isPaid && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Payment received — thank you!</p>
              <p className="text-xs text-green-700 mt-0.5">This invoice has been paid in full.</p>
            </div>
          </div>
        )}

        {/* Overdue banner */}
        {isOverdue && !isPaid && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
              <p className="text-sm font-semibold text-red-800">Payment overdue</p>
              <p className="text-xs text-red-700 mt-0.5">
                This invoice was due on {new Date(invoice.due_date!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Please contact your service provider.
              </p>
            </div>
          </div>
        )}

        {/* Invoice header */}
        <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Invoice</p>
              <h1 className="text-2xl font-bold text-gray-900">#{invoice.invoice_number}</h1>
              <p className="text-sm text-[#6B7280] mt-1">
                Prepared for <span className="font-semibold text-gray-900">{invoice.contact_name || invoice.lead_name}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#9CA3AF] mb-1">Balance Due</p>
              <p className={`text-3xl font-bold ${isPaid ? 'text-green-600' : 'text-[#0F766E]'}`}>
                {isPaid ? fmt(0) : fmt(balanceDue)}
              </p>
              {!isPaid && invoice.total !== balanceDue && (
                <p className="text-xs text-[#9CA3AF] mt-1">of {fmt(invoice.total)} total</p>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-6 mt-5 pt-5 border-t border-[#E8E2D9] flex-wrap">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Invoice Date</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {new Date(invoice.issue_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            {invoice.due_date && (
              <>
                <div className="w-px h-8 bg-[#E8E2D9]" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Due Date</p>
                  <p className={`text-sm font-semibold mt-0.5 ${isOverdue && !isPaid ? 'text-red-500' : 'text-gray-900'}`}>
                    {new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </>
            )}
            {invoice.payment_terms && (
              <>
                <div className="w-px h-8 bg-[#E8E2D9]" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Terms</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">
                    {TERMS_LABEL[invoice.payment_terms] || invoice.payment_terms}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border border-[#E8E2D9] overflow-hidden">
          <div className="grid grid-cols-[2fr_40px_80px_80px] md:grid-cols-[1fr_60px_100px_100px] gap-2 md:gap-3 px-4 md:px-6 py-3 bg-gray-50 border-b border-[#E8E2D9]">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280]">Item</span>
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280] text-center">Qty</span>
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280] text-right">Price</span>
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280] text-right">Amount</span>
          </div>

          {(invoice.items || []).map((item, i) => (
            <div key={item.id}
              className={`grid grid-cols-[2fr_40px_80px_80px] md:grid-cols-[1fr_60px_100px_100px] gap-2 md:gap-3 px-4 md:px-6 py-4 ${
                i < invoice.items.length - 1 ? 'border-b border-[#E8E2D9]' : ''
              } ${i % 2 === 1 ? 'bg-[#F9F8F6]' : ''}`}>
              <div>
                <p className="text-[14px] font-semibold text-gray-900 leading-snug">{item.name}</p>
                {item.description && <p className="text-[12px] text-[#6B7280] mt-0.5 leading-snug">{item.description}</p>}
              </div>
              <p className="text-[13px] text-[#6B7280] text-center self-center">{item.qty}</p>
              <p className="text-[13px] text-[#6B7280] text-right self-center">—</p>
              <p className="text-[13px] font-semibold text-gray-900 text-right self-center">{fmt(item.amount)}</p>
            </div>
          ))}

          {(!invoice.items || invoice.items.length === 0) && (
            <div className="px-6 py-8 text-center text-sm text-[#9CA3AF]">No items on this invoice.</div>
          )}

          {/* Totals */}
          <div className="border-t border-[#E8E2D9] px-6 py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#4B5563]">Subtotal</span>
              <span className="font-medium text-gray-900">{fmt(invoice.subtotal)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Discount</span>
                <span className="font-medium text-green-600">− {fmt(invoice.discount)}</span>
              </div>
            )}
            {invoice.tax_rate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Tax ({invoice.tax_rate}%)</span>
                <span className="font-medium text-gray-900">{fmt(invoice.tax_amount)}</span>
              </div>
            )}
            {(invoice.deposit_paid > 0) && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Deposit collected</span>
                <span className="font-medium text-green-600">− {fmt(invoice.deposit_paid)}</span>
              </div>
            )}
            {(invoice.amount_paid > 0) && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Payments received</span>
                <span className="font-medium text-green-600">− {fmt(invoice.amount_paid)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-[#E8E2D9]">
              <span className="font-bold text-gray-900">Balance Due</span>
              <span className={`text-xl font-bold ${isPaid ? 'text-green-600' : 'text-[#0F766E]'}`}>
                {isPaid ? fmt(0) : fmt(balanceDue)}
              </span>
            </div>
          </div>
        </div>

        {/* Milestone payment section */}
        {!isPaid && invoice.payment_milestones && invoice.payment_milestones.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">Make a Payment</h2>
            <p className="text-sm text-[#6B7280] mb-4">
              Select the milestone you're paying for and confirm below.
            </p>
            <MilestonePaySection
              invoiceId={invoice.id}
              milestones={invoice.payment_milestones}
              paidMilestones={paidMilestones}
              balanceDue={balanceDue}
              total={invoice.total}
              onPaid={(name, amount) => {
                setPaidMs(prev => [...prev, name])
                setInvoice(prev => prev ? {
                  ...prev,
                  amount_paid: (prev.amount_paid ?? 0) + amount,
                  balance_due: Math.max(0, (prev.balance_due ?? 0) - amount),
                  status: Math.max(0, (prev.balance_due ?? 0) - amount) <= 0 ? 'paid' : 'partial_payment',
                } : prev)
              }}
            />
            <div className="mt-4 pt-4 border-t border-[#E8E2D9]">
              <p className="text-xs text-[#9CA3AF] mb-1 font-semibold uppercase tracking-wide">Or contact directly</p>
            <div className="flex flex-col gap-2">
              {invoice.contact_phone && (
                <a href={`tel:${invoice.contact_phone}`}
                  className="flex items-center gap-2 text-sm font-semibold text-[#0F766E] hover:underline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
                  {invoice.contact_phone}
                </a>
              )}
              {invoice.contact_email && (
                <a href={`mailto:${invoice.contact_email}`}
                  className="flex items-center gap-2 text-sm font-semibold text-[#0F766E] hover:underline">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
                  {invoice.contact_email}
                </a>
              )}
            </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes</h3>
            <p className="text-sm text-[#6B7280] leading-relaxed whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Terms */}
        {invoice.terms && (
          <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Terms & Conditions</h3>
            <p className="text-sm text-[#6B7280] leading-relaxed">{invoice.terms}</p>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-[#9CA3AF] pb-4">
          Powered by ProGuild · Questions? Contact your service provider
        </p>
      </div>
    </div>
  )
}
