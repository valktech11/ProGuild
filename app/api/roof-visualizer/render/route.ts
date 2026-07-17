// POST /api/roof-visualizer/render
// Body: { sessionId, skuIds: string[] }   (1–3 SKU UUIDs)
//
// For each SKU, calls Gemini image generation (REST, same pattern as supplement route).
// All 3 SKUs run in parallel.
// Returns: { renders: [{ skuId, renderUrl, skuName, hexPreview }] }
//          OR { gate: true } when unauthenticated user exceeds free allowance.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import sharp from 'sharp'

export const maxDuration = 120  // 2 min timeout for 3 parallel Gemini image renders

const GEM_KEY = process.env.GEMINI_API_KEY || ''

// Use the preview image generation model — supports responseModalities IMAGE
const GEMINI_IMG_MODEL = 'gemini-2.5-flash-image'
const GEMINI_IMG_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMG_MODEL}:generateContent?key=${GEM_KEY}`

// ── Helpers ──────────────────────────────────────────────────────────────────



async function urlToBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct  = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]
  return { data: buf.toString('base64'), mimeType: ct }
}

// ── Render one SKU ────────────────────────────────────────────────────────────

interface SkuRow {
  id: string
  name: string
  texture_prompt: string
  hex_preview: string
}

interface RenderResult {
  skuId:      string
  renderUrl:  string | null
  skuName:    string
  hexPreview: string
  error?:     string
}

async function renderOneSku(
  sessionId: string,
  photoUrl:  string,
  maskUrl:   string,
  sku:       SkuRow,
  sb:        ReturnType<typeof getSupabaseAdmin>
): Promise<RenderResult> {
  const renderId = crypto.randomUUID()

  try {
    await sb.from('visualizer_renders').insert({
      id:           renderId,
      session_id:   sessionId,
      sku_id:       sku.id,
      status:       'processing',
      gemini_model: GEMINI_IMG_MODEL,
    })

    // Fetch photo + mask as base64 in parallel
    const [photo, mask] = await Promise.all([
      urlToBase64(photoUrl),
      urlToBase64(maskUrl),
    ])

    // Composite mask onto photo as semi-transparent green overlay
    // This creates ONE image where the roof is visually highlighted in green
    // Gemini understands "replace the green region" much more reliably than a separate mask image
    const photoBuffer = Buffer.from(photo.data, 'base64')
    const maskBuffer  = Buffer.from(mask.data,  'base64')

    // Get photo dimensions
    const photoMeta = await sharp(photoBuffer).metadata()
    const pw = photoMeta.width  ?? 800
    const ph = photoMeta.height ?? 600

    // Resize mask to match photo, create green overlay
    const greenMask = await sharp(maskBuffer)
      .resize(pw, ph, { fit: 'fill' })
      .ensureAlpha()
      .recomb([
        [0, 0, 0],   // R = 0
        [1, 0, 0],   // G = from R channel (mask is white = 255,255,255)
        [0, 0, 0],   // B = 0
      ])
      .toBuffer()

    // Composite: original photo + green mask at 50% opacity
    const composited = await sharp(photoBuffer)
      .composite([{ input: greenMask, blend: 'over', top: 0, left: 0 }])
      .modulate({ brightness: 1 })
      .jpeg({ quality: 90 })
      .toBuffer()

    const compositedB64 = composited.toString('base64')

    const colorHex = sku.hex_preview || '#666666'
    const prompt = [
      `You are an expert photo editor specializing in realistic roofing visualizations for the construction industry.`,
      ``,
      `In the provided image, the roof surfaces are highlighted with a GREEN overlay/tint.`,
      ``,
      `YOUR TASK: Replace ALL green-highlighted roof surfaces with ${sku.texture_prompt}.`,
      `Target color: ${colorHex} (hex). This must be a CLEARLY VISIBLE, DRAMATIC color change from the current roof.`,
      ``,
      `MANDATORY REQUIREMENTS:`,
      `1. The new shingles MUST be clearly and obviously ${sku.name} colored — not subtle, not a slight tint. A person looking at before/after must immediately notice the roof color changed.`,
      `2. Preserve the exact roof geometry: pitch, ridges, hips, valleys, rakes, and gutters must all remain structurally identical.`,
      `3. Match the original lighting direction and sun angle. Maintain all shadow gradients across the roof planes.`,
      `4. Keep ALL non-roof areas completely unchanged: sky, walls, windows, doors, driveway, garage, trees, cars — pixel-perfect preservation.`,
      `5. The final image must look like a real photograph taken on the same day, from the same angle, with only the roof material changed.`,
      `6. Remove the green overlay entirely in your output — it should not appear in the final result.`,
      ``,
      `Output: ONE photorealistic image of the house with the new ${sku.name} shingles clearly visible.`,
    ].join('\n')

    console.log(`[render] calling Gemini for SKU ${sku.id} (${sku.name}), composited: ${compositedB64.length}`)
    const gemRes = await fetch(GEMINI_IMG_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: compositedB64 } },
          ],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 0.4,
        },
      }),
    })

    if (!gemRes.ok) {
      const errText = await gemRes.text()
      console.error(`[render] Gemini error SKU ${sku.id}: ${gemRes.status} ${errText.slice(0, 400)}`)
      throw new Error(`Gemini ${gemRes.status}: ${errText.slice(0, 200)}`)
    }

    const gemData = await gemRes.json()
    console.log('[render] Gemini response candidates:', gemData?.candidates?.length,
      'parts:', gemData?.candidates?.[0]?.content?.parts?.length,
      'finishReason:', gemData?.candidates?.[0]?.finishReason)

    // Extract image part from response
    const parts = gemData?.candidates?.[0]?.content?.parts ?? []
    const imgPart = parts.find((p: { inlineData?: { mimeType?: string; data?: string } }) =>
      p.inlineData?.data
    )

    if (!imgPart?.inlineData?.data) {
      throw new Error('Gemini returned no image part')
    }

    const renderBuffer = Buffer.from(imgPart.inlineData.data, 'base64')
    const renderMime   = imgPart.inlineData.mimeType || 'image/png'
    const renderExt    = renderMime.includes('png') ? 'png' : 'jpg'
    const renderKey    = `visualizer/renders/${sessionId}/${sku.id}.${renderExt}`
    const renderUrl    = await uploadToR2(renderKey, renderBuffer, renderMime)

    await sb.from('visualizer_renders').update({
      render_r2_key: renderKey,
      render_url:    renderUrl,
      status:        'done',
    }).eq('id', renderId)

    return { skuId: sku.id, renderUrl, skuName: sku.name, hexPreview: sku.hex_preview }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Render failed'
    console.error(`[visualizer/render] SKU ${sku.id}:`, msg)
    await sb.from('visualizer_renders').update({ status: 'failed', error: msg }).eq('id', renderId)
    return { skuId: sku.id, renderUrl: null, skuName: sku.name, hexPreview: sku.hex_preview, error: msg }
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

    // Load session
    const { data: session, error: sessErr } = await sb
      .from('visualizer_sessions')
      .select('id, photo_public_url, mask_public_url, mask_status, renders_before_gate, pro_id')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.mask_status !== 'done') {
      return NextResponse.json({ error: 'Mask not ready yet' }, { status: 409 })
    }

    // Gate: unauthenticated users get 3 free renders total
    const isPro  = !!session.pro_id
    const used   = session.renders_before_gate ?? 0
    if (!isPro && used >= 3) {
      return NextResponse.json({ gate: true, message: 'Sign up to see more renders' }, { status: 402 })
    }

    // Load SKUs
    const { data: skus, error: skuErr } = await sb
      .from('viz_skus')
      .select('id, name, texture_prompt, hex_preview')
      .in('id', skuIds)

    if (skuErr || !skus?.length) {
      return NextResponse.json({ error: 'SKUs not found' }, { status: 404 })
    }

    // Stagger calls slightly to avoid Gemini rate limits
    const renders = await Promise.all(
      skus.map((sku, idx) => new Promise<ReturnType<typeof renderOneSku>>(resolve =>
        setTimeout(() => resolve(renderOneSku(
        session.id,
        session.photo_public_url,
        session.mask_public_url!,
        sku as SkuRow,
        sb
      )), idx * 1500)  // 1500ms stagger
      ))
    )

    // Increment renders_before_gate
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
