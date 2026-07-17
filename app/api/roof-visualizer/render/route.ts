// POST /api/roof-visualizer/render
// Body: { sessionId, skuIds: string[] }   (1–3 SKU UUIDs)
//
// For each SKU, calls Gemini image generation (REST, same pattern as supplement route).
// All 3 SKUs run in parallel.
// Returns: { renders: [{ skuId, renderUrl, skuName, hexPreview }] }
//          OR { gate: true } when unauthenticated user exceeds free allowance.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getR2Client } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const BUCKET  = process.env.R2_BUCKET_NAME!
const R2_PUB  = process.env.R2_PUBLIC_URL!
const GEM_KEY = process.env.GEMINI_API_KEY || ''

// Use the preview image generation model — supports responseModalities IMAGE
const GEMINI_IMG_MODEL = 'gemini-2.5-flash-image-preview'
const GEMINI_IMG_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMG_MODEL}:generateContent?key=${GEM_KEY}`

// ── Helpers ──────────────────────────────────────────────────────────────────

async function uploadToR2(key: string, buffer: Buffer, contentType: string) {
  const r2 = getR2Client()
  await r2.send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          key,
    Body:         buffer,
    ContentType:  contentType,
    CacheControl: 'public, max-age=31536000',
  }))
  return `${R2_PUB}/${key}`
}

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

    const prompt = [
      `You are a photorealistic roof visualizer. You have received a house photo and a white mask image showing exactly where the roof is.`,
      `TASK: Replace ONLY the white-masked roof area with ${sku.texture_prompt}.`,
      `CRITICAL RULES (follow all of them):`,
      `- Change ONLY the pixels under the white mask. Everything outside the mask (sky, walls, windows, trees, driveway, cars) must be pixel-perfect identical to the original.`,
      `- The replacement shingles must follow the existing roof geometry — same pitch, ridges, valleys, hip lines, and shadow angles.`,
      `- Lighting, shadows, and highlights must match the original photo's sun direction exactly.`,
      `- The result must look like a professional real-estate photograph. No compositing artifacts, no blurry edges.`,
      `- Do not add text, logos, watermarks, or UI elements.`,
      `Output: a single photorealistic image of the house with the new shingles applied.`,
    ].join('\n')

    // REST call — same pattern as supplement/insurance routes
    console.log(`[render] calling Gemini for SKU ${sku.id} (${sku.name}), photoUrl length: ${photo.data.length}`)
    const gemRes = await fetch(GEMINI_IMG_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: photo.mimeType, data: photo.data } },
            { inlineData: { mimeType: 'image/png',    data: mask.data  } },
          ],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 0.2,
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

    // Run all renders in parallel
    const renders = await Promise.all(
      skus.map(sku => renderOneSku(
        session.id,
        session.photo_public_url,
        session.mask_public_url!,
        sku as SkuRow,
        sb
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
