// app/api/leads/import/route.ts
// POST multipart — CSV import of leads.
// Accepts: contact_name, contact_email, contact_phone, property_address,
//          contact_city, contact_state, contact_zip, lead_source, notes
// Auth: requirePro. Returns { imported, skipped, errors }.

export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

interface CsvRow {
  contact_name?:   string
  contact_email?:  string
  contact_phone?:  string
  property_address?: string
  contact_city?:   string
  contact_state?:  string
  contact_zip?:    string
  lead_source?:    string
  notes?:          string
  [key: string]:   string | undefined
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const row: CsvRow = {}
    headers.forEach((h, i) => { if (h) row[h] = cols[i] ?? '' })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

const ALIAS: Record<string, string> = {
  name: 'contact_name', email: 'contact_email', phone: 'contact_phone',
  address: 'property_address', city: 'contact_city', state: 'contact_state',
  zip: 'contact_zip', source: 'lead_source', note: 'notes',
  'first_name': 'contact_name', 'full_name': 'contact_name',
}

function normalize(row: CsvRow): CsvRow {
  const out: CsvRow = { ...row }
  for (const [k, v] of Object.entries(ALIAS)) {
    if (row[k] && !out[v]) { out[v] = row[k]; delete out[k] }
  }
  return out
}

export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const text = await file.text()
  const rawRows = parseCsv(text)
  if (!rawRows.length) return NextResponse.json({ error: 'No rows found in CSV' }, { status: 400 })

  const sb = getSupabaseAdmin()
  let imported = 0, skipped = 0
  const errors: string[] = []

  for (const rawRow of rawRows.slice(0, 500)) { // max 500 per import
    const row = normalize(rawRow)
    const name = (row.contact_name ?? '').trim()
    if (!name) { skipped++; continue }

    try {
      const { error } = await sb.from('leads').insert({
        pro_id:           auth.proId,
        contact_name:     name,
        contact_email:    row.contact_email || null,
        contact_phone:    row.contact_phone || null,
        property_address: row.property_address || null,
        contact_city:     row.contact_city || null,
        contact_state:    row.contact_state || null,
        contact_zip:      row.contact_zip || null,
        lead_source:      row.lead_source || 'Import',
        notes:            row.notes || null,
        lead_status:      'lead_in',
        is_manual:        true,
      })
      if (error) { errors.push(`${name}: ${error.message}`); skipped++ }
      else imported++
    } catch (e: unknown) {
      errors.push(`${name}: ${e instanceof Error ? e.message : 'Unknown'}`)
      skipped++
    }
  }

  return NextResponse.json({ imported, skipped, errors: errors.length ? errors.slice(0, 20) : undefined })
}
