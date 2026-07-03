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
import { jwtVerify } from 'jose'
import { getSupabaseAdmin } from '@/lib/supabase'

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!
}

// ── Local JWT verification ───────────────────────────────────────────────────
// Supabase access tokens are HS256-signed with the project JWT secret.
// Verifying locally removes a network round-trip to the Supabase auth API on
// EVERY guarded request (~200-600ms). Tradeoff: revocation honors token TTL
// (1h) instead of being instant — signOut kills the refresh token, so a
// signed-out access token ages out within the hour. Acceptable.
//
// SUPABASE_JWT_SECRET must be set in Vercel env (Supabase dashboard →
// Settings → API → JWT Secret). If absent, falls back to network getUser —
// correct but slow; a startup log makes the misconfig visible.

const _jwtSecret = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null

if (!_jwtSecret) {
  console.warn('[pro-auth] SUPABASE_JWT_SECRET not set — falling back to network token verification (slow path)')
}

/** Verified token identity: auth user id (JWT sub) + email claim. */
export async function verifySupabaseToken(
  token: string,
): Promise<{ userId: string; email: string | null } | null> {
  if (_jwtSecret) {
    try {
      const { payload } = await jwtVerify(token, _jwtSecret, {
        // Supabase sets aud to 'authenticated' for signed-in users.
        audience: 'authenticated',
      })
      if (!payload.sub) return null
      return { userId: payload.sub as string, email: (payload.email as string) ?? null }
    } catch {
      return null
    }
  }
  // Fallback: network verification via Supabase auth API.
  const authClient = createClient(getUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return null
  return { userId: data.user.id, email: data.user.email ?? null }
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

  const verified = await verifySupabaseToken(token)
  if (!verified) {
    return { error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }
  }
  const authUserId = verified.userId

  const admin = getSupabaseAdmin()
  const { data: pro, error: proErr } = await admin
    .from('pros')
    .select('id')
    .eq('auth_user_id', authUserId)
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

  return { proId: pro.id as string, authUserId }
}
