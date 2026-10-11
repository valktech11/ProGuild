import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// Apprenticeship hours are personal to a pro — gate every op on the verified id.
export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const proId = __auth.proId!

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
  const body = await req.json()
  const { date, hours, description, supervisor } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  if (!hours) return NextResponse.json({ error: 'hours required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('apprenticeship_log')
    .insert({ pro_id: __auth.proId!, date: date || new Date().toISOString().split('T')[0], hours: parseFloat(hours), description: description || null, supervisor: supervisor || null })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ log: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { id } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  await getSupabaseAdmin().from('apprenticeship_log').delete().eq('id', id).eq('pro_id', __auth.proId!)
  return NextResponse.json({ ok: true })
}
