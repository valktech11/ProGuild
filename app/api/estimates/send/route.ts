import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { estimateId, pro_id } = await req.json()
  if (!estimateId) return NextResponse.json({ error: 'estimateId required' }, { status: 400 })

  const sb = getSupabaseAdmin()

  // Fetch estimate with pro + lead info
  const { data: est, error } = await sb
    .from('estimates')
    .select(`
      id, estimate_number, total, status, contact_email, contact_phone,
      lead_name, valid_until, pro_id, lead_id,
      pro:pros(full_name, phone_cell, city, state, trade_slug),
      roofing:roofing_estimate_data(property_address)
    `)
    .eq('id', estimateId)
    .single()

  if (error || !est) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  // Ownership check
  if (pro_id && est.pro_id !== pro_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Resolve contact email: prefer lead (live source of truth), fall back to estimate copy
  let contactEmail = est.contact_email ?? null
  let homeownerNameResolved = est.lead_name ?? 'Homeowner'
  if ((est as any).lead_id) {
    const { data: lead } = await sb
      .from('leads')
      .select('contact_email, contact_name')
      .eq('id', (est as any).lead_id)
      .maybeSingle()
    if (lead?.contact_email) contactEmail = lead.contact_email
    if (lead?.contact_name) homeownerNameResolved = lead.contact_name
  }

  if (!contactEmail) {
    return NextResponse.json({ error: 'No email on file — add email to the lead first' }, { status: 400 })
  }

  const pro         = (est as any).pro ?? {}
  const roofing     = (est as any).roofing ?? {}
  const proName     = pro.full_name ?? 'Your Contractor'
  const proPhone    = pro.phone_cell ?? ''
  const proCity     = [pro.city, pro.state].filter(Boolean).join(', ')
  const property    = roofing.property_address ?? ''
  const estNumber   = est.estimate_number ?? 'EST'
  const total       = Number(est.total ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
  const validUntil  = est.valid_until
    ? new Date(est.valid_until).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  const homeownerName = homeownerNameResolved
  const estimateUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://proguild.ai'}/estimate/${estimateId}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0F766E,#0A5A54);padding:32px 32px 28px;">
      <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">
        Roofing Proposal
      </div>
      <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.02em;">
        ${total}
      </div>
      ${property ? `<div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:4px;">${property}</div>` : ''}
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="font-size:16px;color:#111827;margin:0 0 8px;font-weight:600;">Hi ${homeownerName},</p>
      <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 24px;">
        Your roofing proposal <strong>${estNumber}</strong> is ready to review.
        Take a look at the options, ask any questions, and approve when you're ready — everything happens online.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${estimateUrl}"
          style="display:inline-block;padding:14px 32px;background:#0F766E;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;letter-spacing:-0.01em;">
          View &amp; Approve Proposal →
        </a>
      </div>

      ${validUntil ? `
      <!-- Expiry notice -->
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#92400E;">
        ⏰ This proposal is valid until <strong>${validUntil}</strong>. Approve before it expires to lock in this price.
      </div>
      ` : ''}

      <!-- Divider -->
      <div style="border-top:1px solid #E5E7EB;margin:0 0 24px;"></div>

      <!-- Pro info -->
      <p style="font-size:14px;color:#6B7280;margin:0 0 4px;">Questions? Contact your contractor:</p>
      <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 2px;">${proName}</p>
      ${proCity ? `<p style="font-size:14px;color:#6B7280;margin:0 0 2px;">${proCity}</p>` : ''}
      ${proPhone ? `<p style="font-size:14px;color:#6B7280;margin:0;">📞 ${proPhone}</p>` : ''}
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;padding:16px 32px;text-align:center;">
      <p style="font-size:12px;color:#9CA3AF;margin:0;">
        Sent via <a href="https://proguild.ai" style="color:#0F766E;text-decoration:none;">ProGuild.ai</a>
        — the professional contractor platform
      </p>
    </div>
  </div>
</body>
</html>`

  try {
    await resend.emails.send({
      from:    'ProGuild <hello@proguild.ai>',
      to:      contactEmail,
      subject: `Your roofing proposal is ready — ${total}${property ? ` for ${property}` : ''}`,
      html,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[estimates/send] Resend error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
