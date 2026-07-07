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

  const { data, error } = await sb
    .from('supplement_evidence_requirements')
    .select('evidence_type, description, is_required, sort_order, supplement_line_items!inner(key)')
    .in('supplement_line_items.key', keys)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[evidence] fetch failed:', error)
    return NextResponse.json({ evidence: {} })
  }

  const evidence: EvidenceMap = {}
  for (const row of (data ?? []) as any[]) {
    const key = row.supplement_line_items?.key
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
