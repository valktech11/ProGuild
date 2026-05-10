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

  // ── TEST 1: Census TIGER layers ──────────────────────────────────────────
  const censusResult: Record<string, unknown> = {}
  try {
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`
    censusResult.url = censusUrl
    const res = await fetch(censusUrl, { headers: { 'User-Agent': 'ProGuild/1.0' }, signal: AbortSignal.timeout(15000) })
    censusResult.httpStatus = res.status
    censusResult.ok = res.ok
    if (res.ok) {
      const json = await res.json() as { result?: { geographies?: Record<string, unknown[]> } }
      const geos = json.result?.geographies || {}
      censusResult.allLayerKeys = Object.keys(geos)
      const layerCounts: Record<string, number> = {}
      for (const [k, v] of Object.entries(geos)) layerCounts[k] = (v as unknown[]).length
      censusResult.layerCounts = layerCounts
      const historicLayers: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(geos)) {
        if (k.toLowerCase().includes('historic') || k.toLowerCase().includes('national')) {
          historicLayers[k] = v
        }
      }
      censusResult.historicRelatedLayers = historicLayers
      censusResult.incorporatedPlaces = (geos['Incorporated Places'] as Record<string,unknown>[])?.[0] || null
      censusResult.counties = (geos['Counties'] as Record<string,unknown>[])?.[0] || null
    } else {
      censusResult.errorBody = await res.text()
    }
  } catch (e) {
    censusResult.error = String(e)
  }
  results.census = censusResult

  // ── TEST 2: Solar dataLayers + Gemini ────────────────────────────────────
  const geminiResult: Record<string, unknown> = {}
  try {
    geminiResult.hasGoogleKey = !!GOOGLE_KEY
    geminiResult.hasGeminiKey = !!GEMINI_KEY

    const dlUrl = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=50&view=IMAGERY_AND_ANNUAL_FLUX_LAYERS&requiredQuality=LOW&key=${GOOGLE_KEY}`
    const dlRes = await fetch(dlUrl, { signal: AbortSignal.timeout(15000) })
    geminiResult.dataLayersStatus = dlRes.status
    geminiResult.dataLayersOk = dlRes.ok

    if (!dlRes.ok) {
      geminiResult.dataLayersError = (await dlRes.text()).slice(0, 300)
    } else {
      const dlJson = await dlRes.json() as Record<string, unknown>
      geminiResult.dataLayersKeys = Object.keys(dlJson)
      geminiResult.hasRgbUrl = !!dlJson.rgbUrl
      geminiResult.rgbUrlPreview = dlJson.rgbUrl ? String(dlJson.rgbUrl).slice(0, 80) + '...' : null

      if (dlJson.rgbUrl) {
        const imgUrl = `${dlJson.rgbUrl}&key=${GOOGLE_KEY}`
        const imgRes = await fetch(imgUrl as string, { signal: AbortSignal.timeout(20000) })
        geminiResult.geotiffStatus = imgRes.status
        geminiResult.geotiffOk = imgRes.ok
        geminiResult.geotiffMime = imgRes.headers.get('content-type')

        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer()
          geminiResult.geotiffBytes = buf.byteLength
          const base64 = Buffer.from(buf).toString('base64')
          geminiResult.base64Length = base64.length
          const mime = imgRes.headers.get('content-type') || 'image/tiff'

          const prompt = `You are a roofing expert reviewing a satellite image of a residential roof. Analyze the visible roof condition and provide a concise 2-3 sentence professional assessment. Focus on: visible wear patterns, potential damage areas, moss/algae growth, missing or damaged shingles, flashing condition, and overall material condition. Be specific about what you observe. Do not mention the image format or satellite technology. Write in the third person as if writing a field note for a roofing contractor.`

          const gemRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
                generationConfig: { maxOutputTokens: 200, temperature: 0.2 }
              }),
              signal: AbortSignal.timeout(30000),
            }
          )
          geminiResult.geminiApiStatus = gemRes.status
          geminiResult.geminiApiOk = gemRes.ok
          const gemJson = await gemRes.json() as Record<string, unknown>
          if (!gemRes.ok) {
            geminiResult.geminiApiError = JSON.stringify(gemJson).slice(0, 500)
          } else {
            const candidates = (gemJson.candidates as Array<Record<string, unknown>>) || []
            geminiResult.candidateCount = candidates.length
            const parts = ((candidates[0]?.content as Record<string,unknown>)?.parts as Array<Record<string,string>>) || []
            geminiResult.conditionText = parts[0]?.text?.trim() || null
            geminiResult.finishReason = candidates[0]?.finishReason
          }
        } else {
          geminiResult.geotiffError = (await imgRes.text()).slice(0, 300)
        }
      }
    }
  } catch (e) {
    geminiResult.error = String(e)
  }
  results.gemini = geminiResult

  return NextResponse.json(results, { status: 200 })
}
