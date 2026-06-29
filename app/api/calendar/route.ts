import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  const from  = searchParams.get('from')   // ISO date string
  const to    = searchParams.get('to')     // ISO date string

  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Fetch leads with scheduled_date in range
  const scheduledQ = sb
    .from('leads')
    .select('id,contact_name,contact_phone,contact_email,lead_status,lead_source,quoted_amount,scheduled_date,scheduled_time,follow_up_date,notes,message,created_at')
    .eq('pro_id', proId)
    .not('scheduled_date', 'is', null)
    .not('lead_status', 'in', '(Lost,Archived)')

  if (from) scheduledQ.gte('scheduled_date', from)
  if (to)   scheduledQ.lte('scheduled_date', to)

  // Fetch leads with follow_up_date in range
  const followupQ = sb
    .from('leads')
    .select('id,contact_name,contact_phone,contact_email,lead_status,lead_source,quoted_amount,scheduled_date,scheduled_time,follow_up_date,notes,message,created_at')
    .eq('pro_id', proId)
    .not('follow_up_date', 'is', null)
    .not('lead_status', 'in', '(Lost,Archived)')

  if (from) followupQ.gte('follow_up_date', from)
  if (to)   followupQ.lte('follow_up_date', to)

  // Fetch leads with inspection_date in range
  const inspectionQ = sb
    .from('leads')
    .select('id,contact_name,contact_phone,contact_email,lead_status,lead_source,quoted_amount,scheduled_date,scheduled_time,follow_up_date,inspection_date,notes,message,created_at')
    .eq('pro_id', proId)
    .not('inspection_date', 'is', null)
    .not('lead_status', 'in', '(Lost,Archived)')

  if (from) inspectionQ.gte('inspection_date', from)
  if (to)   inspectionQ.lte('inspection_date', to)

  // Unscheduled leads (Quoted or Contacted — need scheduling)
  const unscheduledQ = sb
    .from('leads')
    .select('id,contact_name,contact_phone,contact_email,lead_status,lead_source,quoted_amount,scheduled_date,scheduled_time,follow_up_date,notes,message,created_at')
    .eq('pro_id', proId)
    .in('lead_status', ['Quoted', 'Contacted'])
    .is('scheduled_date', null)
    .order('created_at', { ascending: false })
    .limit(10)

  const [scheduledRes, followupRes, unscheduledRes, inspectionRes] = await Promise.all([
    scheduledQ, followupQ, unscheduledQ, inspectionQ
  ])

  if (scheduledRes.error)   return NextResponse.json({ error: scheduledRes.error.message }, { status: 500 })
  if (followupRes.error)    return NextResponse.json({ error: followupRes.error.message }, { status: 500 })
  if (unscheduledRes.error) return NextResponse.json({ error: unscheduledRes.error.message }, { status: 500 })
  // Inspection events are non-fatal: if the column/query fails, still return jobs + followups
  if (inspectionRes.error)  console.log('[calendar] inspection query skipped:', inspectionRes.error.message)

  // Merge scheduled + followup + inspection — dedup by id+type so a lead with
  // multiple dates appears once per type (job on scheduled_date, followup on
  // follow_up_date, inspection on inspection_date)
  const seen = new Set<string>()
  const events: any[] = []

  for (const lead of (scheduledRes.data || [])) {
    const key = lead.id + ':job'
    if (!seen.has(key)) { seen.add(key); events.push({ ...lead, _type: 'job' }) }
  }
  for (const lead of (followupRes.data || [])) {
    const key = lead.id + ':followup'
    if (!seen.has(key)) { seen.add(key); events.push({ ...lead, _type: 'followup' }) }
  }
  for (const lead of (inspectionRes.data || [])) {
    const key = lead.id + ':inspection'
    if (!seen.has(key)) { seen.add(key); events.push({ ...lead, scheduled_time: null, _type: 'inspection' }) }
  }

  // ── Server-derived stats (single source; mobile paints, no client math) ──────
  // Per-period buckets keyed so the client can look up the active view+date with
  // zero arithmetic. Value basis = Σ quoted_amount over jobs+inspections,
  // toggle-independent (matches the web financial metric). Each event is also
  // tagged is_overdue so the chip accent + banner are a paint, not a derivation.
  const DONE = new Set(['Completed', 'Paid', 'job_won', 'Converted'])
  const eventDate = (ev: any): string | null => {
    const t = ev._type
    const ds = t === 'followup' ? (ev.follow_up_date ?? ev.scheduled_date)
      : t === 'inspection' ? ev.inspection_date
      : (ev.scheduled_date ?? ev.follow_up_date)
    return ds ? String(ds).slice(0, 10) : null
  }
  // Sunday-start week key. A calendar date's weekday is tz-invariant, so UTC math
  // here yields the same Sunday the client's local _startOfWeek does.
  const weekKeyOf = (ymd: string): string => {
    const [y, m, d] = ymd.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay())
    return dt.toISOString().slice(0, 10)
  }
  const todayKey = new Date().toISOString().slice(0, 10)

  type Bucket = { jobs: number; inspections: number; value: number; done: number }
  const mk = (): Bucket => ({ jobs: 0, inspections: 0, value: 0, done: 0 })
  const dayStats: Record<string, Bucket> = {}
  const weekStats: Record<string, Bucket> = {}
  const monthStats: Record<string, Bucket> = {}
  const overdue: { id: string; contact_name: string | null }[] = []

  for (const ev of events) {
    const dk = eventDate(ev)
    const isDone = DONE.has(ev.lead_status)
    ev.is_overdue = ev._type === 'followup' && !isDone && !!dk && dk < todayKey
    if (ev.is_overdue) overdue.push({ id: ev.id, contact_name: ev.contact_name ?? null })

    if (!dk || (ev._type !== 'job' && ev._type !== 'inspection')) continue
    const amt = Number(ev.quoted_amount) || 0
    const targets: [Record<string, Bucket>, string][] = [
      [dayStats, dk], [weekStats, weekKeyOf(dk)], [monthStats, dk.slice(0, 7)],
    ]
    for (const [map, key] of targets) {
      const b = (map[key] ??= mk())
      if (ev._type === 'job') { b.jobs++; if (isDone) b.done++ }
      else b.inspections++
      b.value += amt
    }
  }

  return NextResponse.json({
    events,
    unscheduled: unscheduledRes.data || [],
    stats: { day: dayStats, week: weekStats, month: monthStats },
    overdue,
    overdueCount: overdue.length,
  })
}
