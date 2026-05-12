/**
 * lib/roofing/premiumReportPdf.ts
 *
 * 12-page EagleView+Roofr-parity Premium Report PDF builder.
 *
 * CRITICAL RULES (HANDOVER_v87 §0):
 *  - MUST remain .ts — NEVER rename to .tsx
 *  - NEVER add JSX syntax — SWC JSX transform breaks react-pdf renderToBuffer
 *  - Use React.createElement aliased as h throughout
 *  - NO Claude/Anthropic API calls
 */

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Svg,
  Line,
  Polygon,
  Rect,
  Circle,
  G,
  renderToBuffer,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'

// Alias createElement — NEVER use JSX
const h = React.createElement

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoofSegment {
  pitchDegrees?: number
  azimuthDegrees?: number
  groundAreaMeters2: number
  center: {
    latitude: number
    longitude: number
  }
  /** Slope-corrected area in m² (may be absent) */
  planeAreaMeters2?: number
  /** 0 = unclassified, 1 = main, 2 = secondary */
  segmentType?: number
}

export interface PitchBreakdownRow {
  pitch: string
  sqft: number
  sq: number
  pct: number
}

export interface LinearFootageData {
  ridge_ft: number
  hip_ft: number
  valley_ft: number
  rake_ft: number
  eave_ft: number
  total_linear_ft: number
  accuracy_note: string
  facet_count: number
}

export interface PremiumReportData {
  // Property
  address: string
  lat: number
  lng: number
  imageryDate: string | null
  generatedAt: string

  // Measurements
  totalSqft: number
  totalSquares: number
  dominantPitch: string
  facetCount: number
  wasteFactor: number
  pitchBreakdown: PitchBreakdownRow[]
  linearFootage: LinearFootageData

  // Pro
  proName: string
  proEmail: string
  proCompany: string | null
  proPhone: string | null
  proVerified: boolean

  // Images (base64 data URIs or empty string)
  topViewBase64: string
  northViewBase64: string
  southViewBase64: string
  eastViewBase64: string
  westViewBase64: string

  // SVG source
  segments: RoofSegment[]
  bbox: { swLat: number; swLng: number; neLat: number; neLng: number } | null
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const EDGE_COLORS = {
  ridge:  '#1E3A8A',
  hip:    '#D97706',
  valley: '#DC2626',
  rake:   '#16A34A',
  eave:   '#6B7280',
} as const

type EdgeType = keyof typeof EDGE_COLORS

const BRAND_COLORS = {
  primary:   '#1B2A4A',   // dark navy — used sparingly for header bars only
  accent:    '#2563EB',   // blue for key numbers
  teal:      '#0F766E',
  lightBlue: '#EFF6FF',
  borderGray:'#E2E8F0',
  textGray:  '#64748B',
  textDark:  '#1E293B',
  white:     '#FFFFFF',
  amber:     '#D97706',
  red:       '#DC2626',
  green:     '#16A34A',
  facetFill: '#EBF5FF',
  pitchBlue: '#BFDBFE',
  pitchGray: '#F1F5F9',
  pageBack:  '#FFFFFF',   // clean white pages like Roofr
  sectionBg: '#F8FAFC',  // very light gray for section headers
}

const WASTE_FACTORS = [0, 10, 12, 15, 17, 20] // % columns

const SQ_PER_BUNDLE = 33.3 // sqft per bundle (3 bundles = 1 square)

const SHINGLES = [
  { name: 'IKO - Cambridge',           sqPerBundle: 33.3 },
  { name: 'GAF - Timberline HDZ',      sqPerBundle: 33.3 },
  { name: 'Owens Corning - Duration',  sqPerBundle: 33.3 },
  { name: 'CertainTeed - Landmark',    sqPerBundle: 33.3 },
  { name: 'Atlas - Pristine',          sqPerBundle: 33.3 },
]

const STARTER = [
  { name: 'GAF - Pro-Start',              lfPerBundle: 120 },
  { name: 'IKO - Leading Edge Plus',      lfPerBundle: 105 },
  { name: 'CertainTeed - SwiftStart',     lfPerBundle: 120 },
  { name: 'Owens Corning - Starter Strip',lfPerBundle: 105 },
]

const ICE_WATER = [
  { name: 'GAF - WeatherWatch',          lfPerRoll: 65 },
  { name: 'IKO - StormShield',           lfPerRoll: 65 },
  { name: 'CertainTeed - WinterGuard',   lfPerRoll: 65 },
  { name: 'Owens Corning - WeatherLock', lfPerRoll: 75 },
]

const SYNTHETIC = [
  { name: 'GAF - Deck-Armor',            sqftPerRoll: 1000 },
  { name: 'IKO - Stormtite',             sqftPerRoll: 1000 },
  { name: 'CertainTeed - RoofRunner',    sqftPerRoll: 1000 },
  { name: 'Owens Corning - RhinoRoof',   sqftPerRoll: 1000 },
]

const CAPPING = [
  { name: 'GAF - Seal-A-Ridge',         lfPerBundle: 25 },
  { name: 'IKO - Hip and Ridge',        lfPerBundle: 33 },
  { name: 'CertainTeed - Shadow Ridge', lfPerBundle: 33 },
  { name: 'Owens Corning - DecoRidge',  lfPerBundle: 20 },
]

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    fontFamily: 'Helvetica',
    paddingBottom: 36,
  },
  // Header bar (every page except cover)
  headerBar: {
    backgroundColor: BRAND_COLORS.primary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  headerAddress: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },
  headerRight: {
    color: '#94A3B8',
    fontSize: 8,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BRAND_COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    color: '#64748B',
    fontSize: 7,
  },
  footerPageNum: {
    color: '#94A3B8',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  // Section header on diagram/data pages
  sectionHeader: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_COLORS.borderGray,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: BRAND_COLORS.textDark,
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 8,
    color: BRAND_COLORS.textGray,
    marginTop: 2,
  },
  // Body container
  body: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  // Table
  table: {
    width: '100%',
    borderWidth: 0.5,
    borderColor: BRAND_COLORS.borderGray,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: BRAND_COLORS.primary,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: BRAND_COLORS.borderGray,
  },
  tableRowAlt: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderTopWidth: 0.5,
    borderTopColor: BRAND_COLORS.borderGray,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  tableCell: {
    fontSize: 7.5,
    color: BRAND_COLORS.textDark,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  tableCellMuted: {
    fontSize: 7.5,
    color: BRAND_COLORS.textGray,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
})

// ─── Utility helpers ───────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  if (!isFinite(n)) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function degreesToPitch(deg: number | undefined): string {
  if (deg === undefined || !isFinite(deg)) return '?/12'
  const rise = Math.round(Math.tan((deg * Math.PI) / 180) * 12)
  return `${Math.min(Math.max(rise, 1), 12)}/12`
}

function sqftToSquares(sqft: number): number {
  return sqft / 100
}

