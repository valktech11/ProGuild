import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * Resolves a US ZIP code to a city name.
 * Uses our own zip_codes table in Supabase — no external dependency.
 * Falls back to null if not found.
 */
export async function zipToCity(zip: string): Promise<{ city: string; state: string } | null> {
  if (!/^\d{5}$/.test(zip.trim())) return null
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('zip_codes')
      .select('city, state')
      .eq('zip', zip.trim())
      .single()
    if (error || !data) return null
    return { city: data.city, state: data.state.toLowerCase() }
  } catch {
    return null
  }
}

/**
 * Converts a city name to a URL slug.
 * "St. Petersburg" → "st-petersburg"
 * "Fort Lauderdale" → "fort-lauderdale"
 */
export function cityToSlug(city: string): string {
  return city.toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Converts a slug back to a display name.
 * "st-petersburg" → "St Petersburg"
 * "fort-lauderdale" → "Fort Lauderdale"
 */
export function slugToDisplayCity(slug: string): string {
  return slug.split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Detects if a string looks like a ZIP code.
 */
export function isZip(s: string): boolean {
  return /^\d{5}$/.test(s.trim())
}
