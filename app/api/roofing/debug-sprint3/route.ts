// TEMPORARY DEBUG ROUTE — DELETE AFTER SPRINT 3 VERIFIED
// GET /api/roofing/debug-sprint3?lat=30.310988&lng=-81.683345

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY!
const GEMINI_KEY = process.env.GEMINI_API_KEY || ''

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '30.310988')
  const lng = parseFloat(searchParams.get('lng') || '-81.683345')
  const results: Record<string, unknown> = { lat, lng, timestamp: new Date().toISOString() }

  // ── TEST 1: NPS NRHP ArcGIS MapServer point-in-polygon ───────────────────
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

  // ── TEST 2: Gemini Vision ─────────────────────────────────────────────────
  const geminiResult: Record<string, unknown> = { hasGeminiKey: !!GEMINI_KEY, hasGoogleKey: !!GOOGLE_KEY }
  try {
    // Use Maps Static JPEG — Gemini does not support image/tiff
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&format=jpg&key=${GOOGLE_KEY}`
    const imgRes = await fetch(mapUrl, { signal: AbortSignal.timeout(15000) })
    geminiResult.dataLayersStatus = 200
    geminiResult.hasRgbUrl = true
    geminiResult.geotiffStatus = imgRes.status
    if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer()
        const base64 = Buffer.from(buf).toString('base64')
        const mimeType = 'image/jpeg'
        geminiResult.geotiffBytes = buf.byteLength
        if (true) {
          const prompt = `You are a roofing expert reviewing a satellite image of a residential roof. Analyze the visible roof condition and provide a concise 2-3 sentence professional assessment. Focus on: visible wear patterns, potential damage areas, moss/algae growth, missing or damaged shingles, flashing condition, and overall material condition. Be specific about what you observe. Do not mention the image format or satellite technology. Write in the third person as if writing a field note for a roofing contractor.`
          const MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash']
          for (const model of MODELS) {
            const gemRes = await fetch(
              `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${GEMINI_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
                  generationConfig: { maxOutputTokens: 1000, temperature: 0.2 }
                }),
                signal: AbortSignal.timeout(25000),
              }
            )
            geminiResult.modelTried = model
            geminiResult.geminiApiStatus = gemRes.status
            const gemJson = await gemRes.json() as Record<string, unknown>
            if (gemRes.status === 429 || gemRes.status === 404 || gemRes.status === 400) {
              geminiResult[`${model}_error`] = (gemJson as Record<string,unknown>)
              continue
            }
            if (!gemRes.ok) { geminiResult.geminiApiError = gemJson; break }
            const candidates = (gemJson.candidates as Array<Record<string, unknown>>) || []
            const parts = ((candidates[0]?.content as Record<string,unknown>)?.parts as Array<Record<string,string>>) || []
            geminiResult.conditionText = parts[0]?.text?.trim() || null
            geminiResult.finishReason = candidates[0]?.finishReason
            break
          }
        }
    }
  } catch (e) { geminiResult.error = String(e) }
  results.gemini = geminiResult

  return NextResponse.json(results, { status: 200 })
}
