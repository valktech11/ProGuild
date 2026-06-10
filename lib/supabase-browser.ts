// lib/supabase-browser.ts
// Browser-side Supabase client WITH auth/session persistence.
// This is different from lib/supabase.ts:
//   - lib/supabase.ts  → server-side data clients (admin + anon, no session)
//   - this file        → the browser client that holds the logged-in user's session
//
// Use this ONLY in client components for auth actions (signIn, signOut, getSession).
// For data fetching, keep using the existing API routes.

import { createBrowserClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseBrowser(): SupabaseClient {
  // Singleton — one browser client per tab, so the session is shared everywhere.
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}
