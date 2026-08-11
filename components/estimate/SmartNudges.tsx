'use client'

import { theme } from '@/lib/tokens'

type NudgeConfig = {
  emoji: string
  title: string
  sub: string
  ctaLabel?: string
  ctaColor?: string
  ctaBg?: string
  secondaryLabel?: string
}

function getNudge(status: string, invoiceId?: string): NudgeConfig | null {
  switch (status) {
    case 'draft':
      return {
        emoji: '⚡',
        title: 'Estimates sent within 10 minutes close 2× faster',
        sub: 'Send this estimate now to improve your chances.',
        ctaLabel: 'See Tips',
        ctaBg: 'transparent',
        ctaColor: '#B45309',
      }
    case 'sent':
      return {
        emoji: '📬',
        title: 'Following up increases close rate by 40%',
        sub: 'Client has not viewed yet — a quick call can make the difference.',
        ctaLabel: 'Send Reminder',
        ctaBg: 'transparent',
        ctaColor: '#1D4ED8',
      }
    case 'viewed':
      return {
        emoji: '👀',
        title: 'Client viewed your estimate — strike while it\'s hot',
        sub: 'They\'re reviewing right now. Follow up within the hour for best results.',
        ctaLabel: 'Call Client',
        ctaBg: 'transparent',
        ctaColor: '#7C3AED',
      }
    case 'approved':
      return {
        emoji: '🎉',
        title: 'Great news! Your estimate was approved',
        sub: 'Create an invoice now to get paid. We\'ll auto-fill everything for you.',
        ctaLabel: '📄 Create Invoice',
        ctaBg: '#0F766E',
        ctaColor: '#fff',
        secondaryLabel: 'Takes less than 30 seconds',
      }
    case 'invoiced':
      return {
        emoji: '📤',
        title: 'Invoice sent — follow up if unpaid after 3 days',
        sub: invoiceId ? 'View your invoice to track payment status.' : 'Send a reminder to the client.',
        ctaLabel: invoiceId ? 'View Invoice' : 'Send Reminder',
        ctaBg: 'transparent',
        ctaColor: '#0F766E',
      }
    case 'paid':
      return {
        emoji: '⭐',
        title: 'Job complete and paid — request a review',
        sub: 'Reviews build your reputation and bring in more leads.',
        ctaLabel: 'Request Review',
        ctaBg: 'transparent',
        ctaColor: '#0F766E',
      }
    default:
      return null
  }
}

const NUDGE_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  draft:    { border: '#FCD34D', bg: '#FFFBEB', icon: '#B45309' },
  sent:     { border: '#93C5FD', bg: '#EFF6FF', icon: '#1D4ED8' },
  viewed:   { border: '#C4B5FD', bg: '#F5F3FF', icon: '#7C3AED' },
  approved: { border: '#6EE7B7', bg: '#F0FDF4', icon: '#0F766E' },
  invoiced: { border: '#6EE7B7', bg: '#F0FDF4', icon: '#0F766E' },
  paid:     { border: '#FCD34D', bg: '#FFFBEB', icon: '#B45309' },
}

export default function SmartNudges({ darkMode, status, invoiceId, onCta }: {
  darkMode: boolean
  status: string
  invoiceId?: string
  onCta?: () => void
}) {
  const dk   = darkMode
  const t    = theme(dk)
  const nudge = getNudge(status, invoiceId)
  if (!nudge) return null

  const colors = NUDGE_COLORS[status] || NUDGE_COLORS.draft
  const isApproved = status === 'approved'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      borderRadius: 14, padding: '14px 20px',
      border: `1px solid ${dk ? (isApproved ? '#065F46' : '#334155') : colors.border}`,
      background: dk ? (isApproved ? 'rgba(15,118,110,0.12)' : t.cardBg) : colors.bg,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 18,
          background: dk ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.7)',
        }}>
          {nudge.emoji}
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: t.textPri, margin: 0, marginBottom: 2 }}>
            {nudge.title}
          </p>
          <p style={{ fontSize: 13, color: t.textMuted, margin: 0 }}>
            {nudge.sub}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {nudge.ctaLabel && (
          <button
            onClick={onCta}
            style={{
              padding: isApproved ? '10px 20px' : '7px 14px',
              borderRadius: 8,
              fontSize: isApproved ? 14 : 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: nudge.ctaBg === 'transparent' ? `1.5px solid ${dk ? '#334155' : colors.border}` : 'none',
              background: nudge.ctaBg === '#0F766E' ? 'linear-gradient(135deg, #0F766E, #0D9488)' : (dk ? 'transparent' : nudge.ctaBg || 'transparent'),
              color: nudge.ctaBg === '#0F766E' ? '#fff' : (dk ? '#94A3B8' : nudge.ctaColor || '#374151'),
              whiteSpace: 'nowrap',
            }}
          >
            {nudge.ctaLabel}
          </button>
        )}
        {nudge.secondaryLabel && (
          <span style={{ fontSize: 12, color: t.textMuted }}>{nudge.secondaryLabel}</span>
        )}
      </div>
    </div>
  )
}
