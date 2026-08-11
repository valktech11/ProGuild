import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const sb = getSupabaseAdmin()
  // Single client by id — avoids loading the entire client list on a detail page.
  const { data: client, error } = await sb
    .from('clients').select('*').eq('id', id).eq('pro_id', proId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  // Lightweight derived metrics from this client's leads only.
  const { data: cLeads } = await sb
    .from('leads').select('lead_status, quoted_amount, updated_at, created_at')
    .eq('pro_id', proId).eq('client_id', id).is('deleted_at', null)
  const leads = cLeads || []
  const lifetime_value = leads
    .filter(l => l.lead_status === 'job_won')
    .reduce((s, l) => s + (Number(l.quoted_amount) || 0), 0)
  const last_contact = leads.length
    ? leads.map(l => l.updated_at || l.created_at).sort().slice(-1)[0]
    : null
  return NextResponse.json({ client: { ...client, lifetime_value, job_count: leads.length, last_contact } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { pro_id, full_name, phone, email, notes, tags } = body
  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .update({ full_name, phone: phone || null, email: email || null, notes: notes || null, tags: tags || [] })
    .eq('id', id).eq('pro_id', pro_id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data })
}
