/**
 * lib/roofing/roofDiagramSvg.ts
 *
 * Renders roof diagrams as SVG strings for embedding in PDF.
 * Two rendering paths:
 *   1. Polygon mode (preferred): uses Gemini Vision polygon vertices
 *   2. Approximation mode (fallback): uses azimuth-rotated rectangles
 *
 * Visual style matches Roofr: white background, light blue face fills,
 * colour-coded edges, length labels, compass rose, facet labels.
 */

import type { GeminiRoofPolygons, GeminiFacet } from './geminiRoofPolygons'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiagramSegment {
  centerLat: number
  centerLng: number
  azimuthDegrees: number
  pitchDegrees: number
  groundAreaMeters2: number
  areaMeters2: number
  planeHeightAtCenterMeters?: number
}

export interface DiagramLinearFootage {
  ridge_ft: number
  hip_ft: number
  valley_ft: number
  eave_ft: number
  rake_ft: number
}

export type DiagramMode = 'pitch' | 'area' | 'notes' | 'length'

// ── Constants ─────────────────────────────────────────────────────────────────

const W = 520
const H = 400
const MARGIN = 48
const M_TO_FT = 3.28084

// Roofr-style colour palette
const COLORS = {
  background:  '#FFFFFF',
  faceFill:    '#DBEAFE',   // light blue — Roofr uses this
  faceStroke:  '#93C5FD',   // blue outline
  ridge:       '#F97316',   // orange
  hip:         '#6366F1',   // indigo
  valley:      '#EF4444',   // red
  eave:        '#10B981',   // green
  rake:        '#8B5CF6',   // purple
  label:       '#1E3A5F',   // dark blue text
  labelBg:     'rgba(255,255,255,0.88)',
  compass:     '#64748B',
  edgeLabel:   '#374151',
  pitchHigh:   '#1E40AF',   // 9+/12
  pitchMed:    '#3B82F6',   // 5-8/12
  pitchLow:    '#93C5FD',   // 3-4/12
  pitchFlat:   '#CBD5E1',   // 0-2/12
}

const EDGE_COLOR: Record<string, string> = {
  ridge: COLORS.ridge,
  hip:   COLORS.hip,
  valley: COLORS.valley,
  eave:  COLORS.eave,
  rake:  COLORS.rake,
}

// ── Public entry points ───────────────────────────────────────────────────────

/**
 * Render diagram using Gemini polygon data (preferred path).
 * Returns SVG string.
 */
