// POST /api/leads/send-status-email
// Sends (or resends) the homeowner status page link via email.
// Called automatically when stage moves to inspection_scheduled,
// and on-demand when the pro clicks the Share button.
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getSupabaseAdmin } from '@/lib/supabase'
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)
const SITE   = process.env.NEXT_PUBLIC_SITE_URL || 'https://proguild.ai'

export async function POST(req: NextRequest) {
  try {
    const { lead_id, pro_id } = await req.json()
    if (!lead_id || !pro_id) return NextResponse.json({ error: 'lead_id and pro_id required' }, { status: 400 })

    const sb = getSupabaseAdmin()

    // Fetch lead
    const { data: lead, error: lErr } = await sb
      .from('leads')
      .select('id, pro_id, contact_name, contact_email, property_address, lead_status, public_token, inspection_date')
      .eq('id', lead_id)
      .eq('pro_id', pro_id)
      .single()
    if (lErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (!lead.contact_email) return NextResponse.json({ error: 'No email on file for this homeowner' }, { status: 422 })

    // Ensure public_token exists
    let token = lead.public_token as string | null
    if (!token) {
      token = crypto.randomBytes(24).toString('hex')
      await sb.from('leads').update({ public_token: token }).eq('id', lead_id)
    }

    // Pro branding
    const { data: pro } = await sb
      .from('pros')
      .select('full_name, business_name, phone_cell, city, state')
      .eq('id', pro_id)
      .single()

    const proName    = pro?.business_name || pro?.full_name || 'Your roofer'
    const proCity    = [pro?.city, pro?.state].filter(Boolean).join(', ')
    const statusUrl  = `${SITE}/status/${token}`
    const homeowner  = (lead.contact_name as string | null) || 'Homeowner'
    const address    = (lead.property_address as string | null)?.replace(/, USA$/i, '') ?? ''
    const inspDate   = lead.inspection_date
      ? new Date(lead.inspection_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : null

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0F766E,#0A5A54);padding:32px 32px 28px;">
      <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">
        Inspection Confirmed
      </div>
      <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-0.02em;line-height:1.2;">
        Your roof inspection<br>is scheduled
      </div>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        Hi ${homeowner},
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
        ${proName} has scheduled a roof inspection for your property${address ? ` at <strong>${address}</strong>` : ''}.${inspDate ? ` We'll see you on <strong>${inspDate}</strong>.` : ''}
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
        You can track your project status anytime using the link below — no login needed.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${statusUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#0F766E,#0D9488);color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:0.01em;">
          Track My Project →
        </a>
      </div>

      <p style="margin:24px 0 0;font-size:13px;color:#6B7280;line-height:1.6;">
        Or copy this link: <a href="${statusUrl}" style="color:#0F766E;">${statusUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 32px;text-align:center;">
      <p style="margin:0;font-size:13px;color:#9CA3AF;">
        ${proName}${proCity ? ` · ${proCity}` : ''}<br>
        <span style="font-size:11px;">Powered by <strong>ProGuild.ai</strong></span>
      </p>
    </div>
  </div>
</body>
</html>`

    const { error: sendErr } = await resend.emails.send({
      from:    'ProGuild <hello@proguild.ai>',
      to:      lead.contact_email as string,
      subject: `Your roof inspection is scheduled — track your project`,
      html,
    })

    if (sendErr) {
      console.error('[send-status-email] Resend error:', sendErr)
      return NextResponse.json({ error: 'Email failed to send' }, { status: 500 })
    }

    // Log to pipeline_events
    try {
      await sb.from('pipeline_events').insert({
        lead_id,
        pro_id,
        event_type: 'status_link_sent',
        event_data: { to: lead.contact_email },
        actor_type: 'system',
        created_at: new Date().toISOString(),
      })
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, sentTo: lead.contact_email })
  } catch (err) {
    console.error('[send-status-email]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
