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
  status: 'draft' | 'sent' | 'viewed' | 'approved' | 'declined' | 'paid'
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
  const [declined, setDeclined] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [showDeclineInput, setShowDeclineInput] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

  useEffect(() => {
    fetch(`/api/estimates/public/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); setLoading(false); return null }; return r.json() })
      .then(d => {
        if (!d) return
        setEstimate(d.estimate)
        setLoading(false)
        // B12 FIX: session dedup — only fire view once per browser session
        const viewKey = `est_viewed_${id}`
        if (!sessionStorage.getItem(viewKey)) {
          fetch(`/api/estimates/public/${id}/view`, { method: 'POST' }).catch(() => {})
          sessionStorage.setItem(viewKey, '1')
        }
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

  const handleDecline = async () => {
    if (!estimate || declining) return
    setDeclining(true)
    try {
      await fetch(`/api/estimates/public/${id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason || null }),
      })
      setDeclined(true)
      setEstimate(prev => prev ? { ...prev, status: 'declined' } : prev)
    } catch { /* silent */ }
    finally { setDeclining(false) }
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
  const isDeclined = estimate.status === 'declined' || declined
  const depositAmt = estimate.total * (estimate.deposit_percent / 100)

  // ── Tiered (Good/Better/Best) estimate — separate render path ──────────────
  if ((estimate as any).estimate_type === 'tiered') {
    const td = (estimate as any).tiered_data as { squares: number; tiers: [any,any,any] } | null
    const tiers = td?.tiers
    const squares = td?.squares ?? 0
    const TIER_COLORS = [
      { border: '#9CA3AF', bg: '#F9FAFB', accent: '#4B5563', label: 'GOOD'     },
      { border: '#0F766E', bg: '#F0FDFA', accent: '#0F766E', label: 'BETTER ★' },
      { border: '#B45309', bg: '#FFFBEB', accent: '#B45309', label: 'BEST'     },
    ]
    return (
      <div style={{ minHeight: '100vh', background: '#F5F4F0' }}>
        {/* Top bar */}
        <div style={{ background: 'white', borderBottom: '1px solid #E8E2D9' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontSize: 11, fontWeight: 800 }}>PG</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>ProGuild</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: isApproved ? '#F0FDFA' : '#F5F3FF', color: isApproved ? '#0F766E' : '#6D28D9' }}>
              {isApproved ? '✓ Approved' : 'Choose Your Option'}
            </span>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>
              Your Roofing Proposal
            </h1>
            <p style={{ fontSize: 16, color: '#6B7280', margin: 0 }}>
              Hi {estimate.lead_name} — review your three options and select the one that works best for you.
            </p>
            {squares > 0 && <p style={{ fontSize: 14, color: '#9CA3AF', margin: '6px 0 0' }}>{squares} squares · {(squares * 100).toLocaleString()} sq ft</p>}
          </div>

          {isApproved ? (
            <div style={{ maxWidth: 480, margin: '0 auto 24px', padding: '24px', background: '#F0FDFA', border: '2px solid #14B8A6', borderRadius: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F766E', margin: '0 0 8px' }}>You're all set!</h2>
              <p style={{ fontSize: 15, color: '#374151', margin: 0 }}>Your selection has been confirmed. The contractor will be in touch shortly to schedule your job.</p>
            </div>
          ) : tiers ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
                {tiers.map((tier: any, idx: number) => {
                  const col = TIER_COLORS[idx]
                  const total = tier.price_per_sq * squares
                  return (
                    <div key={idx} style={{ background: col.bg, border: `2px solid ${col.border}`, borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, background: col.border, color: 'white', letterSpacing: '0.05em' }}>
                          {col.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 2px' }}>{tier.shingle_brand}</p>
                      <p style={{ fontSize: 15, color: '#374151', margin: '0 0 8px' }}>{tier.shingle_model}</p>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 8, background: col.border + '22', color: col.accent, display: 'inline-block', marginBottom: 14 }}>
                        {tier.warranty_term} warranty
                      </span>
                      <div style={{ flex: 1, marginBottom: 16 }}>
                        {tier.includes.map((item: string, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={col.accent} strokeWidth={2.5} strokeLinecap="round" style={{ marginTop: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                            <span style={{ fontSize: 14, color: '#374151' }}>{item}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop: `1px solid ${col.border}55`, paddingTop: 14, marginBottom: 14 }}>
                        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 4px' }}>{squares > 0 ? `${squares} squares × $${tier.price_per_sq}/sq` : `$${tier.price_per_sq}/sq`}</p>
                        <p style={{ fontSize: 28, fontWeight: 900, color: col.accent, margin: 0 }}>{total > 0 ? '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</p>
                      </div>
                      <button
                        onClick={async () => {
                          if (approving || isApproved) return
                          setApproving(true)
                          try {
                            await fetch(`/api/estimates/public/${id}/approve`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ selected_tier: idx, tier_label: tier.label, tier_total: total }),
                            })
                            setApproved(true)
                            setEstimate((prev: any) => prev ? { ...prev, status: 'approved', total } : prev)
                          } catch { /* silent */ }
                          finally { setApproving(false) }
                        }}
                        disabled={approving}
                        style={{ width: '100%', padding: '14px', borderRadius: 13, border: 'none', background: col.accent, color: 'white', fontSize: 15, fontWeight: 800, cursor: approving ? 'wait' : 'pointer', transition: 'opacity 0.15s' }}
                        onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '0.85' }}
                        onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '1' }}>
                        {approving ? 'Confirming…' : `Select ${tier.label || col.label.split(' ')[0]}`}
                      </button>
                    </div>
                  )
                })}
              </div>
              <p style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                Questions? Contact your contractor directly. No payment is collected here.
              </p>
            </>
          ) : (
            <p style={{ textAlign: 'center', color: '#9CA3AF' }}>Tier data unavailable.</p>
          )}
        </div>
      </div>
    )
  }

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
            isDeclined ? 'bg-red-50 text-red-600' :
            isExpired  ? 'bg-red-50 text-red-600' :
                         'bg-amber-50 text-amber-700'
          }`}>
            {isPaid ? 'Paid' : isApproved ? 'Approved' : isDeclined ? 'Declined' : isExpired ? 'Expired' : 'Awaiting Approval'}
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

        {/* ── Declined banner ── */}
        {isDeclined && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            <div>
              <p className="text-sm font-semibold text-red-800">You declined this estimate</p>
              <p className="text-xs text-red-700 mt-0.5">The contractor has been notified and may reach out with a revised estimate.</p>
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
          <div className="grid grid-cols-[2fr_40px_80px_80px] md:grid-cols-[1fr_60px_100px_100px] gap-2 md:gap-3 px-4 md:px-6 py-3 bg-gray-50 border-b border-[#E8E2D9]">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280]">Item</span>
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280] text-center">Qty</span>
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280] text-right">Price</span>
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#6B7280] text-right">Amount</span>
          </div>

          {estimate.items.map((item, i) => (
            <div key={item.id}
              className={`grid grid-cols-[2fr_40px_80px_80px] md:grid-cols-[1fr_60px_100px_100px] gap-2 md:gap-3 px-4 md:px-6 py-4 ${i < estimate.items.length - 1 ? 'border-b border-[#E8E2D9]' : ''}`}>
              <div>
                <p className="text-[14px] font-semibold text-gray-900 leading-snug">{item.name}</p>
                {item.description && <p className="text-[12px] text-[#6B7280] mt-0.5 leading-snug">{item.description}</p>}
              </div>
              <p className="text-[13px] text-[#6B7280] text-center self-center">{item.qty}</p>
              <p className="text-[13px] text-[#6B7280] text-right self-center">{fmt(item.unit_price)}</p>
              <p className="text-[13px] font-semibold text-gray-900 text-right self-center">{fmt(item.qty * item.unit_price)}</p>
            </div>
          ))}

          {estimate.items.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-[#9CA3AF]">No items on this estimate.</div>
          )}

          {/* Totals */}
          <div className="border-t border-[#E8E2D9] px-6 py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#4B5563]">Subtotal</span>
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

        {/* ── Approve + Decline CTAs ── */}
        {!isApproved && !isPaid && !isDeclined && !isExpired && (
          <div className="bg-white rounded-2xl border border-[#E8E2D9] p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Ready to move forward?</h2>
            <p className="text-sm text-[#6B7280] mb-5">
              {estimate.require_deposit
                ? `A deposit of ${fmt(depositAmt)} (${estimate.deposit_percent}%) is required to get started.`
                : 'Approve this estimate to confirm the job.'}
            </p>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#0F766E] to-[#0D9488] text-white py-3 rounded-xl text-sm font-bold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 mb-3">
              <CheckCircle2 size={16} />
              {approving ? 'Approving...' : estimate.require_deposit ? `Approve & Pay Deposit (${fmt(depositAmt)})` : 'Approve Estimate'}
            </button>
            <p className="text-xs text-[#9CA3AF] text-center mb-4">By approving, you agree to the terms below.</p>

            {/* Decline option */}
            {!showDeclineInput ? (
              <button onClick={() => setShowDeclineInput(true)}
                className="w-full text-center text-xs text-[#9CA3AF] hover:text-red-500 transition-colors py-1">
                Not happy with this estimate? Decline →
              </button>
            ) : (
              <div className="border-t border-[#E8E2D9] pt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Tell the contractor why (optional)</p>
                <textarea
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  placeholder="Price too high, different scope needed, chose another contractor..."
                  rows={2}
                  className="w-full text-sm px-3 py-2.5 rounded-lg border border-[#E8E2D9] bg-[#F9F8F5] text-gray-900 resize-none outline-none mb-3"
                  style={{ boxSizing: 'border-box' }}
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowDeclineInput(false)}
                    className="flex-1 py-2 rounded-lg text-sm border border-[#E8E2D9] text-[#6B7280]">
                    Cancel
                  </button>
                  <button onClick={handleDecline} disabled={declining}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold bg-red-500 text-white disabled:opacity-60">
                    {declining ? 'Declining...' : 'Decline Estimate'}
                  </button>
                </div>
              </div>
            )}
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
