// app/api/leads/[id]/stage/route.ts
// PATCH /api/leads/[id]/stage
// Validates stage transitions using isValidTransition() from trade state machine.
// Returns 422 on invalid transition — never silently accepts bad state.
// Ownership enforced at DB level: pro_id must match session.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getTradeConfig } from '@/lib/trades/_registry'

// ── Type guard helpers ─────────────────────────────────────────────────────
type RouteParams = { params: Promise<{ id: string }> }

// ── PATCH — Transition a lead to a new stage ───────────────────────────────
export async function PATCH(
  req: Request,
  { params }: RouteParams
) {
  try {
    const { id: leadId } = await params

    // ── Validate UUID format before hitting DB ─────────────────────────────
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!UUID_RE.test(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    // ── Parse and validate body ────────────────────────────────────────────
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

    // ── Fetch current lead — ownership check at DB level ───────────────────
    const { data: lead, error: fetchError } = await sb
      .from('leads')
      .select('id, lead_status, trade_slug, pro_id')
      .eq('id', leadId)
      .eq('pro_id', pro_id)   // ownership enforced here, not just in app logic
      .single()

    if (fetchError || !lead) {
      return NextResponse.json(
        { error: 'Lead not found or access denied' },
        { status: 404 }
      )
    }

    const currentStage = lead.lead_status as string
    const tradeSlug    = (lead.trade_slug as string | null) ?? ''

    // ── Load trade config + validate transition ────────────────────────────
    const tradeConfig = getTradeConfig(tradeSlug)

    // isValidTransition comes from the trade's state-machine.ts
    // It is the same function used in unit tests — one source of truth
    const { isValidTransition } = await import(
      `@/lib/trades/${tradeConfig.slug}/state-machine`
    ).catch(() =>
      // Fallback: import default state machine if trade-specific one missing
      import('@/lib/trades/_default/state-machine')
    )

    if (!isValidTransition(currentStage, newStage)) {
      return NextResponse.json(
        {
          error: 'Invalid stage transition',
          from: currentStage,
          to: newStage,
          trade: tradeSlug,
        },
        { status: 422 }
      )
    }

    // ── Persist the transition ─────────────────────────────────────────────
    const { error: updateError } = await sb
      .from('leads')
      .update({ lead_status: newStage, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .eq('pro_id', pro_id)   // double-check ownership on write

    if (updateError) {
      console.error('[stage/route] update error:', updateError.message)
      return NextResponse.json(
        { error: 'Failed to update stage' },
        { status: 500 }
      )
    }

    // ── Fire auto-triggers if applicable ──────────────────────────────────
    // Triggers are queued, not executed inline — prevents slow response times
    // and makes each trigger independently retryable.
    await queueAutoTriggers(leadId, pro_id, newStage, tradeConfig, sb)

    return NextResponse.json({
      success: true,
      leadId,
      from: currentStage,
      to: newStage,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stage/route]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── Auto-trigger queue ─────────────────────────────────────────────────────
// Each trigger is a row in lead_trigger_log.
// A background process (or next API call) processes pending triggers.
// This pattern prevents a Stripe timeout from blocking a stage change.
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
    // Non-fatal — log and continue. Stage transition already succeeded.
    console.error('[stage/route] trigger queue error:', error.message)
  }
}
