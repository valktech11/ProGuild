import { createClient, SupabaseClient } from '@supabase/supabase-js'

export function getSupabase(): SupabaseClient {
  // Create fresh client each call — avoids singleton locking onto wrong URL
  // when env vars change between dev restarts or CI runs
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Convenience exports for backward compat
export const supabase = { get: getSupabase }
export const supabaseAdmin = { get: getSupabaseAdmin }
