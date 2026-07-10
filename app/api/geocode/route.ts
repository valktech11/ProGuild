// GET /api/geocode?address=<string>
// Mobile ProMeasure calls this to convert a lead address to lat/lng.
// Uses the same geocodeAddress() utility as storm-evidence and roof reports —
// proven reliable via Google Geocoding API (GOOGLE_SOLAR_API_KEY).
// requirePro not applied: the address string itself is not sensitive data and
// the mobile caller may not have a pro context at the point of map init.

import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/geocode'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.trim() ?? ''
  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400 })
  }
  const result = await geocodeAddress(address)
  if (!result) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 })
  }
  return NextResponse.json({
    lat: result.lat,
    lng: result.lng,
    formatted_address: result.formattedAddress,
  })
}
