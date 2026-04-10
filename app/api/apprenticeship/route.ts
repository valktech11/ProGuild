import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const [{ data: logs }, { data: pro }] = await Promise.all([
    getSupabaseAdmin().from('apprenticeship_log').select('*').eq('pro_id', proId).order('date', { ascending: false }).limit(50),
    getSupabaseAdmin().from('pros').select('apprenticeship_target_hours').eq('id', proId).single(),
  ])

  const totalHours = (logs || []).reduce((sum: number, l: any) => sum + parseFloat(l.hours), 0)
  return NextResponse.json({
    logs: logs || [],
    total_hours: Math.round(totalHours * 10) / 10,
    target_hours: pro?.apprenticeship_target_hours || 8000,
  })
}

export async function POST(req: NextRequest) {
  const { pro_id, date, hours, description, supervisor } = await req.json()
  if (!pro_id || !hours) return NextResponse.json({ error: 'pro_id and hours required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('apprenticeship_log')
    .insert({ pro_id, date: date || new Date().toISOString().split('T')[0], hours: parseFloat(hours), description: description || null, supervisor: supervisor || null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ log: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { pro_id, id } = await req.json()
  await getSupabaseAdmin().from('apprenticeship_log').delete().eq('id', id).eq('pro_id', pro_id)
  return NextResponse.json({ ok: true })
}
