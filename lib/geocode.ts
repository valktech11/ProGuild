// lib/geocode.ts
// Server-side address → coordinates via Google Maps Geocoding API.
// Shared by roof report generation and storm evidence (coords fallback when a
// lead lacks stored contact_lat/lng).

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY!

export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress: string
}

/** Geocode an address string. Returns null on failure (caller decides). */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address?.trim()) return null
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json`
      + `?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const json = await res.json()
    if (json.status !== 'OK' || !json.results?.[0]) return null
    const loc = json.results[0].geometry.location
    return {
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: json.results[0].formatted_address,
    }
  } catch {
    return null
  }
}
