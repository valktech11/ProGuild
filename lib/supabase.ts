import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton — initialised only at request time, not at build time
let _anon: SupabaseClient | null = null
let _admin: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_anon) {
    _anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _anon
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _admin
}

// Convenience exports for backward compat
export const supabase = { get: getSupabase }
export const supabaseAdmin = { get: getSupabaseAdmin }
