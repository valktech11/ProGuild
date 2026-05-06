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

    // Validate type
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type))
      return NextResponse.json({ error: 'Only JPEG, PNG and WebP images are allowed' }, { status: 400 })

    // Validate size (5MB max)
    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large — maximum 5MB' }, { status: 400 })

    // Determine R2 key
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const key = bucket === 'avatars' ? `pros/${proId}/profile/avatar.${ext}`
              : bucket === 'cover'   ? `pros/${proId}/cover/cover.${ext}`
              :                        `pros/${proId}/uploads/${Date.now()}.${ext}`

    // Upload to R2
    const buf       = Buffer.from(await file.arrayBuffer())
    const publicUrl = await uploadToR2(key, buf, file.type)

    // Save avatar URL to DB
    if (bucket === 'avatars') {
      await getSupabaseAdmin().from('pros').update({ profile_photo_url: publicUrl }).eq('id', proId)
    }

    return NextResponse.json({ url: publicUrl, key })

  } catch (err: any) {
    console.error('R2 upload error:', err)
    const msg = err?.message?.includes('credentials') || err?.message?.includes('NoSuchBucket')
      ? 'Storage not configured — contact support'
      : (err?.message || 'Upload failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
