import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notify, notifyOwners, sendPushToFcmToken } from '@/lib/notifications'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // Single fetch — get everything needed for both validation and notification
  const { data: est } = await sb
    .from('estimates')
    .select('status, valid_until, lead_id, estimate_number, pro_id, lead_name, company_id')
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

  // In-app notify + FCM push — all data already in hand, no second DB fetch
  const proId     = est.pro_id as string | null
  const companyId = est.company_id as string | null
  const leadLabel = est.lead_name || 'A homeowner'

  if (proId) {
    // In-app notification
    void notify({
      proId, companyId,
      type:   'estimate_approved',
      title:  'Estimate approved! 🎉',
      body:   `${leadLabel} approved your estimate`,
      leadId: est.lead_id ?? null,
    })

    // FCM — fetch token directly via REST (avoids JS client cold-start)
    void (async () => {
      try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseUrl || !serviceKey) return
        const res = await fetch(`${supabaseUrl}/rest/v1/pros?id=eq.${proId}&select=fcm_token`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        })
        const rows = await res.json() as { fcm_token: string | null }[]
        const token = rows?.[0]?.fcm_token
        if (token) await sendPushToFcmToken(token, 'Estimate approved! 🎉', `${leadLabel} approved your estimate`)
      } catch (e) {
        console.error('[approve] FCM push failed:', e)
      }
    })()

    // Notify company owners
    if (companyId) {
      void notifyOwners(companyId, proId, {
        type:   'estimate_approved',
        title:  'Estimate approved! 🎉',
        body:   `${leadLabel} approved an estimate`,
        leadId: est.lead_id ?? null,
      })
      void (async () => {
        try {
          const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
          const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
          if (!supabaseUrl || !serviceKey) return
          const res = await fetch(
            `${supabaseUrl}/rest/v1/company_members?company_id=eq.${companyId}&role=eq.owner&pro_id=neq.${proId}&select=pro_id`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          )
          const members = await res.json() as { pro_id: string }[]
          for (const m of members ?? []) {
            const r2 = await fetch(`${supabaseUrl}/rest/v1/pros?id=eq.${m.pro_id}&select=fcm_token`, {
              headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
            })
            const rows2 = await r2.json() as { fcm_token: string | null }[]
            const t2 = rows2?.[0]?.fcm_token
            if (t2) await sendPushToFcmToken(t2, 'Estimate approved! 🎉', `${leadLabel} approved an estimate`)
          }
        } catch (e) {
          console.error('[approve] Owner FCM push failed:', e)
        }
      })()
    }
  }

  return NextResponse.json({ ok: true })
}
