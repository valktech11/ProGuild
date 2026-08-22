// POST /api/roof-visualizer/segment
// SEMANTIC SELECTION PIPELINE (v2):
//   1. Upload photo → normalize (max 2000px JPEG) → R2
//   2. SAM2 automatic → candidate masks
//   3. Decode candidates at grid res (~768px), drop fragments (<0.8%), keep top 12 by area
//   4. Bake INDEX GRIDS: pixel value = index of SMALLEST candidate covering it
//      (smallest-wins → tap on a plane toggles the plane, never a super-mask)
//      - full-res grid → R2 (used by confirm-mask endpoint)
//      - grid-res grid → returned inline as base64 (client hit-testing, no CORS issues)
//   5. Session stores selection_meta; mask_status = 'candidates' until user confirms
// Returns: { sessionId, photoUrl, gridB64, gridW, gridH, candidates }
//
// NO PRESELECTION. Heuristic/VLM preselection was deleted after six iterations proved
// it computes "this isn't roof" (elimination) rather than "this is roof" — every filter
// promoted the next-worst candidate into view (tree→sky→driveway→door) and each fix
// regressed a different photo type (dusk, autumn foliage, monochrome house).
// The confirm step opens empty; the user taps/sweeps their roof planes. SAM2 remains
// because it gives each tap a pixel-precise plane boundary.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import sharp from 'sharp'

// Same logic as lib/pro-auth.ts classifyClient — inlined to avoid circular deps
function classifyClient(ua: string) {
  const isMobileApp = /dart|okhttp|proguild_mobile/i.test(ua)
  const deviceType =
    isMobileApp                     ? 'mobile_app' :
    /ipad/i.test(ua)                ? 'tablet'     :
    /iphone|android/i.test(ua)      ? 'mobile_web' :
    ua === ''                       ? 'unknown'    : 'desktop'
  const browser =
    isMobileApp         ? 'ProGuild App' :
    /edg\//i.test(ua)   ? 'Edge'    :
    /chrome/i.test(ua)  ? 'Chrome'  :
    /safari/i.test(ua)  ? 'Safari'  :
    /firefox/i.test(ua) ? 'Firefox' : null
  const os =
    /windows/i.test(ua)     ? 'Windows' :
    /mac os/i.test(ua)      ? 'macOS'   :
    /android/i.test(ua)     ? 'Android' :
    /iphone|ipad/i.test(ua) ? 'iOS'     :
    /linux/i.test(ua)       ? 'Linux'   : null
  return { deviceType, browser, os }
}

export const maxDuration = 120

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!
const REPLICATE_API   = 'https://api.replicate.com/v1'

const MAX_PHOTO_DIM   = 2000   // normalize uploads
const GRID_MAX_DIM    = 768    // client hit-test resolution
const MAX_CANDIDATES  = 60     // selectable regions (index grid is 8-bit; traced regions start at 200)
// Small objects (windows ~0.3%, doors ~0.5%) MUST remain candidates: the tap-to-trace
// flood fill only spreads into UNOWNED pixels, so anything dropped here becomes an open
// field the fill can bleed into — log-proven (a trace crossed into a window and the
// classical recolor painted the glass purple). The old 0.5% floor existed only to keep
// small objects out of Gemini's offered set; preselection is deleted, so it has no upside.
const MIN_AREA_FRAC   = 0.0008 // 0.08% — owns windows/vents/dormer faces

function r2Key(prefix: string, id: string, ext: string) {
  return `visualizer/${prefix}/${id}.${ext}`
}

// ── SAM2 (unchanged mechanics) ───────────────────────────────────────────────

