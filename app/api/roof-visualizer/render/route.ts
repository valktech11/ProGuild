// POST /api/roof-visualizer/render
// HYBRID RENDERER — classical recolor (guaranteed) + AI polish (gated by similarity check)
//
// Pipeline per SKU:
//   1. Classical: greyscale + tint toward SKU hex inside SAM2 mask.
//      Preserves luminance = texture, shadows, ridge lines. Cannot fail. Instant.
//   2. AI attempt: Gemini image gen with original photo + edit prompt.
//   3. Similarity gate: compare NON-ROOF region of AI output vs original (downscaled MAE).
//      Fail → serve classical. Pass → pixel-guarantee composite:
//      final = original pixels outside mask + AI pixels inside mask.
//   The user NEVER sees a different house.
//
// Body: { sessionId, skuIds: string[] }   (1–3 SKU UUIDs)
// Returns: { renders: [{ skuId, renderUrl, skuName, hexPreview, engine }] }

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import sharp from 'sharp'
import {
  rgbToLab, adaptiveK, labRecolorPixel, K_BASE,
} from '@/lib/roof-visualizer/lab'

export const maxDuration = 120

// RENDER ENGINE SELECTOR
//   'lab'    — CIELAB classical recolour for every SKU, Gemini never called. Zero API cost.
//   'hybrid' — legacy: additive-sRGB classical + Gemini arbitration for chromatic chips.
// Env sets the default; an optional `engine` field on the request body overrides per call so
// A/B comparison runs against one session without a redeploy.
type RenderEngineMode = 'lab' | 'hybrid'
const DEFAULT_ENGINE: RenderEngineMode =
  process.env.VIZ_RENDER_ENGINE === 'hybrid' ? 'hybrid' : 'lab'

// Granule jitter in Lab units. The legacy values were sRGB code values (±9 luminance, ±4 per
// channel); near mid-grey one code value is ~0.34 L*, so ±9 codes is ~±3 L*. Chroma jitter is
// set independently rather than derived, because in Lab it is a direct a*/b* offset with no
// luminance coupling — the legacy per-channel hue jitter moved lightness as a side effect.
const LAB_LUM_JITTER = 4.5   // raised from 3.0 — compensates for loss of cell averaging
const LAB_AB_JITTER  = 2.8   // raised from 2.0 — same reason

// PLANE BRIGHTNESS DRIFT — a very slow sinusoidal modulation of L* that varies across the
// roof plane. On a real roof, slight manufacturing differences between bundles, the angle of
// granule lay, and panel-to-panel moisture variation produce a low-frequency brightness wave
// that makes the surface read as continuous material rather than a painted flat field.
//
// Two orthogonal waves at incommensurate periods (271px, 389px) sum to a Lissajous-like
// pattern with no visible repeat within any residential roof width. Amplitude ±2.5 L* is
// below the JND for a single uniform surface but perceptible as depth across a 1000px span.
const PLANE_DRIFT_AMP    = 2.5    // ± L* units
const PLANE_DRIFT_FREQ_X = 1 / 271  // cycles per pixel, horizontal
const PLANE_DRIFT_FREQ_Y = 1 / 389  // cycles per pixel, vertical

