import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { randomUUID } from 'crypto'

// POST /api/leads/[id]/public-link  { pro_id }
// Ensures the lead has a non-enumerable public_token and returns the share path.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { pro_id } = await req.json().catch(() => ({}))
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  const { data: lead, error } = await sb
    .from('leads')
    .select('id, public_token')
    .eq('id', id)
    .eq('pro_id', pro_id)
    .single()
  if (error || !lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })

  let token = lead.public_token as string | null
  if (!token) {
    token = randomUUID().replace(/-/g, '')
    const { error: upErr } = await sb.from('leads').update({ public_token: token }).eq('id', id).eq('pro_id', pro_id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }
  return NextResponse.json({ token, path: `/status/${token}` })
}
