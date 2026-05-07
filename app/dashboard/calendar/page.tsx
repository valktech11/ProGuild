'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { EventChip, CalEvent } from '@/components/ui/EventChip'
import { Session } from '@/types'
import { capName } from '@/lib/utils'
import { theme } from '@/lib/theme'
import { eventStyle, stageStyle, ICON_PATH } from '@/lib/design'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DAYS        = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS= ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()
}
function isToday(d: Date) { return isSameDay(d, new Date()) }
function isWeekend(d: Date) { return d.getDay()===0||d.getDay()===6 }

function getEventDate(ev: CalEvent): Date | null {
  const ds = ev._type==='followup'
    ? (ev.follow_up_date||ev.scheduled_date)
    : (ev.scheduled_date||ev.follow_up_date)
  if (!ds) return null
  return parseLocal(ds)
}

function isOverdueEvent(ev: CalEvent, today0: Date): boolean {
  if (['Completed','Paid'].includes(ev.lead_status)) return false
  const d = getEventDate(ev)
  return !!d && d < today0
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

// ─── SVG icon shorthand ───────────────────────────────────────────────────────
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
        display:'flex', alignItems:'center', justifyContent: on ? 'flex-end' : 'flex-start',
        transition:'background 0.18s', flexShrink:0 }}>
      <div style={{ width:16, height:16, borderRadius:'50%', background:'white', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
    </button>
  )
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────
function DetailPanel({ ev, onClose, onOpenLead, dk, onMarkComplete, completing, today0 }: {
  ev: CalEvent; onClose: ()=>void; onOpenLead: (id:string)=>void; dk: boolean
  onMarkComplete?: ()=>void; completing?: boolean; today0: Date
}) {
  const t = theme(dk)
  const isFollowup  = ev._type === 'followup'
  const isCompleted = ev.lead_status === 'Completed' || ev.lead_status === 'Paid'
  const overdue     = isOverdueEvent(ev, today0)
  const es  = eventStyle({ isOverdue: overdue, isFollowup, isCompleted, leadStatus: ev.lead_status }, dk)
  const phone = fmtPhone(ev.contact_phone)
  const timeStr = ev.scheduled_time ? fmtTime(ev.scheduled_time) : ''
  const dateStr = ev._type==='followup' ? fmt(ev.follow_up_date) : fmt(ev.scheduled_date)
  const fullDate = [dateStr, timeStr].filter(Boolean).join(' at ')

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background: t.cardBg, borderLeft:`4px solid ${es.border}` }}>
      {/* Header */}
      <div style={{ padding:'18px 20px 14px', borderBottom:`1px solid ${t.cardBorder}`, background: es.bg, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <Svg path={isFollowup ? ICON_PATH.phone : ICON_PATH.wrench} size={12} color={es.border} sw={2}/>
              <span style={{ fontSize:11, fontWeight:700, color: es.mutedText, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {isFollowup ? 'Follow-up' : ev.lead_status==='Paid' ? 'Job Won' : ev.lead_status}
              </span>
              {overdue && <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:8, background:'#FEE2E2', color:'#DC2626' }}>Overdue</span>}
            </div>
            <div style={{ fontSize:18, fontWeight:800, color: t.textPri }}>{capName(ev.contact_name)}</div>
            {fullDate && <div style={{ fontSize:12, color: t.textMuted, marginTop:3 }}>{fullDate}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color: t.textMuted, fontSize:22, lineHeight:1, padding:0, marginTop:-2 }}>×</button>
        </div>
        {/* Actions */}
        <div style={{ display:'flex', gap:8, flexDirection:'column' }}>
          <div style={{ display:'flex', gap:8 }}>
            {phone && (
              <a href={`tel:${ev.contact_phone}`}
                style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background: t.cardBg, border:`1.5px solid ${es.border}44`, color: es.border, fontSize:13, fontWeight:700, textDecoration:'none' }}>
                <Svg path={ICON_PATH.phone} size={13} color={es.border} sw={2.2}/>{phone}
              </a>
            )}
            <button onClick={() => onOpenLead(ev.id)}
              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background:'linear-gradient(135deg,#0F766E,#0D9488)', border:'none', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Open Lead <Svg path={ICON_PATH.chevronR} size={12} color="white" sw={2.5}/>
            </button>
          </div>
          {ev._type==='job' && ev.lead_status==='Scheduled' && onMarkComplete && (
            <button onClick={onMarkComplete} disabled={completing}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', borderRadius:10, background: completing?t.cardBgAlt:'#DCFCE7', border:'1.5px solid #86EFAC', color:'#15803D', fontSize:13, fontWeight:700, cursor:'pointer', opacity: completing?0.6:1 }}>
              {completing ? 'Marking complete…' : (<><Svg path={ICON_PATH.check} size={13} color="#15803D" sw={2.5}/>Mark Job Complete</>)}
            </button>
          )}
        </div>
      </div>
      {/* Details */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background: t.cardBgAlt, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color: t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Details</div>
          {[
            { label:'Date',   value: fullDate||'—' },
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
          <div style={{ background: dk?'#1a1f2e':'#FFFBEB', borderRadius:12, padding:'12px 14px', border:`1px solid ${dk?'#334155':'#FDE68A'}` }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Message</div>
            <p style={{ fontSize:13, color: t.textBody, lineHeight:1.6, margin:0 }}>{ev.message}</p>
          </div>
        )}
        {ev.notes && (
          <div style={{ background: dk?'#0f1e1a':'#F0FDFA', borderRadius:12, padding:'12px 14px', border:`1px solid ${dk?'#1a3a2e':'#CCFBF1'}` }}>
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
  selectedDate: Date; dotDates: Set<string>; onSelect: (d:Date)=>void; dk: boolean
}) {
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({length:7},(_,i) => addDays(weekStart,i))
  return (
    <div style={{ display:'flex', gap:2 }}>
      {days.map(d => {
        const key  = toDateKey(d)
        const isSel = isSameDay(d, selectedDate)
        const isTod = isToday(d)
        const hasDot= dotDates.has(key)
        return (
          <button key={key} onClick={() => onSelect(d)}
            style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', gap:1, padding:'7px 2px 5px', borderRadius:12, border:'none', cursor:'pointer', background: isSel?'#0F766E':isTod?'#CCFBF1':'transparent', transition:'all 0.12s', minHeight:52 }}>
            <span style={{ fontSize:12, fontWeight:800, color: isSel?'rgba(255,255,255,0.9)':isTod?'#0F766E':dk?'#94A3B8':'#374151' }}>
              {DAYS[d.getDay()].slice(0,1)}
            </span>
            <span style={{ fontSize:18, fontWeight:900, lineHeight:1, color: isSel?'white':isTod?'#0F766E':dk?'#F1F5F9':'#111827' }}>
              {d.getDate()}
            </span>
            {hasDot
              ? <div style={{ width:4, height:4, borderRadius:'50%', background: isSel?'rgba(255,255,255,0.7)':'#0F766E', marginTop:1 }}/>
              : <div style={{ width:4, height:4 }}/>
            }
          </button>
        )
      })}
    </div>
  )
}

// ─── Sidebar card wrapper ─────────────────────────────────────────────────────
function SidebarCard({ title, titleColor, children, dk }: { title: string; titleColor?: string; children: React.ReactNode; dk: boolean }) {
  const t = theme(dk)
  return (
    <div style={{ background: t.cardBg, borderRadius:12, padding:'14px 16px', border:`1px solid ${t.cardBorder}` }}>
      <div style={{ fontSize:10, fontWeight:700, color: titleColor||(dk?t.textMuted:'#9CA3AF'), textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>{title}</div>
      {children}
    </div>
  )
}

// ─── NavBtn ───────────────────────────────────────────────────────────────────
function NavBtn({ dir, onClick, dk }: { dir:'prev'|'next'; onClick:()=>void; dk:boolean }) {
  const t = theme(dk)
  return (
    <button onClick={onClick}
      style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, border:`1.5px solid ${t.cardBorder}`, background: t.cardBg, color: t.textBody, cursor:'pointer', flexShrink:0, transition:'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background=t.cardBgAlt)}
      onMouseLeave={e => (e.currentTarget.style.background=t.cardBg)}>
      <Svg path={dir==='prev'?ICON_PATH.chevronL:ICON_PATH.chevronR} size={15} color={t.textBody} sw={2.5}/>
    </button>
  )
}

// ─── Elastic time grid — only renders hours where events exist ────────────────
function ElasticTimeGrid({ events, dk, onEventClick, today0, selectedDate }: {
  events: CalEvent[]; dk: boolean; onEventClick: (ev:CalEvent)=>void; today0: Date; selectedDate?: Date
}) {
  const t = theme(dk)
  const timedEvs  = events.filter(ev => ev._type==='job' && ev.scheduled_time)
  const untimedEvs= events.filter(ev => !(ev._type==='job' && ev.scheduled_time))

  // Compute elastic range
  let minHour = 9, maxHour = 17
  timedEvs.forEach(ev => {
    const h = parseInt(ev.scheduled_time!.split(':')[0])
    if (h < minHour) minHour = Math.max(6, h - 1)
    if (h >= maxHour) maxHour = Math.min(21, h + 2)
  })
  const HOURS = timedEvs.length > 0
    ? Array.from({length: maxHour - minHour}, (_,i) => minHour + i)
    : []
  const SLOT_H = 64

  return (
    <div>
      {/* All-day / no-time events */}
      {untimedEvs.length > 0 && (
        <div style={{ borderBottom:`2px solid ${t.cardBorder}`, padding:'8px 12px', background: t.calGridBg }}>
          <div style={{ fontSize:10, fontWeight:600, color: t.textSubtle, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>All day</div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {untimedEvs.map(ev => (
              <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="compact"
                onClick={() => onEventClick(ev)}
                isOverdue={isOverdueEvent(ev, today0)}/>
            ))}
          </div>
        </div>
      )}
      {/* Timed slots */}
      {HOURS.map(hour => {
        const label = hour<12?`${hour}am`:hour===12?'12pm':`${hour-12}pm`
        const slotEvs = timedEvs.filter(ev => parseInt(ev.scheduled_time!.split(':')[0])===hour)
        return (
          <div key={hour} style={{ display:'grid', gridTemplateColumns:'44px 1fr', height: SLOT_H, borderBottom:`1px solid ${t.calCellBorder}` }}>
            <div style={{ borderRight:`1px solid ${t.calCellBorder}`, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', paddingRight:8, paddingTop:4 }}>
              <span style={{ fontSize:10, fontWeight:600, color: t.textSubtle }}>{label}</span>
            </div>
            <div style={{ padding:'2px 6px', display:'flex', flexDirection:'column', gap:3 }}>
              {slotEvs.map(ev => (
                <EventChip key={ev.id} ev={ev} dk={dk} size="compact"
                  onClick={() => onEventClick(ev)}
                  isOverdue={isOverdueEvent(ev, today0)}/>
              ))}
            </div>
          </div>
        )
      })}
      {timedEvs.length === 0 && untimedEvs.length === 0 && (
        <div style={{ padding:'32px 20px', textAlign:'center', color: t.textSubtle, fontSize:13 }}>
          No events on this day
        </div>
      )}
    </div>
  )
}

// ─── Inner page (uses useSearchParams) ───────────────────────────────────────
function CalendarInner() {
  const router  = useRouter()
  const params  = useSearchParams()

  const [session, setSession] = useState<Session|null>(null)
  const [dk, setDk]           = useState(false)

  // view: 'day' | 'week' | 'month' — day is default (operational)
  const [view, setView]       = useState<'day'|'week'|'month'>('day')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [monthAgendaDate, setMonthAgendaDate] = useState<Date|null>(null)

  const [events, setEvents]         = useState<CalEvent[]>([])
  const [unscheduled, setUnscheduled] = useState<CalEvent[]>([])
  const [loading, setLoading]       = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent|null>(null)

  // Filters
  const [showJobs, setShowJobs]           = useState(true)
  const [showFollowups, setShowFollowups] = useState(true)

  // Mobile swipe
  const [touchStartX, setTouchStartX] = useState<number|null>(null)

  // Mark complete
  const [completing, setCompleting] = useState<string|null>(null)

  const t = theme(dk)
  const today0 = new Date(); today0.setHours(0,0,0,0)

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
    const to   = toDateKey(addDays(center, 60))
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
  const weekDays   = Array.from({length:7},(_,i)=>addDays(weekStart,i))
  const firstDay   = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay()
  const daysInMonth= new Date(selectedDate.getFullYear(), selectedDate.getMonth()+1, 0).getDate()
  const dotDates   = new Set(events.map(ev => { const d=getEventDate(ev); return d?toDateKey(d):null }).filter(Boolean) as string[])

  const weekGrouped = (() => {
    const map: Record<string,CalEvent[]> = {}
    weekDays.forEach(d => { map[toDateKey(d)] = [] })
    events.forEach(ev => {
      const d = getEventDate(ev); if (!d) return
      const k = toDateKey(d); if (map[k]) map[k].push(ev)
    })
    return map
  })()

  const todayKey   = toDateKey(new Date())
  const todayEvs   = events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===todayKey })
  const todayJobs  = todayEvs.filter(ev => ev._type==='job')
  const todayValue = todayJobs.reduce((s,ev)=>s+(ev.quoted_amount||0),0)
  const weekValue  = weekDays.reduce((sum,d) => {
    const evs = weekGrouped[toDateKey(d)]||[]
    return sum + evs.filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0)
  }, 0)

  const overdueEvs = events.filter(ev => isOverdueEvent(ev, today0))

  function applyFilters(evs: CalEvent[]): CalEvent[] {
    return evs.filter(ev => {
      if (ev._type==='job'      && !showJobs)      return false
      if (ev._type==='followup' && !showFollowups) return false
      return true
    })
  }

  const selectedDayEvs = applyFilters(
    events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===toDateKey(selectedDate) })
  )

  const agendaDate = monthAgendaDate||selectedDate
  const agendaEvs  = applyFilters(
    events.filter(ev => { const d=getEventDate(ev); return d&&toDateKey(d)===toDateKey(agendaDate) })
  )

  function navWeek(dir: number) { setSelectedDate(addDays(selectedDate, dir*7)) }
  function navDay(dir: number)  { setSelectedDate(addDays(selectedDate, dir)) }
  function goToday()            { setSelectedDate(new Date()); setMonthAgendaDate(null) }
  function selectDay(d: Date)   { setSelectedDate(d); setSelectedEvent(null); setMonthAgendaDate(d) }

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

  function openLead(id: string) {
    router.push(`/dashboard/pipeline/${id}?from=calendar`)
  }

  if (!session) return null

  // ── SHARED: Sidebar filter section ────────────────────────────────────────
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
              <span style={{ fontSize:13, fontWeight:600, color: t.textPri }}>{item.label}</span>
            </div>
            <ToggleSwitch on={item.on} onChange={item.set} dk={dk}/>
          </div>
        ))}
      </div>
    </SidebarCard>
  )

  // ── DESKTOP ────────────────────────────────────────────────────────────────
  const DesktopView = (
    <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden' }}>

      {/* Left sidebar */}
      <div style={{ width:210, flexShrink:0, borderRight:`1px solid ${t.cardBorder}`, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:10, background: t.calSidebar }}>
        {/* Overdue alert */}
        {overdueEvs.length > 0 && (
          <div style={{ background: t.overdueAlertBg, border:`1px solid ${t.overdueAlertBorder}`, borderRadius:12, padding:'11px 13px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#DC2626', flexShrink:0, boxShadow:'0 0 0 2px rgba(220,38,38,0.2)' }}/>
              <span style={{ fontSize:12, fontWeight:800, color: t.overdueText }}>{overdueEvs.length} overdue</span>
            </div>
            {overdueEvs.slice(0,3).map(ev => (
              <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                style={{ fontSize:12, color: t.overdueText, fontWeight:600, cursor:'pointer', padding:'2px 0 2px 13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                → {capName(ev.contact_name)}
              </div>
            ))}
            {overdueEvs.length > 3 && <div style={{ fontSize:11, color: t.overdueText, opacity:0.7, paddingLeft:13 }}>+{overdueEvs.length-3} more</div>}
          </div>
        )}

        {/* Filters */}
        {SidebarFilters}

        {/* Today stats */}
        <SidebarCard title="Today" dk={dk}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color: t.textSubtle }}>Jobs</span>
              <span style={{ fontSize:20, fontWeight:800, color:'#0F766E' }}>{todayJobs.length}</span>
            </div>
            <div style={{ height:1, background: t.cardBorder }}/>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, color: t.textSubtle }}>Value</span>
              <span style={{ fontSize:16, fontWeight:800, color:'#15803D' }}>${todayValue>0?todayValue.toLocaleString():'0'}</span>
            </div>
            {overdueEvs.length > 0 && (
              <>
                <div style={{ height:1, background: t.cardBorder }}/>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'#B91C1C' }}>Overdue</span>
                  <span style={{ fontSize:16, fontWeight:800, color:'#DC2626' }}>{overdueEvs.length}</span>
                </div>
              </>
            )}
          </div>
        </SidebarCard>

        {/* Unscheduled */}
        {unscheduled.length > 0 && (
          <SidebarCard title={`Needs Date (${unscheduled.length})`} titleColor="#D97706" dk={dk}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {unscheduled.slice(0,5).map(ev => (
                <div key={ev.id} onClick={() => router.push('/dashboard/pipeline/'+ev.id)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 9px', borderRadius:8, background: dk?'#2D1F00':'#FFFBEB', cursor:'pointer', border:'1px solid #FDE68A' }}
                  onMouseEnter={e => (e.currentTarget.style.background='#FEF3C7')}
                  onMouseLeave={e => (e.currentTarget.style.background= dk?'#2D1F00':'#FFFBEB')}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: t.textPri, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{capName(ev.contact_name)}</div>
                    <div style={{ fontSize:10, color:'#D97706', marginTop:1 }}>{ev.lead_status}</div>
                  </div>
                  <Svg path={ICON_PATH.chevronR} size={11} color="#D97706" sw={2.5}/>
                </div>
              ))}
              {unscheduled.length>5 && <div style={{ fontSize:11, color: t.textSubtle, textAlign:'center' }}>+{unscheduled.length-5} more</div>}
            </div>
          </SidebarCard>
        )}
      </div>

      {/* Center panel */}
      <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background: t.calGridBg }}>

        {/* Toolbar */}
        <div style={{ padding:'10px 16px', borderBottom:`1px solid ${t.cardBorder}`, display:'flex', alignItems:'center', gap:8, background: t.calToolbar, flexShrink:0, position:'sticky', top:0, zIndex:10 }}>
          <button onClick={goToday}
            style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, color: t.textPri, fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
            Today
          </button>
          <div style={{ display:'flex', gap:5 }}>
            <NavBtn dir="prev" onClick={() => view==='day'?navDay(-1):navWeek(-1)} dk={dk}/>
            <NavBtn dir="next" onClick={() => view==='day'?navDay(1):navWeek(1)} dk={dk}/>
          </div>
          <span style={{ fontSize:15, fontWeight:700, color: t.textPri }}>
            {view==='day'
              ? `${DAYS[selectedDate.getDay()]}, ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`
              : view==='week'
              ? `${SHORT_MONTHS[weekDays[0].getMonth()]} ${weekDays[0].getDate()} – ${SHORT_MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getDate()}, ${weekDays[6].getFullYear()}`
              : `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
            }
          </span>
          {(view==='day'||view==='week') && weekValue>0 && (
            <span style={{ fontSize:12, fontWeight:700, color:'#15803D', background: dk?'#052E16':'#DCFCE7', padding:'4px 10px', borderRadius:20, border:`1px solid ${dk?'#166534':'#86EFAC'}` }}>
              ${(view==='day' ? selectedDayEvs.filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0) : weekValue).toLocaleString()} {view==='day'?'today':'this week'}
            </span>
          )}
          <div style={{ flex:1 }}/>
          {/* Day / Week / Month toggle */}
          <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:`1.5px solid ${t.cardBorder}`, flexShrink:0 }}>
            {(['day','week','month'] as const).map(v => (
              <button key={v} onClick={() => { setView(v); if (v==='month') setMonthAgendaDate(selectedDate) }}
                style={{ padding:'5px 12px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background: view===v?'#0F766E':'transparent', color: view===v?'white': t.textMuted, textTransform:'capitalize' }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color: t.textSubtle, fontSize:14 }}>Loading…</div>
        ) : view==='day' ? (

          /* ── Day view ── */
          <div style={{ flex:1 }}>
            <ElasticTimeGrid events={selectedDayEvs} dk={dk} onEventClick={ev => setSelectedEvent(ev)} today0={today0} selectedDate={selectedDate}/>
          </div>

        ) : view==='week' ? (

          /* ── Week view ── */
          <div style={{ flex:1, overflowX:'auto' }}>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', borderBottom:`1px solid ${t.cardBorder}`, background: t.calDayHeader, position:'sticky', top:0, zIndex:9 }}>
              <div style={{ borderRight:`1px solid ${t.calCellBorder}` }}/>
              {weekDays.map(d => {
                const isTod = isToday(d)
                const isSel = isSameDay(d, selectedDate)
                const isWknd= isWeekend(d)
                return (
                  <div key={toDateKey(d)} onClick={() => { selectDay(d); setView('day') }}
                    style={{ padding:'10px 8px', textAlign:'center', borderRight:`1px solid ${t.calCellBorder}`, cursor:'pointer', background: isTod?t.calColToday:isWknd?t.calColWeekend:isSel?t.calColSelected:'transparent' }}>
                    <div style={{ fontSize:10, fontWeight:700, color: isTod?'#0F766E':isWknd?t.textSubtle:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{DAYS[d.getDay()]}</div>
                    <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'3px auto 0', background: isTod?'#0F766E':'transparent' }}>
                      <span style={{ fontSize:14, fontWeight:700, color: isTod?'white':isSel?'#0F766E': t.textPri }}>{d.getDate()}</span>
                    </div>
                    {dotDates.has(toDateKey(d))&&!isTod && <div style={{ width:4, height:4, borderRadius:'50%', background:'#0F766E', margin:'2px auto 0' }}/>}
                  </div>
                )
              })}
            </div>
            {/* Week event grid */}
            {(() => {
              const timedByDay: Record<string,CalEvent[]>   = {}
              const untimedByDay: Record<string,CalEvent[]> = {}
              weekDays.forEach(d => {
                const key = toDateKey(d)
                const evs = applyFilters(weekGrouped[key]||[])
                timedByDay[key]   = evs.filter(ev => ev._type==='job'&&ev.scheduled_time)
                untimedByDay[key] = evs.filter(ev => !(ev._type==='job'&&ev.scheduled_time))
              })
              // Elastic hour range
              const allTimed = Object.values(timedByDay).flat()
              let minH=9, maxH=17
              allTimed.forEach(ev => {
                const h = parseInt(ev.scheduled_time!.split(':')[0])
                if (h<minH) minH=Math.max(6,h-1)
                if (h>=maxH) maxH=Math.min(21,h+2)
              })
              const HOURS = allTimed.length>0 ? Array.from({length:maxH-minH},(_,i)=>minH+i) : []
              const SLOT_H = 60
              const hasUntimed = weekDays.some(d => untimedByDay[toDateKey(d)].length>0)
              return (
                <div>
                  {hasUntimed && (
                    <div style={{ display:'grid', gridTemplateColumns:'44px repeat(7,1fr)', borderBottom:`2px solid ${t.cardBorder}` }}>
                      <div style={{ borderRight:`1px solid ${t.calCellBorder}`, padding:'6px 4px', display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
                        <span style={{ fontSize:9, fontWeight:600, color: t.textSubtle, textTransform:'uppercase', marginTop:6 }}>All day</span>
                      </div>
                      {weekDays.map(d => {
                        const key=toDateKey(d); const evs=untimedByDay[key]||[]
                        const isTod=isToday(d); const isWknd=isWeekend(d)
                        return (
                          <div key={key} style={{ padding:'4px', borderRight:`1px solid ${t.calCellBorder}`, minHeight:36, background: isTod?t.calColToday:isWknd?t.calColWeekend:'transparent' }}>
                            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                              {evs.map(ev => (
                                <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="compact"
                                  onClick={() => { selectDay(d); setSelectedEvent(ev) }}
                                  isOverdue={isOverdueEvent(ev, today0)}/>
                              ))}
                            </div>
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
                          <span style={{ fontSize:10, fontWeight:600, color: t.textSubtle }}>{label}</span>
                        </div>
                        {weekDays.map(d => {
                          const key=toDateKey(d)
                          const isTod=isToday(d); const isSel=isSameDay(d,selectedDate); const isWknd=isWeekend(d)
                          const slotEvs=(timedByDay[key]||[]).filter(ev=>parseInt(ev.scheduled_time!.split(':')[0])===hour)
                          return (
                            <div key={key} style={{ borderRight:`1px solid ${t.calCellBorder}`, background: isTod?t.calColToday:isWknd?t.calColWeekend:isSel?t.calColSelected:'transparent', padding:'2px 3px' }}>
                              {slotEvs.map(ev => (
                                <EventChip key={ev.id} ev={ev} dk={dk} size="compact"
                                  onClick={() => { selectDay(d); setSelectedEvent(ev) }}
                                  isOverdue={isOverdueEvent(ev, today0)}/>
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
                          <div key={key} style={{ borderRight:`1px solid ${t.calCellBorder}`, minHeight:120, background: isTod?t.calColToday:isWknd?t.calColWeekend:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            {isWknd && <span style={{ fontSize:10, color: t.calEmptyText, textTransform:'uppercase', fontWeight:500, letterSpacing:'0.04em' }}>Free</span>}
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
                {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color: t.textMuted, padding:'4px 0', textTransform:'uppercase', letterSpacing:'0.06em' }}>{d}</div>)}
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
                      style={{ minHeight:70, padding:'5px', borderRadius:7, cursor:'pointer', border:`1.5px solid ${isSel?'#0F766E':t.calCellBorder}`, background: isTod?t.calColToday: t.cardBg, transition:'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background=t.calColSelected)}
                      onMouseLeave={e => (e.currentTarget.style.background=isTod?t.calColToday: t.cardBg)}>
                      <div style={{ fontSize:12, fontWeight: isTod?800:500, color: isTod?'#0F766E': t.textPri, marginBottom:3 }}>{day}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                        {dayEvs.slice(0,2).map(ev => (
                          <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="micro"
                            onClick={() => { setMonthAgendaDate(d); setSelectedEvent(ev) }}
                            isOverdue={isOverdueEvent(ev, today0)}/>
                        ))}
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
              <div style={{ padding:'11px 16px', borderBottom:`1px solid ${t.cardBorder}`, background: t.calToolbar, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:14, fontWeight:700, color: t.textPri }}>
                  {isToday(agendaDate)?'Today':`${DAYS[agendaDate.getDay()]}, ${SHORT_MONTHS[agendaDate.getMonth()]} ${agendaDate.getDate()}`}
                  {agendaEvs.length>0 && <span style={{ marginLeft:8, fontSize:12, color: t.textSubtle }}>{agendaEvs.length} event{agendaEvs.length!==1?'s':''}</span>}
                </span>
                {agendaEvs.length>0 && (
                  <span style={{ fontSize:13, fontWeight:700, color:'#15803D' }}>
                    ${agendaEvs.filter(ev=>ev._type==='job').reduce((s,ev)=>s+(ev.quoted_amount||0),0).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:7 }}>
                {agendaEvs.length===0
                  ? <div style={{ textAlign:'center', padding:'20px 0', color: t.textSubtle, fontSize:13 }}>No events on this day</div>
                  : agendaEvs.map(ev => (
                      <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="compact"
                        onClick={() => setSelectedEvent(ev)}
                        isOverdue={isOverdueEvent(ev, today0)}/>
                    ))
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right detail panel */}
      <div style={{ width: selectedEvent?330:0, flexShrink:0, borderLeft: selectedEvent?`1px solid ${t.cardBorder}`:'none', overflow:'hidden', transition:'width 0.2s ease' }}>
        {selectedEvent && (
          <DetailPanel ev={selectedEvent} onClose={() => setSelectedEvent(null)} onOpenLead={openLead} dk={dk} today0={today0}
            onMarkComplete={selectedEvent._type==='job'&&selectedEvent.lead_status==='Scheduled'?()=>markComplete(selectedEvent):undefined}
            completing={completing===selectedEvent.id}/>
        )}
      </div>
    </div>
  )

  // ── MOBILE ────────────────────────────────────────────────────────────────
  const MobileView = (
    <div style={{ display:'flex', flexDirection:'column', height:`calc(100vh - 60px)`, background: t.pageBg, overflow:'hidden' }}>

      {/* Sticky header — 2 rows only */}
      <div style={{ flexShrink:0, background: t.cardBg, borderBottom:`1px solid ${t.cardBorder}` }}>
        {/* Row 1: date + value + nav */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 16px 8px' }}>
          <button onClick={() => navDay(-1)}
            style={{ width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:12, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, cursor:'pointer', flexShrink:0 }}>
            <Svg path={ICON_PATH.chevronL} size={18} color={t.textBody} sw={2.5}/>
          </button>
          <div style={{ flex:1, textAlign:'center', cursor:'pointer' }} onClick={goToday}>
            <div style={{ fontSize:16, fontWeight:800, color: t.textPri, letterSpacing:'-0.2px' }}>
              {isToday(selectedDate) ? 'Today' : `${DAYS[selectedDate.getDay()]}, ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
            </div>
            <div style={{ fontSize:12, color: t.textSubtle, marginTop:1 }}>
              {isToday(selectedDate) ? `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}` : MONTHS[selectedDate.getMonth()]+' '+selectedDate.getFullYear()}
              {todayJobs.length>0 && isToday(selectedDate) && ` · ${todayJobs.length} job${todayJobs.length!==1?'s':''}`}
              {todayValue>0 && isToday(selectedDate) && ` · $${todayValue.toLocaleString()}`}
            </div>
          </div>
          <button onClick={() => navDay(1)}
            style={{ width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:12, border:`1.5px solid ${t.cardBorder}`, background: t.cardBgAlt, cursor:'pointer', flexShrink:0 }}>
            <Svg path={ICON_PATH.chevronR} size={18} color={t.textBody} sw={2.5}/>
          </button>
        </div>
        {/* Row 2: week strip */}
        <div style={{ padding:'0 12px 10px' }}>
          <WeekStrip selectedDate={selectedDate} dotDates={dotDates} onSelect={selectDay} dk={dk}/>
        </div>
      </div>

      {/* Overdue alert — compact, always above content */}
      {overdueEvs.length>0 && (
        <div style={{ flexShrink:0, margin:'8px 14px 0', padding:'9px 13px', background: t.overdueAlertBg, border:`1px solid ${t.overdueAlertBorder}`, borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'#DC2626', flexShrink:0 }}/>
          <span style={{ fontSize:13, fontWeight:700, color: t.overdueText, flex:1 }}>
            {overdueEvs.length} overdue — {overdueEvs.slice(0,2).map(e=>capName(e.contact_name)).join(', ')}{overdueEvs.length>2?` +${overdueEvs.length-2}`:''}
          </span>
        </div>
      )}

      {/* Scrollable day agenda */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px 14px', display:'flex', flexDirection:'column', gap:10 }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {loading ? (
          [1,2,3].map(i => <div key={i} style={{ height:80, borderRadius:12, background: t.cardBg }}/>)
        ) : selectedDayEvs.length===0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, paddingTop:32 }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background: dk?'rgba(15,118,110,0.15)':'#F0FDFA', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:17, fontWeight:800, color: t.textPri, marginBottom:5 }}>
                {isToday(selectedDate)?'Nothing scheduled today':'Nothing on this day'}
              </div>
              <div style={{ fontSize:14, color: t.textSubtle, lineHeight:1.5 }}>
                {unscheduled.length>0
                  ? `${unscheduled.length} lead${unscheduled.length!==1?'s':''} waiting to be scheduled`
                  : isToday(selectedDate) ? 'Open day — great time to follow up on leads' : 'No jobs or follow-ups'}
              </div>
            </div>
            {unscheduled.length>0 && (
              <button onClick={() => router.push('/dashboard/pipeline')}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#0F766E,#0D9488)', color:'white', fontSize:15, fontWeight:700, cursor:'pointer' }}>
                Schedule {unscheduled.length} lead{unscheduled.length!==1?'s':''} →
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize:13, fontWeight:600, color: t.textSubtle }}>
              {selectedDayEvs.length} event{selectedDayEvs.length!==1?'s':''} · {isToday(selectedDate)?'Today':`${DAYS[selectedDate.getDay()]} ${SHORT_MONTHS[selectedDate.getMonth()]} ${selectedDate.getDate()}`}
            </div>
            {selectedDayEvs.map(ev => (
              <EventChip key={ev.id+ev._type} ev={ev} dk={dk} size="full"
                onClick={() => setSelectedEvent(ev)}
                onMarkComplete={ev._type==='job'&&ev.lead_status==='Scheduled'?()=>markComplete(ev):undefined}
                completing={completing===ev.id}
                isOverdue={isOverdueEvent(ev, today0)}/>
            ))}
          </>
        )}

        {/* Unscheduled section — always below */}
        {unscheduled.length>0 && selectedDayEvs.length>0 && (
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#0F766E', marginBottom:8 }}>Needs scheduling ({unscheduled.length})</div>
            {unscheduled.slice(0,3).map(ev => (
              <div key={ev.id} onClick={() => router.push('/dashboard/pipeline/'+ev.id)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:11, background: t.cardBg, border:`1px solid ${t.cardBorder}`, marginBottom:8, cursor:'pointer' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color: t.textPri }}>{capName(ev.contact_name)}</div>
                  <div style={{ fontSize:12, color: t.textSubtle, marginTop:1 }}>{ev.lead_status}</div>
                </div>
                <Svg path={ICON_PATH.chevronR} size={13} color={t.textSubtle} sw={2.5}/>
              </div>
            ))}
            {unscheduled.length>3 && (
              <button onClick={() => router.push('/dashboard/pipeline')}
                style={{ width:'100%', padding:'11px', borderRadius:11, border:`1.5px dashed #0F766E`, background:'transparent', color:'#0F766E', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                +{unscheduled.length-3} more → Go to Pipeline
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile detail bottom sheet */}
      {selectedEvent && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
          onClick={() => setSelectedEvent(null)}>
          <div style={{ background:'rgba(0,0,0,0.5)', position:'absolute', inset:0 }}/>
          <div style={{ position:'relative', maxHeight:'82vh', borderRadius:'20px 20px 0 0', overflow:'hidden', background: t.cardBg, zIndex:1 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 0' }}>
              <div style={{ width:36, height:4, borderRadius:2, background: t.cardBorder }}/>
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
    </div>
  )

  return (
    <>
      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
      <DashboardShell session={session} newLeads={0} onAddLead={() => {}}
        darkMode={dk} onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}>
        <div className="hidden md:block">{DesktopView}</div>
        <div className="md:hidden">{MobileView}</div>
      </DashboardShell>
    </>
  )
}

// ─── Page export with Suspense (required for useSearchParams) ─────────────────
export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarInner/>
    </Suspense>
  )
}
