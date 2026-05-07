'use client'

import { CalendarDays } from 'lucide-react'
import { Estimate } from '@/app/dashboard/estimates/[id]/page'
import { theme } from '@/lib/tokens'

export default function EstimateSummary({ estimate, darkMode }: { estimate: Estimate; darkMode: boolean }) {
  const t = theme(darkMode)

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: t.cardBg, padding: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: t.textPri, marginBottom: 16 }}>Estimate Summary</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: t.textMuted }}>Subtotal</span>
          <span style={{ fontWeight: 500, color: t.textBody }}>{fmt(estimate.subtotal)}</span>
        </div>

        {estimate.discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: t.textMuted }}>Discount</span>
            <span style={{ fontWeight: 500, color: '#16a34a' }}>− {fmt(estimate.discount)}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ color: t.textMuted }}>Tax ({estimate.tax_rate}%)</span>
            {estimate.tax_rate > 0 && (
              <p style={{ fontSize: 13, marginTop: 2, color: '#D97706' }}>Base state rate — adjust for your county</p>
            )}
          </div>
          <span style={{ fontWeight: 500, color: t.textBody }}>{fmt(estimate.tax_amount)}</span>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${t.cardBorder}`, marginTop: 16, paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: t.textPri }}>Total You&apos;ll Earn</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#0F766E' }}>{fmt(estimate.total)}</span>
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10, borderRadius: 8, padding: 12, background: darkMode ? '#0F172A' : '#F0FDFA' }}>
        <CalendarDays size={15} color="#0F766E" style={{ marginTop: 1, flexShrink: 0 } as React.CSSProperties} />
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          <span style={{ color: t.textMuted }}>This estimate is valid until </span>
          <span style={{ fontWeight: 600, color: '#0F766E' }}>
            {new Date(estimate.valid_until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </p>
      </div>
    </div>
  )
}
