// GET /api/roof-visualizer/download?url=<r2-render-url>&name=<filename.jpg>
// Streams a render with Content-Disposition: attachment.
// Exists because the R2 public bucket sends no CORS headers, so browser-side
// fetch() of render URLs fails — this proxies same-origin instead.
// URL is validated against our own R2 public base + /visualizer/ prefix,
// so this cannot be used as an open proxy.

import { NextRequest, NextResponse } from 'next/server'
import { getR2PublicUrl } from '@/lib/r2'

export async function GET(req: NextRequest) {
  try {
    const sp   = new URL(req.url).searchParams
    const url  = sp.get('url') || ''
    const name = (sp.get('name') || 'proguild-render.jpg').replace(/[^a-zA-Z0-9._-]/g, '')

    const allowedBase = getR2PublicUrl('visualizer')
    if (!url.startsWith(allowedBase)) {
      return NextResponse.json({ error: 'Invalid download URL' }, { status: 400 })
    }

    const upstream = await fetch(url)
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Render not found' }, { status: 404 })
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    return new NextResponse(buf, {
      headers: {
        'Content-Type':        upstream.headers.get('content-type') || 'image/jpeg',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control':       'public, max-age=31536000',
      },
    })
  } catch (err: unknown) {
    console.error('[visualizer/download]', err)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
