import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { uploadToR2 } from '@/lib/r2'
import { applyEstimateSignedEffects } from '@/lib/trades/roofing/applySignedEffects'
import crypto from 'crypto'

// POST /api/estimates/[id]/sign-offline
// Contractor-initiated, in-person signature capture: the homeowner signs on the
// rep's device. We record the signature (channel = in-person) and then run the
// exact same signed-effects engine as the public link — so the consequences
// (estimate approved, invoice created, lead -> proposal_signed, email) are
// identical regardless of where the signature was captured.
//
// Accepts: { pro_id, signer_name, sig_data_url, selected_tier? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await req.json()
  const { pro_id, signer_name, sig_data_url, selected_tier } = body

  if (!pro_id) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  if (!signer_name || !sig_data_url)
    return NextResponse.json({ error: 'signer_name and sig_data_url required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  const { data: est } = await sb
    .from('estimates')
    .select('id, status, valid_until, pro_id, lead_id, tax_rate, revision_of, estimate_number')
    .eq('id', id).single()

  if (!est) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Ownership guard — a pro may only sign their own estimate.
  if (est.pro_id !== pro_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // In person the rep may also sign a freshly created draft, not only sent/viewed.
  if (!['draft', 'sent', 'viewed'].includes(est.status))
    return NextResponse.json({ error: 'Cannot sign in current state' }, { status: 400 })
  if (est.valid_until && new Date(est.valid_until) < new Date())
    return NextResponse.json({ error: 'Estimate expired' }, { status: 400 })

  const { data: roofingEst } = await sb
    .from('roofing_estimate_data')
    .select('tiered_data, estimate_type, payment_milestones')
    .eq('estimate_id', id).maybeSingle()

  // Convert base64 data URL → Buffer
  const base64 = sig_data_url.replace(/^data:image\/png;base64,/, '')
  const sigBuffer = Buffer.from(base64, 'base64')

  // Upload to R2
  const sigKey = `signatures/${est.pro_id}/${id}/signature-inperson-${Date.now()}.png`
  await uploadToR2(sigKey, sigBuffer, 'image/png')

  // Hashes for legal integrity — same scheme as the remote signature.
  const sigHash = crypto.createHash('sha256').update(sigBuffer).digest('hex')
  const docSnapshot = JSON.stringify({ estimate_id: id, selected_tier, channel: 'in_person', signed_at: new Date().toISOString() })
  const docHash = crypto.createHash('sha256').update(docSnapshot).digest('hex')

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const ua = req.headers.get('user-agent') ?? 'unknown'

  // Record signature. Channel is marked in-person in the user-agent field for now
  // (no dedicated `channel` column yet — clean follow-up). signer_ip is the rep's
  // device, which is the honest provenance for an in-person capture.
  await sb.from('signatures').insert({
    estimate_id:       id,
    pro_id:            est.pro_id,
    signer_name,
    signer_ip:         ip,
    signer_user_agent: `[in-person/pro-device] ${ua}`,
    signature_r2_key:  sigKey,
    signature_hash:    sigHash,
    document_hash:     docHash,
    signed_at:         new Date().toISOString(),
  })

  await applyEstimateSignedEffects(sb, {
    est,
    roofingEst,
    selectedTier: selected_tier ?? null,
    signerName: signer_name,
  })

  return NextResponse.json({ ok: true })
}
