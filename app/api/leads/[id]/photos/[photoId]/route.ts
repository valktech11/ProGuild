// app/api/leads/[id]/photos/[photoId]/route.ts
// DELETE /api/leads/[id]/photos/[photoId]?pro_id=...
// Deletes a single photo from Cloudflare R2 and removes the DB record.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const { id: leadId, photoId } = await params
  const proId = req.nextUrl.searchParams.get('pro_id')

  if (!UUID_RE.test(leadId) || !UUID_RE.test(photoId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }
  if (!proId || !UUID_RE.test(proId)) {
    return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Fetch photo record — verify ownership via lead.pro_id
  const { data: photo, error: fetchErr } = await sb
    .from('lead_photos')
    .select('id, r2_key, lead_id, leads!inner(pro_id)')
    .eq('id', photoId)
    .eq('lead_id', leadId)
    .single()

  if (fetchErr || !photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  // Ownership check
  const owner = (photo.leads as any)?.pro_id
  if (owner !== proId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Delete from R2
  try {
    const client = r2Client()
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key:    photo.r2_key,
    }))
  } catch (err) {
    console.error('[photos/delete] R2 error:', err)
    // Non-fatal — remove DB record even if R2 delete fails (orphaned objects OK)
  }

  // Delete DB record
  const { error: delErr } = await sb
    .from('lead_photos')
    .delete()
    .eq('id', photoId)

  if (delErr) {
    console.error('[photos/delete] DB error:', delErr.message)
    return NextResponse.json({ error: 'Failed to delete photo record' }, { status: 500 })
  }

  return NextResponse.json({ success: true, photoId })
}