// Retry a fetch up to maxRetries times on 429/503, with exponential backoff
async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init)
    if (res.status !== 429 && res.status !== 503) return res
    if (attempt === maxRetries) return res
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '10', 10)
    const delay = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 2000)
    console.warn(`[segment] Replicate 429/503 — retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
    await new Promise(r => setTimeout(r, delay))
  }
  return fetch(url, init) // final attempt
}

async function runSam2(imgB64DataUri: string): Promise<{ individual_masks: string[] }> {
  const authHeader = { 'Authorization': `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' }
  const SAM2_VERSION = 'cbd95fb76192174268b6b303aeeb7a736e8dab0cbc38177f09db79b2299da30b'
  const createRes = await fetchWithRetry(`${REPLICATE_API}/predictions`, {
    method: 'POST', headers: authHeader,
    body: JSON.stringify({
      version: SAM2_VERSION,
      input: { image: imgB64DataUri, points_per_side: 32, pred_iou_thresh: 0.7, stability_score_thresh: 0.85, use_m2m: true },
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

// ── GroundedSAM — text-guided segmentation (Grounding DINO + SAM) ─────────────
// Uses schananas/grounded_sam on Replicate (Warm, 2.8M runs, L40S).
// Grounding DINO detects "roof" bounding boxes → SAM2 generates precise masks.
// Zero manual coordinate prompting — fully automated roof isolation.
// Falls back to automatic SAM2 if zero masks returned.

const GROUNDED_SAM_VERSION = 'ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c'
const ROOF_MASK_PROMPT     = 'roof,shingles,roofing,tiles,pitched roof,flat roof,metal roof,dormer'
const ROOF_NEG_PROMPT      = 'wall,siding,sky,grass,lawn,driveway,window,door,chimney,tree,fence'

async function runGroundedSam(imgB64DataUri: string): Promise<{ individual_masks: string[] }> {
  const authHeader = { 'Authorization': `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' }

  // Use model endpoint without version — Replicate uses latest published version
  const createRes = await fetchWithRetry(`${REPLICATE_API}/predictions`, {
    method: 'POST', headers: authHeader,
    body: JSON.stringify({
      version: GROUNDED_SAM_VERSION,
      input: {
        image:                 imgB64DataUri,
        mask_prompt:           ROOF_MASK_PROMPT,
        negative_mask_prompt:  ROOF_NEG_PROMPT,
        adjustment_factor:     5,   // expand slightly to close gaps
      },
    }),
  })
  if (!createRes.ok) throw new Error(`GroundedSAM create failed ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`)
  const prediction = await createRes.json()
  if (prediction.status === 'succeeded') return extractGroundedMasks(prediction.output)
  if (prediction.status === 'failed') throw new Error(`GroundedSAM failed immediately: ${prediction.error}`)
  const pollUrl = prediction.urls?.get
  if (!pollUrl) throw new Error('No poll URL from Replicate')
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } })
    if (!pollRes.ok) continue
    const poll = await pollRes.json()
    if (poll.status === 'succeeded') return extractGroundedMasks(poll.output)
    if (poll.status === 'failed') throw new Error(`GroundedSAM failed: ${poll.error}`)
  }
  throw new Error('GroundedSAM timed out after 120 seconds')
}

// schananas/grounded_sam output: single mask image URL (string) or array
function extractGroundedMasks(output: any): { individual_masks: string[] } {
  if (!output) return { individual_masks: [] }
  if (typeof output === 'string') return { individual_masks: [output] }
  if (Array.isArray(output)) return { individual_masks: output.filter((u: any) => typeof u === 'string') }
  if (output.mask) return { individual_masks: [output.mask] }
  if (output.masks) return { individual_masks: Array.isArray(output.masks) ? output.masks : [output.masks] }
  if (output.individual_masks) return { individual_masks: output.individual_masks }
  console.warn('[segment/grounded] unexpected output shape:', JSON.stringify(output).slice(0, 200))
  return { individual_masks: [] }
}

// ── Segment engine selector ───────────────────────────────────────────────────
// VIZ_SEGMENT_ENGINE=grounded → GroundedSAM (Grounding DINO + SAM2, roof-targeted)
// VIZ_SEGMENT_ENGINE=sam2 (default) → SAM2 automatic (all segments, user selects)

async function runSegmentation(imgB64DataUri: string, imgW: number, imgH: number): Promise<{ individual_masks: string[] }> {
  const engine = process.env.VIZ_SEGMENT_ENGINE ?? 'sam2'
  console.log(`[segment] engine=${engine}`)
  if (engine === 'grounded') {
    try {
      const result = await runGroundedSam(imgB64DataUri)
      if (result.individual_masks.length > 0) {
        console.log(`[segment/grounded] ${result.individual_masks.length} roof masks returned`)
        return result
      }
      console.warn('[segment/grounded] zero masks — falling back to SAM2 automatic')
    } catch (e) {
      console.error('[segment/grounded] failed, falling back to SAM2:', e)
    }
  }
  return runSam2(imgB64DataUri)
}

// ── Candidate decoding + index grid baking ───────────────────────────────────

interface Candidate {
  index: number          // 1-based, stable across grid + labels + Gemini
  areaPx: number         // at grid res
  areaPct: number
  cx: number; cy: number // centroid at grid res
  meanLum: number        // original-photo luminance inside mask (heuristic fallback)
  gridRaw: Buffer        // 1ch at grid res
  srcBuf: Buffer         // original downloaded mask PNG (full-res decode without refetch)
}


async function decodeCandidates(
  maskUrls: string[], gw: number, gh: number, photoRgbGrid: Buffer
): Promise<Candidate[]> {
  // Decode ALL masks — proven necessary: SAM2 returned 104 in stability order and the
  // main roof plane sat beyond every arbitrary cap. Batched fetches (16 at a time).
  const capped = maskUrls.slice(0, 256)  // effectively uncapped (SAM2 max output is well below this)

  const decodeOne = async (url: string) => {
    try {
      const res = await fetch(url)
      const buf = Buffer.from(await res.arrayBuffer())
      const raw = await sharp(buf).resize(gw, gh, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer()
      let area = 0, xSum = 0, ySum = 0, lumSum = 0
      for (let p = 0; p < gw * gh; p++) {
        if (raw[p] > 200) {
          area++; xSum += p % gw; ySum += Math.floor(p / gw)
          const rr = photoRgbGrid[p * 3], gg = photoRgbGrid[p * 3 + 1], bb = photoRgbGrid[p * 3 + 2]
          lumSum += (rr + gg + bb) / 3
        }
      }
      return { buf, raw, area, cx: area ? xSum / area : 0, cy: area ? ySum / area : 0,
               meanLum: area ? lumSum / area : 255 }
    } catch { return null }
  }

  const decoded: Array<Awaited<ReturnType<typeof decodeOne>>> = []
  const BATCH = 16
  for (let b = 0; b < capped.length; b += BATCH) {
    const batch = await Promise.all(capped.slice(b, b + BATCH).map(decodeOne))
    decoded.push(...batch)
  }

  const total = gw * gh
  const ok = decoded.filter((d): d is NonNullable<typeof d> => !!d)
  console.log(`[segment] SAM2 masks: ${maskUrls.length} returned, ${ok.length} decoded; areas: ${ok.map(d => (d.area / total * 100).toFixed(1) + '%').join(', ')}`)
  const kept = ok
    .filter(d => d.area / total >= MIN_AREA_FRAC && d.area / total <= 0.6)
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_CANDIDATES)
  console.log(`[segment] kept ${kept.length} tappable candidates:`, kept.map((d, i) => `#${i+1}=${(d.area/total*100).toFixed(1)}%`).join(' '))

  return kept.map((d, i) => ({
    index: i + 1, areaPx: d.area, areaPct: d.area / total,
    cx: d.cx, cy: d.cy, meanLum: d.meanLum,
    gridRaw: d.raw, srcBuf: d.buf,
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

// Full-res index grid: decode kept candidates at photo dims from stored buffers (no refetch).
async function bakeFullResGrid(cands: Candidate[], pw: number, ph: number): Promise<Buffer> {
  const grid = Buffer.alloc(pw * ph)
  const byAreaDesc = [...cands].sort((a, b) => b.areaPx - a.areaPx)
  for (const c of byAreaDesc) {
    const raw = await sharp(c.srcBuf).resize(pw, ph, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer()
    for (let p = 0; p < pw * ph; p++) {
      if (raw[p] > 200) grid[p] = c.index
    }
  }
  return grid
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              || req.headers.get('x-real-ip')?.trim()
              || null)
    const ua = req.headers.get('user-agent') ?? ''
    const { deviceType, browser, os } = classifyClient(ua)
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

    // Link the session to the pro at creation when one is signed in. Without this
    // every session is anonymous, and the PDF report (which matches on pro_id) 404s
    // even for a logged-in pro looking at their own renders.
    const proIdRaw = form.get('proId')
    const proId = typeof proIdRaw === 'string' && proIdRaw.length > 0 ? proIdRaw : null

    await sb.from('visualizer_sessions').insert({
      id: sessionId, photo_r2_key: photoKey, photo_public_url: photoUrl,
      mask_status: 'processing', ip_address: ip ?? 'unknown',
      user_agent: ua || null, device_type: deviceType, browser: browser ?? null, os: os ?? null,
      ...(proId ? { pro_id: proId } : {}),
    })
    if (proId) console.log(`[segment] session ${sessionId} linked to pro ${proId}`)

    // SAM2
    let samOut: { individual_masks: string[] }
    try {
      samOut = await runSegmentation(`data:image/jpeg;base64,${photoBuffer.toString('base64')}`, pw, ph)
    } catch (samErr) {
      const msg = samErr instanceof Error ? samErr.message : 'Segmentation error'
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
    const photoRgbGrid  = await sharp(photoGridJpeg).removeAlpha().raw().toBuffer()  // 3ch — lum + Excess-Green per candidate

    // Candidates + grids
    const cands = await decodeCandidates(samOut.individual_masks, gw, gh, photoRgbGrid)
    if (cands.length === 0) {
      await sb.from('visualizer_sessions').update({ mask_status: 'failed', mask_error: 'No viable candidates' }).eq('id', sessionId)
      return NextResponse.json({ error: 'No roof-sized surfaces found. Try a closer photo.' }, { status: 422 })
    }

    // Occlusion scoring: count vegetation (ExG) + sky (ExB) pixels in the full grid photo.
    // Used to warn the user before they spend time selecting a heavily-occluded roof.
    // Cost: one pass over photoRgbGrid (already in memory, no extra I/O).
    let vegPx = 0
    const totalPx = gw * gh
    for (let p = 0; p < totalPx; p++) {
      const rr = photoRgbGrid[p * 3], gg = photoRgbGrid[p * 3 + 1], bb = photoRgbGrid[p * 3 + 2]
      if (2 * gg - rr - bb > 40) vegPx++   // ExG — vegetation
    }
    const vegFraction = +(vegPx / totalPx).toFixed(3)
    const maxCandArea = cands.length > 0 ? Math.max(...cands.map(c => c.areaPct)) : 0
    const candCount   = cands.length
    // Occlusion level: 'clear' | 'partial' | 'heavy'
    // Two signals combined:
    //   1. vegFraction: ExG pixel ratio. Lowered from 0.25→0.18 to catch backlit/shaded
    //      foliage where ExG is suppressed (dark leaves score ~0.22 on the brick/oak house).
    //   2. Fragmentation: many small candidates + no dominant roof plane = heavy occlusion.
    //      A clear photo typically has one candidate at 25%+; 60 fragments with max 19.6%
    //      is a strong occlusion signal independent of colour.
    const isFragmented = candCount >= 40 && maxCandArea < 0.22
    const occlusionLevel =
      (vegFraction > 0.40 && maxCandArea < 0.10) ? 'heavy' :
      (vegFraction > 0.18 || isFragmented) && maxCandArea < 0.22 ? 'partial' :
      'clear'
    console.log(`[segment] vegFraction=${vegFraction} maxCandArea=${maxCandArea.toFixed(3)} candCount=${candCount} fragmented=${isFragmented} → occlusion=${occlusionLevel}`)

    const gridClient = bakeIndexGrid(cands, gw, gh)
    const gridB64 = (await sharp(gridClient, { raw: { width: gw, height: gh, channels: 1 } }).png().toBuffer()).toString('base64')

    const gridFull = await bakeFullResGrid(cands, pw, ph)
    const gridFullKey = r2Key('grids', sessionId, 'png')
    await uploadToR2(gridFullKey, await sharp(gridFull, { raw: { width: pw, height: ph, channels: 1 } }).png().toBuffer(), 'image/png')

    // Semantic classification (Gemini primary, heuristic fallback)
    await sb.from('visualizer_sessions').update({
      mask_status: 'candidates',
      selection_meta: {
        grid_full_key: gridFullKey, grid_w: gw, grid_h: gh, photo_w: pw, photo_h: ph,
        candidates: cands.map(c => ({ i: c.index, areaPct: +c.areaPct.toFixed(4), cx: +c.cx.toFixed(0), cy: +c.cy.toFixed(0), meanLum: +c.meanLum.toFixed(0) })),
        selector: 'manual',
        vegFraction, occlusionLevel,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', sessionId)

    return NextResponse.json({
      sessionId, photoUrl, gridB64, gridW: gw, gridH: gh,
      candidates: cands.map(c => ({ index: c.index, areaPct: c.areaPct, cy: +c.cy.toFixed(0), meanLum: +c.meanLum.toFixed(0) })),
      vegFraction, occlusionLevel,
    })

  } catch (err: unknown) {
    console.error('[visualizer/segment]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Segmentation failed' }, { status: 500 })
  }
}