export function renderPolygonDiagram(
  polygons: GeminiRoofPolygons,
  segments: DiagramSegment[],
  mode: DiagramMode,
  lf?: DiagramLinearFootage,
): string {
  const { facets } = polygons

  // Map Gemini facets to SVG pixel coords
  const scaledFacets = facets.map(f => ({
    ...f,
    svgVertices: f.vertices.map(v => ({
      x: MARGIN + v.x * (W - 2 * MARGIN),
      y: MARGIN + v.y * (H - 2 * MARGIN),
    })),
    svgCentroid: {
      x: MARGIN + f.centroid.x * (W - 2 * MARGIN),
      y: MARGIN + f.centroid.y * (H - 2 * MARGIN),
    },
    svgEdges: f.edgeTypes.map(e => ({
      ...e,
      svgPt1: { x: MARGIN + e.pt1.x * (W - 2 * MARGIN), y: MARGIN + e.pt1.y * (H - 2 * MARGIN) },
      svgPt2: { x: MARGIN + e.pt2.x * (W - 2 * MARGIN), y: MARGIN + e.pt2.y * (H - 2 * MARGIN) },
    })),
  }))

  // Match Gemini facets to Solar API segments by nearest centroid
  const matched = matchFacetsToSegments(scaledFacets, segments)

  // Build SVG
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  parts.push(defs())
  parts.push(`<rect width="${W}" height="${H}" fill="${COLORS.background}" rx="4"/>`)

  // Draw face fills
  for (const f of scaledFacets) {
    const pts = f.svgVertices.map(v => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ')
    const seg = matched.get(f.id)
    const fill = mode === 'pitch' ? pitchFill(seg?.pitchDegrees ?? 0)
               : mode === 'area'  ? areaFill(seg?.groundAreaMeters2 ?? 0, segments)
               : COLORS.faceFill
    parts.push(`<polygon points="${pts}" fill="${fill}" stroke="${COLORS.faceStroke}" stroke-width="1.5" stroke-linejoin="round"/>`)
  }

  // Draw edges (colour-coded, on top of fills)
  const drawnEdges = new Set<string>()
  for (const f of scaledFacets) {
    for (const edge of f.svgEdges) {
      const key = edgeKey(edge.svgPt1, edge.svgPt2)
      if (drawnEdges.has(key)) continue
      drawnEdges.add(key)
      const col = EDGE_COLOR[edge.type] ?? COLORS.faceStroke
      const dashed = edge.type === 'valley' ? ' stroke-dasharray="6,3"' : ''
      const sw = edge.type === 'ridge' ? 2.5 : edge.type === 'hip' ? 2 : 1.5
      parts.push(
        `<line x1="${edge.svgPt1.x.toFixed(1)}" y1="${edge.svgPt1.y.toFixed(1)}" ` +
        `x2="${edge.svgPt2.x.toFixed(1)}" y2="${edge.svgPt2.y.toFixed(1)}" ` +
        `stroke="${col}" stroke-width="${sw}"${dashed} stroke-linecap="round"/>`
      )
      // Edge length label for 'length' mode
      if (mode === 'length') {
        const mx = (edge.svgPt1.x + edge.svgPt2.x) / 2
        const my = (edge.svgPt1.y + edge.svgPt2.y) / 2
        const lenM = Math.sqrt((edge.svgPt1.x-edge.svgPt2.x)**2 + (edge.svgPt1.y-edge.svgPt2.y)**2) / (W - 2*MARGIN)
        // Can't easily get real feet from normalised coords — skip label unless we have lf
        if (lenM > 0.04) { // only label edges > ~4% of image width
          parts.push(smallLabel(mx, my, edge.type.charAt(0).toUpperCase()))
        }
      }
    }
  }

  // Draw facet labels
  for (const f of scaledFacets) {
    const { x, y } = f.svgCentroid
    const seg = matched.get(f.id)
    const label = getFacetLabel(f, seg, mode, matched.size)
    if (label) parts.push(facetLabel(x, y, label.primary, label.secondary))
  }

  // Legend
  parts.push(renderLegend(mode, lf))

  // Compass rose
  parts.push(compassRose(W - 30, 30, polygons.northOffsetDeg))

  parts.push('</svg>')
  return parts.join('\n')
}

/**
 * Render diagram using approximated shapes (fallback when Gemini fails).
 * Improved vs old version: better shapes, Roofr-style colors.
 */
export function renderApproxDiagram(
  segments: DiagramSegment[],
  mode: DiagramMode,
  lf?: DiagramLinearFootage,
): string {
  if (segments.length === 0) return emptyDiagram('No segment data available')

  const lats = segments.map(s => s.centerLat)
  const lngs = segments.map(s => s.centerLng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const midLat = (minLat + maxLat) / 2
  const cosLat = Math.cos(midLat * Math.PI / 180)
  const latSpan = maxLat - minLat || 0.0001
  const lngSpan = (maxLng - minLng || 0.0001) / cosLat
  const usableW = W - 2 * MARGIN, usableH = H - 2 * MARGIN
  const scale = Math.min(usableW / lngSpan, usableH / latSpan) * 0.82

  function toXY(lat: number, lng: number): [number, number] {
    return [
      MARGIN + ((lng - minLng) / cosLat) * scale + (usableW - lngSpan * scale) / 2,
      MARGIN + (maxLat - lat) * scale + (usableH - latSpan * scale) / 2,
    ]
  }

  // Sort smallest→largest for labeling
  const sorted = [...segments].map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.groundAreaMeters2 - b.s.groundAreaMeters2)

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
  parts.push(defs())
  parts.push(`<rect width="${W}" height="${H}" fill="${COLORS.background}" rx="4"/>`)

  // Draw segment polygons (improved: use aspect-ratio from azimuth)
  for (const { s, i } of sorted) {
    const [cx, cy] = toXY(s.centerLat, s.centerLng)
    const area = s.groundAreaMeters2
    const side = Math.sqrt(area) * scale
    const hw = Math.min(Math.max(side * 0.45, 10), 70)
    const hh = Math.min(Math.max(side * 0.6, 12), 80)
    const azRad = ((s.azimuthDegrees - 90) * Math.PI) / 180
    const cos = Math.cos(azRad), sin = Math.sin(azRad)

    // Determine if triangular (hip face): small area relative to neighbours
    const isTriangle = area < 10 && segments.length > 6
    let pts: string
    if (isTriangle) {
      // Render as triangle pointing in drain direction
      pts = [
        [cx + hw * cos - hh * sin, cy + hw * sin + hh * cos],
        [cx - hw * cos - hh * sin, cy - hw * sin + hh * cos],
        [cx,                        cy - hh * cos],
      ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    } else {
      pts = [
        [cx + hw * cos - hh * sin, cy + hw * sin + hh * cos],
        [cx - hw * cos - hh * sin, cy - hw * sin + hh * cos],
        [cx - hw * cos + hh * sin, cy - hw * sin - hh * cos],
        [cx + hw * cos + hh * sin, cy + hw * sin - hh * cos],
      ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    }

    const fill = mode === 'pitch' ? pitchFill(s.pitchDegrees)
               : mode === 'area'  ? areaFill(s.groundAreaMeters2, segments)
               : COLORS.faceFill
    parts.push(`<polygon points="${pts}" fill="${fill}" stroke="${COLORS.faceStroke}" stroke-width="1.5" stroke-linejoin="round"/>`)

    // Facet label
    const labelChar = i < 26 ? String.fromCharCode(65 + i) : `${i + 1}`
    const primary = mode === 'pitch'  ? degreesToPitch(s.pitchDegrees)
                  : mode === 'area'   ? `${Math.round(s.groundAreaMeters2 * 10.7639)} ft²`
                  : mode === 'notes'  ? labelChar
                  : labelChar
    const secondary = mode === 'pitch' ? '' : mode === 'notes' ? '' : ''
    if (primary) parts.push(facetLabel(cx, cy, primary, secondary))
  }

  // Draw adjacency edges
  const edgesSeen = new Set<string>()
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i], b = segments[j]
      const [ax, ay] = toXY(a.centerLat, a.centerLng)
      const [bx, by] = toXY(b.centerLat, b.centerLng)
      const dist = Math.sqrt((ax-bx)**2 + (ay-by)**2)
      const maxDist = (Math.sqrt(a.groundAreaMeters2) + Math.sqrt(b.groundAreaMeters2)) * scale * 1.2
      if (dist > maxDist) continue
      const azA = a.azimuthDegrees, azB = b.azimuthDegrees
      let azDiff = Math.abs(azA - azB) % 360
      if (azDiff > 180) azDiff = 360 - azDiff
      const type = azDiff > 150 ? 'ridge'
                 : azDiff >= 30 && azDiff <= 120 ? 'valley'
                 : 'hip'
      const key = `${i}-${j}-${type}`
      if (edgesSeen.has(key)) continue
      edgesSeen.add(key)
      const col = EDGE_COLOR[type]
      const sw = type === 'ridge' ? 2.5 : 1.8
      const da = type === 'valley' ? ' stroke-dasharray="5,3"' : ''
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      const lenFt = Math.round(dist / scale * M_TO_FT)
      parts.push(
        `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" ` +
        `stroke="${col}" stroke-width="${sw}"${da} stroke-linecap="round"/>`
      )
      if (lenFt > 5 && mode === 'length') parts.push(smallLabel(mx, my, `${lenFt}ft`))
    }
  }

  parts.push(renderLegend(mode, lf))
  parts.push(compassRose(W - 30, 30, 0))
  parts.push('</svg>')
  return parts.join('\n')
}

