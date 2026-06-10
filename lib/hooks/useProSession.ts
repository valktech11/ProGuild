// lib/hooks/useProSession.ts
// THE single way every page gets the logged-in pro's Session.
// Replaces the old pattern:  sessionStorage.getItem('pg_pro')
//
// Old (fake):  const stored = sessionStorage.getItem('pg_pro')
//              const session = stored ? JSON.parse(stored) : null
//
// New (real):  const { session, loading, needsProfile, signOut } = useProSession()
//
// Returns the SAME Session shape pages already use, so downstream components
// (DashboardShell, Navbar, etc.) don't change at all.

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Session } from '@/types'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

interface ProSessionState {
  session: Session | null
  loading: boolean
  needsProfile: boolean   // authenticated but no pros record linked yet → claim/onboard
  authEmail: string | null
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export function useProSession(): ProSessionState {
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

    // Ask the server to map this auth user → their pros Session
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
    // Re-resolve when auth state changes (login, logout, token refresh)
    const supabase = getSupabaseBrowser()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
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

  return { session, loading, needsProfile, authEmail, signOut, refresh: resolve }
}
