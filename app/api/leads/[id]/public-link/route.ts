import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'
import { randomUUID } from 'crypto'

// POST /api/leads/[id]/public-link  { pro_id }
// Ensures the lead has a non-enumerable public_token and returns the share path.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { pro_id } = body

  const auth = await requirePro(req, pro_id)
  if (auth.error) return auth.error
  const { proId, companyId, role } = auth
  const scope = role === 'member'
    ? { col: 'assigned_to_pro_id', val: proId! }
    : companyId ? { col: 'company_id', val: companyId } : { col: 'pro_id', val: proId! }

  const sb = getSupabaseAdmin()
  const { data: lead, error } = await sb
    .from('leads')
    .select('id, public_token')
    .eq('id', id)
    .eq(scope.col, scope.val)
    .single()
  if (error || !lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })

  let token = lead.public_token as string | null
  if (!token) {
    token = randomUUID().replace(/-/g, '')
    const { error: upErr } = await sb.from('leads').update({ public_token: token }).eq('id', id).eq(scope.col, scope.val)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }
  return NextResponse.json({ token, path: `/status/${token}` })
}
