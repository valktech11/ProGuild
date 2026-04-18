import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0].toLowerCase()
  if (clean.endsWith('.pdf'))  return 'application/pdf'
  if (clean.endsWith('.png'))  return 'image/png'
  if (clean.endsWith('.webp')) return 'image/webp'
  if (clean.endsWith('.gif'))  return 'image/gif'
  return 'image/jpeg'
}

async function extractCOIData(file_url: string): Promise<{
  insurer_name: string|null, policy_number: string|null,
  coverage_type: string|null, expiry_date: string|null
}> {
  const empty = { insurer_name: null, policy_number: null, coverage_type: null, expiry_date: null }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return empty

  try {
    const fileRes = await fetch(file_url)
    if (!fileRes.ok) { console.log('[COI] File fetch failed:', fileRes.status); return empty }
    const arrayBuf = await fileRes.arrayBuffer()
    const b64      = Buffer.from(arrayBuf).toString('base64')
    const mimeType = mimeFromUrl(file_url)
    console.log('[COI] File size:', arrayBuf.byteLength, 'mime:', mimeType)

    const model = process.env.AI_PROVIDER_MODEL || 'gemini-2.5-flash'
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: b64 } },
              { text: `You are extracting fields from a Certificate of Liability Insurance (COI).
Return a JSON object with exactly these four keys:
- "insurer_name": string or null
- "policy_number": string or null  
- "coverage_type": string or null
- "expiry_date": string in YYYY-MM-DD format from the POLICY EXP column, or null

Do not include any other keys. Use null for missing fields.` }
            ]
          }],
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    const resText = await response.text()
    console.log('[COI] Gemini status:', response.status, 'body:', resText.slice(0, 500))

    if (!response.ok) return empty

    const data = JSON.parse(resText)
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    console.log('[COI] Extracted text:', raw)

    if (!raw) return empty
    const p = JSON.parse(raw)
    return {
      insurer_name:  p.insurer_name  || null,
      policy_number: p.policy_number || null,
      coverage_type: p.coverage_type || null,
      expiry_date:   p.expiry_date   || null,
    }
  } catch(e) {
    console.log('[COI] Exception:', e)
    return empty
  }
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
  console.log('[COI] Final:', extracted)

  let status = 'unknown'
  if (extracted.expiry_date) {
    const exp  = new Date(extracted.expiry_date)
    const now  = new Date()
    const in30 = new Date(); in30.setDate(now.getDate() + 30)
    status = exp < now ? 'expired' : exp < in30 ? 'expiring_soon' : 'active'
  }

  const { data, error } = await sb.from('pro_insurance').insert({
    pro_id, file_url, ...extracted, insurance_status: status,
    extracted_at: new Date().toISOString(),
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