function applyWaste(sqft: number, wastePct: number): number {
  return sqft * (1 + wastePct / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ─── Reusable page components ──────────────────────────────────────────────────

function PageHeader(address: string, pageLabel: string) {
  return h(View, { style: styles.headerBar },
    h(Text, { style: styles.headerAddress }, address),
    h(Text, { style: styles.headerRight }, `ProGuild Premium Report  ·  ${pageLabel}`),
  )
}

function PageFooter(pageNum: number, totalPages: number, generatedAt: string) {
  return h(View, { style: styles.footer },
    h(Text, { style: styles.footerText },
      `© ProGuild.ai · Powered by Google Solar API · ${formatDate(generatedAt)} · For bid preparation use only`
    ),
    h(Text, { style: styles.footerPageNum }, `PAGE ${pageNum} of ${totalPages}`),
  )
}

function SectionHeader(title: string, subtitle?: string) {
  return h(View, { style: styles.sectionHeader },
    h(Text, { style: styles.sectionTitle }, title),
    subtitle ? h(Text, { style: styles.sectionSubtitle }, subtitle) : null,
  )
}

function ImagePlaceholder(label: string) {
  return h(View, {
    style: {
      backgroundColor: '#F1F5F9',
      borderWidth: 0.5,
      borderColor: BRAND_COLORS.borderGray,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
  },
    h(Text, { style: { fontSize: 9, color: BRAND_COLORS.textGray } }, `${label} — Street View not available at this location`),
      h(Text, { style: { fontSize: 8, color: '#94A3B8', marginTop: 4 } }, 'Google Street View has no outdoor imagery for these coordinates.'),
  )
}

// ─── SVG Projection Engine ─────────────────────────────────────────────────────

interface ProjectedSegment {
  cx: number        // pixel center x
  cy: number        // pixel center y
  halfW: number     // half-width in pixels (along downslope axis)
  halfH: number     // half-height in pixels (perpendicular axis)
  azimuthRad: number
  pitchDeg: number
  areaM2: number
  areaSqft: number
  label: string     // A, B, C... (area-sorted)
  pitchLabel: string
  segmentType: number
}

interface ProjectedEdge {
  x1: number; y1: number
  x2: number; y2: number
  type: EdgeType
  lengthFt: number
}

const M_TO_FT = 3.28084
const SVG_W = 480
const SVG_H = 360

function projectSegments(
  segments: RoofSegment[],
): { projected: ProjectedSegment[]; edges: ProjectedEdge[] } {
  if (segments.length === 0) return { projected: [], edges: [] }

  // 1. Bounding box of all centers
  const lats = segments.map((s) => s.center.latitude)
  const lngs = segments.map((s) => s.center.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const latSpan = maxLat - minLat || 0.0001
  const lngSpan = maxLng - minLng || 0.0001

  // Aspect-correct for latitude (1 lng degree is cos(lat) × 1 lat degree)
  const midLat = (minLat + maxLat) / 2
  const cosLat = Math.cos((midLat * Math.PI) / 180)
  const lngAspect = lngSpan * cosLat

  // Fit into SVG canvas with 40px margin
  const margin = 44
  const usableW = SVG_W - 2 * margin
  const usableH = SVG_H - 2 * margin

  const scaleX = usableW / lngSpan
  const scaleY = usableH / latSpan
  const scale = Math.min(scaleX, scaleY * cosLat, scaleX / (lngAspect / latSpan))

  function toPixel(lat: number, lng: number): [number, number] {
    const px = margin + (lng - minLng) * scale / cosLat
    const py = margin + (maxLat - lat) * scale  // y-flip: north = up
    return [
      Math.max(margin, Math.min(SVG_W - margin, px)),
      Math.max(margin, Math.min(SVG_H - margin, py)),
    ]
  }

  // 2. Sort segments by area (ascending) → A–Z labels
  const sorted = [...segments].sort((a, b) => a.groundAreaMeters2 - b.groundAreaMeters2)

  // 3. Project each segment
  const projected: ProjectedSegment[] = sorted.map((seg, i) => {
    const [cx, cy] = toPixel(seg.center.latitude, seg.center.longitude)
    const areaM2 = seg.groundAreaMeters2
    const areaSqft = areaM2 * 10.7639

    // Approximate as square rotated to azimuth
    const side = Math.sqrt(areaM2)
    const halfPx = Math.max(8, Math.min((side * scale) / 2, 60))

    const az = seg.azimuthDegrees ?? 180
    const azRad = ((az - 90) * Math.PI) / 180 // 0° az = South in Google Solar → adjust for SVG north-up

    return {
      cx, cy,
      halfW: halfPx * 0.65,
      halfH: halfPx,
      azimuthRad: azRad,
      pitchDeg: seg.pitchDegrees ?? 0,
      areaM2,
      areaSqft,
      label: i < 26 ? String.fromCharCode(65 + i) : `${i + 1}`,
      pitchLabel: degreesToPitch(seg.pitchDegrees),
      segmentType: seg.segmentType ?? 0,
    }
  })

  // 4. Derive edges from adjacent segment pairs
  const edges: ProjectedEdge[] = []
  const n = projected.length

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = projected[i]
      const b = projected[j]

      const dist = Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2)
      const threshold = (a.halfH + b.halfH) * 1.8

      if (dist > threshold) continue // not adjacent

      // Azimuth difference between segment orientations
      const azA = (segments[i].azimuthDegrees ?? 180)
      const azB = (segments[j].azimuthDegrees ?? 180)
      let azDiff = Math.abs(azA - azB)
      if (azDiff > 180) azDiff = 360 - azDiff

      const typeA = segments[i].segmentType ?? 0
      const typeB = segments[j].segmentType ?? 0
      const bothMain = typeA === 1 && typeB === 1
      const mainSec = (typeA === 1 && typeB === 2) || (typeA === 2 && typeB === 1)

      let edgeType: EdgeType
      const lengthM = dist / scale
      const lengthFt = lengthM * M_TO_FT

      if (azDiff > 150 && bothMain) {
        edgeType = 'ridge'
      } else if (azDiff >= 30 && azDiff <= 120 && mainSec) {
        edgeType = 'valley'
      } else if (azDiff >= 45 && azDiff <= 150) {
        edgeType = 'hip'
      } else if (azDiff < 30) {
        edgeType = 'eave'
      } else {
        edgeType = 'rake'
      }

      // Edge midpoint between the two segment centers
      const mx = (a.cx + b.cx) / 2
      const my = (a.cy + b.cy) / 2

      // Draw edge as short segment perpendicular to segment-pair axis
      const angle = Math.atan2(b.cy - a.cy, b.cx - a.cx) + Math.PI / 2
      const len = Math.min(a.halfW, b.halfW) * 1.2
      edges.push({
        x1: mx - Math.cos(angle) * len,
        y1: my - Math.sin(angle) * len,
        x2: mx + Math.cos(angle) * len,
        y2: my + Math.sin(angle) * len,
        type: edgeType,
        lengthFt: Math.round(lengthFt),
      })
    }
  }

  return { projected, edges }
}

// Build a rotated quadrilateral polygon points string for a segment
function segmentPoints(seg: ProjectedSegment): string {
  const { cx, cy, halfW, halfH, azimuthRad } = seg
  const cos = Math.cos(azimuthRad)
  const sin = Math.sin(azimuthRad)

  const corners = [
    [ halfW * cos - halfH * sin,  halfW * sin + halfH * cos],
    [-halfW * cos - halfH * sin, -halfW * sin + halfH * cos],
    [-halfW * cos + halfH * sin, -halfW * sin - halfH * cos],
    [ halfW * cos + halfH * sin,  halfW * sin - halfH * cos],
  ]
  return corners.map(([dx, dy]) => `${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)}`).join(' ')
}

// ─── SVG Diagram renderer ──────────────────────────────────────────────────────

type DiagramMode = 'length' | 'pitch' | 'area' | 'notes'

function buildDiagramSvg(
  projected: ProjectedSegment[],
  edges: ProjectedEdge[],
  mode: DiagramMode,
): React.ReactElement {
  const noData = projected.length === 0

  // Placeholder when no segment data
  if (noData) {
    return h(Svg, { width: SVG_W, height: SVG_H, viewBox: `0 0 ${SVG_W} ${SVG_H}` },
      h(Rect, { x: 0, y: 0, width: SVG_W, height: SVG_H, fill: '#F8FAFC', rx: 4 }),
      h(Text as any, {
        x: SVG_W / 2, y: SVG_H / 2,
        textAnchor: 'middle', fontSize: 11, fill: BRAND_COLORS.textGray,
        fontFamily: 'Helvetica',
      }, 'Segment data unavailable'),
      h(Text as any, {
        x: SVG_W / 2, y: SVG_H / 2 + 16,
        textAnchor: 'middle', fontSize: 9, fill: '#94A3B8',
        fontFamily: 'Helvetica',
      }, 'solar_raw roofSegmentStats not populated'),
    )
  }

  // Pitch fill colour
  function pitchFill(pitchDeg: number): string {
    const p = Math.tan((pitchDeg * Math.PI) / 180) * 12
    if (p <= 2) return BRAND_COLORS.pitchGray
    if (p <= 4) return '#DBEAFE'
    if (p <= 6) return BRAND_COLORS.pitchBlue
    if (p <= 8) return '#93C5FD'
    return '#60A5FA'
  }

  const segPolygons = projected.map((seg) => {
    const fill = mode === 'pitch' ? pitchFill(seg.pitchDeg) : BRAND_COLORS.facetFill
    const stroke = '#3B82F6'
    return h(Polygon, {
      key: `poly-${seg.label}`,
      points: segmentPoints(seg),
      fill,
      fillOpacity: 0.55,
      stroke,
      strokeWidth: 0.6,
    })
  })

  // Labels per mode
  const segLabels = projected.map((seg) => {
    let label = ''
    let color = BRAND_COLORS.textDark
    let fontSize = 8

    if (mode === 'length') return null // lengths on edges
    if (mode === 'pitch') {
      label = seg.pitchLabel
      color = seg.pitchDeg <= 15 ? '#475569' : '#1E40AF'
      fontSize = 8
    }
    if (mode === 'area') {
      label = `${fmt(seg.areaSqft)} ft²`
      fontSize = 7
    }
    if (mode === 'notes') {
      label = seg.label
      color = BRAND_COLORS.primary
      fontSize = 10
    }

    if (!label) return null

    return h(G, { key: `lbl-${seg.label}` },
      h(Rect as any, {
        x: seg.cx - 18, y: seg.cy - 6,
        width: 36, height: 12, rx: 2,
        fill: '#FFFFFF', fillOpacity: 0.88,
      }),
      h(Text as any, {
        x: seg.cx, y: seg.cy + 2,
        textAnchor: 'middle', fontSize,
        fill: color, fontFamily: 'Helvetica-Bold',
      }, label),
    )
  }).filter(Boolean)

  // Edge lines + length labels (length mode)
  const edgeElements = edges.map((edge, i) => {
    const col = EDGE_COLORS[edge.type]
    const lineEl = h(Line, {
      key: `edge-${i}`,
      x1: edge.x1, y1: edge.y1,
      x2: edge.x2, y2: edge.y2,
      stroke: col,
      strokeWidth: mode === 'length' ? 2 : 1.2,
    })

    if (mode !== 'length' || edge.lengthFt < 5) return lineEl

    const mx = (edge.x1 + edge.x2) / 2
    const my = (edge.y1 + edge.y2) / 2
    const labelEl = h(G, { key: `edge-lbl-${i}` },
      h(Rect as any, {
        x: mx - 10, y: my - 5.5, width: 20, height: 11, rx: 1.5,
        fill: '#FFFFFF', fillOpacity: 0.9,
      }),
      h(Text as any, {
        x: mx, y: my + 2,
        textAnchor: 'middle', fontSize: 7,
        fill: col, fontFamily: 'Helvetica-Bold',
      }, `${edge.lengthFt}ft`),
    )
    return h(G, { key: `edge-group-${i}` }, lineEl, labelEl)
  })

  // Compass rose — bottom-right
  const cx = SVG_W - 34
  const cy = SVG_H - 34
  const compassRose = h(G, { key: 'compass' },
    h(Circle, { cx, cy, r: 16, fill: '#FFFFFF', stroke: '#CBD5E1', strokeWidth: 0.5 }),
    h(Polygon, { points: `${cx},${cy - 14} ${cx - 4},${cy - 6} ${cx + 4},${cy - 6}`, fill: BRAND_COLORS.accent }),
    h(Polygon, { points: `${cx},${cy + 14} ${cx - 4},${cy + 6} ${cx + 4},${cy + 6}`, fill: '#CBD5E1' }),
    h(Text as any, { x: cx, y: cy - 4, textAnchor: 'middle', fontSize: 6, fill: BRAND_COLORS.accent, fontFamily: 'Helvetica-Bold' }, 'N'),
    h(Text as any, { x: cx, y: cy + 13, textAnchor: 'middle', fontSize: 5.5, fill: '#94A3B8', fontFamily: 'Helvetica' }, 'S'),
    h(Text as any, { x: cx - 10, y: cy + 2, textAnchor: 'middle', fontSize: 5.5, fill: '#94A3B8', fontFamily: 'Helvetica' }, 'W'),
    h(Text as any, { x: cx + 10, y: cy + 2, textAnchor: 'middle', fontSize: 5.5, fill: '#94A3B8', fontFamily: 'Helvetica' }, 'E'),
  )

  // Legend (length mode only)
  const legendEntries: Array<{ label: string; color: string }> = mode === 'length'
    ? Object.entries(EDGE_COLORS).map(([k, v]) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), color: v }))
    : []

  const legend = legendEntries.length > 0
    ? h(G, { key: 'legend' },
        h(Rect as any, { x: 4, y: 4, width: 58, height: legendEntries.length * 12 + 6, rx: 3, fill: '#F8FAFC', stroke: '#E2E8F0', strokeWidth: 0.5 }),
        ...legendEntries.map((entry, i) =>
          h(G, { key: `leg-${i}` },
            h(Line, { x1: 8, y1: 10 + i * 12, x2: 24, y2: 10 + i * 12, stroke: entry.color, strokeWidth: 2 }),
            h(Text as any, { x: 28, y: 13 + i * 12, fontSize: 7, fill: BRAND_COLORS.textDark, fontFamily: 'Helvetica' }, entry.label),
          )
        ),
      )
    : null

  // Pitch legend (pitch mode)
  const pitchLegend = mode === 'pitch'
    ? h(G, { key: 'pitch-legend' },
        h(Rect as any, { x: 4, y: 4, width: 72, height: 54, rx: 3, fill: '#F8FAFC', stroke: '#E2E8F0', strokeWidth: 0.5 }),
        ...[
          { label: '≤2/12 flat', fill: BRAND_COLORS.pitchGray },
          { label: '3–4/12 low', fill: '#DBEAFE' },
          { label: '5–6/12 std', fill: BRAND_COLORS.pitchBlue },
          { label: '7–8/12 steep', fill: '#93C5FD' },
          { label: '9+/12 very steep', fill: '#60A5FA' },
        ].map((entry, i) =>
          h(G, { key: `pl-${i}` },
            h(Rect as any, { x: 8, y: 8 + i * 10, width: 14, height: 8, rx: 1, fill: entry.fill, stroke: '#93C5FD', strokeWidth: 0.3 }),
            h(Text as any, { x: 26, y: 14 + i * 10, fontSize: 6.5, fill: BRAND_COLORS.textDark, fontFamily: 'Helvetica' }, entry.label),
          )
        ),
      )
    : null

  // Pitch slope arrows (pitch mode)
  const slopeArrows = mode === 'pitch'
    ? projected.map((seg) => {
        if (seg.pitchDeg < 5) return null
        const arrowLen = 10
        const az = seg.azimuthRad
        const x2 = seg.cx + Math.cos(az) * arrowLen
        const y2 = seg.cy + Math.sin(az) * arrowLen
        return h(G, { key: `arrow-${seg.label}` },
          h(Line, { x1: seg.cx, y1: seg.cy, x2, y2, stroke: '#1E40AF', strokeWidth: 0.8 }),
          h(Polygon, {
            points: `${x2},${y2} ${x2 - 3 * Math.cos(az - 0.4)},${y2 - 3 * Math.sin(az - 0.4)} ${x2 - 3 * Math.cos(az + 0.4)},${y2 - 3 * Math.sin(az + 0.4)}`,
            fill: '#1E40AF',
          }),
        )
      }).filter(Boolean)
    : []

  return h(Svg, { width: SVG_W, height: SVG_H, viewBox: `0 0 ${SVG_W} ${SVG_H}` },
    h(Rect, { x: 0, y: 0, width: SVG_W, height: SVG_H, fill: '#FFFFFF' }),
    ...segPolygons,
    ...edgeElements,
    ...(slopeArrows as React.ReactElement[]),
    ...segLabels as React.ReactElement[],
    compassRose,
    legend,
    pitchLegend,
  )
}

