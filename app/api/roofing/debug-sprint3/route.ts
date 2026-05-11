// TEMPORARY DEBUG ROUTE — DELETE AFTER SPRINT 3 VERIFIED
// GET /api/roofing/debug-sprint3?lat=30.310988&lng=-81.683345

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY!
const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '30.310988')
  const lng = parseFloat(searchParams.get('lng') || '-81.683345')
  const results: Record<string, unknown> = { lat, lng, timestamp: new Date().toISOString() }

  // ── TEST 1: NPS NRHP ArcGIS point-in-polygon ─────────────────────────────
  const historicResult: Record<string, unknown> = {}
  try {
    const nrhpUrl = [
      'https://mapservices.nps.gov/arcgis/rest/services',
      '/cultural_resources/nrhp_locations/MapServer/1/query',
      `?geometry=${lng},${lat}`,
      '&geometryType=esriGeometryPoint',
      '&inSR=4326',
      '&spatialRel=esriSpatialRelIntersects',
      '&outFields=RESNAME,CITY,STATE,RESTYPE',
      '&returnGeometry=false',
      '&f=json',
    ].join('')
    historicResult.url = nrhpUrl
    const res = await fetch(nrhpUrl, { headers: { 'User-Agent': 'ProGuild/1.0' }, signal: AbortSignal.timeout(12000) })
    historicResult.httpStatus = res.status
    historicResult.ok = res.ok
    if (res.ok) {
      const json = await res.json() as { features?: Array<{ attributes: Record<string, unknown> }>; error?: unknown }
      historicResult.error = json.error || null
      historicResult.featureCount = json.features?.length ?? 0
      historicResult.features = json.features?.map(f => f.attributes) || []
    } else {
      historicResult.errorBody = (await res.text()).slice(0, 200)
    }
  } catch (e) { historicResult.error = String(e) }
  results.historic = historicResult

  // ── TEST 2: Claude vision (ANTHROPIC_API_KEY) ─────────────────────────────
  const claudeResult: Record<string, unknown> = { hasAnthropicKey: !!ANTHROPIC_KEY, hasGoogleKey: !!GOOGLE_KEY }
  try {
    if (ANTHROPIC_KEY && GOOGLE_KEY) {
      // Get rgbUrl from Solar dataLayers
      const dlRes = await fetch(
        `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=50&view=IMAGERY_AND_ANNUAL_FLUX_LAYERS&requiredQuality=LOW&key=${GOOGLE_KEY}`,
        { signal: AbortSignal.timeout(15000) }
      )
      claudeResult.dataLayersStatus = dlRes.status
      if (dlRes.ok) {
        const dlJson = await dlRes.json() as { rgbUrl?: string }
        claudeResult.hasRgbUrl = !!dlJson.rgbUrl
        if (dlJson.rgbUrl) {
          const imgRes = await fetch(`${dlJson.rgbUrl}&key=${GOOGLE_KEY}`, { signal: AbortSignal.timeout(20000) })
          claudeResult.geotiffStatus = imgRes.status
          if (imgRes.ok) {
            const buf = await imgRes.arrayBuffer()
            const base64 = Buffer.from(buf).toString('base64')
            const mime = imgRes.headers.get('content-type') || 'image/tiff'
            claudeResult.geotiffBytes = buf.byteLength
            const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
                    { type: 'text', text: 'You are a roofing expert reviewing a satellite image of a residential roof. Analyze the visible roof condition and provide a concise 2-3 sentence professional assessment. Focus on: visible wear patterns, potential damage areas, moss/algae growth, missing or damaged shingles, flashing condition, and overall material condition. Be specific. Do not mention the image format or satellite technology. Write in the third person as if writing a field note for a roofing contractor.' }
                  ]
                }]
              }),
              signal: AbortSignal.timeout(25000),
            })
            claudeResult.claudeApiStatus = claudeRes.status
            const claudeJson = await claudeRes.json() as { content?: Array<{ type: string; text?: string }>; error?: unknown }
            if (!claudeRes.ok) { claudeResult.claudeApiError = claudeJson.error }
            else { claudeResult.conditionText = claudeJson.content?.find(b => b.type === 'text')?.text?.trim() || null }
          }
        }
      }
    }
  } catch (e) { claudeResult.error = String(e) }
  results.claude = claudeResult

  return NextResponse.json(results, { status: 200 })
}
