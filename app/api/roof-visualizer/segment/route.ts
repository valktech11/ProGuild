// POST /api/roof-visualizer/segment
// Body: multipart/form-data  { photo: File }
// 1. Upload original photo to R2
// 2. Call meta/sam-2 on Replicate
// 3. Pick best mask (largest white-pixel region = roof)
// 4. Upload mask PNG to R2
// 5. Create visualizer_session row
// Returns: { sessionId, photoUrl, maskUrl }

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2, getR2PublicUrl } from '@/lib/r2'
import sharp from 'sharp'

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!

// Use the deployment API (no version hash) — simpler and more reliable
const REPLICATE_API = 'https://api.replicate.com/v1'

// ── Helpers ──────────────────────────────────────────────────────────────────

function r2Key(prefix: string, id: string, ext: string) {
  return `visualizer/${prefix}/${id}.${ext}`
}



// Call Replicate — create prediction then poll for completion
async function runSam2(imageUrl: string, imageBuffer?: Buffer, mimeType?: string): Promise<{ combined_mask: string; individual_masks: string[] }> {
  const authHeader = { 'Authorization': `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' }

  // Convert to JPEG — SAM2 rejects AVIF/WEBP/HEIC formats
  // sharp normalises any input format to JPEG safely
  let jpegBuffer: Buffer
  if (imageBuffer) {
    jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer()
  } else {
    const res = await fetch(imageUrl)
    jpegBuffer = await sharp(Buffer.from(await res.arrayBuffer())).jpeg({ quality: 90 }).toBuffer()
  }
  const imgInput = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`

  // Create prediction using /v1/predictions with pinned version hash
  const SAM2_VERSION = 'cbd95fb76192174268b6b303aeeb7a736e8dab0cbc38177f09db79b2299da30b'
  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method:  'POST',
    headers: authHeader,
    body: JSON.stringify({
      version: SAM2_VERSION,
      input: {
        image:                  imgInput,
        points_per_side:        16,
        pred_iou_thresh:        0.85,
        stability_score_thresh: 0.92,
        use_m2m:                true,
      },
    }),
  })

  if (!createRes.ok) {
    const txt = await createRes.text()
    throw new Error(`Replicate create failed ${createRes.status}: ${txt.slice(0, 300)}`)
  }

  const prediction = await createRes.json()
  console.log('[SAM2] prediction created:', prediction.id, 'status:', prediction.status)

  // If already done (unlikely but possible with fast models)
  if (prediction.status === 'succeeded') {
    return prediction.output as { combined_mask: string; individual_masks: string[] }
  }
  if (prediction.status === 'failed') {
    throw new Error(`SAM2 prediction failed immediately: ${prediction.error}`)
  }

  // Poll for completion — up to 120s (SAM2 cold start can be slow)
  const pollUrl = prediction.urls?.get
  if (!pollUrl) throw new Error(`No poll URL in prediction response: ${JSON.stringify(prediction)}`)

  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000))

    const pollRes = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } })
    if (!pollRes.ok) {
      console.warn(`[SAM2] poll ${i} returned ${pollRes.status}`)
      continue
    }

    const poll = await pollRes.json()
    console.log(`[SAM2] poll ${i}: status=${poll.status}`)

    if (poll.status === 'succeeded') {
      const output = poll.output as { combined_mask: string; individual_masks: string[] }
      console.log('[SAM2] succeeded, masks:', output?.individual_masks?.length ?? 0)
      return output
    }
    if (poll.status === 'failed') {
      throw new Error(`SAM2 failed: ${poll.error}`)
    }
    // still processing/starting — keep polling
  }

  throw new Error('SAM2 timed out after 120 seconds')
}

