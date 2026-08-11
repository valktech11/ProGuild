// app/api/roofing/storm-evidence-pdf/route.ts
// POST /api/roofing/storm-evidence-pdf
// Body: { lat, lon, address, years_back?, radius_mi? }
// Returns: application/pdf — court-ready NOAA storm evidence report.

export const runtime = 'nodejs'
export const maxDuration = 45

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStormEvidence } from '@/lib/roofing/stormEvidence'
import { renderStormEvidencePdf } from '@/lib/roofing/stormEvidencePdf'
import { geocodeAddress } from '@/lib/geocode'

export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const body = await req.json()
  let { lat, lon } = body
  const { address, years_back = 3, radius_mi = 10 } = body

  if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
    const geo = await geocodeAddress(address)
    if (geo) { lat = geo.lat; lon = geo.lng }
  }
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return NextResponse.json({ error: 'Could not resolve property coordinates.' }, { status: 400 })
  }
  if (lat < 24 || lat > 31 || lon < -88 || lon > -79) {
    return NextResponse.json(
      { error: 'Storm evidence currently available for Florida properties only.' },
      { status: 400 }
    )
  }

  const sb = getSupabaseAdmin()
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, business_name')
    .eq('id', auth.proId)
    .maybeSingle()

  const proName    = pro?.full_name    ?? 'ProGuild Pro'
  const proCompany = pro?.business_name ?? ''

  try {
    const evidence = await getStormEvidence(
      lat, lon, address ?? '',
      Math.min(years_back, 5),
      Math.min(radius_mi, 25),
    )

    const element = renderStormEvidencePdf(evidence, proName, proCompany) as any
    const buffer  = await renderToBuffer(element)
    const slug    = (address ?? `${lat},${lon}`).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
    const filename = `storm-evidence-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(Buffer.from(buffer) as any, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    console.error('[storm-evidence-pdf]', msg)
    return NextResponse.json({ error: 'PDF generation failed. Try again.' }, { status: 502 })
  }
}
