'use client'

import { use, useEffect, useState } from 'react'
import { CheckCircle2, Clock, FileText, Phone, Mail } from 'lucide-react'

type EstimateItem = {
  id: string
  name: string
  description: string
  qty: number
  unit_price: number
  amount: number
}

type PublicEstimate = {
  id: string
  estimate_number: string
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'paid'
  lead_name: string
  trade: string
  lead_source: string
  created_at: string
  valid_until: string
  subtotal: number
  discount: number
  tax_rate: number
  tax_amount: number
  total: number
  deposit_percent: number
  require_deposit: boolean
  terms: string
  items: EstimateItem[]
  pro_name?: string
  pro_trade?: string
  pro_city?: string
  pro_state?: string
}

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PublicEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [approved, setApproved] = useState(false)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    fetch(`/api/estimates/public/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); setLoading(false); return null }; return r.json() })
      .then(d => {
        if (!d) return
        setEstimate(d.estimate)
        setLoading(false)
        // Mark as viewed
        fetch(`/api/estimates/public/${id}/view`, { method: 'POST' }).catch(() => {})
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [id])

  const handleApprove = async () => {
    if (!estimate || approving) return
    setApproving(true)
    try {
      await fetch(`/api/estimates/public/${id}/approve`, { method: 'POST' })
      setApproved(true)
      setEstimate(prev => prev ? { ...prev, status: 'approved' } : prev)
    } catch { /* silent */ }
    finally { setApproving(false) }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F5F4F0] flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[#6B7280]">Loading estimate...</p>
      </div>
    </div>
  )

  if (notFound || !estimate) return (
    <div className="min-h-screen bg-[#F5F4F0] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-[#E8E2D9] p-10 text-center max-w-sm w-full">
        <FileText size={40} className="text-gray-300 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-gray-900 mb-2">Estimate not found</h1>
        <p className="text-sm text-[#6B7280]">This estimate may have been deleted or the link is incorrect.</p>
      </div>
    </div>
  )

  const isExpired  = new Date(estimate.valid_until) < new Date()
  const isPaid     = estimate.status === 'paid'
  const isApproved = estimate.status === 'approved' || approved
  const depositAmt = estimate.total * (estimate.deposit_percent / 100)

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
            isPaid     ? 'bg-green-50 text-green-700' :
            isApproved ? 'bg-teal-50 text-teal-700' :
            isExpired  ? 'bg-red-50 text-red-600' :
                         'bg-amber-50 text-amber-700'
          }`}>
            {isPaid ? 'Paid' : isApproved ? 'Approved' : isExpired ? 'Expired' : 'Awaiting Approval'}
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">

        {/* ── Approved banner ── */}
        {(isApproved || isPaid) && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-teal-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-teal-800">
                {isPaid ? 'Payment received — thank you!' : 'Estimate approved!'}
              </p>
              <p className="text-xs text-teal-700 mt-0.5">
                {isPaid ? 'Your payment has been received. We\'ll be in touch shortly.' : 'We\'ll be in touch shortly to confirm the job details.'}
              </p>
            </div>
          </div>
        )}

        {/* ── Estimate header ── */}
        <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Estimate</p>
              <h1 className="text-2xl font-bold text-gray-900">#{estimate.estimate_number}</h1>
              <p className="text-sm text-[#6B7280] mt-1">Prepared for <span className="font-semibold text-gray-900">{estimate.lead_name}</span></p>
              {estimate.trade && <p className="text-sm text-[#6B7280]">{estimate.trade}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-[#9CA3AF] mb-1">Total</p>
              <p className="text-3xl font-bold text-[#0F766E]">{fmt(estimate.total)}</p>
            </div>
          </div>

          {/* Meta row */}
          <div className={`flex items-center gap-6 mt-5 pt-5 border-t border-[#E8E2D9] flex-wrap`}>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Created</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {new Date(estimate.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div className={`w-px h-8 bg-[#E8E2D9]`} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Valid Until</p>
              <p className={`text-sm font-semibold mt-0.5 ${isExpired ? 'text-red-500' : 'text-amber-500'}`}>
                {new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            {isExpired && (
              <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                <Clock size={12} /> This estimate has expired
              </span>
            )}
          </div>
        </div>

        {/* ── Line items ── */}
        <div className="bg-white rounded-2xl border border-[#E8E2D9] overflow-hidden">
          <div className="grid grid-cols-[1fr_60px_100px_100px] gap-3 px-6 py-3 bg-gray-50 border-b border-[#E8E2D9]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Item</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF] text-center">QTY</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF] text-right">Unit Price</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF] text-right">Amount</span>
          </div>

          {estimate.items.map((item, i) => (
            <div key={item.id}
              className={`grid grid-cols-[1fr_60px_100px_100px] gap-3 px-6 py-4 ${i < estimate.items.length - 1 ? 'border-b border-[#E8E2D9]' : ''}`}>
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                {item.description && <p className="text-xs text-[#6B7280] mt-0.5">{item.description}</p>}
              </div>
              <p className="text-sm text-[#6B7280] text-center self-center">{item.qty}</p>
              <p className="text-sm text-[#6B7280] text-right self-center">{fmt(item.unit_price)}</p>
              <p className="text-sm font-semibold text-gray-900 text-right self-center">{fmt(item.qty * item.unit_price)}</p>
            </div>
          ))}

          {estimate.items.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-[#9CA3AF]">No items on this estimate.</div>
          )}

          {/* Totals */}
          <div className="border-t border-[#E8E2D9] px-6 py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#6B7280]">Subtotal</span>
              <span className="font-medium text-gray-900">{fmt(estimate.subtotal)}</span>
            </div>
            {estimate.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Discount</span>
                <span className="font-medium text-green-600">− {fmt(estimate.discount)}</span>
              </div>
            )}
            {estimate.tax_rate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Tax ({estimate.tax_rate}%)</span>
                <span className="font-medium text-gray-900">{fmt(estimate.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-[#E8E2D9]">
              <span className="font-bold text-gray-900">Total</span>
              <span className="text-xl font-bold text-[#0F766E]">{fmt(estimate.total)}</span>
            </div>
          </div>
        </div>

        {/* ── Approve CTA ── */}
        {!isApproved && !isPaid && !isExpired && (
          <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6 text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Ready to move forward?</h2>
            <p className="text-sm text-[#6B7280] mb-5">
              {estimate.require_deposit
                ? `A deposit of ${fmt(depositAmt)} (${estimate.deposit_percent}%) is required to get started.`
                : 'Approve this estimate to confirm the job.'}
            </p>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white py-3 rounded-xl text-sm font-bold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60">
              <CheckCircle2 size={16} />
              {approving ? 'Approving...' : estimate.require_deposit ? `Approve & Pay Deposit (${fmt(depositAmt)})` : 'Approve Estimate'}
            </button>
            <p className="text-xs text-[#9CA3AF] mt-3">By approving, you agree to the terms below.</p>
          </div>
        )}

        {/* ── Terms ── */}
        {estimate.terms && (
          <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Terms & Conditions</h3>
            <p className="text-sm text-[#6B7280] leading-relaxed">{estimate.terms}</p>
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
