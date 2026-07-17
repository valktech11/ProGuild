// POST /api/roof-visualizer/segment
// Body: multipart/form-data  { photo: File }
// 1. Upload original photo to R2
// 2. Call meta/sam-2 on Replicate (automatic roof detection, REST API)
// 3. Pick best mask (largest white-pixel region = roof)
// 4. Upload mask PNG to R2
// 5. Create visualizer_session row
// Returns: { sessionId, photoUrl, maskUrl }

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getR2Client } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const BUCKET          = process.env.R2_BUCKET_NAME!
const R2_PUB          = process.env.R2_PUBLIC_URL!
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN!

const SAM2_MODEL = 'meta/sam-2'
const SAM2_VERSION = 'cbd95fb76192174268b6b303aeeb7a736e8dab0cbc38177f09db79b2299da30b'

// ── Helpers ──────────────────────────────────────────────────────────────────

function r2Key(prefix: string, id: string, ext: string) {
  return `visualizer/${prefix}/${id}.${ext}`
}

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

// Call Replicate REST API — create prediction, then poll for completion
async function runSam2(imageUrl: string): Promise<{ combined_mask: string; individual_masks: string[] }> {
  const headers = {
    'Authorization': `Bearer ${REPLICATE_TOKEN}`,
    'Content-Type':  'application/json',
    'Prefer':        'wait',  // Replicate "wait" mode — blocks up to 60s, no polling needed
  }

  const createRes = await fetch(`https://api.replicate.com/v1/models/${SAM2_MODEL}/versions/${SAM2_VERSION}/predictions`, {
    method:  'POST',
    headers,
    body: JSON.stringify({
      input: {
        image:                  imageUrl,
        points_per_side:        16,    // faster; sufficient for large roof surfaces
        pred_iou_thresh:        0.85,
        stability_score_thresh: 0.92,
        use_m2m:                true,
      },
    }),
  })

  if (!createRes.ok) {
    const txt = await createRes.text()
    throw new Error(`Replicate create failed ${createRes.status}: ${txt.slice(0, 200)}`)
  }

  const prediction = await createRes.json()

  // "Prefer: wait" returns the completed prediction directly if it finishes in time.
  // If still processing, poll.
  if (prediction.status === 'succeeded') {
    return prediction.output as { combined_mask: string; individual_masks: string[] }
  }

  // Poll up to 90s
  const pollUrl = prediction.urls?.get
  if (!pollUrl) throw new Error('No poll URL from Replicate')

  for (let i = 0; i < 18; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const pollRes = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` } })
    const poll    = await pollRes.json()
    if (poll.status === 'succeeded') return poll.output
    if (poll.status === 'failed')   throw new Error(`SAM2 failed: ${poll.error}`)
  }

  throw new Error('SAM2 timed out after 90 seconds')
}

// Pick the mask with the most white pixels (largest region = roof)
async function pickBestMask(maskUrls: string[]): Promise<string> {
  if (maskUrls.length === 0) throw new Error('SAM2 returned no masks')
  if (maskUrls.length === 1) return maskUrls[0]

  const scores = await Promise.all(maskUrls.map(async (url, i) => {
    try {
      const res = await fetch(url)
      const buf = Buffer.from(await res.arrayBuffer())
      let score = 0
      for (let j = 0; j < buf.length; j++) if (buf[j] === 0xff) score++
      return { i, score }
    } catch {
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

    const photoBuffer = Buffer.from(await file.arrayBuffer())
    const ext         = file.type === 'image/png' ? 'png' : 'jpg'
    const sessionId   = crypto.randomUUID()

    // Upload original photo to R2
    const photoKey = r2Key('photos', sessionId, ext)
    const photoUrl = await uploadToR2(photoKey, photoBuffer, file.type)

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
      output = await runSam2(photoUrl)
    } catch (samErr) {
      await sb.from('visualizer_sessions').update({
        mask_status: 'failed',
        mask_error:  samErr instanceof Error ? samErr.message : 'SAM2 error',
      }).eq('id', sessionId)
      return NextResponse.json({
        error: 'Could not detect roof. Try a clear street-view photo of your home with minimal tree coverage.',
      }, { status: 422 })
    }

    if (!output?.individual_masks?.length) {
      await sb.from('visualizer_sessions').update({ mask_status: 'failed', mask_error: 'No masks returned' }).eq('id', sessionId)
      return NextResponse.json({ error: 'Could not detect roof. Try a clearer photo.' }, { status: 422 })
    }

    // Pick largest mask (= roof)
    const bestMaskUrl = await pickBestMask(output.individual_masks)

    // Download and re-upload mask to our R2
    const maskRes    = await fetch(bestMaskUrl)
    const maskBuffer = Buffer.from(await maskRes.arrayBuffer())
    const maskKey    = r2Key('masks', sessionId, 'png')
    const maskUrl    = await uploadToR2(maskKey, maskBuffer, 'image/png')

    // Update session
    await sb.from('visualizer_sessions').update({
      mask_r2_key:     maskKey,
      mask_public_url: maskUrl,
      mask_status:     'done',
      updated_at:      new Date().toISOString(),
    }).eq('id', sessionId)

    return NextResponse.json({ sessionId, photoUrl, maskUrl })

  } catch (err: unknown) {
    console.error('[visualizer/segment]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Segmentation failed' },
      { status: 500 }
    )
  }
}
