// app/api/roofing/warranties/route.ts
// POST /api/roofing/warranties
// Inserts a warranty record into roofing_warranties table.
// Triggered by WarrantyRecord component after job_won stage.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
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
    .eq('pro_id', pro_id)
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
  const proId  = req.nextUrl.searchParams.get('pro_id')
  const leadId = req.nextUrl.searchParams.get('lead_id')

  if (!proId || !UUID_RE.test(proId)) {
    return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  let query = sb
    .from('roofing_warranties')
    .select('*, lead:leads(contact_name, property_address, contact_city, contact_state)')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (leadId && UUID_RE.test(leadId)) {
    query = query.eq('lead_id', leadId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the joined lead fields so the client doesn't dig into a nested object.
  const warranties = (data ?? []).map((w: any) => {
    const lead = w.lead ?? {}
    const { lead: _drop, ...rest } = w
    return {
      ...rest,
      homeowner_name:   lead.contact_name ?? null,
      property_address: lead.property_address ?? null,
      property_city:    lead.contact_city ?? null,
      property_state:   lead.contact_state ?? null,
    }
  })
  return NextResponse.json({ warranties })
}
