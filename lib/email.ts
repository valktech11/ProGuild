import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || 'placeholder')
}

interface LeadEmailProps {
  proName: string
  proEmail: string
  contactName: string
  contactEmail: string
  contactPhone: string | null
  message: string
  city: string | null
  state: string | null
  leadSource: string
  dashboardUrl: string
  isPaid: boolean
}

export function leadNotificationEmail({
  proName,
  contactName,
  contactEmail,
  contactPhone,
  message,
  city,
  state,
  leadSource,
  dashboardUrl,
  isPaid,
}: LeadEmailProps): string {
  const firstName = proName.split(' ')[0]
  const initials  = contactName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const location  = [city, state].filter(Boolean).join(', ') || 'Not specified'
  const source    = leadSource.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  const now       = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New lead — ProGuild.ai</title>
</head>
<body style="margin:0;padding:0;background:#f5f4ef;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4ef;padding:32px 16px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e1db;">

    <!-- Header -->
    <tr><td style="background:#1D9E75;padding:28px 32px 24px;">
      <div style="font-size:20px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">ProGuild.ai</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">Professional trades marketplace</div>
    </td></tr>

    <!-- Body -->
    <tr><td style="padding:28px 32px;">

      <div style="font-size:12px;color:#9c9a92;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:6px;">New lead received</div>
      <div style="font-size:22px;font-weight:600;color:#1a1a18;margin-bottom:4px;">You have a new enquiry, ${firstName}</div>
      <div style="font-size:14px;color:#73726c;margin-bottom:24px;line-height:1.5;">Someone found your profile and wants to get in touch. Respond quickly to win the job.</div>

      <!-- Lead card -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf8;border-radius:12px;border:1px solid #e2e1db;margin-bottom:24px;">
        <tr><td style="padding:20px;">

          <!-- Contact info -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="44" valign="middle">
                <div style="width:40px;height:40px;border-radius:50%;background:#E1F5EE;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#085041;text-align:center;line-height:40px;">${initials}</div>
              </td>
              <td style="padding-left:12px;" valign="middle">
                <div style="font-size:15px;font-weight:600;color:#1a1a18;">${contactName}</div>
                <div style="font-size:13px;color:#73726c;">${contactEmail}</div>
              </td>
              <td align="right" valign="middle">
                <span style="background:#E1F5EE;color:#085041;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;">New</span>
              </td>
            </tr>
          </table>

          <!-- Message -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e1db;padding-top:14px;">
            <tr><td style="padding-top:14px;">
              <div style="font-size:12px;color:#9c9a92;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Their message</div>
              <div style="font-size:14px;color:#3d3d3a;line-height:1.65;font-style:italic;">&ldquo;${message}&rdquo;</div>
            </td></tr>
          </table>

          <!-- Meta grid -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e1db;margin-top:14px;">
            <tr>
              <td width="50%" style="padding-top:14px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#9c9a92;margin-bottom:3px;">Location</div>
                <div style="font-size:13px;font-weight:600;color:#1a1a18;">${location}</div>
              </td>
              <td width="50%" style="padding-top:14px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#9c9a92;margin-bottom:3px;">Received</div>
                <div style="font-size:13px;font-weight:600;color:#1a1a18;">${now}</div>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding-top:10px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#9c9a92;margin-bottom:3px;">Source</div>
                <div style="font-size:13px;font-weight:600;color:#1a1a18;">${source}</div>
              </td>
              <td width="50%" style="padding-top:10px;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#9c9a92;margin-bottom:3px;">Phone</div>
                <div style="font-size:13px;font-weight:600;color:#1a1a18;">${
                  isPaid && contactPhone
                    ? contactPhone
                    : contactPhone
                      ? '<span style="color:#9c9a92;font-style:italic;">Upgrade to Pro to view</span>'
                      : '<span style="color:#9c9a92;">Not provided</span>'
                }</div>
              </td>
            </tr>
          </table>

        </td></tr>
      </table>

      <!-- CTA buttons -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr><td style="padding-bottom:10px;">
          <a href="${dashboardUrl}" style="display:block;background:#1D9E75;color:#ffffff;text-align:center;padding:14px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;">View lead in dashboard →</a>
        </td></tr>
        <tr><td>
          <a href="mailto:${contactEmail}" style="display:block;border:1px solid #c8c7bf;color:#73726c;text-align:center;padding:12px;border-radius:10px;font-size:13px;text-decoration:none;">Reply directly to ${contactName.split(' ')[0]}</a>
        </td></tr>
      </table>

      <!-- Tip -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="background:#FFF3CD;border-left:3px solid #EF9F27;border-radius:0 8px 8px 0;padding:12px 14px;">
          <div style="font-size:13px;color:#633806;line-height:1.55;">Pros who respond within 1 hour are 3× more likely to win the job. Reply now while the lead is fresh.</div>
        </td></tr>
      </table>

    </td></tr>

    <!-- Footer -->
    <tr><td style="border-top:1px solid #e2e1db;padding:18px 32px;background:#fafaf8;">
      <div style="font-size:12px;color:#9c9a92;line-height:1.6;">
        You're receiving this because you have an active ProGuild.ai pro account.
        <a href="${dashboardUrl}" style="color:#73726c;text-decoration:none;">Manage notifications</a>
      </div>
      <div style="font-size:11px;color:#9c9a92;margin-top:6px;">© 2026 ProGuild.ai · Univaro Technologies</div>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`
}

export async function sendClaimEmail(pro: {
  id: string; full_name: string; email: string;
  city?: string | null; state?: string | null;
  license_number?: string | null; trade_category?: any;
}) {
  const claimUrl = `${process.env.NEXT_PUBLIC_URL || 'https://proguild.ai'}/claim/${pro.id}`
  const tradeName = pro.trade_category?.category_name || 'trade professional'
  const location  = [pro.city, pro.state].filter(Boolean).join(', ')

  return getResend().emails.send({
    from:    'ProGuild.ai <hello@proguild.ai>',
    to:      pro.email,
    subject: `${pro.full_name}, your verified profile is waiting on ProGuild.ai`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #0d9488; padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">ProGuild.ai</h1>
        </div>
        <div style="background: white; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="font-size: 20px; margin-top: 0;">Hi ${pro.full_name},</h2>
          <p style="color: #6b7280; line-height: 1.6;">
            We found your ${tradeName} license in the Florida state database and created a verified profile for you on ProGuild.ai — the professional platform for America's trades workforce.
          </p>
          ${pro.license_number ? `<p style="color: #6b7280;">License: <strong>${pro.license_number}</strong>${location ? ` · ${location}` : ''}</p>` : ''}
          <p style="color: #6b7280; line-height: 1.6;">
            Claim your free profile in 2 minutes to start receiving leads directly — with <strong>zero per-lead fees, ever</strong>.
          </p>
          <a href="${claimUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">
            Claim my profile →
          </a>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">
            ProGuild.ai · Zero per-lead fees · License verified · Direct leads<br/>
            <a href="${process.env.NEXT_PUBLIC_URL || 'https://proguild.ai'}" style="color: #0d9488;">proguild.ai</a>
          </p>
        </div>
      </div>
    `,
  })
}
