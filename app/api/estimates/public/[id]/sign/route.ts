import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import crypto from 'crypto'

// POST /api/estimates/public/[id]/sign
// Accepts: { signer_name, sig_data_url, selected_tier? }
// Uploads PNG → R2, records in signatures table, marks estimate approved.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const { signer_name, sig_data_url, selected_tier } = body

  if (!signer_name || !sig_data_url) {
    return NextResponse.json({ error: 'signer_name and sig_data_url required' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()

  // Validate estimate exists and is signable
  const { data: est } = await sb
    .from('estimates')
    .select('id, status, valid_until, pro_id, lead_id, tiered_data')
    .eq('id', id).single()

  if (!est) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['sent', 'viewed'].includes(est.status))
    return NextResponse.json({ error: 'Cannot sign in current state' }, { status: 400 })
  if (new Date(est.valid_until) < new Date())
    return NextResponse.json({ error: 'Estimate expired' }, { status: 400 })

  // Convert base64 data URL → Buffer
  const base64 = sig_data_url.replace(/^data:image\/png;base64,/, '')
  const sigBuffer = Buffer.from(base64, 'base64')

  // Upload to R2
  const sigKey = `signatures/${est.pro_id}/${id}/signature-${Date.now()}.png`
  await uploadToR2(sigKey, sigBuffer, 'image/png')

  // Compute hashes for legal integrity
  const sigHash = crypto.createHash('sha256').update(sigBuffer).digest('hex')
  const docSnapshot = JSON.stringify({ estimate_id: id, selected_tier, signed_at: new Date().toISOString() })
  const docHash = crypto.createHash('sha256').update(docSnapshot).digest('hex')

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const ua = req.headers.get('user-agent') ?? 'unknown'

  // Record signature
  await sb.from('signatures').insert({
    estimate_id:       id,
    pro_id:            est.pro_id,
    signer_name,
    signer_ip:         ip,
    signer_user_agent: ua,
    signature_r2_key:  sigKey,
    signature_hash:    sigHash,
    document_hash:     docHash,
    signed_at:         new Date().toISOString(),
  })

  // Update estimate: approved + selected tier
  const tieredData = est.tiered_data as any
  const updatedTieredData = tieredData && selected_tier
    ? { ...tieredData, selected_tier }
    : tieredData

  await sb.from('estimates').update({
    status:       'approved',
    approved_at:  new Date().toISOString(),
    tiered_data:  updatedTieredData ?? est.tiered_data,
  }).eq('id', id)

  // Auto-void sibling estimates for same lead
  if (est.lead_id) {
    await sb.from('estimates').update({
      status:      'void',
      voided_at:   new Date().toISOString(),
      void_reason: `Superseded by signed estimate`,
    }).eq('lead_id', est.lead_id).neq('id', id)
  }

  return NextResponse.json({ ok: true })
}
