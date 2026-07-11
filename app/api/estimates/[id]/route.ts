import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { auditedAdmin } from '@/lib/audit-context'
import { requirePro } from '@/lib/pro-auth'
import { getStageAnchors } from '@/lib/trades/_registry'
import { computeMilestones } from '@/lib/estimates/milestones'
import { computeEstimateTotals } from '@/lib/estimates/totals'
import { syncLabourCacheFromEstimate } from '@/lib/roofing/labour-cache'
import { CALCULATOR_LINE_NAMES, LABOUR_LINE_NAME } from '@/lib/roofing/calculator'

// Always read fresh from the database — never serve a cached response.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// ── GET /api/estimates/[id] ──────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // ── Fetch estimate + related data as separate queries (no joins = no join failures) ──
  const { data: estimate, error } = await sb
    .from('estimates')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !estimate) {
    // Log full error details for debugging
    console.error('[estimates GET] id:', id, 'error:', JSON.stringify(error), 'hasData:', !!estimate)
    return NextResponse.json({ 
      error: error?.message ?? 'Estimate not found',
      code: error?.code,
      hint: error?.hint,
      details: error?.details,
    }, { status: 404 })
  }

  // Parallel fetch of all related data — each can fail independently without killing the response
  const [itemsRes, proRes, leadRes, roofingRes] = await Promise.all([
    sb.from('estimate_items').select('*').eq('estimate_id', id),
    sb.from('pros').select('trade_slug, full_name, phone_cell, city, state, signature_r2_key').eq('id', estimate.pro_id).maybeSingle(),
    estimate.lead_id
      ? sb.from('leads').select('property_address, contact_phone, contact_email, contact_name').eq('id', estimate.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.from('roofing_estimate_data').select('estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct').eq('estimate_id', id).maybeSingle(),
  ])

  const items   = (itemsRes.data ?? []).map((item: any) => ({
    id:          item.id,
    name:        item.name        ?? item.description ?? '',
    description: item.description ?? item.name        ?? '',
    qty:         item.qty         ?? item.quantity     ?? 1,
    unit_price:  item.unit_price  ?? 0,
    amount:      item.amount      ?? item.total        ?? 0,
    sort_order:  item.sort_order  ?? 0,
  }))
  const pro:     any = proRes.data     ?? {}
  const lead:    any = (leadRes as any).data ?? {}
  const roofing: any = roofingRes.data ?? {}

  // Build approval timeline from status fields
  const timeline = buildTimeline(estimate)

  // pro, lead, roofing are now fetched separately above
  const estClean = estimate as any

  const tradeSlugResolved = estClean.trade_slug ?? pro.trade_slug ?? null

  // Fetch roofing_job_data — always fetch when lead_id present
  // Also fetch leads.lead_status as insurance fallback (stage=insurance_approved implies insurance job)
  let roofingJobData: any = null
  if (estClean.lead_id) {
    const { data: rd, error: rdErr } = await sb
      .from('roofing_job_data')
      .select('square_count, pitch, waste_pct, insurance_claim, approved_amount, deductible, supplement_amount, insurance_company, claim_number, adjuster_name, claim_status')
      .eq('lead_id', estClean.lead_id)
      .maybeSingle()
      // Fallback: if no roofing_job_data row, check lead_status — insurance_approved stage means it IS an insurance job
    if (!rd) {
      const { data: leadRow } = await sb
        .from('leads')
        .select('lead_status')
        .eq('id', estClean.lead_id)
        .maybeSingle()
      const isInsuranceStage = leadRow?.lead_status === 'insurance_approved'
      roofingJobData = isInsuranceStage ? { insurance_claim: true } : null
    } else {
      roofingJobData = rd
    }
  }

  // Subtotal/tax/total come from the ONE calculator (lib/estimates/totals).
  // Tiered estimate → the SELECTED tier's subtotal; standard → sum of items.
  // This is the same function the save path uses, so the detail endpoint, the
  // list/summary endpoints, and the save path can never return different totals.
  // (Previously this re-summed items for every estimate, which was wrong for
  // tiered estimates and made mobile show a different number than web.)
  const { subtotal: derivedSubtotal, tax_amount: derivedTax, total: derivedTotal } =
    computeEstimateTotals({
      estimate_type: roofing.estimate_type,
      tiered_data:   roofing.tiered_data,
      items,
      tax_rate:      estClean.tax_rate,
    })

  // Server-derived line classification — single source for web AND mobile so the
  // calculator-owned line names live in ONE place (lib/roofing/calculator.ts).
  const customItems = items.filter((i: any) =>
    !CALCULATOR_LINE_NAMES.includes(String(i.name ?? i.description ?? '')))
  const labourLine = items.find((i: any) =>
    String(i.name ?? i.description ?? '') === LABOUR_LINE_NAME)
  const labourAmount = labourLine ? (Number(labourLine.amount) || 0) : 0

  return NextResponse.json({
    estimate: {
      ...estClean,
      items,  // from separate estimate_items query
      custom_items:  customItems,   // hand-added lines (not calculator-owned)
      labour_amount: labourAmount,  // amount on the 'Labour & installation' line
      // Always derive money from items — never trust stale DB columns
      subtotal:   derivedSubtotal,
      tax_amount: derivedTax,
      total:      derivedTotal,
      timeline,
      trade_slug:    tradeSlugResolved,
      // Pro info
      pro_name:      pro.full_name  ?? null,
      pro_phone:     pro.phone_cell ?? null,
      pro_city:      pro.city       ?? null,
      pro_signature: pro.signature_r2_key ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''}/${pro.signature_r2_key}` : null,
      pro_state:     pro.state      ?? null,
      // ── Roofing estimate data — source of truth: roofing_estimate_data only ──
      // estClean fallbacks removed — columns dropped from estimates in v95
      estimate_type:      roofing.estimate_type      ?? 'tiered',
      tiered_data:        roofing.tiered_data        ?? null,
      scope_of_work:      roofing.scope_of_work      ?? null,
      // Milestones are ALWAYS computed from the authoritative total (single source
      // of truth: lib/estimates/milestones). Never return the stored value — it can
      // go stale when the total changes via a path that didn't resave milestones.
      payment_milestones: computeMilestones(derivedTotal),
      // Property address — roofing_estimate_data → lead (estimates column dropped)
      property_address:   lead.property_address ?? roofing.property_address ?? null,  // lead is golden source
      // Measurements — roofing_estimate_data first, then roofing_job_data (live job data)
      square_count:  roofing.square_count ?? roofingJobData?.square_count ?? null,
      pitch:         roofing.pitch        ?? roofingJobData?.pitch        ?? null,
      waste_pct:     roofing.waste_pct    ?? roofingJobData?.waste_pct    ?? null,
      // Contact info — prefer lead (live source of truth), fall back to estimate copy
      contact_email: lead.contact_email ?? estClean.contact_email ?? null,
      contact_phone: lead.contact_phone ?? estClean.contact_phone ?? null,
      lead_name:     lead.contact_name  ?? estClean.lead_name     ?? null,
      // Insurance (always from roofing_job_data — live claim state)
      insurance_claim:   roofingJobData?.insurance_claim || !!(roofingJobData?.claim_number || roofingJobData?.approved_amount) || false,
      approved_amount:   roofingJobData?.approved_amount   ?? null,
      claim_status:      roofingJobData?.claim_status       ?? null,
      deductible:        roofingJobData?.deductible         ?? null,
      supplement_amount: roofingJobData?.supplement_amount ?? null,
      insurance_company: roofingJobData?.insurance_company ?? null,
      claim_number:      roofingJobData?.claim_number       ?? null,
      adjuster_name:     roofingJobData?.adjuster_name      ?? null,
    }
  })
}

// ── PATCH /api/estimates/[id] ────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // IDOR fix: this route previously had no auth guard and updated estimates by
  // id alone. Now server-derives proId and scopes all writes to the owning pro.
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error || !__auth.proId) return __auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const proId = __auth.proId
  const body = await req.json()
  const sb = auditedAdmin(req, { actorId: proId, actorType: 'pro' })

  // Ownership check: confirm the estimate belongs to this pro before any write.
  const { data: ownerRow, error: ownerErr } = await sb
    .from('estimates').select('pro_id').eq('id', id).single()
  if (ownerErr || !ownerRow) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  if (ownerRow.pro_id !== proId) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const {
    items, subtotal, discount, discount_type, tax_rate, tax_amount, total,
    require_deposit, deposit_percent, terms, status, notes,
    contact_phone, contact_email, sent_at,
    voided_at, void_reason, declined_at, decline_reason,
    // Roofing-specific — written to roofing_estimate_data, NOT estimates
    estimate_type, tiered_data, scope_of_work, payment_milestones,
    property_address, square_count, pitch, waste_pct,
  } = body

  // ── Universal estimate fields → estimates table ──────────────────────────
  // CRITICAL: only include fields explicitly present in payload
  // Undefined values would null out existing DB data (e.g. total → 0)
  // ── Authoritative computed values to return (Slice 1) ────────────────────────
  // Whichever derivation path runs (tiered sync or standard recompute) records the
  // final numbers here so the client can render them without a re-fetch. dollars
  // are the canonical money values; *_cents are integer cents (money contract).
  const computed: {
    subtotal?: number; tax_amount?: number; total?: number;
    subtotal_cents?: number; tax_amount_cents?: number; total_cents?: number;
    items?: { id: string; amount: number; amount_cents: number }[];
    tiered_data?: { selected_tier?: string; tiers: { key: string; subtotal: number; subtotal_cents: number }[] };
    payment_milestones?: { id: string; name: string; pct: number; due_when: string; amount: number }[];
  } = {}
  const toCents = (n: number) => Math.round(n * 100)

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (subtotal        !== undefined) updatePayload.subtotal        = subtotal
  if (discount        !== undefined) updatePayload.discount        = discount
  if (discount_type   !== undefined) updatePayload.discount_type   = discount_type
  if (tax_rate        !== undefined) updatePayload.tax_rate        = tax_rate
  if (tax_amount      !== undefined) updatePayload.tax_amount      = tax_amount
  if (total           !== undefined) updatePayload.total           = total
  if (require_deposit !== undefined) updatePayload.require_deposit = require_deposit
  if (deposit_percent !== undefined) updatePayload.deposit_percent = deposit_percent
  if (terms           !== undefined) updatePayload.terms           = terms
  if (status          !== undefined) updatePayload.status          = status
  if (notes           !== undefined) updatePayload.notes           = notes
  if (contact_phone   !== undefined) updatePayload.contact_phone   = contact_phone || null
  if (contact_email   !== undefined) updatePayload.contact_email   = contact_email || null
  if (sent_at         !== undefined) updatePayload.sent_at         = sent_at
  if (voided_at       !== undefined) updatePayload.voided_at       = voided_at
  if (void_reason     !== undefined) updatePayload.void_reason     = void_reason
  if (declined_at     !== undefined) updatePayload.declined_at     = declined_at
  if (decline_reason  !== undefined) updatePayload.decline_reason  = decline_reason

  // NOTE: estimates UPDATE is deferred to a single write at the end of this
  // handler so one logical save produces exactly one estimates audit row.
  // The authoritative total (tiered or standard) is folded into updatePayload
  // before that single write, replacing any client-sent total.

  // ── Roofing-specific fields → roofing_estimate_data ──────────────────────
  // Only upsert if any roofing field is present in the payload
  const hasRoofingFields = [
    estimate_type, tiered_data, scope_of_work, payment_milestones,
    property_address, square_count, pitch, waste_pct,
  ].some(v => v !== undefined)

  if (hasRoofingFields) {
    // Need pro_id for RLS — fetch from estimate
    const { data: estRow } = await sb.from('estimates').select('pro_id, tax_rate').eq('id', id).single()
    if (estRow?.pro_id) {
      const roofingPayload: Record<string, unknown> = {
        estimate_id: id,
        pro_id:      estRow.pro_id,
        updated_at:  new Date().toISOString(),
      }
      if (estimate_type      !== undefined) roofingPayload.estimate_type      = estimate_type
      if (tiered_data        !== undefined) roofingPayload.tiered_data        = tiered_data
      if (scope_of_work      !== undefined) roofingPayload.scope_of_work      = scope_of_work
      if (payment_milestones !== undefined) roofingPayload.payment_milestones = payment_milestones
      // property_address NOT written to roofing_estimate_data — leads.property_address is golden source
      if (square_count       !== undefined) roofingPayload.square_count       = square_count
      if (pitch              !== undefined) roofingPayload.pitch              = pitch
      if (waste_pct          !== undefined) roofingPayload.waste_pct          = waste_pct

      // Compute the authoritative tier total and milestones BEFORE writing, so
      // both fold into single writes (no second estimates update, no separate
      // roofing_estimate_data milestone update).
      let tierMilestones: unknown = undefined
      if (tiered_data?.tiers?.length > 0) {
        const tiers = tiered_data.tiers as any[]
        const selKey = tiered_data.selected_tier
        const selTier = selKey
          ? tiers.find((t: any) => t.key === selKey)
          : tiers.find((t: any) => t.key === 'upgraded') ?? tiers[Math.floor(tiers.length / 2)]
        if (selTier?.subtotal !== undefined) {
          const { subtotal: newSub, tax_amount: newTax, total: newTotal } =
            computeEstimateTotals({
              estimate_type: 'tiered',
              tiered_data,
              tax_rate: estRow.tax_rate,
            })
          // The selected tier's subtotal is AUTHORITATIVE — fold into the single
          // estimates update, overriding any stale client-sent total.
          updatePayload.subtotal   = newSub
          updatePayload.tax_amount = newTax
          updatePayload.total      = newTotal
          computed.subtotal = newSub
          computed.tax_amount = newTax
          computed.total = newTotal
          computed.subtotal_cents = toCents(newSub)
          computed.tax_amount_cents = toCents(newTax)
          computed.total_cents = toCents(newTotal)
          computed.tiered_data = {
            selected_tier: tiered_data.selected_tier,
            tiers: tiers.map((t: any) => ({
              key: t.key,
              subtotal: Number(t.subtotal) || 0,
              subtotal_cents: toCents(Number(t.subtotal) || 0),
            })),
          }
          const freshMs = computeMilestones(newTotal)
          tierMilestones = freshMs
          computed.payment_milestones = freshMs
        }
      }
      // Fold milestones into the roofing payload so it's one upsert, not two.
      if (tierMilestones !== undefined) roofingPayload.payment_milestones = tierMilestones

      await sb.from('roofing_estimate_data')
        .upsert(roofingPayload, { onConflict: 'estimate_id' })
    }
  }

  // B10 FIX: always process items array — even empty (to delete all removed items)
  if (Array.isArray(items)) {
    if (items.length > 0) {
      const upsertItems = items.map((item: any) => ({
        id: item.id, estimate_id: id,
        name: item.name, description: item.description,
        qty: item.qty, unit_price: item.unit_price,
        amount: Math.round(item.qty * item.unit_price * 100) / 100,
        // Preserve provenance — upsert is a full-row replace on id conflict, so
        // omitting source would reset it to the 'manual' default on every edit
        // and wipe the "Detected from measurements" badge. New/manually-added
        // lines (no source from client) correctly default to 'manual'.
        source: item.source === 'measurement' ? 'measurement' : 'manual',
      }))
      const { error: itemsError } = await sb.from('estimate_items').upsert(upsertItems, { onConflict: 'id' })
      if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
    // Always delete items not in the incoming array (handles empty array = delete all)
    const incomingIds = items.map((i: any) => i.id)
    if (incomingIds.length > 0) {
      await sb.from('estimate_items').delete().eq('estimate_id', id).not('id', 'in', `(${incomingIds.join(',')})`)
    } else {
      await sb.from('estimate_items').delete().eq('estimate_id', id)
    }

    // Keep the labour cache (roofing_job_data.labour_amount) in lockstep with the
    // persisted labour line — server-owned single source; clients never write it.
    const { data: estLp } = await sb.from('estimates').select('lead_id, pro_id').eq('id', id).single()
    await syncLabourCacheFromEstimate(sb, id, (estLp as any)?.lead_id, (estLp as any)?.pro_id)

    // ── Server-side total derivation (authoritative) ──────────────────────────
    // Do NOT trust client-sent subtotal/total: they were the source of the $0 bug
    // (DB returns item amounts as strings -> client reduce string-concats -> 0).
    // For standard (item-based) estimates, recompute from the persisted items so
    // any invoice created from this estimate inherits a correct total.
    const { data: estForTotals } = await sb
      .from('estimates').select('tax_rate, discount, discount_type').eq('id', id).single()
    const lineAmt = (it: any) =>
      Math.round((Number(it.qty) || 0) * (Number(it.unit_price) || 0) * 100) / 100
    const itemsSubtotal = items.reduce((s: number, it: any) => s + lineAmt(it), 0)
    // Record per-line authoritative amounts for the response (Slice 1).
    computed.items = items.map((it: any) => {
      const amount = lineAmt(it)
      return { id: it.id, amount, amount_cents: toCents(amount) }
    })
    // Only override when this is an item-based (non-tiered) estimate. Tiered
    // estimates set their total from the selected tier elsewhere.
    if (estimate_type !== 'tiered') {
      const txRate = Number(estForTotals?.tax_rate) || 0
      // Discount is applied to the subtotal BEFORE tax. Roofing always passes 0
      // (no discount UI on the roofing flow), so this is a no-op there; it makes
      // the formula correct for trades that do use discounts (e.g. HVAC later).
      const discType = (discount_type ?? estForTotals?.discount_type ?? '$') as string
      const discRaw  = Number(discount ?? estForTotals?.discount) || 0
      const discAmt  = discType === '%'
        ? Math.round(itemsSubtotal * (discRaw / 100) * 100) / 100
        : discRaw
      const discountedSub = Math.max(0, Math.round((itemsSubtotal - discAmt) * 100) / 100)
      const derivedTax   = Math.round(discountedSub * (txRate / 100) * 100) / 100
      const derivedTotal = discountedSub + derivedTax
      // Fold the authoritative total into updatePayload for the single deferred
      // estimates write at the end — no second estimates update.
      updatePayload.subtotal   = itemsSubtotal
      updatePayload.tax_amount = derivedTax
      updatePayload.total      = derivedTotal
      // Record authoritative values for the response (Slice 1).
      computed.subtotal = itemsSubtotal
      computed.tax_amount = derivedTax
      computed.total = derivedTotal
      computed.subtotal_cents = toCents(itemsSubtotal)
      computed.tax_amount_cents = toCents(derivedTax)
      computed.total_cents = toCents(derivedTotal)
      // Milestones derived from the authoritative total (single source).
      // For standard estimates hasRoofingFields is typically false, so the
      // upsert above did not run and this is the only roofing write. When both
      // do run (standard estimate carrying roofing fields — rare), the earlier
      // upsert wrote structure and this writes the item-derived milestones.
      const freshMs = computeMilestones(derivedTotal)
      await sb.from('roofing_estimate_data')
        .upsert({ estimate_id: id, payment_milestones: freshMs }, { onConflict: 'estimate_id' })
      computed.payment_milestones = freshMs
    }
  }

  // ── Single authoritative estimates write ─────────────────────────────────
  // Deferred to here so the general fields AND the computed total land in one
  // UPDATE — one logical save = one estimates audit row (no intermediate rows).
  const { error: estError } = await sb
    .from('estimates').update(updatePayload).eq('id', id).eq('pro_id', proId)
  if (estError) return NextResponse.json({ error: estError.message }, { status: 500 })

  // ── Auto-stage lead based on estimate status ────────────────────────────────
  // Reads stageAnchors so logic never hardcodes stage key strings.
  const { data: estimateData } = await sb
    .from('estimates').select('lead_id, pro_id').eq('id', id).single()

  if (estimateData?.lead_id && status) {
    // Resolve trade slug from the lead's pro so anchors are trade-correct
    const { data: proRow } = await sb
      .from('pros').select('trade_slug').eq('id', estimateData.pro_id).single()
    const anchors = getStageAnchors(proRow?.trade_slug)

    const leadUpdate: Record<string, unknown> = {}

    if (total !== undefined) {
      // Always sync quoted_amount when estimate has a total
      if (['sent','approved','invoiced','paid'].includes(status)) {
        leadUpdate.quoted_amount = Math.round((Number(total) || 0) * 100) / 100
      }
    }

    // Auto-advance lead stage — only move forward, never backward
    if (status === 'sent') {
      // Estimate sent → proposal_sent (maps to stageAnchors entry neighbour)
      leadUpdate.lead_status = anchors.entry === 'lead_in' ? 'proposal_sent' : 'Quoted'
      leadUpdate.lead_status_changed_at = new Date().toISOString()
    } else if (status === 'approved') {
      // Homeowner approved estimate → proposal_signed (deposit trigger)
      leadUpdate.lead_status = (anchors as any).depositTrigger ?? 'proposal_signed'
      leadUpdate.lead_status_changed_at = new Date().toISOString()
    }
    // Note: invoice paid → job_won is handled in /api/invoices/[id]/route.ts

    if (Object.keys(leadUpdate).length > 0) {
      await sb.from('leads').update(leadUpdate).eq('id', estimateData.lead_id)
    }
  }

  // Return the authoritative computed values so clients render without a re-fetch
  // (Slice 1). `computed` is empty when the payload changed nothing money-related.
  return NextResponse.json({ ok: true, computed })
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildTimeline(estimate: any) {
  const isDeclined = estimate.status === 'declined'
  const isVoid     = estimate.status === 'void'

  return [
    { event: 'sent',     label: 'Sent to client',   timestamp: estimate.sent_at     ?? null },
    {
      event: 'viewed',
      label: estimate.viewed_count > 1 ? `Viewed by client (${estimate.viewed_count} times)` : 'Viewed by client',
      timestamp: estimate.viewed_at ?? null,
    },
    {
      event: isDeclined ? 'declined' : 'approved',
      label: isDeclined ? 'Declined by client' : 'Approved by client',
      timestamp: isDeclined ? (estimate.declined_at ?? null) : (estimate.approved_at ?? null),
    },
    { event: 'invoiced', label: 'Invoice created',   timestamp: estimate.invoiced_at ?? null },
    {
      event: isVoid ? 'void' : 'paid',
      label: isVoid ? 'Estimate voided' : 'Payment received',
      timestamp: isVoid ? (estimate.voided_at ?? null) : (estimate.paid_at ?? null),
    },
  ]
}

// ── DELETE /api/estimates/[id] ───────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // IDOR fix: was an unguarded delete-by-id. Now auth-scoped + audited.
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error || !__auth.proId) return __auth.error ?? NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const proId = __auth.proId
  const sb = auditedAdmin(req, { actorId: proId, actorType: 'pro' })

  const { error } = await sb
    .from('estimates')
    .delete()
    .eq('id', id)
    .eq('pro_id', proId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
