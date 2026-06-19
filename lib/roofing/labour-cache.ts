// ── Labour cache sync (server-owned, single source of truth) ─────────────────
//
// PROBLEM THIS SOLVES
//   The roofing calculator restores its "Labour Amount" field from
//   roofing_job_data.labour_amount. That column is a *mirror* of the estimate's
//   "Labour & installation" line. Historically each client (web calculator, web
//   estimate page, mobile) was responsible for writing that mirror itself — from
//   its own in-memory state — on whatever save handlers it happened to wire up.
//   That drifted: some save paths skipped the write, and the ones that didn't
//   read stale client state, so the mirror fell out of step with the estimate
//   (calculator showed $4000 while the estimate line read $3000).
//
// THE RULE
//   The estimate's persisted "Labour & installation" line in `estimate_items` is
//   the single source of truth. roofing_job_data.labour_amount is a derived
//   mirror that ONLY the server writes, from the DB (never from any client).
//   Both estimate write paths — POST /api/estimates (calculator Apply) and
//   PATCH /api/estimates/[id] (estimate editor save) — call this after they
//   persist line items. No client touches labour_amount again.
//
// CONTRACT
//   - Reads the labour line straight from estimate_items (ground truth), not from
//     any payload, so it cannot be fooled by stale client state.
//   - Labour line present  -> upsert the mirror to its amount.
//   - Labour line absent    -> zero the mirror, but only if a row already exists
//     (don't create roofing_job_data rows for non-roofing leads).
//   - Never throws: a failure to update the mirror must not fail the estimate save.

const LABOUR_RE = /lab(o|ou)r/i

export async function syncLabourCacheFromEstimate(
  sb: ReturnType<typeof import('@/lib/supabase').getSupabaseAdmin>,
  estimateId: string | null | undefined,
  leadId: string | null | undefined,
  proId: string | null | undefined,
): Promise<void> {
  if (!estimateId || !leadId || !proId) return
  try {
    const { data: items } = await sb
      .from('estimate_items')
      .select('name, description, qty, unit_price, amount')
      .eq('estimate_id', estimateId)

    const labourLine = (items ?? []).find((it: any) =>
      LABOUR_RE.test(String(it.name ?? it.description ?? '')))

    const updatedAt = new Date().toISOString()

    if (labourLine) {
      const labourAmount =
        Number(labourLine.amount) ||
        Math.round((Number(labourLine.qty) || 0) * (Number(labourLine.unit_price) || 0) * 100) / 100
      const { error } = await sb.from('roofing_job_data').upsert({
        lead_id:       leadId,
        pro_id:        proId,
        labour_amount: labourAmount,
        updated_at:    updatedAt,
      }, { onConflict: 'lead_id' })
      if (error) console.error('[syncLabourCache] upsert error:', error.message, 'lead:', leadId)
    } else {
      // Labour line removed from the estimate -> zero the mirror. Update only;
      // do not insert a row for a lead that never had roofing job data.
      const { error } = await sb.from('roofing_job_data')
        .update({ labour_amount: 0, updated_at: updatedAt })
        .eq('lead_id', leadId)
      if (error) console.error('[syncLabourCache] zero error:', error.message, 'lead:', leadId)
    }
  } catch (e) {
    console.error('[syncLabourCache] threw:', e)
  }
}