// ─── Material estimate calculator ──────────────────────────────────────────────

interface MaterialRow {
  product: string
  unit: string
  quantities: string[] // one per WASTE_FACTORS entry
  isGroupHeader: boolean
  groupBase?: string
}

function computeMaterialRows(data: PremiumReportData): MaterialRow[] {
  const { totalSqft, linearFootage: lf } = data
  const rows: MaterialRow[] = []

  // Wall/step flashing approximations
  const wallFlashFt = Math.round((lf.hip_ft || 0) * 0.08)
  const stepFlashFt = Math.round((lf.valley_ft || 0) * 1.7)

  // Ice & water base linear footage
  const iceWaterBaseFt = lf.eave_ft + lf.valley_ft + stepFlashFt + wallFlashFt

  // Starter base
  const starterBaseFt = lf.eave_ft + lf.rake_ft

  // Capping base
  const cappingBaseFt = lf.ridge_ft + lf.hip_ft

  // Drip edge and valley sheets (no waste applied — structural count)
  const dripEdgePcs = Math.ceil((lf.eave_ft + lf.rake_ft) / 10)
  const valleySheets = Math.ceil(lf.valley_ft / 8)

  // ── Shingles ──
  rows.push({
    product: 'Shingles (total sqft)',
    unit: '',
    quantities: WASTE_FACTORS.map((w) => `${fmt(applyWaste(totalSqft, w))} ft²`),
    isGroupHeader: true,
    groupBase: `Base: ${fmt(totalSqft)} sqft`,
  })
  SHINGLES.forEach((brand) => {
    rows.push({
      product: `  ${brand.name}`,
      unit: 'bundle',
      quantities: WASTE_FACTORS.map((w) => {
        const adjSqft = applyWaste(totalSqft, w)
        return `${Math.ceil(adjSqft / brand.sqPerBundle)}`
      }),
      isGroupHeader: false,
    })
  })

  // ── Starter ──
  rows.push({
    product: `Starter (eaves + rakes)`,
    unit: '',
    quantities: WASTE_FACTORS.map((w) => `${fmt(applyWaste(starterBaseFt, w))} ft`),
    isGroupHeader: true,
    groupBase: `Base: ${fmt(starterBaseFt)} lf`,
  })
  STARTER.forEach((brand) => {
    rows.push({
      product: `  ${brand.name}`,
      unit: 'bundle',
      quantities: WASTE_FACTORS.map((w) => {
        const adjFt = applyWaste(starterBaseFt, w)
        return `${Math.ceil(adjFt / brand.lfPerBundle)}`
      }),
      isGroupHeader: false,
    })
  })

  // ── Ice & Water ──
  rows.push({
    product: 'Ice & water (eaves + valleys + flashing)',
    unit: '',
    quantities: WASTE_FACTORS.map((w) => `${fmt(applyWaste(iceWaterBaseFt, w))} ft`),
    isGroupHeader: true,
    groupBase: `Base: ${fmt(iceWaterBaseFt)} lf`,
  })
  ICE_WATER.forEach((brand) => {
    rows.push({
      product: `  ${brand.name}`,
      unit: 'roll',
      quantities: WASTE_FACTORS.map((w) => {
        const adjFt = applyWaste(iceWaterBaseFt, w)
        return `${Math.ceil(adjFt / brand.lfPerRoll)}`
      }),
      isGroupHeader: false,
    })
  })

  // ── Synthetic underlayment ──
  rows.push({
    product: 'Synthetic underlayment (total sqft)',
    unit: '',
    quantities: WASTE_FACTORS.map((w) => `${fmt(applyWaste(totalSqft, w))} ft²`),
    isGroupHeader: true,
    groupBase: `Base: ${fmt(totalSqft)} sqft`,
  })
  SYNTHETIC.forEach((brand) => {
    rows.push({
      product: `  ${brand.name}`,
      unit: 'roll',
      quantities: WASTE_FACTORS.map((w) => {
        const adjSqft = applyWaste(totalSqft, w)
        return `${Math.ceil(adjSqft / brand.sqftPerRoll)}`
      }),
      isGroupHeader: false,
    })
  })

  // ── Capping ──
  rows.push({
    product: 'Ridge & hip capping',
    unit: '',
    quantities: WASTE_FACTORS.map((w) => `${fmt(applyWaste(cappingBaseFt, w))} ft`),
    isGroupHeader: true,
    groupBase: `Base: ${fmt(cappingBaseFt)} lf`,
  })
  CAPPING.forEach((brand) => {
    rows.push({
      product: `  ${brand.name}`,
      unit: 'bundle',
      quantities: WASTE_FACTORS.map((w) => {
        const adjFt = applyWaste(cappingBaseFt, w)
        return `${Math.ceil(adjFt / brand.lfPerBundle)}`
      }),
      isGroupHeader: false,
    })
  })

  // ── Other (fixed quantities) ──
  rows.push({
    product: 'Other',
    unit: '',
    quantities: WASTE_FACTORS.map(() => ''),
    isGroupHeader: true,
  })
  rows.push({
    product: '  8ft valley sheets (no laps)',
    unit: 'sheet',
    quantities: WASTE_FACTORS.map(() => `${valleySheets}`),
    isGroupHeader: false,
  })
  rows.push({
    product: '  10ft drip edge (eaves + rakes)',
    unit: 'piece',
    quantities: WASTE_FACTORS.map(() => `${dripEdgePcs}`),
    isGroupHeader: false,
  })

  return rows
}

