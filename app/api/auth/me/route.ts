// app/api/auth/me/route.ts
// Returns the logged-in pro's session + their company context.
// Additive: all existing session fields preserved; company_id + company added.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifySupabaseToken } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const verified = await verifySupabaseToken(token)
  if (!verified) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  const authUser = { id: verified.userId, email: verified.email }

  const admin = getSupabaseAdmin()

  // Single query: pro + their company (via company_id FK, not a join to company_members)
  const { data: pro, error: proErr } = await admin
    .from('pros')
    .select(`
      *,
      trade_category:trade_categories(id, category_name, slug),
      company:companies!pros_company_id_fkey(
        id,
        name,
        plan_tier,
        trial_ends_at,
        trade_slug,
        business_name,
        logo_url,
        city,
        state
      )
    `)
    .eq('auth_user_id', authUser.id)
    .maybeSingle()

  if (proErr) {
    console.error('[auth/me] pros lookup failed', proErr)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }

  if (!pro) {
    return NextResponse.json({
      session: null,
      authUser: { id: authUser.id, email: authUser.email },
      needsProfile: true,
    })
  }

  if (pro.profile_status === 'Suspended') {
    return NextResponse.json({ error: 'Account suspended — contact support' }, { status: 403 })
  }

  const company = (pro as any).company as {
    id: string
    name: string
    plan_tier: string
    trial_ends_at: string | null
    trade_slug: string | null
    business_name: string | null
    logo_url: string | null
    city: string | null
    state: string | null
  } | null

  // Self-heal: if trade_slug missing on pros row, backfill from trade_category
  const resolvedTradeSlug =
    (pro as any).trade_slug ||
    company?.trade_slug ||
    (pro.trade_category as any)?.slug ||
    null

  if (!(pro as any).trade_slug && resolvedTradeSlug) {
    await admin.from('pros').update({ trade_slug: resolvedTradeSlug }).eq('id', pro.id)
  }

  // Self-heal: claimed pro with no company (claimed via /claim/[token] before fix)
  // Create company on first login so pipeline becomes visible immediately.
  let healedCompany = company
  if ((pro as any).is_claimed && !company && !(pro as any).company_id) {
    try {
      const trialHeal = (pro as any).trial_ends_at
        ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: newCo } = await admin
        .from('companies')
        .insert({
          name:              (pro as any).business_name || pro.full_name || 'My Company',
          email:             pro.email,
          trade_slug:        resolvedTradeSlug,
          trade_category_id: (pro as any).trade_category_id || null,
          business_name:     (pro as any).business_name || null,
          license_number:    (pro as any).license_number || null,
          city:              pro.city || null,
          state:             pro.state || null,
          phone_cell:        (pro as any).phone_cell || null,
          plan_tier:         (pro as any).plan_tier || 'Free',
          trial_ends_at:     trialHeal,
          owner_pro_id:      pro.id,
        })
        .select('id, name, plan_tier, trial_ends_at, trade_slug, business_name, logo_url, city, state')
        .single()

      if (newCo) {
        await admin.from('pros').update({ company_id: newCo.id }).eq('id', pro.id)
        await admin.from('company_members').upsert({
          company_id: newCo.id, pro_id: pro.id, role: 'owner',
        }, { onConflict: 'company_id,pro_id' })
        // Also backfill any leads this pro has that are missing company_id
        await admin.from('leads')
          .update({ company_id: newCo.id })
          .eq('pro_id', pro.id)
          .is('company_id', null)
        healedCompany = newCo
        console.log('[auth/me] self-healed company for claimed pro', pro.id, '→', newCo.id)
      }
    } catch (e: any) {
      console.error('[auth/me] company self-heal failed:', e?.message)
      // Non-fatal — session still returns, pro can still use the app
    }
  }

  // Plan and trial come from company if available, else fall back to pros
  // (fallback handles unclaimed/orphaned rows during migration window)
  const plan        = healedCompany?.plan_tier        ?? (pro as any).plan_tier        ?? 'Free'
  const trialEndsAt = healedCompany?.trial_ends_at    ?? (pro as any).trial_ends_at    ?? null

  // Resolve role + removed status in parallel for speed
  const isRemovedCandidate = (pro as any).is_claimed === true && !(pro as any).company_id
  const [membershipRes, removedCheckRes] = await Promise.all([
    company?.id
      ? admin.from('company_members').select('role').eq('company_id', company.id).eq('pro_id', pro.id).maybeSingle()
      : Promise.resolve({ data: null }),
    isRemovedCandidate
      ? admin.from('company_members').select('id', { count: 'exact', head: true }).eq('pro_id', pro.id)
      : Promise.resolve({ count: 0 }),
  ])
  const role = ((membershipRes as any).data?.role as 'owner' | 'member') ?? null
  const wasRemoved = isRemovedCandidate ? (((removedCheckRes as any).count) ?? 0) > 0 : false

  // Determine plan status for middleware cookie
  // Values: 'paid' | 'trial' | 'free'
  // Middleware uses this to redirect /dashboard/* to /subscribe when free
  const now = new Date()
  const trialDateObj = trialEndsAt ? new Date(trialEndsAt) : null
  const pgPlanStatus = (plan === 'Pro' || plan === 'Elite')
    ? 'paid'
    : (trialDateObj && trialDateObj > now)
    ? 'trial'
    : 'free'

  const cookieMaxAge = 60 * 60 * 2 // 2 hours — short so expiry triggers promptly

  const res = NextResponse.json({
    session: {
      // ── Existing fields (unchanged) ──
      id:             pro.id,
      name:           pro.full_name,
      email:          pro.email,
      plan:           plan,
      trial_ends_at:  trialEndsAt,
      trade:          (pro.trade_category as any)?.category_name || null,
      trade_slug:     resolvedTradeSlug,
      city:           healedCompany?.city           ?? pro.city,
      state:          healedCompany?.state          ?? pro.state,
      slug:           pro.slug || null,
      profile_status: pro.profile_status,
      is_verified:    pro.is_verified,

      // ── New: company context + role ──
      company_id:     healedCompany?.id    ?? null,
      company_name:   healedCompany?.name  ?? null,
      google_id:      (pro as any).google_id ?? null,
      role,
    },
    needsProfile: false,
    removedFromCompany: wasRemoved,
  })

  res.cookies.set('pg_plan', pgPlanStatus, {
    httpOnly: false, // readable by middleware
    secure: true,
    sameSite: 'lax',
    maxAge: cookieMaxAge,
    path: '/',
  })

  return res
}
