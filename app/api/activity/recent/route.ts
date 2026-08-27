import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// GET /api/activity/recent?pro_id=&limit=
// Single source of truth for the "Recent Activity" feed shown on web + mobile home.
// Reads the live pipeline_events ledger and produces the human-readable phrase here
// (server-side) so both clients render identical wording. Clients only format the
// relative timestamp and map the accent token to a colour.

const STAGE_LABELS: Record<string, string> = {
  lead_in:              'New Lead',
  inspection_scheduled: 'Inspection',
  proposal_sent:        'Estimate',
  proposal_signed:      'Proposal Signed',
  insurance_approved:   'Insurance Job',
  scheduled:            'Scheduled',
  in_progress:          'In Progress',
  job_won:              'Job Won',
}

function money(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

// Maps an event row to the verb phrase + an accent token (client picks the colour).
function describe(eventType: string, data: Record<string, unknown>): { label: string; accent: string } {
  switch (eventType) {
    case 'lead_created':
      return { label: 'added as a new lead', accent: 'teal' }
    case 'stage_changed': {
      const to = typeof data.to === 'string' ? data.to : undefined
      if (to === 'proposal_signed') return { label: 'signed the proposal', accent: 'green' }
      if (to === 'job_won')         return { label: 'job marked won', accent: 'green' }
      if (to)                       return { label: `moved to ${STAGE_LABELS[to] || to}`, accent: 'blue' }
      return { label: 'changed stage', accent: 'blue' }
    }
    case 'payment_received': {
      const amt = Number(data.amount)
      return { label: amt > 0 ? `paid ${money(amt)}` : 'made a payment', accent: 'green' }
    }
    case 'invoice_sent':            return { label: 'was sent an invoice', accent: 'blue' }
    case 'invoice_viewed':          return { label: 'viewed the invoice', accent: 'purple' }
    case 'status_link_sent':        return { label: 'was sent a status link', accent: 'grey' }
    case 'supplement_filed':        return { label: 'supplement filed', accent: 'teal' }
    case 'insurance_auto_approved': return { label: 'insurance approved', accent: 'teal' }
    default:                        return { label: eventType.replace(/_/g, ' '), accent: 'grey' }
  }
}

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { companyId: _actCompanyId, proId: _actProId, role: _actRole } = __auth
  const { searchParams } = new URL(req.url)
  const limit  = Math.min(Number(searchParams.get('limit')) || 15, 50)

  const sb = getSupabaseAdmin()

  // Member: only activity on their assigned leads
  let _actLeadIds: string[] | null = null
  if (_actRole === 'member' && _actProId && _actCompanyId) {
    const { data: _ml } = await sb.from('leads').select('id')
      .eq('company_id', _actCompanyId).eq('assigned_to_pro_id', _actProId).is('deleted_at', null)
    _actLeadIds = (_ml ?? []).map((l: any) => l.id)
  }

  let _actQ = sb.from('pipeline_events')
    .select('id, lead_id, event_type, event_data, created_at, pro_id')
    .eq(_actCompanyId ? 'company_id' : 'pro_id', _actCompanyId ?? _actProId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (_actLeadIds !== null && _actLeadIds.length > 0) _actQ = _actQ.in('lead_id', _actLeadIds)
  if (_actLeadIds !== null && _actLeadIds.length === 0) return NextResponse.json({ activity: [] })
  const { data: events, error } = await _actQ

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = events || []

  // Resolve lead display names and actor names in parallel
  const leadIds = Array.from(new Set(rows.map(r => r.lead_id).filter(Boolean)))
  const actorIds = Array.from(new Set(rows.map((r: any) => r.pro_id).filter(Boolean)))
  const names: Record<string, string> = {}
  const actorNames: Record<string, string> = {}
  await Promise.all([
    leadIds.length ? sb.from('leads').select('id, contact_name').in('id', leadIds)
      .then(({ data }) => { for (const l of data || []) names[l.id] = l.contact_name || 'A lead' }) : Promise.resolve(),
    actorIds.length ? sb.from('pros').select('id, full_name').in('id', actorIds)
      .then(({ data }) => { for (const p of data || []) actorNames[p.id] = p.full_name || '' }) : Promise.resolve(),
  ])

  const activity = rows.map(r => {
    const { label, accent } = describe(r.event_type, (r.event_data || {}) as Record<string, unknown>)
    const actorProId = (r as any).pro_id
    // Show actor attribution only when it differs from caller (owner sees 'by Brian')
    const actorName = actorProId && actorProId !== _actProId ? actorNames[actorProId] : null
    const actorFirst = actorName ? actorName.split(' ')[0] : null
    return {
      id:         r.id,
      lead_id:    r.lead_id,
      name:       (r.lead_id && names[r.lead_id]) || 'A lead',
      label,
      accent,
      actor:      actorFirst,  // null = done by caller themselves
      created_at: r.created_at,
    }
  })

  return NextResponse.json({ activity })
}
