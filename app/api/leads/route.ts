import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { leadNotificationEmail } from '@/lib/email'
import { Resend } from 'resend'
import { moderateContent } from '@/lib/moderation'
import { getInitialStage } from '@/lib/trades/_registry'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const proId = searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin()
    .from('leads').select('*, roofing_job_data(insurance_claim)').eq('pro_id', proId).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { pro_id, job_id, contact_name, contact_email, contact_phone, message, lead_source, client_id, is_manual, property_address, contact_city, contact_state, contact_zip } = body
  // Manual leads (pro-entered) don't require email — just name + what they need
  if (!pro_id || !contact_name || !message)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  // External leads from contact forms still require email
  if (!is_manual && !contact_email)
    return NextResponse.json({ error: 'Email required for contact form leads' }, { status: 400 })

  // Moderate message
  const mod = await moderateContent(message)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Message not allowed: ${mod.reason}. Please keep your message professional.`
    }, { status: 422 })
  }

  // Resolve trade_slug from the pro's profile so new leads start at the correct initial stage
  const { data: proRecord } = await getSupabaseAdmin()
    .from('pros').select('trade_slug').eq('id', pro_id).single()
  const initialStage = getInitialStage(proRecord?.trade_slug)

  const { data: lead, error } = await getSupabaseAdmin()
    .from('leads')
    .insert({
      pro_id, job_id: job_id || null,
      contact_name, contact_email: contact_email ? contact_email.toLowerCase().trim() : null,
      contact_phone: contact_phone || null, message,
      lead_status: initialStage, lead_source: lead_source || 'Profile_Page',
      client_id: client_id || null,
      property_address: property_address?.trim() || null,
      contact_city: contact_city?.trim() || null,
      contact_state: contact_state?.trim() || null,
      contact_zip: contact_zip?.trim() || null,
    })
    .select().single()

  if (error) { console.error('POST /api/leads error:', error); return NextResponse.json({ error: error.message }, { status: 500 }) }

  // Fetch pro for email
  const { data: pro } = await getSupabaseAdmin()
    .from('pros').select('full_name, email, plan_tier, city, state').eq('id', pro_id).single()

  // Send email notification
  if (pro?.email && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const isPaid = pro.plan_tier !== 'Free'
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proguild.ai'
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: pro.email,
        subject: `New lead from ${contact_name} — ProGuild.ai`,
        html: leadNotificationEmail({
          proName: pro.full_name, proEmail: pro.email,
          contactName: contact_name, contactEmail: contact_email,
          contactPhone: contact_phone || null, message,
          city: pro.city, state: pro.state,
          leadSource: lead_source || 'Profile_Page',
          dashboardUrl: `${appUrl}/dashboard`, isPaid,
        }),
      })
    } catch (e) { console.error('Email failed:', e) }
  }

  // ── Auto-link lead to client record ─────────────────────────────────────
  if (lead && contact_name) {
    try {
      const supabase = getSupabaseAdmin()
      let clientId: string | null = null
      if (contact_phone) {
        const { data: byPhone } = await supabase.from('clients').select('id')
          .eq('pro_id', pro_id).eq('phone', contact_phone.trim()).maybeSingle()
        if (byPhone) clientId = byPhone.id
      }
      if (!clientId && contact_email) {
        const { data: byEmail } = await supabase.from('clients').select('id')
          .eq('pro_id', pro_id).eq('email', contact_email.toLowerCase().trim()).maybeSingle()
        if (byEmail) clientId = byEmail.id
      }
      if (!clientId) {
        const addrParts = (property_address || '').split(',').map((s: string) => s.trim())
        const { data: newClient } = await supabase.from('clients').insert({
          pro_id, full_name: contact_name.trim(),
          phone: contact_phone?.trim() || null,
          email: contact_email?.toLowerCase().trim() || null,
          address_line1: addrParts[0] || null,
          city:  contact_city?.trim()  || addrParts[1] || null,
          state: contact_state?.trim() || null,
        }).select('id').single()
        if (newClient) clientId = newClient.id
      }
      if (clientId) {
        await supabase.from('leads').update({ client_id: clientId }).eq('id', lead.id)
        lead.client_id = clientId
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ lead }, { status: 201 })
}
