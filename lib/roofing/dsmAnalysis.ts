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
  const url = `https://solar.googleapis.com/v1/dataLayers:get?location.latitude=${lat}&location.longitude=${lng}&radiusMeters=50&view=FULL_LAYERS&requiredQuality=LOW&key=${googleKey}`
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

function classifyEdge(planeA: Plane, planeB: Plane | null): 'ridge' | 'hip' | 'valley' | 'rake' | 'eave' {
  if (!planeB) {
    const horizA = Math.sqrt(planeA.a * planeA.a + planeA.b * planeA.b)
    return horizA < 0.3 ? 'eave' : 'rake'
  }
  const nA: [number, number, number] = [planeA.a, planeA.b, planeA.c < 0 ? -planeA.c : planeA.c]
  const nB: [number, number, number] = [planeB.a, planeB.b, planeB.c < 0 ? -planeB.c : planeB.c]
  const dot = nA[0] * nB[0] + nA[1] * nB[1] + nA[2] * nB[2]
  const vertA = Math.abs(nA[2])
  const vertB = Math.abs(nB[2])
  if (dot < 0) return 'valley'
  if (vertA > 0.95 && vertB > 0.95) return 'eave'
  const horizA2 = Math.sqrt(nA[0] * nA[0] + nA[1] * nA[1])
  const horizB2 = Math.sqrt(nB[0] * nB[0] + nB[1] * nB[1])
  if (horizA2 > 0.15 && horizB2 > 0.15) return dot > 0.5 ? 'hip' : 'ridge'
  return 'ridge'
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
    if (type === 'ridge') ridgeM += edgeLenM
    else if (type === 'hip') hipM += edgeLenM
    else if (type === 'valley') valleyM += edgeLenM
  }
  const { eave_m, rake_m } = estimatePerimeterEdges(dsm, mask, pixelSizeM)
  const toFt = (m: number) => Math.round(m * 3.28084)
  const ridge_ft = toFt(ridgeM)
  const hip_ft = toFt(hipM)
  const valley_ft = toFt(valleyM)
  const eave_ft = toFt(eave_m)
  const rake_ft = toFt(rake_m)
  return {
    ridge_ft, hip_ft, valley_ft, rake_ft, eave_ft,
    total_linear_ft: ridge_ft + hip_ft + valley_ft + eave_ft + rake_ft,
    accuracy_note: '±6 inches per segment. Field verification recommended.',
    facet_count: facets.length,
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
