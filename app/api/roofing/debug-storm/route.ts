// GET /api/roofing/debug-storm?lat=27.9151&lng=-82.3287
// Temporary debug route — tests IEM storm API in isolation. DELETE after smoke-test passes.
import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '27.9151')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '-82.3287')

  const now = new Date()
  const start = new Date(now.getTime() - 24 * 30 * 24 * 60 * 60 * 1000)
  const isoZ = (d: Date) => d.toISOString().slice(0, 19) + 'Z'

  const wfosFor = (la: number, ln: number): string[] => {
    if (la >= 29.4) return ['JAX', 'TAE']
    if (la < 25.6)  return ['KEY', 'MFL']
    if (la >= 27.8 && ln >= -81.6) return ['MLB', 'JAX']
    if (la >= 27.0 && ln < -81.8)  return ['TBW', 'TAE']
    return ['MFL', 'TBW']
  }

  const wfos = wfosFor(lat, lng)
  const results: Record<string, unknown> = {
    lat, lng, wfos,
    start: isoZ(start),
    end: isoZ(now),
    wfo_results: {}
  }

  for (const wfo of wfos) {
    const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/gis/lsr.py`
      + `?wfo=${wfo}&sts=${isoZ(start)}&ets=${isoZ(now)}&fmt=geojson`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ProGuild/1.0' },
        signal: AbortSignal.timeout(10000)
      })
      const text = await res.text()
      let parsed: unknown = null
      try { parsed = JSON.parse(text) } catch { /* raw */ }
      const features = (parsed as { features?: unknown[] })?.features ?? []
      ;(results.wfo_results as Record<string, unknown>)[wfo] = {
        url,
        status: res.status,
        bytes: text.length,
        preview: text.slice(0, 400),
        feature_count: Array.isArray(features) ? features.length : 'n/a',
        first_3_features: Array.isArray(features) ? features.slice(0, 3) : [],
      }
    } catch (e) {
      ;(results.wfo_results as Record<string, unknown>)[wfo] = { url, error: String(e) }
    }
  }

  return NextResponse.json(results, { status: 200 })
}
