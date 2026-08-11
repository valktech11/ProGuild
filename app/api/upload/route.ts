import { NextRequest, NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/r2'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const form   = await req.formData()
    const file   = form.get('file') as File | null
    const bucket = form.get('bucket') as string | null
    const proId  = form.get('pro_id') as string | null

    if (!file)  return NextResponse.json({ error: 'No file provided' },  { status: 400 })
    if (!proId) return NextResponse.json({ error: 'pro_id required' },   { status: 400 })

    // Validate type — PDFs allowed only for insurance COIs; avatars/cover stay images.
    const allowed = bucket === 'insurance'
      ? ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
      : ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type))
      return NextResponse.json({ error: bucket === 'insurance'
        ? 'Only JPEG, PNG, WebP or PDF files are allowed'
        : 'Only JPEG, PNG and WebP images are allowed' }, { status: 400 })

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large — maximum 5MB' }, { status: 400 })

    // Determine R2 key
    const ext = file.type === 'application/pdf' ? 'pdf'
              : file.type === 'image/png' ? 'png'
              : file.type === 'image/webp' ? 'webp' : 'jpg'
    const key = bucket === 'avatars'   ? `pros/${proId}/profile/avatar.${ext}`
              : bucket === 'cover'     ? `pros/${proId}/cover/cover.${ext}`
              : bucket === 'insurance' ? `pros/${proId}/insurance/${Date.now()}.${ext}`
              :                          `pros/${proId}/uploads/${Date.now()}.${ext}`

    // Upload to R2
    const buf       = Buffer.from(await file.arrayBuffer())
    const publicUrl = await uploadToR2(key, buf, file.type)

    // Save avatar URL to DB
    if (bucket === 'avatars') {
      const { error: dbErr } = await getSupabaseAdmin()
        .from('pros')
        .update({ profile_photo_url: publicUrl })
        .eq('id', proId)
      if (dbErr) console.error('Failed to save photo URL to DB:', dbErr.message, 'proId:', proId)
    }

    return NextResponse.json({ url: publicUrl, key, proId })

  } catch (err: any) {
    console.error('R2 upload error:', err)
    const msg = err?.message?.includes('credentials') || err?.message?.includes('NoSuchBucket')
      ? 'Storage not configured — contact support'
      : (err?.message || 'Upload failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
