import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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
  const { pro_id, photo_url, title, description, trade } = body

  if (!pro_id || !photo_url || !title?.trim()) {
    return NextResponse.json({ error: 'pro_id, photo_url and title are required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('portfolio_items')
    .insert({ pro_id, photo_url, title: title.trim(), description: description || null, trade: trade || null })
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
    .from('portfolio_items')
    .delete()
    .eq('id', id)
    .eq('pro_id', proId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
