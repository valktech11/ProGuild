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
      .select('*, pro:pros(id, full_name, email, phone_cell, city, state, license_number, trade_category:trade_categories(category_name))')
      .order('created_at', { ascending: false }).limit(200)
    return NextResponse.json({ leads: data || [] })
  }

  if (section === 'claims') {
    const { data } = await sb
      .from('pros')
      .select('id, full_name, email, license_number, license_expiry_date, claimed_at, is_verified, profile_status')
      .eq('profile_status', 'Pending_Review')
      .order('claimed_at', { ascending: true })   // oldest first — most urgent
    return NextResponse.json({ claims: data || [] })
  }

  if (section === 'moderation') {
    const [{ data: posts }, { data: pendingReviews }, { data: approvedReviews }] = await Promise.all([
      sb.from('posts').select('*, pro:pros(full_name)').eq('is_flagged', true).order('created_at', { ascending: false }).limit(50),
      sb.from('reviews').select('*, pro:pros(full_name, city)').eq('is_approved', false).order('reviewed_at', { ascending: false }).limit(50),
      sb.from('reviews').select('*, pro:pros(full_name, city)').eq('is_approved', true).order('reviewed_at', { ascending: false }).limit(30),
    ])
    return NextResponse.json({ posts: posts || [], reviews: pendingReviews || [], approvedReviews: approvedReviews || [] })
  }

  // ── Activity: audit trail + login/session history ────────────────────────
  if (section === 'activity') {
    const url      = new URL(req.url)
    const view     = url.searchParams.get('view') || 'changes'   // 'changes' | 'sessions'
    const proParam = url.searchParams.get('pro')  || ''
    const tblParam = url.searchParams.get('table') || ''
    const limit    = Math.min(Number(url.searchParams.get('limit')) || 100, 500)

    if (view === 'sessions') {
      // Login + session history (Phase 1)
      let q = sb
        .from('pro_sessions')
        .select('id, pro_id, device_type, browser, os, ip_address, is_mobile_app, created_at, last_active_at, revoked_at')
        .order('last_active_at', { ascending: false })
        .limit(limit)
      if (proParam) q = q.eq('pro_id', proParam)
      const { data: sessions } = await q

      // Attach pro names
      type ProLite = { id: string; full_name: string | null; email: string | null }
      type SessRow = {
        id: string; pro_id: string; device_type: string | null; browser: string | null;
        os: string | null; ip_address: string | null; is_mobile_app: boolean | null;
        created_at: string; last_active_at: string | null; revoked_at: string | null;
      }
      const sessRows = (sessions ?? []) as SessRow[]
      const proIds = [...new Set(sessRows.map((s: SessRow) => s.pro_id))]
      const { data: prosData } = proIds.length
        ? await sb.from('pros').select('id, full_name, email').in('id', proIds)
        : { data: [] }
      const pros = (prosData ?? []) as ProLite[]
      const proMap = new Map<string, ProLite>(pros.map((p: ProLite) => [p.id, p]))

      return NextResponse.json({
        sessions: sessRows.map((s: SessRow) => ({
          ...s,
          pro_name:  proMap.get(s.pro_id)?.full_name ?? '—',
          pro_email: proMap.get(s.pro_id)?.email ?? '—',
          duration_seconds: s.last_active_at && s.created_at
            ? Math.max(0, Math.round(
                (new Date(s.last_active_at).getTime() - new Date(s.created_at).getTime()) / 1000))
            : 0,
        })),
      })
    }

    // Change ledger (Phase 2)
    let q = sb
      .from('audit_log')
      .select('id, table_name, record_id, action, changed_by, source, device, ip_address, created_at, old_data, new_data')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (proParam) q = q.eq('changed_by', proParam)
    if (tblParam) q = q.eq('table_name', tblParam)
    const { data: entries } = await q

    // Attach actor names
    type ActorLite = { id: string; full_name: string | null; email: string | null }
    type AuditRow = {
      id: string; table_name: string; record_id: string; action: string;
      changed_by: string | null; source: string | null; device: string | null;
      ip_address: string | null; created_at: string;
      old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null;
    }
    const auditRows = (entries ?? []) as AuditRow[]
    const actorIds = [...new Set(auditRows.map((e: AuditRow) => e.changed_by).filter(Boolean))] as string[]
    const { data: actorsData } = actorIds.length
      ? await sb.from('pros').select('id, full_name, email').in('id', actorIds)
      : { data: [] }
    const actors = (actorsData ?? []) as ActorLite[]
    const actorMap = new Map<string, ActorLite>(actors.map((a: ActorLite) => [a.id, a]))

    // Compute changed fields (diff) without shipping full row snapshots
    const NOISE = new Set(['updated_at', 'search_vector', 'lead_status_changed_at'])
    const rows = auditRows.map((e: AuditRow) => {
      const oldD = (e.old_data ?? {}) as Record<string, unknown>
      const newD = (e.new_data ?? {}) as Record<string, unknown>
      const changed: Record<string, { from: unknown; to: unknown }> = {}
      if (e.action === 'UPDATE') {
        for (const k of Object.keys(newD)) {
          if (NOISE.has(k)) continue
          if (JSON.stringify(oldD[k]) !== JSON.stringify(newD[k])) {
            changed[k] = { from: oldD[k] ?? null, to: newD[k] ?? null }
          }
        }
      }
      return {
        id:         e.id,
        table_name: e.table_name,
        record_id:  e.record_id,
        action:     e.action,
        source:     e.source,
        ip_address: e.ip_address,
        created_at: e.created_at,
        actor_name:  e.changed_by ? (actorMap.get(e.changed_by)?.full_name ?? 'Unknown') : 'System',
        actor_email: e.changed_by ? (actorMap.get(e.changed_by)?.email ?? '') : '',
        changed_fields: e.action === 'UPDATE' ? changed : null,
        field_count: e.action === 'UPDATE' ? Object.keys(changed).length : null,
      }
    })

    // Distinct tables for the filter dropdown.
    // The audit_log is large, so sampling recent rows would only surface the
    // most recently-written tables. Use the known audited set from the trigger
    // catalogue instead — always complete, no scan.
    const { data: tblData } = await sb.rpc('audited_table_names')
    let tables: string[] = Array.isArray(tblData)
      ? (tblData as { table_name: string }[]).map(t => t.table_name)
      : []
    if (tables.length === 0) {
      // Fallback: sample the log if the helper function isn't present
      const { data: sample } = await sb.from('audit_log').select('table_name').limit(2000)
      tables = [...new Set(((sample ?? []) as { table_name: string }[]).map(t => t.table_name))]
    }
    tables.sort()

    return NextResponse.json({ entries: rows, tables })
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
  }
  if (body.delete_review_id) {
    await sb.from('reviews').delete().eq('id', body.delete_review_id)
    return NextResponse.json({ ok: true })
  }

  // Delete review
  if (body.delete_review_id) {
    await sb.from('reviews').delete().eq('id', body.delete_review_id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
}
