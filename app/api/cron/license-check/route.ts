import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

function getResend() { return new Resend(process.env.RESEND_API_KEY || '') }

function expiryEmail(pro: any, daysLeft: number, licenseNumber: string, tradeName: string): string {
  const urgent   = daysLeft <= 7
  const expired  = daysLeft <= 0
  const color    = expired ? '#A32D2D' : urgent ? '#854F0B' : '#0F6E56'
  const subject  = expired ? 'Your license has expired' : `Your license expires in ${daysLeft} days`
  const headline = expired ? 'License Expired' : urgent ? `${daysLeft} Days Left` : `${daysLeft} Days to Renewal`

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f4ef;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e1db;">
  <tr><td style="background:${color};padding:24px 32px;">
    <div style="font-size:18px;font-weight:600;color:#fff;">ProGuild.ai</div>
    <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px;">License Alert — ${headline}</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="font-size:14px;color:#555;margin:0 0 16px;">Hi ${pro.full_name.split(' ')[0]},</p>
    <p style="font-size:14px;color:#555;margin:0 0 20px;">
      ${expired
        ? `Your <strong>${tradeName}</strong> license (<strong>${licenseNumber}</strong>) has expired. Your verified badge has been updated on ProGuild.ai. Please renew your license with the Florida DBPR to restore your active status.`
        : `Your <strong>${tradeName}</strong> license (<strong>${licenseNumber}</strong>) expires in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. Renew now to keep your verified green badge and stay visible to homeowners and contractors.`
      }
    </p>
    <div style="background:#f9f9f7;border:1px solid #eee;border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">License details</div>
      <div style="font-size:14px;font-weight:600;color:#111;">${tradeName}</div>
      <div style="font-size:13px;color:#555;font-family:monospace;">${licenseNumber}</div>
    </div>
    <a href="https://proguild.ai/edit-profile" style="display:inline-block;background:${color};color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;margin-right:12px;">Update my profile</a>
    <a href="https://www.myfloridalicense.com" style="display:inline-block;color:${color};font-size:13px;text-decoration:underline;">Renew at DBPR →</a>
    <p style="font-size:12px;color:#aaa;margin-top:24px;">ProGuild.ai · Florida's verified trades community</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

function claimEmail(pro: any): string {
  const profileUrl = `https://proguild.ai/pro/${pro.id}`
  const loginUrl   = `https://proguild.ai/login`
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
      Your ${pro.trade_category?.category_name || 'trade'} license has been verified against Florida DBPR records.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-size:13px;color:#166534;font-weight:600;margin-bottom:8px;">✓ Your profile includes:</div>
      <div style="font-size:13px;color:#166534;">• Verified license badge from Florida DBPR</div>
      <div style="font-size:13px;color:#166534;">• ${pro.city ? `Listed for ${pro.city}, FL` : 'Florida listing'}</div>
      <div style="font-size:13px;color:#166534;">• Free to contact — no per-lead fees</div>
    </div>
    <a href="${loginUrl}" style="display:inline-block;background:#0F766E;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;margin-right:12px;">Claim my free profile</a>
    <a href="${profileUrl}" style="display:inline-block;color:#0F766E;font-size:13px;text-decoration:underline;">View my profile →</a>
    <p style="font-size:12px;color:#aaa;margin-top:24px;">ProGuild.ai · No cost, no catch. Unsubscribe anytime.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

async function alreadySent(sb: any, proId: string, alertType: string): Promise<boolean> {
  const cutoff = new Date(); cutoff.setHours(cutoff.getHours() - 48)
  const { data } = await sb.from('cron_email_log').select('id')
    .eq('pro_id', proId).eq('alert_type', alertType)
    .gte('sent_at', cutoff.toISOString()).limit(1)
  return (data || []).length > 0
}

async function logSent(sb: any, proId: string, alertType: string) {
  await sb.from('cron_email_log').insert({ pro_id: proId, alert_type: alertType })
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
  const today  = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // ── LICENSE STATUS UPDATE — from pro_licenses table (134K imported pros) ──
  const { data: allLicenses } = await sb
    .from('pro_licenses')
    .select('id, pro_id, trade_name, license_number, license_expiry_date, license_status, pros!inner(id, full_name, email, is_claimed)')
    .not('license_expiry_date', 'is', null)

  let wouldSend = 0; let emailsSent = 0
  const preview: any[] = []

  for (const lic of (allLicenses || [])) {
    const expiry   = new Date(lic.license_expiry_date)
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
    const newStatus = daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'active'

    if (!dryRun && lic.license_status !== newStatus) {
      await sb.from('pro_licenses').update({ license_status: newStatus }).eq('id', lic.id)
    }

    const pro = (lic as any).pros
    if (!pro?.is_claimed || !pro?.email || pro.email.includes('placeholder')) continue

    const alertType = `license_${daysLeft <= 0 ? 'expired' : daysLeft <= 7 ? '7d' : daysLeft <= 14 ? '14d' : daysLeft <= 30 ? '30d' : null}`
    if (!alertType || alertType.endsWith('null')) continue

    if (dryRun) {
      wouldSend++
      if (preview.length < 10) preview.push({ full_name: pro.full_name, email: pro.email, daysLeft, alert: alertType, license: lic.license_number })
    } else {
      const sent = await alreadySent(sb, pro.id, alertType)
      if (!sent) {
        try {
          await getResend().emails.send({
            from: 'ProGuild.ai <alerts@proguild.ai>',
            to: pro.email,
            subject: daysLeft <= 0 ? `Your ${lic.trade_name} license has expired` : `Your license expires in ${daysLeft} days`,
            html: expiryEmail(pro, daysLeft, lic.license_number, lic.trade_name),
          })
          await logSent(sb, pro.id, alertType)
          emailsSent++
        } catch(e) { console.error('License email error:', e) }
      }
    }
  }

  // ── INSURANCE CHECK ────────────────────────────────────────────────────────
  const { data: insData } = await sb.from('pro_insurance').select('*, pros!inner(id, full_name, email, is_claimed)')
    .not('expiry_date', 'is', null)

  for (const ins of (insData || [])) {
    const expiry   = new Date(ins.expiry_date)
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
    const newStatus = daysLeft <= 0 ? 'expired' : daysLeft <= 30 ? 'expiring_soon' : 'active'
    if (!dryRun) {
      await sb.from('pro_insurance').update({ insurance_status: newStatus }).eq('id', ins.id)
      // Grace period — only update pro status if expired AND no warning sent yet
      if (newStatus !== 'expired') {
        await sb.from('pros').update({ insurance_status: newStatus }).eq('id', ins.pro_id)
      }
    }
  }

  return NextResponse.json({ ok: true, dryRun, expiring: 0, expired: 0, wouldSend, emailsSent, preview })
}
