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

  let q = getSupabaseAdmin()
    .from('properties')
    .select('id, address_line1, city, state, zip_code, pro_id, company_id, assigned_to_pro_id, created_at, updated_at')
    .eq(_scopeRole === 'member' ? 'assigned_to_pro_id' : (_scopeCompanyId ? 'company_id' : 'pro_id'), _scopeRole === 'member' ? proId! : (_scopeCompanyId ?? proId!))
    .order('created_at', { ascending: false })

  if (search) q = q.ilike('address_line1', `%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const properties = (data || []).map((p: any) => {
    return {
      ...p,
      report_count:  0,
      latest_sq:     null,
      latest_pitch:  null,
      last_report_at: latest ? latest.created_at : null,
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

  // If city/state/zip are provided separately, strip them from address_line1
  // Prevents full address string being stored in street field
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
