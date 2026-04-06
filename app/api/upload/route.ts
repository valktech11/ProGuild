import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file  = formData.get('file') as File | null
  const proId = formData.get('pro_id') as string | null

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

  const supabase = getSupabaseAdmin()
  const ext      = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const path     = `${proId}/avatar.${ext}`
  const bytes    = await file.arrayBuffer()
  const buffer   = Buffer.from(bytes)

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase
    .storage
    .from('avatars')
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    })

  // Log full error detail for debugging
  if (uploadError) {
    console.error('Storage upload error full:', JSON.stringify(uploadError))
    return NextResponse.json({ error: uploadError.message, detail: uploadError }, { status: 500 })
  }

  console.log('Upload success:', uploadData)

  // Get public URL using same client instance
  const { data: urlData } = supabase
    .storage
    .from('avatars')
    .getPublicUrl(path)

  const publicUrl = urlData.publicUrl
  console.log('Public URL:', publicUrl)

  // Update pro record
  const { error: updateError } = await supabase
    .from('pros')
    .update({ profile_photo_url: publicUrl })
    .eq('id', proId)

  if (updateError) {
    console.error('Pro update error:', JSON.stringify(updateError))
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ url: publicUrl })
}
