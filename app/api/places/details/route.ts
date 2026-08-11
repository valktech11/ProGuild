import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('place_id')
  if (!placeId) return NextResponse.json({ result: null }, { status: 400 })
  const key = process.env.GOOGLE_SOLAR_API_KEY
  if (!key) return NextResponse.json({ result: null }, { status: 500 })
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=address_components&key=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const data = await res.json()
  return NextResponse.json({ result: data.result || null })
}
