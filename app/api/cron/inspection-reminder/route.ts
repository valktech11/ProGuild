// GET /api/cron/inspection-reminder
// Runs daily at 08:00 UTC. Sends push + in-app notification to pros
// who have an inspection scheduled for tomorrow.
// Guards:
//   - Only fires for leads with inspection_date = tomorrow
//   - Only for active leads (not Lost/Archived/Completed)
//   - Deduped via pro_notifications (same proId + leadId + type within 24h)

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notify, sendPushToProId } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  // Tomorrow's date in YYYY-MM-DD
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowKey = tomorrow.toISOString().slice(0, 10)

  // Find all leads with inspection_date = tomorrow, not closed
  const { data: leads, error } = await sb
    .from('leads')
    .select('id, pro_id, company_id, contact_name, property_address, inspection_date, assigned_to_pro_id')
    .eq('inspection_date', tomorrowKey)
    .not('lead_status', 'in', '(Lost,Archived,Completed,Paid,job_won)')
    .not('pro_id', 'is', null)

  if (error) {
    console.error('[inspection-reminder] Query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0

  for (const lead of leads ?? []) {
    const label = lead.contact_name || lead.property_address || 'a job'
    const title = 'Inspection tomorrow'
    const body  = `Reminder: inspection at ${label} is scheduled for tomorrow`

    // Notify the pro who owns the lead
    const recipientIds = new Set<string>([lead.pro_id])
    // Also notify assigned member if different
    if (lead.assigned_to_pro_id && lead.assigned_to_pro_id !== lead.pro_id) {
      recipientIds.add(lead.assigned_to_pro_id)
    }

    for (const proId of recipientIds) {
      try {
        // Dedup: skip if already notified for this lead today
        const { data: existing } = await sb
          .from('pro_notifications')
          .select('id')
          .eq('pro_id', proId)
          .eq('lead_id', lead.id)
          .eq('type', 'new_lead_created') // reuse closest type
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
        console.error('[inspection-reminder] Failed for pro', proId, e)
      }
    }
  }

  console.log(`[inspection-reminder] sent=${sent} skipped=${skipped}`)
  return NextResponse.json({ ok: true, sent, skipped, date: tomorrowKey })
}
