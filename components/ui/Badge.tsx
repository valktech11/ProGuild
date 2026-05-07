import { T } from '@/lib/tokens'
import { stageStyle, estimateStatusStyle, invoiceStatusStyle } from '@/lib/design'

type BadgeType = 'stage' | 'estimate' | 'invoice' | 'custom'

interface BadgeProps {
  /** The status/stage string e.g. "New", "draft", "sent" */
  status: string
  type?: BadgeType
  dk?: boolean
  /** Override bg/text colours for custom badges */
  bg?: string
  color?: string
  size?: 'sm' | 'md'
}

/**
 * Canonical status badge pill.
 * Use for pipeline stages, estimate statuses, invoice statuses.
 *
 * <Badge status="New" type="stage" dk={dk} />
 * <Badge status="draft" type="estimate" dk={dk} />
 * <Badge status="Overdue" bg="#FEF2F2" color="#B91C1C" />
 */
export function Badge({ status, type = 'stage', dk = false, bg, color, size = 'sm' }: BadgeProps) {
  let resolvedBg = bg
  let resolvedColor = color
  let label = status

  if (!bg || !color) {
    if (type === 'stage') {
      const s = stageStyle(status)
      resolvedBg    = s.chipBg
      resolvedColor = s.color
      label         = s.label
    } else if (type === 'estimate') {
      const s = estimateStatusStyle(status, dk)
      resolvedBg    = s.bg
      resolvedColor = s.text
      label         = s.label
    } else if (type === 'invoice') {
      const s = invoiceStatusStyle(status, dk)
      resolvedBg    = s.bg
      resolvedColor = s.text
      label         = s.label
    }
  }

  const padding = size === 'sm' ? '2px 10px' : '4px 14px'
  const fontSize = size === 'sm' ? T.fontBadge : T.fontSub

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding,
      borderRadius: T.radXs * 3,  // ~18px — pill shape
      background: resolvedBg,
      color: resolvedColor,
      fontSize,
      fontWeight: 600,
      whiteSpace: 'nowrap' as const,
      flexShrink: 0,
      lineHeight: 1.4,
    }}>
      {label}
    </span>
  )
}
