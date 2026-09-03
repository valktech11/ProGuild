import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { randomBytes } from 'crypto'

function getResend() { return new Resend(process.env.RESEND_API_KEY || '') }

function generateClaimToken(): string {
  return randomBytes(32).toString('hex')
}

function claimEmail(pro: any, claimToken: string): string {
  const BASE       = process.env.NEXT_PUBLIC_BASE_URL || 'https://proguild.ai'
  const claimUrl   = `${BASE}/claim/${claimToken}`
  const profileUrl = `${BASE}/pro/${pro.id}`
  const trade      = pro.trade_category?.category_name || 'Trade professional'
  const firstName  = pro.full_name.split(' ')[0]
  const city       = pro.city || 'Florida'
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f4ef;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e1db;">
  <tr><td style="background:#0F766E;padding:24px 32px;">
    <div style="font-size:18px;font-weight:600;color:#fff;">ProGuild.ai</div>
    <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">Florida's Verified Trades Network</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="font-size:15px;color:#222;font-weight:600;margin:0 0 16px;">Hi ${firstName},</p>
    <p style="font-size:14px;color:#555;margin:0 0 16px;">
      Your <strong>${trade} profile is already live on ProGuild.ai</strong> — verified against Florida DBPR records.
      Homeowners in ${city} can find you right now.
    </p>
    <p style="font-size:14px;color:#555;margin:0 0 20px;">
      Claim it in one click — no password, no form to fill out. We'll pre-load everything from your license record.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:24px;">
      <div style="font-size:13px;color:#166534;font-weight:600;margin-bottom:8px;">What's included free for 90 days:</div>
      <div style="font-size:13px;color:#166534;margin-bottom:4px;">✓ DBPR-verified badge — no competitor does this</div>
      <div style="font-size:13px;color:#166534;margin-bottom:4px;">✓ Free satellite roof measurements ($35 each elsewhere)</div>
      <div style="font-size:13px;color:#166534;margin-bottom:4px;">✓ Job pipeline, estimates &amp; invoicing</div>
      <div style="font-size:13px;color:#166534;">✓ Mobile app (iOS + Android)</div>
    </div>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding-right:12px;">
          <a href="${claimUrl}" style="display:inline-block;background:#0F766E;color:#fff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:10px;text-decoration:none;">
            Claim my profile — one click →
          </a>
        </td>
        <td>
          <a href="${profileUrl}" style="display:inline-block;color:#0F766E;font-size:13px;text-decoration:underline;">
            View my profile →
          </a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#aaa;margin:0;">
      ProGuild.ai · Florida's verified trades community · Flat $49.99/mo roofing · $29.99/mo other trades · No per-lead fees, ever.
    </p>
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
      sample: (pros || []).slice(0, 5).map((p: any) => ({
        full_name: p.full_name,
        email: p.email,
        trade: (p as any).trade_category?.category_name || '—',
        city: p.city || '—',
      }))
    })
  }

  let emailsSent = 0
  const TOKEN_TTL_DAYS = 30

  for (let i = 0; i < (pros || []).length; i += 50) {
    const batch = (pros || []).slice(i, i + 50)
    try {
      // Generate a unique claim token per pro and persist before sending
      const tokenMap: Record<string, string> = {}
      const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000).toISOString()

      await Promise.all(batch.map(async (pro: any) => {
        const token = generateClaimToken()
        tokenMap[pro.id] = token
        await sb.from('pros').update({
          claim_token:            token,
          claim_token_expires_at: expiresAt,
        }).eq('id', pro.id)
      }))

      await getResend().batch.send(batch.map((pro: any) => ({
        from:    'ProGuild.ai <hello@proguild.ai>',
        to:      pro.email,
        subject: `${pro.full_name.split(' ')[0]}, your verified ${(pro as any).trade_category?.category_name || 'contractor'} profile is live on ProGuild`,
        html:    claimEmail(pro, tokenMap[pro.id]),
      })))

      const ids = batch.map((p: any) => p.id)
      await sb.from('pros').update({ email_sent: true }).in('id', ids)
      emailsSent += batch.length
      if (i + 50 < (pros || []).length) await new Promise(r => setTimeout(r, 500))
    } catch(e) { console.error('Claim batch error:', e) }
  }

  return NextResponse.json({ ok: true, eligible, emailsSent })
}
