// app/api/homeowner-portal/route.ts
// POST — generate or retrieve portal token for a lead (pro-scoped).
// Returns the portal URL.

export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const auth = await requirePro(req)
  if (auth.error) return auth.error

  const { lead_id } = await req.json()
  if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Verify lead ownership
  const { data: lead } = await sb.from('leads').select('id')
    .eq('id', lead_id).eq('pro_id', auth.proId).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Upsert token (one per lead)
  const { data: existing } = await sb
    .from('homeowner_portal_tokens')
    .select('token').eq('lead_id', lead_id).maybeSingle()

  let token = existing?.token
  if (!token) {
    const { data: created } = await sb
      .from('homeowner_portal_tokens')
      .insert({ lead_id, pro_id: auth.proId })
      .select('token').single()
    token = created?.token
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://staging.proguild.ai'
  return NextResponse.json({ token, url: `${baseUrl}/job/${token}` })
}
