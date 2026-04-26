import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/clients?pro_id=xxx — list all clients for a pro
export async function GET(req: NextRequest) {
  const proId = req.nextUrl.searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .select('*')
    .eq('pro_id', proId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with lifetime value + job count from leads
  const clientIds = (data || []).map(c => c.id)
  let enriched = data || []

  if (clientIds.length > 0) {
    const { data: leads } = await getSupabaseAdmin()
      .from('leads')
      .select('client_id, quoted_amount, lead_status, created_at')
      .eq('pro_id', proId)
      .in('client_id', clientIds)

    if (leads) {
      enriched = enriched.map(client => {
        const clientLeads = leads.filter(l => l.client_id === client.id)
        const paidLeads   = clientLeads.filter(l => l.lead_status === 'Paid' && l.quoted_amount)
        const lifetimeValue = paidLeads.reduce((sum, l) => sum + (l.quoted_amount || 0), 0)
        const lastJob = clientLeads.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
        return {
          ...client,
          job_count: clientLeads.length,
          lifetime_value: lifetimeValue,
          last_contact: lastJob?.created_at || client.created_at,
        }
      })
    }
  }

  return NextResponse.json({ clients: enriched })
}

// POST /api/clients — create a new client
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, full_name, phone, email, address_line1, city, state, zip, preferred_contact, notes, tags } = body

  if (!pro_id || !full_name) {
    return NextResponse.json({ error: 'pro_id and full_name required' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .insert({ pro_id, full_name, phone, email, address_line1, city, state, zip, preferred_contact: preferred_contact || 'call', notes, tags: tags || [] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data }, { status: 201 })
}

// PATCH /api/clients — update a client
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['full_name','phone','email','address_line1','city','state','zip','preferred_contact','notes','tags']
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) { if (key in fields) updates[key] = fields[key] }

  const { data, error } = await getSupabaseAdmin()
    .from('clients').update(updates).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ client: data })
}

// DELETE /api/clients — delete a client
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await getSupabaseAdmin().from('clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