// ─── Complexity badge ──────────────────────────────────────────────────────────

function complexityBadge(segments: number): { label: string; color: string; bg: string } {
  if (segments <= 10) {
    return { label: 'Simple roof (≤10 segments) — standard accuracy', color: '#166534', bg: '#DCFCE7' }
  }
  if (segments <= 15) {
    return { label: `Complex roof (${segments} segments) — verify linear footage on-site before ordering`, color: '#92400E', bg: '#FEF3C7' }
  }
  return { label: `High complexity (${segments} segments) — field measurement recommended`, color: '#991B1B', bg: '#FEE2E2' }
}

// ─── Page builders ─────────────────────────────────────────────────────────────

// Page 1 — Cover
function buildCoverPage(data: PremiumReportData): React.ReactElement {
  const totalLf = data.linearFootage.total_linear_ft
  const ridge = data.linearFootage.ridge_ft
  const hip = data.linearFootage.hip_ft
  const valley = data.linearFootage.valley_ft
  const rake = data.linearFootage.rake_ft
  const eave = data.linearFootage.eave_ft

  function MetricBox(label: string, value: string, sub: string) {
    return h(View, {
      style: {
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        padding: 10,
        alignItems: 'center',
        flex: 1,
        marginHorizontal: 3,
        borderWidth: 0.5,
        borderColor: '#E2E8F0',
      },
    },
      h(Text, { style: { color: BRAND_COLORS.accent, fontSize: 18, fontFamily: 'Helvetica-Bold' } }, value),
      h(Text, { style: { color: BRAND_COLORS.textDark, fontSize: 7, marginTop: 2, fontFamily: 'Helvetica-Bold' } }, label),
      h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 6.5, marginTop: 1 } }, sub),
    )
  }

  function LFRow(label: string, value: number, note: string) {
    return h(View, { style: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' } },
      h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 8 } }, label),
      h(View, { style: { flexDirection: 'row', alignItems: 'baseline', gap: 4 } },
        h(Text, { style: { color: BRAND_COLORS.textDark, fontSize: 9, fontFamily: 'Helvetica-Bold' } }, value > 0 ? `${fmt(value)} ft` : '—'),
        h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 7 } }, note),
      ),
    )
  }

  return h(Page, { size: 'LETTER', style: { ...styles.page, backgroundColor: '#FFFFFF' } },
    // Top brand bar — clean navy strip like Roofr
    h(View, { style: { backgroundColor: BRAND_COLORS.primary, paddingHorizontal: 28, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
      h(View, {},
        h(Text, { style: { color: '#FFFFFF', fontSize: 18, fontFamily: 'Helvetica-Bold' } }, 'ProGuild'),
        h(Text, { style: { color: '#93C5FD', fontSize: 7, letterSpacing: 1.5, marginTop: 1 } }, 'PREMIUM REPORT'),
      ),
      h(View, { style: { alignItems: 'flex-end' } },
        h(Text, { style: { color: '#FFFFFF', fontSize: 8.5, fontFamily: 'Helvetica-Bold' } }, 'PREMIUM — Detailed Measurements + Material Quantities'),
        h(Text, { style: { color: '#94A3B8', fontSize: 7, marginTop: 2 } }, 'Powered by ProGuild · Google Solar API'),
      ),
    ),

    // Address bar — lighter blue-gray like Roofr
    h(View, { style: { backgroundColor: '#1E3A5F', paddingHorizontal: 28, paddingVertical: 8 } },
      h(Text, { style: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Helvetica-Bold' } }, data.address),
    ),

    // Satellite image
    h(View, { style: { marginHorizontal: 0, marginTop: 0 } },
      data.topViewBase64
        ? h(Image, { src: data.topViewBase64, style: { width: '100%', height: 190, objectFit: 'cover' } })
        : h(View, { style: { height: 190, backgroundColor: '#1B2A4A', alignItems: 'center', justifyContent: 'center' } },
            h(Text, { style: { color: '#475569', fontSize: 9 } }, 'Satellite image unavailable'),
          ),
    ),

    // Two-column: metrics + pro info + LF
    h(View, { style: { flexDirection: 'row', paddingHorizontal: 28, paddingTop: 14, gap: 16, backgroundColor: '#FFFFFF' } },

      // Left — measurements
      h(View, { style: { flex: 1 } },
        h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 7, letterSpacing: 1.5, marginBottom: 8, fontFamily: 'Helvetica-Bold' } }, 'MEASUREMENTS'),
        h(View, { style: { flexDirection: 'row', marginBottom: 8 } },
          MetricBox('ORDER QUANTITY', `${fmt(data.totalSquares, 1)} sq`, `${fmt(data.totalSqft)} sq ft total`),
          MetricBox('DOMINANT PITCH', data.dominantPitch, 'Predominant slope'),
          MetricBox('ROOF FACETS', `${data.facetCount}`, 'Complexity indicator'),
          MetricBox('WASTE FACTOR', `${data.wasteFactor}%`, 'Not incl. in sq'),
        ),

        // LF summary
        h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 7, letterSpacing: 1.5, marginBottom: 6, marginTop: 4, fontFamily: 'Helvetica-Bold' } }, 'LINEAR FOOTAGE SUMMARY'),
        h(View, { style: { backgroundColor: '#F8FAFC', borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: '#E2E8F0' } },
          LFRow('Ridge', ridge, 'Ridge cap'),
          LFRow('Hip', hip, 'Hip cap'),
          LFRow('Valley', valley, 'Flashing'),
          LFRow('Rake', rake, 'Drip edge'),
          LFRow('Eave', eave, 'Starter/drip'),
          h(View, { style: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5, marginTop: 2 } },
            h(Text, { style: { color: BRAND_COLORS.accent, fontSize: 8, fontFamily: 'Helvetica-Bold' } }, 'TOTAL LF'),
            h(Text, { style: { color: BRAND_COLORS.accent, fontSize: 9, fontFamily: 'Helvetica-Bold' } }, totalLf > 0 ? `${fmt(totalLf)} ft` : '—'),
          ),
          h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 6.5, marginTop: 6 } },
            data.linearFootage.accuracy_note,
          ),
        ),
      ),

      // Right — prepared for
      h(View, { style: { width: 150 } },
        h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 7, letterSpacing: 1.5, marginBottom: 8, fontFamily: 'Helvetica-Bold' } }, 'PREPARED FOR'),
        h(View, { style: { backgroundColor: '#F8FAFC', borderRadius: 6, padding: 12, borderWidth: 0.5, borderColor: '#E2E8F0' } },
          h(Text, { style: { color: BRAND_COLORS.textDark, fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 } }, data.proName),
          data.proCompany ? h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 8, marginBottom: 4 } }, data.proCompany) : null,
          h(Text, { style: { color: BRAND_COLORS.accent, fontSize: 7.5, marginBottom: 2 } }, data.proEmail),
          data.proPhone ? h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 7.5, marginBottom: 6 } }, data.proPhone) : null,
          data.proVerified
            ? h(View, { style: { backgroundColor: '#DCFCE7', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 6 } },
                h(Text, { style: { color: '#166534', fontSize: 7, fontFamily: 'Helvetica-Bold' } }, '✓ ProGuild Verified'),
              )
            : null,
          h(Text, { style: { color: BRAND_COLORS.textGray, fontSize: 6.5, marginTop: 4 } }, `Generated ${formatDate(data.generatedAt)}`),
        ),
      ),
    ),

    PageFooter(1, 12, data.generatedAt),
  )
}

