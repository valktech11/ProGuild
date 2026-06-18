import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { CALCULATOR_LINE_NAMES } from '@/lib/roofing/calculator'

// Frozen estimate states — a homeowner has signed/agreed. Re-pricing must NOT
// overwrite these; it spins off a revision instead (see revision branch below).
const FROZEN_STATUSES = ['approved', 'invoiced', 'paid']

// Base state sales tax rates (Tax Foundation 2024)
// These are state-level rates only — county/city additions vary
const STATE_TAX_RATES: Record<string, number> = {
  AL: 4.0,  AK: 0.0,  AZ: 5.6,  AR: 6.5,  CA: 7.25,
  CO: 2.9,  CT: 6.35, DE: 0.0,  FL: 6.0,  GA: 4.0,
  HI: 4.0,  ID: 6.0,  IL: 6.25, IN: 7.0,  IA: 6.0,
  KS: 6.5,  KY: 6.0,  LA: 4.45, ME: 5.5,  MD: 6.0,
  MA: 6.25, MI: 6.0,  MN: 6.875,MS: 7.0,  MO: 4.225,
  MT: 0.0,  NE: 5.5,  NV: 6.85, NH: 0.0,  NJ: 6.625,
  NM: 5.125,NY: 4.0,  NC: 4.75, ND: 5.0,  OH: 5.75,
  OK: 4.5,  OR: 0.0,  PA: 6.0,  RI: 7.0,  SC: 6.0,
  SD: 4.5,  TN: 7.0,  TX: 6.25, UT: 5.95, VT: 6.0,
  VA: 5.3,  WA: 6.5,  WV: 6.0,  WI: 5.0,  WY: 4.0,
  DC: 6.0,
}

// ── GET /api/estimates?pro_id=xxx ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const leadId = searchParams.get('lead_id')  // optional: filter to one lead's estimates

  let q = getSupabaseAdmin()
    .from('estimates')
    .select('id, estimate_number, status, lead_name, lead_id, trade, total, created_at, valid_until, sent_at, viewed_at, approved_at, sent_to_email, email_status, email_bounce_reason, viewed_count')
    .eq('pro_id', proId)
  if (leadId) q = q.eq('lead_id', leadId)

  const { data, error } = await q.order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ estimates: data || [] })
}

