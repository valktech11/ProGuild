import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

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
  const { searchParams } = new URL(req.url)
  const pro_id = searchParams.get('pro_id')
  const limit  = Math.min(Number(searchParams.get('limit')) || 15, 50)

  if (!pro_id) {
    return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  const { data: events, error } = await sb
    .from('pipeline_events')
    .select('id, lead_id, event_type, event_data, created_at')
    .eq('pro_id', pro_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = events || []

  // Resolve lead display names in a single query.
  const leadIds = Array.from(new Set(rows.map(r => r.lead_id).filter(Boolean)))
  const names: Record<string, string> = {}
  if (leadIds.length) {
    const { data: leads } = await sb
      .from('leads')
      .select('id, contact_name')
      .in('id', leadIds)
    for (const l of leads || []) names[l.id] = l.contact_name || 'A lead'
  }

  const activity = rows.map(r => {
    const { label, accent } = describe(r.event_type, (r.event_data || {}) as Record<string, unknown>)
    return {
      id:         r.id,
      lead_id:    r.lead_id,
      name:       (r.lead_id && names[r.lead_id]) || 'A lead',
      label,
      accent,
      created_at: r.created_at,
    }
  })

  return NextResponse.json({ activity })
}
