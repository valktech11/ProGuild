import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/estimates/public/[id]/decline
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const decline_reason = body.reason || null

  const { error } = await getSupabaseAdmin()
    .from('estimates')
    .update({
      status:         'declined',
      declined_at:    new Date().toISOString(),
      decline_reason,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['sent', 'viewed']) // B6: symmetric guard matching approve route

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