// Pick the mask with the most white pixels (largest region = roof)
async function pickBestMask(maskUrls: string[]): Promise<string> {
  if (maskUrls.length === 0) throw new Error('SAM2 returned no masks')
  if (maskUrls.length === 1) return maskUrls[0]

  // Fetch all masks in parallel and score by white-pixel count
  console.log(`[SAM2] scoring ${maskUrls.length} masks`)
  const scores = await Promise.all(maskUrls.map(async (url, i) => {
    try {
      const res = await fetch(url)
      const buf = Buffer.from(await res.arrayBuffer())
      let score = 0
      for (let j = 0; j < buf.length; j++) if (buf[j] === 0xff) score++
      console.log(`[SAM2] mask ${i}: bytes=${buf.length} whiteScore=${score} url=${url.slice(-40)}`)
      return { i, score }
    } catch (e) {
      console.error(`[SAM2] mask ${i} fetch failed:`, e)
      return { i, score: 0 }
    }
  }))

  scores.sort((a, b) => b.score - a.score)
  return maskUrls[scores[0].i]
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Abuse check — max 10 sessions/hour per IP
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

    // Parse upload
    const form = await req.formData()
    const file = form.get('photo') as File | null
    if (!file) return NextResponse.json({ error: 'photo required' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Photo must be under 10MB' }, { status: 400 })

    // Normalise to JPEG regardless of upload format (handles AVIF, WEBP, HEIC etc.)
    const rawBuffer   = Buffer.from(await file.arrayBuffer())
    const photoBuffer = await sharp(rawBuffer).jpeg({ quality: 92 }).toBuffer()
    const ext         = 'jpg'
    const sessionId   = crypto.randomUUID()

    console.log(`[segment] sessionId=${sessionId} file=${file.name} size=${file.size} type=${file.type}`)

    // Upload original photo to R2
    const photoKey = r2Key('photos', sessionId, ext)
    const photoUrl = await uploadToR2(photoKey, photoBuffer, file.type || 'image/jpeg')
    console.log(`[segment] photo uploaded: ${photoUrl}`)

    // Create session row
    await sb.from('visualizer_sessions').insert({
      id:               sessionId,
      photo_r2_key:     photoKey,
      photo_public_url: photoUrl,
      mask_status:      'processing',
      ip_address:       ip,
    })

    // Call SAM2 via Replicate
    let output: { combined_mask: string; individual_masks: string[] }
    try {
      output = await runSam2(photoUrl, photoBuffer, file.type || 'image/jpeg')
    } catch (samErr) {
      const msg = samErr instanceof Error ? samErr.message : 'SAM2 error'
      console.error('[segment] SAM2 error:', msg)
      await sb.from('visualizer_sessions').update({
        mask_status: 'failed',
        mask_error:  msg,
      }).eq('id', sessionId)
      return NextResponse.json({
        error: 'Could not detect roof. Try a clear street-view photo with the roof fully visible.',
        detail: msg,
      }, { status: 422 })
    }

    if (!output?.individual_masks?.length) {
      const msg = 'SAM2 returned no individual masks'
      console.error('[segment]', msg, 'output:', JSON.stringify(output))
      await sb.from('visualizer_sessions').update({ mask_status: 'failed', mask_error: msg }).eq('id', sessionId)
      return NextResponse.json({ error: 'Could not detect roof surfaces in this photo. Try a clearer image.' }, { status: 422 })
    }

    // Pick largest mask (= roof)
    const bestMaskUrl = await pickBestMask(output.individual_masks)
    console.log(`[segment] best mask: ${bestMaskUrl}`)

    // Download and re-upload mask to our R2
    const maskRes    = await fetch(bestMaskUrl)
    const maskBuffer = Buffer.from(await maskRes.arrayBuffer())
    const maskKey    = r2Key('masks', sessionId, 'png')
    const maskUrl    = await uploadToR2(maskKey, maskBuffer, 'image/png')
    console.log(`[segment] mask uploaded: ${maskUrl}`)

    // Compute mask coverage for confidence signal
    // White pixel ratio in the mask ≈ fraction of image that is roof
    let whitePixels = 0
    for (let j = 0; j < maskBuffer.length; j++) if (maskBuffer[j] === 0xff) whitePixels++
    const coverage = whitePixels / maskBuffer.length  // rough proxy (PNG bytes, not exact pixels, but monotonic)

    // Confidence heuristic
    let confidence: 'high' | 'medium' | 'low' = 'high'
    let confidenceNote = 'Roof detected successfully'
    if (coverage < 0.02) { confidence = 'low';    confidenceNote = 'Roof area looks small — results may be less accurate' }
    else if (coverage < 0.06) { confidence = 'medium'; confidenceNote = 'Roof detected — complex roof or partial view' }

    // Update session
    await sb.from('visualizer_sessions').update({
      mask_r2_key:     maskKey,
      mask_public_url: maskUrl,
      mask_status:     'done',
      updated_at:      new Date().toISOString(),
    }).eq('id', sessionId)

    return NextResponse.json({ sessionId, photoUrl, maskUrl, confidence, confidenceNote })

  } catch (err: unknown) {
    console.error('[visualizer/segment] unhandled:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Segmentation failed' },
      { status: 500 }
    )
  }
}
