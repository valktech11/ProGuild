// POST /api/roof-visualizer/segment
// SEMANTIC SELECTION PIPELINE (v2):
//   1. Upload photo → normalize (max 2000px JPEG) → R2
//   2. SAM2 automatic → candidate masks
//   3. Decode candidates at grid res (~768px), drop fragments (<0.8%), keep top 12 by area
//   4. Bake INDEX GRIDS: pixel value = index of SMALLEST candidate covering it
//      (smallest-wins → tap on a plane toggles the plane, never a super-mask)
//      - full-res grid → R2 (used by confirm-mask endpoint)
//      - grid-res grid → returned inline as base64 (client hit-testing, no CORS issues)
//   5. Gemini 2.5 Flash classifies a numbered composite → {roof_indices, confidence_scores}
//      (detection-only, text out; heuristic fallback if the call fails)
//   6. Session stores selection_meta; mask_status = 'candidates' until user confirms
// Returns: { sessionId, photoUrl, gridB64, gridW, gridH, candidates, preselected, uncertain, confidence, confidenceNote }

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import sharp from 'sharp'

export const maxDuration = 120

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!
const REPLICATE_API   = 'https://api.replicate.com/v1'
const GEM_KEY         = process.env.GEMINI_API_KEY || ''
const GEMINI_TEXT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEM_KEY}`

const MAX_PHOTO_DIM   = 2000   // normalize uploads
const GRID_MAX_DIM    = 768    // client hit-test resolution
const MAX_CANDIDATES  = 12     // selectable logical regions cap
const MIN_AREA_FRAC   = 0.008  // fragments below this are not selectable

function r2Key(prefix: string, id: string, ext: string) {
  return `visualizer/${prefix}/${id}.${ext}`
}

// ── SAM2 (unchanged mechanics) ───────────────────────────────────────────────

async function runSam2(imgB64DataUri: string): Promise<{ individual_masks: string[] }> {
  const authHeader = { 'Authorization': `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' }
  const SAM2_VERSION = 'cbd95fb76192174268b6b303aeeb7a736e8dab0cbc38177f09db79b2299da30b'
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST', headers: authHeader,
    body: JSON.stringify({
      version: SAM2_VERSION,
      input: { image: imgB64DataUri, points_per_side: 16, pred_iou_thresh: 0.85, stability_score_thresh: 0.92, use_m2m: true },
    }),
  })
  if (!createRes.ok) throw new Error(`Replicate create failed ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`)
  const prediction = await createRes.json()
  if (prediction.status === 'succeeded') return prediction.output
  if (prediction.status === 'failed') throw new Error(`SAM2 failed immediately: ${prediction.error}`)
  const pollUrl = prediction.urls?.get
  if (!pollUrl) throw new Error('No poll URL from Replicate')
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } })
    if (!pollRes.ok) continue
    const poll = await pollRes.json()
    if (poll.status === 'succeeded') return poll.output
    if (poll.status === 'failed') throw new Error(`SAM2 failed: ${poll.error}`)
  }
  throw new Error('SAM2 timed out after 120 seconds')
}

// ── Candidate decoding + index grid baking ───────────────────────────────────

interface Candidate {
  index: number          // 1-based, stable across grid + labels + Gemini
  areaPx: number         // at grid res
  areaPct: number
  cx: number; cy: number // centroid at grid res
  meanLum: number        // original-photo luminance inside mask (heuristic fallback)
  gridRaw: Buffer        // 1ch at grid res
  url: string            // SAM2 mask URL (re-decoded at full res on demand)
}

