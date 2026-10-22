import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { computeRoofSkeleton, type LatLng } from '@/lib/roofing/roofSkeleton'

// ── /api/roofing/skeleton ─────────────────────────────────────────────────────
// ProMeasure roof-line PRE-DRAW. Given a confirmed building-outline polygon, returns
// the computed ridge/hip/valley starting layer (straight-skeleton geometry — deterministic,
// no AI/image/elevation). Web (promeasure page) and mobile (Flutter) BOTH call this; the
// geometry lives here ONCE so the two clients can't disagree. Pure compute — no DB writes.
//
// Non-orthogonal footprints return { orthogonal:false, lines:[] } → caller keeps today's
// blank-canvas manual flow unchanged (spec §4). Nothing returned is authoritative: it is a
// starting layer the roofer corrects and saves (spec §25.6). Pitch is not needed — the
// plan-view skeleton is pitch-independent and parity LF is plan-view (see roofSkeleton.ts).

export const dynamic = 'force-dynamic'

const MAX_VERTS = 200 // guard against pathological input

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const auth = await requirePro(req, body?.pro_id ?? null)
  if (auth.error) return auth.error

  const outline = body?.outline ?? body?.polygon
  if (!Array.isArray(outline) || outline.length < 4) {
    return NextResponse.json({ error: 'outline must be an array of ≥4 {lat,lng} points' }, { status: 400 })
  }
  if (outline.length > MAX_VERTS) {
    return NextResponse.json({ error: `outline exceeds ${MAX_VERTS} vertices` }, { status: 400 })
  }
  const clean: LatLng[] = []
  for (const p of outline) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      return NextResponse.json({ error: 'each outline point needs numeric lat & lng' }, { status: 400 })
    }
    clean.push({ lat: p.lat, lng: p.lng })
  }

  const toleranceDeg = Number.isFinite(body?.toleranceDeg) ? body.toleranceDeg : undefined
  const result = computeRoofSkeleton(clean, { toleranceDeg })

  return NextResponse.json(result)
}
