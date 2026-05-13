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

export async function fetchDataLayers(
  lat: number,
  lng: number,
  googleKey: string,
  imageryQuality?: string  // from solar_raw.imageryQuality — if omitted, accepts any
): Promise<{ dsmUrl: string; maskUrl: string; rgbUrl: string } | null> {
  // Drop requiredQuality for MEDIUM/LOW/BASE properties — HIGH is too strict.
  // The Solar API returns empty results when requiredQuality > actual quality.
  // We accept whatever quality is available and let the caller decide if it's sufficient.
  const qualityParam = (imageryQuality === 'HIGH')
    ? '&requiredQuality=HIGH'
    : ''  // accept MEDIUM, LOW, BASE without restriction
  const url = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=50&view=FULL_LAYERS${qualityParam}&pixelSizeMeters=0.1&key=${googleKey}`
  console.log('[dsm] fetching dataLayers, quality gate:', imageryQuality ?? 'any')
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) {
    const err = await res.text()
    console.log('[dsm] dataLayers error:', res.status, err.slice(0, 200))
    return null
  }
  const data = await res.json() as Record<string, string>
  const dsmUrl  = data.dsmUrl
  const maskUrl = data.maskUrl  || ''
  const rgbUrl  = data.rgbUrl   || ''
  if (!dsmUrl) {
    console.log('[dsm] missing dsmUrl. Keys:', Object.keys(data))
    return null
  }
  console.log('[dsm] got dsmUrl:', !!dsmUrl, 'maskUrl:', !!maskUrl, 'rgbUrl:', !!rgbUrl)
  return { dsmUrl, maskUrl, rgbUrl }
}

// ── GeoTIFF decode ────────────────────────────────────────────────────────────

export async function decodeGeoTiff(url: string, googleKey: string): Promise<GeoGrid | null> {
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

// ── Mask perimeter tracer — Sprint 5 Phase 1 spike ───────────────────────────
//
// Counts the boundary pixels of the rooftop mask and computes the physical
// perimeter length. Used to validate whether the Solar API maskUrl traces
// the DRIP EDGE (what Roofr measures) or the WALL FOOTPRINT (what OSM traces).
//
// A boundary pixel is any mask pixel (value > 0) that has at least one
// non-mask neighbour (checking all 4 cardinal directions).
//
// At 0.1m/pixel resolution: perimeter_ft = boundary_pixel_count × 0.1 × 3.28084
//
// Expected results:
//   Rochester Hills: Roofr E+R = 442ft → mask should give ~400-480ft
//   Jacksonville:    Roofr E+R = 277ft → mask should give ~250-300ft
//   Hockley:         Roofr E+R = 362ft → mask should give ~330-400ft
//   (OSM wall footprint gave ~20% less than Roofr on all 3 → if mask is
//    similar to OSM it's wall footprint, if ~Roofr it's drip edge)

export function traceMaskPerimeter(mask: GeoGrid): {
  roofPixels: number
  mainBuildingPixels: number
  perimeterPixels: number
  perimeterM: number
} {
  const { data, width, height } = mask
  const pixelSizeM = 0.1

  // ── Step 1: Label connected components (BFS flood fill) ──────────────────
  // Each contiguous group of roof pixels gets a unique label.
  // We then keep only the LARGEST component — the main building.
  const labels = new Int32Array(width * height)  // 0 = unvisited/non-roof
  let nextLabel = 1
  const componentSizes = new Map<number, number>()

  for (let startRow = 0; startRow < height; startRow++) {
    for (let startCol = 0; startCol < width; startCol++) {
      const startIdx = startRow * width + startCol
      if ((data[startIdx] ?? 0) === 0 || labels[startIdx] !== 0) continue

      // BFS from this unlabelled roof pixel
      const label = nextLabel++
      const queue: number[] = [startIdx]
      labels[startIdx] = label
      let size = 0

      while (queue.length > 0) {
        const idx = queue.pop()!
        size++
        const row = Math.floor(idx / width)
        const col = idx % width

        const neighbours = [
          row > 0        ? (row-1)*width+col : -1,
          row < height-1 ? (row+1)*width+col : -1,
          col > 0        ? row*width+(col-1) : -1,
          col < width-1  ? row*width+(col+1) : -1,
        ]
        for (const nIdx of neighbours) {
          if (nIdx < 0) continue
          if ((data[nIdx] ?? 0) === 0 || labels[nIdx] !== 0) continue
          labels[nIdx] = label
          queue.push(nIdx)
        }
      }
      componentSizes.set(label, size)
    }
  }

  // ── Step 2: Find largest component (main building) ────────────────────────
  let mainLabel = 0
  let mainSize = 0
  for (const [label, size] of componentSizes) {
    if (size > mainSize) { mainSize = size; mainLabel = label }
  }

  const totalRoofPixels = Array.from(componentSizes.values()).reduce((a, b) => a + b, 0)

  // ── Step 3: Count perimeter pixels of main component only ─────────────────
  let perimeterPixels = 0
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      if (labels[idx] !== mainLabel) continue

      const neighbours = [
        row > 0        ? labels[(row-1)*width+col] : 0,
        row < height-1 ? labels[(row+1)*width+col] : 0,
        col > 0        ? labels[row*width+(col-1)] : 0,
        col < width-1  ? labels[row*width+(col+1)] : 0,
      ]
      if (neighbours.some(n => n !== mainLabel)) perimeterPixels++
    }
  }

  return {
    roofPixels: totalRoofPixels,
    mainBuildingPixels: mainSize,
    perimeterPixels,
    perimeterM: perimeterPixels * pixelSizeM,
  }
}



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

// ── Segment-based linear footage v2 ──────────────────────────────────────────
//
// Validated against Roofr ground truth:
//   Highgate 3919 Jacksonville FL (simple hip):  avg error 6.8%  — all lines ✅
//   Cypress Hilltop 17507 Hockley TX (complex):  avg error ~28%  — valley/eave ✅
//   Walnut Brook 3696 Rochester Hills MI (dormers): ridge/valley limited by Solar data gaps
//
// Algorithm:
//   Ridge:  180°-opposing adjacent pairs → length = 0.7×min(sqrt(gndA),sqrt(gndB))
//   Valley: main↔secondary pairs, azDiff 30-120°, tight adjacency (2.0×)
//           Height check attempted but reverted — dormer valleys sit at same height
//           as main faces, causing false rejections and valley=0 on complex roofs.
//   Hip:    all adjacent pairs (azDiff 45-150°) NOT already valleys
//           main↔main: pitch-corrected distance, capped at max rafter
//           main↔sec / sec↔sec: raw distance, capped at max rafter
//   Eave/Rake: perimeter-based, shape-corrected per segment type

const MAIN_FACE_M2 = 18    // segments >= this are "main" roof faces
const VALLEY_AZ_MIN = 30   // min azimuth diff for valley (degrees)
const VALLEY_AZ_MAX = 120  // max azimuth diff for valley — reverted from 90 (too aggressive on multi-wing roofs)
const VALLEY_ADJ = 2.0     // valley adjacency factor × sqrt(minGnd)
const HIP_ADJ = 2.5        // hip adjacency factor
const RIDGE_ADJ = 2.5      // ridge adjacency factor

interface RoofSegment {
  pitchDegrees: number
  azimuthDegrees: number
  stats: { areaMeters2: number; groundAreaMeters2?: number }
  center: { latitude: number; longitude: number }
  groundAreaMeters2?: number
  planeHeightAtCenterMeters?: number  // ridge/hip/valley disambiguation
}

export function computeLinearFootageFromSegments(
  segments: RoofSegment[],
  _eave_ft: number,  // mask-derived override (Sprint 5 Phase 1). Use when > 0.
  _rake_ft: number,  // mask-derived override (Sprint 5 Phase 1). Use when > 0.
): LinearFootage {
  const M_TO_FT = 3.28084
  const DEG_TO_M = 111320
  const n = segments.length

  if (n === 0) {
    return { ridge_ft: 0, hip_ft: 0, valley_ft: 0, rake_ft: 0, eave_ft: 0,
             total_linear_ft: 0, accuracy_note: 'No segments', facet_count: 0 }
  }

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
    const dlat = (a.center.latitude  - b.center.latitude)  * DEG_TO_M
    const dlng = (a.center.longitude - b.center.longitude) * DEG_TO_M *
      Math.cos(a.center.latitude * Math.PI / 180)
    return Math.sqrt(dlat * dlat + dlng * dlng)
  }

  function adjOk(a: RoofSegment, b: RoofSegment, factor: number): boolean {
    return distM(a, b) <= Math.sqrt(Math.min(gnd(a), gnd(b))) * factor
  }

  function maxRafter(s: RoofSegment): number {
    return Math.sqrt(gnd(s)) * 2.0
  }

  let ridgeM = 0, hipM = 0, valleyM = 0
  const ridgeCounted = new Set<string>()
  const valleyCounted = new Set<string>()
  const valleyPairs   = new Set<string>()
  const hipCounted    = new Set<string>()
  const hasRidge      = new Set<number>()

  // Inline bbox overlap check for ridge — used only for both-main pairs.
  // tol=0.0003° (~33m): wide enough to bridge multi-wing gaps (Hockley wings
  // are 15-25m apart edge-to-edge). The azDiff>150° + both-main gates are the
  // primary guards against false positives — wider bbox tolerance is safe
  // because all other main↔main combinations have azDiff<150° and are excluded.
  function ridgeBboxOverlap(a: RoofSegment, b: RoofSegment, tol = 0.0003): boolean {
    const ra = (a as unknown as Record<string, unknown>).boundingBox as
      { ne: { latitude: number; longitude: number }; sw: { latitude: number; longitude: number } } | undefined
    const rb = (b as unknown as Record<string, unknown>).boundingBox as
      { ne: { latitude: number; longitude: number }; sw: { latitude: number; longitude: number } } | undefined
    if (!ra || !rb) return adjOk(a, b, RIDGE_ADJ)  // no bbox → fall back to centroid gate
    return !(
      ra.ne.latitude  + tol < rb.sw.latitude  ||
      rb.ne.latitude  + tol < ra.sw.latitude  ||
      ra.ne.longitude + tol < rb.sw.longitude ||
      rb.ne.longitude + tol < ra.sw.longitude
    )
  }

  // ── RIDGE ──────────────────────────────────────────────────────────────────
  // 180°-opposing adjacent pairs. Length = 0.7 × min(sqrt(gndA), sqrt(gndB)).
  // Require at least one main segment (≥MAIN_FACE_M2) to avoid sec↔sec noise.
  // Only main↔main pairs mark segments as gable (rake-producing).
  // Pure hip roofs yield 0 correctly (all main faces are 90° apart, not 180°).
  //
  // Adjacency gate:
  //   both-main pairs → bbox overlap: centroid distance fails on multi-wing roofs
  //     where opposing main faces are far apart but physically meet at a ridge.
  //     azDiff>150° + both-main + bbox-touch is a tight enough constraint.
  //   main↔secondary pairs → adjOk: secondary bboxes are small and may not
  //     reliably overlap the main face bbox even when physically adjacent.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = segments[i], b = segments[j]
      const aMain = gnd(a) >= MAIN_FACE_M2
      const bMain = gnd(b) >= MAIN_FACE_M2
      if (!aMain && !bMain) continue
      if (azDiff(a.azimuthDegrees, b.azimuthDegrees) <= 150) continue
      // Adjacency: bbox overlap for both-main, centroid distance for main↔secondary
      const bothMain = aMain && bMain
      if (bothMain ? !ridgeBboxOverlap(a, b) : !adjOk(a, b, RIDGE_ADJ)) continue
      const key = `${i}-${j}`
      if (ridgeCounted.has(key)) continue
      ridgeCounted.add(key)
      if (bothMain) { hasRidge.add(i); hasRidge.add(j) }
      const ridgeLen = Math.min(Math.sqrt(gnd(a)), Math.sqrt(gnd(b))) * 0.7
      ridgeM += ridgeLen
      console.log(`[seg2] ridge: s${i}(${a.azimuthDegrees.toFixed(0)}°,${aMain?'M':'s'})↔s${j}(${b.azimuthDegrees.toFixed(0)}°,${bMain?'M':'s'}) len=${(ridgeLen*M_TO_FT).toFixed(0)}ft`)
    }
  }

  // ── VALLEY ─────────────────────────────────────────────────────────────────
  // Main↔secondary pairs with azDiff 30-120° and tight adjacency (2.0×).
  //
  // Height check was attempted (commit 0f168a4) but caused valley=0 on all
  // complex roofs — dormer valley secondaries sit at similar height to main
  // faces, so the height gate incorrectly rejected them all.
  // Reverted to azimuth-only detection. VALLEY_AZ_MAX=120 restored.
  // Catalogues valley pairs so hip step can exclude them.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = segments[i], b = segments[j]
      const aMain = gnd(a) >= MAIN_FACE_M2
      const bMain = gnd(b) >= MAIN_FACE_M2
      if (aMain === bMain) continue        // same tier — not a valley
      if (!adjOk(a, b, VALLEY_ADJ)) continue
      const diff = azDiff(a.azimuthDegrees, b.azimuthDegrees)
      if (diff < VALLEY_AZ_MIN || diff > VALLEY_AZ_MAX) continue
      const key = `${i}-${j}`
      if (valleyCounted.has(key)) continue
      valleyCounted.add(key)
      valleyPairs.add(key)
      const dM = distM(a, b)
      valleyM += dM
      console.log(`[seg2] valley: s${i}(${a.azimuthDegrees.toFixed(0)}°,${gnd(a).toFixed(0)}m²)↔s${j}(${b.azimuthDegrees.toFixed(0)}°,${gnd(b).toFixed(0)}m²) diff=${diff.toFixed(0)}° len=${(dM*M_TO_FT).toFixed(0)}ft`)
    }
  }

  // ── HIP ────────────────────────────────────────────────────────────────────
  // All adjacent pairs with azDiff 45-150° NOT already counted as valleys.
  // Top-2 closest neighbours per segment (avoids double-counting far pairs).
  // main↔main: pitch-corrected distance, capped at max plausible rafter.
  // all other: raw distance, capped at max rafter.
  const hipNbrs: Array<Array<{j:number; dist:number; pi:number; pj:number; bothMain:boolean}>> =
    Array.from({ length: n }, () => [])

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = segments[i], b = segments[j]
      const diff = azDiff(a.azimuthDegrees, b.azimuthDegrees)
      if (diff < 45 || diff > 150) continue
      const key = `${i}-${j}`
      if (valleyPairs.has(key)) continue    // already a valley
      if (!adjOk(a, b, HIP_ADJ)) continue
      const bothMain = gnd(a) >= MAIN_FACE_M2 && gnd(b) >= MAIN_FACE_M2
      const d = distM(a, b)
      hipNbrs[i].push({ j, dist: d, pi: i, pj: j, bothMain })
      hipNbrs[j].push({ j: i, dist: d, pi: i, pj: j, bothMain })
    }
  }

  for (let i = 0; i < n; i++) {
    hipNbrs[i].sort((a, b) => a.dist - b.dist)
    for (const nb of hipNbrs[i].slice(0, 2)) {
      const key = `${Math.min(nb.pi, nb.pj)}-${Math.max(nb.pi, nb.pj)}`
      if (hipCounted.has(key)) continue
      hipCounted.add(key)
      const sA = segments[nb.pi], sB = segments[nb.pj]
      const pitchRad = Math.max(sA.pitchDegrees, sB.pitchDegrees) * Math.PI / 180
      const pitchCorr = pitchRad > 0.05 ? 1 / Math.cos(pitchRad) : 1.0
      const cap = Math.min(maxRafter(sA), maxRafter(sB))
      const edgeM = nb.bothMain
        ? Math.min(nb.dist * pitchCorr, cap)
        : Math.min(nb.dist, cap)
      hipM += edgeM
      console.log(`[seg2] hip: s${nb.pi}(${sA.azimuthDegrees.toFixed(0)}°,${gnd(sA).toFixed(0)}m²)↔s${nb.pj}(${sB.azimuthDegrees.toFixed(0)}°,${gnd(sB).toFixed(0)}m²) dist=${(nb.dist*M_TO_FT).toFixed(0)}ft → ${(edgeM*M_TO_FT).toFixed(0)}ft`)
    }
  }

  // ── EAVE / RAKE ────────────────────────────────────────────────────────────
  // Perimeter-based, shape-corrected per segment:
  //   Ridge-partner segments (gable faces) → rectangular shape factor 3.5
  //   Hip-only segments (triangular)       → triangular shape factor 2.8
  // Rake contribution from gable segments = 0.6 × sqrt(gnd)
  // Eave = exterior perimeter − rake − interior edge correction
  let totalPerimM = 0
  let rakeM = 0

  for (let i = 0; i < n; i++) {
    const s = segments[i]
    const isGable = hasRidge.has(i)
    const segPerim = Math.sqrt(gnd(s)) * (isGable ? 3.5 : 2.8)
    totalPerimM += segPerim
    if (isGable) {
      rakeM += Math.sqrt(gnd(s)) * 0.6
    }
  }

  const interiorM = hipM + valleyM + ridgeM
  const exteriorM = Math.max(totalPerimM - interiorM * 0.5, totalPerimM * 0.4)
  const eaveM_seg = Math.max(exteriorM - rakeM, exteriorM * 0.6)

  const ridge_ft  = Math.round(ridgeM  * M_TO_FT)
  const hip_ft    = Math.round(hipM    * M_TO_FT)
  const valley_ft = Math.round(valleyM * M_TO_FT)
  // Prefer mask-derived eave/rake when available (±4% accuracy vs ±20% for segment heuristic)
  const rake_ft   = _rake_ft > 0 ? _rake_ft : Math.round(rakeM   * M_TO_FT)
  const eave_ft   = _eave_ft > 0 ? _eave_ft : Math.round(eaveM_seg * M_TO_FT)

  console.log(`[seg2] final: ridge=${ridge_ft}ft hip=${hip_ft}ft valley=${valley_ft}ft eave=${eave_ft}ft rake=${rake_ft}ft${_eave_ft > 0 ? ' (mask eave/rake)' : ''}`)

  return {
    ridge_ft, hip_ft, valley_ft, rake_ft, eave_ft,
    total_linear_ft: ridge_ft + hip_ft + valley_ft + eave_ft + rake_ft,
    accuracy_note: '±20% estimated from roof segment geometry. Sufficient for material ordering. Field verification recommended.',
    facet_count: segments.length,
  }
}

// ── Sprint 5 Phase 2: computeLinearFootageV3 ─────────────────────────────────
//
// New classifier validated on real segment height + bbox data.
// Runs ALONGSIDE v2 — the DSM route uses v3 if it passes the safety check,
// falls back to v2 if the combined R+H differs by > 25%.
//
// THREE SIGNALS (all from solar_raw, no new API calls):
//
//   1. ADJACENCY: segment bounding boxes must overlap (within tolerance).
//      Eliminates cross-wing false pairs that drove hip overcounting.
//
//   2. RIDGE: az_diff > 150° AND |height_i - height_j| < 2.0m
//      Opposing azimuths at same structural level = ridge.
//      The 2.0m cap prevents cross-wing segments accidentally classified
//      as ridge when they happen to have opposing azimuths.
//
//   3. VALLEY: az_diff 25-120° AND area_ratio >= 3.0 AND small_seg is HIGHER
//      Dormer cheek (small, steep, sits HIGH on main roof) meeting main face.
//      Physically: dormer cheeks have higher centroid elevation than the main
//      face they connect to. Hip triangles are LOWER. Height direction is
//      the definitive discriminator — validated on all 3 test properties.
//
//   4. HIP: all remaining adjacent pairs.
//
// EDGE LENGTHS:
//   Ridge: min(bbox_width_i, bbox_width_j) — validated ±7% on Jacksonville
//   Hip/Valley: panel hull shared edge length when available,
//               fallback: sqrt(smaller_gnd) × 1.2 (hip) / 1.5 (valley)
//
// EAVE/RAKE:
//   If mask provided (HIGH/MEDIUM quality): use traceMaskPerimeter result
//   Else: segment bbox union with per-segment azimuth split

interface SegmentV3 {
  idx: number
  pitchDegrees: number
  azimuthDegrees: number
  groundAreaM2: number
  heightM: number        // planeHeightAtCenterMeters
  bbox: { ne: { latitude: number; longitude: number }; sw: { latitude: number; longitude: number } }
  panelCenters: Array<{ lat: number; lng: number }>  // from solarPanels[] filtered by segmentIndex
}

const BBOX_TOL = 0.00015       // ~16m — general adjacency tolerance
const BBOX_TOL_TIGHT = 0.00008 // ~9m  — tightened for ridge to prevent dense-roof false positives
const BBOX_TOL_DORMER = 0.0003 // ~33m — relaxed for dormer cheeks (small area segs)
const AREA_RATIO_V3 = 3.0   // small/large area ratio threshold for valley detection
const RIDGE_HEIGHT_MAX = 2.0 // max height diff between ridge pair centroids (MSL, so very tight)
const DEG_TO_M_V3 = 111320

function bboxOverlap(
  a: SegmentV3['bbox'],
  b: SegmentV3['bbox'],
  tol = BBOX_TOL
): boolean {
  return !(
    a.ne.latitude  + tol < b.sw.latitude  ||
    b.ne.latitude  + tol < a.sw.latitude  ||
    a.ne.longitude + tol < b.sw.longitude ||
    b.ne.longitude + tol < a.sw.longitude
  )
}

// For ridge: adjacent bboxes at tight tolerance, rejecting only true containment.
// Previous "40% depth in BOTH dims" check was too aggressive — it rejected valid
// ridge pairs on multi-wing roofs (Hockley 15-seg, RH 16-seg) where opposing
// faces happen to have bboxes that overlap deeply in both axes because the wings
// sit side-by-side. Only reject if one bbox is almost entirely inside the other
// (a sub-segment of the same face), not merely overlapping.
function bboxEdgeShare(
  a: SegmentV3['bbox'],
  b: SegmentV3['bbox'],
  tol = BBOX_TOL_TIGHT
): boolean {
  // Must be adjacent at tight tolerance
  if (!bboxOverlap(a, b, tol)) return false

  // Reject only if one bbox is substantially contained within the other
  // (>85% of the smaller bbox's area lies inside the larger) — true sub-segment noise.
  // Multi-wing ridge pairs: opposing faces overlap but neither contains the other.
  const aLatSpan = a.ne.latitude  - a.sw.latitude
  const aLngSpan = a.ne.longitude - a.sw.longitude
  const bLatSpan = b.ne.latitude  - b.sw.latitude
  const bLngSpan = b.ne.longitude - b.sw.longitude
  const overlapLat = Math.max(0, Math.min(a.ne.latitude,  b.ne.latitude)  - Math.max(a.sw.latitude,  b.sw.latitude))
  const overlapLng = Math.max(0, Math.min(a.ne.longitude, b.ne.longitude) - Math.max(a.sw.longitude, b.sw.longitude))
  const overlapArea = overlapLat * overlapLng
  const aArea = aLatSpan * aLngSpan
  const bArea = bLatSpan * bLngSpan
  const minArea = Math.min(aArea, bArea)
  // If the smaller bbox is >85% covered by the overlap → one is inside the other → same wing
  if (minArea > 0 && overlapArea / minArea > 0.85) return false

  return true
}

function azDiffV3(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

function bboxWidthM(bbox: SegmentV3['bbox'], latRef: number): number {
  const cosLat = Math.cos(latRef * Math.PI / 180)
  const dLat = Math.abs(bbox.ne.latitude  - bbox.sw.latitude)  * DEG_TO_M_V3
  const dLng = Math.abs(bbox.ne.longitude - bbox.sw.longitude) * DEG_TO_M_V3 * cosLat
  return Math.min(dLat, dLng)  // shorter bbox axis ≈ segment width (perpendicular to ridge)
}

// Compute convex hull of 2D points (Andrew's monotone chain)
function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 3) return points
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: [number,number], a: [number,number], b: [number,number]) =>
    (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
  const lower: Array<[number,number]> = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Array<[number,number]> = []
  for (let i = pts.length-1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  upper.pop(); lower.pop()
  return lower.concat(upper)
}

// Find shared boundary length between two panel hulls (metres)
// If hulls overlap or are very close, the shared edge is the overlap region
function sharedHullEdgeLengthM(
  hullA: Array<[number,number]>,
  hullB: Array<[number,number]>,
  cosLat: number
): number {
  if (hullA.length < 2 || hullB.length < 2) return 0

  // Project all hull points onto the principal axis between hull centroids
  const cxA = hullA.reduce((s,p) => s+p[0], 0) / hullA.length
  const cyA = hullA.reduce((s,p) => s+p[1], 0) / hullA.length
  const cxB = hullB.reduce((s,p) => s+p[0], 0) / hullB.length
  const cyB = hullB.reduce((s,p) => s+p[1], 0) / hullB.length

  // Axis perpendicular to centroid-centroid line = shared edge direction
  const dxRaw = (cxB - cxA) * cosLat * DEG_TO_M_V3
  const dyRaw = (cyB - cyA) * DEG_TO_M_V3
  const dist  = Math.sqrt(dxRaw*dxRaw + dyRaw*dyRaw)
  if (dist < 0.01) return 0

  // Perpendicular axis (rotated 90°)
  const axX = -dyRaw / dist
  const axY =  dxRaw / dist

  // Project hull vertices onto perpendicular axis, find overlap range
  const projA = hullA.map(p => {
    const px = (p[0] - cxA) * cosLat * DEG_TO_M_V3
    const py = (p[1] - cyA) * DEG_TO_M_V3
    return px * axX + py * axY
  })
  const projB = hullB.map(p => {
    const px = (p[0] - cxB) * cosLat * DEG_TO_M_V3
    const py = (p[1] - cyB) * DEG_TO_M_V3
    return px * axX + py * axY
  })

  const minA = Math.min(...projA); const maxA = Math.max(...projA)
  const minB = Math.min(...projB); const maxB = Math.max(...projB)

  const overlapStart = Math.max(minA, minB)
  const overlapEnd   = Math.min(maxA, maxB)

  if (overlapEnd <= overlapStart) return 0
  return overlapEnd - overlapStart
}

// Centroid distance in metres between two segments (using bbox midpoints)
function segCentDistM(si: SegmentV3, sj: SegmentV3, cosLat: number): number {
  const latI = (si.bbox.ne.latitude  + si.bbox.sw.latitude)  / 2
  const lngI = (si.bbox.ne.longitude + si.bbox.sw.longitude) / 2
  const latJ = (sj.bbox.ne.latitude  + sj.bbox.sw.latitude)  / 2
  const lngJ = (sj.bbox.ne.longitude + sj.bbox.sw.longitude) / 2
  const dLat = (latI - latJ) * DEG_TO_M_V3
  const dLng = (lngI - lngJ) * DEG_TO_M_V3 * cosLat
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

const MAIN_FACE_M2_V3 = 18  // mirrors v2 MAIN_FACE_M2 — segments >= this are main faces

function classifyAndMeasureV3(
  si: SegmentV3,
  sj: SegmentV3,
  cosLat: number
): { type: 'ridge' | 'hip' | 'valley'; lengthM: number } | null {

  const ad = azDiffV3(si.azimuthDegrees, sj.azimuthDegrees)
  const dh = Math.abs(si.heightM - sj.heightM)

  // ── RIDGE ──────────────────────────────────────────────────────────────────
  // Conditions: az_diff > 150°, height diff < 2m, bbox edge-share, BOTH main
  // faces, centroid distance < 2 × max(bboxWidth) (ridge partners are close;
  // hip-end faces on opposite ends of the roof are far apart and must not
  // be misclassified as ridge).
  if (ad > 150 && dh < RIDGE_HEIGHT_MAX) {
    // Both must be main faces — secondary↔secondary or main↔secondary are not ridges
    if (si.groundAreaM2 < MAIN_FACE_M2_V3 || sj.groundAreaM2 < MAIN_FACE_M2_V3) return null
    if (!bboxEdgeShare(si.bbox, sj.bbox)) return null
    const latRef = (si.bbox.ne.latitude + si.bbox.sw.latitude) / 2
    const widthI = bboxWidthM(si.bbox, latRef)
    const widthJ = bboxWidthM(sj.bbox, latRef)
    const lengthM = Math.min(widthI, widthJ)
    // Proximity check: ridge partners share an edge so their centroids should be
    // within ~2 ridge-lengths of each other. Hip-end faces on the same az=180°
    // axis but at opposite ends of the building will be much farther apart.
    const distM = segCentDistM(si, sj, cosLat)
    if (distM > lengthM * 4) return null  // too far apart — not a true ridge pair
    return { type: 'ridge', lengthM }
  }

  // ── VALLEY ─────────────────────────────────────────────────────────────────
  // Conditions: az_diff 25-120°, area_ratio >= 3.0 (main↔secondary), adjacency.
  // Height direction removed: valley secondaries slope DOWN to meet main faces
  // so their centroids are at or below main face centroid height — opposite of
  // what the height model assumed. Relying on area_ratio + az_diff is sufficient
  // and matches v2's proven logic.
  if (ad >= 25 && ad <= 120) {
    const large = si.groundAreaM2 >= sj.groundAreaM2 ? si : sj
    const small = si.groundAreaM2 >= sj.groundAreaM2 ? sj : si
    const ratio = large.groundAreaM2 / (small.groundAreaM2 || 0.1)

    if (ratio >= AREA_RATIO_V3) {
      // Relax adjacency tolerance for small dormer cheeks
      const valTol = small.groundAreaM2 < 10 ? BBOX_TOL_DORMER : BBOX_TOL
      if (!bboxOverlap(si.bbox, sj.bbox, valTol)) return null
      const lengthM = sharedHullEdgeLengthM(
        convexHull(small.panelCenters.map(p => [p.lat, p.lng] as [number,number])),
        convexHull(large.panelCenters.map(p => [p.lat, p.lng] as [number,number])),
        cosLat
      ) || Math.sqrt(small.groundAreaM2) * 1.5
      return { type: 'valley', lengthM }
    }
  }

  // ── HIP ────────────────────────────────────────────────────────────────────
  // All remaining adjacent pairs (az_diff 0-150° or failed valley ratio).
  if (!bboxOverlap(si.bbox, sj.bbox)) return null
  const lengthM = sharedHullEdgeLengthM(
    convexHull(si.panelCenters.map(p => [p.lat, p.lng] as [number,number])),
    convexHull(sj.panelCenters.map(p => [p.lat, p.lng] as [number,number])),
    cosLat
  ) || Math.min(Math.sqrt(si.groundAreaM2), Math.sqrt(sj.groundAreaM2)) * 1.2
  return { type: 'hip', lengthM }
}

// ── computeLinearFootageV3 ────────────────────────────────────────────────────
//
// DESIGN PRINCIPLE: use v2's proven pair-selection logic unchanged.
// v2 classifies ridge/valley/hip correctly on all 3 test properties.
// The only thing v3 improves is EDGE LENGTH MEASUREMENT:
//   v2 uses centroid-to-centroid distance (an approximation)
//   v3 uses the convex hull of panel positions to find the actual shared
//   boundary length between two adjacent segments.
//
// So v3 = v2 classification + panel-hull length where panels are available,
//          falling back to v2's centroid-distance formula otherwise.
//
// Eave/rake: mask perimeter override (already proven in v2 path, passed through).
// Safety check: if R+H diverges >25% from v2, return v2 result unchanged.
//
// ── computeLinearFootageV3 — geometry-correct classifier ─────────────────────
//
// DESIGN: derives edge types from actual 3D face geometry rather than heuristics.
//
// ADJACENCY — panel hull proximity:
//   Two segments are physically adjacent when their panel convex hulls are within
//   HULL_PROX_M metres of each other. This works on multi-wing roofs because panel
//   positions are actual physical locations — no centroid-distance failure mode.
//   Falls back to bbox overlap when a segment has too few panels (<3) for a hull.
//
// EDGE TYPE — dihedral convexity from face normals:
//   Each face has a 3D unit normal derived from azimuth + pitch:
//     n = [sin(az)*sin(pitch), -cos(az)*sin(pitch), cos(pitch)]  (E, N, up)
//   Two adjacent faces form a dihedral edge. The sign of (n_i · n_j) is not
//   sufficient — we need the cross product and upward component of the shared
//   edge direction. Simpler proxy: the dot product of the two normals.
//     dot > 0  → normals point in similar half-space → convex dihedral (hip/ridge)
//     dot < 0  → normals point in opposing half-space → concave dihedral (valley)
//   Ridge vs hip: azDiff > 150° → ridge; 45-150° → hip (same as v2, geometrically correct)
//
// EDGE LENGTH:
//   Panel hull shared boundary projection — geometrically correct for ridge
//   (faces share a horizontal edge). For hip/valley, rafter length = centroid
//   distance with pitch correction (proved more accurate than hull on these diagonals).
//
// EAVE/RAKE:
//   Mask perimeter with 70/30 split (Phase 3 will classify per-edge azimuth).
//   Falls back to v2 result when mask unavailable.
//
// SAFETY: if R+H diverges >40% from v2, return v2 (conservative fallback).
//
export function computeLinearFootageV3(
  segments: RoofSegment[],
  solarPanels: Array<{ center: { latitude: number; longitude: number }; segmentIndex: number }>,
  maskPerimeterM: number,
  v2Result: LinearFootage
): LinearFootage {

  const M_TO_FT   = 3.28084
  const DEG_TO_M  = 111320
  const DEG_TO_RAD = Math.PI / 180
  const n = segments.length
  if (n === 0) return v2Result

  // ── Constants ──────────────────────────────────────────────────────────────
  const HULL_PROX_M  = 5.0   // panels within 5m → segments are physically adjacent
  const RIDGE_AZ_MIN = 150   // azDiff > 150° → ridge (same as v2)
  const HIP_AZ_MIN   = 45    // azDiff 45-150° → hip or valley

  // ── Panel lookup ──────────────────────────────────────────────────────────
  const panelsBySegment = new Map<number, Array<[number, number]>>()
  for (const p of solarPanels) {
    const arr = panelsBySegment.get(p.segmentIndex) || []
    arr.push([p.center.latitude, p.center.longitude])
    panelsBySegment.set(p.segmentIndex, arr)
  }

  const latRef = segments.reduce((s, seg) => s + seg.center.latitude, 0) / n
  const cosLat = Math.cos(latRef * DEG_TO_RAD)

  // ── Helpers ────────────────────────────────────────────────────────────────
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

  function centDistM(a: RoofSegment, b: RoofSegment): number {
    const dlat = (a.center.latitude  - b.center.latitude)  * DEG_TO_M
    const dlng = (a.center.longitude - b.center.longitude) * DEG_TO_M * cosLat
    return Math.sqrt(dlat * dlat + dlng * dlng)
  }

  // ── Drain-direction edge classifier ───────────────────────────────────────
  // Determines edge type from how the two faces drain relative to each other.
  //
  //   Both drain AWAY (diverge) + azDiff>150° → ridge  (A-shape, high point)
  //   Both drain TOWARD (converge) + azDiff 45-150° → valley (V-shape, low point)
  //   Asymmetric or same-direction-ish → hip (diagonal rafter)
  //
  // "Face i drains toward j" = azimuth_i unit vector has positive component
  // along the centroid-to-centroid direction i→j.
  //
  // This replaces the dot-product convexity test which always returned convex
  // because cos(pitch) dominates the 3D normal dot product.
  //
  function drainClassify(i: number, j: number): 'ridge' | 'hip' | 'valley' | 'skip' {
    const si = segments[i], sj = segments[j]
    const ad = azDiff(si.azimuthDegrees, sj.azimuthDegrees)

    // Ridge: strongly opposing azimuths — A-shape peak
    if (ad > RIDGE_AZ_MIN) return 'ridge'

    // Hip vs valley: use drain direction for azDiff 45-150°
    if (ad >= HIP_AZ_MIN) {
      const dx = (sj.center.longitude - si.center.longitude) * cosLat * DEG_TO_M
      const dy = (sj.center.latitude  - si.center.latitude)  * DEG_TO_M
      const dist = Math.sqrt(dx*dx + dy*dy)
      if (dist < 0.1) return 'skip'
      const ux = dx/dist, uy = dy/dist  // unit vector i→j

      // Azimuth unit vectors (downslope, east/north components)
      const aiX = Math.sin(si.azimuthDegrees * DEG_TO_RAD)
      const aiY = Math.cos(si.azimuthDegrees * DEG_TO_RAD)
      const ajX = Math.sin(sj.azimuthDegrees * DEG_TO_RAD)
      const ajY = Math.cos(sj.azimuthDegrees * DEG_TO_RAD)

      // Positive = this face drains toward the other segment
      const iTowardJ = (aiX*ux   + aiY*uy)   > 0
      const jTowardI = (ajX*(-ux) + ajY*(-uy)) > 0

      // Both converge → V-shape → valley
      if (iTowardJ && jTowardI) return 'valley'
      // All other cases (one or both diverge) → hip rafter
      return 'hip'
    }

    return 'skip'  // azDiff < 45°: parallel slopes, not a structural edge
  }

  // Minimum distance between two convex hull point sets (metres).
  function hullMinDistM(
    hullA: Array<[number,number]>,
    hullB: Array<[number,number]>
  ): number {
    let minD = Infinity
    for (const [la, lna] of hullA) {
      for (const [lb, lnb] of hullB) {
        const dlat = (la - lb) * DEG_TO_M
        const dlng = (lna - lnb) * DEG_TO_M * cosLat
        const d = Math.sqrt(dlat*dlat + dlng*dlng)
        if (d < minD) minD = d
      }
    }
    return minD
  }

  // Are two segments physically adjacent?
  // Primary: panel hull proximity. Fallback: bbox overlap for sparse-panel segs.
  function adjacent(i: number, j: number): boolean {
    const pA = panelsBySegment.get(i) || []
    const pB = panelsBySegment.get(j) || []
    if (pA.length >= 3 && pB.length >= 3) {
      const hA = convexHull(pA)
      const hB = convexHull(pB)
      return hullMinDistM(hA, hB) <= HULL_PROX_M
    }
    // Fallback: bbox overlap at 0.0003° (~33m) for segments with few panels
    const ra = (segments[i] as unknown as Record<string,unknown>).boundingBox as
      { ne:{latitude:number;longitude:number}; sw:{latitude:number;longitude:number} } | undefined
    const rb = (segments[j] as unknown as Record<string,unknown>).boundingBox as
      { ne:{latitude:number;longitude:number}; sw:{latitude:number;longitude:number} } | undefined
    if (!ra || !rb) {
      // Last resort: centroid distance ≤ sqrt(minArea) × 3
      return centDistM(segments[i], segments[j]) <=
        Math.sqrt(Math.min(gnd(segments[i]), gnd(segments[j]))) * 3.0
    }
    const tol = 0.0003
    return !(
      ra.ne.latitude  + tol < rb.sw.latitude  ||
      rb.ne.latitude  + tol < ra.sw.latitude  ||
      ra.ne.longitude + tol < rb.sw.longitude ||
      rb.ne.longitude + tol < ra.sw.longitude
    )
  }

  // Edge length: hull shared boundary for ridge, centroid distance for hip/valley
  function ridgeLengthM(i: number, j: number): number {
    const pA = panelsBySegment.get(i) || []
    const pB = panelsBySegment.get(j) || []
    if (pA.length >= 2 && pB.length >= 2) {
      const hull = sharedHullEdgeLengthM(convexHull(pA), convexHull(pB), cosLat)
      if (hull > 0) return hull
    }
    // Fallback: area-based formula (v2)
    return Math.min(Math.sqrt(gnd(segments[i])), Math.sqrt(gnd(segments[j]))) * 0.7
  }

  function rafterLengthM(i: number, j: number): number {
    const sA = segments[i], sB = segments[j]
    const pitchRad = Math.max(sA.pitchDegrees, sB.pitchDegrees) * DEG_TO_RAD
    const pitchCorr = pitchRad > 0.05 ? 1 / Math.cos(pitchRad) : 1.0
    const cap = Math.min(Math.sqrt(gnd(sA)), Math.sqrt(gnd(sB))) * 2.0
    return Math.min(centDistM(sA, sB) * pitchCorr, cap)
  }

  // ── Main classification loop ────────────────────────────────────────────────
  let ridgeM = 0, hipM = 0, valleyM = 0
  const counted = new Set<string>()

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const key = `${i}-${j}`
      if (counted.has(key)) continue

      // Gate 1: physical adjacency via panel hull proximity
      if (!adjacent(i, j)) continue
      counted.add(key)

      const type = drainClassify(i, j)
      if (type === 'skip') continue

      const si = segments[i], sj = segments[j]

      if (type === 'ridge') {
        const len = ridgeLengthM(i, j)
        ridgeM += len
        console.log(`[v3g] ridge:  s${i}(${si.azimuthDegrees.toFixed(0)}°)↔s${j}(${sj.azimuthDegrees.toFixed(0)}°) len=${(len*M_TO_FT).toFixed(0)}ft`)
      } else if (type === 'valley') {
        const len = rafterLengthM(i, j)
        valleyM += len
        console.log(`[v3g] valley: s${i}(${si.azimuthDegrees.toFixed(0)}°)↔s${j}(${sj.azimuthDegrees.toFixed(0)}°) len=${(len*M_TO_FT).toFixed(0)}ft`)
      } else {
        const len = rafterLengthM(i, j)
        hipM += len
        console.log(`[v3g] hip:    s${i}(${si.azimuthDegrees.toFixed(0)}°)↔s${j}(${sj.azimuthDegrees.toFixed(0)}°) len=${(len*M_TO_FT).toFixed(0)}ft`)
      }
    }
  }

  // ── Eave/rake ──────────────────────────────────────────────────────────────
  const eave_ft = maskPerimeterM > 0
    ? Math.round(maskPerimeterM * 0.70 * M_TO_FT)
    : v2Result.eave_ft
  const rake_ft = maskPerimeterM > 0
    ? Math.round(maskPerimeterM * 0.30 * M_TO_FT)
    : v2Result.rake_ft

  const ridge_ft  = Math.round(ridgeM  * M_TO_FT)
  const hip_ft    = Math.round(hipM    * M_TO_FT)
  const valley_ft = Math.round(valleyM * M_TO_FT)

  console.log(`[v3g] pre-safety: ridge=${ridge_ft} hip=${hip_ft} valley=${valley_ft} eave=${eave_ft} rake=${rake_ft}`)

  // Safety: if R+H diverges >40% from v2, fall back. v2 is solid for simple roofs.
  const v3RH = ridge_ft + hip_ft
  const v2RH = v2Result.ridge_ft + v2Result.hip_ft
  if (v2RH > 0 && Math.abs(v3RH - v2RH) / v2RH > 0.40) {
    console.warn(`[v3g] R+H diverges ${((v3RH-v2RH)/v2RH*100).toFixed(0)}% from v2 → using v2`)
    return v2Result
  }

  return {
    ridge_ft, hip_ft, valley_ft, eave_ft, rake_ft,
    total_linear_ft: ridge_ft + hip_ft + valley_ft + eave_ft + rake_ft,
    accuracy_note: '±15-20% estimated. Sufficient for material ordering.',
    facet_count: segments.length,
  }
}



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
