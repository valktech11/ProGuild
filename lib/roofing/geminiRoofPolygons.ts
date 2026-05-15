/**
 * lib/roofing/geminiRoofPolygons.ts
 *
 * Uses Gemini Vision to extract actual roof facet polygon vertices from a
 * top-down satellite JPEG. Returns polygon shapes for diagram rendering instead
 * of the approximated azimuth-rotated rectangles currently used.
 *
 * The returned vertex coordinates are normalised 0–1 within the satellite image.
 * The PDF renderer scales them to the SVG canvas.
 *
 * Cost: ~$0.001 per report (reuses the already-fetched satellite JPEG).
 * Falls back to null on any failure — caller uses existing approximation.
 */

export interface GeminiFacet {
  id: number                          // 0-based index
  vertices: Array<{ x: number; y: number }>  // normalised 0–1 within image
  centroid: { x: number; y: number }  // computed from vertices
  edgeTypes: GeminiEdge[]            // edges of this facet
}

export interface GeminiEdge {
  type: 'ridge' | 'hip' | 'valley' | 'eave' | 'rake'
  pt1: { x: number; y: number }
  pt2: { x: number; y: number }
  sharedWithFacetId?: number         // index of adjacent facet, if shared edge
}

export interface GeminiRoofPolygons {
  facets: GeminiFacet[]
  imageWidthPx: number               // always 640 (Maps Static API)
  imageHeightPx: number              // always 640
  northOffsetDeg: number             // compass rotation: 0 = image top = North
}

const GEMINI_TIMEOUT_MS = 25_000

/**
 * Calls Gemini Vision with the satellite JPEG to extract roof polygon vertices.
 *
 * @param base64Jpeg  base64-encoded JPEG (already fetched by report pipeline)
 * @param geminiKey   GEMINI_API_KEY
 * @returns           parsed polygon data, or null on failure
 */
export async function getGeminiRoofPolygons(
  base64Jpeg: string,
  geminiKey: string,
): Promise<GeminiRoofPolygons | null> {
  if (!geminiKey || !base64Jpeg) return null

  const prompt = `You are analyzing a top-down satellite image of a residential roof.
Your task is to identify every distinct roof FACET (plane) visible on the main building.
Ignore trees, cars, driveways, neighbouring buildings, and shadows.

For EACH roof facet you can see, output a polygon by listing its corner vertices.
Use normalised coordinates where (0,0) = top-left and (1,1) = bottom-right of the image.

Also classify each EDGE of each polygon as one of:
- ridge: horizontal peak where two slopes meet (usually a straight line at the top)
- hip: sloped edge at a corner where two planes meet diagonally
- valley: V-shaped channel where two downward slopes meet
- eave: horizontal bottom edge (where the roof meets the fascia/gutters)
- rake: sloped edge along a gable end (edge parallel to the roof slope)

Respond ONLY with a valid JSON object — no markdown, no explanation, no code fences.
Format:
{
  "north_offset_deg": 0,
  "facets": [
    {
      "id": 0,
      "vertices": [{"x": 0.3, "y": 0.2}, {"x": 0.5, "y": 0.2}, {"x": 0.5, "y": 0.5}, {"x": 0.3, "y": 0.5}],
      "edges": [
        {"type": "ridge", "pt1": {"x": 0.3, "y": 0.2}, "pt2": {"x": 0.5, "y": 0.2}},
        {"type": "eave",  "pt1": {"x": 0.3, "y": 0.5}, "pt2": {"x": 0.5, "y": 0.5}},
        {"type": "hip",   "pt1": {"x": 0.5, "y": 0.2}, "pt2": {"x": 0.5, "y": 0.5}},
        {"type": "hip",   "pt1": {"x": 0.3, "y": 0.2}, "pt2": {"x": 0.3, "y": 0.5}}
      ]
    }
  ]
}

Rules:
- Include ALL visible pitched roof facets, including small dormers and hip triangles
- Vertices must be in order (clockwise or counter-clockwise)
- Minimum 3 vertices per facet, maximum 8
- north_offset_deg: how many degrees clockwise is North from the image top (usually 0)
- Do NOT include flat sections, carports, ground, or sky
- Keep vertex coordinates to 3 decimal places`

  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } },
      ],
    }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.1,  // low temp for deterministic geometry
    },
  })

  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    )
  } catch (err) {
    console.warn('[gemini-poly] fetch error:', String(err).slice(0, 100))
    return null
  }

  if (!res.ok) {
    console.warn(`[gemini-poly] HTTP ${res.status}`)
    return null
  }

  let json: unknown
  try { json = await res.json() } catch {
    console.warn('[gemini-poly] JSON parse error')
    return null
  }

  const raw = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) { console.warn('[gemini-poly] empty response'); return null }

  // Strip markdown fences if present
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  let parsed: unknown
  try { parsed = JSON.parse(cleaned) } catch {
    console.warn('[gemini-poly] JSON parse failed:', cleaned.slice(0, 200))
    return null
  }

  return validateAndNormalize(parsed)
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateAndNormalize(raw: unknown): GeminiRoofPolygons | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  if (!Array.isArray(r.facets) || r.facets.length === 0) {
    console.warn('[gemini-poly] no facets in response')
    return null
  }

  const VALID_EDGE_TYPES = new Set(['ridge', 'hip', 'valley', 'eave', 'rake'])

  const facets: GeminiFacet[] = []

  for (const rawFacet of r.facets) {
    if (!rawFacet || typeof rawFacet !== 'object') continue
    const f = rawFacet as Record<string, unknown>

    if (!Array.isArray(f.vertices) || f.vertices.length < 3) continue

    const vertices: Array<{ x: number; y: number }> = []
    for (const v of f.vertices) {
      if (!v || typeof v !== 'object') continue
      const vObj = v as Record<string, unknown>
      const x = Number(vObj.x), y = Number(vObj.y)
      if (isNaN(x) || isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) continue
      vertices.push({ x: clamp(x, 0, 1), y: clamp(y, 0, 1) })
    }
    if (vertices.length < 3) continue

    const edges: GeminiEdge[] = []
    if (Array.isArray(f.edges)) {
      for (const rawEdge of f.edges) {
        if (!rawEdge || typeof rawEdge !== 'object') continue
        const e = rawEdge as Record<string, unknown>
        const type = String(e.type || '').toLowerCase()
        if (!VALID_EDGE_TYPES.has(type)) continue
        const pt1 = parsePoint(e.pt1)
        const pt2 = parsePoint(e.pt2)
        if (!pt1 || !pt2) continue
        edges.push({
          type: type as GeminiEdge['type'],
          pt1, pt2,
          sharedWithFacetId: typeof e.shared_with === 'number' ? e.shared_with : undefined,
        })
      }
    }

    // Compute centroid
    const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length
    const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length

    facets.push({
      id: typeof f.id === 'number' ? f.id : facets.length,
      vertices,
      centroid: { x: cx, y: cy },
      edgeTypes: edges,
    })
  }

  if (facets.length === 0) {
    console.warn('[gemini-poly] no valid facets after validation')
    return null
  }

  console.log(`[gemini-poly] extracted ${facets.length} facets with ${facets.reduce((s, f) => s + f.edgeTypes.length, 0)} edges`)

  return {
    facets,
    imageWidthPx: 640,
    imageHeightPx: 640,
    northOffsetDeg: typeof r.north_offset_deg === 'number' ? r.north_offset_deg : 0,
  }
}

function parsePoint(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const x = Number(p.x), y = Number(p.y)
  if (isNaN(x) || isNaN(y)) return null
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
