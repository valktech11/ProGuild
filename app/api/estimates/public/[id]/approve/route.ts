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

  // Notify the pro who created the estimate + owner (if different)
  try {
    const { data: fullEst } = await sb.from('estimates').select('pro_id, lead_name, company_id').eq('id', id).single()
    if (fullEst) {
      const { notify, notifyOwners } = await import('@/lib/notifications')
      const leadLabel = (fullEst as any).lead_name || 'a homeowner'

      // Notify the estimate creator (the member or owner who sent it)
      if ((fullEst as any).pro_id) {
        await notify({
          proId:     (fullEst as any).pro_id,
          companyId: (fullEst as any).company_id ?? null,
          type:      'estimate_approved',
          title:     'Estimate approved! 🎉',
          body:      `${leadLabel} approved your estimate`,
          leadId:    est.lead_id ?? null,
        })
      }

      // Also notify owners (if creator was a member)
      if ((fullEst as any).company_id && (fullEst as any).pro_id) {
        await notifyOwners((fullEst as any).company_id, (fullEst as any).pro_id, {
          type:   'estimate_approved',
          title:  'Estimate approved! 🎉',
          body:   `${leadLabel} approved an estimate`,
          leadId: est.lead_id ?? null,
        })
      }
    }
  } catch {}

  return NextResponse.json({ ok: true })
}
