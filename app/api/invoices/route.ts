import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── GET /api/invoices?pro_id=xxx ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId  = searchParams.get('pro_id')
  const leadId = searchParams.get('lead_id')

  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  let query = getSupabaseAdmin()
    .from('invoices')
    .select('id, invoice_number, status, lead_name, trade, total, balance_due, due_date, created_at, estimate_id, lead_id')
    .eq('pro_id', proId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })

  if (leadId) query = query.eq('lead_id', leadId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dedup by id — guard against any duplicate rows from DB/joins
  const seen = new Set<string>()
  const invoices = (data || []).filter(inv => {
    if (seen.has(inv.id)) return false
    seen.add(inv.id)
    return true
  })

  return NextResponse.json({ invoices })
}

// ── POST /api/invoices ────────────────────────────────────────────────────
// Creates an invoice, optionally from an estimate_id
export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    pro_id,
    estimate_id,   // optional — if provided, auto-fills from estimate
    lead_id,
    lead_name,
    trade,
    contact_name, contact_email, contact_phone,
    payment_terms: bodyTerms,
    due_date: bodyDueDate,
  } = body

  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  let invoiceData: Record<string, unknown> = { pro_id, lead_id, lead_name, trade, contact_name, contact_email, contact_phone }

  if (estimate_id) {
    // Guard: check if an invoice already exists for this estimate
    const { data: existingInv } = await sb
      .from('invoices')
      .select('id, invoice_number')
      .eq('estimate_id', estimate_id)
      .neq('status', 'void')
      .single()
    if (existingInv) {
      return NextResponse.json({ invoice: existingInv, existed: true }, { status: 200 })
    }

    // Auto-fill from estimate
    const { data: est, error: estErr } = await sb
      .from('estimates')
      .select('*, items:estimate_items(*)')
      .eq('id', estimate_id)
      .single()

    if (estErr || !est) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

    // Guard: estimate must be approved before invoicing
    if (!['approved', 'invoiced', 'paid'].includes(est.status)) {
      return NextResponse.json({ error: 'Estimate must be approved by the client before creating an invoice' }, { status: 400 })
    }

    // Derive invoice number from estimate number: EST-1009 → INV-1009
    const invoiceNumber = (est.estimate_number || '').replace(/^EST-/, 'INV-')

    // A2+A3 FIX: deposit_paid defaults to 0 — pro manually confirms what was actually collected
    // Formula: round(total * percent/100 * 100) / 100 for precision
    const depositPaid  = 0  // Do not assume deposit was collected — pro records it manually
    const balanceDue   = Math.round(est.total * 100) / 100

    // Due date = today (due on receipt default)
    const dueDate = new Date(); dueDate.setHours(23, 59, 59, 0)

    // Freeze line items from estimate_items
    const frozenItems = (est.items || []).map((item: any) => ({
      id:          item.id,
      name:        item.name,
      description: item.description || '',
      qty:         item.qty,
      unit_price:  item.unit_price,
      amount:      item.amount,
    }))

    invoiceData = {
      ...invoiceData,
      estimate_id,
      lead_id:       est.lead_id || lead_id,
      lead_name:     est.lead_name || lead_name,
      trade:         est.trade || trade,
      contact_name:  est.contact_name || contact_name,
      contact_email: est.contact_email || contact_email,
      contact_phone: est.contact_phone || contact_phone,
      invoice_number: invoiceNumber,
      items:          frozenItems,
      subtotal:       est.subtotal,
      discount:       est.discount,
      discount_type:  est.discount_type || '$',
      tax_rate:       est.tax_rate,
      tax_amount:     est.tax_amount,
      total:          est.total,
      deposit_paid:   depositPaid,
      balance_due:    balanceDue,
      terms:          est.terms,
      notes:          est.notes,
      payment_terms:  bodyTerms || 'due_on_receipt',
      due_date:       bodyDueDate || dueDate.toISOString(),
      status:         'draft',
    }
  } else {
    // Blank invoice — assign next number
    const { count } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('pro_id', pro_id)
    const num = String((count || 0) + 1001).padStart(4, '0')
    invoiceData = {
      ...invoiceData,
      invoice_number: `INV-${num}`,
      items:    [],
      subtotal: 0, discount: 0, tax_rate: 0, tax_amount: 0,
      total: 0, deposit_paid: 0, balance_due: 0,
      payment_terms: 'due_on_receipt',
      due_date: new Date(Date.now() + 86400000).toISOString(),
      status: 'draft',
    }
  }

  const { data: invoice, error } = await sb.from('invoices').insert(invoiceData).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If created from estimate, mark estimate as invoiced
  if (estimate_id) {
    await sb.from('estimates').update({
      status:      'invoiced' as any,
      invoiced_at: new Date().toISOString(),
      invoice_id:  invoice.id,
    }).eq('id', estimate_id)
  }

  // ── Roofing invoices get a roofing_invoice_data row immediately ─────────
  // Populated from roofing_job_data (insurance fields) if this is a roofing lead
  if (invoice && invoiceData.lead_id) {
    const { data: estRow } = await sb
      .from('estimates').select('trade_slug').eq('id', estimate_id ?? '').maybeSingle()
    const tradeSlug = estRow?.trade_slug ?? ''

    if (tradeSlug.includes('roof')) {
      // Pull insurance data from roofing_job_data to pre-fill invoice extension
      const { data: jobData } = await sb
        .from('roofing_job_data')
        .select('insurance_company, claim_number, approved_amount, deductible, supplement_amount, permit_number, permit_status')
        .eq('lead_id', invoiceData.lead_id as string)
        .maybeSingle()

      await sb.from('roofing_invoice_data').upsert({
        invoice_id:        invoice.id,
        pro_id:            pro_id,
        insurance_company: jobData?.insurance_company ?? null,
        claim_number:      jobData?.claim_number      ?? null,
        approved_amount:   jobData?.approved_amount   ?? null,
        deductible:        jobData?.deductible         ?? null,
        supplement_amount: jobData?.supplement_amount  ?? null,
        permit_number:     jobData?.permit_number      ?? null,
        permit_status:     jobData?.permit_status      ?? null,
      }, { onConflict: 'invoice_id' })
    }
  }

  return NextResponse.json({ invoice }, { status: 201 })
}
