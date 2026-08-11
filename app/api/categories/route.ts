import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Per-record data that changes — always read fresh.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from('trade_categories')
    .select('*')
    .order('category_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data || [] })
}

export async function POST(req: NextRequest) {
  const { category_name, slug } = await req.json()
  if (!category_name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('trade_categories')
    .insert({ category_name, slug, is_active: true })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const { id, category_name, is_active } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updates: any = {}
  if (category_name !== undefined) updates.category_name = category_name
  if (is_active !== undefined) updates.is_active = is_active
  const { data, error } = await getSupabaseAdmin()
    .from('trade_categories')
    .update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Soft delete — set inactive
  await getSupabaseAdmin().from('trade_categories').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ success: true })
}