const GEM_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_IMG_MODEL = 'gemini-3.1-flash-image'  // Nano Banana 2 — experiment behind the gate
const GEMINI_IMG_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMG_MODEL}:generateContent?key=${GEM_KEY}`

// Two-sided arbitration gate (MAE on 64px downscale, 0-255):
// (a) non-roof region must be UNCHANGED  — copies pass, regenerated scenes (40+) fail
// (b) roof region must be CHANGED       — lazy photocopies fail, real edits pass
const NONROOF_MAE_MAX = 18
const ROOF_MAE_MIN    = 12
// Neutral chips (R≈G≈B) are rendered EXACTLY by the additive classical path — the same
// shade value is added to all three channels, so a neutral chip stays neutral by
// construction. Gemini can only introduce hue drift there (log-proven: Pewter Gray
// #8A8A8A came back with a sage cast at engine=ai). Skip the AI attempt entirely.
// Threshold raised 12→20: Pristine Heather (chroma 18) was winning AI arbitration
// and drifting to lavender. At chroma ≤20 the classical result is exact; AI only
// introduces hue error. Nordic (32), Heather Blend (32), Slate (24) remain on AI path.
const NEUTRAL_CHROMA_MAX = 20
// AI attempt cap so classical result is never held hostage by a slow model
const AI_TIMEOUT_MS = 55_000

interface SkuRow { id: string; name: string; texture_prompt: string; hex_preview: string; hex_granule_2?: string | null; hex_granule_3?: string | null }

function chipChroma(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return Math.max(r, g, b) - Math.min(r, g, b)
}
interface RenderResult {
  skuId: string; renderUrl: string | null; skuName: string
  hexPreview: string; engine: 'ai' | 'classical' | 'failed'; error?: string
  // True when the chip is perceptually so close to the existing roof that the render
  // looks near-identical (e.g. Charcoal on an already-charcoal roof). Not a defect —
  // the maths is right — but the user needs telling, or they conclude nothing happened.
  lowContrast?: boolean
}

// Mean RGB of the roof pixels in the ORIGINAL photo. Computed once per session.
// RGB, not luminance: a warm brown and a cool grey can share a luminance value while
// looking completely different on a house. Luminance-only flagged Weathered Wood
// (chipLum 87 vs roofLum 92) as "no visible change" when it is obviously changed.
async function roofMeanRgb(prep: PreparedImages): Promise<{ r: number; g: number; b: number }> {
  const { width: W, height: H } = prep
  const rgb     = await sharp(prep.photo).removeAlpha().raw().toBuffer()   // 3ch
  const maskRaw = await sharp(prep.maskAligned).extractChannel(0).raw().toBuffer()
  let sr = 0, sg = 0, sb = 0, count = 0
  for (let i = 0; i < W * H; i++) {
    if (maskRaw[i] > 128) { sr += rgb[i * 3]; sg += rgb[i * 3 + 1]; sb += rgb[i * 3 + 2]; count++ }
  }
  if (count === 0) return { r: 128, g: 128, b: 128 }
  return { r: sr / count, g: sg / count, b: sb / count }
}

// Per-pixel L* over the roof plus its mean. Computed ONCE per request and shared across every
// SKU: the legacy code recomputed roofMeanLum inside classicalRecolor on every call, which at a
// 10-SKU battery run meant ten full decodes of the same photo for an identical answer.
//
// L* is used rather than sharp's greyscale(): greyscale gives Rec.709 luma on gamma-encoded
// values, which is not perceptually uniform. Shading that rides on luma compresses differently
// in shadow than in highlight; shading that rides on L* does not.
interface RoofLuminance { srcL: Float32Array; roofMeanL: number }

async function computeRoofL(prep: PreparedImages): Promise<RoofLuminance> {
  const { width: W, height: H } = prep
  const rgb     = await sharp(prep.photo).removeAlpha().raw().toBuffer()
  const maskRaw = await sharp(prep.maskAligned).extractChannel(0).raw().toBuffer()

  const srcL = new Float32Array(W * H)
  let sum = 0, count = 0
  for (let i = 0; i < W * H; i++) {
    if (maskRaw[i] <= 128) continue
    const L = rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])[0]
    srcL[i] = L
    sum += L; count++
  }
  return { srcL, roofMeanL: count > 0 ? sum / count : 50 }
}

// Redmean colour distance — cheap perceptual approximation, far better than raw RGB
// euclidean and good enough to answer "would a homeowner see a difference?".
// Range roughly 0–765.
function redmeanDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const rmean = (a.r + b.r) / 2
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b
  return Math.sqrt(
    (2 + rmean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rmean) / 256) * db * db
  )
}

// Below this perceptual distance the render reads as "nothing changed".
// Calibrated against observed cases:
//   Charcoal on a dark charcoal roof  → ~19  (flag — user reported it looked unchanged)
//   Weathered Wood on a grey roof     → ~62  (no flag — clearly different hue)
//   Charcoal on a light grey roof     → ~94  (no flag)
const LOW_CONTRAST_DISTANCE = 45

// ── Shared image prep ─────────────────────────────────────────────────────────

interface PreparedImages {
  photo: Buffer            // original, JPEG
  width: number
  height: number
  maskAligned: Buffer      // single-channel mask resized to photo dims, feathered
  maskInverted: Buffer     // non-roof = white (for similarity region)
}

async function prepareImages(photoUrl: string, maskUrl: string): Promise<PreparedImages> {
  const [photoRes, maskRes] = await Promise.all([fetch(photoUrl), fetch(maskUrl)])
  const photoRaw = Buffer.from(await photoRes.arrayBuffer())
  const maskRaw  = Buffer.from(await maskRes.arrayBuffer())

  const photo = await sharp(photoRaw).jpeg({ quality: 92 }).toBuffer()
  const meta  = await sharp(photo).metadata()
  const width  = meta.width  ?? 800
  const height = meta.height ?? 600

  // Mask → single channel, photo dims, slight blur = feathered edges (maskDilation equivalent)
  // Explicit single-channel raw output so downstream indexing is unambiguous
  const maskAligned = await sharp(maskRaw)
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .blur(1.2)
    .extractChannel(0)
    .toColourspace('b-w')
    .png()
    .toBuffer()

  const maskInverted = await sharp(maskAligned).negate().png().toBuffer()

  return { photo, width, height, maskAligned, maskInverted }
}

// ── 1. Classical renderer — guaranteed floor ─────────────────────────────────

async function classicalRecolor(
  prep: PreparedImages,
  sku: SkuRow,
  roofL: RoofLuminance,
  mode: RenderEngineMode,
): Promise<Buffer> {
  const hex = sku.hex_preview
  // Multiply-tint from raw luminance — preserves texture, shadows, ridge lines.
  // All raw-buffer explicit: verified pixel-exact (original outside mask, tint inside).
  const { width: W, height: H } = prep
  const lum = await sharp(prep.photo).greyscale().raw().toBuffer()          // 1ch luminance
  const maskRaw = await sharp(prep.maskAligned).extractChannel(0).raw().toBuffer()  // force 1ch

  const parseHex = (x: string): [number, number, number] => {
    const s = x.replace('#', '')
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  }
  // GRANULE PALETTE — blended products (Barkwood, Heather Blend, Pristine Heather,
  // Driftwood, Weathered Wood) are a MIX of granule colours. Rendering them from one hex
  // is faithful to the hex and wrong for the product: Barkwood came out olive, Heather
  // Blend pink. Solid SKUs have no extra tones and render exactly as before.
  const palette: Array<[number, number, number]> = [parseHex(hex)]
  if (sku.hex_granule_2) palette.push(parseHex(sku.hex_granule_2))
  if (sku.hex_granule_3) palette.push(parseHex(sku.hex_granule_3))
  const isBlend = palette.length > 1
  const [tr, tg, tb] = palette[0]

  // Roof mean luminance — normalize so mid-tone roof pixels land EXACTLY on the
  // target swatch colour; shadows render darker, highlights lighter.
  let lumSum = 0, lumCount = 0
  for (let i = 0; i < W * H; i++) {
    if (maskRaw[i] > 128) { lumSum += lum[i]; lumCount++ }
  }
  const roofMeanLum = lumCount > 0 ? lumSum / lumCount : 128

  // ADDITIVE luminance shading: mid-tone roof = exactly the chip hex for every SKU;
  // shadows/highlights shift along the same hue. Replaces multiplicative tint, whose
  // chroma amplification turned light SKUs pastel on sunlit planes (Heather candy-lilac).
  const K = 0.55  // shading contrast

  // GRANULE JITTER — real architectural shingles are a blended granule matrix, not a
  // uniform sheet. Without this the classical path reads as "a flat sticker" (reviewer
  // wording).
  //
  // Per-pixel hash (divisor was 3 = 3x3px cells). The 3-pixel cell was producing
  // large contiguous same-chip blocks on multi-granule blend SKUs (Atlantic Blue,
  // Estate Gray, Heather Blend) because all pixels in a cell share the same random
  // value, and adjacent same-chip cells merged visually into camouflage patches.
  // Per-pixel eliminates the cell structure entirely — each pixel is independently
  // hashed. The averaging effect of the cell no longer softens the jitter field, so
  // LAB_LUM_JITTER is raised 3.0→4.5 and LAB_AB_JITTER 2.0→2.8 to compensate.
  const LUM_JITTER = 9   // ± luminance (legacy hybrid path, unchanged)
  const HUE_JITTER = 4   // ± per-channel (legacy hybrid path, unchanged)
  const cellNoise = (x: number, y: number, salt: number) => {
    let h = x * 73856093 ^ y * 19349663 ^ salt * 83492791
    h = (h ^ (h >>> 13)) >>> 0
    return ((h % 2001) / 1000) - 1   // -1 .. +1
  }

  // Chip palette in Lab, and the travel-scaled shading factor. Both are constant for the whole
  // SKU, so they are hoisted out of the pixel loop.
  const labChips: Array<[number, number, number]> = palette.map(([pr, pg, pb]) => rgbToLab(pr, pg, pb))
  const kEff = mode === 'lab' ? adaptiveK(labChips[0][0], roofL.roofMeanL, K_BASE) : K
  if (mode === 'lab') {
    console.log(`[render] ${sku.name}: engine=lab chipL*=${labChips[0][0].toFixed(1)} roofMeanL*=${roofL.roofMeanL.toFixed(1)} adaptiveK=${kEff.toFixed(3)}`)
  }

  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    if (maskRaw[i] === 0) { rgba[i * 4 + 3] = 0; continue }   // skip work outside the roof
    const x = i % W, y = (i / W) | 0
    const shade  = (lum[i] - roofMeanLum) * K
    const grain  = cellNoise(x, y, 1) * LUM_JITTER
    // Blend SKUs: each 3x3 cell draws one granule tone from the palette, so the surface
    // reads as a granule matrix rather than a uniform sheet.
    const [br, bg, bb] = isBlend
      ? palette[Math.floor(((cellNoise(x, y, 5) + 1) / 2) * palette.length) % palette.length]
      : palette[0]
    if (mode === 'lab') {
      // Shading rides on L*, hue/chroma come from the chip, chroma tapers at the lightness
      // extremes, out-of-gamut results reduce chroma at constant hue instead of clipping.
      const [cl, ca, cb] = labChips[
        isBlend ? Math.floor(((cellNoise(x, y, 5) + 1) / 2) * labChips.length) % labChips.length : 0
      ]
      const planeDrift = PLANE_DRIFT_AMP * (
        Math.sin(2 * Math.PI * x * PLANE_DRIFT_FREQ_X) +
        Math.sin(2 * Math.PI * y * PLANE_DRIFT_FREQ_Y)
      ) / 2   // average the two waves so peak stays within ±AMP
      const [lr, lg, lb] = labRecolorPixel({
        srcL: roofL.srcL[i],
        roofMeanL: roofL.roofMeanL,
        chipL: cl, chipA: ca, chipB: cb,
        k: kEff,
        lumJitter: cellNoise(x, y, 1) * LAB_LUM_JITTER + planeDrift,
        aJitter:   cellNoise(x, y, 2) * LAB_AB_JITTER,
        bJitter:   cellNoise(x, y, 3) * LAB_AB_JITTER,
      })
      rgba[i * 4] = lr; rgba[i * 4 + 1] = lg; rgba[i * 4 + 2] = lb
      rgba[i * 4 + 3] = maskRaw[i]
      continue
    }

    const hueR   = cellNoise(x, y, 2) * HUE_JITTER
    const hueG   = cellNoise(x, y, 3) * HUE_JITTER
    const hueB   = cellNoise(x, y, 4) * HUE_JITTER
    rgba[i * 4]     = Math.max(0, Math.min(255, Math.round(br + shade + grain + hueR)))
    rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(bg + shade + grain + hueG)))
    rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(bb + shade + grain + hueB)))
    rgba[i * 4 + 3] = maskRaw[i]             // feathered mask = alpha → soft edges
  }

  const layer = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()

  return sharp(prep.photo)
    .composite([{ input: layer, blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

// ── 2. AI attempt ─────────────────────────────────────────────────────────────

async function aiAttempt(prep: PreparedImages, sku: SkuRow): Promise<Buffer | null> {
  const prompt = [
    `Re-shingle the roof of this house with ${sku.texture_prompt} (target colour ${sku.hex_preview}).`,
    `Apply a realistic shingle texture that clearly shows the new colour, following the existing roof geometry, pitch, ridges, and lighting direction.`,
    `Maintain the original camera angle, architecture, and all non-roof elements — sky, walls, windows, landscaping, driveway — consistent with the source photograph.`,
    `Use the exact muted manufacturer colour specified — do not oversaturate, brighten, or stylise the shingles.`,
    `Output one photorealistic edited photograph.`,
  ].join('\n')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    const res = await fetch(GEMINI_IMG_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: prep.photo.toString('base64') } },
          ],
        }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.35 },
      }),
    })
    if (!res.ok) {
      console.warn(`[render/ai] ${sku.name}: Gemini ${res.status}`)
      return null
    }
    const data = await res.json()
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)
    if (!imgPart?.inlineData?.data) return null

    // Normalise AI output to original dimensions (required for gate + composite)
    return sharp(Buffer.from(imgPart.inlineData.data, 'base64'))
      .resize(prep.width, prep.height, { fit: 'fill' })
      .jpeg({ quality: 92 })
      .toBuffer()
  } catch (e) {
    console.warn(`[render/ai] ${sku.name}:`, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── 3. Similarity gate — regional MAE ────────────────────────────────────────

async function regionMae(prep: PreparedImages, aiRender: Buffer, region: 'roof' | 'nonroof'): Promise<number> {
  const S = 64
  const src = region === 'roof' ? prep.maskAligned : prep.maskInverted
  const smallMask = await sharp(src).resize(S, S, { fit: 'fill' }).extractChannel(0).raw().toBuffer()

  const greyAt = async (img: Buffer) =>
    sharp(img).resize(S, S, { fit: 'fill' }).greyscale().raw().toBuffer()

  const [a, b] = await Promise.all([greyAt(prep.photo), greyAt(aiRender)])
  let sum = 0, count = 0
  for (let i = 0; i < S * S; i++) {
    if (smallMask[i] > 128) { sum += Math.abs(a[i] - b[i]); count++ }
  }
  return count > 0 ? sum / count : (region === 'roof' ? 0 : 255)
}

// ── 4. Pixel guarantee — original outside mask, AI inside ────────────────────

async function pixelGuaranteeComposite(prep: PreparedImages, aiRender: Buffer): Promise<Buffer> {
  const { width: W, height: H } = prep
  const aiRgb   = await sharp(aiRender).removeAlpha().raw().toBuffer()   // 3ch AI pixels
  const maskRaw = await sharp(prep.maskAligned).extractChannel(0).raw().toBuffer()  // force 1ch

  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4]     = aiRgb[i * 3]
    rgba[i * 4 + 1] = aiRgb[i * 3 + 1]
    rgba[i * 4 + 2] = aiRgb[i * 3 + 2]
    rgba[i * 4 + 3] = maskRaw[i]   // AI pixels only inside roof mask
  }

  const layer = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()

  return sharp(prep.photo)
    .composite([{ input: layer, blend: 'over' }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

// ── Render one SKU through the hybrid pipeline ───────────────────────────────

async function renderOneSku(
  sessionId: string,
  prep: PreparedImages,
  sku: SkuRow,
  sb: ReturnType<typeof getSupabaseAdmin>,
  roofRgb: { r: number; g: number; b: number },
  roofL: RoofLuminance,
  mode: RenderEngineMode,
): Promise<RenderResult> {
  const renderId = crypto.randomUUID()
  try {
    await sb.from('visualizer_renders').insert({
      id: renderId, session_id: sessionId, sku_id: sku.id,
      status: 'processing', gemini_model: mode === 'lab' ? 'lab-v1' : 'hybrid-v1',
    })

    // Classical is the floor. AI is attempted only for chromatic chips — for neutral
    // greys/blacks the classical result is exact and AI can only add hue drift.
    // In lab mode the classical engine handles every chip, chromatic included — that is the
    // entire point of the rewrite, so the AI path is never entered and NEUTRAL_CHROMA_MAX
    // stops being load-bearing. In hybrid mode the legacy routing applies.
    const chroma = chipChroma(sku.hex_preview)
    const tryAi  = mode === 'hybrid' && chroma > NEUTRAL_CHROMA_MAX
    if (mode === 'hybrid' && !tryAi) console.log(`[render] ${sku.name}: chroma=${chroma} → neutral chip, classical only (AI skipped)`)

    const [classical, ai] = await Promise.all([
      classicalRecolor(prep, sku, roofL, mode),
      tryAi ? aiAttempt(prep, sku) : Promise.resolve(null),
    ])

    let finalBuffer = classical
    let engine: 'ai' | 'classical' = 'classical'

    if (ai) {
      const [nonRoof, roof] = await Promise.all([
        regionMae(prep, ai, 'nonroof'),
        regionMae(prep, ai, 'roof'),
      ])
      const scenePreserved = nonRoof <= NONROOF_MAE_MAX
      // Light SKUs need a higher roofMAE bar — additive classical is more accurate for pastels
      const hx = sku.hex_preview.replace('#', '')
      const chipLum = (parseInt(hx.slice(0,2),16) + parseInt(hx.slice(2,4),16) + parseInt(hx.slice(4,6),16)) / 3
      // Blend SKUs now render correctly in classical; require a clearly better AI result
      const isBlendSku = !!(sku.hex_granule_2 || sku.hex_granule_3)
      const roofFloor = chipLum > 160 ? 20 : isBlendSku ? 16 : ROOF_MAE_MIN
      const roofChanged    = roof >= roofFloor
      const serveAi = scenePreserved && roofChanged
      console.log(`[render] ${sku.name}: nonRoofMAE=${nonRoof.toFixed(1)} roofMAE=${roof.toFixed(1)} roofFloor=${roofFloor} chipLum=${chipLum.toFixed(0)} → engine=${serveAi ? 'ai' : 'classical'}`)
      if (serveAi) {
        finalBuffer = await pixelGuaranteeComposite(prep, ai)
        engine = 'ai'
      }
    }

    const renderKey = `visualizer/renders/${sessionId}/${sku.id}.jpg`
    const renderUrl = await uploadToR2(renderKey, finalBuffer, 'image/jpeg')

    await sb.from('visualizer_renders').update({
      render_r2_key: renderKey, render_url: renderUrl,
      status: 'done', gemini_model: engine === 'ai' ? GEMINI_IMG_MODEL : (mode === 'lab' ? 'classical-lab-v1' : 'classical-v1'),
    }).eq('id', renderId)

    // Low-contrast check — perceptual distance between the chip and the existing roof.
    const chipHx = sku.hex_preview.replace('#', '')
    const chipRgb = {
      r: parseInt(chipHx.slice(0, 2), 16),
      g: parseInt(chipHx.slice(2, 4), 16),
      b: parseInt(chipHx.slice(4, 6), 16),
    }
    const dist = redmeanDistance(chipRgb, roofRgb)
    const lowContrast = dist < LOW_CONTRAST_DISTANCE
    console.log(`[render] ${sku.name}: colourDist=${dist.toFixed(0)} (roof rgb ${roofRgb.r.toFixed(0)},${roofRgb.g.toFixed(0)},${roofRgb.b.toFixed(0)})${lowContrast ? ' → lowContrast' : ''}`)

    return { skuId: sku.id, renderUrl, skuName: sku.name, hexPreview: sku.hex_preview, engine, lowContrast }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Render failed'
    console.error(`[render] ${sku.name}:`, msg)
    await sb.from('visualizer_renders').update({ status: 'failed', error: msg }).eq('id', renderId)
    return { skuId: sku.id, renderUrl: null, skuName: sku.name, hexPreview: sku.hex_preview, engine: 'failed', error: msg }
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { sessionId, skuIds, engine: engineOverride } = await req.json()
    const mode: RenderEngineMode = engineOverride === 'hybrid' ? 'hybrid'
      : engineOverride === 'lab' ? 'lab'
      : DEFAULT_ENGINE
    if (!sessionId || !Array.isArray(skuIds) || skuIds.length === 0) {
      return NextResponse.json({ error: 'sessionId and skuIds required' }, { status: 400 })
    }
    if (skuIds.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 SKUs per render call' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    const { data: session, error: sessErr } = await sb
      .from('visualizer_sessions')
      .select('id, photo_public_url, mask_public_url, mask_status, renders_before_gate, pro_id')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.mask_status !== 'done') return NextResponse.json({ error: 'Mask not ready yet' }, { status: 409 })

    const isPro = !!session.pro_id
    const used  = session.renders_before_gate ?? 0
    if (!isPro && used >= 3) {
      return NextResponse.json({ gate: true, message: 'Sign up to see more renders' }, { status: 402 })
    }

    const { data: skus, error: skuErr } = await sb
      .from('viz_skus')
      .select('id, name, texture_prompt, hex_preview, hex_granule_2, hex_granule_3')
      .in('id', skuIds)

    if (skuErr || !skus?.length) return NextResponse.json({ error: 'SKUs not found' }, { status: 404 })

    // Prepare shared images ONCE (photo fetch, mask alignment, inversion)
    const prep = await prepareImages(session.photo_public_url, session.mask_public_url!)

    // Existing roof's mean colour — computed once, reused for every SKU's low-contrast
    // check so we can warn when a chip barely differs from the current roof.
    const roofRgb = await roofMeanRgb(prep)

    // Per-pixel L* and the roof mean — one pass, shared by every SKU in this request.
    const roofL = await computeRoofL(prep)
    console.log(`[render] session=${sessionId} engine=${mode} skus=${skus.length} roofMeanL*=${roofL.roofMeanL.toFixed(1)}`)

    const renders = await Promise.all(
      skus.map(sku => renderOneSku(session.id, prep, sku as SkuRow, sb, roofRgb, roofL, mode))
    )

    const newCount = used + skus.length
    const gateUpdate: Record<string, unknown> = {
      renders_before_gate: newCount,
      updated_at: new Date().toISOString(),
    }
    if (!isPro && newCount >= 3) gateUpdate.gate_shown_at = new Date().toISOString()
    await sb.from('visualizer_sessions').update(gateUpdate).eq('id', sessionId)

    return NextResponse.json({ renders })

  } catch (err: unknown) {
    console.error('[visualizer/render]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Render failed' },
      { status: 500 }
    )
  }
}