// Page 2 — Full satellite top view
function buildSatellitePage(data: PremiumReportData): React.ReactElement {
  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, 'Satellite View'),
    SectionHeader('IMAGES', 'Aerial imagery — top view'),
    h(View, { style: { paddingHorizontal: 24, paddingTop: 12, flex: 1 } },
      h(Text, { style: { fontSize: 8, color: BRAND_COLORS.textGray, marginBottom: 8 } },
        'The following aerial images show different angles of this structure for your reference.',
      ),
      h(Text, { style: { fontSize: 9, color: BRAND_COLORS.textDark, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, 'Top View'),
      data.topViewBase64
        ? h(Image, { src: data.topViewBase64, style: { width: '100%', height: 460, objectFit: 'cover', borderRadius: 4, borderWidth: 0.5, borderColor: BRAND_COLORS.borderGray } })
        : ImagePlaceholder('Top view satellite'),
    ),
    PageFooter(2, 12, data.generatedAt),
  )
}

// Page 3 — N + S Street Views
function buildStreetViewNSPage(data: PremiumReportData): React.ReactElement {
  function CardinalImage(base64: string, label: string) {
    return h(View, { style: { marginBottom: 12 } },
      h(Text, { style: { fontSize: 9, color: BRAND_COLORS.textDark, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, label),
      base64
        ? h(Image, { src: base64, style: { width: '100%', height: 210, objectFit: 'cover', borderRadius: 4, borderWidth: 0.5, borderColor: BRAND_COLORS.borderGray } })
        : ImagePlaceholder(label),
    )
  }

  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, 'Street Views — North & South'),
    SectionHeader('IMAGES', 'Street-level oblique views · heading 0° and 180°'),
    h(View, { style: { paddingHorizontal: 24, paddingTop: 12 } },
      CardinalImage(data.northViewBase64, 'North Side'),
      CardinalImage(data.southViewBase64, 'South Side'),
    ),
    PageFooter(3, 12, data.generatedAt),
  )
}

