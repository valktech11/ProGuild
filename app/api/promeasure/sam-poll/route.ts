import { NextRequest, NextResponse } from 'next/server'
import {
  resolveRoofPolygonPixels,
  buildMercatorTransform,
} from '../sam-segment/route'

// GET /api/promeasure/sam-poll?id=<predictionId>&lat=&lng=&zoom=&w=&h=
//
// Client calls this every 3s after POST /api/promeasure/sam-segment.
// Returns:
//   { status: 'processing' }                — still running, poll again
//   { status: 'succeeded', polygon: [...] } — done, drop pins
//   { status: 'failed', error: '...' }      — permanent failure

export const runtime     = 'nodejs'
export const maxDuration = 25   // just one Replicate GET + optional mask processing

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!
const REPLICATE_API   = 'https://api.replicate.com/v1'

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!REPLICATE_TOKEN) return NextResponse.json({ status: 'failed', error: 'Replicate not configured' })

  const { searchParams } = new URL(req.url)
  const id   = searchParams.get('id')
  const lat  = Number(searchParams.get('lat'))
  const lng  = Number(searchParams.get('lng'))
  const zoom = Number(searchParams.get('zoom'))
  const w    = Number(searchParams.get('w'))
  const h    = Number(searchParams.get('h'))

  if (!id) return NextResponse.json({ status: 'failed', error: 'missing id' })
  if (isNaN(lat) || isNaN(lng) || isNaN(zoom) || !w || !h)
    return NextResponse.json({ status: 'failed', error: 'missing tile params' })

  console.log(`[sam-poll] checking prediction: ${id}`)

  let poll: any
  try {
    const res = await fetch(`${REPLICATE_API}/predictions/${id}`, {
      headers: { 'Authorization': `Token ${REPLICATE_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error(`[sam-poll] Replicate poll HTTP ${res.status}: ${txt.slice(0, 200)}`)
      return NextResponse.json({ status: 'processing' })  // retry on transient error
    }
    poll = await res.json()
  } catch (err) {
    console.error('[sam-poll] fetch error:', String(err).slice(0, 120))
    return NextResponse.json({ status: 'processing' })
  }

  console.log(`[sam-poll] prediction ${id} status=${poll.status}`)

  if (poll.status === 'starting' || poll.status === 'processing') {
    return NextResponse.json({ status: 'processing' })
  }

  if (poll.status === 'failed' || poll.status === 'canceled') {
    const err = poll.error || poll.status
    console.error(`[sam-poll] prediction failed: ${err}`)
    return NextResponse.json({ status: 'failed', error: `SAM2 ${poll.status}: ${err}` })
  }

  if (poll.status === 'succeeded') {
    let result: { contour: Array<{ nx: number; ny: number }>; maskUrl: string | null; ratios: number[] }
    try {
      result = await resolveRoofPolygonPixels(poll.output, w, h)
    } catch (err) {
      const detail = String(err).slice(0, 200)
      console.error('[sam-poll] mask resolve error:', detail)
      return NextResponse.json({ status: 'failed', error: `Mask processing failed: ${detail}` })
    }

    if (!result.maskUrl) {
      console.error('[sam-poll] succeeded but no usable mask. output:', JSON.stringify(poll.output).slice(0, 300))
      return NextResponse.json({ status: 'failed', error: 'SAM2 returned no usable mask' })
    }
    if (result.contour.length < 3) {
      console.warn('[sam-poll] contour too small:', result.contour.length, 'ratios:', result.ratios)
      return NextResponse.json({ status: 'failed', error: 'No roof outline detected — try tapping the centre of the roof' })
    }

    const { pixelToLatLng } = buildMercatorTransform(lat, lng, zoom, w, h)
    const polygon = result.contour.map(({ nx, ny }) => pixelToLatLng(nx * w, ny * h))
    console.log(`[sam-poll] ✓ ${polygon.length} vertices ready (ratios=[${result.ratios.join(', ')}])`)

    return NextResponse.json({ status: 'succeeded', polygon, vertexCount: polygon.length, maskUrl: result.maskUrl })
  }

  // Unknown status — treat as processing
  console.warn('[sam-poll] unknown prediction status:', poll.status)
  return NextResponse.json({ status: 'processing' })
}
