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
): Promise<{ userId: string; email: string | null; sessionId: string | null } | null> {
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
        return {
          userId: payload.sub as string,
          email: (payload.email as string) ?? null,
          sessionId: (payload.session_id as string) ?? null,
        }
      } catch { continue }
    }
    // JWKS miss — fall through to network
  }

  // Path 2: HS256 legacy shared secret
  if (alg === 'HS256' && _hs256Secret) {
    try {
      const { payload } = await jwtVerify(token, _hs256Secret, { audience: 'authenticated' })
      if (!payload.sub) return null
      return {
        userId: payload.sub as string,
        email: (payload.email as string) ?? null,
        sessionId: (payload.session_id as string) ?? null,
      }
    } catch { /* invalid */ return null }
  }

  // Path 3: Network fallback (always correct, always slow)
  const authClient = createClient(getUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return null
  return { userId: data.user.id, email: data.user.email ?? null, sessionId: null }
}

export type ProAuthResult =
  | { proId: string; authUserId: string; error?: undefined }
  | { proId?: undefined; authUserId?: undefined; error: NextResponse }

// ── Session activity tracking ────────────────────────────────────────────────
// Records/refreshes a pro_sessions row so we can answer "how long was this
// session active". Runs AFTER auth succeeds, is fire-and-forget, and touches
// only our own table — it can never block authentication or a request.
//
// Throttle: only writes if the session is new, or last_active_at is older than
// ACTIVITY_THROTTLE_MS. Keeps this to roughly one write per session per window
// instead of one per API call.
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000  // 5 minutes
const _lastStamped = new Map<string, number>()  // sessionId → epoch ms (per-instance)

function classifyClient(ua: string) {
  const isMobileApp = /dart|okhttp|proguild_mobile/i.test(ua)
  const deviceType =
    isMobileApp                     ? 'mobile_app' :
    /ipad/i.test(ua)                ? 'tablet'     :
    /iphone|android/i.test(ua)      ? 'mobile_web' :
    ua === ''                       ? 'unknown'    : 'desktop'
  const browser =
    isMobileApp        ? 'ProGuild App' :
    /edg\//i.test(ua)  ? 'Edge'    :
    /chrome/i.test(ua) ? 'Chrome'  :
    /safari/i.test(ua) ? 'Safari'  :
    /firefox/i.test(ua)? 'Firefox' : null
  const os =
    /windows/i.test(ua)      ? 'Windows' :
    /mac os/i.test(ua)       ? 'macOS'   :
    /android/i.test(ua)      ? 'Android' :
    /iphone|ipad/i.test(ua)  ? 'iOS'     :
    /linux/i.test(ua)        ? 'Linux'   : null
  return { isMobileApp, deviceType, browser, os }
}

async function touchSession(
  req: NextRequest,
  proId: string,
  sessionId: string | null,
): Promise<void> {
  if (!sessionId) return
  const now = Date.now()
  const last = _lastStamped.get(sessionId) ?? 0
  if (now - last < ACTIVITY_THROTTLE_MS) return
  _lastStamped.set(sessionId, now)

  try {
    const ua = req.headers.get('user-agent') ?? ''
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')?.trim()
      || null
    const { isMobileApp, deviceType, browser, os } = classifyClient(ua)

    await getSupabaseAdmin()
      .from('pro_sessions')
      .upsert({
        pro_id:              proId,
        supabase_session_id: sessionId,
        device_type:         deviceType,
        browser,
        os,
        ip_address:          ip,
        is_mobile_app:       isMobileApp,
        last_active_at:      new Date().toISOString(),
      }, { onConflict: 'supabase_session_id' })
  } catch {
    // Never let activity tracking affect the request.
  }
}

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
  // One retry on transient lookup failure (cold-start / pooler hiccup surfaces
  // as an error here and previously 500'd the whole request).
  let pro: { id: string } | null = null
  let proErr: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await admin
      .from('pros')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    pro = res.data as { id: string } | null
    proErr = res.error
    if (!proErr) break
    if (attempt === 0) await new Promise(r => setTimeout(r, 250))
  }

  if (proErr) {
    return { error: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }) }
  }
  if (!pro) {
    return { error: NextResponse.json({ error: 'No pro profile' }, { status: 403 }) }
  }

  if (claimedProId && claimedProId !== pro.id) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  // Fire-and-forget: stamp session activity so we can measure session duration.
  // Deliberately NOT awaited — must never add latency or fail the request.
  void touchSession(req, pro.id as string, verified.sessionId ?? null)

  return { proId: pro.id as string, authUserId }
}
