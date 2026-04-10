import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/b2b — list active B2B jobs
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const trade    = searchParams.get('trade')
  const state    = searchParams.get('state')
  const jobType  = searchParams.get('job_type')
  const limit    = parseInt(searchParams.get('limit') || '20')
  const offset   = parseInt(searchParams.get('offset') || '0')

  let q = getSupabaseAdmin()
    .from('b2b_jobs')
    .select(`
      *,
      company:companies(id, name, city, state, company_type, logo_url, is_verified),
      trade_category:trade_categories(id, category_name)
    `, { count: 'exact' })
    .eq('is_active', true)
    .order('posted_at', { ascending: false })

  if (trade)   q = q.eq('trade_category_id', trade)
  if (state)   q = q.ilike('state', state)
  if (jobType) q = q.eq('job_type', jobType)
  q = q.range(offset, offset + limit - 1)

  const { data, count, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data || [], total: count || 0 })
}

// POST /api/b2b — post a new job (companies) or apply to a job (pros)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const sb   = getSupabaseAdmin()

  // Apply to a job
  if (body.action === 'apply') {
    const { job_id, pro_id, message } = body
    if (!job_id || !pro_id) return NextResponse.json({ error: 'job_id and pro_id required' }, { status: 400 })

    const { data, error } = await sb.from('b2b_applications')
      .insert({ job_id, pro_id, message: message || null })
      .select().single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Already applied' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Notify company via notification (reuse notifications table for now)
    const { data: job } = await sb.from('b2b_jobs').select('title, company_id').eq('id', job_id).single()
    const { data: pro } = await sb.from('pros').select('full_name').eq('id', pro_id).single()
    if (job && pro) {
      await sb.from('notifications').insert({
        pro_id:   pro_id,
        type:     'new_follower',
        message:  `You applied to "${job.title}"`,
        link:     `/hire`,
        actor_id: pro_id,
      })
    }
    return NextResponse.json({ application: data }, { status: 201 })
  }

  // Post a new job (unauthenticated for now, requires company details)
  const { company_name, company_email, trade_category_id, title, description,
          city, state, job_type, pay_range_min, pay_range_max, pay_type,
          duration, requirements, company_type } = body

  if (!title || !description || !company_name || !company_email) {
    return NextResponse.json({ error: 'title, description, company name and email required' }, { status: 400 })
  }

  // Upsert company
  let companyId: string
  const { data: existing } = await sb.from('companies').select('id').eq('email', company_email).single()
  if (existing) {
    companyId = existing.id
  } else {
    const { data: newCo, error: coErr } = await sb.from('companies')
      .insert({ name: company_name, email: company_email, city, state, company_type: company_type || 'Other' })
      .select().single()
    if (coErr) return NextResponse.json({ error: coErr.message }, { status: 500 })
    companyId = newCo.id
  }

  const { data, error } = await sb.from('b2b_jobs').insert({
    company_id: companyId, trade_category_id: trade_category_id || null,
    title, description, city, state,
    job_type: job_type || 'Full-time',
    pay_range_min: pay_range_min || null, pay_range_max: pay_range_max || null,
    pay_type: pay_type || 'hourly',
    duration: duration || null, requirements: requirements || null,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job: data }, { status: 201 })
}
