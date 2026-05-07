'use client'
import React from 'react'
import { theme, T } from '@/lib/tokens'
import { eventStyle, ICON_PATH } from '@/lib/design'
import { capName } from '@/lib/utils'

export interface CalEvent {
  id: string
  contact_name: string
  contact_phone: string | null
  contact_email: string | null
  lead_status: string
  lead_source: string | null
  quoted_amount: number | null
  scheduled_date: string | null
  scheduled_time: string | null
  follow_up_date: string | null
  notes: string | null
  message: string | null
  created_at: string
  _type: 'job' | 'followup'
}

function fmtTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function fmtPhone(p: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return p
}

function Svg({ path, size = 12, color = 'currentColor', sw = 2 }: { path: string; size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={path} />
    </svg>
  )
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface EventChipProps {
  ev: CalEvent
  dk: boolean
  /** micro: month grid cell chip (name only, 9px)
   *  compact: week grid chip (name + time + amount, 11-12px)
   *  full: mobile card / agenda row (full card with actions) */
  size: 'micro' | 'compact' | 'full'
  onClick?: () => void
  onMarkComplete?: () => void
  completing?: boolean
  isOverdue?: boolean
}

// ─── EventChip ───────────────────────────────────────────────────────────────

export function EventChip({ ev, dk, size, onClick, onMarkComplete, completing, isOverdue = false }: EventChipProps) {
  const t   = theme(dk)
  const isFollowup  = ev._type === 'followup'
  const isCompleted = ev.lead_status === 'Completed' || ev.lead_status === 'Paid'
  const es  = eventStyle({ isOverdue, isFollowup, isCompleted, leadStatus: ev.lead_status }, dk)
  const timeLabel = ev.scheduled_time ? fmtTime(ev.scheduled_time) : ''
  const iconPath  = isOverdue ? ICON_PATH.warning : isFollowup ? ICON_PATH.phone : ICON_PATH.wrench

  // ── micro — month grid cell ───────────────────────────────────────────────
  if (size === 'micro') {
    return (
      <div
        onClick={e => { e.stopPropagation(); onClick?.() }}
        style={{
          fontSize: 11, fontWeight: 700,
          padding: '2px 5px',
          borderRadius: 4,
          background: es.bg,
          borderLeft: `2px solid ${es.border}`,
          color: es.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          opacity: es.opacity,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 3,
          transition: 'opacity 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = String(Math.min(1, es.opacity + 0.2)))}
        onMouseLeave={e => (e.currentTarget.style.opacity = String(es.opacity))}>
        <Svg path={iconPath} size={8} color={es.border} sw={2.5} />
        {capName(ev.contact_name)}
      </div>
    )
  }

  // ── compact — week grid / agenda ─────────────────────────────────────────
  if (size === 'compact') {
    return (
      <div
        onClick={onClick}
        style={{
          padding: '5px 7px',
          borderRadius: 7,
          background: es.bg,
          borderLeft: `3px ${isFollowup ? 'dashed' : 'solid'} ${es.border}`,
          opacity: es.opacity,
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column', gap: 2,
          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
          transition: 'transform 0.1s, box-shadow 0.1s',
          overflow: 'hidden',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.12)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)' }}>
        {/* Row 1: icon + time (if timed job) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Svg path={iconPath} size={10} color={es.border} sw={2.2} />
          {timeLabel && <span style={{ fontSize: 11, fontWeight: 700, color: es.border }}>{timeLabel}</span>}
        </div>
        {/* Row 2: name */}
        <div style={{ fontSize: 13, fontWeight: 700, color: es.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {capName(ev.contact_name)}
        </div>
        {/* Row 3: amount (if set) */}
        {ev.quoted_amount && ev.quoted_amount > 0 ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: es.mutedText }}>
            ${ev.quoted_amount.toLocaleString()}
          </div>
        ) : null}
      </div>
    )
  }

  // ── full — mobile agenda card ─────────────────────────────────────────────
  const phone = fmtPhone(ev.contact_phone)
  return (
    <div
      onClick={onClick}
      style={{
        background: t.cardBg,
        borderLeft: `4px solid ${es.border}`,
        borderRadius: 12,
        border: `1px solid ${t.cardBorder}`,
        borderLeftWidth: 4,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        opacity: es.opacity,
        cursor: 'pointer',
        overflow: 'hidden',
      }}>
      {/* Top section */}
      <div style={{ padding: '12px 14px 10px' }}>
        {/* Row 1: icon + type label + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Svg path={iconPath} size={13} color={es.border} sw={2} />
          <span style={{ fontSize: 12, fontWeight: 700, color: es.mutedText, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isFollowup ? 'Follow-up' : ev.lead_status === 'Paid' ? 'Job Won' : ev.lead_status}
          </span>
          {timeLabel && (
            <>
              <span style={{ color: t.cardBorder }}>·</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: es.border }}>{timeLabel}</span>
            </>
          )}
          {ev.quoted_amount && ev.quoted_amount > 0 ? (
            <>
              <span style={{ color: t.cardBorder, marginLeft: 'auto' }}>·</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: es.border, marginLeft: 4 }}>
                ${ev.quoted_amount.toLocaleString()}
              </span>
            </>
          ) : null}
        </div>
        {/* Row 2: customer name */}
        <div style={{ fontSize: 17, fontWeight: 800, color: t.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {capName(ev.contact_name)}
        </div>
        {/* Row 3: location hint from message */}
        {ev.message && (
          <div style={{ fontSize: 13, color: t.textSubtle, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ev.message.slice(0, 60)}
          </div>
        )}
      </div>
      {/* Action bar */}
      <div style={{ borderTop: `1px solid ${t.cardBorder}`, padding: '8px 14px', display: 'flex', gap: 8 }}
        onClick={e => e.stopPropagation()}>
        {phone && (
          <a href={`tel:${ev.contact_phone}`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 0', borderRadius: 9, background: es.bg, border: `1.5px solid ${es.border}44`, color: es.border, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            <Svg path={ICON_PATH.phone} size={12} color={es.border} sw={2.2} />
            Call
          </a>
        )}

        {onMarkComplete && !isCompleted && (
          <button onClick={onMarkComplete} disabled={completing}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 0', borderRadius: 9, background: completing ? t.cardBgAlt : '#DCFCE7', border: '1.5px solid #86EFAC', color: '#15803D', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: completing ? 0.6 : 1 }}>
            {completing ? '…' : (
              <>
                <Svg path={ICON_PATH.check} size={12} color="#15803D" sw={2.5} />
                Done
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
