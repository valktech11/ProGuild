import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

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

  await sb.from('estimates').update({
    status:      'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', id)

  // Auto-void all other active estimates for the same lead
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

  // Notify + push
  try {
    const { data: fullEst } = await sb
      .from('estimates')
      .select('pro_id, lead_name, company_id')
      .eq('id', id)
      .single()

    if (fullEst) {
      const { notify, notifyOwners, sendPushToProId } = await import('@/lib/notifications')
      const leadLabel = (fullEst as any).lead_name || 'A homeowner'
      const proId     = (fullEst as any).pro_id
      const companyId = (fullEst as any).company_id ?? null

      if (proId) {
        await notify({
          proId, companyId,
          type:   'estimate_approved',
          title:  'Estimate approved! 🎉',
          body:   `${leadLabel} approved your estimate`,
          leadId: est.lead_id ?? null,
        })
        // FCM push to estimate creator
        void sendPushToProId(
          proId,
          'Estimate approved! 🎉',
          `${leadLabel} approved your estimate`,
        )
      }

      if (companyId && proId) {
        await notifyOwners(companyId, proId, {
          type:   'estimate_approved',
          title:  'Estimate approved! 🎉',
          body:   `${leadLabel} approved an estimate`,
          leadId: est.lead_id ?? null,
        })
        // FCM push to owners — fetch owner pro_ids and push each
        void (async () => {
          try {
            const { data: owners } = await sb
              .from('company_members')
              .select('pro_id')
              .eq('company_id', companyId)
              .eq('role', 'owner')
              .neq('pro_id', proId)
            for (const o of owners ?? []) {
              void sendPushToProId(
                o.pro_id,
                'Estimate approved! 🎉',
                `${leadLabel} approved an estimate`,
              )
            }
          } catch {}
        })()
      }
    }
  } catch {}

  return NextResponse.json({ ok: true })
}
