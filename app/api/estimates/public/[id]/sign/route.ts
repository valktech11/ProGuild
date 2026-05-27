import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import crypto from 'crypto'

// POST /api/estimates/public/[id]/sign
// Accepts: { signer_name, sig_data_url, selected_tier? }
// Uploads PNG → R2, records in signatures table, marks estimate approved.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { signer_name, sig_data_url, selected_tier } = body

  if (!signer_name || !sig_data_url) {
    return NextResponse.json({ error: 'signer_name and sig_data_url required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Validate estimate exists and is signable
  const { data: est } = await sb
    .from('estimates')
    .select('id, status, valid_until, pro_id, lead_id, tax_rate')
    .eq('id', id).single()

  if (!est) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['sent', 'viewed'].includes(est.status))
    return NextResponse.json({ error: 'Cannot sign in current state' }, { status: 400 })
  if (new Date(est.valid_until) < new Date())
    return NextResponse.json({ error: 'Estimate expired' }, { status: 400 })

  // Fetch roofing_estimate_data — tiered_data lives here, NOT on estimates table
  const { data: roofingEst } = await sb
    .from('roofing_estimate_data')
    .select('tiered_data, estimate_type, payment_milestones')
    .eq('estimate_id', id)
    .maybeSingle()

  const tieredData = roofingEst?.tiered_data as any

  // Convert base64 data URL → Buffer
  const base64 = sig_data_url.replace(/^data:image\/png;base64,/, '')
  const sigBuffer = Buffer.from(base64, 'base64')

  // Upload to R2
  const sigKey = `signatures/${est.pro_id}/${id}/signature-${Date.now()}.png`
  await uploadToR2(sigKey, sigBuffer, 'image/png')

  // Compute hashes for legal integrity
  const sigHash = crypto.createHash('sha256').update(sigBuffer).digest('hex')
  const docSnapshot = JSON.stringify({ estimate_id: id, selected_tier, signed_at: new Date().toISOString() })
  const docHash = crypto.createHash('sha256').update(docSnapshot).digest('hex')

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const ua = req.headers.get('user-agent') ?? 'unknown'

  // Record signature
  await sb.from('signatures').insert({
    estimate_id:       id,
    pro_id:            est.pro_id,
    signer_name,
    signer_ip:         ip,
    signer_user_agent: ua,
    signature_r2_key:  sigKey,
    signature_hash:    sigHash,
    document_hash:     docHash,
    signed_at:         new Date().toISOString(),
  })

  // Update estimate status + sync total to selected tier (for GBB)
  // This ensures estimates.total reflects what the homeowner actually agreed to pay
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

        const milestones = roofingEst?.payment_milestones ?? (fullEst.roofing as any)?.payment_milestones ?? null
        const depositPct = fullEst.deposit_percent ?? 30

        // For GBB: use the selected tier's subtotal + recalculate tax
        // For standard: use estimates.subtotal/total directly
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
        }

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

  // Send invoice email to homeowner (non-blocking, best-effort)
  // Done server-side so we don't need to expose pro_id to the public page
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
      // Fire and forget — don't block the sign response
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://proguild.ai'
      fetch(`${baseUrl}/api/invoices/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: newInv.id, pro_id: est.pro_id }),
      }).catch(() => null)
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true })
}
