// lib/hooks/useProSession.ts
// THE single way every page gets the logged-in pro's Session.
// Now backed by SessionProvider (React context) so auth resolves ONCE app-wide and every
// page reads it instantly — no per-navigation re-fetch, no login flash.
//
// Same return shape as before, so no page changes are needed:
//   const { session, loading, needsProfile, signOut, refresh } = useProSession()

'use client'

import { useSessionContext } from '@/components/auth/SessionProvider'

export function useProSession() {
  return useSessionContext()
}