// Page 4 — E + W Street Views
function buildStreetViewEWPage(data: PremiumReportData): React.ReactElement {
  function CardinalImage(base64: string, label: string) {
    return h(View, { style: { marginBottom: 12 } },
      h(Text, { style: { fontSize: 9, color: BRAND_COLORS.textDark, fontFamily: 'Helvetica-Bold', marginBottom: 6 } }, label),
      base64
        ? h(Image, { src: base64, style: { width: '100%', height: 210, objectFit: 'cover', borderRadius: 4, borderWidth: 0.5, borderColor: BRAND_COLORS.borderGray } })
        : ImagePlaceholder(label),
    )
  }

  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, 'Street Views — East & West'),
    SectionHeader('IMAGES', 'Street-level oblique views · heading 90° and 270°'),
    h(View, { style: { paddingHorizontal: 24, paddingTop: 12 } },
      CardinalImage(data.eastViewBase64, 'East Side'),
      CardinalImage(data.westViewBase64, 'West Side'),
    ),
    PageFooter(4, 12, data.generatedAt),
  )
}

// Pages 5–8 — SVG diagram pages
function buildDiagramPage(
  data: PremiumReportData,
  mode: DiagramMode,
  pageNum: number,
  projected: ProjectedSegment[],
  edges: ProjectedEdge[],
): React.ReactElement {
  const titles: Record<DiagramMode, string> = {
    length: 'LENGTH DIAGRAM',
    pitch:  'PITCH DIAGRAM',
    area:   'AREA DIAGRAM',
    notes:  'NOTES DIAGRAM',
  }
  const subtitles: Record<DiagramMode, string> = {
    length: 'Colour-coded edges with linear footage labels · ±20% estimated accuracy',
    pitch:  'Facets shaded by pitch · slope direction arrows · pitch in rise/12',
    area:   'Square footage at each segment centroid · computed from Google Solar API',
    notes:  'Facets labelled A–Z from smallest to largest for field reference',
  }

  const lf = data.linearFootage

  function LegendStat(label: string, ft: number, color: string) {
    return h(View, { style: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4 } },
      h(View, { style: { width: 14, height: 2.5, backgroundColor: color, marginRight: 4, borderRadius: 1 } }),
      h(Text, { style: { fontSize: 7.5, color: BRAND_COLORS.textDark } },
        `${label}: ${ft > 0 ? fmt(ft) + ' ft' : '—'}`
      ),
    )
  }

  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, titles[mode]),
    SectionHeader(titles[mode], subtitles[mode]),

    // Summary stats (length mode)
    mode === 'length'
      ? h(View, { style: { paddingHorizontal: 24, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap' } },
          LegendStat('Ridges', lf.ridge_ft, EDGE_COLORS.ridge),
          LegendStat('Hips', lf.hip_ft, EDGE_COLORS.hip),
          LegendStat('Valleys', lf.valley_ft, EDGE_COLORS.valley),
          LegendStat('Rakes', lf.rake_ft, EDGE_COLORS.rake),
          LegendStat('Eaves', lf.eave_ft, EDGE_COLORS.eave),
        )
      : null,

    // Pitch note
    mode === 'pitch'
      ? h(View, { style: { paddingHorizontal: 24, paddingTop: 8 } },
          h(Text, { style: { fontSize: 8, color: BRAND_COLORS.textGray } },
            `Pitch values shown in rise/12. Predominant pitch: ${data.dominantPitch}. ` +
            'Blue shading = 3/12 and steeper. Gray shading = flat/low slope.',
          ),
        )
      : null,

    // Notes descriptor
    mode === 'notes'
      ? h(View, { style: { paddingHorizontal: 24, paddingTop: 8 } },
          h(Text, { style: { fontSize: 8, color: BRAND_COLORS.textGray } },
            'Roof facets are labelled from smallest (A) to largest for easy on-site reference.',
          ),
        )
      : null,

    // SVG diagram
    h(View, { style: { paddingHorizontal: 24, paddingTop: 10, alignItems: 'center' } },
      buildDiagramSvg(projected, edges, mode),
    ),

    h(View, { style: { paddingHorizontal: 24, paddingTop: 8 } },
      h(Text, { style: { fontSize: 7, color: BRAND_COLORS.textGray, fontStyle: 'italic' } },
        'Segment geometry approximated from Google Solar API roofSegmentStats. ' +
        'Measurements rounded to nearest foot. Some edge lengths may be omitted for readability.',
      ),
    ),

    PageFooter(pageNum, 12, data.generatedAt),
  )
}

