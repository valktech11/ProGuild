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
// Supabase projects may use ES256 (ECC P-256, the new default) or HS256
// (legacy shared secret). We try both locally before falling back to the
// network auth.getUser call. Priority:
//   1. ES256 via JWKS (fetched once, cached in module scope, auto-rotating)
//   2. HS256 via SUPABASE_JWT_SECRET env var (legacy / still-valid tokens)
//   3. Network auth.getUser (correct but adds ~400-600ms RTT)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`

// Module-level JWKS cache — refreshed every 6h max (Supabase rotates rarely).
let _jwksCache: { keys: any[]; fetchedAt: number } | null = null

async function getJwks(): Promise<any[]> {
  const now = Date.now()
  if (_jwksCache && now - _jwksCache.fetchedAt < 6 * 60 * 60 * 1000) {
    return _jwksCache.keys
  }
  try {
    const res = await fetch(JWKS_URL)
    if (!res.ok) return _jwksCache?.keys ?? []
    const { keys } = await res.json()
    _jwksCache = { keys, fetchedAt: now }
    return keys
  } catch {
    return _jwksCache?.keys ?? []
  }
}

const _hs256Secret = process.env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
  : null

/** Verified token identity: auth user id (JWT sub) + email claim. */
export async function verifySupabaseToken(
  token: string,
): Promise<{ userId: string; email: string | null } | null> {
  // Peek at header to route correctly without trying all keys.
  let alg = 'ES256'
  try {
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString()
    )
    alg = header.alg ?? 'ES256'
  } catch { /* malformed */ return null }

  // Path 1: ES256 via JWKS (current Supabase default)
  if (alg === 'ES256') {
    const keys = await getJwks()
    for (const key of keys.filter((k: any) => k.alg === 'ES256' || k.kty === 'EC')) {
      try {
        const { importJWK } = await import('jose')
        const pubKey = await importJWK(key, 'ES256')
        const { jwtVerify: jv } = await import('jose')
        const { payload } = await jv(token, pubKey, { audience: 'authenticated' })
        if (!payload.sub) continue
        return { userId: payload.sub as string, email: (payload.email as string) ?? null }
      } catch { continue }
    }
    // JWKS miss — fall through to network
  }

  // Path 2: HS256 legacy shared secret
  if (alg === 'HS256' && _hs256Secret) {
    try {
      const { payload } = await jwtVerify(token, _hs256Secret, { audience: 'authenticated' })
      if (!payload.sub) return null
      return { userId: payload.sub as string, email: (payload.email as string) ?? null }
    } catch { /* invalid */ return null }
  }

  // Path 3: Network fallback (always correct, always slow)
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
