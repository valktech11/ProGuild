// app/api/leads/[id]/stage/route.ts
// PATCH /api/leads/[id]/stage
// Three-layer protection:
//   1. DB constraint: rejects completely unknown stage values
//   2. API: rejects stages valid globally but wrong for this lead's trade
//   3. Roofing: rejects corruption-risky user moves (e.g. Job Won without a
//      paid invoice, Install Sched. without a signed proposal) via the canonical
//      stage rules. Action routes (sign, send, mark-paid, claim) set lead_status
//      directly and never pass through here, so they are unaffected.
// Writes to pipeline_events on every successful transition.

import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { auditedAdmin } from '@/lib/audit-context'
import { requirePro } from '@/lib/pro-auth'
import { getTradeConfig, isRoofing } from '@/lib/trades/_registry'
import { validateUserMove } from '@/lib/trades/roofing/stage-rules'
import { gatherRoofingStageContext } from '@/lib/trades/roofing/stage-context'
import type { RoofingStage } from '@/lib/trades/roofing/types'

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

    const { stage: newStage, pro_id, lost_reason, inspection_date, scheduled_date, scheduled_time } =
      body as { stage: string; pro_id: string; lost_reason?: string; inspection_date?: string; scheduled_date?: string; scheduled_time?: string }
    if (!UUID_RE.test(pro_id))
      return NextResponse.json({ error: 'Invalid pro_id' }, { status: 400 })

    // Verify the caller owns this pro_id (defense beyond the query-scope below).
    const __auth = await requirePro(req as NextRequest, pro_id)
    if (__auth.error || !__auth.proId) return __auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const _stageCompanyId = __auth.companyId

    const sb = auditedAdmin(req, { actorId: __auth.proId, actorType: 'pro' })

    // ── Fetch lead — ownership enforced ──────────────────────────────────
    const { data: lead, error: fetchError } = await sb
      .from('leads')
      .select('id, lead_status, trade_slug, pro_id, property_address, scheduled_date, inspection_date')
      .eq('id', leadId)
      .or(_stageCompanyId ? `company_id.eq.${_stageCompanyId},pro_id.eq.${pro_id}` : `pro_id.eq.${pro_id}`)
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

    // ── Layer 3: roofing move enforcement (canonical rules) ────────────────
    // Backstop for stale clients / direct API calls. Backward corrections and
    // gate-satisfying forward moves pass; jumping to an action-driven milestone
    // (e.g. Job Won without a paid invoice) is rejected. Action routes set the
    // stage directly and never reach this handler.
    if (isRoofing(tradeConfig)) {
      const { ctx } = await gatherRoofingStageContext(
        leadId, pro_id, currentStage as RoofingStage,
        {
          property_address: (lead.property_address as string | null) ?? null,
          scheduled_date:   (lead.scheduled_date as string | null) ?? null,
          inspection_date:  (lead.inspection_date as string | null) ?? null,
        },
      )
      const verdict = validateUserMove(ctx, newStage as RoofingStage)
      if (!verdict.ok) {
        return NextResponse.json(
          { error: verdict.reason ?? 'This stage move is not allowed right now.' },
          { status: 422 },
        )
      }
    }

    // ── Pre-resolve client_id for job_won so it folds into single leads write ──
    // Resolving here (reads only) guarantees client_id is written once alongside
    // the stage change — no second leads UPDATE for the same transition.
    let resolvedClientId: string | null = null
    if (newStage === 'job_won') {
      try {
        const { data: leadForClient } = await sb
          .from('leads')
          .select('client_id, contact_name, contact_phone, contact_email, property_address, contact_city, contact_state, contact_zip')
          .eq('id', leadId).single()

        if (leadForClient && !leadForClient.client_id && leadForClient.contact_name) {
          const streetOnly = leadForClient.property_address
            ? String(leadForClient.property_address).split(',')[0].trim() : null
          let clientId: string | null = null
          if (leadForClient.contact_phone) {
            const { data: byPhone } = await sb.from('clients').select('id')
              .eq(_stageCompanyId ? 'company_id' : 'pro_id', _stageCompanyId ?? pro_id).eq('phone', String(leadForClient.contact_phone).trim()).maybeSingle()
            if (byPhone) clientId = byPhone.id
          }
          if (!clientId && leadForClient.contact_email) {
            const { data: byEmail } = await sb.from('clients').select('id')
              .eq(_stageCompanyId ? 'company_id' : 'pro_id', _stageCompanyId ?? pro_id).eq('email', String(leadForClient.contact_email).toLowerCase().trim()).maybeSingle()
            if (byEmail) clientId = byEmail.id
          }
          if (!clientId) {
            const { data: newClient, error: clientErr } = await sb.from('clients').insert({
              pro_id:        pro_id,
              full_name:     String(leadForClient.contact_name).trim(),
              phone:         leadForClient.contact_phone ? String(leadForClient.contact_phone).trim() : null,
              email:         leadForClient.contact_email ? String(leadForClient.contact_email).toLowerCase().trim() : null,
              address_line1: streetOnly,
              city:          leadForClient.contact_city  ? String(leadForClient.contact_city).trim()  : null,
              state:         leadForClient.contact_state ? String(leadForClient.contact_state).trim() : null,
              zip:           leadForClient.contact_zip   ? String(leadForClient.contact_zip).trim()   : null,
            }).select('id').single()
            if (clientErr) console.error('[stage/route] client insert failed:', clientErr.message, clientErr.details)
            if (newClient) clientId = newClient.id
          }
          resolvedClientId = clientId
        }
      } catch (e) {
        console.error('[stage/route] job_won client pre-resolve error:', e)
      }
    }

    // ── Persist stage change — single leads write (client_id folded in) ───
    const updatePayload: Record<string, unknown> = {
      lead_status:            newStage,
      updated_at:             new Date().toISOString(),
      lead_status_changed_at: new Date().toISOString(),
    }
    const lostAnchor = tradeConfig.stageAnchors?.lost
    if ((newStage === lostAnchor || newStage === 'lost') && lost_reason) {
      updatePayload.lost_reason = lost_reason
    }
    if (resolvedClientId) updatePayload.client_id = resolvedClientId
    // Date fields from the stage prompt (inspection_date, scheduled_date) fold
    // into the single leads UPDATE — no separate patchLead call needed from mobile.
    if (inspection_date !== undefined) updatePayload.inspection_date = inspection_date
    if (scheduled_date  !== undefined) updatePayload.scheduled_date  = scheduled_date
    if (scheduled_time  !== undefined) updatePayload.scheduled_time  = scheduled_time

    const _stageRole = __auth.role
    const _updateScope = _stageRole === 'member'
      ? { col: 'assigned_to_pro_id', val: __auth.proId! }
      : _stageCompanyId
        ? { col: 'company_id', val: _stageCompanyId }
        : { col: 'pro_id', val: pro_id }
    const { data: updateData, error: updateError } = await sb
      .from('leads')
      .update(updatePayload)
      .eq('id', leadId)
      .eq(_updateScope.col, _updateScope.val)
      .select('id')

    if (updateError) {
      console.error('[stage/route] update error:', updateError.message)
      return NextResponse.json({ error: 'Failed to update stage: ' + updateError.message }, { status: 500 })
    }
    if (!updateData || (Array.isArray(updateData) && updateData.length === 0)) {
      console.error('[stage/route] update matched 0 rows — scope mismatch', { leadId, scope: _updateScope })
      return NextResponse.json({ error: 'Access denied: lead not in your scope' }, { status: 403 })
    }

    // Trigger review request on Job Won
    if (newStage === 'Job Won') {
      try {
        const { queueAndSendReviewRequest } = await import('@/lib/review')
        await queueAndSendReviewRequest({
          proId:     __auth.proId!,
          companyId: __auth.companyId ?? null,
          leadId,
        })
      } catch {}
    }

    // Notify owner when member wins a job
    if (newStage === 'Job Won' && __auth.companyId && __auth.role === 'member') {
      const { data: leadInfo } = await sb.from('leads').select('contact_name, property_address').eq('id', leadId).single()
      const { data: memberInfo } = await sb.from('pros').select('full_name').eq('id', pro_id).single()
      const { notifyOwners } = await import('@/lib/notifications')
      await notifyOwners(__auth.companyId, pro_id, {
        type: 'job_won',
        title: `Job Won by ${(memberInfo as any)?.full_name?.split(' ')[0] ?? 'team member'}`,
        body: (leadInfo as any)?.contact_name || (leadInfo as any)?.property_address || 'A job has been won',
        leadId,
      })
    }

    // ── Write to pipeline_events (immutable audit trail) ─────────────────
    try {
      await sb.from('pipeline_events').insert({
        lead_id:    leadId,
        pro_id,
        company_id: _stageCompanyId ?? null,
        trade_slug: tradeSlug || null,
        event_type: 'stage_changed',
        event_data: { from: currentStage, to: newStage, ...(lost_reason ? { lost_reason } : {}) },
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
    inspection_scheduled: ['send_status_link_email'],
    proposal_signed: ['fire_deposit_stripe', 'send_proposal_signed_email'],
    job_won:         ['create_warranty_record', 'queue_review_request'],
  }
  const triggers = TRIGGERS[newStage] ?? []
  if (!triggers.length) return

  // ── Active: fire status email immediately (non-blocking) ─────────────
  if (triggers.includes('send_status_link_email')) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://proguild.ai'
    fetch(`${siteUrl}/api/leads/send-status-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lead_id: leadId, pro_id: proId }),
    }).catch(e => console.error('[stage/route] status email fire error:', e))
  }

  // ── Active: upsert client record on job_won if still missing ─────────
  // NOTE: client_id resolution is now pre-computed above and folded into the
  // single leads UPDATE — no second write here. This block is intentionally empty.
  if (newStage === 'job_won') {
    // client_id already handled above via resolvedClientId → updatePayload
  }

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
