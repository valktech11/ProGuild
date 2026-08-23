// lib/pro-auth.ts
//
// Server-side pro identity enforcement.
//
// Every pro-scoped route must derive the caller's pros.id + companies.id from
// the bearer token — never trust a client-supplied pro_id or company_id.
//
// Usage in a route handler:
//
//   const auth = await requirePro(req, proId)   // proId = client-claimed value (may be null)
//   if (auth.error) return auth.error           // 401 / 403 / 500 NextResponse
//   const { proId, companyId } = auth           // server-derived — use THESE
//
// Semantics:
//   - No/invalid bearer token          → 401
//   - Token valid, no linked pros row  → 403 (authenticated but not a pro)
//   - claimedProId present ≠ owned id  → 403 (cross-pro access attempt)
//   - claimedProId absent              → OK; routes use auth.proId
//   - companyId                        → always populated for claimed pros;
//                                        null only for unclaimed/orphaned rows
//                                        (treat as Free guest access)
//
// Additive: all existing callers that only destructure { proId } continue to
// work unchanged. New multi-user routes additionally destructure { companyId }.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'
import { getSupabaseAdmin } from '@/lib/supabase'

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!
}

// ── Local JWT verification ───────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`

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
  let alg = 'ES256'
  try {
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString()
    )
    alg = header.alg ?? 'ES256'
  } catch { return null }

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
  }

  if (alg === 'HS256' && _hs256Secret) {
    try {
      const { payload } = await jwtVerify(token, _hs256Secret, { audience: 'authenticated' })
      if (!payload.sub) return null
      return {
        userId: payload.sub as string,
        email: (payload.email as string) ?? null,
        sessionId: (payload.session_id as string) ?? null,
      }
    } catch { return null }
  }

  const authClient = createClient(getUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return null
  return { userId: data.user.id, email: data.user.email ?? null, sessionId: null }
}

// ── Return type ──────────────────────────────────────────────────────────────
export type ProAuthResult =
  | {
      proId: string
      companyId: string | null   // null only for unclaimed/orphaned pros
      authUserId: string
      error?: undefined
    }
  | { proId?: undefined; companyId?: undefined; authUserId?: undefined; error: NextResponse }

// ── Session activity tracking ────────────────────────────────────────────────
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000
const _lastStamped = new Map<string, number>()

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

// ── requirePro ───────────────────────────────────────────────────────────────
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

  // Single indexed read: auth_user_id → pros row + company_id (O(1), no join)
  let pro: { id: string; company_id: string | null } | null = null
  let proErr: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await admin
      .from('pros')
      .select('id, company_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    pro = res.data as { id: string; company_id: string | null } | null
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

  void touchSession(req, pro.id as string, verified.sessionId ?? null)

  return {
    proId:     pro.id as string,
    companyId: pro.company_id ?? null,
    authUserId,
  }
}
