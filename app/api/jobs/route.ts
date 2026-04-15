import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { moderateContent } from '@/lib/moderation'
import { Resend } from 'resend'

function getResend() { return new Resend(process.env.RESEND_API_KEY || '') }

async function sendJobAlertEmails(job: any) {
  const sb = getSupabaseAdmin()

  // Find claimed pros in same trade + state/city
  let query = sb.from('pros')
    .select('id, full_name, email, city, state')
    .eq('trade_category_id', job.trade_category_id)
    .eq('is_claimed', true)
    .eq('profile_status', 'Active')
    .not('email', 'like', '%placeholder.tradesnetwork%')

  if (job.state) query = query.eq('state', job.state)

  const { data: pros } = await query.limit(200)
  if (!pros?.length) return

  // Further filter by city if provided — city match OR no city specified
  const targets = job.city
    ? pros.filter((p: any) => !p.city || p.city.toLowerCase() === job.city.toLowerCase())
    : pros

  if (!targets.length) return

  const resend = getResend()
  const jobUrl = `${process.env.NEXT_PUBLIC_URL || 'https://tradesnetwork.vercel.app'}/jobs`
  const location = [job.city, job.state].filter(Boolean).join(', ') || 'Florida'
  const budget = job.budget_range ? ` · Budget: ${job.budget_range}` : ''

  // Batch in groups of 50 (Resend batch limit)
  const BATCH = 50
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH)
    await resend.batch.send(batch.map((pro: any) => ({
      from: 'TradesNetwork <alerts@tradesnetwork.com>',
      to:   pro.email,
      subject: `New ${job.title} job in ${location}`,
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f4ef;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e1db;">
  <tr><td style="background:#0D9488;padding:24px 32px;">
    <div style="font-size:18px;font-weight:600;color:#fff;">TradesNetwork</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px;">New job alert</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <p style="font-size:14px;color:#555;margin:0 0 16px;">Hi ${pro.full_name.split(' ')[0]},</p>
    <p style="font-size:14px;color:#555;margin:0 0 20px;">A new job matching your trade was just posted in your area.</p>
    <div style="background:#f9f9f7;border:1px solid #eee;border-radius:12px;padding:20px;margin-bottom:20px;">
      <div style="font-size:17px;font-weight:700;color:#111;margin-bottom:6px;">${job.title}</div>
      <div style="font-size:13px;color:#888;margin-bottom:10px;">📍 ${location}${budget}</div>
      <div style="font-size:14px;color:#444;line-height:1.6;">${(job.description || '').slice(0, 200)}${job.description?.length > 200 ? '...' : ''}</div>
    </div>
    <a href="${jobUrl}" style="display:inline-block;background:#0D9488;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">View job &amp; apply</a>
    <p style="font-size:12px;color:#aaa;margin-top:24px;">You're receiving this because you're a claimed pro on TradesNetwork in ${job.state || 'Florida'}. <a href="${jobUrl}" style="color:#0D9488;">Manage alerts</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`,
    })))
    // Small delay between batches to avoid rate limits
    if (i + BATCH < targets.length) await new Promise(r => setTimeout(r, 500))
  }

  console.log(`Job alert: sent to ${targets.length} pros for job ${job.id}`)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const trade  = searchParams.get('trade')
  const status = searchParams.get('status') || 'Open'
  const limit  = parseInt(searchParams.get('limit') || '50')

  let query = getSupabaseAdmin()
    .from('jobs')
    .select(`*, trade_category:trade_categories(id, category_name, slug)`)
    .eq('job_status', status)
    .order('is_boosted', { ascending: false })
    .order('posted_at', { ascending: false })
    .limit(limit)

  if (trade) query = query.eq('trade_category_id', trade)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    title, homeowner_name, homeowner_email, homeowner_phone,
    trade_category_id, city, state, zip_code,
    description, budget_range
  } = body

  if (!title || !homeowner_name || !homeowner_email || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Moderate job description
  const mod = await moderateContent(description)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Job description not allowed: ${mod.reason}. Please keep content professional.`
    }, { status: 422 })
  }

  const expires = new Date()
  expires.setDate(expires.getDate() + 30)

  const { data, error } = await getSupabaseAdmin()
    .from('jobs')
    .insert({
      title, homeowner_name,
      homeowner_email: homeowner_email.toLowerCase().trim(),
      homeowner_phone: homeowner_phone || null,
      trade_category_id: trade_category_id || null,
      city: city || null,
      state: state || null,
      zip_code: zip_code || null,
      description,
      budget_range: budget_range || null,
      job_status: 'Open',
      is_boosted: false,
      expires_at: expires.toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/jobs error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── LEAD ALERT EMAILS ─────────────────────────────────────────────────
  // Fire-and-forget — don't block job creation response
  if (data.trade_category_id) {
    sendJobAlertEmails(data).catch(e => console.error('Job alert email error:', e))
  }

  return NextResponse.json({ job: data }, { status: 201 })
}
