import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

async function moderateImage(base64: string, mimeType: string): Promise<{ safe: boolean; reason?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { safe: true } // skip moderation if no key
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: 'Does this image contain any of: nudity, sexual content, graphic violence, gore, hate symbols, weapons pointed at people, or illegal content? Reply with only JSON: {"safe": true} or {"safe": false, "reason": "brief reason"}' },
        ]}],
      }),
    })
    if (!res.ok) return { safe: true }
    const d = await res.json()
    const text = (d.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    return { safe: parsed.safe !== false, reason: parsed.reason }
  } catch { return { safe: true } } // fail open
}

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

  // Moderate image content
  const bytes0 = await file.arrayBuffer()
  const b64    = Buffer.from(bytes0).toString('base64')
  const mod    = await moderateImage(b64, file.type as any)
  if (!mod.safe) {
    return NextResponse.json({ error: `Image not allowed: ${mod.reason || 'content policy violation'}. Please upload an appropriate photo.` }, { status: 422 })
  }

  const supabase  = getSupabaseAdmin()
  const ext       = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const timestamp = Date.now()
  const isAvatar  = bucket === 'avatars'
  const path      = isAvatar ? `${folder}/avatar.${ext}` : `${folder}/${timestamp}.${ext}`
  const buffer    = Buffer.from(b64, 'base64')

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
