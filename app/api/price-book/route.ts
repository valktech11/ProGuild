// app/api/price-book/route.ts
// GET  — list pro's price book items
// POST — create item
// PATCH /[id] — update item (separate route)
// DELETE /[id] — delete item (separate route)

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('pro_price_book_items')
    .select('*')
    .eq('pro_id', auth.proId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const body = await req.json()
  const { name, description, category, unit, unit_price, sort_order } = body
  if (!name || unit_price == null)
    return NextResponse.json({ error: 'name and unit_price required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('pro_price_book_items')
    .insert({ pro_id: auth.proId, name, description, category: category || 'general',
              unit: unit || 'each', unit_price: Number(unit_price), sort_order: sort_order || 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
