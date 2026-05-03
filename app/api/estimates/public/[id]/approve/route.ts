import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  await getSupabaseAdmin()
    .from('estimates')
    .update({
      status:      'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
