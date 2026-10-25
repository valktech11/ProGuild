// components/auth/SessionProvider.tsx
// Resolves the logged-in pro's session ONCE for the whole app and shares it via context.
//
// Why: previously useProSession() ran its own auth resolution per-page. Every navigation
// re-fetched /api/auth/me, creating a loading window where session was momentarily null —
// causing pages to flash toward /login and bounce back. With a single provider, auth is
// resolved once; every page reads the already-resolved session instantly (no flash, no
// per-navigation network call).

'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { Session } from '@/types'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { authTrace } from '@/lib/auth-trace' // TEMP diagnostic — remove before prod

interface SessionContextValue {
  session: Session | null
  loading: boolean
  needsProfile: boolean
  removedFromCompany: boolean
  authEmail: string | null
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [removedFromCompany, setRemovedFromCompany] = useState(false)
  const [authEmail, setAuthEmail] = useState<string | null>(null)

  // Mirror of `session` readable inside the []-deps resolve callback without a
  // stale closure — lets a silent re-resolve know whether we already hold a
  // session and must protect it from a transient mid-refresh null.
  const sessionRef = useRef<Session | null>(null)
  useEffect(() => { sessionRef.current = session }, [session])

  // Guards against two resolve() runs overlapping — on boot the mount-resolve
  // and a SIGNED_IN-resolve fire near-simultaneously, which double-hit
  // /api/auth/me and double-ran the dashboard's fetchData. The second concurrent
  // caller is dropped.
  const resolvingRef = useRef(false)

