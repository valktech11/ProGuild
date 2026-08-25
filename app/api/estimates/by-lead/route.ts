import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// GET /api/estimates/by-lead?lead_id=<uuid>&pro_id=<uuid>
// Returns the most recent non-void estimate for a lead.
// Used by the mobile app Lead Detail screen to show estimate status + amount.
// Response: { estimate: { id, status, total, public_url } | null }

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { companyId: _byLeadCompanyId, proId: _byLeadProId } = __auth
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')

  if (!leadId) {
    return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('estimates')
    .select('id, status, total, sent_at, approved_at, viewed_at, invoiced_at, paid_at')
    .eq('lead_id', leadId)
    .or(`company_id.eq.${_byLeadCompanyId},lead_id.eq.${leadId}`)
    .not('status', 'in', '("void","declined")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[estimates/by-lead] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ estimate: null })
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging.proguild.ai').replace(/\/$/, '')

  return NextResponse.json({
    estimate: {
      id:          data.id,
      status:      data.status,
      total:       data.total,
      // Public URL the homeowner uses to view/approve — also used for "View Estimate" on mobile
      public_url:  `${appUrl}/estimate/${data.id}`,
      sent_at:     data.sent_at     ?? null,
      viewed_at:   data.viewed_at   ?? null,
      approved_at: data.approved_at ?? null,
      invoiced_at: data.invoiced_at ?? null,
      paid_at:     data.paid_at     ?? null,
    }
  })
}
