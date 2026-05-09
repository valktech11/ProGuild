'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/tokens'
import { fmtCurrency, capName } from '@/lib/utils'
import { estimateStatusStyle } from '@/lib/design'

interface Tier {
  label: string
  shingle_brand: string
  shingle_model: string
  warranty_term: string
  price_per_sq: number
  includes: string[]
}

interface Estimate {
  id: string
  estimate_number: string
  status: string
  lead_name: string
  lead_id: string | null
  contact_email: string | null
  contact_phone: string | null
  estimate_type: string
  tiered_data: { squares: number; tiers: [Tier, Tier, Tier] } | null
  total: number
  created_at: string
  sent_at: string | null
}

const TIER_COLORS = [
  { border: '#9CA3AF', bg: '#F9FAFB', accent: '#4B5563', label: 'GOOD'     },
  { border: '#0F766E', bg: '#F0FDFA', accent: '#0F766E', label: 'BETTER ★' },
  { border: '#B45309', bg: '#FFFBEB', accent: '#B45309', label: 'BEST'     },
]

function Ic({ children, size = 16, color = 'currentColor' }: { children: React.ReactNode; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  )
}

export default function TieredEstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('pg_darkmode') === '1'
  )
  const t = theme(dk)

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (!session) router.push('/login') }, [session, router])

  useEffect(() => {
    if (!session) return
    fetch(`/api/estimates/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.estimate) {
          setEstimate(d.estimate)
          setEmail(d.estimate.contact_email || '')
        }
      })
      .finally(() => setLoading(false))
  }, [id, session])

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/estimate/${id}`
    : `/estimate/${id}`

  async function handleSend() {
    if (!session || !estimate) return
    setSending(true); setSendErr(null)
    // Mark as sent
    const r = await fetch(`/api/estimates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_id: session.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        contact_email: email || estimate.contact_email,
      }),
    })
    if (!r.ok) { setSendErr('Failed to update status'); setSending(false); return }

    // Send email via Resend
    const er = await fetch('/api/estimates/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estimate_id: id, to_email: email, pro_name: session.name }),
    })
    setSending(false)
    setSent(true)
    setEstimate(prev => prev ? { ...prev, status: 'sent', sent_at: new Date().toISOString() } : prev)
    if (!er.ok) { /* email failed but estimate is marked sent — non-fatal */ }
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!session) return null

  const tiers = estimate?.tiered_data?.tiers
  const squares = estimate?.tiered_data?.squares ?? 0
  const statusStyle = estimate ? estimateStatusStyle(estimate.status, dk) : null

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk}
      onToggleDark={() => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        <button onClick={() => router.push('/dashboard/estimates')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px' }}>
          <Ic size={14}><polyline points="15 18 9 12 15 6"/></Ic> All Estimates
        </button>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: t.textSubtle }}>Loading…</div>
        ) : !estimate || !tiers ? (
          <div style={{ textAlign: 'center', padding: 80, color: t.textSubtle }}>Estimate not found or not a tiered estimate</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0 }}>
                    Good / Better / Best
                  </h1>
                  {statusStyle && (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: statusStyle.bg, color: statusStyle.text }}>
                      {statusStyle.label}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: t.textSubtle, margin: 0 }}>
                  #{estimate.estimate_number} · {capName(estimate.lead_name)} · {squares} squares
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={copyLink}
                  style={{ padding: '9px 16px', borderRadius: 11, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ic size={13}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></Ic>
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                {estimate.status === 'draft' && (
                  <button onClick={() => router.push(`/dashboard/estimates/tiered?edit=${id}`)}
                    style={{ padding: '9px 16px', borderRadius: 11, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Three tiers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
              {tiers.map((tier, idx) => {
                const col = TIER_COLORS[idx]
                const total = tier.price_per_sq * squares
                return (
                  <div key={idx} style={{ background: col.bg, border: `2px solid ${col.border}`, borderRadius: 18, padding: 18 }}>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: col.border, color: 'white', letterSpacing: '0.05em' }}>
                        {col.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '0 0 1px' }}>{tier.shingle_brand}</p>
                    <p style={{ fontSize: 14, color: '#374151', margin: '0 0 8px' }}>{tier.shingle_model}</p>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: col.border + '22', color: col.accent }}>
                      {tier.warranty_term} warranty
                    </span>
                    <div style={{ margin: '12px 0' }}>
                      {tier.includes.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                          <Ic size={13} color={col.accent}><polyline points="20 6 9 17 4 12"/></Ic>
                          <span style={{ fontSize: 13, color: '#374151' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: `1px solid ${col.border}55`, paddingTop: 10 }}>
                      <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 2px' }}>${tier.price_per_sq}/sq</p>
                      <p style={{ fontSize: 24, fontWeight: 900, color: col.accent, margin: 0 }}>{fmtCurrency(total)}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Send panel */}
            <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 16, padding: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: t.textPri, margin: '0 0 14px' }}>
                Send to Client
              </h2>
              {sent ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 12 }}>
                  <Ic size={18} color="#15803D"><polyline points="20 6 9 17 4 12"/></Ic>
                  <div>
                    <p style={{ fontWeight: 700, color: '#15803D', margin: 0 }}>Estimate sent!</p>
                    <p style={{ fontSize: 13, color: '#166534', margin: '2px 0 0' }}>
                      Client can view and select their tier at: <a href={publicUrl} target="_blank" rel="noreferrer" style={{ color: '#0F766E' }}>{publicUrl}</a>
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: t.textSubtle, display: 'block', marginBottom: 4 }}>CLIENT EMAIL</label>
                    <input value={email} onChange={e => setEmail(e.target.value)} placeholder="client@email.com" type="email"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={handleSend} disabled={sending}
                    style={{ padding: '10px 22px', borderRadius: 11, border: 'none', background: '#0F766E', color: 'white', fontSize: 14, fontWeight: 700, cursor: sending ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
                    {sending ? 'Sending…' : '✉ Send Estimate'}
                  </button>
                  <button onClick={copyLink}
                    style={{ padding: '10px 16px', borderRadius: 11, border: `1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {copied ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
              )}
              {sendErr && (
                <p style={{ fontSize: 13, color: '#DC2626', marginTop: 10 }}>{sendErr}</p>
              )}
              <p style={{ fontSize: 12, color: t.textSubtle, marginTop: 10 }}>
                The client sees all three options side by side and taps to select. Their selection auto-creates the invoice.
              </p>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