  const resolve = useCallback(async (opts?: { silent?: boolean }) => {
    if (resolvingRef.current) { authTrace('resolve:skip-inflight'); return }
    resolvingRef.current = true
    // A non-silent resolve means we're establishing auth from scratch (initial
    // load, or just after login/claim) and have no trusted session yet. Mark
    // loading so protected pages show their skeleton and WAIT, instead of seeing
    // session=null with loading=false and bouncing to /login while /api/auth/me
    // is still in flight — that race is the login↔dashboard ping-pong. Silent
    // re-resolves (token refresh) keep the current session and loading state.
    if (!opts?.silent) { authTrace('resolve:setLoading(true)'); setLoading(true) }
    authTrace('resolve:start', { silent: !!opts?.silent, hasExisting: !!sessionRef.current })
    const supabase = getSupabaseBrowser()
    let { data: { session: authSession } } = await supabase.auth.getSession()
    authTrace('resolve:getSession', { hasAuthSession: !!authSession })

    if (!authSession) {
      // getSession() can transiently return null while Supabase is mid token-
      // refresh. If this is a SILENT re-resolve (token refresh / tab refocus) and
      // we already hold a session, do NOT wipe it — force a refresh and use that.
      // This is the flash-and-return case: the local session blips null for a
      // moment, the old code nulled it → flashed /login → recovered. Only treat
      // the user as genuinely signed out if the refresh also yields nothing, or
      // this is the initial (non-silent) resolve.
      if (opts?.silent && sessionRef.current) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        authSession = refreshed?.session ?? null
        authTrace('resolve:silentRefresh', { recovered: !!authSession })
      }
      if (!authSession) {
        if (!opts?.silent) {
          authTrace('resolve:setSession(null)', { reason: 'no-authSession-nonsilent' })
          setSession(null)
          setNeedsProfile(false)
          setAuthEmail(null)
        } else {
          authTrace('resolve:keepSession', { reason: 'no-authSession-silent' })
        }
        setLoading(false)
        resolvingRef.current = false
        return
      }
    }

    setAuthEmail(authSession.user.email ?? null)

    // Fetch /api/auth/me with a given token. Returns the Response, or null on a
    // network throw.
    const fetchMe = async (token: string): Promise<Response | null> => {
      try {
        return await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      } catch {
        return null
      }
    }

    try {
      let r = await fetchMe(authSession.access_token)
      authTrace('resolve:me', { status: r?.status ?? 'null' })

      // 401 = the access token is expired/invalid. Before giving up and bouncing
      // to /login, force a token refresh and retry once. This makes routine ~1hr
      // token expiry self-heal invisibly instead of flashing the login screen
      // during a long working session.
      if (r && r.status === 401) {
        const { data: refreshed } = await supabase.auth.refreshSession()
        const newToken = refreshed?.session?.access_token
        if (newToken) {
          r = await fetchMe(newToken)
          authTrace('resolve:me-retry', { status: r?.status ?? 'null' })
        }
      }

      if (r && r.ok) {
        const d = await r.json()
        authTrace('resolve:setSession(value)', { hasSession: !!d.session, needsProfile: !!d.needsProfile, removedFromCompany: !!d.removedFromCompany })
        setSession(d.session)
        setNeedsProfile(!!d.needsProfile)
        setRemovedFromCompany(!!d.removedFromCompany)
      } else if (!opts?.silent) {
        // Only downgrade to null on a NON-silent (initial) resolve, and only after
        // the refresh-and-retry above also failed. On a silent re-resolve (token
        // refresh / tab refocus) a transient non-ok response must NOT wipe a
        // session we already have — that caused the login flicker.
        authTrace('resolve:setSession(null)', { reason: 'me-not-ok-nonsilent', status: r?.status ?? 'null' })
        setSession(null)
        setNeedsProfile(false)
      } else {
        authTrace('resolve:keepSession', { reason: 'me-not-ok-silent', status: r?.status ?? 'null' })
      }
    } catch {
      // Network blip during a silent re-resolve: keep the existing session.
      if (!opts?.silent) {
        authTrace('resolve:setSession(null)', { reason: 'me-threw-nonsilent' })
        setSession(null)
        setNeedsProfile(false)
      } else {
        authTrace('resolve:keepSession', { reason: 'me-threw-silent' })
      }
    }
    authTrace('resolve:done:setLoading(false)')
    setLoading(false)
    resolvingRef.current = false
  }, [])

  useEffect(() => {
    resolve()
    // Re-resolve on auth changes — but only ones that actually change login state.
    // TOKEN_REFRESHED and USER_UPDATED keep the user logged in; re-resolving them
    // silently (without ever nulling an existing session) prevents the flicker
    // where a routine token refresh briefly bounced pages toward /login.
    const supabase = getSupabaseBrowser()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      authTrace('onAuthStateChange', { event })
      if (event === 'INITIAL_SESSION') return
      if (event === 'SIGNED_OUT') { authTrace('authEvent:SIGNED_OUT->setSession(null)'); setSession(null); setNeedsProfile(false); setAuthEmail(null); return }
      // SIGNED_IN also re-fires on tab-focus / token auto-refresh. When a session
      // is already held it's a re-emit, not a new login — skip the full re-resolve
      // (which re-hit /api/auth/me and re-ran dashboard fetchData on every refocus).
      // Only resolve when there's no session yet (a genuine login).
      if (event === 'SIGNED_IN') {
        if (sessionRef.current) { authTrace('authEvent:SIGNED_IN-ignored(have-session)'); return }
        resolve(); return
      }
      // TOKEN_REFRESHED / USER_UPDATED / others: refresh data but never null on a blip.
      resolve({ silent: true })
    })
    return () => sub.subscription.unsubscribe()
  }, [resolve])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    await supabase.auth.signOut()
    setSession(null)
    setNeedsProfile(false)
    setAuthEmail(null)
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading, needsProfile, removedFromCompany, authEmail, signOut, refresh: resolve }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    // Fallback so any component used outside the provider doesn't crash —
    // returns a resolved-empty state. In practice the provider wraps the whole app.
    return {
      session: null, loading: false, needsProfile: false, removedFromCompany: false, authEmail: null,
      signOut: async () => {}, refresh: async () => {},
    }
  }
  return ctx
}
