import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export const runtime = 'nodejs'

export interface EvidenceItem {
  evidence_type: string
  description:   string
  is_required:   boolean
  sort_order:    number
}

export type EvidenceMap = Record<string, EvidenceItem[]>

// GET /api/roofing/supplement/evidence?keys=drip_edge,valley_metal&pro_id=X
// Returns evidence requirements per line_item key for the flagged items.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pro_id = searchParams.get('pro_id')
  const keys   = (searchParams.get('keys') ?? '').split(',').map(k => k.trim()).filter(Boolean)

  const __auth = await requirePro(req, pro_id)
  if (__auth.error) return __auth.error
  if (keys.length === 0) return NextResponse.json({ evidence: {} })

  const sb = getSupabaseAdmin()

  // Two-query pattern — avoids PostgREST !inner join filter issues
  const { data: liRows } = await sb
    .from('supplement_line_items')
    .select('id, key')
    .in('key', keys)

  if (!liRows || liRows.length === 0) return NextResponse.json({ evidence: {} })

  const idToKey: Record<string, string> = {}
  for (const r of liRows as any[]) idToKey[r.id] = r.key
  const lineItemIds = Object.keys(idToKey)

  const { data, error } = await sb
    .from('supplement_evidence_requirements')
    .select('line_item_id, evidence_type, description, is_required, sort_order')
    .in('line_item_id', lineItemIds)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[evidence] fetch failed:', error)
    return NextResponse.json({ evidence: {} })
  }

  const evidence: EvidenceMap = {}
  for (const row of (data ?? []) as any[]) {
    const key = idToKey[row.line_item_id]
    if (!key) continue
    if (!evidence[key]) evidence[key] = []
    evidence[key].push({
      evidence_type: row.evidence_type,
      description:   row.description,
      is_required:   row.is_required,
      sort_order:    row.sort_order,
    })
  }

  return NextResponse.json({ evidence })
}
