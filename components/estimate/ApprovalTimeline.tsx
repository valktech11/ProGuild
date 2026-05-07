'use client'

import { Send, Eye, CheckCircle2, CreditCard, Phone } from 'lucide-react'
import { theme } from '@/lib/tokens'

type TimelineEvent = { event: string; label: string; timestamp: string | null }

const EVENT_ICONS: Record<string, React.ReactNode> = {
  sent:     <Send size={13} />,
  viewed:   <Eye size={13} />,
  approved: <CheckCircle2 size={13} />,
  paid:     <CreditCard size={13} />,
}

export default function ApprovalTimeline({ timeline, darkMode, estimateId, contactPhone, contactEmail, onAction }: {
  timeline: TimelineEvent[]
  darkMode: boolean
  estimateId?: string
  contactPhone?: string
  contactEmail?: string
  onAction?: (msg: string) => void
}) {
  const t = theme(darkMode)

  const sendReminder = async () => {
    if (!contactEmail) { onAction?.('No email on file for this lead'); return }
    try {
      const r = await fetch('/api/estimates/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId, contactEmail }),
      })
      if (r.ok) onAction?.('Reminder sent ✓')
      else onAction?.('Failed to send reminder')
    } catch { onAction?.('Network error') }
  }

  const callClient = () => {
    if (!contactPhone) { onAction?.('No phone on file for this lead'); return }
    window.location.href = `tel:${contactPhone.replace(/\D/g, '')}`
  }

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${t.cardBorder}`, background: t.cardBg, padding: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: t.textPri, marginBottom: 16 }}>Approval Status</h3>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {timeline.map((item, i) => {
          const done = item.timestamp !== null
          const isLast = i === timeline.length - 1
          return (
            <li key={item.event} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13,
                  background: done ? '#0F766E' : t.cardBgAlt,
                  color: done ? '#fff' : t.textSubtle,
                  border: done ? 'none' : `1px solid ${t.cardBorder}`,
                }}>
                  {EVENT_ICONS[item.event] ?? <CheckCircle2 size={13} />}
                </div>
                {!isLast && (
                  <div style={{ width: 1, flex: 1, minHeight: 18, margin: '4px 0', background: done ? '#0F766E' : t.cardBorder }} />
                )}
              </div>
              <div style={{ paddingBottom: 16, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3, color: done ? t.textPri : t.textMuted, margin: 0 }}>
                  {item.label}
                </p>
                {item.timestamp ? (
                  <p style={{ fontSize: 12, marginTop: 2, color: t.textMuted }}>
                    {new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' at '}
                    {new Date(item.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                ) : (
                  <p style={{ fontSize: 12, marginTop: 2, color: t.textSubtle, fontStyle: 'italic' }}>Pending</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div style={{ borderTop: `1px solid ${t.cardBorder}`, paddingTop: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={sendReminder}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Send size={11} /> Send Reminder
        </button>
        <span style={{ color: t.textSubtle, fontSize: 13 }}>·</span>
        <button onClick={callClient}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#0F766E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Phone size={11} /> Call Client
        </button>
        {!contactEmail && (
          <span style={{ fontSize: 12, color: t.textSubtle, marginLeft: 'auto' }}>Add email to lead to enable reminders</span>
        )}
      </div>
    </div>
  )
}
