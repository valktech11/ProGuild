import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requirePro } from '@/lib/pro-auth'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { estimateId, contactEmail, pro_id } = await req.json()
  const __auth = await requirePro(req, pro_id)
  if (__auth.error) return __auth.error
  if (!contactEmail) return NextResponse.json({ error: 'contactEmail required' }, { status: 400 })
  if (!estimateId)   return NextResponse.json({ error: 'estimateId required' }, { status: 400 })

  // C7 FIX: verify estimate belongs to pro before sending email
  if (pro_id) {
    const { data: est } = await import('@/lib/supabase')
      .then(m => m.getSupabaseAdmin().from('estimates').select('pro_id').eq('id', estimateId).single())
    if (!est || est.pro_id !== pro_id)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const estimateUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://proguild.ai'}/estimate/${estimateId}`

  try {
    await resend.emails.send({
      from:    'ProGuild <hello@proguild.ai>',
      to:      contactEmail,
      subject: 'Following up on your estimate',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
          <h2 style="font-size:20px;color:#111827;margin-bottom:8px;">Just following up</h2>
          <p style="color:#6B7280;font-size:15px;line-height:1.6;">
            We sent you an estimate and wanted to check in. Have any questions? We're happy to discuss the details.
          </p>
          <a href="${estimateUrl}"
            style="display:inline-block;margin-top:20px;padding:12px 24px;background:#0F766E;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
            View Your Estimate
          </a>
          <p style="color:#9CA3AF;font-size:13px;margin-top:24px;">
            Reply to this email with any questions.
          </p>
        </div>
      `,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
