// GET /api/cron/inspection-reminder
// Runs daily at 08:00 UTC. Sends push + in-app notification to pros
// who have an inspection OR job scheduled for tomorrow.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notify, sendPushToProId } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = tomorrow.toISOString().slice(0, 10)

  // ── Inspection reminders ──────────────────────────────────────────────────
  const { data: inspLeads } = await sb
    .from('leads')
    .select('id, pro_id, company_id, contact_name, property_address, assigned_to_pro_id')
    .eq('inspection_date', tomorrowKey)
    .not('lead_status', 'in', '(Lost,Archived,Completed,Paid,job_won)')
    .not('pro_id', 'is', null)

  // ── Job date reminders ────────────────────────────────────────────────────
  const { data: jobLeads } = await sb
    .from('leads')
    .select('id, pro_id, company_id, contact_name, property_address, assigned_to_pro_id')
    .eq('scheduled_date', tomorrowKey)
    .not('lead_status', 'in', '(Lost,Archived,Completed,Paid,job_won)')
    .not('pro_id', 'is', null)

  let sent = 0
  let skipped = 0

  async function sendReminder(
    lead: any,
    title: string,
    body: string,
    typeKey: string
  ) {
    const recipientIds = new Set<string>([lead.pro_id])
    if (lead.assigned_to_pro_id && lead.assigned_to_pro_id !== lead.pro_id) {
      recipientIds.add(lead.assigned_to_pro_id)
    }

    for (const proId of recipientIds) {
      try {
        // Dedup: skip if already notified for this lead + title within 24h
        const { data: existing } = await sb
          .from('pro_notifications')
          .select('id')
          .eq('pro_id', proId)
          .eq('lead_id', lead.id)
          .eq('title', title)
          .gte('created_at', new Date(Date.now() - 86400000).toISOString())
          .limit(1)
          .maybeSingle()

        if (existing) { skipped++; continue }

        await notify({
          proId,
          companyId: lead.company_id ?? null,
          type:      'new_lead_created',
          title,
          body,
          leadId:    lead.id,
        })

        void sendPushToProId(proId, title, body)
        sent++
      } catch (e) {
        console.error(`[${typeKey}-reminder] Failed for pro`, proId, e)
      }
    }
  }

  for (const lead of inspLeads ?? []) {
    const label = lead.contact_name || lead.property_address || 'a job'
    await sendReminder(
      lead,
      'Inspection tomorrow',
      `Reminder: Inspection at ${label} is scheduled for tomorrow`,
      'inspection'
    )
  }

  for (const lead of jobLeads ?? []) {
    const label = lead.contact_name || lead.property_address || 'a job'
    await sendReminder(
      lead,
      'Job scheduled tomorrow',
      `Reminder: Job at ${label} is scheduled for tomorrow`,
      'job'
    )
  }

  console.log(`[reminders] date=${tomorrowKey} sent=${sent} skipped=${skipped}`)
  return NextResponse.json({ ok: true, sent, skipped, date: tomorrowKey })
}

