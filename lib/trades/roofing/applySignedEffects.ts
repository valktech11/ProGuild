import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyRoofer } from '@/lib/notifyRoofer'
import { computeMilestones } from '@/lib/estimates/milestones'

// ── Shared "estimate signed" side-effect engine ────────────────────────────────
// This is the single source of truth for everything that must happen once an
// estimate is signed, REGARDLESS of channel (homeowner via public link, or
// in-person on the contractor's device). The signature itself is recorded by the
// caller (the recording differs by channel: remote vs in-person); this function
// owns the consequences that must be identical either way:
//   estimate → approved (with GBB tier sync) · void siblings · revision supersede
//   · lead → proposal_signed · create draft invoice · roofing extension row
//   · quoted_amount · email invoice to homeowner.
//
// Callers fetch `est` + `roofingEst` (same selects as before) and pass them in so
// query behavior is unchanged from the original inline implementation.

type SignEst = {
  id: string
  status: string
  pro_id: string
  lead_id: string | null
  tax_rate: number | null
  revision_of: string | null
  estimate_number?: string | null
}
type SignRoofing = { tiered_data?: unknown; estimate_type?: string; payment_milestones?: unknown } | null

export async function applyEstimateSignedEffects(
  sb: ReturnType<typeof getSupabaseAdmin>,
  { est, roofingEst, selectedTier, signerName }: {
    est: SignEst
    roofingEst: SignRoofing
    selectedTier?: string | null
    signerName: string
  },
): Promise<void> {
  const id = est.id
  const selected_tier = selectedTier ?? null
  const signer_name = signerName
  const tieredData = roofingEst?.tiered_data as any

  // Update estimate status + sync total to selected tier (for GBB).
  // For standard estimates, stored total is synced after fullEst (with items)
  // is fetched below — same values used for the invoice.
  const estUpdate: Record<string, unknown> = {
    status:      'approved',
    approved_at: new Date().toISOString(),
  }
  if (selected_tier && tieredData?.tiers) {
    const selTier = tieredData.tiers.find((t: any) => t.key === selected_tier)
    if (selTier?.subtotal !== undefined) {
      const taxRate = est.tax_rate ?? 0
      estUpdate.subtotal   = selTier.subtotal
      estUpdate.tax_amount = Math.round(selTier.subtotal * (taxRate / 100) * 100) / 100
      estUpdate.total      = selTier.subtotal + (estUpdate.tax_amount as number)
    }
  }
  await sb.from('estimates').update(estUpdate).eq('id', id)

  // Write selected_tier back to roofing_estimate_data — tiered_data lives there
  if (roofingEst && tieredData) {
    const updatedTieredData = selected_tier
      ? { ...tieredData, selected_tier }
      : tieredData
    await sb.from('roofing_estimate_data')
      .update({ tiered_data: updatedTieredData, updated_at: new Date().toISOString() })
      .eq('estimate_id', id)
  }

  // Auto-void sibling estimates for same lead
  if (est.lead_id) {
    await sb.from('estimates').update({
      status:      'void',
      voided_at:   new Date().toISOString(),
      void_reason: 'Superseded by signed estimate',
    }).eq('lead_id', est.lead_id).neq('id', id)
      .in('status', ['draft', 'sent', 'viewed'])
  }

  // ── Revision supersede ───────────────────────────────────────────────────
  // If THIS signed estimate is a revision of an earlier (frozen) estimate, the
  // original must now step aside: mark it superseded and void ITS invoice, so the
  // signed-document trail and the money trail stay one-to-one. The original row is
  // NOT deleted — it remains as the historical record of what was first agreed.
  if (est.revision_of) {
    await sb.from('estimates').update({
      status:      'void',
      voided_at:   new Date().toISOString(),
      void_reason: `Superseded by revision ${est.estimate_number ?? id}`,
    }).eq('id', est.revision_of)

    await sb.from('invoices').update({
      status:      'void',
      updated_at:  new Date().toISOString(),
    }).eq('estimate_id', est.revision_of)
      .neq('status', 'paid')  // never void a paid invoice — money already collected
  }

  // ── Auto-stage: move lead to proposal_signed ─────────────────────────────
  if (est.lead_id) {
    await sb.from('leads')
      .update({ lead_status: 'proposal_signed', updated_at: new Date().toISOString(), lead_status_changed_at: new Date().toISOString() })
      .eq('id', est.lead_id)
  }

  // ── Auto-create draft invoice from approved estimate ─────────────────────
  // Fetch full estimate for invoice creation
  if (est.lead_id) {
    const { data: fullEst } = await sb
      .from('estimates')
      .select('*, items:estimate_items(*), roofing:roofing_estimate_data(payment_milestones)')
      .eq('id', id)
      .single()

    if (fullEst) {
      // Check if invoice already exists for this estimate
      const { data: existingInv } = await sb
        .from('invoices')
        .select('id')
        .eq('estimate_id', id)
        .maybeSingle()

      if (!existingInv) {
        // Get next invoice number
        const { data: numData } = await sb.rpc('next_invoice_number', { p_pro_id: fullEst.pro_id })
        const invoiceNumber = numData || `INV-${Date.now().toString().slice(-4)}`

        // Always recompute milestones from the authoritative invoiceTotal — never copy
        // the estimate's stored payment_milestones which may have been computed off a
        // stale total. The estimate milestones are only used as a fallback for deposit %.
        const depositPct = fullEst.deposit_percent ?? 30

        // GBB: use the selected tier's subtotal + recalculated tax.
        // Standard: derive from the LINE ITEMS + tax — the same source of truth the
        // homeowner's approve page and email now use — so the invoice can never lock
        // in a stale stored estimates.total that drifted from the line items.
        let invoiceSubtotal = fullEst.subtotal
        let invoiceTaxAmount = fullEst.tax_amount
        let invoiceTotal = fullEst.total
        if (selected_tier && tieredData?.tiers) {
          const selTier = tieredData.tiers.find((t: any) => t.key === selected_tier)
          if (selTier) {
            invoiceSubtotal  = selTier.subtotal
            invoiceTaxAmount = Math.round(selTier.subtotal * ((fullEst.tax_rate ?? 0) / 100) * 100) / 100
            invoiceTotal     = invoiceSubtotal + invoiceTaxAmount
          }
        } else if (Array.isArray(fullEst.items) && fullEst.items.length > 0) {
          const itemsSum   = fullEst.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
          invoiceSubtotal  = itemsSum
          invoiceTaxAmount = Math.round(itemsSum * ((fullEst.tax_rate ?? 0) / 100) * 100) / 100
          invoiceTotal     = invoiceSubtotal + invoiceTaxAmount
        }

        // Sync stored estimates.total/subtotal/tax_amount to the derived invoice values —
        // locks in the correct amount at approval so the estimate card shows the right
        // number and the stored total is never stale after signing.
        await sb.from('estimates').update({
          subtotal:   invoiceSubtotal,
          tax_amount: invoiceTaxAmount,
          total:      invoiceTotal,
        }).eq('id', id)

        // Compute fresh milestones from the authoritative invoiceTotal so amounts
        // always sum to what the homeowner is actually being charged.
        const milestones = computeMilestones(invoiceTotal)

        const depositAmt = milestones?.[0]?.amount
          ?? Math.round(invoiceTotal * (depositPct / 100) * 100) / 100

        // Resolve contact email from lead (live source of truth) — estimates.contact_email may be stale/null
        let invoiceContactEmail = fullEst.contact_email ?? null
        let invoiceContactPhone = fullEst.contact_phone ?? null
        let invoiceLeadName     = fullEst.lead_name ?? null
        if (est.lead_id) {
          const { data: leadContact } = await sb
            .from('leads')
            .select('contact_email, contact_phone, contact_name')
            .eq('id', est.lead_id)
            .maybeSingle()
          if (leadContact?.contact_email) invoiceContactEmail = leadContact.contact_email
          if (leadContact?.contact_phone) invoiceContactPhone = leadContact.contact_phone
          if (leadContact?.contact_name)  invoiceLeadName     = leadContact.contact_name
        }

        await sb.from('invoices').insert({
          pro_id:          fullEst.pro_id,
          estimate_id:     id,
          lead_id:         est.lead_id,
          invoice_number:  invoiceNumber,
          lead_name:       invoiceLeadName,
          contact_email:   invoiceContactEmail,
          contact_phone:   invoiceContactPhone,
          trade:           fullEst.trade_slug ?? 'roofing',
          status:          'draft',
          subtotal:        invoiceSubtotal,
          tax_rate:        fullEst.tax_rate,
          tax_amount:      invoiceTaxAmount,
          total:           invoiceTotal,
          balance_due:     invoiceTotal,
          amount_paid:     0,
          deposit_paid:    0,
          require_deposit: true,
          deposit_percent: depositPct,
          deposit_amount:  depositAmt,
          payment_milestones: milestones,
          terms:           fullEst.terms,
          issue_date:      new Date().toISOString().split('T')[0],
          due_date:        new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          created_at:      new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        })
      }
    }
  }

  // ── Create roofing_invoice_data from roofing_job_data ──────────────────
  // Sign flow creates invoice directly — must also create extension row
  if (est.lead_id) {
    try {
      const { data: newInvRow } = await sb
        .from('invoices').select('id, trade').eq('estimate_id', id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const invTrade = newInvRow?.trade ?? ''
      if (newInvRow?.id && invTrade.includes('roof')) {
        const { data: jobData } = await sb
          .from('roofing_job_data')
          .select('insurance_company, claim_number, approved_amount, deductible, supplement_amount, permit_number, permit_status')
          .eq('lead_id', est.lead_id).maybeSingle()
        await sb.from('roofing_invoice_data').upsert({
          invoice_id:        newInvRow.id,
          pro_id:            est.pro_id,
          insurance_company: jobData?.insurance_company ?? null,
          claim_number:      jobData?.claim_number      ?? null,
          approved_amount:   jobData?.approved_amount   ?? null,
          deductible:        jobData?.deductible         ?? null,
          supplement_amount: jobData?.supplement_amount  ?? null,
          permit_number:     jobData?.permit_number      ?? null,
          permit_status:     jobData?.permit_status      ?? null,
        }, { onConflict: 'invoice_id' })
      }
    } catch { /* non-fatal */ }
  }

  // Update lead quoted_amount with the correct signed total (selected tier for GBB, estimate total for standard)
  if (est.lead_id) {
    try {
      const { data: invRow } = await sb
        .from('invoices')
        .select('total')
        .eq('estimate_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (invRow?.total) {
        await sb.from('leads')
          .update({ quoted_amount: invRow.total })
          .eq('id', est.lead_id)
      }
    } catch { /* non-fatal */ }
  }

  // Send invoice email to homeowner — must AWAIT before returning (serverless functions
  // terminate on return, fire-and-forget fetch() never completes in Vercel)
  try {
    const { data: newInv } = await sb
      .from('invoices')
      .select('id, contact_email')
      .eq('estimate_id', id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (newInv?.id && newInv?.contact_email) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? 'https://staging.proguild.ai'
      const sendRes = await fetch(`${baseUrl}/api/invoices/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: newInv.id, pro_id: est.pro_id }),
      })
      if (sendRes.ok) {
        await sb.from('pipeline_events').insert({
          lead_id:    est.lead_id,
          pro_id:     est.pro_id,
          event_type: 'invoice_sent',
          event_data: { invoice_id: newInv.id, email: newInv.contact_email },
          actor_type: 'system',
          created_at: new Date().toISOString(),
        })
        console.log('[signed-effects] Invoice auto-sent to', newInv.contact_email)
        await notifyRoofer({
          proId:    est.pro_id,
          subject:  `✅ Proposal signed — invoice sent to ${newInv.contact_email}`,
          headline: 'Proposal Signed',
          body:     `${signer_name} has signed the proposal. Invoice #INV has been automatically sent to ${newInv.contact_email}. You'll be notified when payment is received.`,
          leadId:   est.lead_id ?? undefined,
          sb,
        })
      } else {
        const d = await sendRes.json().catch(() => ({}))
        console.error('[signed-effects] Invoice auto-send failed:', d)
      }
    } else {
      console.log('[signed-effects] No draft invoice found for estimate', id, '— skipping auto-send')
    }
  } catch (err) {
    console.error('[signed-effects] Invoice auto-send error:', err)
  }
}
