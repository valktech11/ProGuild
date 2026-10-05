import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'
import { createHash } from 'crypto'

// ── POST /api/profile-views ──────────────────────────────────────────────────
// Record a profile view. Called from /pro/[id] on page load.
// Body: { pro_id: string }   — the profile being viewed
// Auth: optional bearer token (logged-in pro); no auth = anonymous view
//
// Dedup rules:
//   logged-in viewer  — one view per viewer_id per pro_id per 24h
//   anonymous visitor — one view per hashed session_token per pro_id per 24h
//
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const profileProId = body.pro_id as string | undefined
    if (!profileProId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Try to identify viewer from bearer token (optional — no 401 if absent)
    let viewerId: string | null = null
    const auth = req.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      try {
        // Lightweight token→pro lookup without full requirePro enforcement
        const token = auth.slice(7)
        const { data: { user } } = await getSupabaseAdmin().auth.getUser(token)
        if (user?.id) {
          const { data: pro } = await supabase
            .from('pros')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()
          viewerId = pro?.id ?? null
        }
      } catch { /* anonymous fallback */ }
    }

    // Skip own-profile views
    if (viewerId && viewerId === profileProId) {
      return NextResponse.json({ recorded: false, reason: 'own_profile' })
    }

    if (viewerId) {
      // Logged-in viewer — dedup by viewer_id
      const { count } = await supabase
        .from('profile_views')
        .select('id', { count: 'exact', head: true })
        .eq('pro_id', profileProId)
        .eq('viewer_id', viewerId)
        .gte('created_at', since)

      if ((count ?? 0) > 0) return NextResponse.json({ recorded: false, reason: 'dedup' })

      await supabase.from('profile_views').insert({
        pro_id: profileProId,
        viewer_id: viewerId,
        viewer_type: 'pro',
      })
    } else {
      // Anonymous — dedup by hashed session cookie
      const sessionCookie = req.cookies.get('pg_sv')?.value
        ?? req.headers.get('x-pg-session')
        ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? 'unknown'
      const tokenHash = createHash('sha256').update(`pv:${profileProId}:${sessionCookie}`).digest('hex').slice(0, 32)

      const { count } = await supabase
        .from('profile_views')
        .select('id', { count: 'exact', head: true })
        .eq('pro_id', profileProId)
        .eq('session_token', tokenHash)
        .gte('created_at', since)

      if ((count ?? 0) > 0) return NextResponse.json({ recorded: false, reason: 'dedup' })

      await supabase.from('profile_views').insert({
        pro_id: profileProId,
        viewer_type: 'anonymous',
        session_token: tokenHash,
      })
    }

    return NextResponse.json({ recorded: true })
  } catch (e) {
    console.error('profile-views POST', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

// ── GET /api/profile-views ───────────────────────────────────────────────────
// Fetch view stats for the authenticated pro's own profile.
// Query: ?pro_id=<uuid>&days=7|30
//
// Returns:
//   total       — total views in window
//   unique      — unique identified viewers (logged-in pros only)
//   anon        — anonymous visitor count
//   by_type     — breakdown by viewer trade category
//   sparkline   — array of daily counts for last 7 days
//   actions     — follows, messages, project_views from viewers (30d)
//   viewers     — array of viewer objects (pro-only; for paid tier gating)
//
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const proId = url.searchParams.get('pro_id')
  const days = parseInt(url.searchParams.get('days') ?? '7', 10)

  const auth = await requirePro(req, proId)
  if (auth.error) return auth.error
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // All views in window
  const { data: views, error } = await supabase
    .from('profile_views')
    .select('id, viewer_id, viewer_type, created_at')
    .eq('pro_id', proId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'db' }, { status: 500 })

  const total = views?.length ?? 0
  const proViews = views?.filter(v => v.viewer_type === 'pro') ?? []
  const anonViews = views?.filter(v => v.viewer_type === 'anonymous') ?? []
  const unique = new Set(proViews.map(v => v.viewer_id)).size

  // 7-day sparkline (always 7 buckets regardless of `days`)
  const sparkline = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toISOString().slice(0, 10)
    return (views ?? []).filter(v => v.created_at.slice(0, 10) === dateStr).length
  })

  // Viewer identity enrichment (for named list — shown to paid tier)
  let viewers: any[] = []
  const viewerIds = [...new Set(proViews.map(v => v.viewer_id).filter(Boolean))]
  if (viewerIds.length > 0) {
    const { data: pros } = await supabase
      .from('pros')
      .select('id, full_name, slug, city, state, profile_photo_url, trade_category:trade_categories(category_name, slug)')
      .in('id', viewerIds.slice(0, 50))
    const proMap = Object.fromEntries((pros ?? []).map(p => [p.id, p]))

    // Build viewers list in reverse-chrono order, deduplicated
    const seen = new Set<string>()
    viewers = proViews
      .filter(v => v.viewer_id && !seen.has(v.viewer_id) && seen.add(v.viewer_id as string))
      .map(v => ({ ...proMap[v.viewer_id!], viewed_at: v.created_at }))
      .filter(v => v.id)
  }

  // Trade breakdown (identified viewers only)
  const byType: Record<string, number> = {}
  viewers.forEach(v => {
    const cat = (v.trade_category as any)?.category_name ?? 'Other'
    byType[cat] = (byType[cat] ?? 0) + 1
  })
  if (anonViews.length > 0) byType['Anonymous'] = anonViews.length

  // Action metrics: follows + messages that came from viewers in last 30d
  // (best-effort — null if no data)
  let actions = { follows: 0, messages: 0 }
  if (viewerIds.length > 0) {
    const actionSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const [{ count: follows }, { count: messages }] = await Promise.all([
      supabase.from('pro_follows').select('id', { count: 'exact', head: true })
        .eq('following_id', proId).in('follower_id', viewerIds).gte('created_at', actionSince),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('receiver_id', proId).in('sender_id', viewerIds).gte('created_at', actionSince),
    ])
    actions = { follows: follows ?? 0, messages: messages ?? 0 }
  }

  return NextResponse.json({
    total,
    unique,
    anon: anonViews.length,
    by_type: byType,
    sparkline,
    actions,
    viewers,        // caller gates display behind paid check
  })
}
