import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'
import type { DBLineItem } from '@/lib/fl/supplement'

export const runtime = 'nodejs'

// GET /api/roofing/supplement/checklist?pro_id=X
// Returns Phase 1 supplement_line_items with their primary policy + code arguments.
// Used by SupplementAssistant (Phase A deterministic checklist display).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pro_id = searchParams.get('pro_id')
  const __auth = await requirePro(req, pro_id)
  if (__auth.error) return __auth.error

  const sb = getSupabaseAdmin()

  // Fetch line items
  const { data: items, error: itemsErr } = await sb
    .from('supplement_line_items')
    .select('id, key, name, category, is_deterministic, is_condition_based, sort_order')
    .eq('phase', 1)
    .order('sort_order', { ascending: true })

  if (itemsErr || !items) {
    console.error('[checklist] line_items fetch failed:', itemsErr)
    return NextResponse.json({ items: [] })
  }

  // Fetch policy + code arguments for all items in one query
  // Exclude underlayment sub-types — only fetch main (null sub_type) layers for prompt
  const itemIds = items.map((r: any) => r.id)
  const { data: args } = await sb
    .from('supplement_arguments')
    .select('line_item_id, layer, argument_text')
    .in('line_item_id', itemIds)
    .in('layer', ['policy', 'code'])
    .is('sub_type', null)

  // Build arg map: item_id → { policy, code }
  const argMap: Record<string, { policy?: string; code?: string }> = {}
  for (const row of (args ?? []) as any[]) {
    if (!argMap[row.line_item_id]) argMap[row.line_item_id] = {}
    if (row.layer === 'policy') argMap[row.line_item_id].policy = row.argument_text
    if (row.layer === 'code')   argMap[row.line_item_id].code   = row.argument_text
  }

  const result: DBLineItem[] = items.map((r: any) => ({
    key:               r.key,
    name:              r.name,
    category:          r.category,
    is_deterministic:  r.is_deterministic,
    is_condition_based:r.is_condition_based,
    sort_order:        r.sort_order,
    policy_argument:   argMap[r.id]?.policy ?? null,
    code_argument:     argMap[r.id]?.code   ?? null,
  }))

  return NextResponse.json({ items: result })
}
