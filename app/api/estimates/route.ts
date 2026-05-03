import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Base state sales tax rates (Tax Foundation 2024)
// These are state-level rates only — county/city additions vary
const STATE_TAX_RATES: Record<string, number> = {
  AL: 4.0,  AK: 0.0,  AZ: 5.6,  AR: 6.5,  CA: 7.25,
  CO: 2.9,  CT: 6.35, DE: 0.0,  FL: 6.0,  GA: 4.0,
  HI: 4.0,  ID: 6.0,  IL: 6.25, IN: 7.0,  IA: 6.0,
  KS: 6.5,  KY: 6.0,  LA: 4.45, ME: 5.5,  MD: 6.0,
  MA: 6.25, MI: 6.0,  MN: 6.875,MS: 7.0,  MO: 4.225,
  MT: 0.0,  NE: 5.5,  NV: 6.85, NH: 0.0,  NJ: 6.625,
  NM: 5.125,NY: 4.0,  NC: 4.75, ND: 5.0,  OH: 5.75,
  OK: 4.5,  OR: 0.0,  PA: 6.0,  RI: 7.0,  SC: 6.0,
  SD: 4.5,  TN: 7.0,  TX: 6.25, UT: 5.95, VT: 6.0,
  VA: 5.3,  WA: 6.5,  WV: 6.0,  WI: 5.0,  WY: 4.0,
  DC: 6.0,
}

// ── GET /api/estimates?pro_id=xxx ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('estimates')
    .select('id, estimate_number, status, lead_name, lead_id, trade, total, created_at, valid_until')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ estimates: data || [] })
}

// ── POST /api/estimates ───────────────────────────────────────────────────
// Creates a blank draft estimate and returns it so the UI can redirect to /[id]
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, lead_id, lead_name, lead_source, trade, force_new, state, contact_phone, contact_email } = body

  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // If lead_id provided and not forcing new, check for existing draft first
  if (lead_id && !force_new) {
    const { data: existing } = await sb
      .from('estimates')
      .select('id, estimate_number, status, total, created_at')
      .eq('pro_id', pro_id)
      .eq('lead_id', lead_id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({ estimate: existing, existed: true })
    }
  }

  // No existing draft — create new
  const { data: numData } = await sb.rpc('next_estimate_number')
  const estimateNumber: string = numData || `EST-${Date.now().toString().slice(-4)}`

  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + 14)

  const { data: estimate, error } = await sb
    .from('estimates')
    .insert({
      pro_id,
      lead_id:         lead_id || null,
      estimate_number: estimateNumber,
      status:          'draft',
      lead_name:       lead_name  || 'New Client',
      lead_source:     lead_source || '',
      trade:           trade || '',
      subtotal:        0,
      discount:        0,
      tax_rate:        STATE_TAX_RATES[state?.toUpperCase() ?? ''] ?? 0,
      tax_amount:      0,
      total:           0,
      deposit_percent: 50,
      require_deposit: true,
      valid_until:     validUntil.toISOString(),
      contact_phone:   contact_phone || null,
      contact_email:   contact_email || null,
      terms:           'This estimate is valid for 14 days. Payment is due upon job completion. A 50% deposit is required to begin work.',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ estimate, existed: false })
}
