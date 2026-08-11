// POST /api/roof-visualizer/refine-mask
// Body: { sessionId, eraseMaskB64 }
// Takes the existing confirmed mask for this session, zeros out pixels covered by
// the erase layer, re-uploads and returns the new mask URL.
// This is Option A "post-confirm touchup" — full-resolution editing after the
// SAM2 + morphology pipeline, giving much finer edge control than the grid-resolution
// erase brush on the confirm screen.

import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { sessionId, eraseMaskB64 } = await req.json()
    if (!sessionId || !eraseMaskB64) {
      return NextResponse.json({ error: 'sessionId and eraseMaskB64 required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Fetch the current confirmed mask URL
    const { data: session, error: sessErr } = await sb
      .from('visualizer_sessions')
      .select('mask_public_url, mask_r2_key')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session?.mask_public_url) {
      return NextResponse.json({ error: 'Session mask not found' }, { status: 404 })
    }

    // Fetch the current mask PNG through our own download proxy (CORS-safe)
    const proxyUrl = new URL('/api/roof-visualizer/download', req.url)
    proxyUrl.searchParams.set('url', session.mask_public_url)
    proxyUrl.searchParams.set('name', 'mask.png')
    const maskRes = await fetch(proxyUrl.toString())
    if (!maskRes.ok) return NextResponse.json({ error: 'Could not fetch mask' }, { status: 502 })
    const maskBuf = Buffer.from(await maskRes.arrayBuffer())

    // Get mask dimensions
    const { width: W, height: H } = await sharp(maskBuf).metadata()
    if (!W || !H) return NextResponse.json({ error: 'Invalid mask dimensions' }, { status: 422 })

    // Decode the erase layer sent from the client
    // Client sends a PNG where white pixels = erase, black = keep
    const eraseRaw = await sharp(Buffer.from(eraseMaskB64, 'base64'))
      .resize(W, H, { fit: 'fill' })
      .greyscale().extractChannel(0).raw().toBuffer()

    // Load the existing mask as raw single-channel
    const maskRaw = await sharp(maskBuf)
      .greyscale().extractChannel(0).raw().toBuffer()

    // Zero out erased pixels
    let erased = 0
    const refined = Buffer.from(maskRaw)
    for (let i = 0; i < W * H; i++) {
      if (eraseRaw[i] > 128 && refined[i] > 128) {
        refined[i] = 0
        erased++
      }
    }
    console.log(`[refine-mask] ${sessionId}: erased ${erased}px of ${W * H} (${(erased / W / H * 100).toFixed(1)}%)`)

    // Rebuild PNG and upload to R2, replacing the original mask key
    const refinedPng = await sharp(refined, { raw: { width: W, height: H, channels: 1 } })
      .png().toBuffer()

    const maskKey = session.mask_r2_key
    const maskUrl = await uploadToR2(maskKey, refinedPng, 'image/png')

    // Update the session's mask URL
    await sb.from('visualizer_sessions')
      .update({ mask_public_url: maskUrl, updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return NextResponse.json({ maskUrl })
  } catch (err) {
    console.error('[refine-mask]', err)
    return NextResponse.json({ error: 'Refinement failed' }, { status: 500 })
  }
}
