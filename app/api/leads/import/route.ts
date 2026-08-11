// app/api/leads/import/route.ts
// POST multipart — CSV import of leads with full roofing job + insurance data.
// Supported fields:
//   CONTACT: contact_name*, contact_email, contact_phone
//   PROPERTY: property_address, contact_city, contact_state, contact_zip
//   JOB: lead_status, lead_source, follow_up_date, notes, job_value
//   INSURANCE: insurance_claim, insurance_company, claim_number, claim_status,
//              date_of_loss, approved_amount, deductible, supplement_amount,
//              adjuster_name, adjuster_phone, roof_install_date
// * required. Max 500 rows.

export const runtime = 'nodejs'
export const maxDuration = 45

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { auditedAdmin } from '@/lib/audit-context'

// ── CSV parse ────────────────────────────────────────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const rawHeaders = lines[0].split(',')
  const headers = rawHeaders.map(h =>
    h.trim().replace(/^"|"$/g, '').toLowerCase()
      .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
  return lines.slice(1).map(line => {
    const cols: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) { if (ch === '"') inQ = false; else cur += ch }
      else if (ch === '"') inQ = true
      else if (ch === ',') { cols.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cols.push(cur.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { if (h) row[h] = cols[i] ?? '' })
    return row
  }).filter(r => Object.values(r).some(v => v?.trim()))
}

// ── Field aliases (JobNimbus / Roofr / AccuLynx column names) ────────────────
const ALIAS: Record<string, string> = {
  name: 'contact_name', 'first_name': 'contact_name', 'full_name': 'contact_name',
  'customer_name': 'contact_name', 'homeowner': 'contact_name',
  email: 'contact_email', 'customer_email': 'contact_email',
  phone: 'contact_phone', 'mobile': 'contact_phone', 'cell': 'contact_phone',
  address: 'property_address', 'street': 'property_address', 'street_address': 'property_address',
  city: 'contact_city', state: 'contact_state', zip: 'contact_zip', 'postal_code': 'contact_zip',
  source: 'lead_source', 'job_source': 'lead_source', 'marketing_source': 'lead_source',
  note: 'notes', 'job_notes': 'notes', 'description': 'notes',
  status: 'lead_status', 'stage': 'lead_status', 'job_status': 'lead_status',
  'value': 'job_value', 'contract_amount': 'job_value', 'job_amount': 'job_value',
  'estimate_amount': 'job_value',
  'follow_up': 'follow_up_date', 'followup': 'follow_up_date',
  'insurance': 'insurance_claim', 'is_insurance': 'insurance_claim',
  'carrier': 'insurance_company', 'insurer': 'insurance_company',
  'claim': 'claim_number', 'claim_no': 'claim_number',
  'loss_date': 'date_of_loss', 'storm_date': 'date_of_loss',
  'approved': 'approved_amount', 'settlement': 'approved_amount', 'rcv': 'approved_amount',
  'deduct': 'deductible',
  'supplement': 'supplement_amount',
  'adjuster': 'adjuster_name',
  'adjuster_tel': 'adjuster_phone',
  'install_date': 'roof_install_date', 'permit_date': 'roof_install_date',
}

// Stage aliases
const STAGE_ALIAS: Record<string, string> = {
  'new': 'lead_in', 'prospect': 'lead_in', 'lead': 'lead_in',
  'inspection': 'inspection', 'inspect': 'inspection',
  'approved': 'insurance_approved', 'ins approved': 'insurance_approved',
  'proposal': 'proposal_sent', 'estimate sent': 'proposal_sent',
  'signed': 'proposal_signed', 'contract': 'proposal_signed',
  'scheduled': 'scheduled', 'install': 'scheduled',
  'in progress': 'in_progress', 'wip': 'in_progress',
  'complete': 'job_won', 'won': 'job_won', 'closed': 'job_won',
  'lost': 'lost', 'cancelled': 'lost',
}
const VALID_STAGES = new Set(['lead_in','inspection','insurance_approved','proposal_sent',
  'proposal_signed','scheduled','in_progress','job_won','lost'])

