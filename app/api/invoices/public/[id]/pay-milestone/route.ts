import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStageAnchors } from '@/lib/trades/_registry'
import { notifyRoofer } from '@/lib/notifyRoofer'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body   = await req.json()
  const { milestone_name, amount, method, reference, date } = body

  if (!milestone_name || !amount || !method) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: inv, error } = await sb
    .from('invoices')
    .select('id, status, total, amount_paid, balance_due, payment_history, lead_id, pro_id')
    .eq('id', id)
    .single()

  if (error || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (['void', 'paid'].includes(inv.status)) {
    return NextResponse.json({ error: 'Invoice cannot be updated' }, { status: 400 })
  }

  const newPayment = {
    id:             crypto.randomUUID(),
    milestone_name,
    amount:         Number(amount),
    method,
    reference:      reference || null,
    date:           date || new Date().toISOString().split('T')[0],
    recorded_at:    new Date().toISOString(),
    source:         'homeowner',
  }

  const history    = [...((inv.payment_history as any[]) ?? []), newPayment]
  const totalPaid  = history.reduce((s: number, p: any) => s + Number(p.amount), 0)
  const balanceDue = Math.max(0, Number(inv.total) - totalPaid)
  const newStatus  = balanceDue <= 0 ? 'paid' : totalPaid > 0 ? 'partial_payment' : inv.status

  await sb.from('invoices').update({
    payment_history: history,
    amount_paid:     totalPaid,
    balance_due:     balanceDue,
    status:          newStatus,
    paid_at:         balanceDue <= 0 ? new Date().toISOString() : null,
    updated_at:      new Date().toISOString(),
  }).eq('id', id)

  if (balanceDue <= 0 && inv.lead_id) {
    const { data: leadRow } = await sb
      .from('leads').select('lead_status, pro_id').eq('id', inv.lead_id).single()
    if (leadRow) {
      const { data: proRow } = await sb
        .from('pros').select('trade_slug').eq('id', leadRow.pro_id ?? inv.pro_id).single()
      const anchors  = getStageAnchors(proRow?.trade_slug)
      const terminal = [anchors.won, anchors.lost ?? 'lost', 'unqualified']
      if (!terminal.includes(leadRow.lead_status)) {
        await sb.from('leads').update({
          lead_status:            anchors.won,
          lead_status_changed_at: new Date().toISOString(),
          updated_at:             new Date().toISOString(),
        }).eq('id', inv.lead_id)
      }
    }
  }

  // Write pipeline_event so activity feed shows payment
  if (inv.lead_id) {
    await sb.from('pipeline_events').insert({
      lead_id:    inv.lead_id,
      pro_id:     inv.pro_id,
      event_type: 'payment_received',
      event_data: {
        milestone: milestone_name,
        amount:    Number(amount),
        method,
        balance_due: balanceDue,
        invoice_id: id,
      },
      actor_type: 'homeowner',
      created_at: new Date().toISOString(),
    })
  }

  // Notify roofer of offline payment
  const { data: invForNotif } = await sb
    .from('invoices').select('pro_id, lead_id, lead_name, invoice_number').eq('id', id).maybeSingle()
  if (invForNotif) {
    const amtFmt = `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    const balFmt = `$${Math.max(balanceDue,0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    const isPaidFull = balanceDue <= 0
    await notifyRoofer({
      proId:    invForNotif.pro_id,
      subject:  isPaidFull ? `💰 Invoice paid in full — ${invForNotif.lead_name}` : `💳 Payment confirmed — ${invForNotif.lead_name}`,
      headline: isPaidFull ? 'Invoice Paid in Full' : 'Payment Confirmed',
      body:     isPaidFull
        ? `${invForNotif.lead_name} confirmed payment of ${amtFmt} (${milestone_name}). Invoice ${invForNotif.invoice_number} is now paid in full.`
        : `${invForNotif.lead_name} confirmed ${amtFmt} (${milestone_name}) via ${method}. Balance remaining: ${balFmt}.`,
      leadId:   invForNotif.lead_id,
      sb,
    })
  }

  return NextResponse.json({ ok: true, status: newStatus, amount_paid: totalPaid, balance_due: balanceDue, payment: newPayment })
}
