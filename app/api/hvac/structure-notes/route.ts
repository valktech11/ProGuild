import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const __auth = await requirePro(req as any, body.pro_id ?? null)
  if (__auth.error) return __auth.error

  const transcript = (body.transcript ?? '').toString().trim()
  if (!transcript) {
    return NextResponse.json({ error: 'No transcript provided' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[structure-notes] GEMINI_API_KEY not set')
    return NextResponse.json({
      symptoms: '', diagnosis: '', work_done: transcript, recommendation: '',
      raw: transcript, structured: false,
    })
  }

  const model = process.env.AI_PROVIDER_MODEL || 'gemini-2.5-flash'
  console.log('[structure-notes] key prefix:', apiKey.slice(0, 8), 'model:', model)

  const prompt = `You are an HVAC service-note assistant. A technician has dictated a rough voice note from a service call. Structure it into clear, professional service-note fields.

Technician's dictation:
"${transcript}"

Return a JSON object with exactly these fields (each a short professional string, empty string if not mentioned):
- "symptoms": what the customer reported or what was observed wrong
- "diagnosis": the root cause the tech identified
- "work_done": what the tech actually did / parts replaced
- "recommendation": any follow-up, future work, or advice for the customer

Keep each field concise and in professional service-report language. Fix grammar. Do not invent details not in the dictation. Only return JSON.`

  const geminiPayload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.2,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    console.log('[structure-notes] POST', url.replace(apiKey, 'REDACTED'))

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    })

    const rawText = await response.text()
    console.log('[structure-notes] Gemini status:', response.status, 'body preview:', rawText.slice(0, 400))

    if (!response.ok) {
      return NextResponse.json({
        symptoms: '', diagnosis: '', work_done: transcript, recommendation: '',
        raw: transcript, structured: false,
        debug_status: response.status, debug_error: rawText.slice(0, 400),
      })
    }

    const data = JSON.parse(rawText)
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const parsed = JSON.parse(raw)

    return NextResponse.json({
      symptoms:       parsed.symptoms ?? '',
      diagnosis:      parsed.diagnosis ?? '',
      work_done:      parsed.work_done ?? '',
      recommendation: parsed.recommendation ?? '',
      raw:            transcript,
      structured:     true,
    })
  } catch (e) {
    console.error('[structure-notes] exception:', String(e))
    return NextResponse.json({
      symptoms: '', diagnosis: '', work_done: transcript, recommendation: '',
      raw: transcript, structured: false, debug_exception: String(e),
    })
  }
}
