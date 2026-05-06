'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { capName } from '@/lib/utils'
import { theme } from '@/lib/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CalEvent {
  id: string
  contact_name: string
  contact_phone: string | null
  contact_email: string | null
  lead_status: string
  lead_source: string | null
  quoted_amount: number | null
  scheduled_date: string | null
  follow_up_date: string | null
  notes: string | null
  message: string | null
  created_at: string
  _type: 'job' | 'followup'
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  New:       { bg: '#FEF3C7', color: '#D97706', label: 'New' },
  Contacted: { bg: '#DBEAFE', color: '#2563EB', label: 'Contacted' },
  Quoted:    { bg: '#EDE9FE', color: '#7C3AED', label: 'Quoted' },
  Scheduled: { bg: '#CCFBF1', color: '#0F766E', label: 'Scheduled' },
  Completed: { bg: '#F3F4F6', color: '#374151', label: 'Completed' },
  Paid:      { bg: '#DCFCE7', color: '#15803D', label: 'Job Won' },
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseLocal(s: string) {
  // Parse YYYY-MM-DD as local date (avoid UTC shift)
  const [y,m,d] = s.split('T')[0].split('-').map(Number)
  return new Date(y, m-1, d)
}
function fmt(d: string | null) {
  if (!d) return ''
  const dt = parseLocal(d)
  return `${SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()}`
}
function fmtPhone(p: string | null) {
  if (!p) return null
  const digits = p.replace(/\D/g,'')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return p
}
function startOfWeek(d: Date) {
  const dt = new Date(d); dt.setDate(dt.getDate() - dt.getDay()); return dt
}
function addDays(d: Date, n: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}
function isToday(d: Date) { return isSameDay(d, new Date()) }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getEventDate(ev: CalEvent): Date | null {
  const ds = ev._type === 'followup' ? (ev.follow_up_date || ev.scheduled_date) : (ev.scheduled_date || ev.follow_up_date)
  if (!ds) return null
  return parseLocal(ds)
}

function groupByDay(events: CalEvent[], days: Date[]): Record<string, CalEvent[]> {
  const map: Record<string, CalEvent[]> = {}
  days.forEach(d => { map[toDateKey(d)] = [] })
  events.forEach(ev => {
    const d = getEventDate(ev)
    if (!d) return
    const k = toDateKey(d)
    if (map[k]) map[k].push(ev)
  })
  return map
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PhoneBtn({ phone, size = 'sm' }: { phone: string; size?: 'sm' | 'md' }) {
  const p = size === 'md' ? '10px 18px' : '6px 12px'
  const fs = size === 'md' ? 13 : 12
  return (
    <a href={`tel:${phone}`}
      onClick={e => e.stopPropagation()}
      style={{ display:'inline-flex', alignItems:'center', gap:5, padding:p, borderRadius:8, background:'#F0FDFA', border:'1.5px solid #CCFBF1', color:'#0F766E', fontSize:fs, fontWeight:700, textDecoration:'none', flexShrink:0, cursor:'pointer' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/>
      </svg>
      Call
    </a>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || { bg:'#F3F4F6', color:'#374151', label: status }
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {s.label}
    </span>
  )
}

// Job card used in agenda + week view
function EventCard({ ev, onClick, dk }: { ev: CalEvent; onClick: () => void; dk: boolean }) {
  const t = theme(dk)
  const isFollowup = ev._type === 'followup'
  const accentColor = isFollowup ? '#D97706' : (STATUS_STYLE[ev.lead_status]?.color || '#0F766E')
  const accentBg    = isFollowup ? '#FFFBEB' : (STATUS_STYLE[ev.lead_status]?.bg || '#F0FDFA')
  return (
    <div onClick={onClick}
      style={{ background: dk ? t.cardBg : accentBg, borderLeft:`3px solid ${accentColor}`, borderRadius:10, padding:'10px 12px', cursor:'pointer', transition:'all 0.15s', border:`1px solid ${accentColor}22`, borderLeftWidth:3 }}
      onMouseEnter={e => (e.currentTarget.style.transform='translateY(-1px)', e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.transform='', e.currentTarget.style.boxShadow='')}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
          {isFollowup && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}>
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81"/>
              <path d="M1 1l22 22"/>
            </svg>
          )}
          <span style={{ fontSize:13, fontWeight:700, color: dk ? t.textPri : '#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {capName(ev.contact_name)}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          {ev.quoted_amount ? (
            <span style={{ fontSize:12, fontWeight:700, color:'#0F766E' }}>${ev.quoted_amount.toLocaleString()}</span>
          ) : null}
          {isFollowup
            ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:12, background:'#FEF3C7', color:'#D97706' }}>Follow-up</span>
            : <StatusPill status={ev.lead_status} />
          }
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
        <span style={{ fontSize:11, color: dk ? t.textSubtle : '#6B7280' }}>
          {isFollowup ? 'Follow-up reminder' : (ev.message ? ev.message.slice(0,40)+(ev.message.length>40?'…':'') : 'Tap to open')}
        </span>
        {ev.contact_phone && <PhoneBtn phone={ev.contact_phone} />}
      </div>
    </div>
  )
}

