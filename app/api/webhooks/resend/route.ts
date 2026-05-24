import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { createHmac } from 'crypto'

// Resend webhook — receives email delivery events and updates estimate/invoice status
// Events: email.sent, email.delivered, email.bounced, email.complained
//
// Setup: Resend dashboard → Webhooks → add URL → copy signing secret → RESEND_WEBHOOK_SECRET env var

function verifyResendSignature(payload: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[webhooks/resend] RESEND_WEBHOOK_SECRET not set — skipping verification')
    return true // allow in dev; fail closed in prod by setting the env var
  }
  // Resend uses Svix for webhook signing
  const svixId        = headers.get('svix-id') ?? ''
  const svixTimestamp = headers.get('svix-timestamp') ?? ''
  const svixSignature = headers.get('svix-signature') ?? ''

  if (!svixId || !svixTimestamp || !svixSignature) return false

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`
  const secretBytes   = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const computed      = createHmac('sha256', secretBytes).update(signedContent).digest('base64')

  // svix-signature may contain multiple sigs: "v1,sig1 v1,sig2"
  const signatures = svixSignature.split(' ').map(s => s.replace(/^v1,/, ''))
  return signatures.some(sig => sig === computed)
}

export async function POST(req: NextRequest) {
  const body = await req.text()

  if (!verifyResendSignature(body, req.headers)) {
    console.error('[webhooks/resend] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type      = event.type as string         // e.g. 'email.bounced'
  const emailId   = event.data?.email_id as string | undefined  // Resend message ID
  const to        = event.data?.to?.[0] as string | undefined

  if (!emailId) {
    return NextResponse.json({ ok: true, skipped: 'no email_id' })
  }

  const sb = getSupabaseAdmin()

  // Map Resend event type → our email_status
  const statusMap: Record<string, string> = {
    'email.sent':       'sent',
    'email.delivered':  'delivered',
    'email.bounced':    'bounced',
    'email.complained': 'complained',
    'email.opened':     'opened',
    'email.clicked':    'clicked',
  }
  const emailStatus = statusMap[type]
  if (!emailStatus) {
    return NextResponse.json({ ok: true, skipped: `unhandled event type: ${type}` })
  }

  const bounceReason = type === 'email.bounced'
    ? (event.data?.bounce?.message ?? event.data?.reason ?? 'Recipient not found')
    : null

  const updatePayload: Record<string, unknown> = {
    email_status:  emailStatus,
    updated_at:    new Date().toISOString(),
  }
  if (bounceReason) updatePayload.email_bounce_reason = bounceReason

  // Match by resend_message_id — try estimates first, then invoices
  const [estRes, invRes] = await Promise.all([
    sb.from('estimates')
      .update(updatePayload)
      .eq('resend_message_id', emailId)
      .select('id, lead_id, estimate_number')
      .maybeSingle(),
    sb.from('invoices')
      .update(updatePayload)
      .eq('resend_message_id', emailId)
      .select('id, lead_id, invoice_number')
      .maybeSingle(),
  ])

  const matched = estRes.data ?? invRes.data

  if (!matched) {
    // Not found by message ID — log but don't error (could be an old email pre-tracing)
    console.warn(`[webhooks/resend] No estimate/invoice found for message ID: ${emailId} (${type})`)
    return NextResponse.json({ ok: true, matched: false })
  }

  console.log(`[webhooks/resend] ${type} → ${estRes.data ? 'estimate' : 'invoice'} ${emailId}`)
  return NextResponse.json({ ok: true, matched: true, id: matched.id })
}
