import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/roof-visualizer/skus
// Returns the shingle SKU catalog for the mobile Roof Visualizer.
// Public endpoint — no auth required (SKU data is not sensitive).

export async function GET() {
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('viz_skus')
      .select(`
        id, slug, name, hex_preview, is_default, sort_order, swatch_url,
        viz_product_lines (
          id, slug, name,
          viz_manufacturers ( id, slug, name )
        )
      `)
      .order('sort_order')

    if (error) {
      console.error('[roof-visualizer/skus]', error.message)
      return NextResponse.json({ skus: [] })
    }

    return NextResponse.json({ skus: data ?? [] })
  } catch (err) {
    console.error('[roof-visualizer/skus]', err)
    return NextResponse.json({ skus: [] })
  }
}
