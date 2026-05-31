import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function notifyRoofer(params: {
  proId: string
  subject: string
  headline: string
  body: string
  leadId?: string | null
  sb: ReturnType<typeof import('@/lib/supabase').getSupabaseAdmin>
}) {
  const { proId, subject, headline, body, leadId, sb } = params
  try {
    const { data: pro } = await sb
      .from('pros')
      .select('full_name, email')
      .eq('id', proId)
      .maybeSingle()
    if (!pro?.email) return

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://staging.proguild.ai'
    const cta = leadId
      ? `<a href="${baseUrl}/dashboard/pipeline/${leadId}" style="display:inline-block;padding:12px 24px;background:#0F766E;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View Lead →</a>`
      : ''

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0F766E,#0A5A54);padding:24px 28px;">
      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">ProGuild</div>
      <div style="font-size:20px;font-weight:800;color:#fff;">${headline}</div>
    </div>
    <div style="padding:24px 28px;">
      <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 ${cta ? '20px' : '0'};">${body}</p>
      ${cta}
    </div>
    <div style="background:#F9FAFB;padding:14px 28px;text-align:center;">
      <p style="font-size:12px;color:#9CA3AF;margin:0;">Sent via <a href="https://proguild.ai" style="color:#0F766E;text-decoration:none;">ProGuild.ai</a></p>
    </div>
  </div>
</body></html>`

    await resend.emails.send({
      from: 'ProGuild <hello@proguild.ai>',
      to: pro.email,
      subject,
      html,
    })
    console.log(`[notifyRoofer] sent "${subject}" to ${pro.email}`)
  } catch (e) {
    console.error('[notifyRoofer] failed:', e)
  }
}
