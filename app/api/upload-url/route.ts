import { NextRequest, NextResponse } from 'next/server'
import { getPresignedUploadUrl, getR2PublicUrl } from '@/lib/r2'

// Returns a signed URL for direct browser → R2 upload
// Used for large files (job photos, documents) that exceed Vercel's 4.5MB limit
export async function POST(req: NextRequest) {
  try {
    const { pro_id, file_name, content_type, bucket } = await req.json()

    if (!pro_id || !file_name || !content_type)
      return NextResponse.json({ error: 'pro_id, file_name and content_type required' }, { status: 400 })

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(content_type))
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })

    // Build key based on bucket type
    const ts  = Date.now()
    const ext = file_name.split('.').pop() || 'jpg'
    const key = bucket === 'avatars'   ? `pros/${pro_id}/profile/avatar.${ext}`
              : bucket === 'portfolio' ? `pros/${pro_id}/portfolio/${ts}.${ext}`
              : bucket === 'vault'     ? `pros/${pro_id}/vault/${file_name}`
              : bucket === 'jobs'      ? `pros/${pro_id}/jobs/${ts}/${file_name}`
              :                          `pros/${pro_id}/uploads/${ts}.${ext}`

    const uploadUrl = await getPresignedUploadUrl(key, content_type)
    const publicUrl = getR2PublicUrl(key)

    return NextResponse.json({ upload_url: uploadUrl, public_url: publicUrl, key })

  } catch (err: any) {
    console.error('Presign error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to generate upload URL' }, { status: 500 })
  }
}