// ── Helper functions ──────────────────────────────────────────────────────────

function defs(): string {
  return `<defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#00000018"/>
    </filter>
  </defs>`
}

function pitchFill(pitchDeg: number): string {
  if (pitchDeg >= 33.7) return '#BFDBFE'  // 8+/12 steep
  if (pitchDeg >= 22.6) return '#DBEAFE'  // 5-7/12 standard
  if (pitchDeg >= 14.0) return '#EFF6FF'  // 3-4/12 low
  return '#F8FAFC'                         // flat
}

function areaFill(areaM2: number, all: DiagramSegment[]): string {
  const maxArea = Math.max(...all.map(s => s.groundAreaMeters2))
  const ratio = areaM2 / (maxArea || 1)
  if (ratio > 0.6) return '#BFDBFE'
  if (ratio > 0.3) return '#DBEAFE'
  if (ratio > 0.1) return '#EFF6FF'
  return '#F8FAFC'
}

function degreesToPitch(deg: number): string {
  const rise = Math.round(Math.tan(deg * Math.PI / 180) * 12)
  return `${rise}/12`
}

function facetLabel(cx: number, cy: number, primary: string, secondary: string): string {
  if (!primary) return ''
  const lines = secondary ? [primary, secondary] : [primary]
  const lh = 11
  const totalH = lines.length * lh
  const y0 = cy - totalH / 2 + lh * 0.75
  return lines.map((txt, i) => {
    const isSec = i > 0
    return `<text x="${cx.toFixed(1)}" y="${(y0 + i * lh).toFixed(1)}" ` +
      `text-anchor="middle" font-family="Helvetica" font-size="${isSec ? 8 : 9}" ` +
      `font-weight="${isSec ? 'normal' : 'bold'}" fill="${COLORS.label}" ` +
      `paint-order="stroke" stroke="${COLORS.labelBg}" stroke-width="3" stroke-linejoin="round">${txt}</text>`
  }).join('\n')
}

