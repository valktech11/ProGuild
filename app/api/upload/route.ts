import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file    = formData.get('file') as File | null
  const proId   = formData.get('pro_id') as string | null
  const bucket  = (formData.get('bucket') as string) || 'avatars'
  const folder  = (formData.get('folder') as string) || proId || 'general'

  if (!file || !proId) {
    return NextResponse.json({ error: 'file and pro_id are required' }, { status: 400 })
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG and WebP images are allowed' }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 })
  }

  const supabase  = getSupabaseAdmin()
  const ext       = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const timestamp = Date.now()
  const isAvatar  = bucket === 'avatars'
  const path      = isAvatar ? `${folder}/avatar.${ext}` : `${folder}/${timestamp}.${ext}`
  const bytes     = await file.arrayBuffer()
  const buffer    = Buffer.from(bytes)

  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: isAvatar })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  // For avatar uploads — update pro record automatically
  if (isAvatar) {
    await supabase.from('pros').update({ profile_photo_url: publicUrl }).eq('id', proId)
  }

  return NextResponse.json({ url: publicUrl })
}
