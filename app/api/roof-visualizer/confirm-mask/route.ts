// POST /api/roof-visualizer/confirm-mask
// Body: { sessionId, selectedIndices: number[], tapCount?: number, msToConfirm?: number }
// Unions the user-confirmed candidate indices from the full-res index grid,
// applies morphological closing (dilate 2px → erode 1px, net +1px) + light feather,
// stores the final mask, and flips mask_status to 'done' so the render route proceeds.
// Also logs user corrections into selection_meta (labeled data for future auto-selection).

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2, getR2PublicUrl } from '@/lib/r2'
import sharp from 'sharp'

export const maxDuration = 60

// Approximate morphological ops via blur + threshold (no native erode/dilate in sharp)
async function morph(mask1ch: Buffer, w: number, h: number, sigma: number, threshold: number): Promise<Buffer> {
  // returns a fresh binary buffer
  // extractChannel(0) is REQUIRED: sharp's blur silently converts 1ch raw to 3ch RGB;
  // without it the threshold loop reads interleaved garbage (verified locally — this
  // exact bug shipped black masks and made every render serve the original photo)
  const blurred = await sharp(mask1ch, { raw: { width: w, height: h, channels: 1 } })
    .blur(sigma).extractChannel(0).raw().toBuffer()
  const out = Buffer.alloc(w * h)
  for (let i = 0; i < w * h; i++) out[i] = blurred[i] > threshold ? 255 : 0
  return out
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, selectedIndices, customMaskB64, tapCount, msToConfirm } = await req.json()
    const hasIndices = Array.isArray(selectedIndices) && selectedIndices.length > 0
    if (!sessionId || (!hasIndices && !customMaskB64)) {
      return NextResponse.json({ error: 'sessionId and a selection required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data: session, error: sessErr } = await sb
      .from('visualizer_sessions')
      .select('id, mask_status, selection_meta, photo_public_url')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const meta = session.selection_meta as {
      grid_full_key: string; photo_w: number; photo_h: number
      preselected?: number[]; candidates?: { i: number }[]
    } | null
    if (!meta?.grid_full_key) return NextResponse.json({ error: 'No candidates for this session' }, { status: 409 })

    const W = meta.photo_w, H = meta.photo_h
    const valid = new Set((meta.candidates ?? []).map(c => c.i))
    const chosen = new Set(((selectedIndices ?? []) as number[]).filter(i => valid.has(i)))
    if (chosen.size === 0 && !customMaskB64) return NextResponse.json({ error: 'No valid selection' }, { status: 400 })

    // Load full-res index grid and union chosen indices into a binary mask
    const gridRes = await fetch(getR2PublicUrl(meta.grid_full_key))
    if (!gridRes.ok) throw new Error(`Grid fetch failed ${gridRes.status}`)
    const grid = await sharp(Buffer.from(await gridRes.arrayBuffer()))
      .extractChannel(0).raw().toBuffer()

    let mask: Buffer = Buffer.alloc(W * H)
    for (let i = 0; i < W * H; i++) {
      if (chosen.has(grid[i])) mask[i] = 255
    }

    // Union in user-traced regions (client flood fill at grid res → upscale → threshold)
    if (customMaskB64) {
      try {
        const customRaw = await sharp(Buffer.from(customMaskB64, 'base64'))
          .resize(W, H, { fit: 'fill' })
          .greyscale().extractChannel(0).raw().toBuffer()
        let tracedPx = 0
        for (let i = 0; i < W * H; i++) {
          if (customRaw[i] > 128) { mask[i] = 255; tracedPx++ }
        }
        console.log(`[confirm-mask] traced regions merged: ${tracedPx}px`)
      } catch (e) {
        console.warn('[confirm-mask] custom mask decode failed:', e)
      }
    }

    // Vegetation veto — zero mask pixels that are green-dominant in the ORIGINAL photo.
    // Catches foliage bleed from any source: relaxed-gate SAM2 masks, Gemini picks,
    // or trace overshoot. Engine-agnostic because it shrinks the mask itself.
    try {
      const photoRes = await fetch((session as { photo_public_url?: string }).photo_public_url!)
      const rgb = await sharp(Buffer.from(await photoRes.arrayBuffer()))
        .resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer()
      let vetoed = 0
      for (let i = 0; i < W * H; i++) {
        if (mask[i] !== 255) continue
        const rr = rgb[i * 3], gg = rgb[i * 3 + 1], bb = rgb[i * 3 + 2]
        if (2 * gg - rr - bb > 40) { mask[i] = 0; vetoed++ }  // per-pixel ExG backstop for roofline bleed
      }
      console.log(`[confirm-mask] vegetation veto removed ${vetoed}px`)
    } catch (e) {
      console.warn('[confirm-mask] vegetation veto skipped:', e instanceof Error ? e.message : e)
    }

    // Morphological closing with net +1px: dilate ~2px → erode ~1px, then light feather
    const preMorph = Buffer.from(mask)
    let preCount = 0
    for (let i = 0; i < W * H; i++) if (mask[i] === 255) preCount++
    mask = await morph(mask, W, H, 1.2, 10)    // dilate ≈2px (fills gaps between planes)
    mask = await morph(mask, W, H, 0.8, 235)   // erode ≈1px (pulls edge back in)
    let postCount = 0
    for (let i = 0; i < W * H; i++) if (mask[i] === 255) postCount++
    console.log(`[confirm-mask] mask px: pre-morph=${preCount} post-morph=${postCount}`)
    if (postCount < preCount * 0.5) {
      console.error(`[confirm-mask] MORPHOLOGY DESTROYED MASK (${preCount}→${postCount}) — serving pre-morph mask`)
      mask = preMorph
    }
    const finalMask = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
      .blur(0.8)                                // feather — small, avoids "painted" look
      .png().toBuffer()

    const maskKey = `visualizer/masks/${sessionId}.png`
    const maskUrl = await uploadToR2(maskKey, finalMask, 'image/png')

    // Correction stats for the labeled dataset
    const pre = new Set(meta.preselected ?? [])
    const added   = [...chosen].filter(i => !pre.has(i))
    const removed = [...pre].filter(i => !chosen.has(i))

    await sb.from('visualizer_sessions').update({
      mask_r2_key: maskKey,
      mask_public_url: maskUrl,
      mask_status: 'done',
      selection_meta: {
        ...meta,
        user_selection: [...chosen],
        corrections: { added, removed, tapCount: tapCount ?? null, msToConfirm: msToConfirm ?? null },
      },
      updated_at: new Date().toISOString(),
    }).eq('id', sessionId)

    console.log(`[confirm-mask] ${sessionId}: selected=${[...chosen]} added=${added} removed=${removed}`)
    return NextResponse.json({ maskUrl })

  } catch (err: unknown) {
    console.error('[visualizer/confirm-mask]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Confirm failed' }, { status: 500 })
  }
}
