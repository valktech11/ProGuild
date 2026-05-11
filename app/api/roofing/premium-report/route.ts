// app/api/roofing/premium-report/route.ts
// POST /api/roofing/premium-report
// Reads existing linear_footage from DB (stored by /api/roofing/dsm)
// Generates Premium PDF and uploads to R2. Returns signed URL.
// DSM analysis is NOT run here — it must be run first via /api/roofing/dsm.

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { buildPremiumRoofReportPDF } from '@/lib/roofing/premiumReportPdf'
import { renderToBuffer } from '@react-pdf/renderer'

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
    const body = await req.json() as { report_id: string; pro_id: string }
    const { report_id, pro_id } = body

    console.log('[premium-pdf] starting for report:', report_id, 'pro:', pro_id)

    if (!report_id || !pro_id) {
      return NextResponse.json({ error: 'report_id and pro_id required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // ── Step 1: Fetch report row ─────────────────────────────────────────────
    const { data: reportRow, error: fetchErr } = await sb
      .from('roof_reports')
      .select('*')
      .eq('id', report_id)
      .eq('pro_id', pro_id)
      .single()

    if (fetchErr || !reportRow) {
      console.error('[premium-pdf] report not found:', fetchErr)
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    console.log('[premium-pdf] report found, linear_footage:', JSON.stringify(reportRow.linear_footage))

    // ── Step 2: Fetch pro details ────────────────────────────────────────────
    const { data: pro } = await sb
      .from('pros')
      .select('full_name, email, phone, company_name')
      .eq('id', pro_id)
      .single()

    // ── Step 3: Build premium PDF ────────────────────────────────────────────
    console.log('[premium-pdf] building PDF...')

    const premiumData = {
      address: (reportRow.address as string) || 'Unknown Address',
      proName: (pro?.full_name || pro?.company_name || 'ProGuild Pro') as string,
      proEmail: (pro?.email || '') as string,
      proPhone: (pro?.phone || '') as string,
      generatedDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      imageryDate: (reportRow.imagery_date as string) || '',
      totalSqft: (reportRow.total_sqft as number) || 0,
      totalSquaresOrder: (reportRow.total_squares_order as number) || 0,
      facetCount: (reportRow.facet_count as number) || 0,
      dominantPitch: (reportRow.dominant_pitch as string) || '6/12',
      wasteFactor: (reportRow.waste_factor as number) || 13,
      pitchBreakdown: (reportRow.pitch_breakdown || []) as Array<{ pitch: string; area: number; squares: number; pct: number; isLowSlope: boolean }>,
      linearFootage: (reportRow.linear_footage as Record<string, number>) || null,
      lat: (reportRow.lat as number) || 0,
      lng: (reportRow.lng as number) || 0,
    }

    const pdfDoc = buildPremiumRoofReportPDF(premiumData)
    const pdfBuffer = await renderToBuffer(pdfDoc)
    console.log('[premium-pdf] PDF rendered, bytes:', pdfBuffer.byteLength)

    // ── Step 4: Upload to R2 ─────────────────────────────────────────────────
    const now = new Date()
    const r2Key = `reports/${pro_id}/premium/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${report_id}-premium.pdf`
    const safeAddr = ((reportRow.address as string) || 'report').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)

    const r2 = getR2Client()
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${safeAddr}_ProGuild_Premium.pdf"`,
    }))
    console.log('[premium-pdf] uploaded to R2:', r2Key)

    const signedUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }),
      { expiresIn: 60 * 60 * 24 * 7 }
    )

    // ── Step 5: Store premium_r2_key ─────────────────────────────────────────
    await sb.from('roof_reports').update({ premium_r2_key: r2Key }).eq('id', report_id)
    console.log('[premium-pdf] done')

    return NextResponse.json({ success: true, url: signedUrl })

  } catch (e) {
    console.error('[premium-pdf] FATAL:', e)
    return NextResponse.json({
      error: 'Internal error',
      detail: String(e).slice(0, 500)
    }, { status: 500 })
  }
}
