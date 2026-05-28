// app/api/leads/[id]/stage/route.ts
// PATCH /api/leads/[id]/stage
// Two-layer protection:
//   1. DB constraint: rejects completely unknown stage values
//   2. API: rejects stages valid globally but wrong for this lead's trade
// Writes to pipeline_events on every successful transition.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getTradeConfig } from '@/lib/trades/_registry'

type RouteParams = { params: Promise<{ id: string }> }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const { id: leadId } = await params
    if (!UUID_RE.test(leadId))
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })

    let body: unknown
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

    if (
      typeof body !== 'object' || body === null ||
      typeof (body as Record<string, unknown>).stage   !== 'string' ||
      typeof (body as Record<string, unknown>).pro_id  !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Body must include stage (string) and pro_id (string)' },
        { status: 400 }
      )
    }

    const { stage: newStage, pro_id } = body as { stage: string; pro_id: string }
    if (!UUID_RE.test(pro_id))
      return NextResponse.json({ error: 'Invalid pro_id' }, { status: 400 })

    const sb = getSupabaseAdmin()

    // ── Fetch lead — ownership enforced ──────────────────────────────────
    const { data: lead, error: fetchError } = await sb
      .from('leads')
      .select('id, lead_status, trade_slug, pro_id')
      .eq('id', leadId)
      .eq('pro_id', pro_id)
      .single()

    if (fetchError || !lead)
      return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })

    const currentStage = lead.lead_status as string
    const tradeSlug    = (lead.trade_slug as string | null) ?? ''
    const tradeConfig  = getTradeConfig(tradeSlug)

    // ── Layer 2: Trade-stage validation ──────────────────────────────────
    // Reject stages that are valid globally but wrong for this lead's trade
    const validStageKeys = new Set(tradeConfig.stages.map((s: { key: string }) => s.key))
    if (!validStageKeys.has(newStage)) {
      return NextResponse.json(
        { error: `Stage "${newStage}" is not valid for ${tradeConfig.displayName}. Valid stages: ${[...validStageKeys].join(', ')}` },
        { status: 422 }
      )
    }

    // No-op if already at this stage
    if (currentStage === newStage)
      return NextResponse.json({ success: true, leadId, from: currentStage, to: newStage, noop: true })

    // ── Server-side gate: insurance_approved requires insurance_claim=true ──
    if (newStage === 'insurance_approved') {
      const { data: rjd } = await sb
        .from('roofing_job_data')
        .select('insurance_claim, claim_status')
        .eq('lead_id', leadId)
        .maybeSingle()
      if (!rjd?.insurance_claim) {
        return NextResponse.json(
          { error: 'Mark this job as an insurance claim before moving to Insurance Approved.' },
          { status: 422 }
        )
      }
    }

    // ── Persist stage change ──────────────────────────────────────────────
    const { error: updateError } = await sb
      .from('leads')
      .update({
        lead_status:            newStage,
        updated_at:             new Date().toISOString(),
        lead_status_changed_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .eq('pro_id', pro_id)

    if (updateError) {
      console.error('[stage/route] update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to update stage' }, { status: 500 })
    }

    // ── Write to pipeline_events (immutable audit trail) ─────────────────
    try {
      await sb.from('pipeline_events').insert({
        lead_id:    leadId,
        pro_id,
        trade_slug: tradeSlug || null,
        event_type: 'stage_changed',
        event_data: { from: currentStage, to: newStage },
        actor_type: 'pro',
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      // Non-fatal — stage transition already committed
      console.error('[stage/route] pipeline_events error:', e)
    }

    // ── Queue auto-triggers (non-blocking) ───────────────────────────────
    await queueAutoTriggers(leadId, pro_id, newStage, tradeConfig.slug, sb)

    return NextResponse.json({ success: true, leadId, from: currentStage, to: newStage })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stage/route]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function queueAutoTriggers(
  leadId: string,
  proId: string,
  newStage: string,
  tradeSlug: string,
  sb: ReturnType<typeof getSupabaseAdmin>
) {
  const TRIGGERS: Record<string, string[]> = {
    proposal_signed: ['fire_deposit_stripe', 'send_proposal_signed_email'],
    job_won:         ['create_warranty_record', 'queue_review_request'],
  }
  const triggers = TRIGGERS[newStage] ?? []
  if (!triggers.length) return

  const rows = triggers.map(triggerName => ({
    lead_id:      leadId,
    pro_id:       proId,
    trigger_name: triggerName,
    stage:        newStage,
    trade_slug:   tradeSlug,
    status:       'pending',
    created_at:   new Date().toISOString(),
  }))

  const { error } = await sb.from('lead_trigger_log').insert(rows)
  if (error) console.error('[stage/route] trigger queue error:', error.message)
}