// ── POST /api/estimates ───────────────────────────────────────────────────
// Creates a blank draft estimate and returns it so the UI can redirect to /[id]
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, lead_id, lead_name, lead_source, trade, trade_slug, force_new, state, contact_phone, contact_email, property_address, line_items, source, square_count, pitch, waste_pct } = body

  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  // Option C guard: estimates must be linked to a lead.
  // lead_id is required unless this is a force_new re-issue of an existing lead's estimate
  // (force_new=true always has pendingLead.id passed as lead_id from the UI).
  if (!lead_id) {
    return NextResponse.json({ error: 'lead_id required — estimates must be linked to a lead' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // C2 FIX: check for any non-void, non-declined estimate (not just draft)
  // Priority: approved > invoiced > paid > sent > viewed > draft
  if (lead_id && !force_new) {
    const { data: existing } = await sb
      .from('estimates')
      .select('id, estimate_number, status, total, tax_rate, created_at')
      .eq('pro_id', pro_id)
      .eq('lead_id', lead_id)
      .not('status', 'in', '("void","declined")')
      .order('created_at', { ascending: false })
      .limit(10)

    if (existing && existing.length > 0) {
      // Pick by priority: approved/invoiced/paid > sent/viewed > draft
      const priority = ['approved', 'invoiced', 'paid', 'sent', 'viewed', 'draft']
      const best = existing.sort((a, b) =>
        (priority.indexOf(a.status) - priority.indexOf(b.status))
      )[0]

      // Sync roofing_estimate_data with latest lead data — address/measurements
      // may have changed since the estimate was first created
      if (trade_slug?.includes('roof') && (square_count || pitch || waste_pct)) {
        // property_address NOT written — leads.property_address is the golden source
        const syncPayload: Record<string, unknown> = { estimate_id: best.id, pro_id }
        if (square_count) syncPayload.square_count = Number(square_count)
        if (pitch)        syncPayload.pitch        = pitch
        if (waste_pct)    syncPayload.waste_pct    = Number(waste_pct)
        await sb.from('roofing_estimate_data').upsert(syncPayload, { onConflict: 'estimate_id' })
      }

      // Calculator output handling — branches on whether the estimate is frozen.
      if (source === 'roofing_calculator' && Array.isArray(line_items) && line_items.length > 0) {

        // Build the calculator's material lines once (reused by both branches).
        const calcItems = line_items.map((item: any, idx: number) => {
          const qty       = Number(item.quantity  ?? item.qty ?? 1)
          const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0)
          const itemTotal = Number(item.total ?? item.amount ?? Math.round(qty * unitPrice * 100) / 100)
          return {
            name:        String(item.description ?? item.name ?? ''),
            description: String(item.description ?? item.name ?? ''),
            qty, unit_price: unitPrice, amount: itemTotal, sort_order: idx,
          }
        })

        // ─────────────────────────────────────────────────────────────────────
        // FROZEN (approved / invoiced / paid) → create a REVISION, never overwrite.
        // The original keeps its signature, invoice and status intact. A new draft
        // estimate is created, linked via revision_of, pre-filled with the calc lines,
        // and returned so the UI takes the roofer there to re-price and re-send.
        // ─────────────────────────────────────────────────────────────────────
        if (FROZEN_STATUSES.includes(best.status)) {
          // Determine revision depth: walk the chain so each revision is numbered.
          // best may itself be a revision; count existing revisions in this lead's chain.
          const { data: chain } = await sb
            .from('estimates')
            .select('id, revision_number')
            .eq('pro_id', pro_id)
            .eq('lead_id', lead_id)
            .not('revision_of', 'is', null)
          const nextRevNum = (chain?.length ?? 0) + 1

          const { data: numData2 } = await sb.rpc('next_estimate_number')
          const revNumber: string = numData2 || `EST-${Date.now().toString().slice(-4)}`
          const validUntil2 = new Date(); validUntil2.setDate(validUntil2.getDate() + 14)

          // Carry tax_rate forward from the original (it was already resolved at create).
          const carriedTaxRate = (best as any).tax_rate ?? STATE_TAX_RATES[state?.toUpperCase() ?? ''] ?? 6

          const calcSubtotal = calcItems.reduce((s, i) => s + (i.amount ?? 0), 0)
          const calcTax      = Math.round(calcSubtotal * carriedTaxRate / 100 * 100) / 100
          const calcTotal    = Math.round((calcSubtotal + calcTax) * 100) / 100

          const { data: rev, error: revErr } = await sb.from('estimates').insert({
            pro_id,
            lead_id,
            estimate_number: revNumber,
            status:          'draft',
            lead_name:       (best as any).lead_name ?? lead_name ?? 'New Client',
            trade:           trade || '',
            trade_slug:      trade_slug || null,
            subtotal:        calcSubtotal,
            discount:        0,
            tax_rate:        carriedTaxRate,
            tax_amount:      calcTax,
            total:           calcTotal,
            require_deposit: true,
            valid_until:     validUntil2.toISOString(),
            contact_phone:   contact_phone || null,
            contact_email:   contact_email || null,
            terms:           'This estimate is valid for 14 days. Payment is due upon job completion.',
            revision_of:     best.id,
            revision_number: nextRevNum,
          }).select().single()

          if (revErr || !rev) {
            console.error('[estimates POST] revision create failed:', revErr?.message)
            return NextResponse.json({ error: 'Failed to create revision: ' + (revErr?.message ?? 'unknown') }, { status: 500 })
          }

          // Pre-fill the revision: carry the ORIGINAL's custom lines (anything the
          // roofer hand-added, e.g. Permit Fee) PLUS the calculator's fresh material
          // lines. Mirrors the editable-path merge so custom work survives into the
          // revision (what we agreed: copy the original as a starting point).
          const { data: origItems } = await sb
            .from('estimate_items').select('*').eq('estimate_id', best.id)
          const origCustom = (origItems ?? []).filter(
            (it: any) => !CALCULATOR_LINE_NAMES.includes(String(it.name ?? it.description ?? ''))
          )
          const revItems = [
            ...calcItems.map((i, idx) => ({ ...i, estimate_id: rev.id, sort_order: idx })),
            ...origCustom.map((it: any, idx: number) => ({
              estimate_id: rev.id,
              name:        it.name,
              description: it.description ?? it.name,
              qty:         Number(it.qty) || 1,
              unit_price:  Number(it.unit_price) || 0,
              amount:      Number(it.amount) || (Number(it.qty) * Number(it.unit_price)) || 0,
              sort_order:  calcItems.length + idx,
            })),
          ]
          await sb.from('estimate_items').insert(revItems)
          // Recompute the revision totals including the carried custom lines.
          const revSubtotal = revItems.reduce((s, i: any) => s + (Number(i.amount) || 0), 0)
          const revTax      = Math.round(revSubtotal * carriedTaxRate / 100 * 100) / 100
          const revTotal    = Math.round((revSubtotal + revTax) * 100) / 100
          await sb.from('estimates').update({
            subtotal: revSubtotal, tax_amount: revTax, total: revTotal,
          }).eq('id', rev.id)

          // Roofing extension row — standard mode, carry measurements.
          if (trade_slug?.includes('roof')) {
            await sb.from('roofing_estimate_data').upsert({
              estimate_id:   rev.id,
              pro_id,
              estimate_type: 'standard',
              tiered_data:   null,
              square_count:  Number(square_count) || null,
              pitch:         pitch ?? null,
              waste_pct:     Number(waste_pct) || null,
            }, { onConflict: 'estimate_id' })
          }

          return NextResponse.json({
            estimate: rev, existed: true, revised: true,
            revision_of: best.id, revision_number: nextRevNum,
          })
        }

        // ─────────────────────────────────────────────────────────────────────
        // EDITABLE (draft / sent / viewed) → MERGE: replace only the calculator's
        // own material lines, preserve any line the roofer added by hand.
        // ─────────────────────────────────────────────────────────────────────
        // 1. Read existing items, keep the ones NOT owned by the calculator.
        const { data: existingItems } = await sb
          .from('estimate_items').select('*').eq('estimate_id', best.id)
        const customItems = (existingItems ?? []).filter(
          (it: any) => !CALCULATOR_LINE_NAMES.includes(String(it.name ?? it.description ?? ''))
        )
        // 2. Delete only the calculator-owned lines.
        await sb.from('estimate_items').delete()
          .eq('estimate_id', best.id)
          .in('name', CALCULATOR_LINE_NAMES as string[])
        // 3. Insert the fresh calculator lines (custom lines stay as-is).
        await sb.from('estimate_items').insert(calcItems.map(i => ({ ...i, estimate_id: best.id })))
        // 4. Recalculate totals from ALL persisted lines (calc + preserved custom).
        const calcSubtotal   = calcItems.reduce((s, i) => s + (i.amount ?? 0), 0)
        const customSubtotal = customItems.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0)
        const newSubtotal = Math.round((calcSubtotal + customSubtotal) * 100) / 100
        const taxRate     = ((best as any).tax_rate ?? 6)
        const newTax      = Math.round(newSubtotal * taxRate / 100 * 100) / 100
        const newTotal    = Math.round((newSubtotal + newTax) * 100) / 100
        // 5. Force Standard mode — update estimates table totals.
        // NOTE: square_count/pitch/waste_pct are NOT columns on `estimates` — they
        // live in roofing_estimate_data (written at 5b). Writing them here errors
        // ("Could not find the 'pitch' column of 'estimates'").
        const { error: updateErr } = await sb.from('estimates').update({
          subtotal:   newSubtotal,
          tax_amount: newTax,
          total:      newTotal,
        }).eq('id', best.id)
        if (updateErr) {
          console.error('[estimates POST] update totals failed:', updateErr.message, 'id:', best.id)
          return NextResponse.json({ error: 'Failed to update estimate totals: ' + updateErr.message }, { status: 500 })
        }
        // 5b. Force Standard mode in roofing_estimate_data (where estimate_type lives)
        await sb.from('roofing_estimate_data').upsert({
          estimate_id:   best.id,
          pro_id:        pro_id,
          estimate_type: 'standard',
          tiered_data:   null,
          square_count:  Number(square_count) || null,
          pitch:         pitch ?? null,
          waste_pct:     Number(waste_pct) || null,
        }, { onConflict: 'estimate_id' })
        // 6. Return fresh estimate row
        const { data: updated } = await sb.from('estimates').select('*').eq('id', best.id).single()
        return NextResponse.json({
          estimate: updated ?? best, existed: true, items_replaced: true,
          custom_lines_preserved: customItems.length,
        })
      }
      return NextResponse.json({ estimate: best, existed: true })
    }
  }

  // No existing draft — create new
  const { data: numData } = await sb.rpc('next_estimate_number')
  const estimateNumber: string = numData || `EST-${Date.now().toString().slice(-4)}`

  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + 14)

  const { data: estimate, error } = await sb
    .from('estimates')
    .insert({
      pro_id,
      lead_id:         lead_id || null,
      estimate_number: estimateNumber,
      status:          'draft',
      lead_name:       lead_name  || 'New Client',
      lead_source:     lead_source || '',
      trade:           trade || '',
      subtotal:        0,
      discount:        0,
      tax_rate:        STATE_TAX_RATES[state?.toUpperCase() ?? ''] ?? 0,
      tax_amount:      0,
      total:           0,
      require_deposit: true,
      valid_until:     validUntil.toISOString(),
      contact_phone:   contact_phone || null,
      contact_email:   contact_email || null,
      terms:           'This estimate is valid for 14 days. Payment is due upon job completion.',
      trade_slug:      trade_slug || null,
      // Note: estimate_type, tiered_data, scope_of_work, payment_milestones,
      // property_address are NOT written here — they live in roofing_estimate_data.
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Roofing estimates get a roofing_estimate_data row immediately ─────────
  if (trade_slug?.includes('roof') && estimate) {
    await sb.from('roofing_estimate_data').upsert({
      estimate_id:      estimate.id,
      pro_id:           pro_id,
      estimate_type:    'tiered',
      // property_address omitted — leads.property_address is golden source
      // Measurements from calculator or direct entry
      square_count:     square_count     ? Number(square_count)  : null,
      pitch:            pitch            || null,
      waste_pct:        waste_pct        ? Number(waste_pct)     : 10,
    }, { onConflict: 'estimate_id' })
  }

  // ── Line items from calculator — insert into estimate_items ──────────────
  if (Array.isArray(line_items) && line_items.length > 0 && estimate) {
    const items = line_items.map((item: any) => ({
      estimate_id: estimate.id,
      name:        item.description || item.name || 'Item',
      description: item.description || '',
      qty:         Number(item.quantity ?? item.qty) || 1,
      unit_price:  Number(item.unit_price ?? item.unitPrice) || 0,
      amount:      Number(item.quantity ?? item.qty) * Number(item.unit_price ?? item.unitPrice) || 0,
    }))
    const { error: itemsErr } = await sb.from('estimate_items').insert(items)
    if (itemsErr) console.error('[estimates POST] line_items insert error:', itemsErr.message)
  }

  return NextResponse.json({ estimate: { ...estimate, id: estimate.id }, existed: false })
}
