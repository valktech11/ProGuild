/**
 * lib/roofing/elevationRidge.ts
 *
 * Elevation API–based ridge length resolution.
 *
 * Queries Google Elevation API at the 4 bbox corners + centroid of each segment
 * in a ridge-candidate pair (10 points per pair, batched into a single request).
 * Selects the two highest-elevation points (one per segment) within plausible
 * ridge-length distance → Haversine = geometrically accurate ridge length.
 *
 * Cost: ~$0.0003 per DSM run (30-60 points per property, $5/1000 locations).
 * Falls back to v2 sqrt(gnd)×0.7 on any API failure — never throws.
 */

export interface ElevSegment {
  azimuthDegrees: number
  pitchDegrees: number
  stats: { areaMeters2: number; groundAreaMeters2?: number }
  groundAreaMeters2?: number
  center: { latitude: number; longitude: number }
  planeHeightAtCenterMeters?: number
  boundingBox?: {
    ne: { latitude: number; longitude: number }
    sw: { latitude: number; longitude: number }
  }
}

export interface RidgePair {
  i: number
  j: number
  v2LengthM: number
}

export interface RidgeEdge {
  i: number
  j: number
  ptA: { lat: number; lng: number }
  ptB: { lat: number; lng: number }
  lengthM: number
  fromElevation: boolean
}

interface ElevResult {
  elevation: number
  location: { lat: number; lng: number }
}

interface ScoredPoint {
  lat: number
  lng: number
  elevation: number
}

const ELEVATION_API_URL = 'https://maps.googleapis.com/maps/api/elevation/json'
const ELEVATION_TIMEOUT_MS = 15_000
const MAX_BATCH_SIZE = 512
const DEG_TO_M = 111_320

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolves ridge lengths via Elevation API.
 * Returns one RidgeEdge per input pair, same order.
 * Falls back to v2LengthM on any failure.
 */
