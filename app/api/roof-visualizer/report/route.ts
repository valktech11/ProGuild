// GET /api/roof-visualizer/report?sessionId=...&proId=...
// Generates a branded 2-page Roof Visualization Report PDF for logged-in pros.
// Requires the session to be linked to the requesting pro (pro_id must match).
// Anonymous sessions return 403 — the report is a Pro feature only.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  const proId     = searchParams.get('proId')

  if (!sessionId || !proId) {
    return NextResponse.json({ error: 'sessionId and proId required' }, { status: 400 })
  }

  // Auth gate — must be a valid pro session
  const auth = await requirePro(req, proId)
  if (auth.error) return auth.error

  const sb = getSupabaseAdmin()

  // Fetch session — verify it belongs to this pro
  const { data: session, error: sessErr } = await sb
    .from('visualizer_sessions')
    .select(`
      id, pro_id,
      visualizer_renders (
        render_url, status, sku_id,
        viz_skus ( name, hex_preview, viz_product_lines ( viz_manufacturers ( name ) ) )
      ),
      visualizer_shares ( chosen_sku_id )
    `)
    .eq('id', sessionId)
    .eq('pro_id', proId)
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: 'Session not found or not yours' }, { status: 404 })
  }

  // Fetch pro profile for branding
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, city, state, phone')
    .eq('id', proId)
    .single()

  // Resolve chosen SKU (from share if homeowner picked, otherwise undefined)
  const chosenSkuId = (session.visualizer_shares as any)?.[0]?.chosen_sku_id ?? null

  const renders = ((session.visualizer_renders ?? []) as any[])
    .filter((r: any) => r.status === 'done' && r.render_url)
    .map((r: any) => ({
      renderUrl:    r.render_url as string,
      skuName:      (r.viz_skus?.name ?? '') as string,
      manufacturer: (r.viz_skus?.viz_product_lines?.viz_manufacturers?.name ?? '') as string,
      hexPreview:   (r.viz_skus?.hex_preview ?? '#888888') as string,
      isChosen:     chosenSkuId ? r.sku_id === chosenSkuId : false,
    }))

  if (renders.length === 0) {
    return NextResponse.json({ error: 'No completed renders found for this session' }, { status: 404 })
  }

  const reportData = {
    proName:     pro?.full_name ?? '',
    proPhone:    pro?.phone     ?? undefined,
    proCity:     pro?.city      ?? undefined,
    proState:    pro?.state     ?? undefined,
    renders,
    generatedAt: new Date().toISOString(),
  }

  try {
    const ReactPDF = await import('@react-pdf/renderer')
    const React    = await import('react')
    const { VisualizerReportPDF } = await import('@/components/visualizer/VisualizerReportPDF')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await ReactPDF.renderToBuffer(
      React.createElement(VisualizerReportPDF, { data: reportData }) as any
    )

    const filename = `ProGuild-Roof-Report-${new Date().toISOString().slice(0, 10)}.pdf`
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'private, no-cache',
      },
    })
  } catch (err) {
    console.error('[visualizer/report]', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
