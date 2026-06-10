// components/auth/SessionProvider.tsx
// Resolves the logged-in pro's session ONCE for the whole app and shares it via context.
//
// Why: previously useProSession() ran its own auth resolution per-page. Every navigation
// re-fetched /api/auth/me, creating a loading window where session was momentarily null —
// causing pages to flash toward /login and bounce back. With a single provider, auth is
// resolved once; every page reads the already-resolved session instantly (no flash, no
// per-navigation network call).

'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Session } from '@/types'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

interface SessionContextValue {
  session: Session | null
  loading: boolean
  needsProfile: boolean
  authEmail: string | null
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [authEmail, setAuthEmail] = useState<string | null>(null)

  const resolve = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data: { session: authSession } } = await supabase.auth.getSession()

    if (!authSession) {
      setSession(null)
      setNeedsProfile(false)
      setAuthEmail(null)
      setLoading(false)
      return
    }

    setAuthEmail(authSession.user.email ?? null)

    try {
      const r = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      })
      const d = await r.json()
      if (r.ok) {
        setSession(d.session)
        setNeedsProfile(!!d.needsProfile)
      } else {
        setSession(null)
        setNeedsProfile(false)
      }
    } catch {
      setSession(null)
      setNeedsProfile(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    resolve()
    // Re-resolve on auth changes (login, logout, token refresh) — but only real changes.
    const supabase = getSupabaseBrowser()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Ignore the initial event (resolve() already ran above) to avoid a double pass.
      if (event === 'INITIAL_SESSION') return
      resolve()
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
    <SessionContext.Provider value={{ session, loading, needsProfile, authEmail, signOut, refresh: resolve }}>
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
      session: null, loading: false, needsProfile: false, authEmail: null,
      signOut: async () => {}, refresh: async () => {},
    }
  }
  return ctx
}
