// app/api/roofing/warranties/route.ts
// POST /api/roofing/warranties
// Inserts a warranty record into roofing_warranties table.
// Triggered by WarrantyRecord component after job_won stage.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { computeWarrantyStatus } from '@/lib/roofing/warranty'
import { requirePro } from '@/lib/pro-auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const _wCompanyId = __auth.companyId
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    pro_id,
    lead_id,
    property_id,
    shingle_brand,
    shingle_model,
    warranty_term,
    install_date,
    expiry_date,
  } = body as Record<string, string | null>

  if (!pro_id || !UUID_RE.test(pro_id)) {
    return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  }
  if (!lead_id || !UUID_RE.test(lead_id)) {
    return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
  }
  if (!shingle_brand || !warranty_term || !install_date) {
    return NextResponse.json({ error: 'shingle_brand, warranty_term, install_date required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Verify ownership
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .select('id, pro_id')
    .eq('id', lead_id)
    .eq(_wCompanyId ? 'company_id' : 'pro_id', _wCompanyId ?? pro_id)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })
  }

  const { data: warranty, error: insertErr } = await sb
    .from('roofing_warranties')
    .insert({
      pro_id,
      lead_id,
      property_id:    property_id || null,
      shingle_brand,
      shingle_model:  shingle_model || null,
      warranty_term,
      install_date,
      expiry_date:    expiry_date || null,
      created_at:     new Date().toISOString(),
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[warranties] insert error:', insertErr.message)
    return NextResponse.json({ error: 'Failed to create warranty' }, { status: 500 })
  }

  return NextResponse.json({ success: true, warranty })
}

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const _wGetCompanyId = __auth.companyId
  const _wGetProId = __auth.proId
  const _wGetRole = __auth.role
  const proId  = _wGetProId
  const leadId = req.nextUrl.searchParams.get('lead_id')

  if (!proId || !UUID_RE.test(proId)) {
    return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  // Member: only warranties for their assigned leads
  let _wLeadIds2: string[] | null = null
  if (_wGetRole === 'member' && _wGetProId) {
    const { data: _ml } = await sb.from('leads').select('id')
      .eq('company_id', _wGetCompanyId).eq('assigned_to_pro_id', _wGetProId).is('deleted_at', null)
    _wLeadIds2 = (_ml ?? []).map((l: any) => l.id)
  }
  let query = sb
    .from('roofing_warranties')
    .select('*, lead:leads(contact_name, property_address, contact_city, contact_state)')
    .eq(_wGetCompanyId ? 'company_id' : 'pro_id', _wGetCompanyId ?? _wGetProId)
    .order('created_at', { ascending: false })
  if (_wLeadIds2 !== null && _wLeadIds2.length > 0) query = query.in('lead_id', _wLeadIds2)
  if (_wLeadIds2 !== null && _wLeadIds2.length === 0) return NextResponse.json({ warranties: [] })

  if (leadId && UUID_RE.test(leadId)) {
    query = query.eq('lead_id', leadId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the joined lead fields so the client doesn't dig into a nested object.
  const warranties = (data ?? []).map((w: any) => {
    const lead = w.lead ?? {}
    const { lead: _drop, ...rest } = w
    const st = computeWarrantyStatus(w.expiry_date)
    return {
      ...rest,
      status_key:       st.key,
      status_label:     st.label,
      homeowner_name:   lead.contact_name ?? null,
      property_address: lead.property_address ?? null,
      property_city:    lead.contact_city ?? null,
      property_state:   lead.contact_state ?? null,
    }
  })
  return NextResponse.json({ warranties })
}
