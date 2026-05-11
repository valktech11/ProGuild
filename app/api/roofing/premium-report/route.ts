// app/api/roofing/premium-report/route.ts
// POST /api/roofing/premium-report
// Reads existing linear_footage from DB (pre-computed by /api/roofing/dsm)
// Builds and uploads premium PDF to R2. Returns signed URL.

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { buildPremiumRoofReportPDF, PremiumLinearFootage } from '@/lib/roofing/premiumReportPdf'
import { renderToBuffer } from '@react-pdf/renderer'
import { apiError, isValidUuid, getR2Client, getR2Bucket } from '@/lib/api/utils'

const SIGNED_URL_TTL = 60 * 60 * 24 * 7 // 7 days

// Stored pitch_breakdown shape (from /api/roofing/report)
interface StoredPitchRow {
  pitch: string
  sqft: number
  sq: number
  pct: number
}

// Determine if a pitch string is low slope (≤ 2/12)
function isLowSlope(pitch: string): boolean {
  const rise = parseInt(pitch.split('/')[0] ?? '0', 10)
  return rise <= 2
}

// Map stored pitch rows to PremiumPitchRow shape
function mapPitchBreakdown(stored: unknown[]) {
  return stored
    .filter((r): r is StoredPitchRow =>
      r !== null &&
      typeof r === 'object' &&
      'pitch' in r && 'sqft' in r && 'sq' in r && 'pct' in r
    )
    .map(r => ({
      pitch: r.pitch,
      area: r.sqft,
      squares: r.sq,
      pct: r.pct,
      isLowSlope: isLowSlope(r.pitch),
    }))
}

export async function POST(req: NextRequest) {
  // 1. Parse and validate
  let body: unknown
  try { body = await req.json() }
  catch { return apiError('Invalid JSON in request body', 400) }

  if (!body || typeof body !== 'object') return apiError('Request body must be a JSON object', 400)
  const { report_id, pro_id } = body as Record<string, unknown>

  if (!isValidUuid(report_id)) return apiError('report_id must be a valid UUID', 400)
  if (!isValidUuid(pro_id)) return apiError('pro_id must be a valid UUID', 400)

  const sb = getSupabaseAdmin()

  // 2. Fetch report row — ownership enforced by double eq
  const { data: report, error: reportErr } = await sb
    .from('roof_reports')
    .select('id, pro_id, address, total_sqft, total_squares_order, dominant_pitch, facet_count, waste_factor, imagery_date, pitch_breakdown, linear_footage, lat, lng')
    .eq('id', report_id)
    .eq('pro_id', pro_id)
    .single()

  if (reportErr || !report) return apiError('Report not found or access denied', 403)

  if (!report.linear_footage) {
    return apiError('Linear footage not yet computed — run DSM analysis first', 422)
  }

  // 3. Fetch pro profile
  const { data: pro } = await sb
    .from('pros')
    .select('full_name, business_name, phone_cell, email')
    .eq('id', pro_id)
    .single()

  // 4. Build PDF data with safe defaults for every nullable field
  const pitchBreakdown = mapPitchBreakdown(
    Array.isArray(report.pitch_breakdown) ? report.pitch_breakdown : []
  )

  const premiumData = {
    address: (report.address as string | null) ?? 'Unknown Address',
    proName: (pro?.full_name ?? pro?.business_name ?? 'ProGuild Pro'),
    proEmail: (pro?.email ?? ''),
    proPhone: (pro?.phone_cell ?? ''),
    generatedDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    imageryDate: (report.imagery_date as string | null) ?? '',
    totalSqft: Number(report.total_sqft) || 0,
    totalSquaresOrder: Number(report.total_squares_order) || 0,
    facetCount: Number(report.facet_count) || 0,
    dominantPitch: (report.dominant_pitch as string | null) ?? '6/12',
    wasteFactor: Number(report.waste_factor) || 13,
    pitchBreakdown,
    linearFootage: report.linear_footage as PremiumLinearFootage,
    lat: Number(report.lat) || 0,
    lng: Number(report.lng) || 0,
  }

  // 5. Render PDF
  let pdfBuffer: Buffer
  try {
    const doc = buildPremiumRoofReportPDF(premiumData)
    pdfBuffer = await renderToBuffer(doc)
  } catch (e) {
    console.error('[premium-pdf] render error:', e)
    return apiError('PDF rendering failed', 500, e)
  }

  // 6. Upload to R2
  let r2, bucket
  try {
    r2 = getR2Client()
    bucket = getR2Bucket()
  } catch (e) {
    console.error('[premium-pdf] R2 config error:', e)
    return apiError('Storage not configured', 503, e)
  }

  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const safeAddr = ((report.address as string | null) ?? 'report')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 40)
  const r2Key = `reports/${pro_id}/premium/${dateStr}-${report_id}-premium.pdf`

  try {
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${safeAddr}_ProGuild_Premium.pdf"`,
    }))
  } catch (e) {
    console.error('[premium-pdf] R2 upload error:', e)
    return apiError('Failed to upload PDF', 502, e)
  }

  // 7. Sign URL
  let signedUrl: string
  try {
    signedUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({ Bucket: bucket, Key: r2Key }),
      { expiresIn: SIGNED_URL_TTL }
    )
  } catch (e) {
    console.error('[premium-pdf] sign error:', e)
    return apiError('Failed to generate download URL', 502, e)
  }

  // 8. Persist r2 key — non-fatal if fails
  const { error: updateErr } = await sb
    .from('roof_reports')
    .update({ premium_r2_key: r2Key })
    .eq('id', report_id)
    .eq('pro_id', pro_id)

  if (updateErr) console.error('[premium-pdf] persist key error:', updateErr.message)

  return NextResponse.json({ success: true, url: signedUrl })
}