function smallLabel(x: number, y: number, text: string): string {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" ` +
    `font-family="Helvetica" font-size="7.5" fill="${COLORS.edgeLabel}" ` +
    `paint-order="stroke" stroke="white" stroke-width="2.5">${text}</text>`
}

function edgeKey(p1: { x: number; y: number }, p2: { x: number; y: number }): string {
  const [ax, bx] = p1.x < p2.x ? [p1, p2] : [p2, p1]
  return `${ax.x.toFixed(2)},${ax.y.toFixed(2)}-${bx.x.toFixed(2)},${bx.y.toFixed(2)}`
}

function compassRose(cx: number, cy: number, northDeg: number): string {
  const r = 14
  const rad = northDeg * Math.PI / 180
  const nx = cx + Math.sin(rad) * (-r)
  const ny = cy + Math.cos(rad) * (-r)
  const sx = cx - Math.sin(rad) * (-r)
  const sy = cy - Math.cos(rad) * (-r)
  return `<g opacity="0.7">
    <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="white" stroke="${COLORS.compass}" stroke-width="1"/>
    <line x1="${nx.toFixed(1)}" y1="${ny.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="${COLORS.compass}" stroke-width="1.5"/>
    <polygon points="${cx},${ny.toFixed(1)} ${(cx-4).toFixed(1)},${cy.toFixed(1)} ${(cx+4).toFixed(1)},${cy.toFixed(1)}" fill="${COLORS.ridge}" stroke="none"/>
    <text x="${nx.toFixed(1)}" y="${(ny - 5).toFixed(1)}" text-anchor="middle" font-family="Helvetica" font-size="8" font-weight="bold" fill="${COLORS.compass}">N</text>
    <text x="${cx}" y="${cy + r + 10}" text-anchor="middle" font-family="Helvetica" font-size="7" fill="${COLORS.compass}">S</text>
  </g>`
}