function normalizeRow(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...raw }
  for (const [alias, canonical] of Object.entries(ALIAS)) {
    if (raw[alias] !== undefined && !out[canonical]) {
      out[canonical] = raw[alias]; delete out[alias]
    }
  }
  return out
}

function normalizeStage(s: string): string {
  const lower = s.toLowerCase().trim()
  if (VALID_STAGES.has(lower)) return lower
  return STAGE_ALIAS[lower] ?? 'lead_in'
}

function parseDate(s: string): string | null {
  if (!s?.trim()) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseNum(s: string): number | null {
  const n = parseFloat(s?.replace(/[$,]/g, '') ?? '')
  return isNaN(n) ? null : n
}

function parseBool(s: string): boolean {
  return ['yes','true','1','y','x'].includes(s?.toLowerCase().trim())
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const text    = await file.text()
  const rawRows = parseCsv(text)
  if (!rawRows.length) return NextResponse.json({ error: 'No rows found in CSV' }, { status: 400 })

  const sb = auditedAdmin(req, { actorId: auth.proId!, actorType: 'pro' })

  // Pro trade for initial stage
  const { data: pro } = await sb.from('pros').select('trade_slug').eq('id', auth.proId).maybeSingle()
  const tradeSlug = (pro as any)?.trade_slug ?? null
  const isRoofing = tradeSlug?.includes('roof') ?? false

  let imported = 0, skipped = 0
  const errors: string[] = []

  for (const rawRow of rawRows.slice(0, 500)) {
    const row = normalizeRow(rawRow)
    const name = row.contact_name?.trim()
    if (!name) { skipped++; continue }

    // Determine stage
    const rawStage   = row.lead_status?.trim()
    const leadStatus = rawStage ? normalizeStage(rawStage) : 'lead_in'

    // Insurance fields
    const hasInsurance = parseBool(row.insurance_claim ?? '')
      || !!(row.claim_number || row.insurance_company || row.date_of_loss)

    try {
      // 1. Insert lead
      const { data: lead, error: leadErr } = await sb.from('leads').insert({
        pro_id:           auth.proId,
        trade_slug:       tradeSlug,
        contact_name:     name,
        contact_email:    row.contact_email?.toLowerCase().trim() || null,
        contact_phone:    row.contact_phone?.trim() || null,
        property_address: row.property_address?.trim() || null,
        contact_city:     row.contact_city?.trim() || null,
        contact_state:    row.contact_state?.trim() || null,
        contact_zip:      row.contact_zip?.trim() || null,
        lead_source:      row.lead_source?.trim() || 'Import',
        notes:            row.notes?.trim() || null,
        lead_status:      leadStatus,
        follow_up_date:   parseDate(row.follow_up_date ?? ''),
        message:          row.notes?.trim() || `Imported from CSV`,
        is_manual:        true,
      }).select('id').single()

      if (leadErr || !lead) {
        errors.push(`${name}: ${leadErr?.message ?? 'Insert failed'}`); skipped++; continue
      }

      // 2. roofing_job_data if roofing + any job/insurance data present
      if (isRoofing && (hasInsurance || row.approved_amount || row.job_value || row.roof_install_date)) {
        await sb.from('roofing_job_data').upsert({
          lead_id:          lead.id,
          pro_id:           auth.proId,
          insurance_claim:  hasInsurance,
          insurance_company: row.insurance_company?.trim() || null,
          claim_number:     row.claim_number?.trim() || null,
          claim_status:     row.claim_status?.trim() || null,
          date_of_loss:     parseDate(row.date_of_loss ?? ''),
          approved_amount:  parseNum(row.approved_amount ?? ''),
          deductible:       parseNum(row.deductible ?? ''),
          supplement_amount: parseNum(row.supplement_amount ?? ''),
          adjuster_name:    row.adjuster_name?.trim() || null,
          adjuster_phone:   row.adjuster_phone?.trim() || null,
          roof_install_date: parseDate(row.roof_install_date ?? ''),
        }, { onConflict: 'lead_id' })
      }

      imported++
    } catch (e: unknown) {
      errors.push(`${name}: ${e instanceof Error ? e.message : 'Unknown'}`)
      skipped++
    }
  }

  return NextResponse.json({ imported, skipped, errors: errors.length ? errors.slice(0, 20) : undefined })
}
