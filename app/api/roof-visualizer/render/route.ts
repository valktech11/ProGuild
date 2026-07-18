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

export const maxDuration = 120

const GEM_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_IMG_MODEL = 'gemini-3.1-flash-image'  // Nano Banana 2 — experiment behind the gate
const GEMINI_IMG_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMG_MODEL}:generateContent?key=${GEM_KEY}`

// Two-sided arbitration gate (MAE on 64px downscale, 0-255):
// (a) non-roof region must be UNCHANGED  — copies pass, regenerated scenes (40+) fail
// (b) roof region must be CHANGED       — lazy photocopies fail, real edits pass
const NONROOF_MAE_MAX = 18
const ROOF_MAE_MIN    = 12
// AI attempt cap so classical result is never held hostage by a slow model
const AI_TIMEOUT_MS = 55_000

interface SkuRow { id: string; name: string; texture_prompt: string; hex_preview: string }
interface RenderResult {
  skuId: string; renderUrl: string | null; skuName: string
  hexPreview: string; engine: 'ai' | 'classical' | 'failed'; error?: string
}

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

async function classicalRecolor(prep: PreparedImages, hex: string): Promise<Buffer> {
  // Multiply-tint from raw luminance — preserves texture, shadows, ridge lines.
  // All raw-buffer explicit: verified pixel-exact (original outside mask, tint inside).
  const { width: W, height: H } = prep
  const lum = await sharp(prep.photo).greyscale().raw().toBuffer()          // 1ch luminance
  const maskRaw = await sharp(prep.maskAligned).extractChannel(0).raw().toBuffer()  // force 1ch

  const h = hex.replace('#', '')
  const tr = parseInt(h.slice(0, 2), 16)
  const tg = parseInt(h.slice(2, 4), 16)
  const tb = parseInt(h.slice(4, 6), 16)

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
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const shade = (lum[i] - roofMeanLum) * K
    rgba[i * 4]     = Math.max(0, Math.min(255, Math.round(tr + shade)))
    rgba[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(tg + shade)))
    rgba[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(tb + shade)))
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
  sb: ReturnType<typeof getSupabaseAdmin>
): Promise<RenderResult> {
  const renderId = crypto.randomUUID()
  try {
    await sb.from('visualizer_renders').insert({
      id: renderId, session_id: sessionId, sku_id: sku.id,
      status: 'processing', gemini_model: 'hybrid-v1',
    })

    // Classical + AI race in parallel; classical is the floor
    const [classical, ai] = await Promise.all([
      classicalRecolor(prep, sku.hex_preview),
      aiAttempt(prep, sku),
    ])

    let finalBuffer = classical
    let engine: 'ai' | 'classical' = 'classical'

    if (ai) {
      const [nonRoof, roof] = await Promise.all([
        regionMae(prep, ai, 'nonroof'),
        regionMae(prep, ai, 'roof'),
      ])
      const scenePreserved = nonRoof <= NONROOF_MAE_MAX
      const roofChanged    = roof >= ROOF_MAE_MIN
      const serveAi = scenePreserved && roofChanged
      console.log(`[render] ${sku.name}: nonRoofMAE=${nonRoof.toFixed(1)} (max ${NONROOF_MAE_MAX}) roofMAE=${roof.toFixed(1)} (min ${ROOF_MAE_MIN}) → engine=${serveAi ? 'ai' : 'classical'}`)
      if (serveAi) {
        finalBuffer = await pixelGuaranteeComposite(prep, ai)
        engine = 'ai'
      }
    }

    const renderKey = `visualizer/renders/${sessionId}/${sku.id}.jpg`
    const renderUrl = await uploadToR2(renderKey, finalBuffer, 'image/jpeg')

    await sb.from('visualizer_renders').update({
      render_r2_key: renderKey, render_url: renderUrl,
      status: 'done', gemini_model: engine === 'ai' ? GEMINI_IMG_MODEL : 'classical-v1',
    }).eq('id', renderId)

    return { skuId: sku.id, renderUrl, skuName: sku.name, hexPreview: sku.hex_preview, engine }

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
    const { sessionId, skuIds } = await req.json()
    if (!sessionId || !Array.isArray(skuIds) || skuIds.length === 0) {
      return NextResponse.json({ error: 'sessionId and skuIds required' }, { status: 400 })
    }
    if (skuIds.length > 3) {
      return NextResponse.json({ error: 'Maximum 3 SKUs per render call' }, { status: 400 })
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
      .select('id, name, texture_prompt, hex_preview')
      .in('id', skuIds)

    if (skuErr || !skus?.length) return NextResponse.json({ error: 'SKUs not found' }, { status: 404 })

    // Prepare shared images ONCE (photo fetch, mask alignment, inversion)
    const prep = await prepareImages(session.photo_public_url, session.mask_public_url!)

    const renders = await Promise.all(
      skus.map(sku => renderOneSku(session.id, prep, sku as SkuRow, sb))
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
