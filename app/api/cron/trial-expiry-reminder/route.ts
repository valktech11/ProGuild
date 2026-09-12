// GET /api/cron/trial-expiry-reminder
// Runs daily at 10:00 UTC. Sends trial expiry reminder emails to pros:
//   - 14 days before trial ends
//   -  7 days before trial ends
//   -  1 day before trial ends
//   -  On the day trial expires (day 0)
//
// Guards:
//   - Only sends to claimed pros with real emails
//   - Tracks sends in email_log to prevent duplicate sends per window
//   - Skips pros who have already upgraded (plan_tier = 'Pro')
//   - Skips placeholder emails

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

function getResend() { return new Resend(process.env.RESEND_API_KEY || '') }

const REMINDER_DAYS = [14, 7, 1, 0] // days before expiry to send

function trialReminderEmail({
  firstName, daysLeft, trialEndsAt, subscribeUrl,
}: {
  firstName: string
  daysLeft:  number
  trialEndsAt: string
  subscribeUrl: string
}): { subject: string; html: string } {
  const expired = daysLeft <= 0
  const urgent  = daysLeft <= 1
  const headerColor = expired ? '#DC2626' : urgent ? '#D97706' : '#0F766E'
  const expiryDate = new Date(trialEndsAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const subject = expired
    ? 'Your ProGuild free trial has ended'
    : daysLeft === 1
    ? 'Last day of your ProGuild free trial'
    : `Your ProGuild trial expires in ${daysLeft} days`

  const headline = expired
    ? 'Your free trial has ended'
    : daysLeft === 1
    ? 'Last day of your free trial'
    : `${daysLeft} days left in your trial`

  const bodyText = expired
    ? `Your 90-day free trial ended on ${expiryDate}. Upgrade now to keep your verified listing, leads, and CRM tools.`
    : daysLeft === 1
    ? `Your free trial ends today. Upgrade now to keep uninterrupted access to your leads, pipeline, and tools.`
    : `Your free trial expires on ${expiryDate}. Upgrade to Pro to keep access to your verified contractor listing, leads, and full CRM.`

  const ctaText = expired ? 'Restore access →' : 'Upgrade to Pro →'

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:${headerColor};padding:24px 32px;">
      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:6px;">ProGuild.ai</div>
      <div style="font-size:20px;font-weight:800;color:#ffffff;line-height:1.25;">${headline}</div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="font-size:15px;color:#374151;line-height:1.7;margin:0 0 20px;">
        Hi ${firstName},<br><br>
        ${bodyText}
      </p>

      <!-- What you'll lose card -->
      <div style="background:#F9FAFB;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">
          ${expired ? 'Currently unavailable' : 'Included in ProGuild Pro'}
        </div>
        ${[
          ['✓', 'DBPR-verified listing — get found by homeowners'],
          ['✓', 'Full CRM — leads, pipeline, scheduling'],
          ['✓', 'Estimates, proposals & invoicing'],
          ['✓', 'Satellite roof measurement'],
          ['✓', 'Mobile app (iOS + Android)'],
        ].map(([icon, text]) => `
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;">
          <span style="color:${headerColor};font-weight:700;font-size:14px;flex-shrink:0;">${icon}</span>
          <span style="font-size:14px;color:#374151;line-height:1.5;">${text}</span>
        </div>`).join('')}
      </div>

      <!-- CTA -->
      <a href="${subscribeUrl}" style="display:block;text-align:center;background:${headerColor};color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:700;margin-bottom:12px;">
        ${ctaText}
      </a>
      <p style="font-size:12px;color:#9CA3AF;text-align:center;margin:0;">
        No contracts · Cancel anytime · Takes 2 minutes
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#F9FAFB;padding:16px 32px;text-align:center;border-top:1px solid #F0EDE8;">
      <p style="font-size:11px;color:#9CA3AF;margin:0;line-height:1.8;">
        <a href="https://proguild.ai" style="color:#0F766E;text-decoration:none;font-weight:600;">ProGuild.ai</a> · Serving Licensed Contractors<br>
        ProGuild LLC · 30 N Gould St, Sheridan, WY 82801<br>
        You're receiving this because you have a ProGuild account.
      </p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const resend = getResend()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proguild.ai'
  const now = new Date()

  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const daysLeft of REMINDER_DAYS) {
    // Window: trial ends between start and end of the target day
    const targetStart = new Date(now)
    targetStart.setDate(targetStart.getDate() + daysLeft)
    targetStart.setHours(0, 0, 0, 0)

    const targetEnd = new Date(targetStart)
    targetEnd.setHours(23, 59, 59, 999)

    // Find pros whose trial ends in this window
    const { data: pros, error } = await sb
      .from('pros')
      .select('id, full_name, email, plan_tier, trial_ends_at')
      .eq('is_claimed', true)
      .neq('plan_tier', 'Pro')
      .not('email', 'ilike', '%@placeholder.tradesnetwork%')
      .not('email', 'is', null)
      .gte('trial_ends_at', targetStart.toISOString())
      .lte('trial_ends_at', targetEnd.toISOString())

    if (error) {
      errors.push(`daysLeft=${daysLeft}: ${error.message}`)
      continue
    }

    for (const pro of (pros ?? [])) {
      if (!pro.email || !pro.trial_ends_at) { skipped++; continue }

      // Check if we already sent this reminder type recently (dedup)
      const template = `trial_reminder_${daysLeft}d`
      const { data: existing } = await sb
        .from('email_log')
        .select('id')
        .eq('pro_id', pro.id)
        .eq('template', template)
        .gte('sent_at', new Date(Date.now() - 2 * 86400000).toISOString()) // within 48h
        .limit(1)
        .single()

      if (existing) { skipped++; continue }

      // Parse first name
      const firstName = pro.full_name.includes(',')
        ? (pro.full_name.split(',')[1]?.trim().split(' ')[0] || 'there')
        : pro.full_name.split(' ')[0] || 'there'
      const fnFormatted = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()

      const { subject, html } = trialReminderEmail({
        firstName:   fnFormatted,
        daysLeft,
        trialEndsAt: pro.trial_ends_at,
        subscribeUrl: `${appUrl}/subscribe`,
      })

      try {
        const { data: emailData, error: emailErr } = await resend.emails.send({
          from:    process.env.EMAIL_FROM || 'hello@proguild.ai',
          to:      pro.email,
          subject,
          html,
        })

        if (emailErr) {
          errors.push(`pro ${pro.id}: ${emailErr.message}`)
        } else {
          await sb.from('email_log').insert({
            pro_id:     pro.id,
            lead_id:    null,
            to_email:   pro.email,
            from_email: process.env.EMAIL_FROM || 'hello@proguild.ai',
            subject,
            template,
            resend_id:  emailData?.id || null,
            status:     'sent',
            sent_at:    new Date().toISOString(),
          })
          sent++
        }
      } catch (e: any) {
        errors.push(`pro ${pro.id}: ${e?.message}`)
      }
    }
  }

  console.log(`[trial-expiry-reminder] sent=${sent} skipped=${skipped} errors=${errors.length}`)
  return NextResponse.json({ ok: true, sent, skipped, errors })
}
