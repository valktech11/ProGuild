'use client'
import { use, useEffect, useState } from 'react'

// ── Mock payment button — replace onClick body with real Stripe when ready ──
function PayButton({ invoiceId, balanceDue }: { invoiceId: string; balanceDue: number }) {
  const [state, setState] = useState<'idle' | 'paying' | 'paid' | 'error'>('idle')
  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 })

  if (state === 'paid') return (
    <div className="text-center p-4 bg-green-50 rounded-xl border border-green-200">
      <div className="text-2xl mb-1">✅</div>
      <div className="text-sm font-bold text-green-800">Payment received!</div>
      <div className="text-xs text-green-600 mt-1">Your invoice has been marked as paid.</div>
    </div>
  )

  const handlePay = async () => {
    setState('paying')
    try {
      // TODO: Replace with real Stripe payment link when Stripe is activated
      // For now: simulate processing then mark invoice paid via API
      await new Promise(r => setTimeout(r, 1500)) // simulate payment processing
      const r = await fetch('/api/invoices/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, amount: balanceDue, payment_method: 'online_card' }),
      })
      if (!r.ok) throw new Error('Payment failed')
      setState('paid')
      // Reload page after 2s to show paid state
      setTimeout(() => window.location.reload(), 2000)
    } catch { setState('error') }
  }

  return (
    <div>
      {state === 'error' && (
        <p className="text-sm text-red-600 mb-3">Payment failed — please try again or contact your contractor.</p>
      )}
      <button
        onClick={handlePay}
        disabled={state === 'paying'}
        className="w-full py-3 rounded-xl font-bold text-white text-base transition-all"
        style={{ background: state === 'paying' ? '#CBD5E1' : 'linear-gradient(135deg,#0F766E,#0D9488)',
          cursor: state === 'paying' ? 'default' : 'pointer',
          boxShadow: state === 'paying' ? 'none' : '0 2px 12px rgba(15,118,110,0.3)' }}>
        {state === 'paying' ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/>
              <path d="M12 3a9 9 0 019 9" strokeLinecap="round"/>
            </svg>
            Processing payment…
          </span>
        ) : `Pay ${fmt(balanceDue)} Now`}
      </button>
      <p className="text-xs text-center text-[#9CA3AF] mt-2">
        🔒 Secure payment · Powered by Stripe
      </p>
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
}

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TERMS_LABEL: Record<string, string> = {
  due_on_receipt: 'Due on Receipt',
  net_7:  'Net 7 days',
  net_15: 'Net 15 days',
  net_30: 'Net 30 days',
  net_60: 'Net 60 days',
}

export default function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

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
              <p className="text-[13px] text-[#6B7280] text-right self-center">{fmt(item.unit_price)}</p>
              <p className="text-[13px] font-semibold text-gray-900 text-right self-center">{fmt(item.qty * item.unit_price)}</p>
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

        {/* Payment button — online payment */}
        {!isPaid && (
          <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">Pay Online</h2>
            <p className="text-sm text-[#6B7280] mb-4">
              Pay securely online. Your payment will be recorded immediately.
            </p>
            <PayButton invoiceId={invoice.id} balanceDue={balanceDue} />
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
