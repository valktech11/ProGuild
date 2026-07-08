// app/api/cron/morning-brief/route.ts
// Runs daily at 12:00 UTC (7AM ET / 8AM ET DST).
// Sends each active FL roofer a personalised morning brief:
//   - Today's calendar events
//   - Overdue follow-ups (follow_up_date < today)
//   - Unsigned estimates (status = sent)
//   - Unpaid invoices (status = sent/partial)
//
// Auth: CRON_SECRET header (Vercel Cron standard).
// Skip pros with no actionable items — don't spam empty briefs.

export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'ProGuild <hello@proguild.ai>'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  const preview = new URL(req.url).searchParams.get('preview') === '1'
  if (!preview && secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb      = getSupabaseAdmin()
  const previewProId = new URL(req.url).searchParams.get('pro_id')
  const today   = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayISO  = today.toISOString().slice(0, 10)
  const tomorrow  = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)

  // Active pros with email; preview can filter to one pro
  let query = sb.from('pros').select('id, full_name, email')
    .eq('profile_status', 'Active').not('email', 'is', null)
  if (previewProId) query = query.eq('id', previewProId)
  const { data: pros } = await query.limit(preview ? 1 : 500)

  if (!pros?.length) return NextResponse.json({ sent: 0 })

  let sent = 0, skipped = 0
  const errors: string[] = []

  // Process in parallel batches of 5 to stay within timeout
  const BATCH = 5
  for (let b = 0; b < pros.length; b += BATCH) {
    await Promise.all(pros.slice(b, b + BATCH).map(async (pro) => {
  try {
      // 1. Today's calendar events
      const { data: events } = await sb
        .from('calendar_events')
        .select('title, start_time, end_time, lead_id')
        .eq('pro_id', pro.id)
        .gte('start_time', today.toISOString())
        .lt('start_time', tomorrow.toISOString())
        .order('start_time')

      // 2. Overdue follow-ups
      const { data: overdue } = await sb
        .from('leads')
        .select('id, contact_name, lead_status, follow_up_date')
        .eq('pro_id', pro.id)
        .not('follow_up_date', 'is', null)
        .lt('follow_up_date', todayISO)
        .not('lead_status', 'in', '("job_won","lost")')
        .order('follow_up_date')
        .limit(10)

      // 3. Unsigned estimates (sent = awaiting homeowner signature)
      const { data: estimates } = await sb
        .from('estimates')
        .select('id, estimate_type, total_price, created_at, lead_id, leads(contact_name)')
        .eq('pro_id', pro.id)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(10)

      // 4. Unpaid invoices
      const { data: invoices } = await sb
        .from('invoices')
        .select('id, total_amount, amount_paid, status, leads(contact_name)')
        .eq('pro_id', pro.id)
        .in('status', ['sent', 'partial'])
        .order('created_at', { ascending: false })
        .limit(10)

      // Skip if nothing actionable
      const hasContent = (events?.length || 0) + (overdue?.length || 0) +
                         (estimates?.length || 0) + (invoices?.length || 0) > 0
      if (!hasContent) { skipped++; continue }

      const html = buildBriefHtml({
        name: pro.full_name ?? 'there',
        date: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        events:    events    ?? [],
        overdue:   overdue   ?? [],
        estimates: estimates ?? [],
        invoices:  invoices  ?? [],
      })

      await resend.emails.send({
        from: FROM,
        to: pro.email!,
        subject: `☀️ Your ProGuild Morning Brief — ${todayISO}`,
        html,
      })
      sent++
    } catch (e: unknown) {
      errors.push(`${pro.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
    }))
  }

  return NextResponse.json({ sent, skipped, errors: errors.length ? errors : undefined })
}

// ── Email template ────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtMoney(n: number) {
  return '$' + Math.round(n).toLocaleString()
}

function section(title: string, color: string, rows: string[]) {
  if (!rows.length) return ''
  return `
  <div style="margin-bottom:24px">
    <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${color};margin-bottom:10px">${title}</div>
    <div style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden">
      ${rows.map((r, i) => `<div style="padding:10px 14px;${i > 0 ? 'border-top:1px solid #F1F5F9' : ''};font-size:13px;color:#1E293B;line-height:1.45">${r}</div>`).join('')}
    </div>
  </div>`
}

function buildBriefHtml({ name, date, events, overdue, estimates, invoices }: {
  name: string; date: string
  events:    any[]; overdue: any[]
  estimates: any[]; invoices: any[]
}) {
  const calRows = events.map(e =>
    `<b>${fmtTime(e.start_time)}</b> &mdash; ${e.title || 'Event'}`)

  const overdueRows = overdue.map(l =>
    `<b>${l.contact_name || 'Lead'}</b> &mdash; follow-up was due <b>${fmtDate(l.follow_up_date)}</b> &middot; ${l.lead_status}`)

  const estRows = estimates.map((e: any) =>
    `<b>${(e.leads as any)?.contact_name || 'Homeowner'}</b> &mdash; ${fmtMoney(e.total_price || 0)} estimate waiting for signature`)

  const invRows = invoices.map((i: any) => {
    const owed = (i.total_amount || 0) - (i.amount_paid || 0)
    return `<b>${(i.leads as any)?.contact_name || 'Client'}</b> &mdash; ${fmtMoney(owed)} outstanding`
  })

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0A1628 0%,#0F766E 100%);padding:28px 32px">
      <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:4px">Good morning, ${name} ☀️</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7)">${date}</div>
    </div>
    <!-- Body -->
    <div style="padding:28px 32px">
      ${section("Today's Schedule", '#0F766E', calRows)}
      ${section('Overdue Follow-Ups', '#DC2626', overdueRows)}
      ${section('Awaiting Signature', '#D97706', estRows)}
      ${section('Outstanding Invoices', '#7C3AED', invRows)}
    </div>
    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #F1F5F9;background:#F8FAFC">
      <div style="font-size:11px;color:#94A3B8;text-align:center">
        ProGuild &middot; <a href="https://staging.proguild.ai/dashboard" style="color:#0F766E;text-decoration:none">Open dashboard</a>
        &middot; <a href="https://staging.proguild.ai/dashboard/settings" style="color:#94A3B8;text-decoration:none">Manage notifications</a>
      </div>
    </div>
  </div>
</body></html>`
}
