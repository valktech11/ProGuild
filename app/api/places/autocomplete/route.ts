import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input')
  if (!input) return NextResponse.json({ predictions: [] })
  const key = process.env.GOOGLE_SOLAR_API_KEY
  if (!key) return NextResponse.json({ predictions: [] }, { status: 500 })
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&components=country:us&key=${key}`
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const data = await res.json()
  return NextResponse.json({
    predictions: (data.predictions || []).map((p: any) => ({
      description: p.description,
      place_id: p.place_id,
    }))
  })
}