async function decodeCandidates(
  maskUrls: string[], gw: number, gh: number, photoLumGrid: Buffer
): Promise<Candidate[]> {
  const capped = maskUrls.slice(0, 24)
  const decoded = await Promise.all(capped.map(async (url) => {
    try {
      const res = await fetch(url)
      const buf = Buffer.from(await res.arrayBuffer())
      const raw = await sharp(buf).resize(gw, gh, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer()
      let area = 0, xSum = 0, ySum = 0, lumSum = 0
      for (let p = 0; p < gw * gh; p++) {
        if (raw[p] > 200) { area++; xSum += p % gw; ySum += Math.floor(p / gw); lumSum += photoLumGrid[p] }
      }
      return { url, raw, area, cx: area ? xSum / area : 0, cy: area ? ySum / area : 0, meanLum: area ? lumSum / area : 255 }
    } catch { return null }
  }))

  const total = gw * gh
  const kept = decoded
    .filter((d): d is NonNullable<typeof d> => !!d && d.area / total >= MIN_AREA_FRAC && d.area / total <= 0.6)
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_CANDIDATES)

  return kept.map((d, i) => ({
    index: i + 1, areaPx: d.area, areaPct: d.area / total,
    cx: d.cx, cy: d.cy, meanLum: d.meanLum, gridRaw: d.raw, url: d.url,
  }))
}

// Bake index grid: iterate LARGEST → SMALLEST so smallest candidate wins per pixel.
function bakeIndexGrid(cands: Candidate[], gw: number, gh: number): Buffer {
  const grid = Buffer.alloc(gw * gh) // 0 = none
  const byAreaDesc = [...cands].sort((a, b) => b.areaPx - a.areaPx)
  for (const c of byAreaDesc) {
    for (let p = 0; p < gw * gh; p++) {
      if (c.gridRaw[p] > 200) grid[p] = c.index
    }
  }
  return grid
}

