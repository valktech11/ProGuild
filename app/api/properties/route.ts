import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  const _scopeCompanyId = __auth.companyId
  const _scopeRole = __auth.role
  const search = searchParams.get('search')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Member: scope to property_ids from their assigned leads only
  let propertyIdFilter: string[] | null = null
  if (_scopeRole === 'member' && proId) {
    const { data: ml } = await sb.from('leads').select('property_id')
      .eq('assigned_to_pro_id', proId).is('deleted_at', null).not('property_id', 'is', null)
    propertyIdFilter = (ml ?? []).map((l: any) => l.property_id as string)
    if (propertyIdFilter.length === 0) return NextResponse.json({ properties: [] })
  }

  let q = sb
    .from('properties')
    .select('id, address_line1, city, state, zip_code, pro_id, company_id, created_at, updated_at')
    .eq(_scopeCompanyId ? 'company_id' : 'pro_id', _scopeCompanyId ?? proId!)
    .order('created_at', { ascending: false })
    .limit(100)

  if (propertyIdFilter !== null) q = q.in('id', propertyIdFilter)
  if (search) q = q.ilike('address_line1', `%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const props = data || []
  if (props.length === 0) return NextResponse.json({ properties: [] })

  const propIds = props.map((p: any) => p.id as string)

  // Fetch job counts and latest reports in parallel
  const [leadsRes, reportsRes] = await Promise.all([
    sb.from('leads')
      .select('property_id, lead_status, quoted_amount')
      .in('property_id', propIds)
      .is('deleted_at', null),
    sb.from('roof_reports')
      .select('property_id, total_squares_order, dominant_pitch, waste_factor, created_at')
      .in('property_id', propIds)
      .order('created_at', { ascending: false }),
  ])

  // Index by property_id
  const leadsByProp = new Map<string, any[]>()
  for (const l of leadsRes.data || []) {
    const pid = l.property_id as string
    if (!leadsByProp.has(pid)) leadsByProp.set(pid, [])
    leadsByProp.get(pid)!.push(l)
  }

  const reportsByProp = new Map<string, any>()
  for (const r of reportsRes.data || []) {
    const pid = r.property_id as string
    if (!reportsByProp.has(pid)) reportsByProp.set(pid, r) // first = latest
  }

  const WON = ['job_won', 'complete']
  const properties = props.map((p: any) => {
    const leads  = leadsByProp.get(p.id) || []
    const report = reportsByProp.get(p.id)
    const wonLeads = leads.filter((l: any) => WON.includes(l.lead_status))
    const revenue  = wonLeads.reduce((s: number, l: any) => s + (l.quoted_amount || 0), 0)
    return {
      ...p,
      job_count:     leads.length,
      won_count:     wonLeads.length,
      lifetime_value: revenue,
      report_count:  report ? 1 : 0,
      latest_sq:     report ? report.total_squares_order : null,
      latest_pitch:  report ? report.dominant_pitch : null,
      latest_waste:  report ? report.waste_factor : null,
      last_report_at: report ? report.created_at : null,
    }
  })

  return NextResponse.json({ properties })
}

export async function POST(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const body = await req.json()
  const { pro_id, address_line1: rawAddr, city, state, zip_code, ...rest } = body
  if (!pro_id || !rawAddr) {
    return NextResponse.json({ error: 'pro_id and address_line1 required' }, { status: 400 })
  }

  const address_line1 = (city || state || zip_code)
    ? rawAddr.split(',')[0].trim()
    : rawAddr.trim()

  const { data, error } = await getSupabaseAdmin()
    .from('properties')
    .insert({ pro_id, address_line1, city: city || null, state: state || null, zip_code: zip_code || null, ...rest })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ property: data }, { status: 201 })
}
