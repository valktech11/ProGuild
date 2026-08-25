// app/api/leads/[id]/photos/route.ts
// GET  /api/leads/[id]/photos?pro_id=...       — list photos
// POST /api/leads/[id]/photos                   — upload (multipart/form-data)
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getR2Client, getR2Bucket } from '@/lib/api/utils'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'
import { requirePro } from '@/lib/pro-auth'

type RouteParams = { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── GET — list photos ──────────────────────────────────────────────────────
export async function GET(req: Request, { params }: RouteParams) {
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  try {
    const { id: leadId } = await params
    const { searchParams } = new URL(req.url)
    const proId = searchParams.get('pro_id') ?? ''

    if (!UUID_RE.test(leadId) || !UUID_RE.test(proId)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
    }

    const _photoScopeCompanyId = __auth.companyId
    const _photoScopeRole = __auth.role
    const sb = getSupabaseAdmin()

    // Verify ownership: lead_id is already known, just scope by company or assignment
    const { data: lead, error } = await sb
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .eq(_photoScopeRole === 'member' ? 'assigned_to_pro_id' : (_photoScopeCompanyId ? 'company_id' : 'pro_id'), _photoScopeRole === 'member' ? proId! : (_photoScopeCompanyId ?? proId!))
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead not found or access denied' }, { status: 404 })
    }

    const { data: photos, error: photosError } = await sb
      .from('lead_photos')
      .select('id, url, annotated_url, has_annotation, phase, caption, filename, created_at, lat, lng, taken_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })

    if (photosError) throw photosError

    return NextResponse.json({
      photos: (photos ?? []).map(p => ({
        id:            p.id,
        url:           p.url,
        annotated_url: p.annotated_url ?? null,
        has_annotation: p.has_annotation ?? false,
        phase:         p.phase,
        caption:    p.caption ?? '',
        filename:   p.filename,
        uploadedAt: p.created_at,
        lat:        p.lat ?? null,
        lng:        p.lng ?? null,
        takenAt:    p.taken_at ?? null,
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
  const __auth = await requirePro(req as any, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  try {
    const { id: leadId } = await params

    if (!UUID_RE.test(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    const form = await req.formData()
    const file    = form.get('file')    as File | null
    const phase   = (form.get('phase')   as string | null) ?? 'Before'
    const formProId = (form.get('pro_id') as string | null) ?? ''
    if (formProId && formProId !== __auth.proId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const proId = __auth.proId // server-derived (IDOR)
  const _scopeCompanyId = __auth.companyId
  const _scopeRole = __auth.role
    const caption = (form.get('caption') as string | null) ?? ''
    // Optional geo/time proof metadata (insurance-grade). All nullable.
    const latRaw    = form.get('lat')      as string | null
    const lngRaw    = form.get('lng')      as string | null
    const takenAt   = (form.get('taken_at') as string | null) ?? null
    const lat = latRaw != null && latRaw !== '' && !isNaN(parseFloat(latRaw)) ? parseFloat(latRaw) : null
    const lng = lngRaw != null && lngRaw !== '' && !isNaN(parseFloat(lngRaw)) ? parseFloat(lngRaw) : null

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
      .eq(_scopeRole === 'member' ? 'assigned_to_pro_id' : (_scopeCompanyId ? 'company_id' : 'pro_id'), _scopeRole === 'member' ? proId! : (_scopeCompanyId ?? proId!))
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

    // Annotated version (optional) — same bucket, _annotated suffix key
    const annotatedFile = form.get('annotated_file') as File | null
    let annotatedUrl: string | null = null
    if (annotatedFile && annotatedFile.size > 0) {
      const aKey = `photos/${proId}/${leadId}/${photoId}_annotated.jpg`
      const aBytes = await annotatedFile.arrayBuffer()
      await r2.send(new PutObjectCommand({
        Bucket:      bucket,
        Key:         aKey,
        Body:        Buffer.from(aBytes),
        ContentType: 'image/jpeg',
        Metadata: { lead_id: leadId, pro_id: proId, phase },
      }))
      annotatedUrl = `${process.env.R2_PUBLIC_BUCKET_URL}/${aKey}`
    }

    const hasAnnotation = form.get('has_annotation') === 'true' && annotatedUrl !== null

    // Save to DB
    const { data: photo, error: insertError } = await sb
      .from('lead_photos')
      .insert({
        id:            photoId,
        lead_id:       leadId,
        pro_id:        proId,
        r2_key:        r2Key,
        url:           publicUrl,
        original_url:  publicUrl,
        annotated_url: annotatedUrl,
        has_annotation: hasAnnotation,
        phase,
        caption:       caption || null,
        filename:      file.name,
        lat,
        lng,
        taken_at:      takenAt,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({
      id:             photo.id,
      url:            photo.url,
      original_url:   photo.original_url ?? photo.url,
      annotated_url:  photo.annotated_url ?? null,
      has_annotation: photo.has_annotation ?? false,
      phase:          photo.phase,
      caption:        photo.caption ?? '',
      filename:       photo.filename,
      uploadedAt:     photo.created_at,
      lat:            photo.lat ?? null,
      lng:        photo.lng ?? null,
      takenAt:    photo.taken_at ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[photos POST]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
