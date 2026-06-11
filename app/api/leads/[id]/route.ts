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
  inspection_date?:  string | null
  scheduled_time?:   string | null
  follow_up_date?:   string | null
  client_id?:        string | null
  contact_phone?:    string | null
  contact_email?:    string | null
  contact_city?:     string | null
  contact_state?:    string | null
  contact_zip?:      string | null
  lead_source?:      string | null
  property_address?: string | null
  quoted_amount?:    number | null
  updated_at:        string
  lead_status_changed_at?: string
}

// Roofing-specific fields — written to roofing_job_data, never to leads
const ROOFING_JOB_FIELDS = [
  'insurance_claim', 'insurance_company', 'claim_number',
  'adjuster_name', 'adjuster_phone', 'adjuster_appointment',
  'claim_status', 'approved_amount', 'supplement_amount', 'deductible',
  'date_of_loss', 'roof_install_date',
  'square_count', 'pitch', 'waste_pct', 'roof_type',
  'shingle_brand', 'shingle_model', 'warranty_term',
  'decking_replacement', 'layers', 'permit_number', 'permit_status',
  'labour_amount',
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

  // Join roofing_job_data — always attempt; returns null if no row exists.
  const { data: rd } = await getSupabaseAdmin()
    .from('roofing_job_data')
    .select('*')
    .eq('lead_id', id)
    .maybeSingle()

  // Always read latest roof_report for this property to get measurements + LF
  // roof_reports is the single source of truth for linear_footage
  // roofing_job_data holds job-level data (insurance, labour etc) — not report data
  let roofingJobData = rd ?? null
  if (data.property_id) {
    const { data: latestReport } = await getSupabaseAdmin()
      .from('roof_reports')
      .select('total_squares_order, dominant_pitch, waste_factor, linear_footage, r2_url')
      .eq('pro_id', data.pro_id)
      .eq('property_id', data.property_id)
      .not('total_squares_order', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestReport) {
      roofingJobData = {
        ...(roofingJobData ?? {}),
        // Measurements: always use report values — they are the authoritative source
        square_count:   latestReport.total_squares_order ?? roofingJobData?.square_count ?? null,
        pitch:          latestReport.dominant_pitch      ?? roofingJobData?.pitch         ?? null,
        waste_pct:      latestReport.waste_factor        ?? roofingJobData?.waste_pct     ?? null,
        // LF: from roof_reports only — never stored in roofing_job_data
        linear_footage: latestReport.linear_footage      ?? null,
        // Report PDF link so the lead can download without going to the property page
        report_url:     latestReport.r2_url              ?? null,
      }
    }
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

  // ── Build lead update fields (whitelisted) ──────────────────────────────
  const updateFields: Partial<LeadUpdateFields> = {}

  if ('lead_status' in body) {
    const s = body.lead_status as string
    if (!VALID_STATUSES.has(s as LeadStatus)) {
      return apiError(`Invalid lead_status: "${s}"`, 400)
    }
    updateFields.lead_status = s as LeadStatus
    updateFields.lead_status_changed_at = new Date().toISOString()
  }
  if ('quoted_amount' in body) {
    const qa = body.quoted_amount
    if (qa !== null) {
      const n = Number(qa)
      if (!isFinite(n) || n < 0) return apiError('quoted_amount must be a non-negative number', 400)
      updateFields.quoted_amount = Math.round(n * 100) / 100
    } else {
      updateFields.quoted_amount = null
    }
  }
  const STRING_FIELDS = [
    'notes', 'scheduled_date', 'scheduled_time', 'inspection_date', 'follow_up_date',
    'client_id', 'contact_phone', 'contact_email', 'contact_city',
    'contact_state', 'contact_zip', 'lead_source', 'property_address',
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

  // ── Build roofing payload (independent of lead fields) ───────────────────
  const roofingPayload: Record<string, unknown> = {}
  for (const field of ROOFING_JOB_FIELDS) {
    if (field in body) roofingPayload[field] = body[field]
  }

  // Guard: at least one valid field must be present across either table
  if (Object.keys(updateFields).length === 0 && Object.keys(roofingPayload).length === 0) {
    return apiError('No valid fields provided', 400)
  }

  // ── Update leads table (only if lead fields present) ─────────────────────
  let leadData: Record<string, unknown> | null = null
  if (Object.keys(updateFields).length > 0) {
    updateFields.updated_at = new Date().toISOString()
    console.log('[PATCH /api/leads] updating lead', id, 'pro', proId, 'fields:', JSON.stringify(updateFields))
    const { data, error } = await getSupabaseAdmin()
      .from('leads')
      .update(updateFields)
      .eq('id', id)
      .eq('pro_id', proId)
      .select()
      .single()
    if (error || !data) {
      // TEMP DIAGNOSTIC: surface the real Postgres error instead of a generic 403
      console.error('[PATCH /api/leads] UPDATE FAILED:', {
        message: error?.message, details: error?.details, hint: error?.hint, code: error?.code,
        fields: Object.keys(updateFields),
      })
      return NextResponse.json({
        error: 'Lead update failed',
        _debug: {
          message: error?.message ?? null,
          details: error?.details ?? null,
          hint:    error?.hint ?? null,
          code:    error?.code ?? null,
          fields:  Object.keys(updateFields),
        },
      }, { status: 400 })
    }
    leadData = data
  }

  // ── Write pipeline_event if lead_status changed ──────────────────────────
  if (updateFields.lead_status && leadData) {
    const prevStatus = body._prev_status as string | undefined
    try {
      await getSupabaseAdmin().from('pipeline_events').insert({
        lead_id:    id,
        pro_id:     proId,
        event_type: 'stage_changed',
        event_data: { from: prevStatus ?? null, to: updateFields.lead_status },
        actor_type: 'pro',
        created_at: new Date().toISOString(),
      })
    } catch { /* non-fatal */ }
  }

  // ── Upsert roofing_job_data (only if roofing fields present) ─────────────
  if (Object.keys(roofingPayload).length > 0) {
    roofingPayload.lead_id    = id
    roofingPayload.pro_id     = proId
    roofingPayload.updated_at = new Date().toISOString()
    const { error: rErr } = await getSupabaseAdmin()
      .from('roofing_job_data')
      .upsert(roofingPayload, { onConflict: 'lead_id' })
    console.log('[PATCH /api/leads] roofing_job_data upsert — lead_id:', id, 'fields:', Object.keys(roofingPayload).filter(k=>!['lead_id','pro_id','updated_at'].includes(k)), 'error:', rErr?.message ?? 'OK')
    if (rErr) console.error('[PATCH /api/leads] roofing_job_data upsert error:', rErr)
  }

  // Return lead with roofing_job_data so callers can update UI without a separate GET
  const { data: updatedRjd } = await getSupabaseAdmin()
    .from('roofing_job_data').select('*').eq('lead_id', id).maybeSingle()
  if (leadData) {
    return NextResponse.json({ lead: { ...leadData, roofing_job_data: updatedRjd ?? null } })
  }
  if (Object.keys(roofingPayload).length > 0) {
    const { data: freshLead } = await getSupabaseAdmin()
      .from('leads').select('*').eq('id', id).eq('pro_id', proId).single()
    if (freshLead) return NextResponse.json({ lead: { ...freshLead, roofing_job_data: updatedRjd ?? null } })
  }
  return NextResponse.json({ success: true })
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
