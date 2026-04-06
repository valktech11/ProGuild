import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const trade    = searchParams.get('trade')
  const search   = searchParams.get('search')
  const status   = searchParams.get('status') || 'Active'
  const limit    = parseInt(searchParams.get('limit') || '100')
  const email    = searchParams.get('email')

  let query = getSupabaseAdmin()
    .from('pros')
    .select(`
      *,
      trade_category:trade_categories(id, category_name, slug),
      review_count:reviews(count),
      lead_count:leads(count)
    `)
    .eq('profile_status', status)
    .limit(limit)
    .order('is_verified', { ascending: false })
    .order('created_at', { ascending: false })

  if (trade)  query = query.eq('trade_category_id', trade)
  if (email)  query = query.ilike('email', email)
  if (search) query = query.or(
    `full_name.ilike.%${search}%,city.ilike.%${search}%,zip_code.ilike.%${search}%`
  )

  const { data, error } = await query

  if (error) {
    console.error('GET /api/pros error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Flatten counts
  const pros = (data || []).map((p: any) => ({
    ...p,
    review_count: p.review_count?.[0]?.count ?? 0,
    lead_count:   p.lead_count?.[0]?.count ?? 0,
  }))

  return NextResponse.json({ pros })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    full_name, email, phone, city, state, zip_code,
    years_experience, trade_category_id
  } = body

  if (!full_name || !email) {
    return NextResponse.json({ error: 'full_name and email are required' }, { status: 400 })
  }

  // Check for duplicate email
  const { data: existing } = await getSupabaseAdmin()
    .from('pros')
    .select('id')
    .ilike('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('pros')
    .insert({
      full_name,
      email: email.toLowerCase().trim(),
      phone: phone || null,
      city: city || null,
      state: state || null,
      zip_code: zip_code || null,
      years_experience: years_experience || null,
      trade_category_id: trade_category_id || null,
      plan_tier: 'Free',
      profile_status: 'Active',
      is_verified: false,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/pros error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ pro: data }, { status: 201 })
}
