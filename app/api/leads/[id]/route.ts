import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { apiError, isValidUuid } from '@/lib/api/utils'
import { LeadStatus } from '@/types'
import { getAllTradeStageKeys } from '@/lib/trades/_registry'

// ── Types ─────────────────────────────────────────────────────────────────────

// Derived from registry — never hand-maintained.
// Adding a new trade to the registry automatically includes its stages here.
const VALID_STATUSES = new Set<string>([
  ...getAllTradeStageKeys(),
  // Legacy generic stages kept for backward compat with existing lead records
  'New', 'Contacted', 'Quoted', 'Scheduled', 'Completed', 'Paid', 'Lost',
  'Archived', 'Queued_Manual', 'Converted',
])

interface LeadUpdateFields {
  lead_status?:      LeadStatus
  notes?:            string | null
  scheduled_date?:   string | null
  scheduled_time?:   string | null
  follow_up_date?:   string | null
  client_id?:        string | null
  contact_phone?:    string | null
  contact_email?:    string | null
  contact_city?:     string | null
  contact_state?:    string | null
  lead_source?:      string | null
  property_address?: string | null
  quoted_amount?:    number | null
  updated_at:        string
}

// Roofing-specific fields — written to roofing_job_data, never to leads
const ROOFING_JOB_FIELDS = [
  'insurance_claim', 'insurance_company', 'claim_number',
  'adjuster_name', 'adjuster_phone', 'adjuster_appointment',
  'claim_status', 'approved_amount', 'supplement_amount', 'deductible',
  'square_count', 'pitch', 'waste_pct', 'roof_type',
  'shingle_brand', 'shingle_model', 'warranty_term',
  'decking_replacement', 'layers', 'permit_number', 'permit_status',
] as const

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) return apiError('id must be a valid UUID', 400)

  const proId = new URL(req.url).searchParams.get('pro_id')

  const query = getSupabaseAdmin().from('leads').select('*').eq('id', id)
  if (isValidUuid(proId)) query.eq('pro_id', proId)

  const { data, error } = await query.single()

  if (error) return apiError('Lead not found', 404)

  // Join roofing_job_data so pipeline detail has measurements + insurance state
  let roofingJobData: any = null
  if ((data as any).trade_slug?.includes('roof')) {
    const { data: rd } = await getSupabaseAdmin()
      .from('roofing_job_data')
      .select('*')
      .eq('lead_id', id)
      .maybeSingle()
    roofingJobData = rd
  }

  return NextResponse.json({ lead: { ...data, roofing_job_data: roofingJobData } })
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) return apiError('id must be a valid UUID', 400)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON in request body', 400)
  }

  if (!body || typeof body !== 'object') return apiError('Request body must be a JSON object', 400)

  // Ownership: pro_id accepted from body OR query param — frontend sends in body
  const proId = (body.pro_id as string) || new URL(req.url).searchParams.get('pro_id')
  if (!isValidUuid(proId)) return apiError('pro_id required', 401)

  const updateFields: Partial<LeadUpdateFields> = {}

  // Validate and whitelist each field — never forward unknown keys to DB
  if ('lead_status' in body) {
    const s = body.lead_status as string
    if (!VALID_STATUSES.has(s as LeadStatus)) {
      return apiError(`Invalid lead_status: "${s}"`, 400)
    }
    updateFields.lead_status = s as LeadStatus
  }
  if ('quoted_amount' in body) {
    const qa = body.quoted_amount
    if (qa !== null) {
      const n = Number(qa)
      if (!isFinite(n) || n < 0) return apiError('quoted_amount must be a non-negative number', 400)
      updateFields.quoted_amount = Math.round(n * 100) / 100  // cap to cents
    } else {
      updateFields.quoted_amount = null
    }
  }
  // String/nullable fields — accept string or null only
  const STRING_FIELDS = [
    'notes', 'scheduled_date', 'scheduled_time', 'follow_up_date',
    'client_id', 'contact_phone', 'contact_email', 'contact_city',
    'contact_state', 'lead_source', 'property_address',
  ] as const
  for (const key of STRING_FIELDS) {
    if (key in body) {
      const v = body[key]
      if (v !== null && typeof v !== 'string') {
        return apiError(`${key} must be a string or null`, 400)
      }
      updateFields[key] = (v as string | null) || null
    }
  }

  if (Object.keys(updateFields).length === 0) {
    return apiError('No valid fields provided', 400)
  }

  updateFields.updated_at = new Date().toISOString()

  const { data, error } = await getSupabaseAdmin()
    .from('leads')
    .update(updateFields)
    .eq('id', id)
    .eq('pro_id', proId)   // ownership enforced at DB level
    .select()
    .single()

  if (error || !data) return apiError('Lead not found or access denied', 403)

  // ── Roofing-specific fields → roofing_job_data ───────────────────────────
  // InsuranceClaimFields and other roofing components send these fields.
  // They must never land on the leads table — they go here.
  const roofingPayload: Record<string, unknown> = {}
  for (const field of ROOFING_JOB_FIELDS) {
    if (field in body) roofingPayload[field] = body[field]
  }

  if (Object.keys(roofingPayload).length > 0) {
    roofingPayload.lead_id    = id
    roofingPayload.pro_id     = proId
    roofingPayload.updated_at = new Date().toISOString()
    await getSupabaseAdmin()
      .from('roofing_job_data')
      .upsert(roofingPayload, { onConflict: 'lead_id' })
    // Non-fatal — don't block the leads update response
  }

  return NextResponse.json({ lead: data })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!isValidUuid(id)) return apiError('id must be a valid UUID', 400)

  // Ownership required on DELETE too
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!isValidUuid(proId)) return apiError('pro_id query param required', 401)

  const { error } = await getSupabaseAdmin()
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('pro_id', proId)

  if (error) return apiError('Delete failed', 500, error)
  return NextResponse.json({ success: true })
}
