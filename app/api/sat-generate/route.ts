import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Debug / keep-alive — never cache.
export const dynamic = 'force-dynamic'

const sb = () => getSupabaseAdmin()

async function getBestModel(apiKey: string): Promise<string> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`)
    const data = await res.json()
    const all: string[] = (data.models || [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace('models/', ''))
    const preferred = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro']
    for (const p of preferred) {
      const found = all.find((a: string) => a.startsWith(p))
      if (found) return found
    }
    return all[0] || 'gemini-1.5-flash'
  } catch {
    return 'gemini-1.5-flash'
  }
}

// GET — load question bank + attempt stats + flagged
export async function GET() {
  const [{ data: questions }, { data: attempts }, { data: flagged }] = await Promise.all([
    sb().from('sat_questions').select('*').order('created_at', { ascending: true }).limit(1000),
    sb().from('sat_attempts').select('*'),
    sb().from('sat_flagged').select('question_id, reason, wrong_streak'),
  ])

  const attemptsMap: Record<string, object> = {}
  for (const a of attempts || []) attemptsMap[(a as { question_id: string }).question_id] = a

  return NextResponse.json({ questions: questions || [], attemptsMap, flagged: flagged || [] })
}

// POST — generate questions + save to bank
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  const model = await getBestModel(apiKey)

  // Wrap prompt in explicit JSON instruction
  const fullPrompt = `${prompt}

CRITICAL: Your entire response must be valid JSON only. Start with [ and end with ]. No text before or after. No markdown. No code fences.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        }
      })
    }
  )

  const data = await res.json()
  if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 })

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  // Aggressive cleaning — extract JSON array no matter what surrounds it
  let clean = raw.trim()
  // Strip markdown fences
  clean = clean.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim()
  // Find the first [ and last ] to extract just the array
  const start = clean.indexOf('[')
  const end   = clean.lastIndexOf(']')
  if (start === -1 || end === -1) {
    return NextResponse.json({ error: `Model returned non-JSON response. Raw: ${clean.slice(0, 200)}` }, { status: 500 })
  }
  clean = clean.slice(start, end + 1)

  let questions
  try {
    questions = JSON.parse(clean)
  } catch (e) {
    return NextResponse.json({ error: `JSON parse failed: ${e}. Raw snippet: ${clean.slice(0, 200)}` }, { status: 500 })
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'Model returned empty or invalid question array' }, { status: 500 })
  }

  // Stamp IDs
  const now = Date.now()
  const stamped = questions.map((q: object, i: number) => ({
    ...q,
    id: `Q-${now}-${i}`,
    given: (q as { given?: string }).given || '',
    opts:  (q as { opts?: string[] }).opts  || [],
  }))

  // Save to bank (non-blocking — return questions even if DB fails)
  sb().from('sat_questions').upsert(stamped, { onConflict: 'id' })
    .then(({ error }) => { if (error) console.error('DB save:', error.message) })

  return NextResponse.json({ text: JSON.stringify(stamped) })
}
