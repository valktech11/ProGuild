import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'
import { moderateContent } from '@/lib/moderation'

// GET is a public profile read (any pro's portfolio is shown on their public
// profile). Mutations (POST/DELETE/PATCH) are gated to the verified owner.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('portfolio_items')
    .select('*')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { photo_url, title, description, trade, latitude, longitude, location_label, captured_at, is_job_site, is_before_after, before_photo_url } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  const pro_id = __auth.proId!

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // Moderate title and description
  const textToCheck = [title, description].filter(Boolean).join(' ')
  const mod = await moderateContent(textToCheck)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Portfolio item not allowed: ${mod.reason}. Please keep content professional.`
    }, { status: 422 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('portfolio_items')
    .insert({ pro_id, photo_url: photo_url || null, title: title.trim(), description: description || null, trade: trade || null, latitude: latitude || null, longitude: longitude || null, location_label: location_label || null, captured_at: captured_at || null, is_job_site: is_job_site || false, is_before_after: is_before_after || false, before_photo_url: before_photo_url || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const __auth = await requirePro(req, searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await getSupabaseAdmin()
    .from('portfolio_items').delete().eq('id', id).eq('pro_id', __auth.proId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, latitude, longitude, location_label } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('portfolio_items')
    .update({ latitude: latitude || null, longitude: longitude || null, location_label: location_label || null })
    .eq('id', id).eq('pro_id', __auth.proId!).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
