// app/api/cron/hvac-maintenance-reminders/route.ts
// Runs daily at 13:00 UTC (8AM ET / 9AM ET DST).
//
// For every pending hvac_maintenance_reminder where due_date is exactly 30 days away:
//   1. Creates a pre-filled lead (issue_type=maintenance, contact from clients row)
//   2. PATCHes the reminder status → Scheduled with scheduled_lead_id
//
// For overdue reminders (due_date < today, still Pending, notified_at null):
//   Marks status → Notified and sets notified_at — surfaces in morning brief eventually.
//
// Idempotent: skips reminders that already have scheduled_lead_id set.
// Auth: CRON_SECRET bearer token (Vercel Cron standard). preview=1 bypasses for manual QA.

export const runtime    = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const EQUIP_TYPE_TO_SYSTEM: Record<string, string> = {
  AC_Unit:      'split_ac',
  Heat_Pump:    'heat_pump',
  Furnace:      'furnace',
  Mini_Split:   'mini_split',
  Air_Handler:  'split_ac',
  Boiler:       'furnace',
  Other:        'split_ac',
}

export async function GET(req: NextRequest) {
  const secret  = req.headers.get('authorization')
  const preview = new URL(req.url).searchParams.get('preview') === '1'
  const dryRun  = new URL(req.url).searchParams.get('dry_run') === 'true'

  if (!preview && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayISO = today.toISOString().slice(0, 10)

  // 30 days from today — this is the auto-schedule window
  const target = new Date(today)
  target.setDate(target.getDate() + 30)
  const targetISO = target.toISOString().slice(0, 10)

  // ── 1. Find pending reminders due in exactly 30 days, not yet auto-scheduled ─
  const { data: upcoming, error: upErr } = await sb
    .from('hvac_maintenance_reminders')
    .select(`
      id, pro_id, client_id, equipment_id, due_date, scheduled_lead_id,
      hvac_equipment(id, equipment_type, brand, model_number, filter_size),
      clients(id, full_name, phone, email, address_line1, city, state, zip)
    `)
    .eq('status', 'Pending')
    .eq('due_date', targetISO)
    .is('scheduled_lead_id', null)
    .limit(200)

  if (upErr) {
    console.error('[cron/hvac-maintenance-reminders] upcoming query error:', upErr.message)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // ── 2. Find overdue reminders (due_date < today, still Pending, not notified) ─
  const { data: overdue, error: ovErr } = await sb
    .from('hvac_maintenance_reminders')
    .select('id, pro_id, due_date')
    .eq('status', 'Pending')
    .lt('due_date', todayISO)
    .is('notified_at', null)
    .limit(200)

  if (ovErr) {
    console.error('[cron/hvac-maintenance-reminders] overdue query error:', ovErr.message)
    return NextResponse.json({ error: ovErr.message }, { status: 500 })
  }

  const results = {
    target_date:        targetISO,
    today:              todayISO,
    dry_run:            dryRun,
    upcoming_found:     upcoming?.length ?? 0,
    overdue_found:      overdue?.length  ?? 0,
    leads_created:      0,
    reminders_scheduled:0,
    reminders_notified: 0,
    errors:             [] as string[],
  }

  // ── 3. Auto-create leads for upcoming reminders ───────────────────────────────
  for (const reminder of (upcoming || [])) {
    const eq     = (reminder as any).hvac_equipment
    const client = (reminder as any).clients

    const scope = [
      'Annual HVAC maintenance —',
      eq ? ((eq.brand || '') + ' ' + (EQUIP_TYPE_TO_SYSTEM[eq.equipment_type] ? eq.equipment_type.replace('_', ' ') : 'unit')).trim() : 'service call',
      eq?.model_number ? `(${eq.model_number})` : '',
      `· due ${reminder.due_date}`,
    ].filter(Boolean).join(' ')

    if (dryRun) {
      console.log('[dry-run] would create lead for reminder', reminder.id, '— client:', client?.full_name, '— due:', reminder.due_date)
      results.leads_created++
      continue
    }

    // Build a dispatch address from the client record so the tech knows where
    // to go — the whole point of an auto-scheduled maintenance visit.
    const propertyAddress = [client?.address_line1, client?.city, client?.state, client?.zip]
      .filter(Boolean).join(', ') || null

    // Insert lead. Source is 'Manual' (system-generated, not a real phone call)
    // so these don't inflate phone-call lead metrics. A dedicated
    // 'Maintenance_Plan' source would need a lead_source CHECK-constraint
    // migration first (allowed values are fixed in the DB).
    const { data: lead, error: leadErr } = await sb
      .from('leads')
      .insert({
        pro_id:           reminder.pro_id,
        client_id:        reminder.client_id || null,
        contact_name:     client?.full_name  || 'Maintenance Customer',
        contact_phone:    client?.phone      || null,
        contact_email:    client?.email      || null,
        property_address: propertyAddress,
        contact_city:     client?.city  || null,
        contact_state:    client?.state || null,
        contact_zip:      client?.zip   || null,
        message:          scope,
        lead_source:      'Manual',
        is_manual:        true,
        lead_status:      'new_call',    // HVAC initial stage
        trade_slug:       'hvac-technician', // required — stage route validates against lead.trade_slug
      })
      .select('id')
      .single()

    if (leadErr || !lead) {
      console.error('[cron/hvac-maintenance-reminders] lead insert error:', leadErr?.message)
      results.errors.push(`reminder ${reminder.id}: lead insert — ${leadErr?.message}`)
      continue
    }
    results.leads_created++

    // Insert hvac_job_data row
    await sb.from('hvac_job_data').insert({
      lead_id:    lead.id,
      pro_id:     reminder.pro_id,
      issue_type: 'maintenance',
      system_type: eq ? (EQUIP_TYPE_TO_SYSTEM[eq.equipment_type] || 'split_ac') : null,
    })

    // Mark reminder Scheduled
    const { error: patchErr } = await sb
      .from('hvac_maintenance_reminders')
      .update({ status: 'Scheduled', scheduled_lead_id: lead.id })
      .eq('id', reminder.id)

    if (patchErr) {
      console.error('[cron/hvac-maintenance-reminders] reminder patch error:', patchErr.message)
      results.errors.push(`reminder ${reminder.id}: patch — ${patchErr.message}`)
    } else {
      results.reminders_scheduled++
    }
  }

  // ── 4. Mark overdue reminders as Notified ─────────────────────────────────────
  if (!dryRun && overdue && overdue.length > 0) {
    const overdueIds = overdue.map((r: any) => r.id)
    const { error: notifyErr } = await sb
      .from('hvac_maintenance_reminders')
      .update({ status: 'Notified', notified_at: new Date().toISOString() })
      .in('id', overdueIds)

    if (notifyErr) {
      console.error('[cron/hvac-maintenance-reminders] notified update error:', notifyErr.message)
      results.errors.push(`overdue batch: ${notifyErr.message}`)
    } else {
      results.reminders_notified = overdue.length
    }
  } else if (dryRun) {
    results.reminders_notified = overdue?.length ?? 0
  }

  console.log('[cron/hvac-maintenance-reminders] done', JSON.stringify(results))
  return NextResponse.json(results)
}
