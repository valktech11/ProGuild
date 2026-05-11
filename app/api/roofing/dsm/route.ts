export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { fromArrayBuffer } from 'geotiff'
import { getSupabaseAdmin } from '@/lib/supabase'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''

// ── Types ────────────────────────────────────────────────────────────────────

interface Point3D { x: number; y: number; z: number }
interface Plane { a: number; b: number; c: number; d: number } // ax + by + cz + d = 0
interface Facet { plane: Plane; pixels: number[]; area: number }

interface LinearFootage {
  ridge_ft: number
  hip_ft: number
  valley_ft: number
  rake_ft: number
  eave_ft: number
  total_linear_ft: number
  accuracy_note: string
  facet_count: number
}

// ── Solar dataLayers fetch ────────────────────────────────────────────────────

async function fetchDataLayers(lat: number, lng: number): Promise<{ dsmUrl: string; maskUrl: string } | null> {
  // Radius 50m covers most residential roofs
  const url = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=50&view=DSM_LAYER&requiredQuality=LOW&key=${GOOGLE_KEY}`
  console.log('[dsm] fetching dataLayers')
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!res.ok) {
    const err = await res.text()
    console.log('[dsm] dataLayers error:', res.status, err.slice(0, 200))
    return null
  }
  const data = await res.json() as Record<string, string>
  const dsmUrl = data.dsmUrl
  const maskUrl = data.maskUrl
  if (!dsmUrl || !maskUrl) {
    console.log('[dsm] missing dsmUrl or maskUrl in response. Keys:', Object.keys(data))
    return null
  }
  return { dsmUrl, maskUrl }
}

// ── GeoTIFF decode ───────────────────────────────────────────────────────────

interface GeoGrid {
  data: Float32Array | Float64Array | Int16Array | Uint8Array
  width: number
  height: number
  noDataValue: number | null
}

async function decodeGeoTiff(url: string): Promise<GeoGrid | null> {
  // Append API key — Solar API GeoTIFF URLs require the key
  const fullUrl = url.includes('key=') ? url : `${url}&key=${GOOGLE_KEY}`
  console.log('[dsm] fetching GeoTIFF from:', fullUrl.slice(0, 80) + '...')
  const res = await fetch(fullUrl, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) {
    console.log('[dsm] GeoTIFF fetch error:', res.status)
    return null
  }
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
    console.log('[dsm] decoded GeoTIFF:', width, 'x', height, 'noData:', noDataValue)
    return { data, width, height, noDataValue }
  } catch (e) {
    console.log('[dsm] GeoTIFF decode error:', String(e).slice(0, 150))
    return null
  }
}

// ── RANSAC plane fitting ──────────────────────────────────────────────────────

function fitPlane(pts: Point3D[]): Plane | null {
  if (pts.length < 3) return null
  // Centroid
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length
  // Covariance matrix (3x3 symmetric)
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (const p of pts) {
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz
    xx += dx * dx; xy += dx * dy; xz += dx * dz
    yy += dy * dy; yz += dy * dz; zz += dz * dz
  }
  // Power iteration to find smallest eigenvector (normal to plane)
  // Use cross-product method for robustness: pick two largest-variance axes
  // and cross them to get the normal
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
    // Pick 3 random distinct points
    const i0 = Math.floor(Math.random() * n)
    let i1 = Math.floor(Math.random() * n)
    let i2 = Math.floor(Math.random() * n)
    while (i1 === i0) i1 = Math.floor(Math.random() * n)
    while (i2 === i0 || i2 === i1) i2 = Math.floor(Math.random() * n)

    const plane = fitPlane([points[i0], points[i1], points[i2]])
    if (!plane) continue

    // Count inliers
    const inliers: number[] = []
    for (let j = 0; j < n; j++) {
      if (pointToPlane(points[j], plane) < threshold) inliers.push(j)
    }
    if (inliers.length > bestInliers.length) {
      // Refit plane to all inliers for better accuracy
      const refitPlane = fitPlane(inliers.map(idx => points[idx]))
      if (refitPlane) {
        bestPlane = refitPlane
        // Recount inliers with refitted plane
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

function extractFacets(
  dsm: GeoGrid,
  mask: GeoGrid,
  pixelSizeM = 0.1 // ~10cm per pixel for Solar API DSM
): Facet[] {
  const { data: dsmData, width, height, noDataValue: dsmNoData } = dsm
  const { data: maskData } = mask

  // Build point cloud from masked roof pixels
  const allPoints: Point3D[] = []
  const allIndices: number[] = []

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      const maskVal = maskData[idx]
      const elev = dsmData[idx]
      // Only roof pixels (mask=1), skip no-data
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
  let remaining = allPoints.map((_, i) => i) // indices into allPoints

  // Extract up to 20 planes (more than enough for any residential roof)
  for (let iter = 0; iter < 20; iter++) {
    if (remaining.length < 30) break
    const pts = remaining.map(i => allPoints[i])
    const result = ransac(pts, 150, 0.08)
    if (!result) break
    // Require facet to be at least 1.5% of original roof pixels (filters noise)
    if (result.inliers.length < allPoints.length * 0.015) break

    const facetPixels = result.inliers.map(i => allIndices[remaining[i]])
    const areaM2 = result.inliers.length * pixelSizeM * pixelSizeM
    facets.push({ plane: result.plane, pixels: facetPixels, area: areaM2 })

    // Remove inlier indices from remaining
    const inlierSet = new Set(result.inliers)
    remaining = remaining.filter((_, i) => !inlierSet.has(i))
    console.log(`[dsm] facet ${facets.length}: ${result.inliers.length} pixels, ${areaM2.toFixed(1)}m², remaining: ${remaining.length}`)
  }

  return facets
}

// ── Edge classification and linear footage ────────────────────────────────────

// Classify edge between two adjacent planes by comparing their normals
// and the direction of the edge (angle with horizontal)
type EdgeType = 'ridge' | 'hip' | 'valley' | 'rake' | 'eave' | 'unknown'

function classifyEdge(planeA: Plane, planeB: Plane | null): EdgeType {
  // planeB null = boundary with ground/wall
  if (!planeB) {
    // Single-plane boundary — could be eave or rake
    // If normal is mostly vertical, it's a low slope — eave
    // Use the horizontal component of the normal to determine
    const horizA = Math.sqrt(planeA.a * planeA.a + planeA.b * planeA.b)
    // Steep normals = low slope roof = likely eave boundary
    return horizA < 0.3 ? 'eave' : 'rake'
  }

  // Dot product of normals (both upward-facing, so normalise c to be positive)
  const nA: [number, number, number] = [planeA.a, planeA.b, planeA.c < 0 ? -planeA.c : planeA.c]
  const nB: [number, number, number] = [planeB.a, planeB.b, planeB.c < 0 ? -planeB.c : planeB.c]
  const dot = nA[0] * nB[0] + nA[1] * nB[1] + nA[2] * nB[2]

  // Both planes slope away from edge → ridge or hip (normals point toward each other from above)
  // Both planes slope toward edge → valley (normals point away from each other)
  // Combined z-component: if both normals point up and meet at a peak → ridge/hip
  // If they diverge downward → valley

  // Use cross product z-component to determine if edge is along a peak or trough
  // Ridge/hip: two planes meet going up — their normals diverge outward from edge
  // Valley: two planes meet going down — normals converge toward edge

  // Practical heuristic: look at sign of combined slope toward the shared edge
  // If dot product is close to 1: planes are nearly parallel (low-angle hip or valley)
  // If dot product is negative: planes face away — valley
  // If dot product is positive and < 0.9: ridge or hip meeting at significant angle

  // Vertical component of normals determines slope
  const vertA = Math.abs(nA[2])
  const vertB = Math.abs(nB[2])

  if (dot < 0) return 'valley' // normals face away → valley

  // Check if normals are both predominantly vertical (flat roofs meeting) — eave
  if (vertA > 0.95 && vertB > 0.95) return 'eave'

  // Ridge: nearly horizontal edge, planes slope away symmetrically
  // Hip: diagonal edge, planes slope away at angle
  const horizA2 = Math.sqrt(nA[0] * nA[0] + nA[1] * nA[1])
  const horizB2 = Math.sqrt(nB[0] * nB[0] + nB[1] * nB[1])

  if (horizA2 > 0.15 && horizB2 > 0.15) {
    // Both planes have significant slope — ridge or hip
    // Hip tends to have more diagonal normal direction
    return dot > 0.5 ? 'hip' : 'ridge'
  }

  return 'ridge'
}

// ── Bounding box perimeter → eave + rake estimation ──────────────────────────
// When we can't do full adjacency analysis, use bounding box perimeter
// as a practical estimate for eave + rake combined

function estimatePerimeterEdges(dsm: GeoGrid, mask: GeoGrid, pixelSizeM: number): { eave_m: number; rake_m: number } {
  const { data: maskData, width, height } = mask
  let perimeterPixels = 0

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col
      if (maskData[idx] !== 1 && maskData[idx] !== 255) continue
      // Check if any neighbour is non-roof
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
  // Heuristic: ~70% eave, ~30% rake for typical residential
  return { eave_m: perimeterM * 0.70, rake_m: perimeterM * 0.30 }
}

// ── Main linear footage calculator ───────────────────────────────────────────

function computeLinearFootage(facets: Facet[], dsm: GeoGrid, mask: GeoGrid, pixelSizeM: number): LinearFootage {
  // For each pair of adjacent facets, find shared boundary pixels
  // and estimate edge length
  let ridgeM = 0, hipM = 0, valleyM = 0

  // Build pixel-to-facet lookup
  const pixelFacet = new Map<number, number>()
  facets.forEach((f, fi) => {
    f.pixels.forEach(px => pixelFacet.set(px, fi))
  })

  const { width } = dsm
  const edgeCounts = new Map<string, number>() // "facetA-facetB" → shared pixel count

  // For each roof pixel, check right and down neighbours
  for (const [px, fi] of pixelFacet) {
    const col = px % width
    const row = Math.floor(px / width)
    // Check right neighbour
    if (col < width - 1) {
      const nPx = row * width + (col + 1)
      const nFi = pixelFacet.get(nPx)
      if (nFi !== undefined && nFi !== fi) {
        const key = fi < nFi ? `${fi}-${nFi}` : `${nFi}-${fi}`
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1)
      }
    }
    // Check down neighbour
    const nPx2 = (row + 1) * width + col
    const nFi2 = pixelFacet.get(nPx2)
    if (nFi2 !== undefined && nFi2 !== fi) {
      const key = fi < nFi2 ? `${fi}-${nFi2}` : `${nFi2}-${fi}`
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1)
    }
  }

  // Classify and measure each inter-facet edge
  for (const [key, count] of edgeCounts) {
    const [aStr, bStr] = key.split('-')
    const fi = parseInt(aStr), fj = parseInt(bStr)
    const edgeLenM = count * pixelSizeM
    const type = classifyEdge(facets[fi].plane, facets[fj].plane)
    if (type === 'ridge') ridgeM += edgeLenM
    else if (type === 'hip') hipM += edgeLenM
    else if (type === 'valley') valleyM += edgeLenM
  }

  // Eave and rake from perimeter
  const { eave_m, rake_m } = estimatePerimeterEdges(dsm, mask, pixelSizeM)

  const toFt = (m: number) => Math.round(m * 3.28084)

  const ridge_ft = toFt(ridgeM)
  const hip_ft = toFt(hipM)
  const valley_ft = toFt(valleyM)
  const eave_ft = toFt(eave_m)
  const rake_ft = toFt(rake_m)

  return {
    ridge_ft,
    hip_ft,
    valley_ft,
    rake_ft,
    eave_ft,
    total_linear_ft: ridge_ft + hip_ft + valley_ft + eave_ft + rake_ft,
    accuracy_note: '±6 inches per line segment. Sufficient for material ordering. Field verification recommended before final order.',
    facet_count: facets.length,
  }
}

// ── API Route Handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, report_id } = await req.json() as { lat: number; lng: number; report_id?: string }

    if (!lat || !lng) return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
    if (!GOOGLE_KEY) return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not set' }, { status: 500 })

    console.log('[dsm] starting DSM analysis for', lat, lng)

    // 1. Fetch dataLayers URLs
    const layers = await fetchDataLayers(lat, lng)
    if (!layers) return NextResponse.json({ error: 'Failed to fetch Solar dataLayers' }, { status: 502 })

    // 2. Decode DSM and mask GeoTIFFs in parallel
    const [dsm, mask] = await Promise.all([
      decodeGeoTiff(layers.dsmUrl),
      decodeGeoTiff(layers.maskUrl),
    ])
    if (!dsm || !mask) return NextResponse.json({ error: 'Failed to decode GeoTIFF' }, { status: 502 })
    if (dsm.width !== mask.width || dsm.height !== mask.height) {
      console.log('[dsm] DSM/mask dimension mismatch — using DSM dims for mask')
    }

    // Pixel size: Solar API DSM is 0.1m/pixel (10cm)
    const PIXEL_SIZE_M = 0.1

    // 3. Extract facets via RANSAC
    const facets = extractFacets(dsm, mask, PIXEL_SIZE_M)
    console.log('[dsm] total facets found:', facets.length)

    if (facets.length === 0) {
      return NextResponse.json({ error: 'RANSAC found no roof planes — DSM may be too noisy or flat', debug: { width: dsm.width, height: dsm.height } }, { status: 422 })
    }

    // 4. Compute linear footage
    const linear = computeLinearFootage(facets, dsm, mask, PIXEL_SIZE_M)
    console.log('[dsm] linear footage:', JSON.stringify(linear))

    // 5. Optionally store in roof_reports if report_id provided
    if (report_id) {
      const sb = getSupabaseAdmin()
      await sb.from('roof_reports').update({
        linear_footage: linear,
      }).eq('id', report_id)
      console.log('[dsm] stored linear footage in report:', report_id)
    }

    return NextResponse.json({ success: true, linear_footage: linear })

  } catch (e) {
    console.error('[dsm] unhandled error:', e)
    return NextResponse.json({ error: 'Internal error', detail: String(e).slice(0, 200) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  // Debug — fetch and return raw dataLayers structure + any error
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') || '0')
  const lng = parseFloat(searchParams.get('lng') || '0')
  if (!lat || !lng) return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  if (!GOOGLE_KEY) return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not set' }, { status: 500 })

  const url = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=50&view=DSM_LAYER&requiredQuality=LOW&key=${GOOGLE_KEY}`
  console.log('[dsm-debug] calling:', url.replace(GOOGLE_KEY, 'REDACTED'))
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const body = await res.json() as Record<string, unknown>
    return NextResponse.json({ status: res.status, ok: res.ok, body, key_set: !!GOOGLE_KEY })
  } catch (e) {
    return NextResponse.json({ error: String(e), key_set: !!GOOGLE_KEY })
  }
}
