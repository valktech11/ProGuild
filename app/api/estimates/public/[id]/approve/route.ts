import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notify, notifyOwners, sendPushToFcmToken } from '@/lib/notifications'

// Helper: fetch fcm_token via direct REST (avoids JS client cold-start)
async function getFcmToken(proId: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/pros?id=eq.${proId}&select=fcm_token`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    })
    const rows = await res.json() as { fcm_token: string | null }[]
    return rows?.[0]?.fcm_token ?? null
  } catch { return null }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  // Single fetch — everything needed for validation + notification
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

  // Auto-void other estimates for same lead
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

    // FCM push — awaited with 5s timeout so Vercel doesn't kill it before it fires
    try {
      const token = await Promise.race([
        getFcmToken(proId),
        new Promise<null>(r => setTimeout(() => r(null), 5000))
      ])
      if (token) {
        await sendPushToFcmToken(token, 'Estimate approved! 🎉', `${leadLabel} approved your estimate`)
        console.log('[approve] FCM push sent to pro:', proId)
      } else {
        console.log('[approve] No FCM token for pro:', proId)
      }
    } catch (e) {
      console.error('[approve] FCM push error:', e)
    }

    // Notify + push owners
    if (companyId) {
      void notifyOwners(companyId, proId, {
        type:   'estimate_approved',
        title:  'Estimate approved! 🎉',
        body:   `${leadLabel} approved an estimate`,
        leadId: est.lead_id ?? null,
      })
      try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (supabaseUrl && serviceKey) {
          const res = await fetch(
            `${supabaseUrl}/rest/v1/company_members?company_id=eq.${companyId}&role=eq.owner&pro_id=neq.${proId}&select=pro_id`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
          )
          const members = await res.json() as { pro_id: string }[]
          for (const m of members ?? []) {
            const t = await getFcmToken(m.pro_id)
            if (t) await sendPushToFcmToken(t, 'Estimate approved! 🎉', `${leadLabel} approved an estimate`)
          }
        }
      } catch (e) {
        console.error('[approve] Owner FCM push error:', e)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
