import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// Clients are company-shared CRM data. Gate on the verified pro and scope
// role-aware: members see their assigned clients, owners/company see all.
function ownerFilter<T extends { eq: (col: string, val: string) => T }>(
  q: T, role: string | null, companyId: string | null, proId: string,
): T {
  if (role === 'member') return q.eq('assigned_to_pro_id', proId)
  if (companyId)         return q.eq('company_id', companyId)
  return q.eq('pro_id', proId)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const sb = getSupabaseAdmin()
  // Single client by id — avoids loading the entire client list on a detail page.
  const { data: client, error } = await ownerFilter(
    sb.from('clients').select('*').eq('id', id) as any,
    __auth.role ?? null, __auth.companyId ?? null, __auth.proId!,
  ).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  // Lightweight derived metrics from this client's leads only.
  const { data: cLeads } = await ownerFilter(
    sb.from('leads').select('lead_status, quoted_amount, updated_at, created_at').eq('client_id', id).is('deleted_at', null) as any,
    __auth.role ?? null, __auth.companyId ?? null, __auth.proId!,
  )
  const leads = cLeads || []
  const lifetime_value = leads
    .filter((l: any) => l.lead_status === 'job_won')
    .reduce((s: number, l: any) => s + (Number(l.quoted_amount) || 0), 0)
  const last_contact = leads.length
    ? leads.map((l: any) => l.updated_at || l.created_at).sort().slice(-1)[0]
    : null
  return NextResponse.json({ client: { ...client, lifetime_value, job_count: leads.length, last_contact } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { full_name, phone, email, notes, tags } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  const { data, error } = await ownerFilter(
    getSupabaseAdmin()
      .from('clients')
      .update({ full_name, phone: phone || null, email: email || null, notes: notes || null, tags: tags || [] })
      .eq('id', id) as any,
    __auth.role ?? null, __auth.companyId ?? null, __auth.proId!,
  ).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  return NextResponse.json({ client: data })
}
