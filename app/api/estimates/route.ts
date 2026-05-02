import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── GET /api/estimates?pro_id=xxx ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('estimates')
    .select('id, estimate_number, status, lead_name, trade, total, created_at, valid_until')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ estimates: data || [] })
}

// ── POST /api/estimates ───────────────────────────────────────────────────
// Creates a blank draft estimate and returns it so the UI can redirect to /[id]
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, lead_id, lead_name, lead_source, trade } = body

  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Generate estimate number: EST-XXXX
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
      tax_rate:        0,
      tax_amount:      0,
      total:           0,
      deposit_percent: 50,
      require_deposit: true,
      valid_until:     validUntil.toISOString(),
      terms:           'This estimate is valid for 14 days. Payment is due upon job completion. A 50% deposit is required to begin work.',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ estimate })
}
