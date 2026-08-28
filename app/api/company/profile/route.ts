// GET /api/company/profile
// Returns the caller's company profile (business details, trade, billing context).
// Any member can read.
//
// PATCH /api/company/profile
// Updates company profile. Owner only.
// Fields: name, business_name, trade_category_id, city, state, phone_cell,
//         license_number, logo_url
//
// Used by: settings/team page company profile section (web + future mobile).
// The edit-profile page continues to use /api/pros/[id] PATCH which
// dual-writes company fields via the sync added to that route.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export const dynamic = 'force-dynamic'

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { companyId } = auth

  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('companies')
    .select(`
      id, name, business_name, trade_slug, trade_category_id,
      city, state, phone_cell, license_number, logo_url,
      plan_tier, trial_ends_at
    `)
    .eq('id', companyId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  return NextResponse.json({ company: data })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error
  const { proId, companyId } = auth

  if (!companyId) {
    return NextResponse.json({ error: 'No company context' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Owner-only writes
  const { data: member } = await sb
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('pro_id', proId)
    .single()

  if (member?.role !== 'owner') {
    return NextResponse.json({ error: 'Only the company owner can update company profile' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  const ALLOWED = [
    'name', 'business_name', 'trade_category_id',
    'city', 'state', 'phone_cell', 'license_number', 'logo_url',
  ]

  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  // Resolve trade_slug if trade_category_id changed
  if ('trade_category_id' in updates && updates.trade_category_id) {
    const { data: cat } = await sb
      .from('trade_categories')
      .select('slug')
      .eq('id', updates.trade_category_id as string)
      .single()
    if (cat) updates.trade_slug = cat.slug
  } else if ('trade_category_id' in updates && !updates.trade_category_id) {
    updates.trade_slug = null
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await sb
    .from('companies')
    .update(updates)
    .eq('id', companyId)
    .select(`
      id, name, business_name, trade_slug, trade_category_id,
      city, state, phone_cell, license_number, logo_url,
      plan_tier, trial_ends_at, owner_pro_id
    `)
    .single()

  if (error) {
    console.error('[company/profile] update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sync back to pros row (business_name, trade_category_id, city, state, phone_cell)
  // so the edit-profile page and any pros-based reads see consistent data.
  const PROS_SYNC_FIELDS: Record<string, string> = {
    business_name:     'business_name',
    trade_category_id: 'trade_category_id',
    city:              'city',
    state:             'state',
    phone_cell:        'phone_cell',
    license_number:    'license_number',
  }
  const prosUpdates: Record<string, unknown> = {}
  for (const [compField, prosField] of Object.entries(PROS_SYNC_FIELDS)) {
    if (compField in updates) prosUpdates[prosField] = updates[compField]
  }
  if ('trade_slug' in updates) prosUpdates.trade_slug = updates.trade_slug

  if (Object.keys(prosUpdates).length > 0) {
    await sb.from('pros').update(prosUpdates).eq('id', proId)
  }

  return NextResponse.json({ company: data })
}
