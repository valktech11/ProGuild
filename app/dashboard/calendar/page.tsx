'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { capName } from '@/lib/utils'
import { theme, statusColors } from '@/lib/theme'

// ─── Types ───────────────────────────────────────────────────────────────────
interface CalEvent {
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

// ─── Constants ───────────────────────────────────────────────────────────────
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS= ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
function fmtPhone(p: string | null) {
  if (!p) return null
  const digits = p.replace(/\D/g,'')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return p
}
function startOfWeek(d: Date) { const dt=new Date(d); dt.setDate(dt.getDate()-dt.getDay()); return dt }
function addDays(d: Date, n: number) { const dt=new Date(d); dt.setDate(dt.getDate()+n); return dt }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()
}
function isToday(d: Date) { return isSameDay(d, new Date()) }
function isWeekend(d: Date) { return d.getDay()===0||d.getDay()===6 }

function fmtTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2,'0')}${ampm}`
}

function getEventDate(ev: CalEvent): Date | null {
  const ds = ev._type==='followup'?(ev.follow_up_date||ev.scheduled_date):(ev.scheduled_date||ev.follow_up_date)
  if (!ds) return null
  return parseLocal(ds)
}
function groupByDay(events: CalEvent[], days: Date[]): Record<string,CalEvent[]> {
  const map: Record<string,CalEvent[]> = {}
  days.forEach(d => { map[toDateKey(d)] = [] })
  events.forEach(ev => {
    const d = getEventDate(ev); if (!d) return
    const k = toDateKey(d); if (map[k]) map[k].push(ev)
  })
  return map
}

// ─── ToggleSwitch ─────────────────────────────────────────────────────────────
function ToggleSwitch({ on, onChange, dk }: { on: boolean; onChange: () => void; dk: boolean }) {
  const t = theme(dk)
  return (
    <button onClick={onChange}
      style={{
        width:36, height:20, borderRadius:10, border:'none', cursor:'pointer', padding:2,
        background: on ? '#0F766E' : t.filterTrackOff,
        display:'flex', alignItems:'center',
        justifyContent: on ? 'flex-end' : 'flex-start',
        transition:'background 0.2s',
        flexShrink:0,
      }}>
      <div style={{ width:16, height:16, borderRadius:'50%', background:'white', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────
function DetailPanel({ ev, onClose, onOpenLead, dk, onMarkComplete, completing }: {
  ev: CalEvent; onClose: () => void; onOpenLead: (id: string) => void; dk: boolean
  onMarkComplete?: () => void; completing?: boolean
}) {
  const t = theme(dk)
  const isFollowup  = ev._type === 'followup'
  const isCompleted = ev.lead_status === 'Completed' || ev.lead_status === 'Paid'
  const sc = statusColors(ev.lead_status, isFollowup, dk)
  const phone = fmtPhone(ev.contact_phone)
  const dateStr = ev._type==='followup' ? fmt(ev.follow_up_date) : (fmt(ev.scheduled_date) + (ev.scheduled_time ? ` at ${fmtTime(ev.scheduled_time)}` : ''))

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background: t.cardBg, borderLeft:`4px solid ${sc.border}` }}>
      {/* Header */}
      <div style={{ padding:'20px 20px 16px', borderBottom:`1px solid ${t.cardBorder}`, background: sc.bg, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color: t.textPri }}>{capName(ev.contact_name)}</div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background: sc.chipBg || sc.bg, color: sc.text }}>
                {isFollowup ? 'Follow-up' : ev.lead_status === 'Paid' ? 'Job Won' : ev.lead_status}
              </span>
              {dateStr && <span style={{ fontSize:12, color: t.textMuted }}>{dateStr}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: t.textMuted, fontSize:22, lineHeight:1, padding:0 }}>×</button>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {phone && (
            <a href={`tel:${ev.contact_phone}`}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background: t.cardBg, border:`1.5px solid ${sc.border}44`, color: sc.border, fontSize:13, fontWeight:700, textDecoration:'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sc.border} strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
              {phone}
            </a>
          )}
          <button onClick={() => onOpenLead(ev.id)}
            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background:'linear-gradient(135deg,#0F766E,#0D9488)', border:'none', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            Open Lead
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
          </button>
        </div>
        {ev._type==='job' && ev.lead_status==='Scheduled' && onMarkComplete && (
          <button onClick={onMarkComplete} disabled={completing}
            style={{ width:'100%', marginTop:8, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background: completing?t.cardBgAlt:'#DCFCE7', border:'1.5px solid #86EFAC', color:'#15803D', fontSize:13, fontWeight:700, cursor:'pointer', opacity: completing?0.6:1 }}>
            {completing ? 'Marking complete…' : (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>Mark Job Complete</>)}
          </button>
        )}
      </div>
      {/* Details */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
        <div style={{ background: t.cardBgAlt, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color: t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Details</div>
          {[
            { label:'Date',   value: dateStr||'—' },
            { label:'Phone',  value: phone||'—' },
            { label:'Email',  value: ev.contact_email||'—' },
            { label:'Source', value: (ev.lead_source||'Unknown').replace(/_/g,' ') },
            { label:'Value',  value: ev.quoted_amount?`$${ev.quoted_amount.toLocaleString()}`:'—' },
          ].map(({label,value}) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13, marginBottom:8 }}>
              <span style={{ color: t.textSubtle }}>{label}</span>
              <span style={{ color: t.textPri, fontWeight:500, textAlign:'right', maxWidth:'60%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{value}</span>
            </div>
          ))}
        </div>
        {ev.message && (
          <div style={{ background: dk?'#1a1f2e':'#FFFBEB', borderRadius:12, padding:'14px 16px', border:`1px solid ${dk?'#334155':'#FDE68A'}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Message</div>
            <p style={{ fontSize:13, color: t.textBody, lineHeight:1.6, margin:0 }}>{ev.message}</p>
          </div>
        )}
        {ev.notes && (
          <div style={{ background: dk?'#0f1e1a':'#F0FDFA', borderRadius:12, padding:'14px 16px', border:`1px solid ${dk?'#1a3a2e':'#CCFBF1'}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#0F766E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Notes</div>
            <p style={{ fontSize:13, color: t.textBody, lineHeight:1.6, margin:0, whiteSpace:'pre-wrap' }}>{ev.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── WeekStrip (mobile) ───────────────────────────────────────────────────────
function WeekStrip({ selectedDate, dotDates, onSelect, dk }: {
  selectedDate: Date; dotDates: Set<string>; onSelect: (d: Date) => void; dk: boolean
}) {
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({length:7}, (_,i) => addDays(weekStart, i))
  return (
    <div style={{ display:'flex', gap:3 }} className="hide-scrollbar">
      {days.map(d => {
        const key = toDateKey(d)
        const isSel = isSameDay(d, selectedDate)
        const isTod = isToday(d)
        const hasDot = dotDates.has(key)
        return (
          <button key={key} onClick={() => onSelect(d)}
            style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', gap:1, padding:'8px 2px 6px', borderRadius:12, border:'none', cursor:'pointer', background: isSel?'#0F766E':isTod?'#CCFBF1':'transparent', transition:'all 0.12s', minHeight:54 }}>
            <span style={{ fontSize:13, fontWeight:800, color: isSel?'rgba(255,255,255,0.9)':isTod?'#0F766E':dk?'#94A3B8':'#374151' }}>
              {DAYS[d.getDay()].slice(0,1)}
            </span>
            <span style={{ fontSize:19, fontWeight:900, lineHeight:1, color: isSel?'white':isTod?'#0F766E':dk?'#F1F5F9':'#111827' }}>
              {d.getDate()}
            </span>
            {hasDot ? <div style={{ width:5, height:5, borderRadius:'50%', background: isSel?'rgba(255,255,255,0.75)':'#0F766E', marginTop:1 }} />
                    : <div style={{ width:5, height:5 }} />}
          </button>
        )
      })}
    </div>
  )
}

// ─── EventCardMobile ──────────────────────────────────────────────────────────
function EventCardMobile({ ev, onClick, dk, onMarkComplete, completing }: {
  ev: CalEvent; onClick: () => void; dk: boolean
  onMarkComplete?: () => void; completing?: boolean
}) {
  const t = theme(dk)
  const isFollowup  = ev._type === 'followup'
  const isCompleted = ev.lead_status === 'Completed' || ev.lead_status === 'Paid'
  const sc = statusColors(ev.lead_status, isFollowup, dk)
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(ev.message?.slice(0,50)||ev.contact_name)}`

  return (
    <div onClick={onClick}
      style={{ background: t.cardBg, borderLeft:`4px solid ${sc.border}`, borderRadius:12, padding:'12px 14px', cursor:'pointer', border:`1px solid ${t.cardBorder}`, borderLeftWidth:4, boxShadow:'0 1px 3px rgba(0,0,0,0.05)', opacity: isCompleted?0.7:1 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, minWidth:0 }}>
          {isFollowup && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={sc.border} strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81M1 1l22 22"/></svg>}
          {isCompleted && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" style={{flexShrink:0}}><path d="M20 6L9 17l-5-5"/></svg>}
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:16, fontWeight:700, color: t.textPri, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{capName(ev.contact_name)}</div>
            {ev.quoted_amount
              ? <div style={{ fontSize:13, fontWeight:700, color: sc.border, marginTop:1 }}>{ev.scheduled_time ? fmtTime(ev.scheduled_time)+' · ' : ''}${ev.quoted_amount.toLocaleString()}</div>
              : <div style={{ fontSize:12, color: t.textSubtle, marginTop:1 }}>{ev.scheduled_time ? fmtTime(ev.scheduled_time)+' · ' : ''}{isFollowup?'Follow-up':ev.lead_status==='Paid'?'Job Won':ev.lead_status}</div>
            }
          </div>
        </div>
        <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
          {ev.contact_phone && (
            <a href={`tel:${ev.contact_phone}`}
              style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 12px', borderRadius:9, background: sc.bg, border:`1.5px solid ${sc.border}55`, color: sc.border, fontSize:13, fontWeight:700, textDecoration:'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sc.border} strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
              Call
            </a>
          )}
          {ev._type==='job' && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 12px', borderRadius:9, background: t.cardBgAlt, border:`1.5px solid ${t.cardBorder}`, color: t.textBody, fontSize:13, fontWeight:700, textDecoration:'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Nav
            </a>
          )}
          {onMarkComplete && !isCompleted && (
            <button onClick={onMarkComplete} disabled={completing}
              style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 12px', borderRadius:9, background: completing?t.cardBgAlt:'#DCFCE7', border:'1.5px solid #86EFAC', color:'#15803D', fontSize:13, fontWeight:700, cursor:'pointer', opacity: completing?0.6:1 }}>
              {completing?'…':(<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>Done</>)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── UnscheduledList ──────────────────────────────────────────────────────────
function UnscheduledList({ leads, dk, onOpen }: { leads: CalEvent[]; dk: boolean; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? leads : leads.slice(0,2)
  const t = theme(dk)
  const daysSince = (d: string) => Math.floor((Date.now()-new Date(d).getTime())/86400000)

  return (
    <div style={{ marginTop:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#0F766E' }}>Needs scheduling ({leads.length})</div>
        {leads.length > 2 && (
          <button onClick={() => setExpanded(e=>!e)}
            style={{ fontSize:13, fontWeight:700, color:'#0F766E', background:'#F0FDFA', border:'1.5px solid #CCFBF1', cursor:'pointer', padding:'6px 12px', borderRadius:20 }}>
            {expanded?'Show less ∧':`All ${leads.length} ∨`}
          </button>
        )}
      </div>
      {visible.map(ev => {
        const days = daysSince(ev.created_at)
        const urgColor = days>3?'#DC2626':days>=2?'#B45309':'#059669'
        const urgBg    = days>3?'#FEE2E2':days>=2?'#FEF3C7':'#D1FAE5'
        return (
          <div key={ev.id}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', borderRadius:14, background: t.cardBg, border:`1px solid ${t.cardBorder}`, marginBottom:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:16, fontWeight:700, color: t.textPri }}>{capName(ev.contact_name)}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                <span style={{ fontSize:14, color: t.textSubtle }}>{ev.lead_status}</span>
                <span style={{ fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:8, background: urgBg, color: urgColor }}>{days}d ago</span>
              </div>
            </div>
            {ev.contact_phone
              ? <a href={`tel:${ev.contact_phone}`} style={{ display:'flex', alignItems:'center', gap:4, padding:'11px 16px', borderRadius:12, background:'#F0FDFA', border:'1.5px solid #CCFBF1', color:'#0F766E', fontSize:13, fontWeight:700, textDecoration:'none', flexShrink:0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.22 1.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6"/></svg>
                  Call
                </a>
              : <span style={{ fontSize:13, color: t.textSubtle, flexShrink:0 }}>No phone</span>
            }
            <button onClick={() => onOpen(ev.id)}
              style={{ width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:12, background: t.cardBgAlt, border:`1.5px solid ${t.cardBorder}`, cursor:'pointer', flexShrink:0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textBody} strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
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
  const [session, setSession] = useState<Session|null>(null)
  const [dk, setDk]           = useState(false)
  const [view, setView]       = useState<'week'|'month'>('week')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [events, setEvents]       = useState<CalEvent[]>([])
  const [unscheduled, setUnscheduled] = useState<CalEvent[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent|null>(null)
  const [mobileView, setMobileView] = useState<'week'|'month'>('week')
  const [monthAgendaDate, setMonthAgendaDate] = useState<Date|null>(null)
  const [showJobs, setShowJobs]           = useState(true)
  const [showFollowups, setShowFollowups] = useState(true)
  const [touchStartX, setTouchStartX]     = useState<number|null>(null)
  const [completing, setCompleting]       = useState<string|null>(null)

  const t = theme(dk)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = sessionStorage.getItem('pg_pro')
    if (!raw) { router.push('/login'); return }
    setSession(JSON.parse(raw))
    setDk(localStorage.getItem('pg_darkmode') === '1')
  }, [router])

  const fetchEvents = useCallback(async (s: Session, center: Date) => {
    setLoading(true)
    const from = toDateKey(addDays(center,-30))
    const to   = toDateKey(addDays(center,60))
    try {
      const r = await fetch(`/api/calendar?pro_id=${s.id}&from=${from}&to=${to}`)
      const d = await r.json()
      setEvents(d.events||[])
      setUnscheduled(d.unscheduled||[])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { if (session) fetchEvents(session, selectedDate) }, [session, fetchEvents])

  const weekStart  = startOfWeek(selectedDate)
  const weekDays   = Array.from({length:7}, (_,i) => addDays(weekStart,i))
  const firstDay   = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay()
  const daysInMonth= new Date(selectedDate.getFullYear(), selectedDate.getMonth()+1, 0).getDate()
  const dotDates   = new Set(events.map(ev => { const d=getEventDate(ev); return d?toDateKey(d):null }).filter(Boolean) as string[])
  const weekGrouped= groupByDay(events, weekDays)

  const todayKey  = toDateKey(new Date())
  const todayJobs = events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===todayKey&&ev._type==='job' })
  const todayValue= todayJobs.reduce((s,ev)=>s+(ev.quoted_amount||0),0)
  const weekValue = weekDays.reduce((sum,d) => {
    const evs = weekGrouped[toDateKey(d)]||[]
    return sum + evs.filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0)
  }, 0)

  const today0 = new Date(); today0.setHours(0,0,0,0)
  const overdueFollowups = events.filter(ev => {
    if (ev._type!=='followup') return false
    const d = getEventDate(ev); if (!d) return false
    return d < today0 && !['Completed','Paid'].includes(ev.lead_status)
  })

  function applyFilters(evs: CalEvent[]): CalEvent[] {
    return evs.filter(ev => {
      if (ev._type==='job'      && !showJobs)      return false
      if (ev._type==='followup' && !showFollowups) return false
      return true
    })
  }

  const weekGroupedFiltered = Object.fromEntries(
    weekDays.map(d => [toDateKey(d), applyFilters(weekGrouped[toDateKey(d)]||[])])
  )
  const selectedDayKey = toDateKey(selectedDate)
  const todayEvents    = applyFilters(events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===selectedDayKey }))
  const agendaDate     = monthAgendaDate||selectedDate
  const agendaEvents   = applyFilters(events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===toDateKey(agendaDate) }))

  function navWeek(dir: number) { setSelectedDate(addDays(selectedDate, dir*7)) }
  function navDay(dir: number)  { setSelectedDate(addDays(selectedDate, dir)) }
  function goToday() { setSelectedDate(new Date()); setMonthAgendaDate(null) }
  function selectDay(d: Date) { setSelectedDate(d); setSelectedEvent(null); setMonthAgendaDate(d) }

  function handleTouchStart(e: React.TouchEvent) { setTouchStartX(e.touches[0].clientX) }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX===null) return
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx)>60) navDay(dx<0?1:-1)
    setTouchStartX(null)
  }

  async function markComplete(ev: CalEvent) {
    if (!session||completing) return
    setCompleting(ev.id)
    try {
      await fetch(`/api/leads/${ev.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pro_id: session.id, lead_status:'Completed' }) })
      setEvents(prev => prev.map(e => e.id===ev.id ? {...e, lead_status:'Completed'} : e))
      setSelectedEvent(null)
    } finally { setCompleting(null) }
  }

  if (!session) return null

  // ── Nav button (reusable, big enough to tap) ──────────────────────────────
  const NavBtn = ({ dir, onClick }: { dir: 'prev'|'next'; onClick: () => void }) => (
    <button onClick={onClick}
      style={{ width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:9, border:`1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textBody, cursor:'pointer', flexShrink:0, transition:'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = t.cardBgAlt)}
      onMouseLeave={e => (e.currentTarget.style.background = t.cardBg)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        {dir==='prev' ? <path d="M15 18l-6-6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
      </svg>
    </button>
  )

  // ── Left sidebar filter section ────────────────────────────────────────────
  const SidebarFilters = (
    <div style={{ background: t.cardBg, borderRadius:12, padding:'14px 16px', border:`1px solid ${t.cardBorder}` }}>
      <div style={{ fontSize:10, fontWeight:700, color: t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Show</div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:'#0F766E', flexShrink:0 }} />
            <span style={{ fontSize:13, fontWeight:600, color: t.textPri }}>Jobs</span>
          </div>
          <ToggleSwitch on={showJobs} onChange={() => setShowJobs(v=>!v)} dk={dk} />
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:'#D97706', flexShrink:0 }} />
            <span style={{ fontSize:13, fontWeight:600, color: t.textPri }}>Follow-ups</span>
          </div>
          <ToggleSwitch on={showFollowups} onChange={() => setShowFollowups(v=>!v)} dk={dk} />
        </div>
      </div>
    </div>
  )

  // ── Desktop layout ────────────────────────────────────────────────────────
  const DesktopView = (
    <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden' }}>

      {/* Left sidebar */}
      <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${t.cardBorder}`, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:12, background: t.calSidebar }}>

        {/* Overdue alert — only when overdue items exist */}
        {overdueFollowups.length > 0 && (
          <div style={{ background: t.overdueAlertBg, border:`1px solid ${t.overdueAlertBorder}`, borderRadius:12, padding:'12px 14px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#DC2626', flexShrink:0, boxShadow:'0 0 0 2px rgba(220,38,38,0.25)' }} />
              <span style={{ fontSize:12, fontWeight:800, color: t.overdueText }}>
                {overdueFollowups.length} Overdue follow-up{overdueFollowups.length!==1?'s':''}
              </span>
            </div>
            <div style={{ paddingLeft:13 }}>
              {overdueFollowups.slice(0,3).map(ev => (
                <div key={ev.id}
                  onClick={() => setSelectedEvent(ev)}
                  style={{ fontSize:12, color: t.overdueText, fontWeight:600, cursor:'pointer', padding:'2px 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  → {capName(ev.contact_name)}
                </div>
              ))}
              {overdueFollowups.length > 3 && (
                <div style={{ fontSize:11, color: t.overdueText, opacity:0.7 }}>+{overdueFollowups.length-3} more</div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        {SidebarFilters}

        {/* Today stats */}
        <div style={{ background: t.cardBg, borderRadius:12, padding:'14px 16px', border:`1px solid ${t.cardBorder}` }}>
          <div style={{ fontSize:10, fontWeight:700, color: t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Today</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color: t.textSubtle }}>Jobs</span>
              <span style={{ fontSize:20, fontWeight:800, color:'#0F766E' }}>{todayJobs.length}</span>
            </div>
            <div style={{ height:1, background: t.cardBorder }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color: t.textSubtle }}>Value</span>
              <span style={{ fontSize:16, fontWeight:800, color:'#15803D' }}>${todayValue>0?todayValue.toLocaleString():'0'}</span>
            </div>
          </div>
        </div>

        {/* Unscheduled */}
        {unscheduled.length > 0 && (
          <div style={{ background: t.cardBg, borderRadius:12, padding:'14px 16px', border:`1px solid ${t.cardBorder}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#D97706', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Needs Date ({unscheduled.length})</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {unscheduled.slice(0,5).map(ev => (
                <div key={ev.id}
                  onClick={() => router.push('/dashboard/pipeline/'+ev.id)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 9px', borderRadius:8, background: dk?'#2D1F00':'#FFFBEB', cursor:'pointer', border:'1px solid #FDE68A' }}
                  onMouseEnter={e => (e.currentTarget.style.background='#FEF3C7')}
                  onMouseLeave={e => (e.currentTarget.style.background= dk?'#2D1F00':'#FFFBEB')}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: t.textPri, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{capName(ev.contact_name)}</div>
                    <div style={{ fontSize:10, color:'#D97706', marginTop:1 }}>{ev.lead_status}</div>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
              {unscheduled.length>5 && <div style={{ fontSize:11, color: t.textSubtle, textAlign:'center', paddingTop:2 }}>+{unscheduled.length-5} more</div>}
            </div>
          </div>
        )}
      </div>

      {/* Center */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background: t.calGridBg }}>

        {/* Toolbar */}
        <div style={{ padding:'10px 16px', borderBottom:`1px solid ${t.cardBorder}`, display:'flex', alignItems:'center', gap:10, background: t.calToolbar, flexShrink:0, position:'sticky', top:0, zIndex:10 }}>
          <button onClick={goToday}
            style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textPri, fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            Today
          </button>
          <div style={{ display:'flex', gap:6 }}>
            <NavBtn dir="prev" onClick={() => navWeek(-1)} />
            <NavBtn dir="next" onClick={() => navWeek(1)} />
          </div>
          <span style={{ fontSize:15, fontWeight:700, color: t.textPri }}>
            {view==='week'
              ? `${SHORT_MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${SHORT_MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
              : `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
            }
          </span>
          {view==='week' && weekValue>0 && (
            <span style={{ fontSize:13, fontWeight:700, color:'#15803D', background: dk?'#052E16':'#DCFCE7', padding:'4px 10px', borderRadius:20, border:`1px solid ${dk?'#166534':'#86EFAC'}` }}>
              ${weekValue.toLocaleString()} this week
            </span>
          )}
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:`1.5px solid ${t.cardBorder}`, flexShrink:0 }}>
            {(['week','month'] as const).map(v => (
              <button key={v} onClick={() => { setView(v); if (v==='month') setMonthAgendaDate(selectedDate) }}
                style={{ padding:'5px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background: view===v?'#0F766E':'transparent', color: view===v?'white': t.textMuted, textTransform:'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color: t.textSubtle, fontSize:14 }}>Loading…</div>
        ) : view==='week' ? (

          /* ── Week view with time slots ── */
          <div style={{ flex:1, overflowX:'auto' }}>
            {/* Sticky day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'52px repeat(7,1fr)', borderBottom:`1px solid ${t.cardBorder}`, background: t.calDayHeader, position:'sticky', top:0, zIndex:9 }}>
              <div style={{ borderRight:`1px solid ${t.calCellBorder}` }} />{/* time axis header spacer */}
              {weekDays.map(d => {
                const isTod  = isToday(d)
                const isSel  = isSameDay(d, selectedDate)
                const isWknd = isWeekend(d)
                return (
                  <div key={toDateKey(d)} onClick={() => selectDay(d)}
                    style={{ padding:'10px 8px', textAlign:'center', borderRight:`1px solid ${t.calCellBorder}`, cursor:'pointer', background: isTod?t.calColToday:isWknd?t.calColWeekend:isSel?t.calColSelected:'transparent' }}>
                    <div style={{ fontSize:10, fontWeight:700, color: isTod?'#0F766E':isWknd?t.textSubtle:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{DAYS[d.getDay()]}</div>
                    <div style={{ width:30, height:30, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'4px auto 0', background: isTod?'#0F766E':'transparent' }}>
                      <span style={{ fontSize:15, fontWeight:700, color: isTod?'white':isSel?'#0F766E': t.textPri }}>{d.getDate()}</span>
                    </div>
                    {dotDates.has(toDateKey(d))&&!isTod && <div style={{ width:4, height:4, borderRadius:'50%', background:'#0F766E', margin:'3px auto 0' }} />}
                  </div>
                )
              })}
            </div>

            {/* Time slot grid */}
            {(() => {
              const HOURS = [7,8,9,10,11,12,13,14,15,16,17,18,19,20]
              const SLOT_H = 64 // px per hour slot

              // Separate timed vs untimed events per day
              const timedByDay: Record<string, CalEvent[]>   = {}
              const untimedByDay: Record<string, CalEvent[]> = {}
              weekDays.forEach(d => {
                const key = toDateKey(d)
                const evs = weekGroupedFiltered[key] || []
                timedByDay[key]   = evs.filter(ev => ev._type === 'job' && ev.scheduled_time)
                untimedByDay[key] = evs.filter(ev => !(ev._type === 'job' && ev.scheduled_time))
              })

              return (
                <div>
                  {/* All-day / unscheduled row — only if any day has untimed events */}
                  {weekDays.some(d => untimedByDay[toDateKey(d)].length > 0) && (
                    <div style={{ display:'grid', gridTemplateColumns:'52px repeat(7,1fr)', borderBottom:`2px solid ${t.cardBorder}` }}>
                      <div style={{ padding:'6px 4px', borderRight:`1px solid ${t.calCellBorder}`, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:6 }}>
                        <span style={{ fontSize:9, fontWeight:600, color: t.textSubtle, textTransform:'uppercase', letterSpacing:'0.05em', marginTop:6 }}>All day</span>
                      </div>
                      {weekDays.map(d => {
                        const key    = toDateKey(d)
                        const isTod  = isToday(d)
                        const isWknd = isWeekend(d)
                        const evs    = untimedByDay[key] || []
                        const allEvs = weekGrouped[key] || []
                        const hidden = allEvs.filter(ev => !(ev._type==='job'&&ev.scheduled_time)).length - evs.length
                        return (
                          <div key={key} style={{ padding:'4px', borderRight:`1px solid ${t.calCellBorder}`, minHeight:36, background: isTod?t.calColToday:isWknd?t.calColWeekend:'transparent' }}>
                            {evs.length===0 ? (
                              isWknd ? <div style={{ fontSize:9, color: t.calEmptyText, textAlign:'center', paddingTop:10, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.04em' }}>Free</div> : null
                            ) : (
                              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                {evs.map(ev => {
                                  const sc = statusColors(ev.lead_status, ev._type==='followup', dk)
                                  return (
                                    <div key={ev.id+ev._type}
                                      onClick={() => { selectDay(d); setSelectedEvent(ev) }}
                                      style={{ padding:'4px 6px', borderRadius:6, cursor:'pointer', background: sc.bg, borderLeft:`3px ${ev._type==='followup'?'dashed':'solid'} ${sc.border}`, transition:'transform 0.1s' }}
                                      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 3px 8px rgba(0,0,0,0.1)' }}
                                      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
                                      <div style={{ fontSize:11, fontWeight:700, color: sc.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                        {capName(ev.contact_name)}{ev.quoted_amount?` · $${ev.quoted_amount.toLocaleString()}`:''}
                                      </div>
                                    </div>
                                  )
                                })}
                                {hidden>0 && <div style={{ fontSize:9, color: t.textSubtle, paddingLeft:4, fontStyle:'italic' }}>{hidden} hidden</div>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Hourly rows */}
                  <div style={{ position:'relative' }}>
                    {HOURS.map(hour => {
                      const label = hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour-12}pm`
                      return (
                        <div key={hour} style={{ display:'grid', gridTemplateColumns:'52px repeat(7,1fr)', height:SLOT_H, borderBottom:`1px solid ${t.calCellBorder}` }}>
                          {/* Time label */}
                          <div style={{ borderRight:`1px solid ${t.calCellBorder}`, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:8, paddingTop:4 }}>
                            <span style={{ fontSize:10, fontWeight:600, color: t.textSubtle }}>{label}</span>
                          </div>
                          {/* Day columns */}
                          {weekDays.map(d => {
                            const key    = toDateKey(d)
                            const isTod  = isToday(d)
                            const isSel  = isSameDay(d, selectedDate)
                            const isWknd = isWeekend(d)
                            // Events that start in this hour slot
                            const slotEvs = (timedByDay[key]||[]).filter(ev => {
                              if (!ev.scheduled_time) return false
                              const h = parseInt(ev.scheduled_time.split(':')[0])
                              return h === hour
                            })
                            return (
                              <div key={key} style={{ borderRight:`1px solid ${t.calCellBorder}`, background: isTod?t.calColToday:isWknd?t.calColWeekend:isSel?t.calColSelected:'transparent', position:'relative', padding:'2px 3px' }}>
                                {slotEvs.map(ev => {
                                  const sc = statusColors(ev.lead_status, false, dk)
                                  const timeLabel = fmtTime(ev.scheduled_time)
                                  return (
                                    <div key={ev.id}
                                      onClick={() => { selectDay(d); setSelectedEvent(ev) }}
                                      style={{ padding:'5px 7px', borderRadius:7, cursor:'pointer', background: sc.bg, borderLeft:`3px solid ${sc.border}`, height: SLOT_H-8, overflow:'hidden', transition:'transform 0.1s, box-shadow 0.1s', display:'flex', flexDirection:'column', justifyContent:'space-between' }}
                                      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 3px 10px rgba(0,0,0,0.14)' }}
                                      onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
                                      <div>
                                        <div style={{ fontSize:11, fontWeight:700, color: sc.border, marginBottom:1 }}>{timeLabel}</div>
                                        <div style={{ fontSize:12, fontWeight:700, color: sc.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                          {capName(ev.contact_name)}
                                        </div>
                                      </div>
                                      {ev.quoted_amount && (
                                        <div style={{ fontSize:11, fontWeight:700, color: sc.border }}>${ev.quoted_amount.toLocaleString()}</div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

        ) : (
          /* ── Month view ── */
          <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            <div style={{ padding:'16px 16px 8px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
                {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color: t.textMuted, padding:'4px 0', textTransform:'uppercase', letterSpacing:'0.06em' }}>{d}</div>)}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {Array(firstDay).fill(null).map((_,i) => <div key={'e'+i} />)}
                {Array.from({length:daysInMonth},(_,i)=>i+1).map(day => {
                  const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day)
                  const key = toDateKey(d)
                  const dayEvs = applyFilters(events.filter(ev => { const ed=getEventDate(ev); return ed&&toDateKey(ed)===key }))
                  const isTod = isToday(d)
                  const isSel = monthAgendaDate ? isSameDay(d,monthAgendaDate) : isSameDay(d,selectedDate)
                  return (
                    <div key={day} onClick={() => { selectDay(d); setMonthAgendaDate(d) }}
                      style={{ minHeight:76, padding:'6px', borderRadius:8, cursor:'pointer', border:`1.5px solid ${isSel?'#0F766E':t.calCellBorder}`, background: isTod?t.calColToday: t.cardBg, transition:'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = t.calColSelected)}
                      onMouseLeave={e => (e.currentTarget.style.background = isTod?t.calColToday: t.cardBg)}>
                      <div style={{ fontSize:12, fontWeight: isTod?800:500, color: isTod?'#0F766E': t.textPri, marginBottom:3 }}>{day}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                        {dayEvs.slice(0,2).map(ev => {
                          const sc = statusColors(ev.lead_status, ev._type==='followup', dk)
                          return (
                            <div key={ev.id+ev._type}
                              onClick={e => { e.stopPropagation(); setMonthAgendaDate(d); setSelectedEvent(ev) }}
                              style={{ fontSize:9, fontWeight:700, padding:'2px 4px', borderRadius:4, background: sc.bg, color: sc.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {capName(ev.contact_name)}
                            </div>
                          )
                        })}
                        {dayEvs.length>2 && (
                          <button onClick={e => { e.stopPropagation(); selectDay(d); setMonthAgendaDate(d) }}
                            style={{ fontSize:9, color: t.textSubtle, paddingLeft:4, background:'none', border:'none', cursor:'pointer', textAlign:'left', fontWeight:600 }}>
                            +{dayEvs.length-2} more
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Day agenda strip */}
            <div style={{ flex:1, borderTop:`1px solid ${t.cardBorder}`, overflowY:'auto', background: t.calAgendaBg }}>
              <div style={{ padding:'12px 16px', borderBottom:`1px solid ${t.cardBorder}`, background: t.calToolbar, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:14, fontWeight:700, color: t.textPri }}>
                  {isToday(agendaDate)?'Today':`${DAYS[agendaDate.getDay()]}, ${SHORT_MONTHS[agendaDate.getMonth()]} ${agendaDate.getDate()}`}
                  {agendaEvents.length>0 && <span style={{ marginLeft:8, fontSize:12, color: t.textSubtle }}>{agendaEvents.length} event{agendaEvents.length!==1?'s':''}</span>}
                </span>
                {agendaEvents.length>0 && (
                  <span style={{ fontSize:13, fontWeight:700, color:'#15803D' }}>
                    ${agendaEvents.filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                {agendaEvents.length===0
                  ? <div style={{ textAlign:'center', padding:'20px 0', color: t.textSubtle, fontSize:13 }}>No events on this day</div>
                  : agendaEvents.map(ev => {
                      const sc = statusColors(ev.lead_status, ev._type==='followup', dk)
                      const isCompleted = ev.lead_status==='Completed'||ev.lead_status==='Paid'
                      return (
                        <div key={ev.id+ev._type}
                          onClick={() => setSelectedEvent(ev)}
                          style={{ background: sc.bg, borderLeft:`3px solid ${sc.border}`, borderRadius:10, padding:'10px 12px', cursor:'pointer', border:`1px solid ${sc.border}22`, borderLeftWidth:3, opacity: isCompleted?0.75:1 }}
                          onMouseEnter={e => (e.currentTarget.style.transform='translateY(-1px)',e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)')}
                          onMouseLeave={e => (e.currentTarget.style.transform='',e.currentTarget.style.boxShadow='')}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span style={{ fontSize:13, fontWeight:700, color: sc.text }}>{capName(ev.contact_name)}</span>
                            {ev.quoted_amount && <span style={{ fontSize:12, fontWeight:700, color: sc.border }}>${ev.quoted_amount.toLocaleString()}</span>}
                          </div>
                          <div style={{ fontSize:11, color: sc.text, opacity:0.7, marginTop:3 }}>
                            {ev._type==='followup'?'Follow-up reminder':ev.lead_status==='Paid'?'Job Won':ev.lead_status}
                          </div>
                        </div>
                      )
                    })
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right detail panel */}
      <div style={{ width: selectedEvent?320:0, flexShrink:0, borderLeft: selectedEvent?`1px solid ${t.cardBorder}`:'none', overflow:'hidden', transition:'width 0.2s ease' }}>
        {selectedEvent && (
          <DetailPanel ev={selectedEvent} onClose={() => setSelectedEvent(null)} onOpenLead={id => router.push('/dashboard/pipeline/'+id)} dk={dk}
            onMarkComplete={selectedEvent._type==='job'&&selectedEvent.lead_status==='Scheduled'?()=>markComplete(selectedEvent):undefined}
            completing={completing===selectedEvent.id} />
        )}
      </div>
    </div>
  )

  // ── Mobile layout ─────────────────────────────────────────────────────────
  const MobileView = (
    <div style={{ minHeight:'100vh', background: t.pageBg, display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ padding:'14px 16px 10px', background: t.cardBg, borderBottom:`1px solid ${t.cardBorder}`, flexShrink:0 }}>
        {/* Row 1: nav + month name */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <button onClick={() => navWeek(-1)}
            style={{ width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:14, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, cursor:'pointer', flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.textBody} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:800, color: t.textPri, letterSpacing:'-0.3px' }}>{MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}</div>
            <div style={{ fontSize:12, fontWeight:600, color: t.textSubtle, marginTop:1 }}>
              {isToday(selectedDate)?'Today':`${DAYS[selectedDate.getDay()]}, ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
              {todayJobs.length>0&&` · ${todayJobs.length} job${todayJobs.length!==1?'s':''}`}
            </div>
          </div>
          <button onClick={() => navWeek(1)}
            style={{ width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:14, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, cursor:'pointer', flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.textBody} strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        {/* Row 2: week strip */}
        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:10 }}>
          <button onClick={() => { const d=new Date(selectedDate); d.setMonth(d.getMonth()-1); d.setDate(1); selectDay(d) }}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:40, height:44, borderRadius:12, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, cursor:'pointer', flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textBody} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ flex:1 }}><WeekStrip selectedDate={selectedDate} dotDates={dotDates} onSelect={selectDay} dk={dk} /></div>
          <button onClick={() => { const d=new Date(selectedDate); d.setMonth(d.getMonth()+1); d.setDate(1); selectDay(d) }}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:40, height:44, borderRadius:12, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, cursor:'pointer', flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textBody} strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        {/* Row 3: Today + Week/Month + filter toggles */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {!isToday(selectedDate) && (
            <button onClick={goToday}
              style={{ fontSize:13, fontWeight:700, padding:'8px 14px', borderRadius:22, border:`1.5px solid #0F766E`, background:'transparent', color:'#0F766E', cursor:'pointer', flexShrink:0 }}>
              ← Today
            </button>
          )}
          <div style={{ display:'flex', borderRadius:22, overflow:'hidden', border:`1.5px solid ${t.cardBorder}` }}>
            {(['week','month'] as const).map(v => (
              <button key={v} onClick={() => setMobileView(v)}
                style={{ padding:'9px 16px', border:'none', cursor:'pointer', fontSize:13, fontWeight:700, background: mobileView===v?'#0F766E':'transparent', color: mobileView===v?'white':t.textMuted, textTransform:'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
          <div style={{ flex:1 }} />
          {/* Compact filter toggles */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:'#0F766E' }} />
              <ToggleSwitch on={showJobs} onChange={() => setShowJobs(v=>!v)} dk={dk} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:'#D97706' }} />
              <ToggleSwitch on={showFollowups} onChange={() => setShowFollowups(v=>!v)} dk={dk} />
            </div>
          </div>
        </div>
      </div>

      {/* Today value strip */}
      {todayJobs.length>0 && (
        <div style={{ margin:'10px 16px 0', padding:'10px 16px', background: t.cardBg, borderRadius:12, border:`1px solid ${t.cardBorder}`, display:'flex' }}>
          <div style={{ flex:1, textAlign:'center', borderRight:`1px solid ${t.cardBorder}` }}>
            <div style={{ fontSize:20, fontWeight:800, color:'#0F766E' }}>{todayJobs.length}</div>
            <div style={{ fontSize:11, color: t.textSubtle, marginTop:1 }}>{isToday(selectedDate)?'Jobs today':'Jobs'}</div>
          </div>
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:800, color:'#15803D' }}>{todayValue>0?`$${todayValue.toLocaleString()}`:'—'}</div>
            <div style={{ fontSize:11, color: t.textSubtle, marginTop:1 }}>Scheduled</div>
          </div>
        </div>
      )}

      {/* Overdue alert — mobile */}
      {overdueFollowups.length>0&&isToday(selectedDate) && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', background: t.overdueAlertBg, border:`1px solid ${t.overdueAlertBorder}`, borderRadius:12, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#DC2626', flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color: t.overdueText }}>{overdueFollowups.length} overdue follow-up{overdueFollowups.length!==1?'s':''}</div>
            <div style={{ fontSize:11, color: t.overdueText, opacity:0.8, marginTop:1 }}>{overdueFollowups.map(e=>capName(e.contact_name)).join(', ')}</div>
          </div>
        </div>
      )}

      {/* Day agenda */}
      <div style={{ flex:1, padding:'12px 16px', display:'flex', flexDirection:'column', gap:12, overflowY:'auto' }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {loading ? (
          [1,2,3].map(i => <div key={i} style={{ height:72, borderRadius:12, background: t.cardBg }} />)
        ) : todayEvents.length===0 ? (
          <div style={{ textAlign:'center', padding:'24px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
            <div style={{ width:60, height:60, borderRadius:'50%', background: dk?'rgba(15,118,110,0.15)':'#F0FDFA', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color: t.textPri, marginBottom:6 }}>
                {isToday(selectedDate)?'No jobs today':`Nothing on ${DAYS[selectedDate.getDay()]} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
              </div>
              <div style={{ fontSize:14, color: t.textSubtle, lineHeight:1.6 }}>
                {unscheduled.length>0?`${unscheduled.length} lead${unscheduled.length!==1?'s':''} waiting to be scheduled`
                  :events.length===0?'Your calendar is empty — schedule your first job from the pipeline'
                  :isToday(selectedDate)?'Your day is open — great time to follow up with leads'
                  :'Nothing scheduled on this day'}
              </div>
            </div>
            {events.length===0&&unscheduled.length===0 && (
              <button onClick={() => router.push('/dashboard/pipeline')}
                style={{ padding:'14px 28px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                Go to Pipeline →
              </button>
            )}
            {unscheduled.length>0 && (
              <button onClick={() => router.push('/dashboard/pipeline')}
                style={{ width:'100%', padding:'16px', borderRadius:14, border:`2px dashed #0F766E`, background:'transparent', color:'#0F766E', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                Schedule {unscheduled.length} lead{unscheduled.length!==1?'s':''} →
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize:14, fontWeight:700, color: t.textSubtle }}>
              {todayEvents.length} event{todayEvents.length!==1?'s':''} · {isToday(selectedDate)?'Today':`${DAYS[selectedDate.getDay()]} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
            </div>
            {todayEvents.map(ev => (
              <div key={ev.id+ev._type}>
                <EventCardMobile ev={ev} onClick={() => setSelectedEvent(ev)} dk={dk}
                  onMarkComplete={ev._type==='job'&&ev.lead_status==='Scheduled'?()=>markComplete(ev):undefined}
                  completing={completing===ev.id} />
              </div>
            ))}
          </>
        )}
        {unscheduled.length>0 && <UnscheduledList leads={unscheduled} dk={dk} onOpen={id => router.push('/dashboard/pipeline/'+id)} />}
      </div>

      {/* Mobile detail bottom sheet */}
      {selectedEvent && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
          onClick={() => setSelectedEvent(null)}>
          <div style={{ background:'rgba(0,0,0,0.5)', position:'absolute', inset:0 }} />
          <div style={{ position:'relative', maxHeight:'80vh', borderRadius:'20px 20px 0 0', overflow:'hidden', background: t.cardBg, zIndex:1 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}>
              <div style={{ width:36, height:4, borderRadius:2, background: t.cardBorder }} />
            </div>
            <div style={{ maxHeight:'calc(80vh - 20px)', overflowY:'auto' }}>
              <DetailPanel ev={selectedEvent} onClose={() => setSelectedEvent(null)}
                onOpenLead={id => { setSelectedEvent(null); router.push('/dashboard/pipeline/'+id) }} dk={dk}
                onMarkComplete={selectedEvent._type==='job'&&selectedEvent.lead_status==='Scheduled'?()=>markComplete(selectedEvent):undefined}
                completing={completing===selectedEvent.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar{display:none}
        .hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>
      <DashboardShell session={session} newLeads={0} onAddLead={() => {}}
        darkMode={dk} onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}>
        <div className="hidden md:block">{DesktopView}</div>
        <div className="md:hidden">{MobileView}</div>
      </DashboardShell>
    </>
  )
}
