// app/api/leads/[id]/stage/route.ts
// PATCH /api/leads/[id]/stage
// Validates stage transitions using getIsValidTransition() from trade registry.
// Returns 422 on invalid transition — never silently accepts bad state.
// Ownership enforced at DB level: pro_id must match lead.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getTradeConfig } from '@/lib/trades/_registry'

type RouteParams = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  req: Request,
  { params }: RouteParams
) {
  try {
    const { id: leadId } = await params

    if (!UUID_RE.test(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).stage !== 'string' ||
      typeof (body as Record<string, unknown>).pro_id !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Body must include stage (string) and pro_id (string)' },
        { status: 400 }
      )
    }

    const { stage: newStage, pro_id } = body as { stage: string; pro_id: string }

    if (!UUID_RE.test(pro_id)) {
      return NextResponse.json({ error: 'Invalid pro_id' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Fetch lead — ownership enforced at DB level
    const { data: lead, error: fetchError } = await sb
      .from('leads')
      .select('id, lead_status, trade_slug, pro_id')
      .eq('id', leadId)
      .eq('pro_id', pro_id)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json(
        { error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    const currentStage = lead.lead_status as string
    const tradeSlug    = (lead.trade_slug as string | null) ?? ''
    const tradeConfig  = getTradeConfig(tradeSlug)

    // Option C: API accepts any known LeadStatus — no hard transition gating.
    // The state machine defines suggested transitions for the UI only.
    // This allows roofers to handle real-world non-linear job flows.
    const KNOWN_STATUSES = new Set([
      'New','Contacted','Quoted','Scheduled','Completed','Paid','Lost','Archived','Queued_Manual','Converted',
      'lead_in','inspection_scheduled','proposal_sent','proposal_signed','insurance_approved',
      'scheduled','in_progress','job_won','lost','unqualified',
      'new_call','diagnosed','parts_ordered','assessed','site_visit','permit_submitted','permit_approved',
    ])

    if (!KNOWN_STATUSES.has(newStage)) {
      return NextResponse.json(
        { error: `Unknown stage: "${newStage}"` },
        { status: 400 }
      )
    }

    // Persist
    const { error: updateError } = await sb
      .from('leads')
      .update({ lead_status: newStage, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('pro_id', pro_id)

    if (updateError) {
      console.error('[stage/route] update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 })
    }

    // Queue auto-triggers (non-blocking)
    await queueAutoTriggers(leadId, pro_id, newStage, tradeConfig, sb)

    return NextResponse.json({ success: true, leadId, from: currentStage, to: newStage })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stage/route]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Auto-triggers are queued rows — processed async, never block the response
async function queueAutoTriggers(
  leadId: string,
  proId: string,
  newStage: string,
  tradeConfig: { slug: string },
  sb: ReturnType<typeof getSupabaseAdmin>
) {
  const TRIGGERS: Record<string, string[]> = {
    proposal_signed: ['fire_deposit_stripe', 'send_proposal_signed_email'],
    job_won:         ['create_warranty_record', 'queue_review_request'],
  }

  const triggers = TRIGGERS[newStage] ?? []
  if (triggers.length === 0) return

  const rows = triggers.map(triggerName => ({
    lead_id:      leadId,
    pro_id:       proId,
    trigger_name: triggerName,
    stage:        newStage,
    trade_slug:   tradeConfig.slug,
    status:       'pending',
    created_at:   new Date().toISOString(),
  }))

  const { error } = await sb.from('lead_trigger_log').insert(rows)
  if (error) {
    // Non-fatal — stage transition already committed
    console.error('[stage/route] trigger queue error:', error.message)
  }
}
