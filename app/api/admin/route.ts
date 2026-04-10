import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Verify caller is admin
async function verifyAdmin(req: NextRequest) {
  const proId = req.headers.get('x-pro-id')
  if (!proId) return false
  const { data } = await getSupabaseAdmin()
    .from('pros').select('is_admin').eq('id', proId).single()
  return data?.is_admin === true
}

// GET /api/admin?section=dashboard|pros|leads|moderation|config
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const section = new URL(req.url).searchParams.get('section') || 'dashboard'
  const sb = getSupabaseAdmin()

  if (section === 'dashboard') {
    const [
      { count: totalPros },
      { count: claimedPros },
      { count: totalLeads },
      { count: newLeads },
      { count: totalPosts },
      { data: cityData },
      { data: tradeData },
    ] = await Promise.all([
      sb.from('pros').select('id', { count: 'exact', head: true }).eq('profile_status','Active'),
      sb.from('pros').select('id', { count: 'exact', head: true }).eq('is_claimed', true),
      sb.from('leads').select('id', { count: 'exact', head: true }),
      sb.from('leads').select('id', { count: 'exact', head: true }).eq('status','New'),
      sb.from('posts').select('id', { count: 'exact', head: true }),
      sb.from('pros').select('city, state').eq('profile_status','Active').eq('is_claimed',true).limit(500),
      sb.from('pros').select('trade_category:trade_categories(category_name)').eq('profile_status','Active').limit(500),
    ])

    // City breakdown
    const cityMap: Record<string, number> = {}
    for (const p of cityData || []) {
      const key = `${p.city}, ${p.state}`
      cityMap[key] = (cityMap[key] || 0) + 1
    }
    const topCities = Object.entries(cityMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([city, count]) => ({ city, count }))

    // Trade breakdown
    const tradeMap: Record<string, number> = {}
    for (const p of tradeData || []) {
      const name = (p.trade_category as any)?.category_name || 'Unknown'
      tradeMap[name] = (tradeMap[name] || 0) + 1
    }
    const topTrades = Object.entries(tradeMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([trade, count]) => ({ trade, count }))

    return NextResponse.json({
      totalPros, claimedPros,
      unclaimedPros: (totalPros || 0) - (claimedPros || 0),
      totalLeads, newLeads, totalPosts,
      topCities, topTrades,
    })
  }

  if (section === 'pros') {
    const params = new URL(req.url).searchParams
    const search  = params.get('search') || ''
    const trade   = params.get('trade') || ''
    const claimed = params.get('claimed') || ''
    const limit   = parseInt(params.get('limit') || '50')
    const offset  = parseInt(params.get('offset') || '0')

    let q = sb.from('pros')
      .select('*, trade_category:trade_categories(category_name)', { count: 'exact' })
    if (search)            q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`)
    if (trade)             q = q.eq('trade_category_id', trade)
    if (claimed === 'true')  q = q.eq('is_claimed', true)
    if (claimed === 'false') q = q.eq('is_claimed', false)
    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    const { data, count } = await q
    return NextResponse.json({ pros: data || [], total: count || 0 })
  }

  if (section === 'leads') {
    const { data } = await sb.from('leads')
      .select('*, pro:pros(full_name, email, city, trade_category:trade_categories(category_name))')
      .order('created_at', { ascending: false }).limit(100)
    return NextResponse.json({ leads: data || [] })
  }

  if (section === 'moderation') {
    const [{ data: posts }, { data: reviews }] = await Promise.all([
      sb.from('posts').select('*, pro:pros(full_name)').eq('is_flagged', true).order('created_at', { ascending: false }).limit(50),
      sb.from('reviews').select('*, pro:pros(full_name, city)').eq('is_approved', false).order('reviewed_at', { ascending: false }).limit(50),
    ])
    return NextResponse.json({ posts: posts || [], reviews: reviews || [] })
  }

  if (section === 'config') {
    const { data } = await sb.from('site_config').select('*')
    const config: Record<string, string> = {}
    for (const row of data || []) config[row.key] = row.value
    return NextResponse.json({ config })
  }

  return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
}

// PATCH /api/admin — update pro or config
export async function PATCH(req: NextRequest) {
  if (!await verifyAdmin(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json()
  const sb   = getSupabaseAdmin()

  // Update site config key
  if (body.config_key !== undefined) {
    const { error } = await sb.from('site_config')
      .upsert({ key: body.config_key, value: String(body.config_value), updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Update pro
  if (body.pro_id) {
    const allowed = ['profile_status','is_verified','is_admin','plan_tier']
    const updates: Record<string, any> = {}
    for (const k of allowed) if (k in body) updates[k] = body[k]
    const { data, error } = await sb.from('pros').update(updates).eq('id', body.pro_id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ pro: data })
  }

  // Delete post (moderation)
  if (body.delete_post_id) {
    await sb.from('posts').delete().eq('id', body.delete_post_id)
    return NextResponse.json({ ok: true })
  }

  // Approve review
  if (body.approve_review_id) {
    await sb.from('reviews').update({ is_approved: true }).eq('id', body.approve_review_id)
    return NextResponse.json({ ok: true })
  }

  // Delete review
  if (body.delete_review_id) {
    await sb.from('reviews').delete().eq('id', body.delete_review_id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}
