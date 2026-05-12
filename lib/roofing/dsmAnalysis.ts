// lib/roofing/dsmAnalysis.ts
// Shared DSM + RANSAC linear footage logic
// Imported directly by both /api/roofing/dsm and /api/roofing/premium-report
// No HTTP calls between routes — in-process only

import { fromArrayBuffer } from 'geotiff'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Point3D { x: number; y: number; z: number }
interface Plane { a: number; b: number; c: number; d: number }
interface Facet { plane: Plane; pixels: number[]; area: number }

export interface LinearFootage {
  ridge_ft: number
  hip_ft: number
  valley_ft: number
  rake_ft: number
  eave_ft: number
  total_linear_ft: number
  accuracy_note: string
  facet_count: number
}

interface GeoGrid {
  data: Float32Array | Float64Array | Int16Array | Uint8Array
  width: number
  height: number
  noDataValue: number | null
}

// ── Solar dataLayers fetch ────────────────────────────────────────────────────

export async function fetchDataLayers(lat: number, lng: number, googleKey: string): Promise<{ dsmUrl: string; maskUrl: string } | null> {
  const url = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=50&view=FULL_LAYERS&requiredQuality=HIGH&pixelSizeMeters=0.1&key=${googleKey}`
  console.log('[dsm] fetching dataLayers (FULL_LAYERS)')
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) {
    const err = await res.text()
    console.log('[dsm] dataLayers error:', res.status, err.slice(0, 200))
    return null
  }
  const data = await res.json() as Record<string, string>
  const dsmUrl = data.dsmUrl
  const maskUrl = data.maskUrl
  if (!dsmUrl) {
    console.log('[dsm] missing dsmUrl. Keys:', Object.keys(data))
    return null
  }
  console.log('[dsm] got dsmUrl:', !!dsmUrl, 'maskUrl:', !!maskUrl)
  return { dsmUrl, maskUrl: maskUrl || '' }
}

// ── GeoTIFF decode ────────────────────────────────────────────────────────────

async function decodeGeoTiff(url: string, googleKey: string): Promise<GeoGrid | null> {
  const fullUrl = url.includes('key=') ? url : `${url}&key=${googleKey}`
  console.log('[dsm] fetching GeoTIFF:', fullUrl.slice(0, 80) + '...')
  const res = await fetch(fullUrl, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) { console.log('[dsm] GeoTIFF fetch error:', res.status); return null }
  const buffer = await res.arrayBuffer()
  console.log('[dsm] GeoTIFF bytes:', buffer.byteLength)
  try {
    const tiff = await fromArrayBuffer(buffer)
    const image = await tiff.getImage()
    const width = image.getWidth()
    const height = image.getHeight()
    const noDataValue = image.getGDALNoData()
    const rasters = await image.readRasters()
    const data = rasters[0] as Float32Array | Float64Array | Int16Array | Uint8Array
    console.log('[dsm] decoded:', width, 'x', height, 'noData:', noDataValue)
    return { data, width, height, noDataValue }
  } catch (e) {
    console.log('[dsm] GeoTIFF decode error:', String(e).slice(0, 150))
    return null
  }
}

// ── RANSAC plane fitting ──────────────────────────────────────────────────────

function fitPlane(pts: Point3D[]): Plane | null {
  if (pts.length < 3) return null
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz
    xx += dx * dx; xy += dx * dy; xz += dx * dz
    yy += dy * dy; yz += dy * dz; zz += dz * dz
  }
  const detX = yy * zz - yz * yz
  const detY = xx * zz - xz * xz
  const detZ = xx * yy - xy * xy
  let a: number, b: number, c: number
  if (detX >= detY && detX >= detZ) {
    a = detX; b = xz * yz - xy * zz; c = xy * yz - xz * yy
  } else if (detY >= detX && detY >= detZ) {
    a = xz * yz - xy * zz; b = detY; c = xy * xz - yz * xx
  } else {
    a = xy * yz - xz * yy; b = xy * xz - yz * xx; c = detZ
  }
  const len = Math.sqrt(a * a + b * b + c * c)
  if (len < 1e-10) return null
  a /= len; b /= len; c /= len
  const d = -(a * cx + b * cy + c * cz)
  return { a, b, c, d }
}

function pointToPlane(p: Point3D, pl: Plane): number {
  return Math.abs(pl.a * p.x + pl.b * p.y + pl.c * p.z + pl.d)
}

function ransac(points: Point3D[], iterations = 150, threshold = 0.08): { plane: Plane; inliers: number[] } | null {
  if (points.length < 10) return null
  let bestPlane: Plane | null = null
  let bestInliers: number[] = []
  const n = points.length
  for (let i = 0; i < iterations; i++) {
    const i0 = Math.floor(Math.random() * n)
    let i1 = Math.floor(Math.random() * n)
    let i2 = Math.floor(Math.random() * n)
    while (i1 === i0) i1 = Math.floor(Math.random() * n)
    while (i2 === i0 || i2 === i1) i2 = Math.floor(Math.random() * n)
    const plane = fitPlane([points[i0], points[i1], points[i2]])
    if (!plane) continue
    const inliers: number[] = []
    for (let j = 0; j < n; j++) {
      if (pointToPlane(points[j], plane) < threshold) inliers.push(j)
    }
    if (inliers.length > bestInliers.length) {
      const refitPlane = fitPlane(inliers.map(idx => points[idx]))
      if (refitPlane) {
        bestPlane = refitPlane
        bestInliers = []
        for (let j = 0; j < n; j++) {
          if (pointToPlane(points[j], refitPlane) < threshold) bestInliers.push(j)
        }
      } else {
        bestPlane = plane
        bestInliers = inliers
      }
    }
  }
  if (!bestPlane || bestInliers.length < 20) return null
  return { plane: bestPlane, inliers: bestInliers }
}

// ── Facet extraction ──────────────────────────────────────────────────────────

function extractFacets(dsm: GeoGrid, mask: GeoGrid | null, pixelSizeM: number): Facet[] {
  const { data: dsmData, width, height, noDataValue: dsmNoData } = dsm
  const allPoints: Point3D[] = []
  const allIndices: number[] = []

  let maskData: Float32Array | Float64Array | Int16Array | Uint8Array | null = mask?.data || null
  if (!maskData) {
    console.log('[dsm] no mask — elevation thresholding')
    const elevations: number[] = []
    for (let i = 0; i < dsmData.length; i++) {
      const v = Number(dsmData[i])
      if (isFinite(v) && (dsmNoData === null || Math.abs(v - dsmNoData) > 0.01)) elevations.push(v)
    }
    elevations.sort((a, b) => a - b)
    const median = elevations[Math.floor(elevations.length * 0.5)] || 0
    const threshold = median + 0.5
    console.log('[dsm] median:', median.toFixed(2), 'threshold:', threshold.toFixed(2))
    const syntheticMask = new Float32Array(dsmData.length)
    for (let i = 0; i < dsmData.length; i++) {
      const v = Number(dsmData[i])
      syntheticMask[i] = (isFinite(v) && v >= threshold) ? 1 : 0
    }
    maskData = syntheticMask
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      const maskVal = maskData[idx]
      const elev = dsmData[idx]
      if (maskVal !== 1 && maskVal !== 255) continue
      if (dsmNoData !== null && Math.abs(Number(elev) - dsmNoData) < 0.01) continue
      if (!isFinite(Number(elev))) continue
      allPoints.push({ x: col * pixelSizeM, y: row * pixelSizeM, z: Number(elev) })
      allIndices.push(idx)
    }
  }

  console.log('[dsm] roof pixels for RANSAC:', allPoints.length)
  if (allPoints.length < 30) return []

  const facets: Facet[] = []
  let remaining = allPoints.map((_, i) => i)

  for (let iter = 0; iter < 20; iter++) {
    if (remaining.length < 30) break
    const pts = remaining.map(i => allPoints[i])
    const result = ransac(pts, 150, 0.08)
    if (!result) break
    if (result.inliers.length < allPoints.length * 0.015) break
    const facetPixels = result.inliers.map(i => allIndices[remaining[i]])
    const areaM2 = result.inliers.length * pixelSizeM * pixelSizeM
    facets.push({ plane: result.plane, pixels: facetPixels, area: areaM2 })
    const inlierSet = new Set(result.inliers)
    remaining = remaining.filter((_, i) => !inlierSet.has(i))
    console.log(`[dsm] facet ${facets.length}: ${result.inliers.length}px, ${areaM2.toFixed(1)}m²`)
  }
  return facets
}

// ── Edge classification ───────────────────────────────────────────────────────

// Minimum horizontal magnitude for a facet to be considered a real sloped roof plane.
// horiz_mag = sqrt(a²+b²) of the unit normal.
// 3/12 pitch ≈ 14° from horizontal → sin(14°) ≈ 0.24. Use 0.25 as threshold.
// This filters out RANSAC noise facets (< 5° slope) from real roof planes.
const MIN_SLOPE_HORIZ = 0.25

function classifyEdge(planeA: Plane, planeB: Plane | null): 'ridge' | 'hip' | 'valley' | 'rake' | 'eave' | 'skip' {
  // Orient both normals upward
  const sA = planeA.c < 0 ? -1 : 1
  const aN: [number, number, number] = [planeA.a * sA, planeA.b * sA, planeA.c * sA]
  const horizA = Math.sqrt(aN[0] * aN[0] + aN[1] * aN[1])

  if (!planeB) {
    // Perimeter edge: classify by slope of the single facet
    return horizA < 0.3 ? 'eave' : 'rake'
  }

  const sB = planeB.c < 0 ? -1 : 1
  const bN: [number, number, number] = [planeB.a * sB, planeB.b * sB, planeB.c * sB]
  const horizB = Math.sqrt(bN[0] * bN[0] + bN[1] * bN[1])

  // CRITICAL: Both facets are near-flat noise — skip entirely, don't count as any line type.
  // This is the primary fix: RANSAC segments DSM elevation noise into near-flat pseudo-facets.
  // Edges between them are meaningless for linear footage.
  if (horizA < MIN_SLOPE_HORIZ && horizB < MIN_SLOPE_HORIZ) return 'skip'

  // One facet is real slope, other is flat → this is a perimeter-like transition
  // (eave or rake depending on the sloped facet's orientation)
  if (horizA < MIN_SLOPE_HORIZ || horizB < MIN_SLOPE_HORIZ) {
    // The sloped facet dominates classification
    const slopedHoriz = horizA >= MIN_SLOPE_HORIZ ? horizA : horizB
    return slopedHoriz < 0.5 ? 'eave' : 'rake'
  }

  // Both facets are genuinely sloped — classify the inter-plane junction
  // Horizontal dot product: direction the two planes face horizontally
  // Ridge: planes face away from each other → hDot strongly negative
  // Valley: planes face toward each other → hDot positive
  // Hip: corner, planes face ~90° apart → hDot near zero
  const hDot = aN[0] * bN[0] + aN[1] * bN[1]
  const dot3d = aN[0] * bN[0] + aN[1] * bN[1] + aN[2] * bN[2]

  // Angle between horizontal slope directions
  const slopeAngle = Math.acos(Math.max(-1, Math.min(1, hDot / (horizA * horizB)))) * 180 / Math.PI

  if (slopeAngle > 150) return 'ridge'   // slopes face nearly opposite directions → peak
  if (dot3d < 0)        return 'valley'  // 3D normals diverge downward → trough
  if (slopeAngle > 60)  return 'hip'     // slopes at wide angle → corner hip
  return 'ridge'                          // slopes nearly same direction but both real → ridge
}

function estimatePerimeterEdges(dsm: GeoGrid, mask: GeoGrid | null, pixelSizeM: number): { eave_m: number; rake_m: number } {
  const { width, height } = dsm
  const maskData = mask?.data || null
  if (!maskData) {
    const perimeterM = 2 * (width + height) * pixelSizeM * 0.3
    return { eave_m: perimeterM * 0.70, rake_m: perimeterM * 0.30 }
  }
  let perimeterPixels = 0
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      if (maskData[idx] !== 1 && maskData[idx] !== 255) continue
      const neighbours = [
        row > 0 ? maskData[(row - 1) * width + col] : 0,
        row < height - 1 ? maskData[(row + 1) * width + col] : 0,
        col > 0 ? maskData[row * width + col - 1] : 0,
        col < width - 1 ? maskData[row * width + col + 1] : 0,
      ]
      if (neighbours.some(v => v !== 1 && v !== 255)) perimeterPixels++
    }
  }
  const perimeterM = perimeterPixels * pixelSizeM
  return { eave_m: perimeterM * 0.70, rake_m: perimeterM * 0.30 }
}

function computeLinearFootage(facets: Facet[], dsm: GeoGrid, mask: GeoGrid | null, pixelSizeM: number): LinearFootage {
  let ridgeM = 0, hipM = 0, valleyM = 0
  const pixelFacet = new Map<number, number>()
  facets.forEach((f, fi) => f.pixels.forEach(px => pixelFacet.set(px, fi)))
  const { width } = dsm
  const edgeCounts = new Map<string, number>()
  for (const [px, fi] of pixelFacet) {
    const col = px % width
    const row = Math.floor(px / width)
    if (col < width - 1) {
      const nPx = row * width + (col + 1)
      const nFi = pixelFacet.get(nPx)
      if (nFi !== undefined && nFi !== fi) {
        const key = fi < nFi ? `${fi}-${nFi}` : `${nFi}-${fi}`
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1)
      }
    }
    const nPx2 = (row + 1) * width + col
    const nFi2 = pixelFacet.get(nPx2)
    if (nFi2 !== undefined && nFi2 !== fi) {
      const key = fi < nFi2 ? `${fi}-${nFi2}` : `${nFi2}-${fi}`
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1)
    }
  }
  for (const [key, count] of edgeCounts) {
    const [aStr, bStr] = key.split('-')
    const fi = parseInt(aStr), fj = parseInt(bStr)
    const edgeLenM = count * pixelSizeM
    const type = classifyEdge(facets[fi].plane, facets[fj].plane)
    if (type === 'ridge')  ridgeM  += edgeLenM
    else if (type === 'hip')    hipM    += edgeLenM
    else if (type === 'valley') valleyM += edgeLenM
    // 'skip', 'eave', 'rake' from inter-facet edges are not counted here —
    // eave/rake come from estimatePerimeterEdges (mask boundary), not facet pairs
  }
  const { eave_m, rake_m } = estimatePerimeterEdges(dsm, mask, pixelSizeM)
  const toFt = (m: number) => Math.round(m * 3.28084)
  const ridge_ft = toFt(ridgeM)
  const hip_ft   = toFt(hipM)
  const valley_ft = toFt(valleyM)
  const eave_ft  = toFt(eave_m)
  const rake_ft  = toFt(rake_m)
  return {
    ridge_ft, hip_ft, valley_ft, rake_ft, eave_ft,
    total_linear_ft: ridge_ft + hip_ft + valley_ft + eave_ft + rake_ft,
    accuracy_note: '±6 inches per segment. Field verification recommended.',
    facet_count: facets.length,
  }
}

// ── Debug export (staging only — delete after tuning) ────────────────────────

export interface DsmDebugResult {
  facets: Array<{
    id: number
    area_m2: number
    pixel_count: number
    normal: { a: number; b: number; c: number }
    slope_deg: number          // pitch angle from horizontal
    horiz_mag: number          // sqrt(a²+b²) — how tilted the facet is
    slope_dir_deg: number      // compass direction the facet slopes toward (0=north/+y, 90=east/+x)
  }>
  edges: Array<{
    facetA: number
    facetB: number
    pixel_count: number
    length_ft: number
    // edge direction from boundary pixel centroid spread
    edge_dir_x: number         // normalised edge direction vector x
    edge_dir_y: number         // normalised edge direction vector y
    edge_angle_deg: number     // angle of edge in pixel space (0–180°)
    // dot products used by classifier
    hDot: number               // horizontal component dot product
    dot3d: number              // full 3D dot product
    // per-facet slope directions
    slopeDir_A: number         // compass bearing facet A slopes toward
    slopeDir_B: number         // compass bearing facet B slopes toward
    slope_angle_between: number // angle between the two slope directions
    classified_as: 'ridge' | 'hip' | 'valley' | 'rake' | 'eave' | 'skip'
    length_breakdown: string   // human-readable why
  }>
  linear: LinearFootage
  summary: {
    facet_count: number
    edge_count: number
    total_internal_edge_ft: number
    by_type: Record<string, number>
  }
}

export async function runDsmDebug(lat: number, lng: number, googleKey: string): Promise<DsmDebugResult | null> {
  const layers = await fetchDataLayers(lat, lng, googleKey)
  if (!layers) return null

  const dsm = await decodeGeoTiff(layers.dsmUrl, googleKey)
  if (!dsm) return null

  const mask = layers.maskUrl ? await decodeGeoTiff(layers.maskUrl, googleKey) : null

  const PIXEL_SIZE_M = 0.1
  const facets = extractFacets(dsm, mask, PIXEL_SIZE_M)
  if (facets.length === 0) return null

  const { width } = dsm
  const toFt = (m: number) => Math.round(m * 3.28084 * 10) / 10

  // Build pixel→facet map
  const pixelFacet = new Map<number, number>()
  facets.forEach((f, fi) => f.pixels.forEach(px => pixelFacet.set(px, fi)))

  // Collect edge pixel positions for centroid/direction computation
  const edgePixels = new Map<string, number[]>()  // key → [col, row, col, row, ...]
  const edgeCounts = new Map<string, number>()

  for (const [px, fi] of pixelFacet) {
    const col = px % width
    const row = Math.floor(px / width)
    const neighbours: Array<[number, number]> = []
    if (col < width - 1) neighbours.push([row, col + 1])
    if (row < (dsm.height - 1)) neighbours.push([row + 1, col])

    for (const [nr, nc] of neighbours) {
      const nPx = nr * width + nc
      const nFi = pixelFacet.get(nPx)
      if (nFi !== undefined && nFi !== fi) {
        const key = fi < nFi ? `${fi}-${nFi}` : `${nFi}-${fi}`
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1)
        // Store boundary pixel midpoint
        const existing = edgePixels.get(key) || []
        existing.push((col + nc) / 2, (row + nr) / 2)
        edgePixels.set(key, existing)
      }
    }
  }

  // Helper: orient normal upward
  function orientUp(p: Plane): [number, number, number] {
    const s = p.c < 0 ? -1 : 1
    return [p.a * s, p.b * s, p.c * s]
  }

  // Build facet debug info
  const facetInfo = facets.map((f, i) => {
    const [a, b, c] = orientUp(f.plane)
    const horizMag = Math.sqrt(a * a + b * b)
    const slopeDeg = Math.round(Math.atan2(horizMag, c) * 180 / Math.PI * 10) / 10
    // slope direction: which horizontal direction the normal points toward
    // atan2(a, b) gives angle from +y axis (north) clockwise
    const slopeDirDeg = Math.round(Math.atan2(a, b) * 180 / Math.PI * 10) / 10
    return {
      id: i,
      area_m2: Math.round(f.area * 100) / 100,
      pixel_count: f.pixels.length,
      normal: { a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000, c: Math.round(c * 1000) / 1000 },
      slope_deg: slopeDeg,
      horiz_mag: Math.round(horizMag * 1000) / 1000,
      slope_dir_deg: slopeDirDeg,
    }
  })

  // Build edge debug info
  const edgeInfo = Array.from(edgeCounts.entries()).map(([key, count]) => {
    const [aStr, bStr] = key.split('-')
    const fi = parseInt(aStr), fj = parseInt(bStr)
    const planeA = facets[fi].plane
    const planeB = facets[fj].plane

    const aN = orientUp(planeA)
    const bN = orientUp(planeB)
    const hDot = Math.round((aN[0] * bN[0] + aN[1] * bN[1]) * 1000) / 1000
    const dot3d = Math.round((aN[0] * bN[0] + aN[1] * bN[1] + aN[2] * bN[2]) * 1000) / 1000

    // Compute edge direction from boundary pixel positions (PCA of pixel spread)
    const pts = edgePixels.get(key) || []
    let edgeDirX = 0, edgeDirY = 0, edgeAngleDeg = 0
    if (pts.length >= 4) {
      // Simple: use first and last points along the edge
      const n = pts.length / 2
      const x0 = pts[0], y0 = pts[1]
      const x1 = pts[n * 2 - 2], y1 = pts[n * 2 - 1]
      const dx = x1 - x0, dy = y1 - y0
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      edgeDirX = Math.round(dx / len * 1000) / 1000
      edgeDirY = Math.round(dy / len * 1000) / 1000
      edgeAngleDeg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10
    }

    const slopeDirA = facetInfo[fi].slope_dir_deg
    const slopeDirB = facetInfo[fj].slope_dir_deg
    let angleBetween = Math.abs(slopeDirA - slopeDirB)
    if (angleBetween > 180) angleBetween = 360 - angleBetween
    angleBetween = Math.round(angleBetween * 10) / 10

    const classified = classifyEdge(planeA, planeB)

    // Human-readable reasoning
    let why = ''
    const horizA = facetInfo[fi].horiz_mag
    const horizB = facetInfo[fj].horiz_mag
    if (horizA < 0.15 && horizB < 0.15) why = 'both flat → eave'
    else if (hDot > 0.15) why = `hDot=${hDot} > 0.15 → valley (normals converge)`
    else if (dot3d < 0.1) why = `dot3d=${dot3d} < 0.1 → ridge (planes diverge)`
    else why = `hDot=${hDot} ≤ 0.15, dot3d=${dot3d} ≥ 0.1 → hip`

    return {
      facetA: fi,
      facetB: fj,
      pixel_count: count,
      length_ft: toFt(count * PIXEL_SIZE_M),
      edge_dir_x: edgeDirX,
      edge_dir_y: edgeDirY,
      edge_angle_deg: edgeAngleDeg,
      hDot,
      dot3d,
      slopeDir_A: slopeDirA,
      slopeDir_B: slopeDirB,
      slope_angle_between: angleBetween,
      classified_as: classified,
      length_breakdown: why,
    }
  }).sort((a, b) => b.length_ft - a.length_ft)  // longest edges first

  const linear = computeLinearFootage(facets, dsm, mask, PIXEL_SIZE_M)

  // Summary by type
  const byType: Record<string, number> = {}
  for (const e of edgeInfo) {
    byType[e.classified_as] = (byType[e.classified_as] || 0) + e.length_ft
  }

  return {
    facets: facetInfo,
    edges: edgeInfo,
    linear,
    summary: {
      facet_count: facets.length,
      edge_count: edgeInfo.length,
      total_internal_edge_ft: Math.round(edgeInfo.reduce((s, e) => s + e.length_ft, 0)),
      by_type: byType,
    },
  }
}

// ── Segment-based linear footage (Option B — uses roofSegmentStats from Solar API) ──
//
// Derives ridge/hip/valley/eave/rake from Google Solar API roof segment geometry.
// Each segment has pitchDegrees, azimuthDegrees, ground area, and center lat/lng.
// No DSM GeoTIFF needed.
//
// Key rules:
//   Ridge: keep only max-combined-area 180° pair; skip if areas nearly equal (square hip)
//   Hip:   same-tier (main↔main or secondary↔secondary); diff 45-150°; top-2 per segment
//          main hips use dist×1.4 (diagonal rafter correction); secondary use dist
//   Valley: main↔secondary pairs only; diff 10-45°; 3.0x adjacency
//   Eave/rake: from ground area perimeter; 90/10 hip-dominant, 70/30 gable

// Threshold separating main roof faces from secondary/dormer faces (m²)
const MAIN_FACE_M2 = 20

interface RoofSegment {
  pitchDegrees: number
  azimuthDegrees: number
  stats: { areaMeters2: number; groundAreaMeters2?: number }
  center: { latitude: number; longitude: number }
  groundAreaMeters2?: number
}

export function computeLinearFootageFromSegments(
  segments: RoofSegment[],
  _eave_ft: number,  // ignored — computed from ground area
  _rake_ft: number,  // ignored — computed from ground area
): LinearFootage {
  const M_TO_FT = 3.28084
  const DEG_TO_M = 111320
  const n = segments.length

  function gnd(s: RoofSegment): number {
    return s.groundAreaMeters2 ??
      (s.stats as Record<string, number>)?.groundAreaMeters2 ??
      s.stats.areaMeters2
  }

  function azDiff(a: number, b: number): number {
    let d = Math.abs(a - b) % 360
    if (d > 180) d = 360 - d
    return d
  }

  function distM(a: RoofSegment, b: RoofSegment): number {
    const dlat = (a.center.latitude - b.center.latitude) * DEG_TO_M
    const dlng = (a.center.longitude - b.center.longitude) * DEG_TO_M *
      Math.cos(a.center.latitude * Math.PI / 180)
    return Math.sqrt(dlat * dlat + dlng * dlng)
  }

  function adjOk(a: RoofSegment, b: RoofSegment, factor: number): boolean {
    return distM(a, b) <= Math.sqrt(Math.min(gnd(a), gnd(b))) * factor
  }

  let ridgeM = 0, hipM = 0, valleyM = 0

  // ── RIDGE ──────────────────────────────────────────────────────────────────
  // All 180° pairs within 2.0x adjacency. Keep only max-combined-area pair.
  // Skip if combined areas between pairs are nearly equal → square hip → no ridge.
  const ridgeCands: Array<{i:number;j:number;dist:number;combined:number}> = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!adjOk(segments[i], segments[j], 2.0)) continue
      if (azDiff(segments[i].azimuthDegrees, segments[j].azimuthDegrees) > 150) {
        ridgeCands.push({ i, j, dist: distM(segments[i], segments[j]),
          combined: gnd(segments[i]) + gnd(segments[j]) })
      }
    }
  }
  ridgeCands.sort((a, b) => b.combined - a.combined)
  if (ridgeCands.length > 0) {
    const top = ridgeCands[0]
    const areaDiffPct = ridgeCands.length > 1
      ? (top.combined - ridgeCands[1].combined) / top.combined
      : 1.0
    if (areaDiffPct > 0.05) {
      ridgeM = Math.sqrt(Math.min(gnd(segments[top.i]), gnd(segments[top.j]))) * 0.3
      console.log(`[seg] ridge: seg${top.i}↔seg${top.j} areaDiff=${(areaDiffPct*100).toFixed(1)}% edge=${(ridgeM*M_TO_FT).toFixed(0)}ft`)
    } else {
      console.log(`[seg] ridge: 0ft (square hip, areaDiff=${(areaDiffPct*100).toFixed(1)}%)`)
    }
  }

  // ── VALLEY ─────────────────────────────────────────────────────────────────
  // Only main↔secondary pairs with diff 10-45°: where secondary wing attaches.
  // 3.0x adjacency (valley junction may not be pixel-adjacent in DSM).
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = segments[i], b = segments[j]
      const aIsMain = gnd(a) >= MAIN_FACE_M2, bIsMain = gnd(b) >= MAIN_FACE_M2
      if (aIsMain === bIsMain) continue  // skip same-tier
      if (!adjOk(a, b, 3.0)) continue
      const diff = azDiff(a.azimuthDegrees, b.azimuthDegrees)
      if (diff >= 10 && diff < 45) {
        const dM = distM(a, b)
        valleyM += dM
        console.log(`[seg] valley: seg${i}(${a.azimuthDegrees.toFixed(0)}°)↔seg${j}(${b.azimuthDegrees.toFixed(0)}°) diff=${diff.toFixed(0)}° edge=${(dM*M_TO_FT).toFixed(0)}ft`)
      }
    }
  }

  // ── HIP ────────────────────────────────────────────────────────────────────
  // Same-tier pairs only; diff 45-150°; top-2 closest per segment.
  // Main hips: dist×1.4 (hip rafter runs diagonally corner-to-peak).
  // Secondary hips: dist (small irregular faces, no correction).
  const hipCounted = new Set<string>()
  const hipNbrs: Array<Array<{j:number;dist:number;pi:number;pj:number;bothMain:boolean}>> =
    Array.from({ length: n }, () => [])

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = segments[i], b = segments[j]
      if (!adjOk(a, b, 2.0)) continue
      const bothMain = gnd(a) >= MAIN_FACE_M2 && gnd(b) >= MAIN_FACE_M2
      const bothSec  = gnd(a) < MAIN_FACE_M2  && gnd(b) < MAIN_FACE_M2
      if (!bothMain && !bothSec) continue
      const diff = azDiff(a.azimuthDegrees, b.azimuthDegrees)
      if (diff >= 45 && diff <= 150) {
        const d = distM(a, b)
        hipNbrs[i].push({ j, dist: d, pi: i, pj: j, bothMain })
        hipNbrs[j].push({ j: i, dist: d, pi: i, pj: j, bothMain })
      }
    }
  }

  for (let i = 0; i < n; i++) {
    hipNbrs[i].sort((a, b) => a.dist - b.dist)
    for (const nb of hipNbrs[i].slice(0, 2)) {
      const key = nb.pi < nb.pj ? `${nb.pi}-${nb.pj}` : `${nb.pj}-${nb.pi}`
      if (hipCounted.has(key)) continue
      hipCounted.add(key)
      const edgeM = nb.bothMain ? nb.dist * 1.4 : nb.dist
      hipM += edgeM
      console.log(`[seg] hip:   seg${i}(${segments[i].azimuthDegrees.toFixed(0)}°,${gnd(segments[i]).toFixed(0)}m²)↔seg${nb.j}(${segments[nb.j].azimuthDegrees.toFixed(0)}°,${gnd(segments[nb.j]).toFixed(0)}m²) edge=${(edgeM*M_TO_FT).toFixed(0)}ft`)
    }
  }

  // ── EAVE / RAKE ────────────────────────────────────────────────────────────
  // Ground area → square-building perimeter approximation.
  // Hip-dominant (short/zero ridge): 90% eave, 10% rake.
  // Gable/mixed: 70% eave, 30% rake.
  const totalGndM2 = segments.reduce((sum, s) => sum + gnd(s), 0)
  const perimM = 4 * Math.sqrt(totalGndM2)
  const ridgeFt = Math.round(ridgeM * M_TO_FT)
  const isHipDominant = ridgeFt < 15
  const eave_ft = Math.round(perimM * (isHipDominant ? 0.90 : 0.70) * M_TO_FT)
  const rake_ft  = Math.round(perimM * (isHipDominant ? 0.10 : 0.30) * M_TO_FT)

  const hip_ft    = Math.round(hipM    * M_TO_FT)
  const valley_ft = Math.round(valleyM * M_TO_FT)

  console.log(`[seg] eave/rake: totalGnd=${totalGndM2.toFixed(0)}m² perim=${(perimM*M_TO_FT).toFixed(0)}ft hipDominant=${isHipDominant} eave=${eave_ft}ft rake=${rake_ft}ft`)
  console.log(`[seg] final: ridge=${ridgeFt}ft hip=${hip_ft}ft valley=${valley_ft}ft eave=${eave_ft}ft rake=${rake_ft}ft`)

  return {
    ridge_ft: ridgeFt,
    hip_ft,
    valley_ft,
    eave_ft,
    rake_ft,
    total_linear_ft: ridgeFt + hip_ft + valley_ft + eave_ft + rake_ft,
    accuracy_note: '±20% estimated from roof segment geometry. Field verification recommended.',
    facet_count: segments.length,
  }
}


// ── Main exported function ────────────────────────────────────────────────────

export async function runDsmAnalysis(lat: number, lng: number, googleKey: string): Promise<LinearFootage | null> {
  console.log('[dsm] starting analysis for', lat, lng)

  const layers = await fetchDataLayers(lat, lng, googleKey)
  if (!layers) { console.log('[dsm] no layers returned'); return null }

  const dsm = await decodeGeoTiff(layers.dsmUrl, googleKey)
  if (!dsm) { console.log('[dsm] DSM decode failed'); return null }

  const mask = layers.maskUrl ? await decodeGeoTiff(layers.maskUrl, googleKey) : null
  console.log('[dsm] mask available:', !!mask)

  const PIXEL_SIZE_M = 0.1
  const facets = extractFacets(dsm, mask, PIXEL_SIZE_M)
  console.log('[dsm] facets found:', facets.length)

  if (facets.length === 0) {
    console.log('[dsm] no facets — DSM too noisy or flat')
    return null
  }

  const linear = computeLinearFootage(facets, dsm, mask, PIXEL_SIZE_M)
  console.log('[dsm] result:', JSON.stringify(linear))
  return linear
}
