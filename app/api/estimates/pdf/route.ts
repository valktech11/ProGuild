import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import ReactPDF from '@react-pdf/renderer'
import { EstimatePDF } from '@/components/estimate/EstimatePDF'
import React from 'react'

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

  // Fetch pro info for PDF header
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
    const stream = await ReactPDF.renderToStream(
      React.createElement(EstimatePDF, { estimate: pdfData })
    )

    // Collect stream into buffer
    const chunks: Buffer[] = []
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const buffer = Buffer.concat(chunks)

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
