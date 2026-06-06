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

  return NextResponse.json({
    events,
    unscheduled: unscheduledRes.data || [],
  })
}
