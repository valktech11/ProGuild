import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const { data: estimate, error } = await sb
    .from('estimates')
    .select('*, items:estimate_items(*)')
    .eq('id', id)
    .single()

  if (error || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  const { data: pro } = await sb
    .from('pros')
    .select('full_name, trade, city, state, phone')
    .eq('id', estimate.pro_id)
    .single()

  const pdfData = {
    ...estimate,
    items: estimate.items ?? [],
    pro_name: pro?.full_name ?? '',
    pro_trade: pro?.trade ?? '',
    pro_city: pro?.city ?? '',
    pro_state: pro?.state ?? '',
    pro_phone: pro?.phone ?? '',
  }

  try {
    // Dynamic import avoids SSR issues with canvas/pdf renderer
    const ReactPDF = await import('@react-pdf/renderer')
    const React = await import('react')
    const { EstimateDocumentPDF } = await import('@/components/estimate/EstimatePDF')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await ReactPDF.renderToBuffer(
      React.createElement(EstimateDocumentPDF, { estimate: pdfData }) as any
    )

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Estimate-${estimate.estimate_number}.pdf"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
