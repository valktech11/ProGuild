// app/api/leads/[id]/photos/zip/route.ts
// GET /api/leads/[id]/photos/zip?pro_id=...
// Streams a ZIP of all photos for a lead — used by adjuster package button in JobPhotoLog.
// Uses JSZip to bundle R2 photos fetched via signed URL.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const proId = req.nextUrl.searchParams.get('pro_id')

  if (!UUID_RE.test(leadId)) {
    return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
  }
  if (!proId || !UUID_RE.test(proId)) {
    return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Verify ownership
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .select('id, contact_name, pro_id')
    .eq('id', leadId)
    .eq('pro_id', proId)
    .single()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })
  }

  // Fetch all photos
  const { data: photos, error: photoErr } = await sb
    .from('lead_photos')
    .select('id, r2_key, phase, caption, filename, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })

  if (photoErr) {
    return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
  }

  if (!photos || photos.length === 0) {
    return NextResponse.json({ error: 'No photos to zip' }, { status: 404 })
  }

  // Dynamically import JSZip (server-side only)
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  const R2_PUBLIC = process.env.R2_PUBLIC_BUCKET_URL?.replace(/\/$/, '') ?? ''

  // Fetch each photo and add to zip
  const results = await Promise.allSettled(
    photos.map(async (photo) => {
      const url = `${R2_PUBLIC}/${photo.r2_key}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch ${photo.r2_key}`)
      const buf = await res.arrayBuffer()
      const filename = `${photo.phase ?? 'Photo'}_${photo.filename ?? photo.id}.jpg`
      zip.file(filename, buf)
    })
  )

  const failed = results.filter(r => r.status === 'rejected').length
  if (failed === results.length) {
    return NextResponse.json({ error: 'All photo fetches failed' }, { status: 500 })
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const safeLeadName = lead.contact_name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="photos_${safeLeadName}.zip"`,
      'Content-Length': zipBuffer.length.toString(),
    },
  })
}
