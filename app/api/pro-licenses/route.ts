import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requirePro } from '@/lib/pro-auth'

// Licenses are strictly personal to a pro. The signed-in pro may only read or
// mutate their own — never trust a client-supplied pro_id as identity.
export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { data } = await getSupabaseAdmin()
    .from('pro_licenses')
    .select('*')
    .eq('pro_id', __auth.proId!)
    .order('is_primary', { ascending: false })
    .order('created_at')
  return NextResponse.json({ licenses: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { trade_name, license_number, license_expiry_date, is_primary } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  const proId = __auth.proId!
  if (!trade_name || !license_number)
    return NextResponse.json({ error: 'trade_name and license_number required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // If setting as primary, unset others first
  if (is_primary) {
    await sb.from('pro_licenses').update({ is_primary: false }).eq('pro_id', proId)
  }

  const { data, error } = await sb
    .from('pro_licenses')
    .upsert({
      pro_id: proId,
      trade_name: trade_name.trim(),
      license_number: license_number.trim(),
      license_expiry_date: license_expiry_date || null,
      license_status: 'active',
      is_primary: is_primary || false,
    }, { onConflict: 'pro_id,license_number' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync primary license back to pros table for backwards compatibility
  if (is_primary) {
    await sb.from('pros').update({
      license_number: license_number.trim(),
      license_expiry_date: license_expiry_date || null,
    }).eq('id', proId)
  }

  return NextResponse.json({ license: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json()
  const { id } = body
  const __auth = await requirePro(req, body?.pro_id)
  if (__auth.error) return __auth.error
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await getSupabaseAdmin().from('pro_licenses').delete().eq('id', id).eq('pro_id', __auth.proId!)
  return NextResponse.json({ ok: true })
}
