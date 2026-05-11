// app/api/roofing/premium-report/route.ts
// POST /api/roofing/premium-report
// Orchestrates: DSM fetch → RANSAC facet polygons → diagram SVGs → premium PDF → R2
// Returns signed URL to the premium PDF
//
// STATUS: Stub — wires the flow end-to-end.
// Diagram generation (SVG wireframes) is built next session.
// For now: runs DSM, stores linear footage, returns a placeholder response.

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const GOOGLE_KEY = process.env.GOOGLE_SOLAR_API_KEY || ''
const R2_BUCKET  = process.env.R2_BUCKET_NAME || 'proguild-media-staging'

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, report_id, pro_id } = await req.json() as {
      lat: number
      lng: number
      report_id: string
      pro_id: string
    }

    if (!lat || !lng || !report_id || !pro_id) {
      return NextResponse.json({ error: 'lat, lng, report_id, pro_id required' }, { status: 400 })
    }
    if (!GOOGLE_KEY) {
      return NextResponse.json({ error: 'GOOGLE_SOLAR_API_KEY not configured' }, { status: 500 })
    }

    console.log('[premium] starting premium report for', lat, lng, 'report:', report_id)

    // ── Step 1: Run DSM analysis to get linear footage + facet polygons ──────
    const dsmRes = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://staging.proguild.ai'}/api/roofing/dsm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, report_id }),
    })
    const dsmData = await dsmRes.json() as { linear_footage?: Record<string, unknown>; error?: string }

    if (!dsmData.linear_footage) {
      console.log('[premium] DSM failed:', dsmData.error)
      // Non-fatal — continue with what we have
    }
    console.log('[premium] DSM done:', JSON.stringify(dsmData.linear_footage))

    // ── Step 2: Fetch existing report data from DB ───────────────────────────
    const sb = getSupabaseAdmin()
    const { data: reportRow, error: fetchErr } = await sb
      .from('roof_reports')
      .select('*')
      .eq('id', report_id)
      .eq('pro_id', pro_id)
      .single()

    if (fetchErr || !reportRow) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // ── Step 3: Fetch pro details ────────────────────────────────────────────
    const { data: pro } = await sb
      .from('pros')
      .select('full_name, email, phone, company_name')
      .eq('id', pro_id)
      .single()

    // ── Step 4: Build premium PDF ────────────────────────────────────────────
    // TODO (next session): generate SVG diagrams and full EagleView-equivalent PDF
    // For now: build a data-rich text PDF as placeholder that includes all linear footage
    const { buildPremiumRoofReportPDF } = await import('@/lib/roofing/premiumReportPdf')
    const { renderToBuffer } = await import('@react-pdf/renderer')

    const premiumData = {
      address: reportRow.address as string,
      proName: (pro?.full_name || pro?.company_name || 'ProGuild Pro') as string,
      proEmail: (pro?.email || '') as string,
      proPhone: (pro?.phone || '') as string,
      generatedDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      imageryDate: reportRow.imagery_date as string,
      totalSqft: reportRow.total_sqft as number,
      totalSquaresOrder: reportRow.total_squares_order as number,
      facetCount: reportRow.facet_count as number,
      dominantPitch: reportRow.dominant_pitch as string,
      wasteFactor: reportRow.waste_factor as number,
      pitchBreakdown: (reportRow.pitch_breakdown || []) as Array<{ pitch: string; area: number; squares: number; pct: number; isLowSlope: boolean }>,
      linearFootage: dsmData.linear_footage || reportRow.linear_footage || null,
      lat: lat,
      lng: lng,
    }

    const pdfBuffer = await renderToBuffer(buildPremiumRoofReportPDF(premiumData))
    console.log('[premium] PDF rendered:', pdfBuffer.byteLength, 'bytes')

    // ── Step 5: Upload to R2 ─────────────────────────────────────────────────
    const now = new Date()
    const reportId = reportRow.id as string
    const r2Key = `reports/${pro_id}/premium/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${reportId}-premium.pdf`

    const r2 = getR2Client()
    const safeAddr = (reportRow.address as string || 'report').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${safeAddr}_ProGuild_Premium.pdf"`,
    }))

    const signedUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }),
      { expiresIn: 60 * 60 * 24 * 7 }
    )

    // ── Step 6: Store premium_r2_key in DB ───────────────────────────────────
    await sb.from('roof_reports').update({ premium_r2_key: r2Key }).eq('id', report_id)

    console.log('[premium] done:', r2Key)
    return NextResponse.json({ success: true, url: signedUrl })

  } catch (e) {
    console.error('[premium] error:', e)
    return NextResponse.json({ error: 'Internal error', detail: String(e).slice(0, 300) }, { status: 500 })
  }
}
