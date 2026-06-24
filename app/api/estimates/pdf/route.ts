import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id     = searchParams.get('id')
  const pro_id = searchParams.get('pro_id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const query = sb.from('estimates').select('*, items:estimate_items(*)').eq('id', id)
  // C6 FIX: if pro_id provided, verify ownership
  if (pro_id) query.eq('pro_id', pro_id)

  const { data: estimate, error } = await query.single()

  if (error || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  const { data: pro } = await sb
    .from('pros')
    .select('full_name, trade_slug, city, state, phone')
    .eq('id', estimate.pro_id)
    .single()

  // Fetch roofing_estimate_data — estimate_type, tiered_data, scope_of_work etc live here
  const { data: roofingEst } = await sb
    .from('roofing_estimate_data')
    .select('estimate_type, tiered_data, scope_of_work, payment_milestones, property_address, square_count, pitch, waste_pct')
    .eq('estimate_id', id)
    .maybeSingle()

  const pdfData = (() => {
    // Standard estimates: derive totals from line items so the PDF never shows a
    // stale stored total. Same source-of-truth rule as the public approve page + email.
    const estType = roofingEst?.estimate_type ?? 'standard'
    let { subtotal, tax_amount, total } = estimate as any
    if (estType !== 'tiered' && Array.isArray(estimate.items) && estimate.items.length > 0) {
      const itemsSum = estimate.items.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
      const rate     = Number((estimate as any).tax_rate) || 0
      subtotal   = itemsSum
      tax_amount = Math.round(itemsSum * (rate / 100) * 100) / 100
      total      = subtotal + tax_amount
    }
    return {
    ...estimate,
    subtotal, tax_amount, total,  // override with line-item-derived values
    items:              estimate.items ?? [],
    // Roofing-specific fields from roofing_estimate_data
    estimate_type:      roofingEst?.estimate_type      ?? 'standard',
    tiered_data:        roofingEst?.tiered_data        ?? null,
    scope_of_work:      roofingEst?.scope_of_work      ?? null,
    payment_milestones: roofingEst?.payment_milestones ?? null,
    property_address:   roofingEst?.property_address   ?? null,
    square_count:       roofingEst?.square_count       ?? null,
    pitch:              roofingEst?.pitch              ?? null,
    waste_pct:          roofingEst?.waste_pct          ?? null,
    // Pro info
    pro_name:  pro?.full_name  ?? '',
    pro_trade: pro?.trade_slug ?? '',
    pro_city:  pro?.city       ?? '',
    pro_state: pro?.state      ?? '',
    pro_phone: pro?.phone      ?? '',
  }
  })()

  try {
    // Dynamic import avoids SSR issues with canvas/pdf renderer
    const ReactPDF = await import('@react-pdf/renderer')
    const React = await import('react')
    const { EstimateDocumentPDF } = await import('@/components/estimate/EstimatePDF')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await ReactPDF.renderToBuffer(
      React.createElement(EstimateDocumentPDF, { estimate: pdfData }) as any
    )

    const uint8 = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Estimate-${estimate.estimate_number}.pdf"`,
        'Content-Length': uint8.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
