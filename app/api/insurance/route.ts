import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

/** Derive MIME type from URL extension — don't trust Supabase content-type headers */
function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.pdf'))  return 'application/pdf'
  if (clean.endsWith('.png'))  return 'image/png'
  if (clean.endsWith('.webp')) return 'image/webp'
  if (clean.endsWith('.gif'))  return 'image/gif'
  return 'image/jpeg' // default for .jpg / .jpeg / anything else
}

async function extractCOIData(file_url: string): Promise<{
  insurer_name: string|null, policy_number: string|null,
  coverage_type: string|null, expiry_date: string|null
}> {
  const empty = { insurer_name: null, policy_number: null, coverage_type: null, expiry_date: null }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return empty

  try {
    const fileRes = await fetch(file_url)
    if (!fileRes.ok) { console.error('COI fetch failed:', fileRes.status, file_url); return empty }

    const arrayBuf   = await fileRes.arrayBuffer()
    const b64        = Buffer.from(arrayBuf).toString('base64')
    const mimeType   = mimeFromUrl(file_url)           // reliable — from extension
    const isPDF      = mimeType === 'application/pdf'

    const PROMPT = `You are extracting data from a Certificate of Liability Insurance (COI) document.
Find and return ONLY these four fields:
- insurer_name: The insurance company name (from "INSURER A" or similar field)
- policy_number: The policy number
- coverage_type: The type of coverage (e.g. "Commercial General Liability")
- expiry_date: The POLICY EXPIRATION DATE in YYYY-MM-DD format (look for "POLICY EXP" or "EXPIRATION DATE" column — NOT the event end date or certificate date)

Respond ONLY with valid JSON, no markdown, no explanation:
{"insurer_name":"value or null","policy_number":"value or null","coverage_type":"value or null","expiry_date":"YYYY-MM-DD or null"}`

    const fileBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
      : { type: 'image',    source: { type: 'base64', media_type: mimeType,           data: b64 } }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    // PDF document blocks require this beta header
    if (isPDF) headers['anthropic-beta'] = 'pdfs-2024-09-25'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
      }),
    })

    if (!res.ok) { console.error('COI extract API error:', res.status, await res.text()); return empty }
    const d    = await res.json()
    const text = (d.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
    console.log('COI raw extraction:', text)   // visible in Vercel function logs
    const p    = JSON.parse(text)
    return {
      insurer_name:  p.insurer_name  || null,
      policy_number: p.policy_number || null,
      coverage_type: p.coverage_type || null,
      expiry_date:   p.expiry_date   || null,
    }
  } catch(e) { console.error('COI extract exception:', e); return empty }
}

export async function GET(req: NextRequest) {
  const proId = new URL(req.url).searchParams.get('pro_id')
  if (!proId) return NextResponse.json({ error: 'pro_id required' }, { status: 400 })
  const { data } = await getSupabaseAdmin()
    .from('pro_insurance').select('*').eq('pro_id', proId)
    .order('created_at', { ascending: false })
  return NextResponse.json({ insurance: data || [] })
}

export async function POST(req: NextRequest) {
  const { pro_id, file_url } = await req.json()
  if (!pro_id || !file_url) return NextResponse.json({ error: 'pro_id and file_url required' }, { status: 400 })
  const sb = getSupabaseAdmin()

  const extracted = await extractCOIData(file_url)
  console.log('COI extracted result:', extracted)   // Vercel logs

  let status = 'unknown'
  if (extracted.expiry_date) {
    const exp  = new Date(extracted.expiry_date)
    const now  = new Date()
    const in30 = new Date(); in30.setDate(now.getDate() + 30)
    status = exp < now ? 'expired' : exp < in30 ? 'expiring_soon' : 'active'
  }

  const { data, error } = await sb.from('pro_insurance').insert({
    pro_id, file_url, ...extracted, insurance_status: status,
    extracted_at: process.env.ANTHROPIC_API_KEY ? new Date().toISOString() : null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sb.from('pros').update({ insurance_status: status, insurance_expiry_date: extracted.expiry_date || null }).eq('id', pro_id)
  return NextResponse.json({ insurance: data, extracted }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { pro_id, id } = await req.json()
  if (!pro_id || !id) return NextResponse.json({ error: 'pro_id and id required' }, { status: 400 })
  const sb = getSupabaseAdmin()
  await sb.from('pro_insurance').delete().eq('id', id).eq('pro_id', pro_id)
  const { data: rem } = await sb.from('pro_insurance').select('id').eq('pro_id', pro_id).limit(1)
  if (!rem?.length) await sb.from('pros').update({ insurance_status: 'unknown', insurance_expiry_date: null }).eq('id', pro_id)
  return NextResponse.json({ ok: true })
}
