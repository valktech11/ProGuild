import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const trade  = searchParams.get('trade')
  const status = searchParams.get('status') || 'Open'
  const limit  = parseInt(searchParams.get('limit') || '50')

  let query = getSupabaseAdmin()
    .from('jobs')
    .select(`*, trade_category:trade_categories(id, category_name, slug)`)
    .eq('job_status', status)
    .order('is_boosted', { ascending: false })
    .order('posted_at', { ascending: false })
    .limit(limit)

  if (trade) query = query.eq('trade_category_id', trade)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    title, homeowner_name, homeowner_email, homeowner_phone,
    trade_category_id, city, state, zip_code,
    description, budget_range
  } = body

  if (!title || !homeowner_name || !homeowner_email || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Moderate job description
  const mod = await moderateContent(description)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Job description not allowed: ${mod.reason}. Please keep content professional.`
    }, { status: 422 })
  }

  const expires = new Date()
  expires.setDate(expires.getDate() + 30)

  const { data, error } = await getSupabaseAdmin()
    .from('jobs')
    .insert({
      title, homeowner_name,
      homeowner_email: homeowner_email.toLowerCase().trim(),
      homeowner_phone: homeowner_phone || null,
      trade_category_id: trade_category_id || null,
      city: city || null,
      state: state || null,
      zip_code: zip_code || null,
      description,
      budget_range: budget_range || null,
      job_status: 'Open',
      is_boosted: false,
      expires_at: expires.toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/jobs error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ job: data }, { status: 201 })
}
