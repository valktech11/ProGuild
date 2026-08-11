// lib/address.ts
//
// SINGLE SOURCE OF TRUTH for parsing a Google Places `formatted_address`
// into street / city / state / zip.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Four separate modals each hand-parsed the formatted address with:
//
//     const parts = formatted.replace(', USA', '').split(', ')
//     if (parts.length >= 3) setCity(parts[parts.length - 3] || '')
//     if (parts.length >= 1) setStreet(parts[0] || '')
//
// That index was correct ONLY while the string still ended in ", USA":
//     "3931 Highgate Ct, Tampa, FL 33614, USA"
//      -> ["3931 Highgate Ct", "Tampa", "FL 33614", "USA"]   length 4
//      -> parts[4-3] = parts[1] = "Tampa"                    correct
//
// Someone later added `.replace(', USA', '')`, dropping the array to 3
// elements, and never updated the index:
//     "3931 Highgate Ct, Tampa, FL 33614"
//      -> ["3931 Highgate Ct", "Tampa", "FL 33614"]          length 3
//      -> parts[3-3] = parts[0] = "3931 Highgate Ct"         THE STREET
//
// Result: contact_city (and clients.city) were written with the STREET
// ADDRESS. Every surface that renders [property_address, contact_city,
// contact_state] then showed "3931 Highgate Ct, 3931 Highgate Ct, FL".
//
// Do NOT hand-parse a formatted address at a call site. Use parseFormattedAddress().

export interface ParsedAddress {
  street: string
  city:   string
  state:  string
  zip:    string
}

/**
 * Parse a Google Places `formatted_address` into its components.
 *
 * Anchors on the "ST 12345" segment rather than counting from either end,
 * so it is correct for every shape Google returns:
 *   "3931 Highgate Ct, Tampa, FL 33614, USA"
 *   "3931 Highgate Ct, Tampa, FL 33614"
 *   "500 Main St, Apt 4B, Tampa, FL 33614, USA"   (unit line preserved in street)
 *   "Tampa, FL 33614, USA"                        (no street — city only)
 *
 * Never throws. Missing components come back as ''.
 *
 * GUARANTEE: city is never returned equal to street. If parsing would
 * produce that, city comes back '' — an empty city is recoverable, a city
 * containing the street address silently corrupts every address display.
 */
export function parseFormattedAddress(formatted: string): ParsedAddress {
  const empty: ParsedAddress = { street: '', city: '', state: '', zip: '' }
  if (!formatted || typeof formatted !== 'string') return empty

  // Drop the country suffix (Google appends ", USA" for US results).
  const cleaned = formatted.replace(/,\s*USA\s*$/i, '').trim()
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return empty

  // Pull state + zip out of the LAST segment ("FL 33614" / "FL").
  const last = parts[parts.length - 1]
  const stateZip = last.match(/^([A-Z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/)

  let state = ''
  let zip   = ''
  let rest  = parts

  if (stateZip) {
    state = stateZip[1]
    zip   = stateZip[2] || ''
    rest  = parts.slice(0, -1)            // everything before "ST ZIP"
  } else {
    // No trailing "ST ZIP" segment — fall back to scanning the whole string.
    const zipAny   = cleaned.match(/\b(\d{5})(?:-\d{4})?\b/)
    const stateAny = cleaned.match(/,\s*([A-Z]{2})\b/)
    if (zipAny)   zip   = zipAny[1]
    if (stateAny) state = stateAny[1]
  }

  // Of what remains, the LAST segment is the city; everything before it is
  // the street (which may include a unit/suite line).
  let city   = ''
  let street = ''

  if (rest.length >= 2) {
    city   = rest[rest.length - 1]
    street = rest.slice(0, -1).join(', ')
  } else if (rest.length === 1) {
    // Ambiguous: a single segment is a street when it starts with a number
    // ("3931 Highgate Ct"), otherwise treat it as a city ("Tampa").
    if (/^\d/.test(rest[0])) street = rest[0]
    else                     city   = rest[0]
  }

  // Hard guard — the exact bug this file exists to prevent.
  if (city && street && city.toLowerCase() === street.toLowerCase()) city = ''

  return { street, city, state, zip }
}
