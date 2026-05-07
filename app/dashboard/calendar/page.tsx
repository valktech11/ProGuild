'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { EventChip, CalEvent } from '@/components/ui/EventChip'
import { Session } from '@/types'
import { capName } from '@/lib/utils'
import { theme, T, BRAND } from '@/lib/tokens'
import { ICON_PATH } from '@/lib/design'

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DAYS         = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS       = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseLocal(s: string) {
  const [y,m,d] = s.split('T')[0].split('-').map(Number)
  return new Date(y, m-1, d)
}
function fmt(d: string | null) {
  if (!d) return ''
  const dt = parseLocal(d)
  return `${SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()}`
}
function fmtPhone(p: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/\D/g,'')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return p
}
function fmtTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2,'0')}${ampm}`
}
function startOfWeek(d: Date) { const dt=new Date(d); dt.setDate(dt.getDate()-dt.getDay()); return dt }
function addDays(d: Date, n: number) { const dt=new Date(d); dt.setDate(dt.getDate()+n); return dt }
function addMonths(d: Date, n: number) { const dt=new Date(d); dt.setMonth(dt.getMonth()+n); return dt }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()
}
function isToday(d: Date) { return isSameDay(d, new Date()) }
function isWeekend(d: Date) { return d.getDay()===0||d.getDay()===6 }

// ─── Event helpers ────────────────────────────────────────────────────────────
function getEventDate(ev: CalEvent): Date | null {
  const ds = ev._type==='followup'
    ? (ev.follow_up_date || ev.scheduled_date)
    : (ev.scheduled_date || ev.follow_up_date)
  return ds ? parseLocal(ds) : null
}

// Only followups are "overdue" — a job with a past scheduled_date just needs marking complete
function isOverdueEvent(ev: CalEvent, today0: Date): boolean {
  if (['Completed','Paid'].includes(ev.lead_status)) return false
  if (ev._type !== 'followup') return false
  const d = getEventDate(ev)
  return !!d && d < today0
}

// ─── Fetch window — 60 days each side ────────────────────────────────────────
function fetchWindow(center: Date) {
  return { from: toDateKey(addDays(center,-60)), to: toDateKey(addDays(center,60)) }
}
function inWindow(date: Date, from: string, to: string): boolean {
  const key = toDateKey(date)
  return key >= from && key <= to
}

// ─── SVG shorthand ────────────────────────────────────────────────────────────
function Svg({ path, size=14, color='currentColor', sw=2 }: { path:string; size?:number; color?:string; sw?:number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
      <path d={path}/>
    </svg>
  )
}

// ─── ToggleSwitch ─────────────────────────────────────────────────────────────
function ToggleSwitch({ on, onChange, dk }: { on:boolean; onChange:()=>void; dk:boolean }) {
  const t = theme(dk)
  return (
    <button onClick={onChange}
      style={{ width:36, height:20, borderRadius:10, border:'none', cursor:'pointer', padding:2,
        background: on ? '#0F766E' : t.filterTrackOff,
        display:'flex', alignItems:'center', justifyContent: on?'flex-end':'flex-start',
        transition:'background 0.18s', flexShrink:0 }}>
      <div style={{ width:16, height:16, borderRadius:'50%', background:'white', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
    </button>
  )
}

// ─── SidebarCard ──────────────────────────────────────────────────────────────
function SidebarCard({ title, titleColor, children, dk }: { title:string; titleColor?:string; children:React.ReactNode; dk:boolean }) {
  const t = theme(dk)
  return (
    <div style={{ background:t.cardBg, borderRadius:12, padding:'14px 16px', border:`1px solid ${t.cardBorder}` }}>
      <div style={{ fontSize: 11, fontWeight:700, color:titleColor||(dk?t.textMuted:'#9CA3AF'), textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>{title}</div>
      {children}
    </div>
  )
}

// ─── NavBtn (desktop) ─────────────────────────────────────────────────────────
function NavBtn({ dir, onClick, dk }: { dir:'prev'|'next'; onClick:()=>void; dk:boolean }) {
  const t = theme(dk)
  return (
    <button onClick={onClick}
      style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, border:`1.5px solid ${t.cardBorder}`, background:t.cardBg, cursor:'pointer', flexShrink:0, transition:'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background=t.cardBgAlt)}
      onMouseLeave={e => (e.currentTarget.style.background=t.cardBg)}>
      <Svg path={dir==='prev'?ICON_PATH.chevronL:ICON_PATH.chevronR} size={15} color={t.textBody} sw={2.5}/>
    </button>
  )
}

// ─── DetailPanel (desktop right panel + mobile bottom sheet header) ───────────
function DetailPanel({ ev, onClose, onOpenLead, dk, onMarkComplete, completing, today0 }: {
  ev:CalEvent; onClose:()=>void; onOpenLead:(id:string)=>void; dk:boolean
  onMarkComplete?:()=>void; completing?:boolean; today0:Date
}) {
  const t = theme(dk)
  const isFollowup  = ev._type==='followup'
  const isCompleted = ev.lead_status==='Completed'||ev.lead_status==='Paid'
  const overdue     = isOverdueEvent(ev, today0)
  const phone = fmtPhone(ev.contact_phone)
  const timeStr = fmtTime(ev.scheduled_time)
  const dateStr = ev._type==='followup' ? fmt(ev.follow_up_date) : fmt(ev.scheduled_date)
  const fullDate = [dateStr, timeStr].filter(Boolean).join(' at ')

  // Border colour: overdue=red, followup=amber, else teal
  const accentColor = overdue ? '#DC2626' : isFollowup ? '#D97706' : '#0F766E'
  const accentBg    = overdue ? (dk?t.overdueAlertBg:'#FEF2F2') : isFollowup ? (dk?'#1E293B':t.warningBg) : (dk?'#1E293B':'#F0FDFA')

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key==='Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:t.cardBg, borderLeft:`4px solid ${accentColor}` }}>
      <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${t.cardBorder}`, background:accentBg, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <Svg path={isFollowup?ICON_PATH.phone:ICON_PATH.wrench} size={11} color={accentColor} sw={2}/>
              <span style={{ fontSize: 12, fontWeight:700, color:accentColor, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {isFollowup?'Follow-up':ev.lead_status==='Paid'?'Job Won':ev.lead_status}
              </span>
              {overdue && <span style={{ fontSize: 11, fontWeight:700, padding:'1px 6px', borderRadius:8, background:t.dangerBg, color:'#DC2626' }}>Overdue</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight:800, color:t.textPri }}>{capName(ev.contact_name)}</div>
            {fullDate && <div style={{ fontSize: 13, color:t.textMuted, marginTop:3 }}>{fullDate}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:t.textMuted, fontSize: 22, lineHeight:1, padding:0, marginTop:-2 }}>×</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', gap:8 }}>
            {phone && (
              <a href={`tel:${ev.contact_phone}`}
                style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background:t.cardBg, border:`1.5px solid ${accentColor}44`, color:accentColor, fontSize: 14, fontWeight:700, textDecoration:'none' }}>
                <Svg path={ICON_PATH.phone} size={13} color={accentColor} sw={2.2}/>{phone}
              </a>
            )}
            <button onClick={() => onOpenLead(ev.id)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background:'linear-gradient(135deg,#0F766E,#0D9488)', border:'none', color:'white', fontSize: 14, fontWeight:700, cursor:'pointer' }}>
              Open Lead <Svg path={ICON_PATH.chevronR} size={12} color="white" sw={2.5}/>
            </button>
          </div>
          {ev._type==='job' && ev.lead_status==='Scheduled' && onMarkComplete && (
            <button onClick={onMarkComplete} disabled={completing}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background:completing?t.cardBgAlt:'#DCFCE7', border:'1.5px solid #86EFAC', color:'#15803D', fontSize: 14, fontWeight:700, cursor:'pointer', opacity:completing?0.6:1 }}>
              {completing ? 'Marking complete…' : (<><Svg path={ICON_PATH.check} size={13} color="#15803D" sw={2.5}/>Mark Job Complete</>)}
            </button>
          )}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background:t.cardBgAlt, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Details</div>
          {[
            { label:'Date',   value: fullDate||'—' },
            { label:'Phone',  value: phone||'—' },
            { label:'Email',  value: ev.contact_email||'—' },
            { label:'Source', value: (ev.lead_source||'Unknown').replace(/_/g,' ') },
            { label:'Value',  value: ev.quoted_amount?`$${ev.quoted_amount.toLocaleString()}`:'—' },
          ].map(({label,value}) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize: 14, marginBottom:8 }}>
              <span style={{ color:t.textSubtle }}>{label}</span>
              <span style={{ color:t.textPri, fontWeight:500, textAlign:'right', maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</span>
            </div>
          ))}
        </div>
        {ev.message && (
          <div style={{ background:dk?'#1a1f2e':t.warningBg, borderRadius:12, padding:'12px 14px', border:`1px solid ${dk?'#334155':t.warningBorder}` }}>
            <div style={{ fontSize: 11, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Message</div>
            <p style={{ fontSize: 14, color:t.textBody, lineHeight:1.6, margin:0 }}>{ev.message}</p>
          </div>
        )}
        {ev.notes && (
          <div style={{ background:dk?'#0f1e1a':'#F0FDFA', borderRadius:12, padding:'12px 14px', border:`1px solid ${dk?'#1a3a2e':t.successBorder}` }}>
            <div style={{ fontSize: 11, fontWeight:700, color:'#0F766E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Notes</div>
            <p style={{ fontSize: 14, color:t.textBody, lineHeight:1.6, margin:0, whiteSpace:'pre-wrap' }}>{ev.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ElasticTimeGrid (day view) ───────────────────────────────────────────────
function ElasticTimeGrid({ events, dk, onEventClick, today0 }: {
  events:CalEvent[]; dk:boolean; onEventClick:(ev:CalEvent)=>void; today0:Date
}) {
  const t = theme(dk)
  const timedEvs   = events.filter(ev => ev._type==='job' && ev.scheduled_time)
  const untimedEvs = events.filter(ev => !(ev._type==='job' && ev.scheduled_time))

  let minHour=9, maxHour=17
  timedEvs.forEach(ev => {
    const h = parseInt(ev.scheduled_time!.split(':')[0])
    if (h<minHour) minHour=Math.max(6,h-1)
    if (h>=maxHour) maxHour=Math.min(21,h+2)
  })
  const HOURS = timedEvs.length>0 ? Array.from({length:maxHour-minHour},(_,i)=>minHour+i) : []
  const SLOT_H = 64

  if (timedEvs.length===0 && untimedEvs.length===0) {
    return <div style={{ padding:'40px 20px', textAlign:'center', color:t.textSubtle, fontSize: 14 }}>No events on this day</div>
  }

  return (
    <div>
      {untimedEvs.length>0 && (
        <div style={{ borderBottom:`2px solid ${t.cardBorder}`, padding:'8px 12px', background:t.calGridBg }}>
          <div style={{ fontSize: 11, fontWeight:600, color:t.textSubtle, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>All day</div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {untimedEvs.map(ev => (
              <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="compact" onClick={() => onEventClick(ev)} isOverdue={isOverdueEvent(ev,today0)}/>
            ))}
          </div>
        </div>
      )}
      {HOURS.map(hour => {
        const label = hour<12?`${hour}am`:hour===12?'12pm':`${hour-12}pm`
        const slotEvs = timedEvs.filter(ev => parseInt(ev.scheduled_time!.split(':')[0])===hour)
        return (
          <div key={hour} style={{ display:'grid', gridTemplateColumns:'44px 1fr', height:SLOT_H, borderBottom:`1px solid ${t.calCellBorder}` }}>
            <div style={{ borderRight:`1px solid ${t.calCellBorder}`, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:8, paddingTop:4 }}>
              <span style={{ fontSize: 11, fontWeight:600, color:t.textSubtle }}>{label}</span>
            </div>
            <div style={{ padding:'2px 6px', display:'flex', flexDirection:'column', gap:3 }}>
              {slotEvs.map(ev => (
                <EventChip key={ev.id} ev={ev} dk={dk} size="compact" onClick={() => onEventClick(ev)} isOverdue={isOverdueEvent(ev,today0)}/>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Mobile week dot grid ─────────────────────────────────────────────────────
function MobileWeekGrid({ selectedDate, events, today0, onSelect, dk, onTeal = false }: {
  selectedDate:Date; events:CalEvent[]; today0:Date; onSelect:(d:Date)=>void; dk:boolean; onTeal?: boolean
}) {
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({length:7},(_,i)=>addDays(weekStart,i))
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
      {days.map(d => {
        const key = toDateKey(d)
        const isSel = isSameDay(d,selectedDate)
        const isTod = isToday(d)
        const dayEvs = events.filter(ev => { const ed=getEventDate(ev); return ed&&toDateKey(ed)===key })
        const jobCount      = dayEvs.filter(ev=>ev._type==='job').length
        const followupCount = dayEvs.filter(ev=>ev._type==='followup').length
        const overdueCount  = dayEvs.filter(ev=>isOverdueEvent(ev,today0)).length
        // Text colours — past/today/future contrast
        const isPast = d < today0 && !isTod
        const isFuture = d > today0
        const baseOpacity = isPast ? 0.35 : isFuture ? 0.85 : 1
        const sunRed = d.getDay()===0
        const dayLetterColor = isSel?'rgba(255,255,255,0.85)':isTod?'#0F766E':sunRed?(onTeal?`rgba(252,165,165,${baseOpacity})`:'#DC2626'):onTeal?`rgba(255,255,255,${baseOpacity})`:dk?'#94A3B8':'#6B7280'
        const dayNumColor    = isSel?'white':isTod?'#0F766E':sunRed?(onTeal?`rgba(252,165,165,${baseOpacity})`:'#DC2626'):onTeal?`rgba(255,255,255,${baseOpacity})`:dk?'#F1F5F9':'#111827'
        const selBg          = isSel?'rgba(255,255,255,0.25)':isTod?(onTeal?'rgba(255,255,255,0.18)':dk?'#166534':'#BBF7D0'):'transparent'
        return (
          <button key={key} onClick={() => onSelect(d)}
            style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'8px 2px 6px', borderRadius:10, border:'none', cursor:'pointer', background:selBg, minHeight:64 }}>
            <span style={{ fontSize: 12, fontWeight:700, color:dayLetterColor }}>
              {DAYS[d.getDay()].slice(0,1)}
            </span>
            <span style={{ fontSize: 17, fontWeight:900, lineHeight:1, color:dayNumColor }}>
              {d.getDate()}
            </span>
            {/* Coloured dots */}
            <div style={{ display:'flex', gap:2, minHeight:6, alignItems:'center' }}>
              {overdueCount>0  && <div style={{ width:5, height:5, borderRadius:'50%', background:isSel||onTeal?'rgba(255,255,255,0.9)':'#DC2626' }}/>}
              {jobCount>0      && <div style={{ width:5, height:5, borderRadius:'50%', background:isSel||onTeal?'rgba(255,255,255,0.9)':'#0F766E' }}/>}
              {followupCount>0 && overdueCount===0 && <div style={{ width:5, height:5, borderRadius:'50%', background:isSel||onTeal?'rgba(255,255,255,0.9)':'#D97706' }}/>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Mobile month dot grid ────────────────────────────────────────────────────
function MobileMonthGrid({ selectedDate, events, today0, onSelect, dk, onTeal = false }: {
  selectedDate:Date; events:CalEvent[]; today0:Date; onSelect:(d:Date)=>void; dk:boolean; onTeal?: boolean
}) {
  const t = theme(dk)
  const firstDay    = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth()+1, 0).getDate()
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:2 }}>
        {DAYS.map((d,i) => (
          <div key={d} style={{ textAlign:'center', fontSize: 11, fontWeight:700,
            color: i===0?(onTeal?'#FCA5A5':'#DC2626'):(onTeal?'rgba(255,255,255,0.75)':t.textMuted),
            padding:'3px 0', textTransform:'uppercase' as const, letterSpacing:'0.05em' }}>
            {d.slice(0,1)}
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1 }}>
        {Array(firstDay).fill(null).map((_,i) => <div key={'e'+i}/>)}
        {Array.from({length:daysInMonth},(_,i)=>i+1).map(day => {
          const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day)
          const key = toDateKey(d)
          const isTod = isToday(d)
          const isSel = isSameDay(d,selectedDate)
          const dayEvs = events.filter(ev => { const ed=getEventDate(ev); return ed&&toDateKey(ed)===key })
          const hasJob     = dayEvs.some(ev=>ev._type==='job')
          const hasFU      = dayEvs.some(ev=>ev._type==='followup'&&!isOverdueEvent(ev,today0))
          const hasOverdue = dayEvs.some(ev=>isOverdueEvent(ev,today0))
          const hasEvents  = hasJob||hasFU||hasOverdue
          const isDatePast = d < today0 && !isTod
          const dateOpacity = isDatePast ? 0.3 : 1
          const selBg      = isSel?'rgba(255,255,255,0.92)':isTod?(onTeal?'rgba(255,255,255,0.18)':t.calColToday):'transparent'
          const numColor   = isSel?(onTeal?'#0F766E':'white'):isTod?'#0F766E':d.getDay()===0?(onTeal?`rgba(252,165,165,${dateOpacity})`:'#DC2626'):(onTeal?`rgba(255,255,255,${dateOpacity})`:dk?'#F1F5F9':'#111827')
          return (
            <button key={day} onClick={() => onSelect(d)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:1, padding:'5px 2px', borderRadius:8, border:'none', cursor:'pointer', background:selBg, minHeight:42 }}>
              <span style={{ fontSize: 14, fontWeight:isTod||isSel?800:hasEvents?600:400, color:numColor, lineHeight:1.2 }}>
                {day}
              </span>
              <div style={{ display:'flex', gap:2, minHeight:5, alignItems:'center' }}>
                {hasOverdue && <div style={{ width:4, height:4, borderRadius:'50%', background:'rgba(255,255,255,0.9)' }}/>}
                {hasJob     && <div style={{ width:4, height:4, borderRadius:'50%', background:'rgba(255,255,255,0.9)' }}/>}
                {hasFU      && <div style={{ width:4, height:4, borderRadius:'50%', background:'rgba(255,255,255,0.9)' }}/>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── FilterSheet (mobile) ─────────────────────────────────────────────────────
function FilterSheet({ open, onClose, showJobs, showFollowups, onToggleJobs, onToggleFU, dk }: {
  open:boolean; onClose:()=>void; showJobs:boolean; showFollowups:boolean
  onToggleJobs:()=>void; onToggleFU:()=>void; dk:boolean
}) {
  const t = theme(dk)
  if (!open) return null
  return (
    <div style={{ position:'fixed', inset:0, zIndex:60, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
      onClick={onClose}>
      <div style={{ background:'rgba(0,0,0,0.45)', position:'absolute', inset:0 }}/>
      <div style={{ position:'relative', background:t.cardBg, borderRadius:'20px 20px 0 0', padding:'16px 20px', paddingBottom:'calc(80px + env(safe-area-inset-bottom))', zIndex:1 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:12 }}>
          <div style={{ width:36, height:4, borderRadius:2, background:t.cardBorder }}/>
        </div>
        <div style={{ fontSize: 16, fontWeight:800, color:t.textPri, marginBottom:20 }}>Filter Calendar</div>
        {[
          { label:'Jobs', sub:'Scheduled work', color:'#0F766E', on:showJobs, toggle:onToggleJobs },
          { label:'Follow-ups', sub:'Reminders to follow up', color:'#D97706', on:showFollowups, toggle:onToggleFU },
        ].map(item => (
          <div key={item.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:18, marginBottom:18, borderBottom:`1px solid ${t.cardBorder}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:12, height:12, borderRadius:3, background:item.color, flexShrink:0 }}/>
              <div>
                <div style={{ fontSize: 15, fontWeight:700, color:t.textPri }}>{item.label}</div>
                <div style={{ fontSize: 13, color:t.textSubtle, marginTop:1 }}>{item.sub}</div>
              </div>
            </div>
            <ToggleSwitch on={item.on} onChange={item.toggle} dk={dk}/>
          </div>
        ))}
        <button onClick={onClose}
          style={{ width:'100%', padding:'14px', borderRadius:14, border:'none', background:'#0F766E', color:'white', fontSize: 15, fontWeight:700, cursor:'pointer' }}>
          Done
        </button>
      </div>
    </div>
  )
}

// ─── Main calendar inner component ───────────────────────────────────────────
function CalendarInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [session, setSession]   = useState<Session|null>(null)
  const [dk, setDk]             = useState(false)
  const [desktopView, setDesktopView] = useState<'day'|'week'|'month'>('day')
  const [mobileView,  setMobileView]  = useState<'agenda'|'week'|'month'>('agenda')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [monthAgendaDate, setMonthAgendaDate] = useState<Date|null>(null)

  const [events, setEvents]           = useState<CalEvent[]>([])
  const [unscheduled, setUnscheduled] = useState<CalEvent[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchedWindow, setFetchedWindow] = useState({ from:'', to:'' })

  const [selectedEvent, setSelectedEvent] = useState<CalEvent|null>(null)
  const [showJobs, setShowJobs]           = useState(true)
  const [showFollowups, setShowFollowups] = useState(true)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [completing, setCompleting]       = useState<string|null>(null)

  // Touch swipe tracking
  const touchStartX = useRef<number|null>(null)
  const touchStartY = useRef<number|null>(null)

  const t = theme(dk)
  const today0 = new Date(); today0.setHours(0,0,0,0)

  useEffect(() => {
    if (typeof window==='undefined') return
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.push('/login'); return }
    setSession(JSON.parse(raw))
    setDk(localStorage.getItem('pg_darkmode')==='1')
  }, [router])

  const doFetch = useCallback(async (s: Session, center: Date) => {
    setLoading(true)
    const win = fetchWindow(center)
    try {
      const r = await fetch(`/api/calendar?pro_id=${s.id}&from=${win.from}&to=${win.to}`)
      const d = await r.json()
      setEvents(d.events||[])
      setUnscheduled(d.unscheduled||[])
      setFetchedWindow(win)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { if (session) doFetch(session, selectedDate) }, [session, doFetch])

  // Refetch if user navigates outside the fetched window
  useEffect(() => {
    if (!session || !fetchedWindow.from) return
    if (!inWindow(selectedDate, fetchedWindow.from, fetchedWindow.to)) {
      doFetch(session, selectedDate)
    }
  }, [selectedDate, session, fetchedWindow, doFetch])

  // Derived
  const weekStart   = startOfWeek(selectedDate)
  const weekDays    = Array.from({length:7},(_,i)=>addDays(weekStart,i))
  const firstDay    = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth()+1, 0).getDate()

  const todayKey   = toDateKey(new Date())
  const todayEvs   = events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===todayKey })
  const todayJobs  = todayEvs.filter(ev => ev._type==='job')
  const todayValue = todayJobs.reduce((s,ev)=>s+(ev.quoted_amount||0),0)

  // Overdue = only followups with past date
  const overdueEvs = events.filter(ev => isOverdueEvent(ev, today0))

  function applyFilters(evs: CalEvent[]) {
    return evs.filter(ev => {
      if (ev._type==='job'      && !showJobs)      return false
      if (ev._type==='followup' && !showFollowups) return false
      return true
    })
  }

  const selectedDayEvs = applyFilters(
    events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===toDateKey(selectedDate) })
  )

  // Week value always from unfiltered jobs (financial metric, not display filter)
  const weekGrouped = (() => {
    const map: Record<string,CalEvent[]> = {}
    weekDays.forEach(d => { map[toDateKey(d)]=[] })
    events.forEach(ev => { const d=getEventDate(ev); if(d){ const k=toDateKey(d); if(map[k]) map[k].push(ev) }})
    return map
  })()
  const weekValue = weekDays.reduce((sum,d) => {
    return sum + (weekGrouped[toDateKey(d)]||[]).filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0)
  }, 0)
  const selectedDayValue = (weekGrouped[toDateKey(selectedDate)]||[]).filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0)

  // Month agenda date
  const agendaDate = monthAgendaDate||selectedDate
  const agendaEvs  = applyFilters(
    events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===toDateKey(agendaDate) })
  )

  function navDay(n: number)   { setSelectedDate(addDays(selectedDate, n)) }
  function navWeek(n: number)  { setSelectedDate(addDays(selectedDate, n*7)) }
  function navMonth(n: number) {
    const d = addMonths(selectedDate, n)
    d.setDate(1)
    setSelectedDate(d)
    setMonthAgendaDate(null)
  }
  function goToday() { setSelectedDate(new Date()); setMonthAgendaDate(null) }
  function selectDay(d: Date) { setSelectedDate(d); setSelectedEvent(null); setMonthAgendaDate(d) }

  function handleNav(dir: 1|-1) {
    if (desktopView==='day') navDay(dir)
    else if (desktopView==='week') navWeek(dir)
    else navMonth(dir)
  }
  function handleMobileNav(dir: 1|-1) {
    if (mobileView==='agenda') navDay(dir)
    else if (mobileView==='week') navWeek(dir)
    else navMonth(dir)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current===null || touchStartY.current===null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    // Only swipe if more horizontal than vertical
    if (Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.5) navDay(dx<0?1:-1)
    touchStartX.current = null
    touchStartY.current = null
  }

  async function markComplete(ev: CalEvent) {
    if (!session||completing) return
    setCompleting(ev.id)
    try {
      await fetch(`/api/leads/${ev.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ pro_id:session.id, lead_status:'Completed' }) })
      setEvents(prev => prev.map(e => e.id===ev.id ? {...e, lead_status:'Completed'} : e))
      setSelectedEvent(null)
    } finally { setCompleting(null) }
  }

  function openLead(id: string) { router.push(`/dashboard/pipeline/${id}?from=calendar`) }

  if (!session) return null

  // ── Shared filter toggles (sidebar version) ────────────────────────────────
  const SidebarFilters = (
    <SidebarCard title="Show" dk={dk}>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {[
          { label:'Jobs', color:'#0F766E', on:showJobs, set:()=>setShowJobs(v=>!v) },
          { label:'Follow-ups', color:'#D97706', on:showFollowups, set:()=>setShowFollowups(v=>!v) },
        ].map(item => (
          <div key={item.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:9, height:9, borderRadius:2, background:item.color, flexShrink:0 }}/>
              <span style={{ fontSize: 14, fontWeight:600, color:t.textPri }}>{item.label}</span>
            </div>
            <ToggleSwitch on={item.on} onChange={item.set} dk={dk}/>
          </div>
        ))}
      </div>
    </SidebarCard>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT
  // ══════════════════════════════════════════════════════════════════════════
  const DesktopView = (
    <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden' }}>

      {/* Left sidebar */}
      <div style={{ width:210, flexShrink:0, borderRight:`1px solid ${t.cardBorder}`, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:10, background:t.calSidebar }}>
        {overdueEvs.length>0 && (
          <div style={{ background:t.overdueAlertBg, border:`1px solid ${t.overdueAlertBorder}`, borderRadius:12, padding:'11px 13px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#DC2626', flexShrink:0, boxShadow:'0 0 0 2px rgba(220,38,38,0.2)' }}/>
              <span style={{ fontSize: 13, fontWeight:800, color:t.overdueText }}>{overdueEvs.length} overdue follow-up{overdueEvs.length!==1?'s':''}</span>
            </div>
            {overdueEvs.slice(0,3).map(ev => (
              <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                style={{ fontSize: 13, color:t.overdueText, fontWeight:600, cursor:'pointer', padding:'2px 0 2px 13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                → {capName(ev.contact_name)}
              </div>
            ))}
            {overdueEvs.length>3 && <div style={{ fontSize: 12, color:t.overdueText, opacity:0.7, paddingLeft:13 }}>+{overdueEvs.length-3} more</div>}
          </div>
        )}

        {SidebarFilters}

        <SidebarCard title="Today" dk={dk}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize: 13, color:t.textSubtle }}>Jobs</span>
              <span style={{ fontSize: 20, fontWeight:800, color:'#0F766E' }}>{todayJobs.length}</span>
            </div>
            <div style={{ height:1, background:t.cardBorder }}/>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize: 13, color:t.textSubtle }}>Value</span>
              <span style={{ fontSize: 16, fontWeight:800, color:'#15803D' }}>${todayValue>0?todayValue.toLocaleString():'0'}</span>
            </div>
            {overdueEvs.length>0 && (
              <>
                <div style={{ height:1, background:t.cardBorder }}/>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize: 13, color:'#B91C1C' }}>Overdue</span>
                  <span style={{ fontSize: 16, fontWeight:800, color:'#DC2626' }}>{overdueEvs.length}</span>
                </div>
              </>
            )}
          </div>
        </SidebarCard>

        {unscheduled.length>0 && (
          <SidebarCard title={`Needs Date (${unscheduled.length})`} titleColor="#D97706" dk={dk}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {unscheduled.slice(0,5).map(ev => (
                <div key={ev.id} onClick={() => router.push('/dashboard/pipeline/'+ev.id+'?from=calendar')}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 9px', borderRadius:8, background:dk?t.warningBg:t.warningBg, cursor:'pointer', border:'1px solid #FDE68A' }}
                  onMouseEnter={e => (e.currentTarget.style.background=t.warningBorder)}
                  onMouseLeave={e => (e.currentTarget.style.background=dk?t.warningBg:t.warningBg)}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize: 13, fontWeight:700, color:t.textPri, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{capName(ev.contact_name)}</div>
                    <div style={{ fontSize: 11, color:'#D97706', marginTop:1 }}>{ev.lead_status}</div>
                  </div>
                  <Svg path={ICON_PATH.chevronR} size={11} color="#D97706" sw={2.5}/>
                </div>
              ))}
              {unscheduled.length>5 && <div style={{ fontSize: 12, color:t.textSubtle, textAlign:'center' }}>+{unscheduled.length-5} more</div>}
            </div>
          </SidebarCard>
        )}
      </div>

      {/* Center */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background:t.calGridBg }}>
        {/* Toolbar */}
        <div style={{ padding:'10px 16px', borderBottom:`1px solid ${t.cardBorder}`, display:'flex', alignItems:'center', gap:8, background:t.calToolbar, flexShrink:0, position:'sticky', top:0, zIndex:10 }}>
          <button onClick={goToday}
            style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${t.cardBorder}`, background:t.cardBgAlt, color:t.textPri, fontSize: 14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            Today
          </button>
          <div style={{ display:'flex', gap:5 }}>
            <NavBtn dir="prev" onClick={() => handleNav(-1)} dk={dk}/>
            <NavBtn dir="next" onClick={() => handleNav(1)} dk={dk}/>
          </div>
          <span style={{ fontSize: 15, fontWeight:700, color:t.textPri }}>
            {desktopView==='day'
              ? `${DAYS[selectedDate.getDay()]}, ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`
              : desktopView==='week'
              ? `${SHORT_MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${SHORT_MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
              : `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
            }
          </span>
          {(desktopView==='day'||desktopView==='week') && (
            <span style={{ fontSize: 13, fontWeight:700, color:'#15803D', background:dk?t.successBg:'#DCFCE7', padding:'4px 10px', borderRadius:20, border:`1px solid ${dk?'#166534':t.successBorder}` }}>
              ${desktopView==='day' ? selectedDayValue.toLocaleString() : weekValue.toLocaleString()} {desktopView==='day'?'today':'this week'}
            </span>
          )}
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:`1.5px solid ${t.cardBorder}`, flexShrink:0 }}>
            {(['day','week','month'] as const).map(v => (
              <button key={v} onClick={() => { setDesktopView(v); if(v==='month') setMonthAgendaDate(selectedDate) }}
                style={{ padding:'5px 12px', border:'none', cursor:'pointer', fontSize: 13, fontWeight:600, background:desktopView===v?'#0F766E':'transparent', color:desktopView===v?'white':t.textMuted, textTransform:'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:t.textSubtle, fontSize: 15 }}>Loading…</div>
        ) : desktopView==='day' ? (

          /* ── Day view ── */
          <div style={{ flex:1 }}>
            <ElasticTimeGrid events={selectedDayEvs} dk={dk} onEventClick={ev => setSelectedEvent(ev)} today0={today0}/>
          </div>

        ) : desktopView==='week' ? (

          /* ── Week view ── */
          <div style={{ flex:1, overflowX:'auto' }}>
            <div style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', borderBottom:`1px solid ${t.cardBorder}`, background:t.calDayHeader, position:'sticky', top:0, zIndex:9 }}>
              <div style={{ borderRight:`1px solid ${t.calCellBorder}` }}/>
              {weekDays.map(d => {
                const isTod=isToday(d); const isSel=isSameDay(d,selectedDate); const isWknd=isWeekend(d)
                return (
                  <div key={toDateKey(d)} onClick={() => { selectDay(d); setDesktopView('day') }}
                    style={{ padding:'10px 8px', textAlign:'center', borderRight:`1px solid ${t.calCellBorder}`, cursor:'pointer', background:isTod?t.calColToday:isWknd?t.calColWeekend:isSel?t.calColSelected:'transparent' }}>
                    <div style={{ fontSize: 11, fontWeight:700, color:isTod?'#0F766E':d.getDay()===0?'#DC2626':isWknd?t.textSubtle:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{DAYS[d.getDay()]}</div>
                    <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'3px auto 0', background:isTod?'#0F766E':'transparent' }}>
                      <span style={{ fontSize: 15, fontWeight:700, color:isTod?'white':isSel?'#0F766E':d.getDay()===0?'#DC2626':t.textPri }}>{d.getDate()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {(() => {
              const timedByDay: Record<string,CalEvent[]>   = {}
              const untimedByDay: Record<string,CalEvent[]> = {}
              weekDays.forEach(d => {
                const key = toDateKey(d)
                const evs = applyFilters(weekGrouped[key]||[])
                timedByDay[key]   = evs.filter(ev=>ev._type==='job'&&ev.scheduled_time)
                untimedByDay[key] = evs.filter(ev=>!(ev._type==='job'&&ev.scheduled_time))
              })
              const allTimed = Object.values(timedByDay).flat()
              let minH=9, maxH=17
              allTimed.forEach(ev => {
                const h=parseInt(ev.scheduled_time!.split(':')[0])
                if(h<minH) minH=Math.max(6,h-1)
                if(h>=maxH) maxH=Math.min(21,h+2)
              })
              const HOURS = allTimed.length>0 ? Array.from({length:maxH-minH},(_,i)=>minH+i) : []
              const SLOT_H = 60
              const hasUntimed = weekDays.some(d=>untimedByDay[toDateKey(d)].length>0)
              return (
                <div>
                  {hasUntimed && (
                    <div style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', borderBottom:`2px solid ${t.cardBorder}` }}>
                      <div style={{ borderRight:`1px solid ${t.calCellBorder}`, padding:'6px 4px', display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
                        <span style={{ fontSize: 11, fontWeight:600, color:t.textSubtle, textTransform:'uppercase', marginTop:6 }}>All day</span>
                      </div>
                      {weekDays.map(d => {
                        const key=toDateKey(d); const evs=untimedByDay[key]||[]
                        const isTod=isToday(d); const isWknd=isWeekend(d)
                        return (
                          <div key={key} style={{ padding:'4px', borderRight:`1px solid ${t.calCellBorder}`, minHeight:36, background:isTod?t.calColToday:isWknd?t.calColWeekend:'transparent' }}>
                            {evs.map(ev => (
                              <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="compact"
                                onClick={() => { selectDay(d); setSelectedEvent(ev) }}
                                isOverdue={isOverdueEvent(ev,today0)}/>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {HOURS.map(hour => {
                    const label=hour<12?`${hour}am`:hour===12?'12pm':`${hour-12}pm`
                    return (
                      <div key={hour} style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', height:SLOT_H, borderBottom:`1px solid ${t.calCellBorder}` }}>
                        <div style={{ borderRight:`1px solid ${t.calCellBorder}`, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:7, paddingTop:4 }}>
                          <span style={{ fontSize: 11, fontWeight:600, color:t.textSubtle }}>{label}</span>
                        </div>
                        {weekDays.map(d => {
                          const key=toDateKey(d)
                          const isTod=isToday(d); const isSel=isSameDay(d,selectedDate); const isWknd=isWeekend(d)
                          const slotEvs=(timedByDay[key]||[]).filter(ev=>parseInt(ev.scheduled_time!.split(':')[0])===hour)
                          return (
                            <div key={key}
                              onClick={() => { selectDay(d); setDesktopView('day') }}
                              style={{ borderRight:`1px solid ${t.calCellBorder}`, background:isTod?t.calColToday:isWknd?t.calColWeekend:isSel?t.calColSelected:'transparent', padding:'2px 3px', cursor:'pointer' }}>
                              {slotEvs.map(ev => (
                                <div key={ev.id} onClick={e => { e.stopPropagation(); selectDay(d); setSelectedEvent(ev) }}>
                                  <EventChip ev={ev} dk={dk} size="compact" onClick={() => { selectDay(d); setSelectedEvent(ev) }} isOverdue={isOverdueEvent(ev,today0)}/>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                  {allTimed.length===0 && !hasUntimed && (
                    <div style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', minHeight:200 }}>
                      <div style={{ borderRight:`1px solid ${t.calCellBorder}` }}/>
                      {weekDays.map(d => {
                        const key=toDateKey(d); const isTod=isToday(d); const isWknd=isWeekend(d)
                        return (
                          <div key={key} onClick={() => { selectDay(d); setDesktopView('day') }}
                            style={{ borderRight:`1px solid ${t.calCellBorder}`, minHeight:120, background:isTod?t.calColToday:isWknd?t.calColWeekend:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                            {isWknd && <span style={{ fontSize: 11, color:t.calEmptyText, textTransform:'uppercase', fontWeight:500, letterSpacing:'0.04em' }}>Free</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

        ) : (

          /* ── Month view ── */
          <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            <div style={{ padding:'14px 14px 6px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
                {DAYS.map((d,i) => <div key={d} style={{ textAlign:'center', fontSize: 12, fontWeight:700, color:i===0?'#DC2626':t.textMuted, padding:'4px 0', textTransform:'uppercase', letterSpacing:'0.06em' }}>{d}</div>)}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {Array(firstDay).fill(null).map((_,i)=><div key={'e'+i}/>)}
                {Array.from({length:daysInMonth},(_,i)=>i+1).map(day => {
                  const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day)
                  const key = toDateKey(d)
                  const dayEvs = applyFilters(events.filter(ev => { const ed=getEventDate(ev); return ed&&toDateKey(ed)===key }))
                  const isTod = isToday(d)
                  const isSel = monthAgendaDate ? isSameDay(d,monthAgendaDate) : isSameDay(d,selectedDate)
                  return (
                    <div key={day} onClick={() => { selectDay(d); setMonthAgendaDate(d) }}
                      style={{ minHeight:70, padding:'5px', borderRadius:7, cursor:'pointer', border:`1.5px solid ${isSel?'#0F766E':t.calCellBorder}`, background:isTod?t.calColToday:t.cardBg, transition:'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background=t.calColSelected)}
                      onMouseLeave={e => (e.currentTarget.style.background=isTod?t.calColToday:t.cardBg)}>
                      <div style={{ fontSize: 13, fontWeight:isTod?800:500, color:isTod?'#0F766E':d.getDay()===0?'#DC2626':t.textPri, marginBottom:3 }}>{day}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                        {dayEvs.slice(0,2).map(ev => (
                          <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="micro"
                            onClick={() => { setMonthAgendaDate(d); setSelectedEvent(ev) }}
                            isOverdue={isOverdueEvent(ev,today0)}/>
                        ))}
                        {dayEvs.length>2 && (
                          <button onClick={e => { e.stopPropagation(); selectDay(d); setMonthAgendaDate(d) }}
                            style={{ fontSize: 11, color:t.textSubtle, paddingLeft:4, background:'none', border:'none', cursor:'pointer', textAlign:'left', fontWeight:600 }}>
                            +{dayEvs.length-2} more
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Month agenda strip */}
            <div style={{ flex:1, borderTop:`1px solid ${t.cardBorder}`, overflowY:'auto', background:t.calAgendaBg }}>
              <div style={{ padding:'11px 16px', borderBottom:`1px solid ${t.cardBorder}`, background:t.calToolbar, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize: 15, fontWeight:700, color:t.textPri }}>
                  {isToday(agendaDate)?'Today':`${DAYS[agendaDate.getDay()]}, ${SHORT_MONTHS[agendaDate.getMonth()]} ${agendaDate.getDate()}`}
                  {agendaEvs.length>0 && <span style={{ marginLeft:8, fontSize: 13, color:t.textSubtle }}>{agendaEvs.length} event{agendaEvs.length!==1?'s':''}</span>}
                </span>
                {agendaEvs.length>0 && (
                  <span style={{ fontSize: 14, fontWeight:700, color:'#15803D' }}>
                    ${agendaEvs.filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:7 }}>
                {agendaEvs.length===0
                  ? <div style={{ textAlign:'center', padding:'20px 0', color:t.textSubtle, fontSize: 14 }}>No events on this day</div>
                  : agendaEvs.map(ev => (
                      <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="compact"
                        onClick={() => setSelectedEvent(ev)} isOverdue={isOverdueEvent(ev,today0)}/>
                    ))
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right detail panel */}
      <div style={{ width:selectedEvent?330:0, flexShrink:0, borderLeft:selectedEvent?`1px solid ${t.cardBorder}`:'none', overflow:'hidden', transition:'width 0.2s ease' }}>
        {selectedEvent && (
          <DetailPanel ev={selectedEvent} onClose={() => setSelectedEvent(null)} onOpenLead={openLead} dk={dk} today0={today0}
            onMarkComplete={selectedEvent._type==='job'&&selectedEvent.lead_status==='Scheduled'?()=>markComplete(selectedEvent):undefined}
            completing={completing===selectedEvent.id}/>
        )}
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT
  // ══════════════════════════════════════════════════════════════════════════
  const notOnToday = !isToday(selectedDate)

  const MobileView = (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%', background:t.pageBg }}>

      {/* Sticky header */}
      <div style={{ flexShrink:0, position:'sticky', top:0, zIndex:20,
        background: '#0F766E',
        borderBottom: 'none',
      }}>

        {/* Row 1: nav + date + filter */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding: mobileView==='agenda'?'14px 14px 8px':'10px 14px 8px' }}>
          <button onClick={() => handleMobileNav(-1)}
            style={{ width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:11,
              border: '1.5px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.12)', cursor:'pointer', flexShrink:0 }}>
            <Svg path={ICON_PATH.chevronL} size={17} color='white' sw={2.5}/>
          </button>

          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize: mobileView==='agenda'?22:18, fontWeight:800, color:'white', letterSpacing:'-0.3px' }}>
              {mobileView==='agenda'
                ? isToday(selectedDate) ? `Today · ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}` : `${DAYS[selectedDate.getDay()]}, ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`
                : mobileView==='week'
                ? `${SHORT_MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${SHORT_MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}`
                : `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
              }
            </div>
            <div style={{ fontSize: mobileView==='month'?12:14, fontWeight:500, color:'rgba(255,255,255,0.92)', marginTop:2 }}>
              {mobileView==='agenda' && (isToday(selectedDate)
                ? `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}${todayJobs.length>0?` · ${todayJobs.length} jobs`:''}`
                : selectedDate.getFullYear().toString()
              )}
              {mobileView==='week' && (
                <span>
                  {selectedDate.getFullYear()}
                  {weekValue>0 && (
                    <> · <span style={{ fontWeight:800, color:'white', fontSize:15 }}>${weekValue.toLocaleString()}</span></>
                  )}
                </span>
              )}
              {mobileView==='month' && ''}
            </div>
          </div>

          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <button onClick={() => setFilterSheetOpen(true)}
              style={{ width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:11,
                border: '1.5px solid rgba(255,255,255,0.25)',
                background: (!showJobs||!showFollowups)?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.12)', cursor:'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke='white'
                strokeWidth="2.2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
              </svg>
            </button>
            <button onClick={() => handleMobileNav(1)}
              style={{ width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:11,
                border: '1.5px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.12)', cursor:'pointer' }}>
              <Svg path={ICON_PATH.chevronR} size={17} color='white' sw={2.5}/>
            </button>
          </div>
        </div>

        {/* Row 2: view selector + Today chip */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 14px 8px' }}>
          <div style={{ display:'flex', borderRadius:22, overflow:'hidden', border: '1.5px solid rgba(255,255,255,0.25)', flexShrink:0 }}>
            {(['agenda','week','month'] as const).map(v => (
              <button key={v} onClick={() => setMobileView(v)}
                style={{ padding:'7px 13px', border:'none', cursor:'pointer', fontSize: 13, background:mobileView===v?'rgba(255,255,255,0.2)':'transparent', color:'white', fontWeight:mobileView===v?800:500 }}>
                {v==='agenda'?'Day':v==='week'?'Week':'Month'}
              </button>
            ))}
          </div>
          {notOnToday && (
            <button onClick={goToday}
              style={{ fontSize: 13, fontWeight:700, padding:'7px 13px', borderRadius:22, border:'1.5px solid rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.2)', color:'white', cursor:'pointer', flexShrink:0 }}>
              ← Today
            </button>
          )}
        </div>

        {/* Row 3: week strip — Day mode only (week mode has its own grouped view) */}
        {mobileView==='agenda' && (
          <div style={{ padding:'0 12px 10px' }}>
            <MobileWeekGrid selectedDate={selectedDate} events={events} today0={today0} onSelect={d => selectDay(d)} dk={dk} onTeal={true}/>
          </div>
        )}
        {mobileView==='month' && (
          <div style={{ padding:'0 12px 10px', background:'#0F766E' }}>
            <MobileMonthGrid selectedDate={selectedDate} events={events} today0={today0} onSelect={d => { selectDay(d) }} dk={dk} onTeal={true}/>
          </div>
        )}
      </div>

      {/* Overdue alert */}
      {overdueEvs.length>0 && (
        <div style={{ flexShrink:0, margin:'8px 14px 0', padding:'9px 13px', background:t.overdueAlertBg, border:`1px solid ${t.overdueAlertBorder}`, borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'#DC2626', flexShrink:0 }}/>
          <span style={{ fontSize: 14, fontWeight:700, color:t.overdueText, flex:1 }}>
            {overdueEvs.length} overdue follow-up{overdueEvs.length!==1?'s':''} — {overdueEvs.slice(0,2).map(e=>capName(e.contact_name)).join(', ')}{overdueEvs.length>2?` +${overdueEvs.length-2}`:''}
          </span>
        </div>
      )}

      {/* Stats strip — Day view always visible */}
      {mobileView==='agenda' && (() => {
        const dj = selectedDayEvs.filter(ev => ev._type==='job')
        const dc = dj.filter(ev => ev.lead_status==='Completed'||ev.lead_status==='Paid')
        const dv = dj.reduce((s,ev)=>s+(ev.quoted_amount||0),0)
        return (
          <div style={{ flexShrink:0, display:'flex', background:'#0F766E', boxShadow:'0 4px 12px rgba(0,0,0,0.12)' }}>
            {[{ label:"Today's Value", value:dv>0?'$'+dv.toLocaleString():'$0' },{ label:'Jobs', value:String(dj.length) },{ label:'Done', value:String(dc.length) }].map((s,i)=>(
              <div key={s.label} style={{ flex:1, padding:'11px 8px', borderRight:i<2?'1px solid rgba(255,255,255,0.2)':'none', textAlign:'center' }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:'rgba(255,255,255,0.80)', marginBottom:3 }}>{s.label}</div>
                <div style={{ fontSize:22, fontWeight:800, color:'white', lineHeight:1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )
      })()}

    {/* Scrollable agenda */}
      <div style={{ flex:1, padding:'10px 14px', display:'flex', flexDirection:'column', gap:10, overflowY:'auto' }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {loading ? (
          [1,2,3].map(i => <div key={i} style={{ height:80, borderRadius:12, background:t.cardBg }}/>)
        ) : mobileView==='week' ? (
          /* ── WEEK VIEW: two-column layout — compact day badge | events ─── */
          (() => {
            const weekStart2 = startOfWeek(selectedDate)
            const weekDaysList = Array.from({length:7},(_,i)=>addDays(weekStart2,i))
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {weekDaysList.map((d,di) => {
                  const k = toDateKey(d)
                  const isTod = isToday(d)
                  const isSun = d.getDay()===0
                  const isSat = d.getDay()===6
                  const isWeekend = isSun || isSat
                  const dayEvs2 = events.filter(ev => {
                    if (!showJobs && ev._type==='job') return false
                    if (!showFollowups && ev._type==='followup') return false
                    const ed=getEventDate(ev); return ed&&toDateKey(ed)===k
                  })
                  const hasEvents = dayEvs2.length > 0
                  const dayVal = dayEvs2.reduce((s,ev)=>s+(ev.quoted_amount||0),0)

                  // Text colours
                  const dayNameColor = isTod?'#0F766E':isSun?'#DC2626':isWeekend?t.textSubtle:t.textMuted
                  const dayNumColor  = isTod?'#0F766E':isSun?'#DC2626':t.textPri

                  return (
                    <div key={k} style={{
                      display:'flex', gap:0,
                      borderLeft: isTod?'3px solid #0F766E':'3px solid transparent',
                      paddingLeft: isTod?9:9,
                      paddingTop: di===0?0:hasEvents?12:6,
                      paddingBottom: hasEvents?12:6,
                      borderBottom: `1px solid ${t.cardBorder}`,
                      opacity: isWeekend && !hasEvents ? 0.55 : 1,
                    }}>
                      {/* Left: day badge — fixed 48px */}
                      <div style={{ width:48, flexShrink:0, paddingTop:2 }}>
                        <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase' as const, color:dayNameColor, letterSpacing:'0.04em', lineHeight:1 }}>
                          {DAYS[d.getDay()].slice(0,3)}
                        </div>
                        <div style={{ fontSize:22, fontWeight:800, lineHeight:1.1, color:dayNumColor, marginTop:1 }}>
                          {d.getDate()}
                        </div>
                        {hasEvents && dayVal>0 && (
                          <div style={{ fontSize:10, color:'#15803D', fontWeight:700, marginTop:2 }}>
                            ${dayVal>=1000?(dayVal/1000).toFixed(1)+'k':dayVal.toLocaleString()}
                          </div>
                        )}
                      </div>

                      {/* Right: events or empty rule */}
                      <div style={{ flex:1, minWidth:0 }}>
                        {hasEvents ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                            {dayEvs2.map(ev => (
                              <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="full"
                                onClick={() => setSelectedEvent(ev)}
                                onMarkComplete={ev._type==='job'&&ev.lead_status==='Scheduled'?()=>markComplete(ev):undefined}
                                completing={completing===ev.id}
                                isOverdue={isOverdueEvent(ev,today0)}/>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display:'flex', alignItems:'center', height:'100%', minHeight:28 }}>
                            <div style={{ flex:1, height:1, background:t.divider, opacity:0.5, marginTop:14 }}/>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Unscheduled leads at bottom */}
                {unscheduled.length>0 && (
                  <div style={{ marginTop:16, paddingTop:14, borderTop:'1.5px dashed #FDE68A' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#D97706', marginBottom:10 }}>
                      Needs scheduling ({unscheduled.length})
                    </div>
                    {unscheduled.slice(0,3).map(ev => (
                      <div key={ev.id} onClick={() => router.push('/dashboard/pipeline/'+ev.id+'?from=calendar')}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:11, background:t.cardBg, border:'1px solid #FDE68A', marginBottom:8, cursor:'pointer' }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:t.textPri, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{capName(ev.contact_name)}</div>
                          <div style={{ fontSize:12, color:'#D97706', marginTop:2 }}>{ev.lead_status} · No date set</div>
                        </div>
                        <Svg path={ICON_PATH.chevronR} size={12} color="#D97706" sw={2.5}/>
                      </div>
                    ))}
                    {unscheduled.length>3 && (
                      <button onClick={() => router.push('/dashboard/pipeline?filter=unscheduled')}
                        style={{ width:'100%', padding:'10px', borderRadius:11, border:'1.5px dashed #0F766E', background:'transparent', color:'#0F766E', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                        +{unscheduled.length-3} more → Pipeline
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })()
        ) : selectedDayEvs.length===0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, paddingTop:28 }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:t.cardBg, border:`1px solid ${t.cardBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize: 16, fontWeight:800, color:t.textPri, marginBottom:5 }}>
                {isToday(selectedDate)?'Nothing today':'Nothing on this day'}
              </div>
              {unscheduled.length===0 && (
                <div style={{ fontSize: 14, color:t.textSubtle, lineHeight:1.5 }}>No jobs or follow-ups scheduled</div>
              )}
            </div>
            {unscheduled.length>0 && (
              <div style={{ width:'100%', marginTop:4 }}>

                {unscheduled.slice(0,5).map(ev => (
                  <div key={ev.id} onClick={() => router.push('/dashboard/pipeline/'+ev.id+'?from=calendar')}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, background:t.cardBg, border:'1px solid #FDE68A', marginBottom:8, cursor:'pointer' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize: 14, fontWeight:700, color:t.textPri, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{capName(ev.contact_name)}</div>
                      <div style={{ fontSize: 12, color:'#D97706', marginTop:2 }}>{ev.lead_status} · No date set</div>
                    </div>
                    <Svg path={ICON_PATH.chevronR} size={12} color="#D97706" sw={2.5}/>
                  </div>
                ))}
                {unscheduled.length>5 && (
                  <button onClick={() => router.push('/dashboard/pipeline?filter=unscheduled')}
                    style={{ width:'100%', padding:'11px', borderRadius:11, border:'1.5px dashed #0F766E', background:'transparent', color:'#0F766E', fontSize: 14, fontWeight:700, cursor:'pointer' }}>
                    +{unscheduled.length-5} more → Pipeline
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ── DAY VIEW: time-slot agenda (reference design) ──────────────── */
          (() => {
            // Sort: timed events by time, untimed at end
            const timed   = selectedDayEvs.filter(ev => ev.scheduled_time).sort((a,b) => (a.scheduled_time||'').localeCompare(b.scheduled_time||''))
            const untimed = selectedDayEvs.filter(ev => !ev.scheduled_time)
            const ordered = [...timed, ...untimed]

            // Stats for today
            const dayJobs      = selectedDayEvs.filter(ev => ev._type==='job')
            const dayCompleted = dayJobs.filter(ev => ev.lead_status === 'Completed' || ev.lead_status === 'Paid')
            const dayValue     = dayJobs.reduce((s,ev) => s + (ev.quoted_amount||0), 0)

            return (
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {/* Today stats strip */}
                <div style={{ display:'flex', gap:0, background:t.cardBg, borderRadius:14, border:`1px solid ${t.cardBorder}`, marginBottom:14, overflow:'hidden' }}>
                  {[
                    { label: "Today's Value", value: dayValue > 0 ? `$${dayValue.toLocaleString()}` : '$0', color: dayValue>0 ? '#15803D' : t.textMuted },
                    { label: 'Jobs',      value: String(dayJobs.length),      color: '#0F766E' },
                    { label: 'Done',      value: String(dayCompleted.length),  color: '#15803D' },
                  ].map((s,i) => (
                    <div key={s.label} style={{ flex:1, padding:'12px 10px', borderRight: i<2 ? `1px solid ${t.cardBorder}` : 'none', textAlign:'center' }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.06em', color:t.textMuted, marginBottom:3 }}>{s.label}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Time-slot agenda rows */}
                {ordered.map((ev, idx) => {
                  const isOverdue2  = isOverdueEvent(ev, today0)
                  const isFollowup  = ev._type === 'followup'
                  const isJob       = ev._type === 'job'
                  const isDone      = ev.lead_status === 'Completed' || ev.lead_status === 'Paid'
                  const accentColor = isOverdue2 ? '#DC2626' : isFollowup ? '#D97706' : isDone ? '#9CA3AF' : '#0F766E'
                  const timeLabel   = ev.scheduled_time ? fmtTime(ev.scheduled_time) : (isFollowup ? 'Follow-up' : 'All day')
                  const statusLabel = isOverdue2 ? 'Overdue' : isDone ? 'Done' : ev.lead_status
                  const statusBg    = isOverdue2 ? '#FEF2F2' : isFollowup ? '#FFFBEB' : isDone ? '#F3F4F6' : '#F0FDFA'
                  const statusColor = isOverdue2 ? '#DC2626' : isFollowup ? '#D97706' : isDone ? '#9CA3AF' : '#0F766E'
                  const phone       = ev.contact_phone

                  return (
                    <div key={ev.id+ev._type}>
                      {/* Time label — shown for first event or when time changes */}
                      {(idx === 0 || ordered[idx-1].scheduled_time !== ev.scheduled_time || (!ev.scheduled_time && ordered[idx-1].scheduled_time)) && (
                        <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, padding:'10px 0 6px', letterSpacing:'0.02em' }}>
                          {timeLabel.toUpperCase()}
                        </div>
                      )}

                      {/* Event card */}
                      <div onClick={() => setSelectedEvent(ev)}
                        style={{ background:t.cardBg, borderRadius:14, border:`1px solid ${t.cardBorder}`, borderLeft:`4px solid ${accentColor}`, marginBottom:10, overflow:'hidden', opacity: isDone ? 0.7 : 1, cursor:'pointer' }}>
                        {/* Main content */}
                        <div style={{ padding:'12px 14px 10px' }}>
                          {/* Row 1: icon + type + amount */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round">
                                {isFollowup
                                  ? <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/>
                                  : isOverdue2
                                  ? <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>
                                  : <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
                                }
                              </svg>
                              <span style={{ fontSize:11, fontWeight:700, color:accentColor, textTransform:'uppercase' as const, letterSpacing:'0.06em' }}>
                                {isOverdue2 ? 'Overdue' : isFollowup ? 'Follow-up' : ev.lead_status}
                              </span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              {ev.quoted_amount && ev.quoted_amount > 0 && (
                                <span style={{ fontSize:15, fontWeight:800, color:accentColor }}>${ev.quoted_amount.toLocaleString()}</span>
                              )}
                              <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, background:statusBg, color:statusColor }}>{statusLabel}</span>
                            </div>
                          </div>
                          {/* Row 2: name */}
                          <div style={{ fontSize:17, fontWeight:800, color:t.textPri, marginBottom: ev.message ? 3 : 0 }}>{capName(ev.contact_name)}</div>
                          {/* Row 3: message/notes */}
                          {ev.message && (
                            <div style={{ fontSize:13, color:t.textSubtle, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{ev.message}</div>
                          )}
                        </div>

                        {/* Action bar — always 2 buttons */}
                        <div style={{ borderTop:`1px solid ${t.cardBorder}`, display:'flex', gap:0 }}
                          onClick={e => e.stopPropagation()}>
                          {phone ? (
                            <a href={`tel:${phone}`}
                              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'11px 0', fontSize:14, fontWeight:700, color:accentColor, textDecoration:'none', borderRight:`1px solid ${t.cardBorder}` }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
                              Call
                            </a>
                          ) : (
                            <button onClick={() => setSelectedEvent(ev)}
                              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'11px 0', fontSize:14, fontWeight:600, color:t.textMuted, background:'none', border:'none', borderRight:`1px solid ${t.cardBorder}`, cursor:'pointer' }}>
                              Open
                            </button>
                          )}
                          {isJob && !isDone ? (
                            <button onClick={() => markComplete(ev)}
                              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'11px 0', fontSize:14, fontWeight:700, color:'#15803D', background:'none', border:'none', cursor:'pointer' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                              Done
                            </button>
                          ) : (
                            <button onClick={() => setSelectedEvent(ev)}
                              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'11px 0', fontSize:14, fontWeight:600, color:t.textMuted, background:'none', border:'none', cursor:'pointer' }}>
                              Open
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}

        {/* Unscheduled */}
        {unscheduled.length>0 && selectedDayEvs.length>0 && (
          <div style={{ marginTop:6 }}>
            <div style={{ fontSize: 13, fontWeight:700, color:'#0F766E', marginBottom:8 }}>Needs scheduling ({unscheduled.length})</div>
            {unscheduled.slice(0,3).map(ev => (
              <div key={ev.id} onClick={() => router.push('/dashboard/pipeline/'+ev.id+'?from=calendar')}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:11, background:t.cardBg, border:`1px solid ${t.cardBorder}`, marginBottom:8, cursor:'pointer' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize: 15, fontWeight:700, color:t.textPri }}>{capName(ev.contact_name)}</div>
                  <div style={{ fontSize: 13, color:'rgba(255,255,255,0.85)', marginTop:2 }}>{ev.lead_status}</div>
                </div>
                <Svg path={ICON_PATH.chevronR} size={12} color={t.textSubtle} sw={2.5}/>
              </div>
            ))}
            {unscheduled.length>3 && (
              <button onClick={() => router.push('/dashboard/pipeline?filter=unscheduled')}
                style={{ width:'100%', padding:'11px', borderRadius:11, border:`1.5px dashed #0F766E`, background:'transparent', color:'#0F766E', fontSize: 14, fontWeight:700, cursor:'pointer' }}>
                +{unscheduled.length-3} more → Pipeline
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile bottom sheet detail */}
      {selectedEvent && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
          onClick={() => setSelectedEvent(null)}>
          <div style={{ background:'rgba(0,0,0,0.5)', position:'absolute', inset:0 }}/>
          <div style={{ position:'relative', maxHeight:'82vh', borderRadius:'20px 20px 0 0', overflow:'hidden', background:t.cardBg, zIndex:1 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}>
              <div style={{ width:36, height:4, borderRadius:2, background:t.cardBorder }}/>
            </div>
            <div style={{ maxHeight:'calc(82vh - 20px)', overflowY:'auto' }}>
              <DetailPanel ev={selectedEvent} onClose={() => setSelectedEvent(null)}
                onOpenLead={id => { setSelectedEvent(null); openLead(id) }} dk={dk} today0={today0}
                onMarkComplete={selectedEvent._type==='job'&&selectedEvent.lead_status==='Scheduled'?()=>markComplete(selectedEvent):undefined}
                completing={completing===selectedEvent.id}/>
            </div>
          </div>
        </div>
      )}

      {/* Filter sheet */}
      <FilterSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)}
        showJobs={showJobs} showFollowups={showFollowups}
        onToggleJobs={() => setShowJobs(v=>!v)} onToggleFU={() => setShowFollowups(v=>!v)} dk={dk}/>
    </div>
  )

  return (
    <>
      <style>{`.cal-hide-scroll::-webkit-scrollbar{display:none}.cal-hide-scroll{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <DashboardShell session={session} newLeads={0} onAddLead={() => {}}
        darkMode={dk} onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}>
        <div className="hidden md:block">{DesktopView}</div>
        <div className="md:hidden">{MobileView}</div>
      </DashboardShell>
    </>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarInner/>
    </Suspense>
  )
}