// Page 9 — Report Summary
function buildReportSummaryPage(data: PremiumReportData): React.ReactElement {
  const { pitchBreakdown, linearFootage: lf, totalSqft, wasteFactor, segments, facetCount } = data
  // Use actual segment count; fall back to facetCount from DB when solar_raw parse returned 0
  const effectiveSegCount = segments.length > 0 ? segments.length : facetCount
  const complexity = complexityBadge(effectiveSegCount)

  // Waste table columns
  const wasteCols = WASTE_FACTORS

  function WasteCell(sqft: number, suggested: boolean) {
    return h(View, { style: { flex: 1, alignItems: 'center', paddingVertical: 4, backgroundColor: suggested ? '#EFF6FF' : 'transparent' } },
      h(Text, { style: { fontSize: 7.5, color: suggested ? BRAND_COLORS.accent : BRAND_COLORS.textDark, fontFamily: suggested ? 'Helvetica-Bold' : 'Helvetica' } },
        `${fmt(applyWaste(sqft, 0))} ft²`,
      ),
      h(Text, { style: { fontSize: 7, color: suggested ? BRAND_COLORS.accent : BRAND_COLORS.textGray } },
        `${fmt(sqftToSquares(applyWaste(sqft, 0)), 1)} sq`,
      ),
    )
  }

  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, 'Report Summary'),
    SectionHeader('REPORT SUMMARY', 'All structures — areas per pitch, complexity, waste calculation'),

    h(View, { style: { ...styles.body } },

      // Areas per pitch table
      h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 6 } }, 'Areas per Pitch'),
      pitchBreakdown.length > 0
        ? h(View, { style: styles.table },
            h(View, { style: styles.tableHeaderRow },
              h(Text, { style: { ...styles.tableHeaderCell, flex: 1.5 } }, 'Pitch'),
              h(Text, { style: { ...styles.tableHeaderCell, flex: 2 } }, 'Area (sq ft)'),
              h(Text, { style: { ...styles.tableHeaderCell, flex: 1.5 } }, '% of Roof'),
              h(Text, { style: { ...styles.tableHeaderCell, flex: 1.5 } }, 'Squares'),
              h(Text, { style: { ...styles.tableHeaderCell, flex: 2 } }, 'Type'),
            ),
            ...pitchBreakdown.map((row, i) => {
              const pNum = parseInt(row.pitch.split('/')[0]) || 0
              const type = pNum <= 2 ? 'Low/Flat' : pNum <= 6 ? 'Standard slope' : 'Steep slope'
              return h(View, { key: `pb-${i}`, style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
                h(Text, { style: { ...styles.tableCell, flex: 1.5, fontFamily: 'Helvetica-Bold' } }, row.pitch),
                h(Text, { style: { ...styles.tableCell, flex: 2 } }, fmt(row.sqft)),
                h(Text, { style: { ...styles.tableCell, flex: 1.5 } }, `${fmt(row.pct, 1)}%`),
                h(Text, { style: { ...styles.tableCell, flex: 1.5 } }, fmt(row.sq, 1)),
                h(Text, { style: { ...styles.tableCellMuted, flex: 2 } }, type),
              )
            }),
            h(View, { style: { ...styles.tableRow, backgroundColor: '#F1F5F9' } },
              h(Text, { style: { ...styles.tableCell, flex: 1.5, fontFamily: 'Helvetica-Bold' } }, 'TOTAL'),
              h(Text, { style: { ...styles.tableCell, flex: 2, fontFamily: 'Helvetica-Bold' } }, fmt(totalSqft)),
              h(Text, { style: { ...styles.tableCell, flex: 1.5, fontFamily: 'Helvetica-Bold' } }, '100%'),
              h(Text, { style: { ...styles.tableCell, flex: 1.5, fontFamily: 'Helvetica-Bold' } }, fmt(sqftToSquares(totalSqft), 2)),
              h(Text, { style: { ...styles.tableCellMuted, flex: 2 } }, ''),
            ),
          )
        : h(Text, { style: { fontSize: 8, color: BRAND_COLORS.textGray } }, 'Pitch breakdown unavailable'),

      // Complexity badge
      h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginTop: 14, marginBottom: 6 } }, 'Structure Complexity'),
      h(View, { style: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 12 } },
        h(View, { style: { flexDirection: 'row', gap: 0 } },
          h(View, { style: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: effectiveSegCount <= 10 ? '#DCFCE7' : '#F1F5F9', borderRadius: 3 } },
            h(Text, { style: { fontSize: 7.5, color: effectiveSegCount <= 10 ? '#166534' : '#94A3B8' } }, 'Simple (≤10 segs)'),
          ),
          h(View, { style: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: (effectiveSegCount >= 11 && effectiveSegCount <= 15) ? '#FEF3C7' : '#F1F5F9', marginHorizontal: 2, borderRadius: 3 } },
            h(Text, { style: { fontSize: 7.5, color: (effectiveSegCount >= 11 && effectiveSegCount <= 15) ? '#92400E' : '#94A3B8' } }, 'Normal (11–15 segs)'),
          ),
          h(View, { style: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: effectiveSegCount >= 16 ? '#FEE2E2' : '#F1F5F9', borderRadius: 3 } },
            h(Text, { style: { fontSize: 7.5, color: effectiveSegCount >= 16 ? '#991B1B' : '#94A3B8' } }, 'Complex (16+ segs)'),
          ),
        ),
      ),
      h(View, { style: { backgroundColor: complexity.bg, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 } },
        h(Text, { style: { fontSize: 8, color: complexity.color } }, complexity.label),
      ),

      // Waste calculation table
      h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 4 } }, 'Waste Calculation'),
      h(Text, { style: { fontSize: 7.5, color: BRAND_COLORS.textGray, marginBottom: 8 } },
        `Applies to asphalt shingle areas ≥3/12 pitch only (${fmt(totalSqft)} sq ft). Ridge, hip, and starter lengths not included.`,
      ),
      h(View, { style: styles.table },
        h(View, { style: styles.tableHeaderRow },
          h(Text, { style: { ...styles.tableHeaderCell, flex: 1.5 } }, 'Waste %'),
          ...wasteCols.map((w) =>
            h(Text, {
              key: `wh-${w}`,
              style: { ...styles.tableHeaderCell, flex: 1, textAlign: 'center', backgroundColor: w === wasteFactor ? '#1E40AF' : 'transparent' },
            }, `${w}%`)
          ),
        ),
        h(View, { style: styles.tableRow },
          h(Text, { style: { ...styles.tableCell, flex: 1.5, fontFamily: 'Helvetica-Bold' } }, 'Area (ft²)'),
          ...wasteCols.map((w) =>
            h(Text, {
              key: `wa-${w}`,
              style: { ...styles.tableCell, flex: 1, textAlign: 'center', color: w === wasteFactor ? BRAND_COLORS.accent : BRAND_COLORS.textDark, fontFamily: w === wasteFactor ? 'Helvetica-Bold' : 'Helvetica' },
            }, fmt(applyWaste(totalSqft, w)))
          ),
        ),
        h(View, { style: styles.tableRowAlt },
          h(Text, { style: { ...styles.tableCell, flex: 1.5, fontFamily: 'Helvetica-Bold' } }, 'Squares'),
          ...wasteCols.map((w) =>
            h(Text, {
              key: `ws-${w}`,
              style: { ...styles.tableCell, flex: 1, textAlign: 'center', color: w === wasteFactor ? BRAND_COLORS.accent : BRAND_COLORS.textDark, fontFamily: w === wasteFactor ? 'Helvetica-Bold' : 'Helvetica' },
            }, fmt(sqftToSquares(applyWaste(totalSqft, w)), 1))
          ),
        ),
      ),
      h(Text, { style: { fontSize: 6.5, color: BRAND_COLORS.textGray, marginTop: 6, fontStyle: 'italic' } },
        `Suggested waste (${wasteFactor}%) highlighted. Actual waste depends on installation technique, crew experience, and material specs. ` +
        'Ridge, hip, and starter lengths are not included — order separately based on linear footage.',
      ),
    ),

    PageFooter(9, 12, data.generatedAt),
  )
}

// Page 10 — All Structures Totals
function buildAllStructuresPage(data: PremiumReportData): React.ReactElement {
  const lf = data.linearFootage
  const wallFlashFt = Math.round((lf.hip_ft || 0) * 0.08)
  const stepFlashFt = Math.round((lf.valley_ft || 0) * 1.7)
  const dripEdgeFt = lf.eave_ft + lf.rake_ft

  function Row(label: string, value: string, indent = false, bold = false) {
    return h(View, { style: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: BRAND_COLORS.borderGray, paddingLeft: indent ? 12 : 0 } },
      h(Text, { style: { fontSize: 8, color: indent ? BRAND_COLORS.textGray : BRAND_COLORS.textDark, flex: 1, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica' } }, label),
      h(Text, { style: { fontSize: 8.5, color: BRAND_COLORS.textDark, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica' } }, value),
    )
  }

  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, 'All Structures Totals'),
    SectionHeader('ALL STRUCTURES SUMMARY', 'Complete linear footage breakdown for this property'),

    h(View, { style: { ...styles.body } },
      h(View, { style: { flexDirection: 'row', gap: 20 } },

        // Left column
        h(View, { style: { flex: 1 } },
          h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 8 } }, 'Summary'),
          Row('Total Roof Area', `${fmt(data.totalSqft)} sq ft`, false, true),
          Row('Total Roof Facets', `${data.facetCount}`, false, true),
          Row('Predominant Pitch', data.dominantPitch, false, true),
          Row('Order Quantity', `${fmt(data.totalSquares, 1)} sq`, false, true),
          Row('Suggested Waste', `${data.wasteFactor}%`),
          Row('Imagery Date', data.imageryDate ? formatDate(data.imageryDate) : '—'),
          Row('Coordinates', `${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}`),

          h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 8, marginTop: 16 } }, 'Lengths, Areas and Pitches'),
          Row('Ridges', `${fmt(lf.ridge_ft)} ft`, false, true),
          Row('Hips', `${fmt(lf.hip_ft)} ft`, false, true),
          Row('Valleys', `${fmt(lf.valley_ft)} ft`, false, true),
          Row('Rakes', `${fmt(lf.rake_ft)} ft`, false, true),
          Row('Eaves / Starter', `${fmt(lf.eave_ft)} ft`, false, true),
          Row('Ridges + Hips', `${fmt(lf.ridge_ft + lf.hip_ft)} ft`),
          Row('Eaves + Rakes', `${fmt(dripEdgeFt)} ft`),
          Row('Drip Edge (eaves + rakes)', `${fmt(dripEdgeFt)} ft`),
          Row('Total Linear Footage', `${fmt(lf.total_linear_ft)} ft`, false, true),
        ),

        // Right column
        h(View, { style: { flex: 1 } },
          h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 8 } }, 'Flashing (Approximated)'),
          h(View, { style: { backgroundColor: '#FEF3C7', borderRadius: 4, padding: 8, marginBottom: 10 } },
            h(Text, { style: { fontSize: 7.5, color: '#92400E', marginBottom: 4, fontFamily: 'Helvetica-Bold' } }, 'Note — field measurement recommended for flashing'),
            h(Text, { style: { fontSize: 7, color: '#92400E' } },
              'Wall and step flashing are approximated from hip and valley linear footage. ' +
              'Verify on-site before ordering.',
            ),
          ),
          Row('Wall flashing (est.)', wallFlashFt > 0 ? `~${fmt(wallFlashFt)} ft` : '—'),
          Row('Step flashing (est.)', stepFlashFt > 0 ? `~${fmt(stepFlashFt)} ft` : '—'),

          h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 8, marginTop: 16 } }, 'Property Location'),
          Row('Latitude', data.lat.toFixed(6)),
          Row('Longitude', data.lng.toFixed(6)),
          h(Text, { style: { fontSize: 7.5, color: BRAND_COLORS.accent, marginTop: 6 } },
            `Open in Google Maps: https://maps.google.com/?q=${data.lat},${data.lng}`,
          ),

          h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 8, marginTop: 16 } }, 'Accuracy Notes'),
          h(View, { style: { backgroundColor: '#F1F5F9', borderRadius: 4, padding: 8 } },
            h(Text, { style: { fontSize: 7.5, color: BRAND_COLORS.textGray } }, lf.accuracy_note),
          ),
        ),
      ),
    ),

    PageFooter(10, 12, data.generatedAt),
  )
}

