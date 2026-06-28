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
    .select('*')
    .eq('pro_id', proId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leads = data || []

  // For leads with no committed quoted_amount, fetch the most recent draft
  // estimate total so clients can show "Draft $X" without an N+1 per-lead fetch.
  // Display-only: draft_total never writes to quoted_amount.
  const unpriced = leads.filter((l: any) => l.quoted_amount == null).map((l: any) => l.id)
  if (unpriced.length > 0) {
    const { data: drafts } = await getSupabaseAdmin()
      .from('estimates')
      .select('lead_id, total')
      .in('lead_id', unpriced)
      .eq('pro_id', proId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
    if (drafts && drafts.length > 0) {
      const draftMap = new Map<string, number>()
      for (const d of drafts) {
        if (!draftMap.has(d.lead_id) && d.total > 0) draftMap.set(d.lead_id, d.total)
      }
      for (const l of leads as any[]) {
        if (l.quoted_amount == null && draftMap.has(l.id)) {
          l.draft_total = draftMap.get(l.id)
        }
      }
    }
  }

  // Attach lightweight roof size (square_count + pitch) per lead so clients can
  // show it immediately on lead open WITHOUT a per-lead fetch (mobile) and
  // without a flicker. We deliberately fetch only these two fields — NOT the
  // heavy roofing_job_data join — to keep the list lean.
  //
  // Precedence MUST match the single-lead GET (app/api/leads/[id]/route.ts) and
  // Bible §25: the newest roof_reports row (with a non-null total_squares_order)
  // wins; otherwise fall back to roofing_job_data. If list and detail disagreed,
  // the size would visibly change when opening a lead.
  //
  // CROSS-PLATFORM CONTRACT: this is ADDITIVE. Web list consumers read named
  // fields and ignore extras. Mobile's RoofingJobData.fromJson is fully
  // null-tolerant, so the partial { square_count, pitch } object parses cleanly.
  // Do NOT remove these fields without checking BOTH web and mobile consumers.
  const leadIds = leads.map((l: any) => l.id)
  const propertyIds = leads.map((l: any) => l.property_id).filter(Boolean)
  if (leadIds.length > 0) {
    // Job-data fallback values, keyed by lead_id.
    const { data: jobData } = await getSupabaseAdmin()
      .from('roofing_job_data')
      .select('lead_id, square_count, pitch')
      .in('lead_id', leadIds)
    const jdMap = new Map<string, { square_count: number | null; pitch: string | null }>()
    for (const jd of jobData || []) {
      jdMap.set(jd.lead_id, { square_count: jd.square_count ?? null, pitch: jd.pitch ?? null })
    }

    // Authoritative report values, keyed by property_id (newest non-null first).
    const reportMap = new Map<string, { square_count: number | null; pitch: string | null }>()
    if (propertyIds.length > 0) {
      const { data: reports } = await getSupabaseAdmin()
        .from('roof_reports')
        .select('property_id, total_squares_order, dominant_pitch, created_at')
        .eq('pro_id', proId)
        .in('property_id', propertyIds)
        .not('total_squares_order', 'is', null)
        .order('created_at', { ascending: false })
      for (const r of reports || []) {
        // First seen = newest (ordered desc), so don't overwrite.
        if (!reportMap.has(r.property_id)) {
          reportMap.set(r.property_id, {
            square_count: r.total_squares_order ?? null,
            pitch: r.dominant_pitch ?? null,
          })
        }
      }
    }

    for (const l of leads as any[]) {
      const rep = l.property_id ? reportMap.get(l.property_id) : undefined
      const jd = jdMap.get(l.id)
      const square_count = rep?.square_count ?? jd?.square_count ?? null
      const pitch = rep?.pitch ?? jd?.pitch ?? null
      // Only attach when there's something to show, so unmeasured leads stay
      // genuinely empty (the card shows its measure-this-roof prompt correctly).
      if (square_count != null || pitch != null) {
        l.roofing_job_data = { square_count, pitch }
      }
    }
  }

  return NextResponse.json({ leads })
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
        .eq('address_line1', streetOnly)
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
        .eq('address_line1', streetOnly)
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
