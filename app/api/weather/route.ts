import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 900 // 15-min edge cache

const OWM = 'https://api.openweathermap.org/data/2.5'

function round2(n: number) { return Math.round(n * 100) / 100 }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const latRaw = searchParams.get('lat')
  const lonRaw = searchParams.get('lon')

  if (!latRaw || !lonRaw) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 })
  }

  const lat = parseFloat(latRaw)
  const lon = parseFloat(lonRaw)
  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat/lon must be numeric' }, { status: 400 })
  }

  const key = process.env.OPENWEATHER_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'weather service unavailable' }, { status: 503 })
  }

  // Lat/lon rounded to 2dp for cache key consistency (~1.1km resolution)
  const rlat = round2(lat)
  const rlon = round2(lon)

  try {
    const [curRes, fcRes] = await Promise.all([
      fetch(`${OWM}/weather?lat=${rlat}&lon=${rlon}&units=imperial&appid=${key}`),
      fetch(`${OWM}/forecast?lat=${rlat}&lon=${rlon}&units=imperial&cnt=4&appid=${key}`),
    ])

    if (!curRes.ok || !fcRes.ok) {
      return NextResponse.json({ error: 'upstream weather error' }, { status: 502 })
    }

    const [cur, fc] = await Promise.all([curRes.json(), fcRes.json()])

    // Rain probability: max pop across next ~12hr slots (cnt=4 × 3hr = 12hr window)
    const popPercent = Math.round(
      Math.max(...(fc.list ?? []).map((s: { pop?: number }) => s.pop ?? 0)) * 100
    )

    return NextResponse.json({
      tempF:         Math.round(cur.main?.temp ?? 0),
      condition:     (cur.weather?.[0]?.main ?? '') as string,
      description:   (cur.weather?.[0]?.description ?? '') as string,
      icon:          (cur.weather?.[0]?.icon ?? '') as string,
      popPercent,
      locationLabel: [cur.name, cur.sys?.country].filter(Boolean).join(', '),
    }, {
      headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=300' }
    })
  } catch {
    return NextResponse.json({ error: 'weather fetch failed' }, { status: 502 })
  }
}
