import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // Guard: status AND expiry check server-side
  const { data: est } = await sb
    .from('estimates')
    .select('status, valid_until, lead_id, estimate_number')
    .eq('id', id)
    .single()

  if (!est) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['sent', 'viewed'].includes(est.status))
    return NextResponse.json({ error: 'Estimate cannot be approved in its current state' }, { status: 400 })
  if (new Date(est.valid_until) < new Date())
    return NextResponse.json({ error: 'Estimate has expired' }, { status: 400 })

  // Approve this estimate
  await sb.from('estimates').update({
    status:      'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', id)

  // Auto-void all other active estimates for the same lead
  // Prevents double-counting and orphaned sent estimates (Vaibhav scenario)
  if (est.lead_id) {
    await sb.from('estimates')
      .update({
        status:      'void',
        voided_at:   new Date().toISOString(),
        void_reason: `Superseded by approved estimate ${est.estimate_number}`,
      })
      .eq('lead_id', est.lead_id)
      .neq('id', id)
      .in('status', ['draft', 'sent', 'viewed'])
  }

  return NextResponse.json({ ok: true })
}
