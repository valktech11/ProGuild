import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { wonInMonth, leadRevenue } from '@/lib/metrics/won'
import { requirePro } from '@/lib/pro-auth'
import { getActiveStages } from '@/lib/trades/_registry'

const pretty = (s: string) => s.replace(/_/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase())

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const proId = __auth.proId
  const _scopeCompanyId = __auth.companyId
  const _scopeRole = __auth.role
  const _perfCompanyId = __auth.companyId
  const _perfRole = __auth.role
  if (!_perfCompanyId) return NextResponse.json({ error: 'No company context' }, { status: 400 })
  // Member: only their assigned leads
  let _perfLeadIds: string[] | null = null
  if (_perfRole === 'member' && proId) {
    const { data: _ml } = await getSupabaseAdmin().from('leads').select('id')
      .eq('company_id', _perfCompanyId).eq('assigned_to_pro_id', proId).is('deleted_at', null)
    _perfLeadIds = (_ml ?? []).map((l: any) => l.id)
    if (_perfLeadIds.length === 0) return NextResponse.json({ leads: [], win_rate: 0, avg_cycle: 0, total_leads: 0 })
  }

  const sb = getSupabaseAdmin()

  // Build the funnel from the pro's trade config so HVAC gets HVAC stages
  // and roofing gets roofing stages — not hardcoded roofing regardless of trade.
  const { data: proRow } = await sb.from('pros').select('trade_slug').eq('id', proId).maybeSingle()
  const FUNNEL = getActiveStages(proRow?.trade_slug ?? null)
    .map((s: any) => ({ key: s.key, label: s.label }))

  const [leadsRes, eventsRes] = await Promise.all([
    (() => { let q = sb.from('leads').select('id, lead_status, lead_source, created_at, lead_status_changed_at, updated_at, quoted_amount, roofing_job_data(approved_amount)').eq('company_id', _perfCompanyId); if (_perfLeadIds !== null) q = q.in('id', _perfLeadIds); return q })(),
    sb.from('pipeline_events')
      .select('lead_id, event_data')
      .eq(_scopeRole === 'member' ? 'assigned_to_pro_id' : (_scopeCompanyId ? 'company_id' : 'pro_id'), _scopeRole === 'member' ? proId! : (_scopeCompanyId ?? proId!))
      .eq('event_type', 'stage_changed'),
  ])
  if (leadsRes.error) return NextResponse.json({ error: leadsRes.error.message }, { status: 500 })

  const leads = leadsRes.data || []
  const events = eventsRes.data || []

  // ── Win rate (all-time + this month) ──────────────────────────────────────
  const wonAll = leads.filter(l => l.lead_status === 'job_won')
  const lostAll = leads.filter(l => l.lead_status === 'lost')
  const decided = wonAll.length + lostAll.length
  const winRate = decided ? Math.round((wonAll.length / decided) * 100) : null
  const wonMo = wonInMonth(leads as never[], 'job_won', 0).length
  const lostMo = wonInMonth(leads as never[], 'lost', 0).length
  const winRateMo = (wonMo + lostMo) ? Math.round((wonMo / (wonMo + lostMo)) * 100) : null

  // ── Avg sales cycle (created -> won), days ────────────────────────────────
  const cycles = wonAll
    .map(l => (new Date((l.lead_status_changed_at || l.updated_at || l.created_at) as string).getTime() - new Date(l.created_at as string).getTime()) / 86400000)
    .filter(d => d >= 0)
  const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null

  // ── Conversion funnel (how far leads get; from event history + current) ────
  const reachedByLead = new Map<string, Set<string>>()
  for (const e of events) {
    const to = (e.event_data as { to?: string } | null)?.to
    if (!to) continue
    const set = reachedByLead.get(e.lead_id) || new Set<string>()
    set.add(to); reachedByLead.set(e.lead_id, set)
  }
  const idxOf = (k: string) => FUNNEL.findIndex(s => s.key === k)
  const funnelCounts = new Array(FUNNEL.length).fill(0)
  for (const l of leads) {
    const reached = reachedByLead.get(l.id) || new Set<string>()
    reached.add(l.lead_status as string)
    let maxIdx = 0 // every lead starts at Lead In
    for (const k of reached) { const i = idxOf(k); if (i > maxIdx) maxIdx = i }
    for (let i = 0; i <= maxIdx; i++) funnelCounts[i]++
  }
  const base = funnelCounts[0] || 0
  // drop = relative % lost from the previous stage; biggest drop = where to look first.
  const funnel = FUNNEL.map((s, i) => ({
    stage: s.label,
    count: funnelCounts[i],
    conversion: i === 0 ? 100 : base ? Math.round((funnelCounts[i] / base) * 100) : 0,
    drop: i === 0 || funnelCounts[i - 1] === 0
      ? null
      : Math.round(((funnelCounts[i - 1] - funnelCounts[i]) / funnelCounts[i - 1]) * 100),
  }))
  let biggestDropIndex = -1, biggestDrop = 0
  for (let i = 1; i < funnel.length; i++) {
    const d = funnel[i].drop ?? 0
    if (d > biggestDrop) { biggestDrop = d; biggestDropIndex = i }
  }

  // ── Lead-source effectiveness ─────────────────────────────────────────────
  const srcMap = new Map<string, { leads: number; won: number; revenue: number }>()
  for (const l of leads) {
    const k = (l.lead_source || 'unknown') as string
    const e = srcMap.get(k) || { leads: 0, won: 0, revenue: 0 }
    e.leads += 1
    if (l.lead_status === 'job_won') { e.won += 1; e.revenue += leadRevenue(l as never) }
    srcMap.set(k, e)
  }
  const bySource = [...srcMap.entries()]
    .map(([source, v]) => ({ source: pretty(source), leads: v.leads, won: v.won, winRate: v.leads ? Math.round((v.won / v.leads) * 100) : 0, revenue: v.revenue, perLead: v.leads ? Math.round(v.revenue / v.leads) : 0 }))
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)

  // ── Needs attention: proposals stuck in 'proposal_sent' 7+ days ───────────────
  const staleCutoff = Date.now() - 7 * 86400000
  const staleProposals = leads.filter(l => {
    if (l.lead_status !== 'proposal_sent') return false
    const ts = new Date((l.lead_status_changed_at || l.updated_at || l.created_at) as string).getTime()
    return ts < staleCutoff
  }).length

  return NextResponse.json({
    winRate, winRateMo, wonAll: wonAll.length, lostAll: lostAll.length,
    avgCycle, funnel, biggestDropIndex, bySource, staleProposals, totalLeads: leads.length,
  })
}