// ─── Detail panel (right side on desktop, bottom sheet on mobile) ─────────────
function DetailPanel({ ev, onClose, onOpenLead, dk }: { ev: CalEvent; onClose: () => void; onOpenLead: (id: string) => void; dk: boolean }) {
  const t = theme(dk)
  const isFollowup = ev._type === 'followup'
  const accentColor = isFollowup ? '#D97706' : (STATUS_STYLE[ev.lead_status]?.color || '#0F766E')
  const phone = fmtPhone(ev.contact_phone)
  const dateStr = ev._type === 'followup'
    ? fmt(ev.follow_up_date)
    : fmt(ev.scheduled_date)

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background: dk ? t.cardBg : '#fff', borderLeft: `4px solid ${accentColor}` }}>
      {/* Header */}
      <div style={{ padding:'20px 20px 16px', borderBottom:`1px solid ${t.cardBorder}`, background: dk ? t.cardBgAlt : (isFollowup ? '#FFFBEB' : STATUS_STYLE[ev.lead_status]?.bg || '#F0FDFA'), flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color: dk ? t.textPri : '#111827' }}>{capName(ev.contact_name)}</div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
              {isFollowup
                ? <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#FEF3C7', color:'#D97706' }}>Follow-up</span>
                : <StatusPill status={ev.lead_status} />
              }
              {dateStr && <span style={{ fontSize:12, color: dk ? t.textSubtle : '#6B7280' }}>{dateStr}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: dk ? t.textSubtle : '#9CA3AF', fontSize:22, lineHeight:1, padding:0 }}>×</button>
        </div>
        {/* Primary actions */}
        <div style={{ display:'flex', gap:8 }}>
          {phone && (
            <a href={`tel:${ev.contact_phone}`}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background:'white', border:`1.5px solid ${accentColor}44`, color:accentColor, fontSize:13, fontWeight:700, textDecoration:'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
              {phone}
            </a>
          )}
          <button onClick={() => onOpenLead(ev.id)}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background:`linear-gradient(135deg,#0F766E,#0D9488)`, border:'none', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Open Lead
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
          </button>
        </div>
      </div>

      {/* Details */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
        {/* Info rows */}
        <div style={{ background: dk ? t.cardBgAlt : '#F9FAFB', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color: dk ? t.textSubtle : '#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Details</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { label: 'Date',   value: dateStr || '—' },
              { label: 'Phone',  value: phone || '—' },
              { label: 'Email',  value: ev.contact_email || '—' },
              { label: 'Source', value: (ev.lead_source || 'Unknown').replace(/_/g,' ') },
              { label: 'Value',  value: ev.quoted_amount ? `$${ev.quoted_amount.toLocaleString()}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13 }}>
                <span style={{ color: dk ? t.textSubtle : '#6B7280' }}>{label}</span>
                <span style={{ color: dk ? t.textPri : '#111827', fontWeight:500, textAlign:'right', maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Message */}
        {ev.message && (
          <div style={{ background: dk ? '#1a1f2e' : '#FFFBEB', borderRadius:12, padding:'14px 16px', border:`1px solid ${dk ? '#334155' : '#FDE68A'}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Message</div>
            <p style={{ fontSize:13, color: dk ? t.textBody : '#374151', lineHeight:1.6, margin:0 }}>{ev.message}</p>
          </div>
        )}

        {/* Notes */}
        {ev.notes && (
          <div style={{ background: dk ? '#0f1e1a' : '#F0FDFA', borderRadius:12, padding:'14px 16px', border:`1px solid ${dk ? '#1a3a2e' : '#CCFBF1'}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#0F766E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Notes</div>
            <p style={{ fontSize:13, color: dk ? t.textBody : '#374151', lineHeight:1.6, margin:0, whiteSpace:'pre-wrap' }}>{ev.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mini month calendar ───────────────────────────────────────────────────────
function MiniMonth({ year, month, selectedDate, dotDates, onSelect, onMonthChange, dk }: {
  year: number; month: number; selectedDate: Date
  dotDates: Set<string>; onSelect: (d: Date) => void; onMonthChange: (y: number, m: number) => void; dk: boolean
}) {
  const t = theme(dk)
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells: (number|null)[] = Array(firstDay).fill(null)
  for (let i=1; i<=daysInMonth; i++) cells.push(i)
  while (cells.length % 7 !== 0) cells.push(null)

  function prev() { month === 0 ? onMonthChange(year-1, 11) : onMonthChange(year, month-1) }
  function next() { month === 11 ? onMonthChange(year+1, 0) : onMonthChange(year, month+1) }

  return (
    <div style={{ background: dk ? t.cardBg : 'white', borderRadius:14, padding:16, border:`1px solid ${t.cardBorder}` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <button onClick={prev} style={{ background:'none', border:'none', cursor:'pointer', color: dk ? t.textMuted : '#6B7280', padding:'4px 6px', borderRadius:6, fontSize:14 }}>‹</button>
        <span style={{ fontSize:13, fontWeight:700, color: dk ? t.textPri : '#111827' }}>{MONTHS[month]} {year}</span>
        <button onClick={next} style={{ background:'none', border:'none', cursor:'pointer', color: dk ? t.textMuted : '#6B7280', padding:'4px 6px', borderRadius:6, fontSize:14 }}>›</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:4 }}>
        {['S','M','T','W','T','F','S'].map((d,i) => (
          <div key={i} style={{ textAlign:'center', fontSize:10, fontWeight:700, color: dk ? t.textSubtle : '#9CA3AF', padding:'2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const d = new Date(year, month, day)
          const key = toDateKey(d)
          const isSelected = isSameDay(d, selectedDate)
          const isTod = isToday(d)
          const hasDot = dotDates.has(key)
          return (
            <button key={i} onClick={() => onSelect(d)}
              style={{ width:'100%', aspectRatio:'1', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:8, border:'none', cursor:'pointer', background: isSelected ? '#0F766E' : isTod ? '#CCFBF1' : 'transparent', color: isSelected ? 'white' : isTod ? '#0F766E' : dk ? t.textPri : '#374151', fontSize:12, fontWeight: isTod || isSelected ? 700 : 400, position:'relative', gap:1 }}>
              {day}
              {hasDot && <div style={{ width:4, height:4, borderRadius:'50%', background: isSelected ? 'rgba(255,255,255,0.8)' : '#0F766E', flexShrink:0 }} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week strip (mobile) ──────────────────────────────────────────────────────
function WeekStrip({ selectedDate, dotDates, onSelect, dk }: {
  selectedDate: Date; dotDates: Set<string>; onSelect: (d: Date) => void; dk: boolean
}) {
  const t = theme(dk)
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({length:7}, (_,i) => addDays(weekStart, i))
  return (
    <div style={{ display:'flex', gap:3 }} className="hide-scrollbar">
      {days.map(d => {
        const key = toDateKey(d)
        const isSelected = isSameDay(d, selectedDate)
        const isTod = isToday(d)
        const hasDot = dotDates.has(key)
        return (
          <button key={key} onClick={() => onSelect(d)}
            style={{
              flex:1, minWidth:0,
              display:'flex', flexDirection:'column', alignItems:'center', gap:1,
              padding:'8px 2px 6px',
              borderRadius:12, border:'none', cursor:'pointer',
              background: isSelected ? '#0F766E' : isTod ? '#CCFBF1' : 'transparent',
              transition:'all 0.12s',
              minHeight:54,  // minimum thumb-friendly height
            }}>
            {/* Day letter — larger, bolder, high contrast */}
            <span style={{
              fontSize:13, fontWeight:800, letterSpacing:'0.02em',
              color: isSelected ? 'rgba(255,255,255,0.9)' : isTod ? '#0F766E' : dk ? '#94A3B8' : '#374151'
            }}>
              {DAYS[d.getDay()].slice(0,1)}
            </span>
            {/* Date number — larger for readability in bright light */}
            <span style={{
              fontSize:19, fontWeight:900, lineHeight:1,
              color: isSelected ? 'white' : isTod ? '#0F766E' : dk ? '#F1F5F9' : '#111827'
            }}>
              {d.getDate()}
            </span>
            {/* Dot indicator */}
            {hasDot
              ? <div style={{ width:5, height:5, borderRadius:'50%', background: isSelected ? 'rgba(255,255,255,0.75)' : '#0F766E', marginTop:1 }} />
              : <div style={{ width:5, height:5 }} /> /* spacer to keep height consistent */
            }
          </button>
        )
      })}
    </div>
  )
}

// ─── EventCardMobile — cleaner card without raw message text ──────────────────
function EventCardMobile({ ev, onClick, dk, onMarkComplete, completing }: {
  ev: CalEvent; onClick: () => void; dk: boolean
  onMarkComplete?: () => void; completing?: boolean
}) {
  const isFollowup = ev._type === 'followup'
  const isCompleted = ev.lead_status === 'Completed' || ev.lead_status === 'Paid'
  const accentColor = isCompleted ? '#15803D' : isFollowup ? '#D97706' : (STATUS_STYLE[ev.lead_status]?.color || '#0F766E')
  const accentBg    = isCompleted ? '#F0FDF4' : isFollowup ? '#FFFBEB' : (STATUS_STYLE[ev.lead_status]?.bg || '#F0FDFA')

  const dateStr = ev._type === 'followup' ? fmt(ev.follow_up_date) : fmt(ev.scheduled_date)

  // Build Google Maps URL from city/message (best effort without full address)
  const mapsQuery = encodeURIComponent(ev.message?.slice(0,50) || ev.contact_name)
  const mapsUrl = `https://maps.google.com/?q=${mapsQuery}`

  return (
    <div onClick={onClick}
      style={{ background: accentBg, borderLeft:`3px solid ${accentColor}`, borderRadius:12, padding:'12px 14px', cursor:'pointer', border:`1px solid ${accentColor}22`, borderLeftWidth:3, opacity: isCompleted ? 0.75 : 1 }}>
      {/* Row 1: name + amount + status */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, minWidth:0 }}>
          {isFollowup && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink:0 }}>
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81M1 1l22 22"/>
            </svg>
          )}
          {isCompleted && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink:0 }}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          )}
          <span style={{ fontSize:16, fontWeight:700, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {capName(ev.contact_name)}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
          {ev.quoted_amount ? (
            <span style={{ fontSize:13, fontWeight:700, color:'#0F766E' }}>${ev.quoted_amount.toLocaleString()}</span>
          ) : null}
          <span style={{ fontSize:13, fontWeight:700, padding:'4px 10px', borderRadius:20, background: accentBg, color: accentColor, border:`1px solid ${accentColor}33` }}>
            {isFollowup ? 'Follow-up' : (STATUS_STYLE[ev.lead_status]?.label || ev.lead_status)}
          </span>
        </div>
      </div>

      {/* Row 2: date + action buttons */}
      <div style={{ display:'flex', alignItems:'center', gap:6 }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize:13, color:'#6B7280', flex:1 }}>{dateStr || (isToday(new Date()) ? 'Today' : '')}</span>

        {/* Call */}
        {ev.contact_phone && (
          <a href={`tel:${ev.contact_phone}`}
            style={{ display:'flex', alignItems:'center', gap:4, padding:'10px 16px', borderRadius:10, background:'white', border:`1.5px solid ${accentColor}44`, color:accentColor, fontSize:14, fontWeight:700, textDecoration:'none' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/>
            </svg>
            Call
          </a>
        )}

        {/* Navigate — jobs only */}
        {ev._type === 'job' && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ display:'flex', alignItems:'center', gap:4, padding:'10px 16px', borderRadius:10, background:'white', border:'1.5px solid #E5E7EB', color:'#374151', fontSize:14, fontWeight:700, textDecoration:'none' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.2" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            Nav
          </a>
        )}

        {/* Mark Complete — only for Scheduled jobs */}
        {onMarkComplete && !isCompleted && (
          <button onClick={onMarkComplete} disabled={completing}
            style={{ display:'flex', alignItems:'center', gap:4, padding:'10px 16px', borderRadius:10, background: completing ? '#F3F4F6' : '#DCFCE7', border:'1.5px solid #86EFAC', color:'#15803D', fontSize:14, fontWeight:700, cursor:'pointer', opacity: completing ? 0.6 : 1 }}>
            {completing ? '…' : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                Done
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
// ─── UnscheduledList — collapsible, shows age not "Needs date" ────────────────
function UnscheduledList({ leads, dk, onOpen }: { leads: CalEvent[]; dk: boolean; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? leads : leads.slice(0, 2)
  const t = theme(dk)
  const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

  return (
    <div style={{ marginTop:16 }}>
      {/* Section header — teal not amber (not urgent, just workflow) */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#0F766E' }}>
          Needs scheduling ({leads.length})
        </div>
        {leads.length > 2 && (
          <button onClick={() => setExpanded(e => !e)}
            style={{ fontSize:13, fontWeight:700, color:'#0F766E', background:'#F0FDFA', border:'1.5px solid #CCFBF1', cursor:'pointer', padding:'6px 12px', borderRadius:20 }}>
            {expanded ? 'Show less ∧' : `Show all ${leads.length} ∨`}
          </button>
        )}
      </div>

      {visible.map((ev, i) => {
        const days = daysSince(ev.created_at)
        const urgColor = days > 3 ? '#DC2626' : days >= 2 ? '#B45309' : '#059669'
        const urgBg   = days > 3 ? '#FEE2E2' : days >= 2 ? '#FEF3C7' : '#D1FAE5'

        return (
          <div key={ev.id}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderRadius:14, background: dk ? t.cardBg : 'white', border:`1px solid ${t.cardBorder}`, marginBottom:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:16, fontWeight:700, color: dk ? t.textPri : '#111827' }}>{capName(ev.contact_name)}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                <span style={{ fontSize:14, fontWeight:500, color: dk ? t.textSubtle : '#6B7280' }}>{ev.lead_status}</span>
                <span style={{ fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:8, background: urgBg, color: urgColor }}>{days}d ago</span>
              </div>
            </div>
            {/* Call or Add Phone */}
            {ev.contact_phone ? (
              <a href={`tel:${ev.contact_phone}`}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'11px 16px', borderRadius:12, background:'#F0FDFA', border:'1.5px solid #CCFBF1', color:'#0F766E', fontSize:13, fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/>
                </svg>
                Call
              </a>
            ) : (
              <span style={{ fontSize:13, color: dk ? t.textSubtle : '#9CA3AF', flexShrink:0 }}>No phone</span>
            )}
            {/* Open → */}
            <button onClick={() => onOpen(ev.id)}
              style={{ width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:12, background: dk ? '#334155' : '#F3F4F6', border:'none', cursor:'pointer', flexShrink:0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={dk ? '#94A3B8' : '#6B7280'} strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [dk, setDk] = useState<boolean>(false)

  const [view, setView] = useState<'week'|'month'>('week')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [miniMonth, setMiniMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() })

  const [events, setEvents] = useState<CalEvent[]>([])
  const [unscheduled, setUnscheduled] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [mobileView, setMobileView] = useState<'week'|'month'>('week')

  // Filter chips state
  const [showJobs,      setShowJobs]      = useState(true)
  const [showFollowups, setShowFollowups] = useState(true)
  const [showOverdue,   setShowOverdue]   = useState(false)

  // Swipe gesture state
  const [touchStartX, setTouchStartX] = useState<number|null>(null)

  // Mark complete state
  const [completing, setCompleting] = useState<string|null>(null)

  const t = theme(dk)

  // Auth
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.push('/login'); return }
    setSession(JSON.parse(raw))
    setDk(localStorage.getItem('pg_darkmode') === '1')
  }, [router])

  // Fetch events for current window
  const fetchEvents = useCallback(async (session: Session, center: Date) => {
    setLoading(true)
    const from = toDateKey(addDays(center, -30))
    const to   = toDateKey(addDays(center, 60))
    try {
      const r = await fetch(`/api/calendar?pro_id=${session.id}&from=${from}&to=${to}`)
      const d = await r.json()
      setEvents(d.events || [])
      setUnscheduled(d.unscheduled || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    if (session) fetchEvents(session, selectedDate)
  }, [session, fetchEvents])

  // Week days for current view
  const weekStart = startOfWeek(selectedDate)
  const weekDays  = Array.from({length:7}, (_,i) => addDays(weekStart, i))

  // Month grid
  const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth()+1, 0).getDate()

  // Dot dates (all dates that have events)
  const dotDates = new Set(events.map(ev => {
    const d = getEventDate(ev)
    return d ? toDateKey(d) : null
  }).filter(Boolean) as string[])

  // Events for selected day (mobile agenda) — computed below with filters
  const selectedDayKey = toDateKey(selectedDate)

  // Week grouped
  const weekGrouped = groupByDay(events, weekDays)

  // Today stats — scheduled value, not just paid
  const todayKey = toDateKey(new Date())
  const todayJobs = events.filter(ev => {
    const d = getEventDate(ev)
    return d && toDateKey(d) === todayKey && ev._type === 'job'
  })
  const todayScheduledValue = todayJobs.reduce((sum, ev) => sum + (ev.quoted_amount || 0), 0)

  // Overdue follow-ups — follow_up_date is in the past and not completed/paid
  const today0 = new Date(); today0.setHours(0,0,0,0)
  const overdueFollowups = events.filter(ev => {
    if (ev._type !== 'followup') return false
    const d = getEventDate(ev)
    if (!d) return false
    return d < today0 && !['Completed','Paid'].includes(ev.lead_status)
  })

  // Apply filters to selected day events
  const selectedDayEventsRaw = events.filter(ev => {
    const d = getEventDate(ev)
    return d && toDateKey(d) === selectedDayKey
  })
  const todayEvents = selectedDayEventsRaw.filter(ev => {
    if (showOverdue) {
      const d = getEventDate(ev)
      if (!d) return false
      return d < today0
    }
    if (ev._type === 'job' && !showJobs) return false
    if (ev._type === 'followup' && !showFollowups) return false
    return true
  })

  function navWeek(dir: number) {
    const next = addDays(selectedDate, dir * 7)
    setSelectedDate(next)
    setMiniMonth({ year: next.getFullYear(), month: next.getMonth() })
  }
  function navDay(dir: number) {
    const next = addDays(selectedDate, dir)
    setSelectedDate(next)
    setMiniMonth({ year: next.getFullYear(), month: next.getMonth() })
  }
  function goToday() {
    const now = new Date()
    setSelectedDate(now)
    setMiniMonth({ year: now.getFullYear(), month: now.getMonth() })
  }
  function selectDay(d: Date) {
    setSelectedDate(d)
    setMiniMonth({ year: d.getFullYear(), month: d.getMonth() })
    setSelectedEvent(null)
  }

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX)
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) > 60) navDay(dx < 0 ? 1 : -1)
    setTouchStartX(null)
  }

  async function markComplete(ev: CalEvent) {
    if (!session || completing) return
    setCompleting(ev.id)
    try {
      await fetch(`/api/leads/${ev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pro_id: session.id, lead_status: 'Completed' }),
      })
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, lead_status: 'Completed' } : e))
    } finally { setCompleting(null) }
  }

  if (!session) return null

  // ── Desktop layout ──────────────────────────────────────────────────────────
  const DesktopView = (
    <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden' }}>

      {/* Left panel — mini cal + filters */}
      <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${t.cardBorder}`, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:16, background: dk ? t.cardBgAlt : '#FAFAF8' }}>
        <MiniMonth
          year={miniMonth.year} month={miniMonth.month}
          selectedDate={selectedDate} dotDates={dotDates}
          onSelect={selectDay}
          onMonthChange={(y,m) => setMiniMonth({year:y,month:m})}
          dk={dk}
        />

        {/* Today's summary */}
        <div style={{ background: dk ? t.cardBg : 'white', borderRadius:14, padding:14, border:`1px solid ${t.cardBorder}` }}>
          <div style={{ fontSize:11, fontWeight:700, color: dk ? t.textSubtle : '#9CA3AF', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Today</div>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#0F766E' }}>{todayJobs.length}</div>
              <div style={{ fontSize:10, color: dk ? t.textSubtle : '#6B7280', marginTop:2 }}>Jobs</div>
            </div>
            <div style={{ width:1, background: t.cardBorder }} />
            <div style={{ flex:1, textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#15803D' }}>${todayScheduledValue > 0 ? todayScheduledValue.toLocaleString() : '0'}</div>
              <div style={{ fontSize:10, color: dk ? t.textSubtle : '#6B7280', marginTop:2 }}>Scheduled</div>
            </div>
          </div>
        </div>

        {/* Unscheduled leads */}
        {unscheduled.length > 0 && (
          <div style={{ background: dk ? t.cardBg : 'white', borderRadius:14, padding:14, border:`1px solid ${t.cardBorder}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#D97706', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
              Needs Scheduling ({unscheduled.length})
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {unscheduled.map(ev => (
                <div key={ev.id}
                  onClick={() => router.push('/dashboard/pipeline/'+ev.id)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', borderRadius:8, background: dk ? t.cardBgAlt : '#FFFBEB', cursor:'pointer', border:'1px solid #FDE68A' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FEF3C7')}
                  onMouseLeave={e => (e.currentTarget.style.background = dk ? t.cardBgAlt : '#FFFBEB')}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: dk ? t.textPri : '#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{capName(ev.contact_name)}</div>
                    <div style={{ fontSize:10, color:'#D97706', marginTop:1 }}>{ev.lead_status}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Center — week/month view */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
        {/* Toolbar */}
        <div style={{ padding:'12px 20px', borderBottom:`1px solid ${t.cardBorder}`, display:'flex', alignItems:'center', gap:10, background: dk ? t.cardBg : 'white', flexShrink:0, position:'sticky', top:0, zIndex:10 }}>
          <button onClick={goToday}
            style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${t.inputBorder}`, background: dk ? t.cardBgAlt : '#F9FAFB', color: dk ? t.textPri : '#374151', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Today
          </button>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={() => navWeek(-1)} style={{ width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, border:`1.5px solid ${t.inputBorder}`, background:'transparent', color: dk ? t.textMuted : '#6B7280', cursor:'pointer', fontSize:16 }}>‹</button>
            <button onClick={() => navWeek(1)}  style={{ width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, border:`1.5px solid ${t.inputBorder}`, background:'transparent', color: dk ? t.textMuted : '#6B7280', cursor:'pointer', fontSize:16 }}>›</button>
          </div>
          <span style={{ fontSize:15, fontWeight:700, color: dk ? t.textPri : '#111827', flex:1 }}>
            {view === 'week'
              ? `${SHORT_MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${SHORT_MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
              : `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
            }
          </span>
          {/* View toggle */}
          <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:`1.5px solid ${t.inputBorder}` }}>
            {(['week','month'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding:'5px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background: view===v ? '#0F766E' : 'transparent', color: view===v ? 'white' : dk ? t.textMuted : '#6B7280', textTransform:'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color: dk ? t.textSubtle : '#9CA3AF', fontSize:14 }}>Loading…</div>
        ) : view === 'week' ? (
          /* Week view */
          <div style={{ flex:1, overflowX:'auto' }}>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:`1px solid ${t.cardBorder}`, background: dk ? t.cardBg : 'white', position:'sticky', top:0, zIndex:9 }}>
              {weekDays.map(d => {
                const isTod = isToday(d)
                const isSel = isSameDay(d, selectedDate)
                return (
                  <div key={toDateKey(d)} onClick={() => selectDay(d)}
                    style={{ padding:'10px 8px', textAlign:'center', borderRight:`1px solid ${t.cardBorder}`, cursor:'pointer', background: isSel ? '#F0FDFA' : 'transparent' }}>
                    <div style={{ fontSize:10, fontWeight:600, color: dk ? t.textSubtle : '#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em' }}>{DAYS[d.getDay()]}</div>
                    <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'4px auto 0', background: isTod ? '#0F766E' : 'transparent' }}>
                      <span style={{ fontSize:14, fontWeight:700, color: isTod ? 'white' : isSel ? '#0F766E' : dk ? t.textPri : '#374151' }}>{d.getDate()}</span>
                    </div>
                    {dotDates.has(toDateKey(d)) && !isTod && (
                      <div style={{ width:4, height:4, borderRadius:'50%', background:'#0F766E', margin:'3px auto 0' }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Event rows per day */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', alignItems:'start', padding:'12px 8px', gap:0 }}>
              {weekDays.map(d => {
                const key = toDateKey(d)
                const dayEvs = weekGrouped[key] || []
                const isSel = isSameDay(d, selectedDate)
                return (
                  <div key={key}
                    style={{ padding:'0 4px', borderRight:`1px solid ${t.divider}`, minHeight:80, background: isSel ? (dk ? 'rgba(15,118,110,0.06)' : '#F9FEFE') : 'transparent' }}>
                    {dayEvs.length === 0 ? (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:60, color: dk ? t.textSubtle : '#D1D5DB', fontSize:20 }}>·</div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:4, paddingTop:4 }}>
                        {dayEvs.map(ev => (
                          <div key={ev.id+ev._type}
                            onClick={() => { selectDay(d); setSelectedEvent(ev) }}
                            style={{
                              padding:'5px 7px', borderRadius:7, cursor:'pointer',
                              background: ev._type==='followup' ? '#FEF3C7' : (STATUS_STYLE[ev.lead_status]?.bg || '#F0FDFA'),
                              borderLeft:`3px solid ${ev._type==='followup' ? '#D97706' : (STATUS_STYLE[ev.lead_status]?.color||'#0F766E')}`,
                              fontSize:11, fontWeight:600,
                              color: ev._type==='followup' ? '#92400E' : (STATUS_STYLE[ev.lead_status]?.color||'#0F766E'),
                              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                              transition:'transform 0.1s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.transform='scale(1.02)')}
                            onMouseLeave={e => (e.currentTarget.style.transform='')}>
                            {capName(ev.contact_name)}
                            {ev.quoted_amount ? ` · $${ev.quoted_amount.toLocaleString()}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          /* Month view */
          <div style={{ padding:16 }}>
            {/* Month grid header */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color: dk ? t.textSubtle : '#9CA3AF', padding:'4px 0', textTransform:'uppercase', letterSpacing:'0.06em' }}>{d}</div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {Array(firstDay).fill(null).map((_,i) => <div key={'e'+i} />)}
              {Array.from({length:daysInMonth},(_,i)=>i+1).map(day => {
                const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day)
                const key = toDateKey(d)
                const dayEvs = events.filter(ev => { const ed=getEventDate(ev); return ed && toDateKey(ed)===key })
                const isTod = isToday(d)
                const isSel = isSameDay(d, selectedDate)
                return (
                  <div key={day} onClick={() => selectDay(d)}
                    style={{ minHeight:80, padding:'6px', borderRadius:8, cursor:'pointer', border:`1px solid ${isSel ? '#0F766E' : t.divider}`, background: isTod ? (dk ? '#0f2a1a' : '#F0FDFA') : dk ? t.cardBg : 'white', transition:'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = dk ? '#1a2940' : '#F9FEFE')}
                    onMouseLeave={e => (e.currentTarget.style.background = isTod ? (dk ? '#0f2a1a' : '#F0FDFA') : dk ? t.cardBg : 'white')}>
                    <div style={{ fontSize:12, fontWeight: isTod ? 800 : 500, color: isTod ? '#0F766E' : dk ? t.textPri : '#374151', marginBottom:4 }}>{day}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      {dayEvs.slice(0,3).map(ev => (
                        <div key={ev.id+ev._type}
                          onClick={e => { e.stopPropagation(); setSelectedEvent(ev) }}
                          style={{ fontSize:9, fontWeight:700, padding:'2px 4px', borderRadius:4, background: ev._type==='followup' ? '#FEF3C7' : (STATUS_STYLE[ev.lead_status]?.bg||'#F0FDFA'), color: ev._type==='followup' ? '#92400E' : (STATUS_STYLE[ev.lead_status]?.color||'#0F766E'), overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {capName(ev.contact_name)}
                        </div>
                      ))}
                      {dayEvs.length > 3 && (
                        <div style={{ fontSize:9, color: dk ? t.textSubtle : '#9CA3AF', paddingLeft:4 }}>+{dayEvs.length-3} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right panel — detail */}
      <div style={{ width: selectedEvent ? 320 : 0, flexShrink:0, borderLeft: selectedEvent ? `1px solid ${t.cardBorder}` : 'none', overflow:'hidden', transition:'width 0.2s ease' }}>
        {selectedEvent && (
          <DetailPanel ev={selectedEvent} onClose={() => setSelectedEvent(null)} onOpenLead={id => router.push('/dashboard/pipeline/'+id)} dk={dk} />
        )}
      </div>
    </div>
  )

  // ── Mobile layout ───────────────────────────────────────────────────────────
  const MobileView = (
    <div style={{ minHeight:'100vh', background: dk ? t.pageBg : '#F5F4F0', display:'flex', flexDirection:'column' }}>

      {/* Mobile header */}
      <div style={{ padding:'14px 16px 10px', background: dk ? t.cardBg : 'white', borderBottom:`1px solid ${t.cardBorder}`, flexShrink:0 }}>

        {/* Row 1: Week nav + month name */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <button onClick={() => navWeek(-1)}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:48, height:48, borderRadius:14, border:`1.5px solid ${dk ? '#334155' : '#E8E2D9'}`, background: dk ? '#1E293B' : '#F9FAFB', cursor:'pointer', flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dk ? '#CBD5E1' : '#374151'} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:800, color: dk ? '#F1F5F9' : '#111827', letterSpacing:'-0.3px' }}>
              {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </div>
            <div style={{ fontSize:12, fontWeight:600, color: dk ? '#64748B' : '#6B7280', marginTop:1 }}>
              {isToday(selectedDate) ? 'Today' : `${DAYS[selectedDate.getDay()]}, ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
              {todayJobs.length > 0 && ` · ${todayJobs.length} job${todayJobs.length!==1?'s':''}`}
            </div>
          </div>
          <button onClick={() => navWeek(1)}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:48, height:48, borderRadius:14, border:`1.5px solid ${dk ? '#334155' : '#E8E2D9'}`, background: dk ? '#1E293B' : '#F9FAFB', cursor:'pointer', flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dk ? '#CBD5E1' : '#374151'} strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {/* Row 2: Month jump + Week strip */}
        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:10 }}>
          <button onClick={() => { const d=new Date(selectedDate); d.setMonth(d.getMonth()-1); d.setDate(1); selectDay(d) }}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:40, height:44, borderRadius:12, border:`1.5px solid ${dk ? '#334155' : '#E8E2D9'}`, background: dk ? '#1E293B' : '#F9FAFB', cursor:'pointer', flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dk ? '#CBD5E1' : '#374151'} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ flex:1 }}>
            <WeekStrip selectedDate={selectedDate} dotDates={dotDates} onSelect={selectDay} dk={dk} />
          </div>
          <button onClick={() => { const d=new Date(selectedDate); d.setMonth(d.getMonth()+1); d.setDate(1); selectDay(d) }}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:40, height:44, borderRadius:12, border:`1.5px solid ${dk ? '#334155' : '#E8E2D9'}`, background: dk ? '#1E293B' : '#F9FAFB', cursor:'pointer', flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={dk ? '#CBD5E1' : '#374151'} strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {/* Row 3a: Today link + Week/Month toggle */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
          {!isToday(selectedDate) && (
            <button onClick={goToday}
              style={{ fontSize:13, fontWeight:700, padding:'8px 16px', borderRadius:22, border:`1.5px solid #0F766E`, background:'transparent', color:'#0F766E', cursor:'pointer', flexShrink:0 }}>
              ← Today
            </button>
          )}
          <div style={{ display:'flex', borderRadius:22, overflow:'hidden', border:`1.5px solid ${dk ? '#334155' : '#E8E2D9'}` }}>
            {(['week','month'] as const).map(v => (
              <button key={v} onClick={() => setMobileView(v)}
                style={{ padding:'9px 18px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background: mobileView===v ? '#0F766E' : 'transparent', color: mobileView===v ? 'white' : (dk ? '#94A3B8' : '#6B7280'), textTransform:'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3b: Filter chips */}
        <div style={{ display:'flex', gap:8 }}>
          {([
            { k:'jobs', label:'Jobs',       active:showJobs,      set:()=>setShowJobs(v=>!v) },
            { k:'fu',   label:'Follow-ups', active:showFollowups, set:()=>setShowFollowups(v=>!v) },
            { k:'ov',   label:'Overdue',    active:showOverdue,   set:()=>setShowOverdue(v=>!v) },
          ] as const).map(chip => (
            <button key={chip.k} onClick={chip.set}
              style={{ fontSize:13, fontWeight:700, padding:'9px 14px', borderRadius:22, border:`1.5px solid ${chip.active ? '#0F766E' : (dk ? '#334155' : '#E8E2D9')}`, background: chip.active ? '#0F766E' : 'transparent', color: chip.active ? 'white' : (dk ? '#94A3B8' : '#6B7280'), cursor:'pointer', whiteSpace:'nowrap' }}>
              {chip.active ? '✓ ' : ''}{chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scheduled value strip */}
      {todayJobs.length > 0 && (
        <div style={{ margin:'10px 16px 0', padding:'10px 16px', background: dk ? t.cardBg : 'white', borderRadius:12, border:`1px solid ${t.cardBorder}`, display:'flex' }}>
          <div style={{ flex:1, textAlign:'center', borderRight:`1px solid ${t.cardBorder}` }}>
            <div style={{ fontSize:20, fontWeight:800, color:'#0F766E' }}>{todayJobs.length}</div>
            <div style={{ fontSize:11, color: dk ? t.textSubtle : '#6B7280', marginTop:1 }}>{isToday(selectedDate) ? 'Jobs today' : 'Jobs'}</div>
          </div>
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:'#15803D' }}>{todayScheduledValue > 0 ? `$${todayScheduledValue.toLocaleString()}` : '—'}</div>
            <div style={{ fontSize:11, color: dk ? t.textSubtle : '#6B7280', marginTop:1 }}>Scheduled</div>
          </div>
        </div>
      )}

      {/* Overdue alert */}
      {overdueFollowups.length > 0 && isToday(selectedDate) && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#DC2626', flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#991B1B' }}>{overdueFollowups.length} overdue follow-up{overdueFollowups.length!==1?'s':''}</div>
            <div style={{ fontSize:11, color:'#B91C1C', marginTop:1 }}>{overdueFollowups.map(e => capName(e.contact_name)).join(', ')}</div>
          </div>
          <button onClick={() => setShowOverdue(true)} style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'none', border:'none', cursor:'pointer', flexShrink:0 }}>View →</button>
        </div>
      )}

      {/* Day agenda — swipeable */}
      <div style={{ flex:1, padding:'12px 20px', display:'flex', flexDirection:'column', gap:12, overflowY:'auto' }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {loading ? (
          [1,2,3].map(i => <div key={i} style={{ height:72, borderRadius:12, background: dk ? t.cardBg : 'white', animation:'shimmer 1.4s ease-in-out infinite', backgroundSize:'200% 100%' }} />)
        ) : todayEvents.length === 0 ? (
          <div style={{ textAlign:'center', padding:'24px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <div style={{ width:60, height:60, borderRadius:'50%', background:'linear-gradient(135deg,#0F766E18,#14B8A618)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:20, fontWeight:800, color: dk ? t.textPri : '#111827', marginBottom:6 }}>
                {isToday(selectedDate) ? 'No jobs today' : `Nothing on ${DAYS[selectedDate.getDay()]} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
              </div>
              <div style={{ fontSize:15, color: dk ? t.textSubtle : '#6B7280', lineHeight:1.6 }}>
                {events.length === 0 && unscheduled.length === 0 ? 'Your calendar is empty — schedule your first job from the pipeline'
                  : showOverdue ? 'No overdue items'
                  : isToday(selectedDate) ? 'Your day is open — great time to follow up with leads'
                  : 'Nothing scheduled on this day'}
              </div>
            </div>
            {events.length === 0 && unscheduled.length === 0 && (
              <button onClick={() => router.push('/dashboard/pipeline')}
                style={{ padding:'14px 28px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                Go to Pipeline →
              </button>
            )}
            {unscheduled.length > 0 && (
              <button onClick={() => router.push('/dashboard/pipeline')}
                style={{ width:'100%', padding:'16px', borderRadius:14, border:`2px dashed #0F766E`, background:'transparent', color:'#0F766E', fontSize:16, fontWeight:700, cursor:'pointer' }}>
                + Schedule a job on {SHORT_MONTHS[selectedDate.getMonth()]} {selectedDate.getDate()} →
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize:15, fontWeight:700, color: dk ? t.textSubtle : '#4B5563' }}>
              {todayEvents.length} event{todayEvents.length!==1?'s':''} · {isToday(selectedDate) ? 'Today' : `${DAYS[selectedDate.getDay()]} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
            </div>
            {(todayEvents as CalEvent[]).map((ev: CalEvent) => (
              <div key={ev.id+ev._type}>
                <EventCardMobile ev={ev} onClick={() => setSelectedEvent(ev)} dk={dk as boolean}
                  onMarkComplete={ev._type === 'job' && ev.lead_status === 'Scheduled' ? () => markComplete(ev) : undefined}
                  completing={completing === ev.id} />
              </div>
            ))}
          </>
        )}

        {/* Unscheduled leads — mobile — collapsed by default if >2 */}
        {unscheduled.length > 0 && (
          <UnscheduledList leads={unscheduled} dk={dk} onOpen={id => router.push('/dashboard/pipeline/'+id)} />
        )}
      </div>

      {/* Mobile detail bottom sheet */}
      {selectedEvent && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
          onClick={() => setSelectedEvent(null)}>
          <div style={{ background:'rgba(0,0,0,0.4)', position:'absolute', inset:0 }} />
          <div style={{ position:'relative', maxHeight:'75vh', borderRadius:'20px 20px 0 0', overflow:'hidden', background: dk ? t.cardBg : 'white', zIndex:1 }}
            onClick={e => e.stopPropagation()}>
            {/* Drag handle */}
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}>
              <div style={{ width:36, height:4, borderRadius:2, background: dk ? t.cardBorder : '#E5E7EB' }} />
            </div>
            <div style={{ maxHeight:'calc(75vh - 20px)', overflowY:'auto' }}>
              <DetailPanel ev={selectedEvent} onClose={() => setSelectedEvent(null)} onOpenLead={id => { setSelectedEvent(null); router.push('/dashboard/pipeline/'+id) }} dk={dk} />
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <DashboardShell
        session={session} newLeads={0} onAddLead={() => {}}
        darkMode={dk} onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}
      >
        {/* Desktop */}
        <div className="hidden md:block">{DesktopView}</div>
        {/* Mobile */}
        <div className="md:hidden">{MobileView}</div>
      </DashboardShell>
    </>
  )
}
