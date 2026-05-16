// app/api/leads/[id]/photos/route.ts
// GET  /api/leads/[id]/photos?pro_id=...       — list photos
// POST /api/leads/[id]/photos                   — upload (multipart/form-data)
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getR2Client, getR2Bucket } from '@/lib/api/utils'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'

type RouteParams = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── GET — list photos ──────────────────────────────────────────────────────
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id: leadId } = await params
    const { searchParams } = new URL(req.url)
    const proId = searchParams.get('pro_id') ?? ''

    if (!UUID_RE.test(leadId) || !UUID_RE.test(proId)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Verify ownership
    const { data: lead, error } = await sb
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('pro_id', proId)
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })
    }

    const { data: photos, error: photosError } = await sb
      .from('lead_photos')
      .select('id, url, phase, caption, filename, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })

    if (photosError) throw photosError

    return NextResponse.json({
      photos: (photos ?? []).map(p => ({
        id:         p.id,
        url:        p.url,
        phase:      p.phase,
        caption:    p.caption ?? '',
        filename:   p.filename,
        uploadedAt: p.created_at,
      }))
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[photos GET]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── POST — upload photo ────────────────────────────────────────────────────
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id: leadId } = await params

    if (!UUID_RE.test(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    const form = await req.formData()
    const file    = form.get('file')    as File | null
    const phase   = (form.get('phase')   as string | null) ?? 'Before'
    const proId   = (form.get('pro_id')  as string | null) ?? ''
    const caption = (form.get('caption') as string | null) ?? ''

    if (!file || !proId) {
      return NextResponse.json({ error: 'file and pro_id are required' }, { status: 400 })
    }

    if (!UUID_RE.test(proId)) {
      return NextResponse.json({ error: 'Invalid pro_id' }, { status: 400 })
    }

    // Validate file type
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WEBP and HEIC images are accepted' }, { status: 400 })
    }

    // Validate file size — 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Verify lead ownership
    const { data: lead, error: leadError } = await sb
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('pro_id', proId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })
    }

    // Build R2 key — scoped by pro and lead for security + easy cleanup
    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const photoId  = crypto.randomUUID()
    const r2Key    = `photos/${proId}/${leadId}/${photoId}.${ext}`

    // Upload to R2
    const r2     = getR2Client()
    const bucket = getR2Bucket()
    const bytes  = await file.arrayBuffer()

    await r2.send(new PutObjectCommand({
      Bucket:      bucket,
      Key:         r2Key,
      Body:        Buffer.from(bytes),
      ContentType: file.type,
      Metadata: {
        lead_id: leadId,
        pro_id:  proId,
        phase,
      },
    }))

    // Public URL — R2 bucket must have public access configured
    const publicUrl = `${process.env.R2_PUBLIC_BUCKET_URL}/${r2Key}`

    // Save to DB
    const { data: photo, error: insertError } = await sb
      .from('lead_photos')
      .insert({
        id:        photoId,
        lead_id:   leadId,
        pro_id:    proId,
        r2_key:    r2Key,
        url:       publicUrl,
        phase,
        caption:   caption || null,
        filename:  file.name,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({
      id:         photo.id,
      url:        photo.url,
      phase:      photo.phase,
      caption:    photo.caption ?? '',
      filename:   photo.filename,
      uploadedAt: photo.created_at,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[photos POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
