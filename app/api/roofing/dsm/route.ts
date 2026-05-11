// app/api/roofing/dsm/route.ts
// POST /api/roofing/dsm — runs DSM+RANSAC, stores linear_footage on report
// GET  /api/roofing/dsm — debug: raw Solar API dataLayers response

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runDsmAnalysis, fetchDataLayers } from '@/lib/roofing/dsmAnalysis'
import { apiError, validateCoordinates, isValidUuid } from '@/lib/api/utils'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

export async function POST(req: NextRequest) {
  // 1. Parse body safely
  let body: unknown
  try { body = await req.json() }
  catch { return apiError('Invalid JSON in request body', 400) }

  if (!body || typeof body !== 'object') return apiError('Request body must be a JSON object', 400)
  const { lat, lng, report_id, pro_id } = body as Record<string, unknown>

  // 2. Validate coordinates
  const coords = validateCoordinates(lat, lng)
  if (!coords.valid) return apiError(coords.error, 400)

  // 3. Validate and authenticate — both IDs required to prevent IDOR
  if (!isValidUuid(report_id)) return apiError('report_id must be a valid UUID', 400)
  if (!isValidUuid(pro_id)) return apiError('pro_id must be a valid UUID', 400)

  if (!GOOGLE_KEY) return apiError('Google Solar API not configured', 503)

  // 4. Verify ownership before running expensive computation
  const sb = getSupabaseAdmin()
  const { data: owned, error: ownerErr } = await sb
    .from('roof_reports')
    .select('id')
    .eq('id', report_id)
    .eq('pro_id', pro_id)
    .single()

  if (ownerErr || !owned) return apiError('Report not found or access denied', 403)

  // 5. Run DSM analysis
  let linear
  try {
    linear = await runDsmAnalysis(coords.lat, coords.lng, GOOGLE_KEY)
  } catch (e) {
    console.error('[dsm] analysis error:', e)
    return apiError('DSM analysis failed', 500, e)
  }

  if (!linear) {
    return apiError('No roof planes found — roof may be flat, small, or outside Solar API coverage', 422)
  }

  // 6. Persist — double-confirm ownership on write
  const { error: updateErr } = await sb
    .from('roof_reports')
    .update({ linear_footage: linear })
    .eq('id', report_id)
    .eq('pro_id', pro_id)

  if (updateErr) {
    console.error('[dsm] persist error:', updateErr.message)
    // Non-fatal: return result even if DB write fails
  }

  return NextResponse.json({ success: true, linear_footage: linear })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const coords = validateCoordinates(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.valid) return apiError(coords.error, 400)
  if (!GOOGLE_KEY) return apiError('GOOGLE_SOLAR_API_KEY not configured', 503)

  try {
    const layers = await fetchDataLayers(coords.lat, coords.lng, GOOGLE_KEY)
    return NextResponse.json({ layers })
  } catch (e) {
    return apiError('Failed to fetch Solar dataLayers', 502, e)
  }
}
