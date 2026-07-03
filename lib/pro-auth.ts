// lib/pro-auth.ts
//
// Server-side pro identity enforcement (IDOR fix).
//
// Every pro-scoped route must derive the caller's pros.id from the bearer
// token — never trust a client-supplied pro_id. Pattern (mirrors
// /api/auth/me): token → auth.getUser → pros WHERE auth_user_id.
//
// Usage in a route handler:
//
//   const auth = await requirePro(req, proId)   // proId = client-claimed value (may be null)
//   if (auth.error) return auth.error           // 401 / 403 / 500 NextResponse
//   const proId = auth.proId                    // server-derived — use THIS
//
// Semantics:
//   - No/invalid bearer token          → 401
//   - Token valid, no linked pros row  → 403 (authenticated but not a pro)
//   - claimedProId present ≠ owned id  → 403 (cross-pro access attempt)
//   - claimedProId absent              → OK; routes use auth.proId
//
// Result cached per-request is unnecessary (single call per handler); the
// pros lookup is a single indexed read on auth_user_id.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!
}

export type ProAuthResult =
  | { proId: string; authUserId: string; error?: undefined }
  | { proId?: undefined; authUserId?: undefined; error: NextResponse }

export async function requirePro(
  req: NextRequest,
  claimedProId?: string | null,
): Promise<ProAuthResult> {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const authClient = createClient(getUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: userData, error: userErr } = await authClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }
  }

  const admin = getSupabaseAdmin()
  const { data: pro, error: proErr } = await admin
    .from('pros')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()

  if (proErr) {
    return { error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }) }
  }
  if (!pro) {
    return { error: NextResponse.json({ error: 'No pro profile' }, { status: 403 }) }
  }

  if (claimedProId && claimedProId !== pro.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { proId: pro.id as string, authUserId: userData.user.id }
}
