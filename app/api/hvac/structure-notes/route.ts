import { NextRequest, NextResponse } from 'next/server'
import { requirePro } from '@/lib/pro-auth'

// POST /api/hvac/structure-notes
// Takes a raw voice transcript from a tech and structures it into
// symptoms / diagnosis / work done / recommendation.
//
// Body: { transcript: string, pro_id: string }
// Returns: { symptoms, diagnosis, work_done, recommendation, raw }

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
    // Graceful fallback — return the raw transcript as the work_done so the
    // tech still gets their note saved even without AI structuring.
    return NextResponse.json({
      symptoms: '', diagnosis: '', work_done: transcript, recommendation: '',
      raw: transcript, structured: false,
    })
  }

  const model = process.env.AI_PROVIDER_MODEL || 'gemini-2.5-flash'
  const prompt = `You are an HVAC service-note assistant. A technician has dictated a rough voice note from a service call. Structure it into clear, professional service-note fields.

Technician's dictation:
"${transcript}"

Return a JSON object with exactly these fields (each a short professional string, empty string if not mentioned):
- "symptoms": what the customer reported or what was observed wrong
- "diagnosis": the root cause the tech identified
- "work_done": what the tech actually did / parts replaced
- "recommendation": any follow-up, future work, or advice for the customer

Keep each field concise and in professional service-report language. Fix grammar. Do not invent details not in the dictation. Only return JSON.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0.2,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.error('[structure-notes] Gemini error', response.status, errText)
      return NextResponse.json({
        symptoms: '', diagnosis: '', work_done: transcript, recommendation: '',
        raw: transcript, structured: false,
      })
    }

    const data   = await response.json()
    const raw    = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const parsed = JSON.parse(raw)

    return NextResponse.json({
      symptoms:       parsed.symptoms ?? '',
      diagnosis:      parsed.diagnosis ?? '',
      work_done:      parsed.work_done ?? '',
      recommendation: parsed.recommendation ?? '',
      raw:            transcript,
      structured:     true,
    })
  } catch {
    return NextResponse.json({
      symptoms: '', diagnosis: '', work_done: transcript, recommendation: '',
      raw: transcript, structured: false,
    })
  }
}
