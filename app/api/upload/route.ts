import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateImage } from '@/lib/moderation'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file    = formData.get('file') as File | null
  const proId   = formData.get('pro_id') as string | null
  const bucket  = (formData.get('bucket') as string) || 'avatars'
  const folder  = (formData.get('folder') as string) || proId || 'general'

  if (!file || !proId) {
    return NextResponse.json({ error: 'file and pro_id are required' }, { status: 400 })
  }

  const isPDF       = file.type === 'application/pdf'
  const isInsurance = bucket === 'insurance'

  const allowedImages = ['image/jpeg', 'image/png', 'image/webp']
  const allowedTypes  = isInsurance ? [...allowedImages, 'application/pdf'] : allowedImages

  if (!allowedTypes.includes(file.type)) {
    const msg = isInsurance ? 'Only JPG, PNG, WebP or PDF files are allowed' : 'Only JPG, PNG and WebP images are allowed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const maxSize = isPDF ? 10 * 1024 * 1024 : 5 * 1024 * 1024
  if (file.size > maxSize) {
    return NextResponse.json({ error: `File must be under ${isPDF ? '10MB' : '5MB'}` }, { status: 400 })
  }

  const bytes0 = await file.arrayBuffer()
  const b64    = Buffer.from(bytes0).toString('base64')

  // Moderate images — PDFs skipped (documents don't need vision moderation)
  if (!isPDF) {
    const mod = await moderateImage(b64, file.type)
    if (!mod.safe) {
      return NextResponse.json({
        error: `Image not allowed: ${mod.reason || 'content policy violation'}. Please upload an appropriate photo.`
      }, { status: 422 })
    }
  }

  const supabase  = getSupabaseAdmin()
  const ext       = file.type === 'image/jpeg' ? 'jpg' : isPDF ? 'pdf' : file.type.split('/')[1]
  const timestamp = Date.now()
  const isAvatar  = bucket === 'avatars'
  const path      = isAvatar ? `${folder}/avatar.${ext}` : `${folder}/${timestamp}.${ext}`
  const buffer    = Buffer.from(b64, 'base64')

  const { error: uploadError } = await supabase
    .storage.from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: isAvatar })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    const msg = uploadError.message?.includes('bucket')
      ? 'Storage not configured — please contact support'
      : uploadError.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  if (isAvatar) {
    await supabase.from('pros').update({ profile_photo_url: publicUrl }).eq('id', proId)
  }

  return NextResponse.json({ url: publicUrl })
}