// Page 11 — Material Estimate
function buildMaterialEstimatePage(data: PremiumReportData): React.ReactElement {
  const rows = computeMaterialRows(data)
  const wasteCols = WASTE_FACTORS

  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, 'Material Estimate'),
    SectionHeader('MATERIAL ESTIMATE', 'Brand × waste % — computed from linear footage and total area'),

    h(View, { style: { paddingHorizontal: 24, paddingTop: 10 } },
      h(View, { style: styles.table },
        // Header
        h(View, { style: styles.tableHeaderRow },
          h(Text, { style: { ...styles.tableHeaderCell, flex: 3 } }, 'Product'),
          h(Text, { style: { ...styles.tableHeaderCell, flex: 0.8 } }, 'Unit'),
          ...wasteCols.map((w) =>
            h(Text, {
              key: `mh-${w}`,
              style: {
                ...styles.tableHeaderCell,
                flex: 1,
                textAlign: 'center',
                backgroundColor: w === data.wasteFactor ? '#1E40AF' : 'transparent',
              },
            }, `Waste ${w}%`)
          ),
        ),

        // Rows
        ...rows.map((row, i) => {
          if (row.isGroupHeader) {
            return h(View, {
              key: `mr-${i}`,
              style: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: BRAND_COLORS.borderGray, paddingVertical: 4, paddingHorizontal: 6 },
            },
              h(Text, { style: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, flex: 3 } }, row.product),
              h(Text, { style: { fontSize: 7, color: BRAND_COLORS.textGray, flex: 0.8 } }, row.groupBase ?? ''),
              ...wasteCols.map((w, wi) =>
                h(Text, {
                  key: `mg-${i}-${wi}`,
                  style: { fontSize: 7.5, color: BRAND_COLORS.textGray, flex: 1, textAlign: 'center' },
                }, row.quantities[wi] ?? '')
              ),
            )
          }

          return h(View, {
            key: `mr-${i}`,
            style: i % 2 === 0 ? styles.tableRow : styles.tableRowAlt,
          },
            h(Text, { style: { ...styles.tableCell, flex: 3 } }, row.product),
            h(Text, { style: { ...styles.tableCellMuted, flex: 0.8 } }, row.unit),
            ...wasteCols.map((w, wi) =>
              h(Text, {
                key: `mc-${i}-${wi}`,
                style: {
                  ...styles.tableCell,
                  flex: 1,
                  textAlign: 'center',
                  color: w === data.wasteFactor ? BRAND_COLORS.accent : BRAND_COLORS.textDark,
                  fontFamily: w === data.wasteFactor ? 'Helvetica-Bold' : 'Helvetica',
                },
              }, row.quantities[wi] ?? '—')
            ),
          )
        }),
      ),

      h(Text, { style: { fontSize: 6.5, color: BRAND_COLORS.textGray, marginTop: 8, fontStyle: 'italic' } },
        'These calculations are estimates and are not guaranteed. Always double-check calculations before ordering materials. ' +
        `Estimates are based on total pitched area (${fmt(data.totalSqft)} sq ft). ` +
        'Wall and step flashing quantities require on-site measurement.',
      ),
    ),

    PageFooter(11, 12, data.generatedAt),
  )
}

// Page 12 — Disclaimer
function buildDisclaimerPage(data: PremiumReportData): React.ReactElement {
  function Para(text: string) {
    return h(Text, { style: { fontSize: 8.5, color: BRAND_COLORS.textGray, lineHeight: 1.6, marginBottom: 10 } }, text)
  }

  return h(Page, { size: 'LETTER', style: styles.page },
    PageHeader(data.address, 'Disclaimer'),
    SectionHeader('IMPORTANT NOTICE AND DISCLAIMER'),

    h(View, { style: { ...styles.body } },
      h(Text, { style: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND_COLORS.textDark, marginBottom: 12 } }, 'Notice and Disclaimer'),

      Para(
        'This report is designed for bid preparation and sales use. Area measurements are derived from Google Solar API ' +
        'satellite imagery analysis. Linear footage (ridge, hip, valley, eave, rake) is estimated from Google Solar API ' +
        'roof segment geometry using azimuth and area relationships.',
      ),
      Para(
        'Linear footage accuracy: ±20% estimated from roof segment geometry. Performance varies by roof complexity: ' +
        '≤8 Solar segments (simple hip roofs, ~40% of US housing) achieves ±7% average error. ' +
        '9–15 segments achieves ±20–38% error. 16+ segments (complex dormers) achieves ±62% error. ' +
        'Sufficient for material ordering and bid preparation. Not suitable for permit drawings or engineering calculations.',
      ),
      Para(
        'Street View imagery is sourced from Google Street View Static API (heading 0/90/180/270°, pitch 10°, FOV 90°). ' +
        'Satellite imagery is sourced from Google Maps Static API. Imagery may be up to 3 years old. ' +
        'Verify current roof condition with a site visit before ordering materials or submitting insurance claims.',
      ),
      Para(
        'For insurance claim submissions, a certified measurement report from a licensed inspector may be required by your carrier. ' +
        'ProGuild.ai reports are not certified measurement reports and should not be used as a substitute.',
      ),
      Para(
        'Wall flashing and step flashing quantities shown on Page 10 are rough approximations computed from hip and valley ' +
        'linear footage using empirical ratios. These figures carry higher uncertainty than other measurements and require ' +
        'on-site verification before ordering.',
      ),
      Para(
        'ProGuild.ai makes no guarantee of accuracy and accepts no liability for material over- or under-ordering based on ' +
        'this report. Contractors are advised to conduct a preliminary site survey to verify measurements. ' +
        'Field verification is always recommended before final material orders.',
      ),

      h(View, { style: { backgroundColor: '#F1F5F9', borderRadius: 4, padding: 12, marginTop: 8 } },
        h(Text, { style: { fontSize: 7.5, color: BRAND_COLORS.textGray } },
          `Report generated: ${formatDate(data.generatedAt)} · Address: ${data.address} · ` +
          `Coordinates: ${data.lat.toFixed(6)}, ${data.lng.toFixed(6)} · ` +
          `Imagery date: ${data.imageryDate ? formatDate(data.imageryDate) : 'Unknown'}`,
        ),
      ),
    ),

    PageFooter(12, 12, data.generatedAt),
  )
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function buildPremiumReport(data: PremiumReportData): Promise<Buffer> {
  // Pre-compute SVG projection once — shared across all 4 diagram pages
  const { projected, edges } = projectSegments(data.segments)

  const doc = h(Document, {},
    buildCoverPage(data),
    buildSatellitePage(data),
    buildStreetViewNSPage(data),
    buildStreetViewEWPage(data),
    buildDiagramPage(data, 'length', 5, projected, edges),
    buildDiagramPage(data, 'pitch',  6, projected, edges),
    buildDiagramPage(data, 'area',   7, projected, edges),
    buildDiagramPage(data, 'notes',  8, projected, edges),
    buildReportSummaryPage(data),
    buildAllStructuresPage(data),
    buildMaterialEstimatePage(data),
    buildDisclaimerPage(data),
  )

  const buffer = await renderToBuffer(doc)
  return Buffer.from(buffer)
}
