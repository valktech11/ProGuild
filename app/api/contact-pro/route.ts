import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

// ── Feature flag — set true when ready for Phase 2 auto-send ─────────────────
const AUTO_SEND_EMAIL = false

function isRealEmail(email: string): boolean {
  if (!email) return false
  if (email.includes('placeholder')) return false
  if (email.includes('@sms.')) return false
  if (email.includes('@example.')) return false
  if (!email.includes('@') || !email.includes('.')) return false
  return true
}

function outreachEmail(pro: any, contact: {
  name: string; email: string; phone: string; need: string; tradeName: string
}): string {
  const claimUrl  = `https://proguild.ai/claim/${pro.id}`
  const firstName = pro.full_name?.split(' ')[0] || 'there'
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f4ef;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e1db;">
  <tr><td style="background:linear-gradient(135deg,#0F766E,#0C5F57);padding:24px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">ProGuild.ai</p>
    <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">A homeowner in ${pro.city || 'your area'} needs your help</p>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="font-size:15px;color:#0A1628;margin:0 0 20px;">Hi ${firstName},</p>
    <p style="font-size:14px;color:#4B5563;margin:0 0 20px;line-height:1.6;">
      A homeowner reached out through your ProGuild.ai profile looking for a licensed ${contact.tradeName} in ${pro.city || 'your area'}.
      Their details are below.
    </p>

    <div style="background:#F8F7F4;border:1px solid #E8E2D9;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#A89F93;">Homeowner Contact</p>
      <p style="margin:0 0 6px;font-size:14px;color:#0A1628;"><strong>Name:</strong> ${contact.name}</p>
      ${contact.email ? `<p style="margin:0 0 6px;font-size:14px;color:#0A1628;"><strong>Email:</strong> ${contact.email}</p>` : ''}
      ${contact.phone ? `<p style="margin:0 0 6px;font-size:14px;color:#0A1628;"><strong>Phone:</strong> ${contact.phone}</p>` : ''}
      <p style="margin:12px 0 0;font-size:14px;color:#4B5563;line-height:1.6;border-top:1px solid #E8E2D9;padding-top:12px;"><strong>What they need:</strong><br/>${contact.need}</p>
    </div>

    <p style="font-size:14px;color:#4B5563;margin:0 0 20px;line-height:1.6;">
      Your ProGuild profile is verified with your DBPR license #${pro.license_number || 'on file'}.
      Claim it free to respond directly, manage leads, and get discovered by more homeowners — zero per-lead fees, ever.
    </p>

    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:linear-gradient(135deg,#0F766E,#0C5F57);border-radius:10px;padding:14px 28px;">
        <a href="${claimUrl}" style="color:#fff;font-size:14px;font-weight:700;text-decoration:none;">
          Claim your free profile and respond →
        </a>
      </td></tr>
    </table>

    <p style="font-size:12px;color:#A89F93;margin:0;line-height:1.6;">
      ProGuild.ai · Florida's verified trades network · Zero lead fees<br/>
      You're receiving this because a homeowner found your DBPR-verified profile on ProGuild.ai.
      <a href="https://proguild.ai" style="color:#0F766E;">Unsubscribe</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pro_id, contact_name, contact_email, contact_phone, message } = body

    if (!pro_id || !contact_name || !message) {
      return NextResponse.json({ error: 'pro_id, contact_name and message are required' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()

    // Fetch the pro
    const { data: pro, error: proErr } = await sb
      .from('pros')
      .select('id, full_name, email, phone_cell, phone_work, city, state, license_number, is_claimed, trade_category:trade_categories(category_name)')
      .eq('id', pro_id)
      .single()

    if (proErr || !pro) {
      return NextResponse.json({ error: 'Pro not found' }, { status: 404 })
    }

    const tradeName = Array.isArray(pro.trade_category)
      ? (pro.trade_category[0] as any)?.category_name
      : (pro.trade_category as any)?.category_name || 'pro'

    // Save lead to DB regardless of email/phone status
    const { data: lead, error: leadErr } = await sb
      .from('leads')
      .insert({
        pro_id,
        contact_name,
        contact_email: contact_email?.toLowerCase().trim() || null,
        contact_phone: contact_phone || null,
        message,
        lead_status: 'New',
        lead_source: 'Registry_Card',
      })
      .select()
      .single()

    if (leadErr) {
      console.error('[contact-pro] Lead insert error:', JSON.stringify(leadErr))
      return NextResponse.json({ error: leadErr.message || 'Failed to save lead', detail: leadErr }, { status: 500 })
    }

    // Send outreach email to pro only if AUTO_SEND_EMAIL is enabled
    const proEmail = pro.email
    let emailSent       = false
    let queuedForManual = false

    if (AUTO_SEND_EMAIL && isRealEmail(proEmail)) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY || '')
        await resend.emails.send({
          from: process.env.EMAIL_FROM || 'hello@proguild.ai',
          to: proEmail,
          subject: `${contact_name} in ${pro.city || 'your area'} needs a ${tradeName} — ProGuild.ai`,
          html: outreachEmail(pro, {
            name: contact_name,
            email: contact_email || '',
            phone: contact_phone || '',
            need: message,
            tradeName,
          }),
        })
        emailSent = true
      } catch (err) {
        console.error('[contact-pro] Email send failed:', err)
      }
    } else {
      // Phone-only or no contact info — flag for manual follow-up
      queuedForManual = true
      await sb.from('leads').update({
        lead_status: 'Queued_Manual',
      }).eq('id', lead.id)
    }

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      email_sent: emailSent,
      queued_manual: queuedForManual,
    }, { status: 201 })

  } catch (err) {
    console.error('[contact-pro] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