// Full-res index grid: re-decode kept candidates at photo dims.
async function bakeFullResGrid(cands: Candidate[], pw: number, ph: number): Promise<Buffer> {
  const grid = Buffer.alloc(pw * ph)
  const byAreaDesc = [...cands].sort((a, b) => b.areaPx - a.areaPx)
  for (const c of byAreaDesc) {
    const res = await fetch(c.url)
    const buf = Buffer.from(await res.arrayBuffer())
    const raw = await sharp(buf).resize(pw, ph, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer()
    for (let p = 0; p < pw * ph; p++) {
      if (raw[p] > 200) grid[p] = c.index
    }
  }
  return grid
}

// ── Gemini semantic classification (detection-only, JSON out) ────────────────

async function classifyWithGemini(
  photoGridJpeg: Buffer, cands: Candidate[]
): Promise<{ roofIndices: number[]; confidences: Record<number, number> } | null> {
  try {
    // Colored-dot markers (font-free — Vercel Lambda has no fonts, SVG <text> renders blank)
    const DOT_COLORS: Array<[string, string]> = [
      ['#FF0000','red'], ['#0033FF','blue'], ['#00CC00','green'], ['#FFD700','yellow'],
      ['#FF8C00','orange'], ['#9900FF','purple'], ['#00CCCC','cyan'], ['#FF00CC','magenta'],
      ['#8B4513','brown'], ['#FF69B4','pink'], ['#66FF33','lime'], ['#000080','navy'],
    ]
    const meta = await sharp(photoGridJpeg).metadata()
    const w = meta.width ?? GRID_MAX_DIM, h = meta.height ?? GRID_MAX_DIM
    const dots = cands.map(c => {
      const [hex] = DOT_COLORS[(c.index - 1) % DOT_COLORS.length]
      return `<circle cx="${c.cx.toFixed(0)}" cy="${c.cy.toFixed(0)}" r="13" fill="${hex}" stroke="white" stroke-width="4"/>`
    }).join('')
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${dots}</svg>`
    const composite = await sharp(photoGridJpeg).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toBuffer()

    const legend = cands.map(c => {
      const [, name] = DOT_COLORS[(c.index - 1) % DOT_COLORS.length]
      return `Region ${c.index}: ${name} dot at pixel (${c.cx.toFixed(0)}, ${c.cy.toFixed(0)})`
    }).join('\n')

    const prompt = [
      `A house photo (${w}x${h}px) has colored dot markers on segmented regions:`,
      legend,
      '',
      'Identify which regions are part of the HOUSE ROOF: shingles, tiles, metal roofing, dormers, gable planes, porch roofs, and attached-garage roofs of the SAME house.',
      'EXCLUDE: sky, walls, siding, windows, garage DOORS, entry doors, trees, bushes, grass, driveway, sidewalks, fences, cars, and any neighboring house.',
      'Respond with ONLY this JSON, no markdown fences, no commentary:',
      '{"roof_indices":[<region numbers>],"confidence_scores":[<0..1 floats aligned with roof_indices>]}',
    ].join('\n')

    const res = await fetch(GEMINI_TEXT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: composite.toString('base64') } },
        ]}],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) { console.warn('[segment/gemini]', res.status, (await res.text()).slice(0, 200)); return null }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as { roof_indices: number[]; confidence_scores?: number[] }
    if (!Array.isArray(parsed.roof_indices)) return null

    const valid = new Set(cands.map(c => c.index))
    const roofIndices = parsed.roof_indices.filter(i => valid.has(i))
    const confidences: Record<number, number> = {}
    roofIndices.forEach((idx, k) => { confidences[idx] = parsed.confidence_scores?.[k] ?? 0.8 })
    console.log('[segment/gemini] roof indices:', roofIndices, 'confidences:', confidences)
    return { roofIndices, confidences }
  } catch (e) {
    console.warn('[segment/gemini] failed:', e instanceof Error ? e.message : e)
    return null
  }
}

// Heuristic fallback (Gemini unavailable) — spatial + brightness, PRESELECT ONLY
function heuristicPreselect(cands: Candidate[], gh: number): number[] {
  return cands
    .filter(c => c.cy / gh <= 0.72 && c.meanLum <= 185)
    .map(c => c.index)
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    const sb = getSupabaseAdmin()
    const hourAgo = new Date(Date.now() - 3600_000).toISOString()
    const { count: recentCount } = await sb
      .from('visualizer_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', hourAgo)
    if ((recentCount ?? 0) >= 10) {
      return NextResponse.json({ error: 'Too many requests — try again later' }, { status: 429 })
    }

    const form = await req.formData()
    const file = form.get('photo') as File | null
    if (!file) return NextResponse.json({ error: 'photo required' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Photo must be under 10MB' }, { status: 400 })

    // Normalize: any format → JPEG, max 2000px
    const rawBuffer   = Buffer.from(await file.arrayBuffer())
    const photoBuffer = await sharp(rawBuffer)
      .resize(MAX_PHOTO_DIM, MAX_PHOTO_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 }).toBuffer()
    const pMeta = await sharp(photoBuffer).metadata()
    const pw = pMeta.width ?? 800, ph = pMeta.height ?? 600

    const sessionId = crypto.randomUUID()
    const photoKey  = r2Key('photos', sessionId, 'jpg')
    const photoUrl  = await uploadToR2(photoKey, photoBuffer, 'image/jpeg')

    await sb.from('visualizer_sessions').insert({
      id: sessionId, photo_r2_key: photoKey, photo_public_url: photoUrl,
      mask_status: 'processing', ip_address: ip,
    })

    // SAM2
    let samOut: { individual_masks: string[] }
    try {
      samOut = await runSam2(`data:image/jpeg;base64,${photoBuffer.toString('base64')}`)
    } catch (samErr) {
      const msg = samErr instanceof Error ? samErr.message : 'SAM2 error'
      await sb.from('visualizer_sessions').update({ mask_status: 'failed', mask_error: msg }).eq('id', sessionId)
      return NextResponse.json({ error: 'Could not analyze this photo. Try a clear street-view photo.', detail: msg }, { status: 422 })
    }
    if (!samOut?.individual_masks?.length) {
      await sb.from('visualizer_sessions').update({ mask_status: 'failed', mask_error: 'No masks' }).eq('id', sessionId)
      return NextResponse.json({ error: 'No surfaces detected. Try a clearer photo.' }, { status: 422 })
    }

    // Grid dims (preserve aspect, max 768)
    const scale = Math.min(GRID_MAX_DIM / pw, GRID_MAX_DIM / ph, 1)
    const gw = Math.round(pw * scale), gh = Math.round(ph * scale)
    const photoGridJpeg = await sharp(photoBuffer).resize(gw, gh, { fit: 'fill' }).jpeg({ quality: 85 }).toBuffer()
    const photoLumGrid  = await sharp(photoGridJpeg).greyscale().extractChannel(0).raw().toBuffer()

    // Candidates + grids
    const cands = await decodeCandidates(samOut.individual_masks, gw, gh, photoLumGrid)
    if (cands.length === 0) {
      await sb.from('visualizer_sessions').update({ mask_status: 'failed', mask_error: 'No viable candidates' }).eq('id', sessionId)
      return NextResponse.json({ error: 'No roof-sized surfaces found. Try a closer photo.' }, { status: 422 })
    }

    const gridClient = bakeIndexGrid(cands, gw, gh)
    const gridB64 = (await sharp(gridClient, { raw: { width: gw, height: gh, channels: 1 } }).png().toBuffer()).toString('base64')

    const gridFull = await bakeFullResGrid(cands, pw, ph)
    const gridFullKey = r2Key('grids', sessionId, 'png')
    await uploadToR2(gridFullKey, await sharp(gridFull, { raw: { width: pw, height: ph, channels: 1 } }).png().toBuffer(), 'image/png')

    // Semantic classification (Gemini primary, heuristic fallback)
    const gem = await classifyWithGemini(photoGridJpeg, cands)
    let preselected: number[], uncertain: number[], selector: string
    if (gem && gem.roofIndices.length > 0) {
      preselected = gem.roofIndices.filter(i => (gem.confidences[i] ?? 0) >= 0.6)
      uncertain   = gem.roofIndices.filter(i => (gem.confidences[i] ?? 0) <  0.6)
      selector = 'gemini-2.5-flash'
      if (preselected.length === 0) { preselected = gem.roofIndices; uncertain = []; }
    } else {
      preselected = heuristicPreselect(cands, gh)
      uncertain = []
      selector = 'heuristic-fallback'
    }

    // Confidence badge from preselection coverage
    const preArea = cands.filter(c => preselected.includes(c.index)).reduce((s, c) => s + c.areaPct, 0)
    let confidence: 'high' | 'medium' | 'low' = 'high'
    let confidenceNote = 'Roof detected — confirm below'
    if (preArea < 0.04)      { confidence = 'low';    confidenceNote = 'Roof unclear — tap the roof areas below' }
    else if (preArea < 0.10) { confidence = 'medium'; confidenceNote = 'Roof detected — check all planes are selected' }

    await sb.from('visualizer_sessions').update({
      mask_status: 'candidates',
      selection_meta: {
        grid_full_key: gridFullKey, grid_w: gw, grid_h: gh, photo_w: pw, photo_h: ph,
        candidates: cands.map(c => ({ i: c.index, areaPct: +c.areaPct.toFixed(4), cx: +c.cx.toFixed(0), cy: +c.cy.toFixed(0), meanLum: +c.meanLum.toFixed(0) })),
        selector, preselected, uncertain,
        gemini_confidences: gem?.confidences ?? null,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', sessionId)

    return NextResponse.json({
      sessionId, photoUrl, gridB64, gridW: gw, gridH: gh,
      candidates: cands.map(c => ({ index: c.index, areaPct: c.areaPct })),
      preselected, uncertain, confidence, confidenceNote,
    })

  } catch (err: unknown) {
    console.error('[visualizer/segment]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Segmentation failed' }, { status: 500 })
  }
}