export async function resolveRidgeLengthsViaElevation(
  pairs: RidgePair[],
  segments: ElevSegment[],
  googleKey: string,
): Promise<RidgeEdge[]> {
  if (pairs.length === 0) return []
  if (!googleKey) {
    console.warn('[elev] no API key — using v2 ridge lengths')
    return pairs.map(p => makeFallbackEdge(p, segments))
  }

  // Build candidate points: 4 bbox corners + centroid per segment per pair
  type PointMeta = { pairIdx: number; segIdx: number; lat: number; lng: number }
  const allPoints: PointMeta[] = []

  for (let pi = 0; pi < pairs.length; pi++) {
    const pair = pairs[pi]
    for (const segIdx of [pair.i, pair.j]) {
      const seg = segments[segIdx]
      // centroid
      allPoints.push({ pairIdx: pi, segIdx, lat: seg.center.latitude, lng: seg.center.longitude })
      const bbox = seg.boundingBox
      if (bbox) {
        allPoints.push({ pairIdx: pi, segIdx, lat: bbox.ne.latitude,  lng: bbox.ne.longitude })
        allPoints.push({ pairIdx: pi, segIdx, lat: bbox.ne.latitude,  lng: bbox.sw.longitude })
        allPoints.push({ pairIdx: pi, segIdx, lat: bbox.sw.latitude,  lng: bbox.ne.longitude })
        allPoints.push({ pairIdx: pi, segIdx, lat: bbox.sw.latitude,  lng: bbox.sw.longitude })
      }
    }
  }

  // Deduplicate
  const uniquePts: { lat: number; lng: number }[] = []
  const ptKey = (lat: number, lng: number) => `${lat.toFixed(7)},${lng.toFixed(7)}`
  const ptIdx = new Map<string, number>()
  for (const pt of allPoints) {
    const k = ptKey(pt.lat, pt.lng)
    if (!ptIdx.has(k)) { ptIdx.set(k, uniquePts.length); uniquePts.push({ lat: pt.lat, lng: pt.lng }) }
  }

  console.log(`[elev] querying ${uniquePts.length} elevation points for ${pairs.length} ridge pairs`)

  // Fetch in batches
  const elevMap = new Map<string, number>()
  try {
    for (let offset = 0; offset < uniquePts.length; offset += MAX_BATCH_SIZE) {
      const batch = uniquePts.slice(offset, offset + MAX_BATCH_SIZE)
      const results = await fetchElevationBatch(batch, googleKey)
      if (results === null) {
        console.warn('[elev] batch failed — using v2 for all pairs')
        return pairs.map(p => makeFallbackEdge(p, segments))
      }
      for (const r of results) {
        elevMap.set(ptKey(r.location.lat, r.location.lng), r.elevation)
      }
    }
  } catch (err) {
    console.warn('[elev] exception:', String(err).slice(0, 150))
    return pairs.map(p => makeFallbackEdge(p, segments))
  }

  // Resolve each pair
  return pairs.map((pair, pi) => {
    const ptsI = getCandidatePts(pi, pair.i, allPoints, elevMap)
    const ptsJ = getCandidatePts(pi, pair.j, allPoints, elevMap)
    if (ptsI.length === 0 || ptsJ.length === 0) {
      console.warn(`[elev] no elevation data for pair s${pair.i}↔s${pair.j} — using v2`)
      return makeFallbackEdge(pair, segments)
    }

    const maxLen = maxRidgeLenM(segments[pair.i], segments[pair.j])
    let bestI: ScoredPoint | null = null
    let bestJ: ScoredPoint | null = null
    let bestScore = -Infinity

    for (const pi_ of ptsI) {
      for (const pj_ of ptsJ) {
        const d = haversineM(pi_.lat, pi_.lng, pj_.lat, pj_.lng)
        if (d < 1.0 || d > maxLen) continue
        const score = pi_.elevation + pj_.elevation
        if (score > bestScore) { bestScore = score; bestI = pi_; bestJ = pj_ }
      }
    }

    if (!bestI || !bestJ) {
      console.warn(`[elev] no valid endpoint pair for s${pair.i}↔s${pair.j} (maxLen=${maxLen.toFixed(0)}m) — using v2`)
      return makeFallbackEdge(pair, segments)
    }

    const lengthM = haversineM(bestI.lat, bestI.lng, bestJ.lat, bestJ.lng)
    console.log(
      `[elev] ridge s${pair.i}↔s${pair.j}: ` +
      `elev pts (${bestI.lat.toFixed(5)},${bestI.lng.toFixed(5)}) ` +
      `elev=${bestI.elevation.toFixed(1)}m / (${bestJ.lat.toFixed(5)},${bestJ.lng.toFixed(5)}) ` +
      `elev=${bestJ.elevation.toFixed(1)}m → ${(lengthM * 3.28084).toFixed(0)}ft ` +
      `(v2 was ${(pair.v2LengthM * 3.28084).toFixed(0)}ft)`
    )

    return {
      i: pair.i, j: pair.j,
      ptA: { lat: bestI.lat, lng: bestI.lng },
      ptB: { lat: bestJ.lat, lng: bestJ.lng },
      lengthM,
      fromElevation: true,
    }
  })
}

/**
 * Returns true if the line connecting hipCentA→hipCentB intersects any
 * fromElevation=true ridge edge. Used to reject cross-wing bothMain hip pairs.
 */
