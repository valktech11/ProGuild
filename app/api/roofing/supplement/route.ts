import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  buildItemsPrompt,
  buildLetterPrompt,
  parseSupplementResponse,
  type SupplementInput,
  type SupplementItem,
} from '@/lib/fl/supplement'

export const runtime = 'nodejs'
export const maxDuration = 60

async function callGemini(apiKey: string, model: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  )
  const text = await res.text()
  console.log(`[supplement] Gemini status: ${res.status} bytes: ${text.length}`)
  if (!res.ok) {
    console.error('[supplement] Gemini error:', text.slice(0, 300))
    throw new Error(`Gemini ${res.status}`)
  }
  const data = JSON.parse(text)
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const finish = data.candidates?.[0]?.finishReason
  console.log(`[supplement] finish: ${finish} raw preview: ${raw.slice(0, 200)}`)
  if (finish === 'MAX_TOKENS') throw new Error('MAX_TOKENS')
  return raw
}

// POST /api/roofing/supplement
export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { lead_id, pro_id, scope_text } = body ?? {}
  if (!lead_id || !pro_id) return NextResponse.json({ error: 'lead_id and pro_id required' }, { status: 400 })
  if (!scope_text || typeof scope_text !== 'string' || scope_text.trim().length < 20) {
    return NextResponse.json({ error: 'Paste the adjuster\'s scope of loss (at least a few lines).' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })

  const sb = getSupabaseAdmin()

  // ── Lead context ──────────────────────────────────────────────────────────
  const { data: lead } = await sb
    .from('leads')
    .select('id, pro_id, contact_state, property_address')
    .eq('id', lead_id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.pro_id !== pro_id) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  if ((lead.contact_state ?? '').toUpperCase() !== 'FL') {
    return NextResponse.json({ error: 'The Supplement Assistant is Florida-only.' }, { status: 422 })
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

  const model = process.env.AI_PROVIDER_MODEL || 'gemini-2.5-flash'

  // ── Call 1: find items (JSON only, small output) ───────────────────────────
  let itemsRaw = ''
  try {
    itemsRaw = await callGemini(apiKey, model, buildItemsPrompt(input), 4096)
  } catch (e) {
    console.error('[supplement] items call failed:', e)
    return NextResponse.json({ error: 'AI request failed. Try again.' }, { status: 502 })
  }

  let partialResult: any
  try {
    partialResult = parseSupplementResponse(itemsRaw)
  } catch (e) {
    console.error('[supplement] items parse failed:', e, 'raw:', itemsRaw.slice(0, 300))
    return NextResponse.json({ error: 'Could not read the AI response. Try again.' }, { status: 502 })
  }

  // ── Call 2: draft letter (plain text, separate budget) ────────────────────
  const allItems: SupplementItem[] = [...partialResult.missing_items, ...partialResult.underpaid_items]
  let letter = ''
  if (allItems.length > 0) {
    try {
      letter = await callGemini(apiKey, model, buildLetterPrompt(input, allItems), 2048)
      // Letter is plain text — strip any accidental markdown fences
      letter = letter.replace(/```[a-z]*/g, '').replace(/```/g, '').trim()
    } catch (e) {
      console.error('[supplement] letter call failed (non-fatal):', e)
      letter = '(Letter generation failed — use the item list above to draft manually.)'
    }
  } else {
    letter = 'The adjuster\'s scope appears complete against the FL checklist. No supplement items were identified.'
  }

  const result = { ...partialResult, supplement_letter: letter }

  // ── Persist run (data moat, non-fatal) ────────────────────────────────────
  try {
    await sb.from('supplement_sessions').insert({ lead_id, pro_id, scope_text: input.scopeText, result_json: result })
  } catch (e) {
    console.error('[supplement] session save failed (non-fatal):', e)
  }

  return NextResponse.json({ result }, { status: 200 })
}

// GET /api/roofing/supplement?lead_id=X&pro_id=Y
// Returns the most recent session for this lead, if any.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lead_id = searchParams.get('lead_id')
  const pro_id  = searchParams.get('pro_id')
  if (!lead_id || !pro_id) return NextResponse.json({ session: null })

  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('supplement_sessions')
    .select('id, scope_text, result_json, created_at')
    .eq('lead_id', lead_id)
    .eq('pro_id', pro_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ session: data ?? null })
}
