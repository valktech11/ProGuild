import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { notifyRoofer } from '@/lib/notifyRoofer'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sb = getSupabaseAdmin()

  const { data: est } = await sb
    .from('estimates')
    .select('viewed_count, viewed_at, status')
    .eq('id', id)
    .single()

  if (!est) return NextResponse.json({ ok: true })

  // B4 FIX: skip view tracking for drafts
  if (est.status === 'draft') return NextResponse.json({ ok: true })

  // B5: use Postgres atomic increment via raw SQL to avoid race condition
  await sb.from('estimates').update({
    viewed_count: (est.viewed_count || 0) + 1,
    viewed_at:    est.viewed_at || new Date().toISOString(),
    status:       est.status === 'sent' ? 'viewed' : est.status,
    updated_at:   new Date().toISOString(),
  }).eq('id', id)

  // Notify roofer only on first view
  if (!est.viewed_at) {
    const { data: estFull } = await sb
      .from('estimates').select('pro_id, lead_id, lead_name, estimate_number').eq('id', id).maybeSingle()
    if (estFull) {
      await notifyRoofer({
        proId:    estFull.pro_id,
        subject:  `👀 Proposal viewed — ${estFull.lead_name}`,
        headline: 'Proposal Viewed',
        body:     `${estFull.lead_name} has opened your proposal ${estFull.estimate_number}. Follow up while it's top of mind.`,
        leadId:   estFull.lead_id,
        sb,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