function renderLegend(mode: DiagramMode, lf?: DiagramLinearFootage): string {
  if (mode === 'notes') return ''

  const items =
    mode === 'pitch' ? [
      { col: '#BFDBFE', label: '7+/12 steep' },
      { col: '#DBEAFE', label: '5–6/12 std' },
      { col: '#EFF6FF', label: '3–4/12 low' },
      { col: '#F8FAFC', label: '≤2/12 flat', stroke: '#CBD5E1' },
    ] :
    mode === 'area' ? [
      { col: '#BFDBFE', label: 'Large (>60%)' },
      { col: '#DBEAFE', label: 'Med (30–60%)' },
      { col: '#EFF6FF', label: 'Small (10–30%)' },
      { col: '#F8FAFC', label: 'Tiny (<10%)', stroke: '#CBD5E1' },
    ] : [
      { col: COLORS.ridge,  label: `Ridge${lf ? ` ${lf.ridge_ft}ft` : ''}`,  line: true },
      { col: COLORS.hip,    label: `Hip${lf ? ` ${lf.hip_ft}ft` : ''}`,      line: true },
      { col: COLORS.valley, label: `Valley${lf ? ` ${lf.valley_ft}ft` : ''}`, line: true, dashed: true },
      { col: COLORS.eave,   label: `Eave${lf ? ` ${lf.eave_ft}ft` : ''}`,    line: true },
      { col: COLORS.rake,   label: `Rake${lf ? ` ${lf.rake_ft}ft` : ''}`,    line: true },
    ]

  const startX = 12, startY = H - 16 - items.length * 14
  const parts: string[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const y = startY + i * 14
    const isLine = 'line' in item && item.line
    if (isLine) {
      const da = 'dashed' in item && item.dashed ? ' stroke-dasharray="4,2"' : ''
      parts.push(`<line x1="${startX}" y1="${y + 4}" x2="${startX + 16}" y2="${y + 4}" stroke="${item.col}" stroke-width="2"${da}/>`)
    } else {
      const stroke = 'stroke' in item && item.stroke ? item.stroke : item.col
      parts.push(`<rect x="${startX}" y="${y}" width="12" height="10" fill="${item.col}" stroke="${stroke}" stroke-width="1" rx="2"/>`)
    }
    parts.push(`<text x="${startX + 20}" y="${y + 8}" font-family="Helvetica" font-size="8" fill="${COLORS.label}">${item.label}</text>`)
  }
  return `<g>${parts.join('')}</g>`
}

function matchFacetsToSegments(
  facets: Array<{ id: number; svgCentroid: { x: number; y: number } }>,
  segments: DiagramSegment[],
): Map<number, DiagramSegment> {
  const result = new Map<number, DiagramSegment>()
  if (segments.length === 0) return result

  // Normalise segment centroids to 0-1 within their bounding box
  const lats = segments.map(s => s.centerLat)
  const lngs = segments.map(s => s.centerLng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const latSpan = maxLat - minLat || 0.0001
  const lngSpan = maxLng - minLng || 0.0001

  const normSegs = segments.map(s => ({
    s,
    nx: (s.centerLng - minLng) / lngSpan,
    ny: 1 - (s.centerLat - minLat) / latSpan, // y-flip: north = up
  }))

  for (const facet of facets) {
    const { x, y } = facet.svgCentroid
    // Convert svgCentroid back to 0-1 normalised
    const nx = (x - MARGIN) / (W - 2 * MARGIN)
    const ny = (y - MARGIN) / (H - 2 * MARGIN)

    let best: DiagramSegment | null = null
    let bestDist = Infinity
    for (const { s, nx: sx, ny: sy } of normSegs) {
      const d = Math.sqrt((nx - sx) ** 2 + (ny - sy) ** 2)
      if (d < bestDist) { bestDist = d; best = s }
    }
    if (best) result.set(facet.id, best)
  }
  return result
}

function getFacetLabel(
  facet: GeminiFacet,
  seg: DiagramSegment | undefined,
  mode: DiagramMode,
  totalFacets: number,
): { primary: string; secondary: string } | null {
  if (!seg) return null
  switch (mode) {
    case 'pitch':
      return { primary: degreesToPitch(seg.pitchDegrees), secondary: '' }
    case 'area':
      return { primary: `${Math.round(seg.groundAreaMeters2 * 10.7639)} ft²`, secondary: '' }
    case 'notes': {
      const label = facet.id < 26 ? String.fromCharCode(65 + facet.id) : `${facet.id + 1}`
      return { primary: label, secondary: '' }
    }
    default:
      return null
  }
}

function emptyDiagram(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#F8FAFC" rx="4"/>
    <text x="${W/2}" y="${H/2}" text-anchor="middle" font-family="Helvetica" font-size="12" fill="#94A3B8">${msg}</text>
  </svg>`
}
