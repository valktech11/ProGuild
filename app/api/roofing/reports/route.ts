// app/api/roofing/reports/route.ts
// GET    /api/roofing/reports?pro_id=...&property_id=...  — history, URLs re-signed on every call
// DELETE /api/roofing/reports?id=...&pro_id=...           — delete row + purge R2 object

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'proguild-media-staging'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId      = searchParams.get('pro_id')
  const propertyId = searchParams.get('property_id')

  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  let query = sb
    .from('roof_reports')
    .select('id, created_at, total_squares_raw, total_squares_order, dominant_pitch, facet_count, waste_factor, imagery_date, r2_key, lat, lng, linear_footage, premium_r2_key')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (propertyId) query = query.eq('property_id', propertyId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Re-sign every URL fresh (7-day expiry) so links never go stale regardless of when report was created
  const r2 = getR2Client()
  const reports = await Promise.all(
    (data || []).map(async (row: Record<string, unknown>) => {
      let r2_url = ''
      let premium_r2_url = ''
      if (row.r2_key) {
        try {
          r2_url = await getSignedUrl(
            r2,
            new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key as string }),
            { expiresIn: 60 * 60 * 24 * 7 }
          )
        } catch { /* leave empty if key is missing from bucket */ }
      }
      if (row.premium_r2_key) {
        try {
          premium_r2_url = await getSignedUrl(
            r2,
            new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.premium_r2_key as string }),
            { expiresIn: 60 * 60 * 24 * 7 }
          )
        } catch { /* leave empty */ }
      }
      return { ...row, r2_url, premium_r2_url: premium_r2_url || null }
    })
  )

  return NextResponse.json({ reports })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const proId = searchParams.get('pro_id')

  if (!id || !proId) return NextResponse.json({ error: 'id and pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Fetch r2_key before deleting — auth-gate: row must belong to this pro
  const { data: row, error: fetchErr } = await sb
    .from('roof_reports')
    .select('r2_key')
    .eq('id', id)
    .eq('pro_id', proId)
    .single()

  if (fetchErr || !row) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  // Delete DB row
  const { error: delErr } = await sb.from('roof_reports').delete().eq('id', id).eq('pro_id', proId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Purge R2 object — best-effort, don't fail the response if already gone
  if (row.r2_key) {
    try {
      const r2 = getR2Client()
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key as string }))
    } catch { /* silently ignore */ }
  }

  return NextResponse.json({ ok: true })
}
