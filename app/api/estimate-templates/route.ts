import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/estimate-templates?pro_id=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('estimate_templates')
    .select('id, name, items:estimate_template_items(id, name, description, qty, unit_price, amount, sort_order)')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

// POST /api/estimate-templates
export async function POST(req: NextRequest) {
  const { pro_id, name, items } = await req.json()
  if (!pro_id || !name) return NextResponse.json({ error: 'pro_id and name required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const { data: tpl, error: tplError } = await sb
    .from('estimate_templates')
    .insert({ pro_id, name })
    .select()
    .single()

  if (tplError) return NextResponse.json({ error: tplError.message }, { status: 500 })

  if (Array.isArray(items) && items.length > 0) {
    const rows = items.map((i: any, idx: number) => ({
      template_id: tpl.id,
      sort_order:  idx,
      name:        i.name,
      description: i.description || '',
      qty:         i.qty,
      unit_price:  i.unit_price,
      amount:      i.qty * i.unit_price,
    }))
    const { error: itemsError } = await sb.from('estimate_template_items').insert(rows)
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  return NextResponse.json({ template: tpl })
}

// DELETE /api/estimate-templates?id=xxx
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('estimate_templates')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
