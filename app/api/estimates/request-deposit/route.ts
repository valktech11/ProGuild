import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { estimateId, estimateNumber, contactEmail, leadName, depositAmount, total } = await req.json()
  if (!contactEmail) return NextResponse.json({ error: 'contactEmail required' }, { status: 400 })

  const estimateUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://proguild.ai'}/estimate/${estimateId}`
  const fmtMoney = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 })

  try {
    await resend.emails.send({
      from:    'ProGuild <hello@proguild.ai>',
      to:      contactEmail,
      subject: `Deposit request — Estimate #${estimateNumber}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
          <h2 style="font-size:20px;color:#111827;margin-bottom:8px;">Deposit Request</h2>
          <p style="color:#6B7280;font-size:15px;line-height:1.6;">
            Hi ${leadName || 'there'}, to confirm your job and get started, a deposit of
            <strong style="color:#111827;">${fmtMoney(depositAmount)}</strong>
            is required (50% of the ${fmtMoney(total)} estimate).
          </p>
          <a href="${estimateUrl}"
            style="display:inline-block;margin-top:20px;padding:12px 24px;background:#0F766E;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
            View Estimate &amp; Pay Deposit
          </a>
          <p style="color:#9CA3AF;font-size:13px;margin-top:24px;">
            Questions? Reply to this email or call us directly.
          </p>
        </div>
      `,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
