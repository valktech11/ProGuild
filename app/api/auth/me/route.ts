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

  // Plan and trial come from company if available, else fall back to pros
  // (fallback handles unclaimed/orphaned rows during migration window)
  const plan        = company?.plan_tier        ?? (pro as any).plan_tier        ?? 'Free'
  const trialEndsAt = company?.trial_ends_at    ?? (pro as any).trial_ends_at    ?? null

  // Resolve role from company_members
  let role: 'owner' | 'member' | null = null
  if (company?.id) {
    const { data: membership } = await admin
      .from('company_members')
      .select('role')
      .eq('company_id', company.id)
      .eq('pro_id', pro.id)
      .maybeSingle()
    role = (membership?.role as 'owner' | 'member') ?? null
  }

  // Removed member: pro exists but no longer has a company
  const wasRemoved = !company && (pro as any).is_claimed && !(pro as any).company_id

  return NextResponse.json({
    session: {
      // ── Existing fields (unchanged) ──
      id:             pro.id,
      name:           pro.full_name,
      email:          pro.email,
      plan:           plan,
      trial_ends_at:  trialEndsAt,
      trade:          (pro.trade_category as any)?.category_name || null,
      trade_slug:     resolvedTradeSlug,
      city:           company?.city           ?? pro.city,
      state:          company?.state          ?? pro.state,
      slug:           pro.slug || null,
      profile_status: pro.profile_status,
      is_verified:    pro.is_verified,

      // ── New: company context + role ──
      company_id:     company?.id    ?? null,
      company_name:   company?.name  ?? null,
      role,
    },
    needsProfile: false,
    removedFromCompany: wasRemoved,
  })
}
