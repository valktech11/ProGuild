// lib/review.ts — Review request sender
// Called on Job Won (stage route) and on invoice paid (mark-paid route)

import { getSupabaseAdmin } from '@/lib/supabase'
import { sendHomeownerSms } from '@/lib/sms'
import { Resend } from 'resend'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://proguild.ai'

export async function queueAndSendReviewRequest({
  proId,
  companyId,
  leadId,
  invoiceId,
}: {
  proId: string
  companyId: string | null
  leadId: string
  invoiceId?: string | null
}): Promise<void> {
  try {
    const sb = getSupabaseAdmin()

    // Check if review request already sent for this lead
    const { data: existing } = await sb
      .from('review_requests')
      .select('id')
      .eq('lead_id', leadId)
      .not('status', 'in', '(queued)')
      .maybeSingle()
    if (existing) return

    // Fetch lead + pro + company info
    const { data: lead } = await sb
      .from('leads')
      .select('contact_name, contact_phone, contact_email, property_address')
      .eq('id', leadId)
      .single()
    if (!lead) return

    const { data: pro } = await sb
      .from('pros')
      .select('full_name, business_name, google_id, phone_cell')
      .eq('id', proId)
      .single()
    if (!pro) return

    const businessName = (pro as any).business_name || (pro as any).full_name || 'Your contractor'
    const googleId = (pro as any).google_id

    // Create review_request row
    const { data: rr, error: rrErr } = await sb
      .from('review_requests')
      .insert({
        pro_id:          proId,
        company_id:      companyId,
        lead_id:         leadId,
        invoice_id:      invoiceId ?? null,
        homeowner_name:  (lead as any).contact_name,
        homeowner_email: (lead as any).contact_email,
        homeowner_phone: (lead as any).contact_phone,
        status:          'queued',
        send_after:      new Date().toISOString(),
      })
      .select('id, token')
      .single()

    if (rrErr || !rr) {
      console.error('[review] upsert failed:', rrErr?.message)
      return
    }

    const reviewUrl = `${BASE_URL}/review/${(rr as any).token}`
    const homeownerName = (lead as any).contact_name || 'there'
    const jobAddress = (lead as any).property_address || 'your property'

    const smsBody = `Hi ${homeownerName.split(' ')[0]}, ${businessName} just completed work at ${jobAddress}. How did we do? Leave a quick review: ${reviewUrl} Reply STOP to opt out.`
    const emailSubject = `How was your experience with ${businessName}?`
    const emailHtml = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#111827">How was your experience?</h2>
        <p style="color:#374151">Hi ${homeownerName},</p>
        <p style="color:#374151">${businessName} recently completed work at ${jobAddress}. Your feedback means a lot — it only takes 30 seconds.</p>
        <a href="${reviewUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Leave a Review →</a>
        <p style="color:#6B7280;font-size:13px">This message was sent on behalf of ${businessName} via ProGuild.ai</p>
      </div>`

    let smsSent = false
    let emailSent = false

    // Send SMS if homeowner has phone
    if ((lead as any).contact_phone) {
      smsSent = await sendHomeownerSms((lead as any).contact_phone, smsBody)
    }

    // Send email if homeowner has email
    if ((lead as any).contact_email && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from:    'ProGuild <noreply@proguild.ai>',
          to:      (lead as any).contact_email,
          subject: emailSubject,
          html:    emailHtml,
        })
        emailSent = true
      } catch (e) {
        console.error('[review] email failed:', e)
      }
    }

    // Update status
    if (smsSent || emailSent) {
      await sb.from('review_requests').update({
        status:       'sent',
        sent_at:      new Date().toISOString(),
        sms_sent_at:  smsSent ? new Date().toISOString() : null,
        email_sent_at: emailSent ? new Date().toISOString() : null,
      }).eq('id', (rr as any).id)
    }

  } catch (e) {
    console.error('[review] queueAndSendReviewRequest error:', e)
  }
}
