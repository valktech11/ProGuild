import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { auditedAdmin } from '@/lib/audit-context'
import { leadNotificationEmail } from '@/lib/email'
import { sendProSms, newLeadSmsBody } from '@/lib/sms'
import { Resend } from 'resend'
import { moderateContent } from '@/lib/moderation'
import { getInitialStage } from '@/lib/trades/_registry'
import { requirePro } from '@/lib/pro-auth'

export async function GET(req: NextRequest) {
  const __auth = await requirePro(req, new URL(req.url).searchParams.get('pro_id'))
  if (__auth.error) return __auth.error
  const { companyId, proId: _callerProId, role: _callerRole } = __auth
  if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 400 })
  const { searchParams } = new URL(req.url)
  const proId = _callerProId  // server-derived, used for roof_reports and member filter
  const clientFilter = searchParams.get('client_id')

  // Role-based isolation: owner sees all company leads; member sees only assigned
  let q = getSupabaseAdmin()
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (_callerRole === 'member') {
    q = q.eq('assigned_to_pro_id', _callerProId)
  }
  if (clientFilter) q = q.eq('client_id', clientFilter)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leads = data || []

  // Per-lead estimate signal so clients can render the stage directive ("Send to
  // homeowner" vs "Write the estimate") INSTANTLY from the list, without a
  // per-lead estimate fetch on open. We attach:
  //   - draft_total: newest draft total for unpriced leads (display "Draft $X")
  //   - estimate_status: status of the newest estimate (any status), so the hero
  //     knows whether an estimate exists and if it's draft/sent.
  // Both come from ONE estimates query over all visible leads (indexed on
  // lead_id) — no N+1. ADDITIVE: consumers read named fields; extras ignored.
  const allLeadIds = leads.map((l: any) => l.id)
  if (allLeadIds.length > 0) {
    const { data: ests } = await getSupabaseAdmin()
      .from('estimates')
      .select('lead_id, total, status, created_at')
      .in('lead_id', allLeadIds)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (ests && ests.length > 0) {
      const statusMap = new Map<string, string>()
      const draftMap = new Map<string, number>()
      for (const e of ests) {
        // First seen per lead = newest (ordered desc).
        if (!statusMap.has(e.lead_id)) statusMap.set(e.lead_id, e.status)
        if (!draftMap.has(e.lead_id) && e.status === 'draft' && e.total > 0) {
          draftMap.set(e.lead_id, e.total)
        }
      }
      for (const l of leads as any[]) {
        if (statusMap.has(l.id)) l.estimate_status = statusMap.get(l.id)
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
    // Job-data fallback values, keyed by lead_id. We also carry insurance_claim +
    // claim_status here (same query, no extra round-trip) so the hero's
    // claim-aware directives render from the list seed without a per-lead join.
    const { data: jobData } = await getSupabaseAdmin()
      .from('roofing_job_data')
      .select('lead_id, square_count, pitch, insurance_claim, claim_status')
      .in('lead_id', leadIds)
    const jdMap = new Map<string, { square_count: number | null; pitch: string | null; insurance_claim: boolean | null; claim_status: string | null }>()
    for (const jd of jobData || []) {
      jdMap.set(jd.lead_id, {
        square_count: jd.square_count ?? null,
        pitch: jd.pitch ?? null,
        insurance_claim: jd.insurance_claim ?? null,
        claim_status: jd.claim_status ?? null,
      })
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
      // Attach when there's roof size OR claim info to carry. Claim fields let the
      // hero render its claim-aware directive instantly from the list seed.
      const hasClaim = jd?.insurance_claim != null || jd?.claim_status != null
      if (square_count != null || pitch != null || hasClaim) {
        l.roofing_job_data = {
          square_count, pitch,
          insurance_claim: jd?.insurance_claim ?? null,
          claim_status: jd?.claim_status ?? null,
        }
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
    // HVAC-specific — populate hvac_job_data row on POST
    system_type, issue_type, refrigerant_type,
    // trade_slug from client session — fallback if pros row not yet updated
    trade_slug: clientTradeSlug,
  } = body

  // Two distinct flows share this endpoint:
  //   • Manual (is_manual): a signed-in pro creates a lead from the dashboard.
  //     Requires bearer auth; pro_id must equal the caller's own pros.id.
  //   • Public: a prospect submits a contractor's public contact form. No
  //     session — pro_id is supplied by the public page. We validate it names
  //     a real pro (below) but do not require a bearer.
  let _manualCompanyId: string | null = null
  let _auth2ProId: string | null = null
  if (is_manual) {
    const __auth = await requirePro(req, pro_id)
    if (__auth.error) return __auth.error
    _manualCompanyId = __auth.companyId ?? null
    _auth2ProId = __auth.proId ?? null
  }

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

  // Actor context: manual flow = the signed-in pro; public form = the prospect
  // (homeowner). Either way the write is audited with the right source/actor_type.
  const supabase = auditedAdmin(req, {
    actorId: is_manual ? pro_id : pro_id, // pro_id owns the record in both flows
    actorType: is_manual ? 'pro' : 'homeowner',
  })

  // ── Resolve pro profile — trade_slug + notification email ────────────────
  const { data: proRecord } = await supabase
    .from('pros')
    .select('trade_slug, trade_category_id, full_name, email, phone, plan_tier, city, state')
    .eq('id', pro_id)
    .single()

  // Resolve trade_slug through a priority chain so the lead always gets the
  // correct initial stage even if pros.trade_slug hasn't been backfilled:
  //   1. pros.trade_slug (authoritative, denormalised)
  //   2. client-supplied trade_slug (from session, sent in POST body)
  //   3. trade_categories.slug via pros.trade_category_id (source of truth)
  let tradeSlug: string | null = proRecord?.trade_slug ?? clientTradeSlug ?? null
  if (!tradeSlug && proRecord?.trade_category_id) {
    const { data: tcRow } = await supabase
      .from('trade_categories')
      .select('slug')
      .eq('id', proRecord.trade_category_id)
      .maybeSingle()
    tradeSlug = tcRow?.slug ?? null
    // Backfill pros.trade_slug so this lookup only happens once per pro
    if (tradeSlug) {
      void supabase.from('pros').update({ trade_slug: tradeSlug }).eq('id', pro_id)
    }
  }
  const initialStage = getInitialStage(tradeSlug)
  console.log('[POST /api/leads] trade_slug resolution — pros:', proRecord?.trade_slug, 'client:', clientTradeSlug, 'final:', tradeSlug, 'initialStage:', initialStage)

  // ── Normalise address ─────────────────────────────────────────────────────
  // street_only = just the street portion (never the full "street, city, state, zip" string)
  const streetOnly = property_address?.trim()
    ? (contact_city || contact_state || contact_zip)
      ? property_address.split(',')[0].trim()   // strip city/state if already separate
      : property_address.trim()
    : null

  // ── Pre-resolve client_id and property_id before INSERT ──────────────────
  // Resolving first guarantees the lead is created once with all FKs already
  // set — no follow-up leads UPDATEs for client_id/property_id (one audit row).
  let clientId: string | null = client_id || null
  try {
    if (!clientId && contact_phone) {
      const { data: byPhone } = await supabase.from('clients').select('id')
        .eq('pro_id', pro_id).eq('phone', contact_phone.trim()).maybeSingle()
      if (byPhone) clientId = byPhone.id
    }
    if (!clientId && contact_email) {
      const { data: byEmail } = await supabase.from('clients').select('id')
        .eq('pro_id', pro_id).eq('email', contact_email.toLowerCase().trim()).maybeSingle()
      if (byEmail) clientId = byEmail.id
    }
    if (!clientId && contact_name && streetOnly) {
      const { data: byNameAddr } = await supabase.from('clients').select('id')
        .eq('pro_id', pro_id).ilike('full_name', contact_name.trim())
        .eq('address_line1', streetOnly).maybeSingle()
      if (byNameAddr) clientId = byNameAddr.id
    }
    if (!clientId) {
      const { data: newClient, error: clientErr } = await supabase.from('clients').insert({
        pro_id,
        full_name:     contact_name.trim(),
        phone:         contact_phone?.trim()               || null,
        email:         contact_email?.toLowerCase().trim() || null,
        address_line1: streetOnly                          || null,
        city:          contact_city?.trim()                || null,
        state:         contact_state?.trim()               || null,
        zip_code:      contact_zip?.trim()                 || null,
      }).select('id').single()
      if (clientErr) console.error('Client insert failed:', clientErr.message, clientErr.details)
      if (newClient) clientId = newClient.id
    }
  } catch (e) { console.error('Client pre-resolve failed:', e) }

  let propertyId: string | null = null
  if (streetOnly) {
    try {
      const { data: existingProp } = await supabase.from('properties').select('id')
        .eq('pro_id', pro_id).eq('address_line1', streetOnly).maybeSingle()
      propertyId = existingProp?.id ?? null
      if (!propertyId) {
        const { data: newProp, error: propErr } = await supabase.from('properties').insert({
          pro_id,
          address_line1: streetOnly,
          address:       streetOnly,            // legacy NOT NULL column in prod
          city:          contact_city?.trim()  || null,
          state:         contact_state?.trim() || null,
          zip_code:      contact_zip?.trim()   || null,
          client_id:     clientId              || null,
          property_type: 'residential',
        }).select('id').single()
        if (propErr) console.error('Property insert failed:', propErr.message, propErr.details)
        if (newProp) propertyId = newProp.id
      }
    } catch (e) { console.error('Property pre-resolve failed:', e) }
  }

  // ── Insert lead (single write — client_id + property_id already resolved) ─
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      pro_id,
      job_id:           job_id || null,
      trade_slug:       tradeSlug,
      contact_name,
      contact_email:    contact_email ? contact_email.toLowerCase().trim() : null,
      contact_phone:    contact_phone || null,
      message,
      lead_status:      initialStage,
      lead_source:      lead_source || 'Profile_Page',
      company_id:       _manualCompanyId || null,
      // Auto-assign: member gets self, owner gets self by default
      assigned_to_pro_id: _auth2ProId || null,
      client_id:        clientId    || null,
      property_id:      propertyId  || null,
      property_address: streetOnly,
      contact_city:     contact_city?.trim()  || null,
      contact_state:    contact_state?.trim() || null,
      contact_zip:      contact_zip?.trim()   || null,
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

    // ── SMS to pro — fire if they have a phone number on file ──────────────
    // We only SMS the pro (contractor), never the homeowner.
    // Pros consented via Terms of Service at signup.
    if (proRecord?.phone) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proguild.ai'
      void sendProSms(
        proRecord.phone,
        newLeadSmsBody({
          contactName:  contact_name,
          city:         proRecord.city,
          state:        proRecord.state,
          dashboardUrl: `${appUrl}/dashboard`,
        })
      )
    }
  }

  // Client and property were resolved before INSERT — no follow-up writes needed.
  // lead.client_id and lead.property_id are already set in the INSERT above.

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

  // ── Create hvac_job_data row for HVAC pros ────────────────────────────────
  // Captures system_type, issue_type, refrigerant_type at lead creation so the
  // row always exists for downstream PATCHes (equipment wiring, diagnosis notes).
  if (tradeSlug && (tradeSlug.includes('hvac') || tradeSlug === 'hvac-technician')) {
    try {
      const { error: hjdErr } = await supabase.from('hvac_job_data').insert({
        lead_id:          lead.id,
        pro_id,
        system_type:      system_type      || null,
        issue_type:       issue_type       || null,
        refrigerant_type: refrigerant_type || null,
      })
      console.log('[POST /api/leads] hvac_job_data insert — lead_id:', lead.id, 'error:', hjdErr?.message ?? 'OK')
    } catch (e) { console.error('[POST /api/leads] hvac_job_data insert threw:', e) }
  }

  // ── Write initial pipeline_event ──────────────────────────────────────────
  try {
    await supabase.from('pipeline_events').insert({
      lead_id:    lead.id,
      pro_id,
        company_id: _manualCompanyId ?? null,
      trade_slug: tradeSlug,
      event_type: 'lead_created',
      event_data: { to: initialStage },
      actor_type: 'system',
      created_at: new Date().toISOString(),
    })
  } catch (e) { console.error('pipeline_events insert failed:', e) }

  return NextResponse.json({ lead }, { status: 201 })
}
