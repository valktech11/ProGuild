'use client'

import { Dispatch, SetStateAction } from 'react'
import { CreditCard, Link2 } from 'lucide-react'
import { Estimate } from '@/app/dashboard/estimates/[id]/page'
import { theme } from '@/lib/tokens'

export default function PaymentPanel({ estimate, setEstimate, darkMode, onAction }: {
  estimate:    Estimate
  setEstimate: Dispatch<SetStateAction<Estimate | null>>
  darkMode:    boolean
  onAction?:   (msg: string) => void
}) {
  const t = theme(darkMode)
  const depositAmount = estimate.total * (estimate.deposit_percent / 100)
  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  const requestDeposit = async () => {
    if (!estimate.contact_email) { onAction?.('No email on file — add email to this lead first'); return }
    try {
      const r = await fetch('/api/estimates/request-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId: estimate.id, estimateNumber: estimate.estimate_number, contactEmail: estimate.contact_email, leadName: estimate.lead_name, depositAmount, total: estimate.total }),
      })
      if (r.ok) onAction?.('Deposit request sent ✓')
      else onAction?.('Failed to send — check Resend config')
    } catch { onAction?.('Network error') }
  }

  const copyPaymentLink = () => {
    const url = `${window.location.origin}/estimate/${estimate.id}/pay`
    navigator.clipboard.writeText(url)
    onAction?.('Payment link copied ✓')
  }

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: t.cardBg, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>Deposit</h3>
        <span style={{ fontSize: 14, fontWeight: 600, background: '#F3E8FF', color: '#7C3AED', padding: '2px 8px', borderRadius: 20 }}>Recommended</span>
      </div>

      {/* Deposit % */}
      <div style={{ borderBottom: `1px solid ${t.cardBorder}`, paddingBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: t.textMuted }}>Deposit percentage</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min={0} max={100}
              value={estimate.deposit_percent}
              onChange={e => setEstimate(prev => prev ? { ...prev, deposit_percent: Number(e.target.value) } : prev)}
              style={{ width: 52, textAlign: 'right', fontSize: 14, padding: '4px 8px', borderRadius: 6, border: `1.5px solid ${t.inputBorder}`, background: t.inputBg, color: t.textPri, outline: 'none' }}
            />
            <span style={{ fontSize: 14, color: t.textMuted }}>%</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ color: t.textMuted }}>Deposit amount</span>
          <span style={{ fontWeight: 600, color: t.textBody }}>{fmt(depositAmount)}</span>
        </div>
      </div>

      {/* Require deposit toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
        <span style={{ color: t.textMuted }}>Require deposit before job starts</span>
        <button
          onClick={() => setEstimate(prev => prev ? { ...prev, require_deposit: !prev.require_deposit } : prev)}
          style={{
            position: 'relative', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: estimate.require_deposit ? '#0F766E' : (darkMode ? '#475569' : '#D1D5DB'),
            transition: 'background 0.2s',
          }}
          role="switch" aria-checked={estimate.require_deposit}
        >
          <span style={{
            position: 'absolute', top: 2, left: estimate.require_deposit ? 22 : 2,
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Request Deposit */}
      <button onClick={requestDeposit}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg, #0F766E, #0D9488)', color: '#fff', padding: '10px', borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
        <CreditCard size={14} />
        Request Deposit
      </button>

      {!estimate.contact_email && (
        <p style={{ fontSize: 14, textAlign: 'center', color: t.textSubtle }}>Add email to this lead to enable deposit requests</p>
      )}
    </div>
  )
}
