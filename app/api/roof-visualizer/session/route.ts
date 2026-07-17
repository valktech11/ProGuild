// PATCH /api/roof-visualizer/session
// Body: { sessionId, proId?, email?, action?: 'share' }
// Links a session to a pro after gate signup, or creates a share token.
// Returns: { ok: true } or { shareToken: string, shareUrl: string }

// GET /api/roof-visualizer/session?token=xxx
// Returns share page data: session + renders + chosen SKU

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://proguild.ai'

export async function PATCH(req: NextRequest) {
  try {
    const { sessionId, proId, email, action } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    const sb = getSupabaseAdmin()

    if (action === 'share') {
      // Create a share token for the homeowner page
      const { data: share, error } = await sb
        .from('visualizer_shares')
        .insert({ session_id: sessionId })
        .select('token')
        .single()

      if (error || !share) throw error || new Error('Failed to create share')

      return NextResponse.json({
        shareToken: share.token,
        shareUrl: `${BASE_URL}/r/${share.token}`,
      })
    }

    // Link session to pro after gate
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (proId) update.pro_id = proId
    if (email) update.email  = email

    const { error } = await sb
      .from('visualizer_sessions')
      .update(update)
      .eq('id', sessionId)

    if (error) throw error

    return NextResponse.json({ ok: true })

  } catch (err: unknown) {
    console.error('[visualizer/session PATCH]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

    const sb = getSupabaseAdmin()

    const { data: share, error } = await sb
      .from('visualizer_shares')
      .select(`
        token, chosen_sku_id, chosen_at,
        session_id,
        visualizer_sessions (
          photo_public_url,
          visualizer_renders (
            render_url, status,
            viz_skus ( id, name, hex_preview )
          )
        )
      `)
      .eq('token', token)
      .single()

    if (error || !share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 })
    }

    return NextResponse.json({ share })

  } catch (err: unknown) {
    console.error('[visualizer/session GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}

// POST — homeowner picks a colour
export async function POST(req: NextRequest) {
  try {
    const { token, skuId } = await req.json()
    if (!token || !skuId) return NextResponse.json({ error: 'token + skuId required' }, { status: 400 })

    const sb = getSupabaseAdmin()

    const { data: share, error: findErr } = await sb
      .from('visualizer_shares')
      .select('id, session_id, visualizer_sessions(pro_id)')
      .eq('token', token)
      .single()

    if (findErr || !share) return NextResponse.json({ error: 'Share not found' }, { status: 404 })

    await sb.from('visualizer_shares').update({
      chosen_sku_id: skuId,
      chosen_at: new Date().toISOString(),
    }).eq('id', share.id)

    // TODO: Resend notification to pro (Week 4)

    return NextResponse.json({ ok: true })

  } catch (err: unknown) {
    console.error('[visualizer/session POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 }
    )
  }
}
