// POST /api/review/send
// Authenticated — sends review request for a lead on-demand
// Works for both owner and member (any team member can trigger)
// Body: { lead_id }

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { queueAndSendReviewRequest } from '@/lib/review'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const { lead_id } = await req.json()
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  // Verify lead belongs to this pro's company
  const sb = getSupabaseAdmin()
  const { data: lead } = await sb
    .from('leads')
    .select('id, company_id, contact_email')
    .eq('id', lead_id)
    .eq('company_id', auth.companyId!)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!(lead as any).contact_email) return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 })

  // Delete existing review_request for this lead so we can resend
  // (allows manual re-trigger even if auto-trigger already ran)
  await sb.from('review_requests').delete().eq('lead_id', lead_id).eq('status', 'queued')

  const result = await queueAndSendReviewRequest({
    proId:     auth.proId!,
    companyId: auth.companyId ?? null,
    leadId:    lead_id,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  if (result.skipped) return NextResponse.json({ ok: true, skipped: result.skipped })

  return NextResponse.json({ ok: true, sent: result.sent })
}
