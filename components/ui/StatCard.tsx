import { theme, T } from '@/lib/tokens'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  valueColor?: string
  bg?: string
  dk: boolean
}

/**
 * Canonical stat card — label + big number + optional sub-label.
 * Used on Pipeline, Estimates, Invoices, Clients pages.
 *
 * <StatCard label="Total Leads" value={42} dk={dk} />
 * <StatCard label="Outstanding" value="$4,103.51" valueColor="#B45309" dk={dk} />
 */
export function StatCard({ label, value, sub, valueColor, bg, dk }: StatCardProps) {
  const t = theme(dk)
  return (
    <div style={{
      background: bg ?? t.cardBg,
      border: `1px solid ${t.cardBorder}`,
      borderRadius: T.radMd,
      padding: `${T.sp3}px ${T.sp5}px`,
    }}>
      <div style={{
        fontSize: T.fontBadge,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.07em',
        color: t.textMuted,
        marginBottom: T.sp1,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: T.fontStat,
        fontWeight: 800,
        lineHeight: 1.1,
        color: valueColor ?? t.textPri,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: T.fontSub,
          color: t.textSubtle,
          marginTop: T.sp1,
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}
