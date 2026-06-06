import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/public/status/[token] — PUBLIC, unauthenticated, read-only.
// Returns ONLY homeowner-safe fields. No dollar amounts, no claim internals,
// no homeowner contact details, no other leads.
const STEPS: { key: string; label: string }[] = [
  { key: 'lead_in', label: 'Request received' },
  { key: 'inspection_scheduled', label: 'Inspection scheduled' },
  { key: 'insurance_approved', label: 'Insurance approved' },
  { key: 'proposal_sent', label: 'Proposal sent' },
  { key: 'proposal_signed', label: 'Proposal signed' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'Work in progress' },
  { key: 'job_won', label: 'Complete' },
]

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 16) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const sb = getSupabaseAdmin()
  const { data: lead, error } = await sb
    .from('leads')
    .select('id, pro_id, contact_name, contact_city, contact_state, property_address, lead_status, scheduled_date, property_id')
    .eq('public_token', token)
    .single()
  if (error || !lead) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Check if this is an insurance job — only then show the Insurance approved step
  const { data: rjd } = await sb
    .from('roofing_job_data')
    .select('insurance_claim')
    .eq('lead_id', lead.id)
    .maybeSingle()
  const isInsurance = !!(rjd?.insurance_claim)

  const VISIBLE_STEPS = STEPS.filter(s => s.key !== 'insurance_approved' || isInsurance)

  const status = lead.lead_status as string
  const stepIdx = VISIBLE_STEPS.findIndex(s => s.key === status)
  const closed = status === 'lost' || status === 'unqualified'

  // Pro branding (safe public fields only)
  const { data: pro } = await sb
    .from('pros')
    .select('business_name, full_name, phone_cell, email')
    .eq('id', lead.pro_id)
    .single()

  // Latest roof report condition for this property (optional, homeowner-friendly).
  // Prefer the linked property_id; fall back to matching the report address.
  let condition: { text: string | null; imageryDate: string | null; lat: number | null; lng: number | null } | null = null
  const pickCondition = (rep: { condition_assessment?: string | null; imagery_date?: string | null; lat?: number | null; lng?: number | null } | null) => {
    if (rep) condition = { text: rep.condition_assessment ?? null, imageryDate: rep.imagery_date ?? null, lat: rep.lat ?? null, lng: rep.lng ?? null }
  }
  if (lead.property_id) {
    const { data: rep } = await sb
      .from('roof_reports')
      .select('condition_assessment, imagery_date, lat, lng')
      .eq('pro_id', lead.pro_id)
      .eq('property_id', lead.property_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    pickCondition(rep)
  }
  if (!condition && lead.property_address) {
    const street = String(lead.property_address).split(',')[0].trim()
    if (street) {
      const { data: rep } = await sb
        .from('roof_reports')
        .select('condition_assessment, imagery_date, lat, lng')
        .eq('pro_id', lead.pro_id)
        .ilike('address', `${street}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      pickCondition(rep)
    }
  }

  return NextResponse.json({
    homeowner: lead.contact_name || 'Homeowner',
    address: [lead.property_address, lead.contact_city, lead.contact_state].filter(Boolean).join(', '),
    currentStep: closed ? -1 : stepIdx,
    stepLabel: closed ? 'On hold' : (VISIBLE_STEPS[stepIdx]?.label ?? 'In progress'),
    steps: VISIBLE_STEPS.map(s => s.label),
    scheduledDate: lead.scheduled_date || null,
    pro: { name: pro?.business_name || pro?.full_name || 'Your roofer', phone: pro?.phone_cell || null, email: (pro as any)?.email || null },
    condition,
  })
}
