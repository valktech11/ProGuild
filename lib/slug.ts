/**
 * Vanity slug generation for ProGuild pro profiles.
 * Format: {first}-{last}-{trade}-{city}
 * Fallback: append state, then last 4 of license number for uniqueness.
 * All slugs stored in pros.slug — unique index enforced at DB level.
 */

/** Convert any string to URL-safe lowercase with hyphens */
export function toSlugPart(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')                       // decompose accents
    .replace(/[\u0300-\u036f]/g, '')        // strip accent marks
    .replace(/[^a-z0-9\s-]/g, '')          // remove non-alphanumeric
    .trim()
    .replace(/\s+/g, '-')                  // spaces → hyphens
    .replace(/-+/g, '-')                   // collapse multiple hyphens
}

/**
 * Generate candidate slugs in priority order.
 * Returns an array of candidates — caller tries each until one is unique.
 */
export function generateSlugCandidates({
  fullName,
  trade,
  city,
  state,
  licenseNumber,
}: {
  fullName: string
  trade: string | null
  city: string | null
  state: string | null
  licenseNumber: string | null
}): string[] {
  const nameParts  = fullName.trim().split(/\s+/)
  const first      = toSlugPart(nameParts[0] || '')
  const last       = toSlugPart(nameParts.slice(1).join(' ') || '')
  const tradePart  = toSlugPart(trade || 'pro')
  const cityPart   = toSlugPart(city || '')
  const statePart  = toSlugPart(state || '')
  const lic4       = licenseNumber ? licenseNumber.replace(/\D/g, '').slice(-4) : ''

  const nameSlug = last ? `${first}-${last}` : first

  const candidates: string[] = []

  // Primary: first-last-trade-city
  if (cityPart) candidates.push(`${nameSlug}-${tradePart}-${cityPart}`)

  // Fallback 1: add state
  if (cityPart && statePart) candidates.push(`${nameSlug}-${tradePart}-${cityPart}-${statePart}`)

  // Fallback 2: just name + trade (if city missing or duplicate city different state)
  candidates.push(`${nameSlug}-${tradePart}`)

  // Fallback 3: add state to name + trade
  if (statePart) candidates.push(`${nameSlug}-${tradePart}-${statePart}`)

  // Fallback 4: append last 4 of license number — practically guarantees uniqueness
  if (lic4) candidates.push(`${nameSlug}-${tradePart}-${cityPart || statePart}-${lic4}`)

  // Final fallback: name only
  candidates.push(nameSlug)

  // Remove empty / too-short candidates
  return candidates.filter(s => s.length >= 4)
}

/**
 * Resolve a unique slug for a pro by walking the candidate list and checking
 * each against pros.slug until one is free. Final fallback appends a base36
 * timestamp — practically collision-proof. Mirrors the Case A signup logic so
 * every path that marks a pro claimed produces an indexable vanity URL.
 *
 * `admin` is a service-role Supabase client (typed loosely to avoid coupling).
 */
export async function generateUniqueSlug(
  admin: any,
  opts: {
    fullName: string
    trade: string | null
    city: string | null
    state: string | null
    licenseNumber: string | null
  },
): Promise<string> {
  const candidates = generateSlugCandidates(opts)
  for (const c of candidates) {
    const { data: existing } = await admin.from('pros').select('id').eq('slug', c).maybeSingle()
    if (!existing) return c
  }
  const base = candidates[0] || toSlugPart(opts.fullName) || 'pro'
  return `${base}-${Date.now().toString(36)}`
}
