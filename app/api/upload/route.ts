import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

async function moderateImage(base64: string, mimeType: string): Promise<{ safe: boolean; reason?: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { safe: true } // fail open if no key

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.AI_PROVIDER_MODEL || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64,
                }
              },
              {
                text: 'Does this image contain any of: nudity, sexual content, graphic violence, gore, hate symbols, weapons pointed at people, or illegal content? Reply with only JSON: {"safe": true} or {"safe": false, "reason": "brief reason"}'
              }
            ]
          }],
          generationConfig: { maxOutputTokens: 60, temperature: 0 },
        }),
      }
    )

    if (!response.ok) return { safe: true }
    const data = await response.json()
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    return { safe: parsed.safe !== false, reason: parsed.reason }
  } catch {
    return { safe: true } // fail open
  }
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

  // Moderate image content — skip for PDFs (documents don't need vision moderation)
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
