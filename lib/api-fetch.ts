// lib/api-fetch.ts
//
// Authenticated fetch for pro-scoped API routes.
//
// Every route guarded by requirePro() (see lib/pro-auth.ts) derives the
// caller's pros.id from the bearer token — a client-supplied ?pro_id= is
// ignored/validated server-side, never trusted. So the browser MUST send the
// Supabase access token on those calls, or the request 401s.
//
// This is the single client-side entry point for guarded routes. Do not call
// bare fetch() against a requirePro route; use apiFetch / apiJson.
//
// Behaviour:
//   - Injects Authorization: Bearer <live session token>
//   - On 401, refreshes the session once and retries (covers token expiry
//     mid-session — mirror of the mobile ApiClient._authedGet strategy)
//   - Preserves caller-supplied headers, method, body

import { getSupabaseBrowser } from './supabase-browser'

async function currentAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowser()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function withAuth(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  // Only default Content-Type for bodies that are JSON strings; leave
  // FormData/multipart alone so the browser sets its own boundary.
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return { ...init, headers }
}

/**
 * Authenticated fetch against a pro-scoped API route.
 * Returns the raw Response (caller parses). Throws only on network failure,
 * exactly like fetch().
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const supabase = getSupabaseBrowser()
  let token = await currentAccessToken()

  // No session at all — let the request go unauthenticated so the route's own
  // 401 surfaces to the caller's existing error handling (don't throw here).
  if (!token) return fetch(input, init)

  let res = await fetch(input, withAuth(init, token))

  if (res.status === 401) {
    // Token likely expired — refresh once and retry.
    const { data } = await supabase.auth.refreshSession()
    token = data.session?.access_token ?? null
    if (token) res = await fetch(input, withAuth(init, token))
  }

  return res
}

/**
 * Authenticated fetch that parses JSON. Returns parsed body on 2xx, or a
 * fallback value on non-2xx / parse error (never throws for HTTP errors) —
 * matches the .catch(() => fallback) pattern used across dashboard fetches.
 */
export async function apiJson<T = any>(
  input: string,
  init?: RequestInit,
  fallback: T = null as T,
): Promise<T> {
  try {
    const res = await apiFetch(input, init)
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    return fallback
  }
}
