import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'

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
  const { pro_id, photo_url, title, description, trade, latitude, longitude, location_label, captured_at, is_job_site } = body

  if (!pro_id || !photo_url || !title?.trim()) {
    return NextResponse.json({ error: 'pro_id, photo_url and title are required' }, { status: 400 })
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
    .insert({ pro_id, photo_url, title: title.trim(), description: description || null, trade: trade || null, latitude: latitude || null, longitude: longitude || null, location_label: location_label || null, captured_at: captured_at || null, is_job_site: is_job_site || false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id    = searchParams.get('id')
  const proId = searchParams.get('pro_id')
  if (!id || !proId) return NextResponse.json({ error: 'id and pro_id required' }, { status: 400 })
  const { error } = await getSupabaseAdmin()
    .from('portfolio_items').delete().eq('id', id).eq('pro_id', proId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const { id, pro_id, latitude, longitude, location_label } = await req.json()
  if (!id || !pro_id) return NextResponse.json({ error: 'id and pro_id required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('portfolio_items')
    .update({ latitude: latitude || null, longitude: longitude || null, location_label: location_label || null })
    .eq('id', id).eq('pro_id', pro_id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
