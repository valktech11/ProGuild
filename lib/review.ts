// lib/review.ts — Review request sender
// Returns a debug object so callers can surface errors in API responses

import { getSupabaseAdmin } from '@/lib/supabase'
import { sendHomeownerSms } from '@/lib/sms'
import { Resend } from 'resend'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://proguild.ai'

export async function queueAndSendReviewRequest({
  proId,
  companyId,
  leadId,
}: {
  proId: string
  companyId: string | null
  leadId: string
  invoiceId?: string | null
}): Promise<Record<string, any>> {
  const debug: Record<string, any> = { proId, leadId }
  try {
    const sb = getSupabaseAdmin()

    // Check if review request already exists for this lead
    const { data: existing, error: existErr } = await sb
      .from('review_requests')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle()
    debug.existing = { found: !!existing, err: existErr?.message }
    if (existing) return { skipped: 'already_exists', ...debug }

    // Fetch lead
    const { data: lead, error: leadErr } = await sb
      .from('leads')
      .select('contact_name, contact_phone, contact_email, property_address')
      .eq('id', leadId)
      .single()
    debug.lead = { found: !!lead, err: leadErr?.message }
    if (!lead) return { skipped: 'lead_not_found', ...debug }

    // Fetch pro
    const { data: pro, error: proErr } = await sb
      .from('pros')
      .select('full_name, business_name, google_id')
      .eq('id', proId)
      .single()
    debug.pro = { found: !!pro, err: proErr?.message }
    if (!pro) return { skipped: 'pro_not_found', ...debug }

    const businessName = (pro as any).business_name || (pro as any).full_name || 'Your contractor'
    const googleId = (pro as any).google_id

    // Insert review_request
    const { data: rr, error: rrErr } = await sb
      .from('review_requests')
      .insert({
        pro_id:          proId,
        company_id:      companyId,
        lead_id:         leadId,
        homeowner_name:  (lead as any).contact_name,
        homeowner_email: (lead as any).contact_email,
        homeowner_phone: (lead as any).contact_phone,
        status:          'queued',
        send_after:      new Date().toISOString(),
      })
      .select('id, token')
      .single()

    debug.insert = { success: !!rr, id: (rr as any)?.id, err: rrErr?.message, code: rrErr?.code, details: rrErr?.details }
    if (rrErr || !rr) return { skipped: 'insert_failed', ...debug }

    const reviewUrl = `${BASE_URL}/review/${(rr as any).token}`
    const homeownerName = (lead as any).contact_name || 'there'
    const jobAddress = (lead as any).property_address || 'your property'

    // Send SMS
    let smsSent = false
    let emailSent = false
    if ((lead as any).contact_phone) {
      const smsBody = `Hi ${homeownerName.split(' ')[0]}, ${businessName} just completed work at ${jobAddress}. How did we do? ${reviewUrl} Reply STOP to opt out.`
      smsSent = await sendHomeownerSms((lead as any).contact_phone, smsBody)
    }

    // Send email
    if ((lead as any).contact_email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from:    'ProGuild <noreply@proguild.ai>',
          to:      (lead as any).contact_email,
          subject: `How was your experience with ${businessName}?`,
          html:    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2>How was your experience?</h2><p>Hi ${homeownerName},</p><p>${businessName} recently completed work at ${jobAddress}. Your feedback means a lot.</p><a href="${reviewUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Leave a Review →</a><p style="color:#6B7280;font-size:13px">Sent on behalf of ${businessName} via ProGuild.ai</p></div>`,
        })
        emailSent = true
      } catch {}
    }

    if (smsSent || emailSent) {
      await sb.from('review_requests').update({
        status:        'sent',
        sent_at:       new Date().toISOString(),
        sms_sent_at:   smsSent ? new Date().toISOString() : null,
        email_sent_at: emailSent ? new Date().toISOString() : null,
      }).eq('id', (rr as any).id)
    }

    debug.sent = { sms: smsSent, email: emailSent }
    return { success: true, token: (rr as any).token, ...debug }

  } catch (e) {
    return { error: String(e), ...debug }
  }
}
