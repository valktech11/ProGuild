// app/api/waitlist/route.ts
// Shared early-access capture for BOTH entry points:
//   • homepage     → { email, role: 'homeowner' | 'contractor' }
//   • /supplement  → { email, source: 'supplement-landing', claims_per_month? }
// Writes to the single `waitlist` table. Run waitlist_add_columns.sql first so the
// table has: role, source, claims_per_month, user_agent, referrer, created_at.
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = ['homeowner', 'contractor']

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const email = String(body.email || '').trim().toLowerCase()
    const honeypot = String(body.company || '') // /supplement hidden field; bots fill it
    const role = ROLES.includes(String(body.role)) ? String(body.role) : null
    const source = body.source
      ? String(body.source).slice(0, 80)
      : role ? 'homepage' : 'unknown'
    const claimsPerMonth = body.claims_per_month ? String(body.claims_per_month).slice(0, 40) : null

    if (honeypot) return NextResponse.json({ ok: true }) // silently drop bots
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const row: Record<string, unknown> = {
      email,
      source,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) || null,
      referrer: req.headers.get('referer')?.slice(0, 300) || null,
    }
    if (role) row.role = role
    if (claimsPerMonth) row.claims_per_month = claimsPerMonth

    const { error } = await getSupabaseAdmin()
      .from('waitlist')
      .upsert(row, { onConflict: 'email' })

    if (error) {
      console.error('[waitlist] insert error:', error.message)
      return NextResponse.json({ error: 'Could not save' }, { status: 500 })
    }

    // Optional confirmation email for supplement signups only — non-blocking.
    const FROM = process.env.WAITLIST_FROM_EMAIL // e.g. "ProGuild <hello@proguild.ai>"
    if (process.env.RESEND_API_KEY && FROM && source === 'supplement-landing') {
      try {
        const { Resend } = await import('resend')
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: FROM,
          to: email,
          subject: "You're on the ProGuild early-access list",
          html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#16212a">
            <p>Thanks for signing up for early access to ProGuild.</p>
            <p>ProGuild helps Florida roofers recover what insurers underpay on roof claims — catching the items adjusters miss, documenting them to code, and building your supplement package, so you keep 100% of your margin.</p>
            <p>I'll reach out personally when the first version is ready. Reply to this email with the item carriers short you on most — I'm listening.</p>
            <p style="color:#6f7e88">— ProGuild · Florida roofing software</p></div>`,
        })
      } catch (e) {
        console.error('[waitlist] email send failed (non-fatal):', e)
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
