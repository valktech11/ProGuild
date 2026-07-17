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
  const blurred = await sharp(mask1ch, { raw: { width: w, height: h, channels: 1 } })
    .blur(sigma).raw().toBuffer()
  const out = Buffer.alloc(w * h)
  for (let i = 0; i < w * h; i++) out[i] = blurred[i] > threshold ? 255 : 0
  return out
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, selectedIndices, tapCount, msToConfirm } = await req.json()
    if (!sessionId || !Array.isArray(selectedIndices) || selectedIndices.length === 0) {
      return NextResponse.json({ error: 'sessionId and selectedIndices required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { data: session, error: sessErr } = await sb
      .from('visualizer_sessions')
      .select('id, mask_status, selection_meta')
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
    const chosen = new Set((selectedIndices as number[]).filter(i => valid.has(i)))
    if (chosen.size === 0) return NextResponse.json({ error: 'No valid indices selected' }, { status: 400 })

    // Load full-res index grid and union chosen indices into a binary mask
    const gridRes = await fetch(getR2PublicUrl(meta.grid_full_key))
    if (!gridRes.ok) throw new Error(`Grid fetch failed ${gridRes.status}`)
    const grid = await sharp(Buffer.from(await gridRes.arrayBuffer()))
      .extractChannel(0).raw().toBuffer()

    let mask: Buffer = Buffer.alloc(W * H)
    for (let i = 0; i < W * H; i++) {
      if (chosen.has(grid[i])) mask[i] = 255
    }

    // Morphological closing with net +1px: dilate ~2px → erode ~1px, then light feather
    mask = await morph(mask, W, H, 1.2, 10)    // dilate ≈2px (fills gaps between planes)
    mask = await morph(mask, W, H, 0.8, 235)   // erode ≈1px (pulls edge back in)
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
