import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// ── /api/clients/summary ──────────────────────────────────────────────────────
// Single source of truth for client aggregates. Web (clients/page.tsx) and
// mobile both read from here so the header totals can never disagree.
//
// Returns:
//   totalClients      — count of clients for the pro
//   totalLifetime     — Σ lifetime value across all clients
//   clientsWithJobs   — clients that have at least one job
//
// lifetimeValue per client = Σ quoted_amount over that client's leads in a won
// state (job_won / Paid) — identical to the per-client enrichment in
// /api/clients, so the header total always equals the sum of the rows shown.

const WON_STATUSES = ['job_won', 'Paid']

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const { data: clients, error } = await sb
    .from('clients')
    .select('id')
    .eq('pro_id', proId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clientList = clients || []
  const totalClients = clientList.length

  if (totalClients === 0) {
    return NextResponse.json({ totalClients: 0, totalLifetime: 0, clientsWithJobs: 0 })
  }

  const clientIds = clientList.map(c => c.id as string)

  // Pull won/paid leads tied to these clients; aggregate value per client.
  const { data: leads } = await sb
    .from('leads')
    .select('client_id, quoted_amount, lead_status')
    .eq('pro_id', proId)
    .in('client_id', clientIds)

  const perClient: Record<string, number> = {}
  for (const l of leads || []) {
    if (!WON_STATUSES.includes(l.lead_status as string)) continue
    const cid = l.client_id as string
    if (!cid) continue
    perClient[cid] = (perClient[cid] || 0) + ((l.quoted_amount as number) || 0)
  }

  const totalLifetime = Math.round(
    Object.values(perClient).reduce((s, v) => s + v, 0) * 100) / 100
  const clientsWithJobs = Object.keys(perClient).length

  return NextResponse.json({
    totalClients,
    totalLifetime,
    clientsWithJobs,
  })
}
