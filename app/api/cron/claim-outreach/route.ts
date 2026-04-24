import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

function getResend() { return new Resend(process.env.RESEND_API_KEY || '') }

function claimEmail(pro: any): string {
  const profileUrl = `https://proguild.ai/pro/${pro.id}`
  const loginUrl   = `https://proguild.ai/login`
  const trade = pro.trade_category?.category_name || 'Trade professional'
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f4ef;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e1db;">
  <tr><td style="background:#0F766E;padding:24px 32px;">
    <div style="font-size:18px;font-weight:600;color:#fff;">ProGuild.ai</div>
    <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Your free verified profile is ready</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="font-size:14px;color:#555;margin:0 0 16px;">Hi ${pro.full_name.split(' ')[0]},</p>
    <p style="font-size:14px;color:#555;margin:0 0 20px;">
      We've created a <strong>free verified profile</strong> for you on ProGuild.ai — Florida's state-licensed trades network.
      Your ${trade} license has been verified against Florida DBPR records and your profile is live now.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-size:13px;color:#166534;font-weight:600;margin-bottom:8px;">✓ Your profile includes:</div>
      <div style="font-size:13px;color:#166534;">• DBPR-verified license badge</div>
      <div style="font-size:13px;color:#166534;">• ${pro.city ? `Listed in ${pro.city}, FL` : 'Florida listing'}</div>
      <div style="font-size:13px;color:#166534;">• Homeowners and contractors can contact you free</div>
      <div style="font-size:13px;color:#166534;">• No subscription required — always free to claim</div>
    </div>
    <a href="${loginUrl}" style="display:inline-block;background:#0F766E;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;margin-right:12px;">Claim my free profile</a>
    <a href="${profileUrl}" style="display:inline-block;color:#0F766E;font-size:13px;text-decoration:underline;">View my profile →</a>
    <p style="font-size:12px;color:#aaa;margin-top:24px;">ProGuild.ai · Florida's verified trades community · Zero per-lead fees, always.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || ''
  const isAdmin    = authHeader === `Bearer ${process.env.NEXT_PUBLIC_CRON_PREVIEW || 'preview'}`
  if (authHeader !== `Bearer ${cronSecret}` && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get('dry_run') === 'true'
  const sb     = getSupabaseAdmin()
  const BATCH  = 50

  // Find unclaimed pros with real emails not yet contacted
  const { data: pros, count } = await sb
    .from('pros')
    .select('id, full_name, email, city, state, trade_category:trade_categories(category_name)', { count: 'exact' })
    .eq('is_claimed', false)
    .eq('email_sent', false)
    .eq('profile_status', 'Active')
    .not('email', 'like', '%placeholder%')
    .not('email', 'like', '%@sms.%')
    .limit(dryRun ? 10 : BATCH)

  const eligible = count || 0

  if (dryRun) {
    return NextResponse.json({
      eligible,
      wouldSend: Math.min(eligible, BATCH),
      sample: (pros || []).slice(0, 5).map(p => ({
        full_name: p.full_name,
        email: p.email,
        trade: (p as any).trade_category?.category_name || '—',
        city: p.city || '—',
      }))
    })
  }

  let emailsSent = 0
  for (let i = 0; i < (pros || []).length; i += 50) {
    const batch = (pros || []).slice(i, i + 50)
    try {
      await getResend().batch.send(batch.map((pro: any) => ({
        from:    'ProGuild.ai <hello@proguild.ai>',
        to:      pro.email,
        subject: `${pro.full_name.split(' ')[0]}, your free verified profile is ready on ProGuild.ai`,
        html:    claimEmail(pro),
      })))
      // Mark as sent
      const ids = batch.map((p: any) => p.id)
      await sb.from('pros').update({ email_sent: true }).in('id', ids)
      emailsSent += batch.length
      if (i + 50 < (pros || []).length) await new Promise(r => setTimeout(r, 500))
    } catch(e) { console.error('Claim batch error:', e) }
  }

  return NextResponse.json({ ok: true, eligible, emailsSent })
}
