import { createClient, SupabaseClient } from '@supabase/supabase-js'

// SUPABASE_URL is a server-side-only var read at request time (not compiled into bundle).
// Falls back to NEXT_PUBLIC_SUPABASE_URL for local dev where only that is set.
const getUrl = () =>
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''

export function getSupabase(): SupabaseClient {
  return createClient(
    getUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    getUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Convenience exports for backward compat
export const supabase = { get: getSupabase }
export const supabaseAdmin = { get: getSupabaseAdmin }