export function hipCrossesRidgeAxis(
  ridgeEdges: RidgeEdge[],
  hipCentA: { lat: number; lng: number },
  hipCentB: { lat: number; lng: number },
): boolean {
  if (ridgeEdges.length === 0) return false

  // Minimum ridge length guard: only use elevation edges that represent a real
  // structural ridge (>= 4m ≈ 13ft). Short edges come from dormer peaks or
  // degenerate apex points on hip roofs — using them would reject real hip pairs.
  const MIN_RIDGE_M = 4.0

  const latRef = (hipCentA.lat + hipCentB.lat) / 2
  const cosLat = Math.cos(latRef * Math.PI / 180)

  const toXY = (p: { lat: number; lng: number }): [number, number] =>
    [p.lng * DEG_TO_M * cosLat, p.lat * DEG_TO_M]

  const [ax, ay] = toXY(hipCentA)
  const [bx, by] = toXY(hipCentB)

  for (const edge of ridgeEdges) {
    if (!edge.fromElevation) continue
    if (edge.lengthM < MIN_RIDGE_M) continue  // too short to be a main structural ridge
    const [cx, cy] = toXY(edge.ptA)
    const [dx, dy] = toXY(edge.ptB)
    if (segIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return true
  }
  return false
}

// ── Private helpers ───────────────────────────────────────────────────────────

function getCandidatePts(
  pairIdx: number,
  segIdx: number,
  allPoints: Array<{ pairIdx: number; segIdx: number; lat: number; lng: number }>,
  elevMap: Map<string, number>,
): ScoredPoint[] {
  const out: ScoredPoint[] = []
  for (const pt of allPoints) {
    if (pt.pairIdx !== pairIdx || pt.segIdx !== segIdx) continue
    const k = `${pt.lat.toFixed(7)},${pt.lng.toFixed(7)}`
    const elev = elevMap.get(k)
    if (elev !== undefined) out.push({ lat: pt.lat, lng: pt.lng, elevation: elev })
  }
  return out
}

function maxRidgeLenM(a: ElevSegment, b: ElevSegment): number {
  // Upper bound = diagonal of the combined bbox of both segments.
  // This is the longest possible shared edge between two adjacent faces.
  // Falls back to area-based estimate when bbox data absent.
  const bboxA = a.boundingBox
  const bboxB = b.boundingBox
  if (bboxA && bboxB) {
    // Combined bbox: min of SWs, max of NEs
    const minLat = Math.min(bboxA.sw.latitude,  bboxB.sw.latitude)
    const maxLat = Math.max(bboxA.ne.latitude,  bboxB.ne.latitude)
    const minLng = Math.min(bboxA.sw.longitude, bboxB.sw.longitude)
    const maxLng = Math.max(bboxA.ne.longitude, bboxB.ne.longitude)
    const latRef = (minLat + maxLat) / 2
    const cosLat = Math.cos(latRef * Math.PI / 180)
    const dLat = (maxLat - minLat) * DEG_TO_M
    const dLng = (maxLng - minLng) * DEG_TO_M * cosLat
    // Use the longer axis (not diagonal) — ridge runs along one axis, not across both
    return Math.max(dLat, dLng) * 1.1  // 10% margin
  }
  // Fallback: area-based with generous multiplier
  const gA = a.groundAreaMeters2 ?? a.stats.groundAreaMeters2 ?? a.stats.areaMeters2
  const gB = b.groundAreaMeters2 ?? b.stats.groundAreaMeters2 ?? b.stats.areaMeters2
  return Math.max(Math.sqrt(gA), Math.sqrt(gB)) * 8.0
}

function makeFallbackEdge(pair: RidgePair, segments: ElevSegment[]): RidgeEdge {
  return {
    i: pair.i, j: pair.j,
    ptA: { lat: segments[pair.i].center.latitude, lng: segments[pair.i].center.longitude },
    ptB: { lat: segments[pair.j].center.latitude, lng: segments[pair.j].center.longitude },
    lengthM: pair.v2LengthM,
    fromElevation: false,
  }
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function segIntersect(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number,
): boolean {
  const dx12 = p2x - p1x, dy12 = p2y - p1y
  const dx34 = p4x - p3x, dy34 = p4y - p3y
  const denom = dx12 * dy34 - dy12 * dx34
  if (Math.abs(denom) < 1e-9) return false
  const dx13 = p3x - p1x, dy13 = p3y - p1y
  const t = (dx13 * dy34 - dy13 * dx34) / denom
  const u = (dx13 * dy12 - dy13 * dx12) / denom
  const EPS = 0.02
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS
}

async function fetchElevationBatch(
  locations: { lat: number; lng: number }[],
  googleKey: string,
): Promise<ElevResult[] | null> {
  if (locations.length === 0) return []
  const locStr = locations.map(p => `${p.lat},${p.lng}`).join('|')
  const url = `${ELEVATION_API_URL}?locations=${encodeURIComponent(locStr)}&key=${googleKey}`

  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(ELEVATION_TIMEOUT_MS) })
  } catch (err) {
    console.warn('[elev] fetch error:', String(err).slice(0, 120))
    return null
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`[elev] HTTP ${res.status}:`, body.slice(0, 200))
    return null
  }

  let json: unknown
  try { json = await res.json() } catch { console.warn('[elev] JSON parse error'); return null }

  if (!json || typeof json !== 'object') return null
  const body = json as { status?: string; results?: unknown[]; error_message?: string }
  if (body.status !== 'OK') {
    console.warn(`[elev] status ${body.status}:`, body.error_message ?? '')
    return null
  }
  if (!Array.isArray(body.results)) return null

  const out: ElevResult[] = []
  for (const raw of body.results) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (
      typeof r.elevation !== 'number' ||
      !r.location || typeof r.location !== 'object' ||
      typeof (r.location as Record<string, unknown>).lat !== 'number' ||
      typeof (r.location as Record<string, unknown>).lng !== 'number'
    ) continue
    const loc = r.location as { lat: number; lng: number }
    out.push({ elevation: r.elevation as number, location: { lat: loc.lat, lng: loc.lng } })
  }
  return out
}
