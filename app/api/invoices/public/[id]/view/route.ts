import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyRoofer } from '@/lib/notifyRoofer'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: inv } = await sb
    .from('invoices')
    .select('id, status, viewed_at, viewed_count, pro_id, lead_id, lead_name, invoice_number')
    .eq('id', id)
    .maybeSingle()

  if (!inv) return NextResponse.json({ ok: true })
  if (['draft', 'paid', 'void'].includes(inv.status)) return NextResponse.json({ ok: true })

  await sb.from('invoices').update({
    viewed_at:    inv.viewed_at || new Date().toISOString(),
    viewed_count: (inv.viewed_count || 0) + 1,
    status:       inv.status === 'sent' ? 'viewed' : inv.status,
    updated_at:   new Date().toISOString(),
  }).eq('id', id)

  // Write pipeline_event
  if (inv.lead_id) {
    await sb.from('pipeline_events').insert({
      lead_id:    inv.lead_id,
      pro_id:     inv.pro_id,
      event_type: 'invoice_viewed',
      event_data: { invoice_id: id, invoice_number: inv.invoice_number },
      actor_type: 'homeowner',
      created_at: new Date().toISOString(),
    })
  }

  // Notify roofer on first view only
  if (!inv.viewed_at && inv.pro_id) {
    await notifyRoofer({
      proId:    inv.pro_id,
      subject:  `👁️ Invoice viewed — ${inv.lead_name}`,
      headline: 'Invoice Viewed',
      body:     `${inv.lead_name} has opened invoice ${inv.invoice_number}. Good time to follow up if payment hasn't arrived.`,
      leadId:   inv.lead_id,
      sb,
    })
  }

  return NextResponse.json({ ok: true })
}
