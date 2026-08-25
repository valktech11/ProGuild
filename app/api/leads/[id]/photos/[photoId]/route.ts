// app/api/leads/[id]/photos/[photoId]/route.ts
// DELETE /api/leads/[id]/photos/[photoId]?pro_id=...
// Deletes a single photo from Cloudflare R2 and removes the DB record.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { requirePro } from '@/lib/pro-auth'

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
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { id: leadId, photoId } = await params
  const proId = __auth.proId
  const _photoCompanyId = __auth.companyId
  const _photoRole = __auth.role

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


// PATCH /api/leads/[id]/photos/[photoId] — attach annotated variant to an
// existing photo. Multipart field 'annotated_file'. Server-derived pro scope.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { id: leadId, photoId } = await params
  if (!UUID_RE.test(leadId) || !UUID_RE.test(photoId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  // Ownership: photo must belong to this pro + lead
  const { data: photo, error: findErr } = await sb
    .from('lead_photos')
    .select('id, r2_key')
    .eq('id', photoId)
    .eq('lead_id', leadId)
    .eq(_photoRole === 'member' ? 'assigned_to_pro_id' : (_photoCompanyId ? 'company_id' : 'pro_id'), _photoRole === 'member' ? __auth.proId! : (_photoCompanyId ?? __auth.proId!))
    .maybeSingle()
  if (findErr) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const annotatedFile = form.get('annotated_file') as File | null
  if (!annotatedFile || annotatedFile.size === 0) {
    return NextResponse.json({ error: 'annotated_file required' }, { status: 400 })
  }

  const aKey = `photos/${__auth.proId}/${leadId}/${photoId}_annotated.jpg`
  const aBytes = await annotatedFile.arrayBuffer()
  await r2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: aKey,
    Body: Buffer.from(aBytes),
    ContentType: 'image/jpeg',
  }))
  const annotatedUrl = `${process.env.R2_PUBLIC_BUCKET_URL}/${aKey}`

  const { error: upErr } = await sb
    .from('lead_photos')
    .update({ annotated_url: annotatedUrl, has_annotation: true })
    .eq('id', photoId)
  if (upErr) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ id: photoId, annotated_url: annotatedUrl, has_annotation: true })
}
