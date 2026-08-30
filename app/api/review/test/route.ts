// GET /api/review/test?lead_id=xxx
// Temporary diagnostic endpoint — tests the full review insert flow
// and returns exactly what failed

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const leadId = new URL(req.url).searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'lead_id required' })

  const sb = getSupabaseAdmin()
  const results: Record<string, any> = {}

  // Step 1: fetch lead
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .select('contact_name, contact_phone, contact_email, property_address, pro_id, company_id')
    .eq('id', leadId)
    .single()
  results.lead = { found: !!lead, error: leadErr?.message, data: lead }
  if (!lead) return NextResponse.json(results)

  // Step 2: fetch pro
  const { data: pro, error: proErr } = await sb
    .from('pros')
    .select('full_name, business_name, google_id')
    .eq('id', lead.pro_id)
    .single()
  results.pro = { found: !!pro, error: proErr?.message }
  if (!pro) return NextResponse.json(results)

  // Step 3: check existing
  const { data: existing, error: existErr } = await sb
    .from('review_requests')
    .select('id, status')
    .eq('lead_id', leadId)
    .maybeSingle()
  results.existing = { found: !!existing, data: existing, error: existErr?.message }

  // Step 4: attempt insert
  const { data: rr, error: rrErr } = await sb
    .from('review_requests')
    .insert({
      pro_id:          lead.pro_id,
      company_id:      lead.company_id,
      lead_id:         leadId,
      homeowner_name:  lead.contact_name,
      homeowner_email: lead.contact_email,
      homeowner_phone: lead.contact_phone,
      status:          'queued',
      send_after:      new Date().toISOString(),
    })
    .select('id, token')
    .single()

  results.insert = {
    success: !!rr,
    id: (rr as any)?.id,
    token: (rr as any)?.token,
    error: rrErr?.message,
    code:  rrErr?.code,
    details: rrErr?.details,
    hint: rrErr?.hint,
  }

  return NextResponse.json(results)
}
