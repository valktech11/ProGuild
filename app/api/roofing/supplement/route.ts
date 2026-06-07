import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  buildSupplementPrompt,
  parseSupplementResponse,
  type SupplementInput,
} from '@/lib/fl/supplement'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/roofing/supplement
// Body: { lead_id, pro_id, scope_text }
// Pulls lead + roofing_job_data context, calls Gemini, returns structured supplement,
// and persists the run to supplement_sessions (the claim-outcome data moat).
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { lead_id, pro_id, scope_text } = body ?? {}
  if (!lead_id || !pro_id) return NextResponse.json({ error: 'lead_id and pro_id required' }, { status: 400 })
  if (!scope_text || typeof scope_text !== 'string' || scope_text.trim().length < 20) {
    return NextResponse.json({ error: 'Paste the adjuster\u2019s scope of loss (at least a few lines).' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI is not configured (missing GEMINI_API_KEY).' }, { status: 503 })

  const sb = getSupabaseAdmin()

  // ── Gather lead context (FL gate + claim fields + roof measurements) ──────────
  const { data: lead } = await sb
    .from('leads')
    .select('id, pro_id, contact_state, property_address')
    .eq('id', lead_id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.pro_id !== pro_id) return NextResponse.json({ error: 'Not authorized for this lead' }, { status: 403 })

  // FL-only — same jurisdiction gate as SB 2-A / 25%-rule.
  if ((lead.contact_state ?? '').toUpperCase() !== 'FL') {
    return NextResponse.json({ error: 'The Supplement Assistant is Florida-only (the rules it applies are FL-specific).' }, { status: 422 })
  }

  const { data: rjd } = await sb
    .from('roofing_job_data')
    .select('insurance_company, claim_number, adjuster_name, date_of_loss, roof_install_date, approved_amount, square_count, pitch')
    .eq('lead_id', lead_id)
    .maybeSingle()

  const { data: pro } = await sb
    .from('pros')
    .select('business_name, full_name')
    .eq('id', pro_id)
    .maybeSingle()

  const toNum = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,]/g, ''))
    return Number.isFinite(n) ? n : null
  }

  const input: SupplementInput = {
    scopeText:        scope_text.trim(),
    adjusterName:     rjd?.adjuster_name ?? null,
    insuranceCompany: rjd?.insurance_company ?? null,
    claimNumber:      rjd?.claim_number ?? null,
    dateOfLoss:       rjd?.date_of_loss ?? null,
    roofSquares:      toNum(rjd?.square_count),
    roofPitch:        rjd?.pitch ?? null,
    roofInstallDate:  rjd?.roof_install_date ?? null,
    approvedAmount:   toNum(rjd?.approved_amount),
    propertyAddress:  lead.property_address ?? null,
    proCompany:       pro?.business_name || pro?.full_name || null,
  }

  // ── Call Gemini ───────────────────────────────────────────────────────────────
  const model = process.env.AI_PROVIDER_MODEL || 'gemini-2.5-flash'
  let raw = ''
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildSupplementPrompt(input) }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.2 },
        }),
      },
    )
    const text = await res.text()
    console.log('[supplement] Gemini status:', res.status, 'bytes:', text.length)
    if (!res.ok) {
      console.error('[supplement] Gemini error body:', text.slice(0, 500))
      return NextResponse.json({ error: 'AI request failed. Try again.' }, { status: 502 })
    }
    const data = JSON.parse(text)
    raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    console.log('[supplement] raw preview:', raw.slice(0,300), '| finish:', data.candidates?.[0]?.finishReason)
  } catch (e) {
    console.error('[supplement] exception:', e)
    return NextResponse.json({ error: 'AI request failed. Try again.' }, { status: 502 })
  }

  let result
  try {
    result = parseSupplementResponse(raw)
  } catch (e) {
    console.error('[supplement] parse failed:', e, 'raw:', raw.slice(0, 500))
    return NextResponse.json({ error: 'Could not read the AI response. Try again.' }, { status: 502 })
  }

  // ── Persist the run (data moat). Non-fatal if it fails. ────────────────────────
  try {
    await sb.from('supplement_sessions').insert({
      lead_id,
      pro_id,
      scope_text: input.scopeText,
      result_json: result,
    })
  } catch (e) {
    console.error('[supplement] session save failed (non-fatal):', e)
  }

  return NextResponse.json({ result }, { status: 200 })
}
