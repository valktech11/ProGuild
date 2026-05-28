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
    .from('leads')
    .select('*, roofing_job_data(insurance_claim)')
    .eq('pro_id', proId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    pro_id, job_id, contact_name, contact_email, contact_phone,
    message, lead_source, client_id, is_manual,
    property_address, contact_city, contact_state, contact_zip,
  } = body

  if (!pro_id || !contact_name || !message)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  if (!is_manual && !contact_email)
    return NextResponse.json({ error: 'Email required for contact form leads' }, { status: 400 })

  // Moderate message
  const mod = await moderateContent(message)
  if (!mod.safe) {
    return NextResponse.json({
      error: `Message not allowed: ${mod.reason}. Please keep your message professional.`
    }, { status: 422 })
  }

  const supabase = getSupabaseAdmin()

  // ── Resolve pro profile — trade_slug + notification email ────────────────
  const { data: proRecord } = await supabase
    .from('pros')
    .select('trade_slug, full_name, email, plan_tier, city, state')
    .eq('id', pro_id)
    .single()

  const tradeSlug   = proRecord?.trade_slug ?? null
  const initialStage = getInitialStage(tradeSlug)

  // ── Normalise address ─────────────────────────────────────────────────────
  // street_only = just the street portion (never the full "street, city, state, zip" string)
  const streetOnly = property_address?.trim()
    ? (contact_city || contact_state || contact_zip)
      ? property_address.split(',')[0].trim()   // strip city/state if already separate
      : property_address.trim()
    : null

  // ── Insert lead ───────────────────────────────────────────────────────────
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      pro_id,
      job_id:          job_id || null,
      trade_slug:      tradeSlug,                // ✅ Phase 2: write trade_slug to lead
      contact_name,
      contact_email:   contact_email ? contact_email.toLowerCase().trim() : null,
      contact_phone:   contact_phone || null,
      message,
      lead_status:     initialStage,
      lead_source:     lead_source || 'Profile_Page',
      client_id:       client_id || null,
      property_address: streetOnly,
      contact_city:    contact_city?.trim() || null,
      contact_state:   contact_state?.trim() || null,
      contact_zip:     contact_zip?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/leads error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Email notification (non-blocking) ────────────────────────────────────
  if (proRecord?.email && process.env.RESEND_API_KEY) {
    try {
      const resend  = new Resend(process.env.RESEND_API_KEY)
      const appUrl  = process.env.NEXT_PUBLIC_APP_URL || 'https://proguild.ai'
      await resend.emails.send({
        from:    process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to:      proRecord.email,
        subject: `New lead from ${contact_name} — ProGuild.ai`,
        html:    leadNotificationEmail({
          proName:      proRecord.full_name,
          proEmail:     proRecord.email,
          contactName:  contact_name,
          contactEmail: contact_email,
          contactPhone: contact_phone || null,
          message,
          city:         proRecord.city,
          state:        proRecord.state,
          leadSource:   lead_source || 'Profile_Page',
          dashboardUrl: `${appUrl}/dashboard`,
          isPaid:       proRecord.plan_tier !== 'Free',
        }),
      })
    } catch (e) { console.error('Email failed:', e) }
  }

  // ── Auto-link client ──────────────────────────────────────────────────────
  // Match existing client by phone → email → create new
  let clientId: string | null = null
  try {
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
    // Third fallback: match by name + address (catches leads created without phone/email)
    if (!clientId && contact_name && streetOnly) {
      const { data: byNameAddr } = await supabase.from('clients').select('id')
        .eq('pro_id', pro_id)
        .ilike('full_name', contact_name.trim())
        .ilike('address_line1', streetOnly)
        .maybeSingle()
      if (byNameAddr) clientId = byNameAddr.id
    }
    if (!clientId) {
      const { data: newClient } = await supabase.from('clients').insert({
        pro_id,
        full_name:    contact_name.trim(),
        phone:        contact_phone?.trim()              || null,
        email:        contact_email?.toLowerCase().trim() || null,
        address_line1: streetOnly                        || null,
        city:         contact_city?.trim()               || null,
        state:        contact_state?.trim()              || null,
        zip_code:     contact_zip?.trim()                || null,
      }).select('id').single()
      if (newClient) clientId = newClient.id
    }
    if (clientId) {
      await supabase.from('leads').update({ client_id: clientId }).eq('id', lead.id)
      lead.client_id = clientId
    }
  } catch (e) { console.error('Client auto-link failed:', e) }

  // ── Auto-create / match property and set property_id ─────────────────────
  // Only if the lead has an address
  if (streetOnly) {
    try {
      // Try to match existing property by address + pro
      const { data: existingProp } = await supabase
        .from('properties')
        .select('id')
        .eq('pro_id', pro_id)
        .ilike('address_line1', streetOnly)
        .maybeSingle()

      let propertyId: string | null = existingProp?.id ?? null

      if (!propertyId) {
        // Create new property record
        const { data: newProp } = await supabase.from('properties').insert({
          pro_id,
          address_line1: streetOnly,
          city:          contact_city?.trim()  || null,
          state:         contact_state?.trim() || null,
          zip_code:      contact_zip?.trim()   || null,
          client_id:     clientId              || null,
          property_type: 'residential',
        }).select('id').single()
        if (newProp) propertyId = newProp.id
      }

      if (propertyId) {
        await supabase.from('leads').update({ property_id: propertyId }).eq('id', lead.id)
        lead.property_id = propertyId
      }
    } catch (e) { console.error('Property auto-link failed:', e) }
  }

  // ── Create roofing_job_data row for roofing pros ─────────────────────────
  // Ensures the row always exists so insurance/measurement PATCHes upsert cleanly
  if (tradeSlug && tradeSlug.includes('roof')) {
    try {
      const { error: rjdErr } = await supabase.from('roofing_job_data').insert({
        lead_id:  lead.id,
        pro_id,
      })
      console.log('[POST /api/leads] roofing_job_data insert — lead_id:', lead.id, 'error:', rjdErr?.message ?? 'OK')
    } catch (e) { console.error('[POST /api/leads] roofing_job_data insert threw:', e) }
  }

  // ── Write initial pipeline_event ──────────────────────────────────────────
  try {
    await supabase.from('pipeline_events').insert({
      lead_id:    lead.id,
      pro_id,
      trade_slug: tradeSlug,
      event_type: 'lead_created',
      event_data: { to: initialStage },
      actor_type: 'system',
      created_at: new Date().toISOString(),
    })
  } catch (e) { console.error('pipeline_events insert failed:', e) }

  return NextResponse.json({ lead }, { status: 201 })
}
