'use client'

import { theme } from '@/lib/tokens'

type Step = { event: string; label: string; timestamp: string | null }

// Inline SVGs — avoids Lucide color inheritance issues at small sizes
const STEP_ICONS: Record<string, React.ReactNode> = {
  sent:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  viewed:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  approved: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  invoiced: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  paid:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
}

function fmtTs(ts: string) {
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}

export default function EstimateProgressBar({ timeline, darkMode }: {
  timeline: Step[]
  darkMode: boolean
}) {
  const t = theme(darkMode)

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14, padding: '16px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative' }}>
        {timeline.map((step, i) => {
          const done    = step.timestamp !== null
          const isLast  = i === timeline.length - 1
          const active  = done && (i === timeline.length - 1 || !timeline[i + 1]?.timestamp)

          // Semantic colors per step — not all teal
          const stepColor =
            step.event === 'approved'  ? '#15803D' :  // green — client positive action
            step.event === 'invoiced'  ? '#0F766E' :  // teal — pro action taken
            step.event === 'paid'      ? '#15803D' :  // green — money received
            step.event === 'sent'      ? '#2563EB' :  // blue — in motion
            step.event === 'viewed'    ? '#7C3AED' :  // purple — client engaged
            step.event === 'declined'  ? '#DC2626' :  // red — negative
            step.event === 'void'      ? '#9CA3AF' :  // gray — cancelled
                                         '#0F766E'    // teal — default

          return (
            <div key={step.event} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {/* Connector line — left side */}
              {i > 0 && (
                <div style={{
                  position: 'absolute', top: 15, right: '50%', left: '-50%',
                  height: 2,
                  background: timeline[i - 1].timestamp ? stepColor : (darkMode ? '#334155' : '#E5E7EB'),
                  zIndex: 0,
                }} />
              )}

              {/* Circle */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1, position: 'relative', flexShrink: 0,
                background: done ? stepColor : (darkMode ? '#1E293B' : '#F3F4F6'),
                border: done ? 'none' : `2px solid ${darkMode ? '#334155' : '#E5E7EB'}`,
                color: done ? '#fff' : (darkMode ? '#475569' : '#9CA3AF'),
                boxShadow: active ? `0 0 0 4px ${stepColor}26` : 'none',
              }}>
                {STEP_ICONS[step.event] ?? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>

              {/* Label + timestamp */}
              <div style={{ textAlign: 'center', marginTop: 8, paddingLeft: 4, paddingRight: 4 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: done ? stepColor : t.textSubtle,
                }}>
                  {step.label.replace(' to client', '').replace(' by client', '').replace(' created', '')}
                </div>
                <div style={{ fontSize: 12, marginTop: 3, color: step.timestamp ? t.textMuted : t.textSubtle }}>
                  {step.timestamp ? fmtTs(step.timestamp) : 'Not yet'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
