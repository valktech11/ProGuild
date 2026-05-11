export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runDsmAnalysis, fetchDataLayers } from '@/lib/roofing/dsmAnalysis'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, report_id } = await req.json() as { lat: number; lng: number; report_id?: string }
    if (!lat || !lng) return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
    if (!GOOGLE_KEY) return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not set' }, { status: 500 })

    const linear = await runDsmAnalysis(lat, lng, GOOGLE_KEY)
    if (!linear) {
      return NextResponse.json({ error: 'DSM analysis failed — no roof planes found or data unavailable' }, { status: 422 })
    }

    if (report_id) {
      const sb = getSupabaseAdmin()
      await sb.from('roof_reports').update({ linear_footage: linear }).eq('id', report_id)
      console.log('[dsm] stored in report:', report_id)
    }

    return NextResponse.json({ success: true, linear_footage: linear })

  } catch (e) {
    console.error('[dsm] error:', e)
    return NextResponse.json({ error: 'Internal error', detail: String(e).slice(0, 300) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lng = parseFloat(searchParams.get('lng') || '0')
  if (!lat || !lng) return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  if (!GOOGLE_KEY) return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not set' }, { status: 500 })
  const layers = await fetchDataLayers(lat, lng, GOOGLE_KEY)
  return NextResponse.json({ layers, key_set: !!GOOGLE_KEY })
}
