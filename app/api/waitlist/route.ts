// app/api/waitlist/route.ts
// Captures early-access signups from the /supplement landing page.
// Writes to Supabase `waitlist` (service role), de-dupes by email, and sends an
// optional confirmation via Resend (non-blocking — a failed email never fails the signup).
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const honeypot = String(body.company || '') // hidden field; bots fill it
    const source = String(body.source || 'supplement-landing').slice(0, 80)
    const claimsPerMonth = body.claims_per_month ? String(body.claims_per_month).slice(0, 40) : null

    if (honeypot) return NextResponse.json({ ok: true }) // silently drop bots
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json({ ok: false, error: 'Please enter a valid email.' }, { status: 400 })
    }

    const sb = getSupabaseAdmin()
    const { error } = await sb.from('waitlist').upsert(
      {
        email,
        source,
        claims_per_month: claimsPerMonth,
        user_agent: req.headers.get('user-agent')?.slice(0, 300) || null,
        referrer: req.headers.get('referer')?.slice(0, 300) || null,
      },
      { onConflict: 'email', ignoreDuplicates: true },
    )
    if (error) {
      console.error('[waitlist] insert error:', error.message)
      return NextResponse.json({ ok: false, error: 'Could not save right now — please retry.' }, { status: 500 })
    }

    // Optional confirmation email. Only fires when both env vars are set; never blocks signup.
    const FROM = process.env.WAITLIST_FROM_EMAIL // e.g. "ProGuild <hello@proguild.ai>"
    if (process.env.RESEND_API_KEY && FROM) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: FROM,
          to: email,
          subject: "You're on the ProGuild early-access list",
          html: `
            <div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#16212a">
              <p>Thanks for signing up for early access to ProGuild.</p>
              <p>ProGuild helps Florida roofers recover what insurers underpay on roof claims —
              catching the items adjusters miss, documenting them to code, and building your
              supplement package, so you keep 100% of your margin.</p>
              <p>I'll reach out personally when the first version is ready, and I'd love to hear
              what would make it genuinely useful for your shop. Just reply to this email.</p>
              <p style="color:#6f7e88">— ProGuild · Florida roofing software</p>
            </div>`,
        })
      } catch (e) {
        console.error('[waitlist] email send failed (non-fatal):', e)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[waitlist] unexpected:', e)
    return NextResponse.json({ ok: false, error: 'Unexpected error — please retry.' }, { status: 500 })
  }
}
