import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET — load existing questions from bank
export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from('sat_questions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data || [] })
}

// POST — generate new questions + save to bank
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { prompt } = body
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Discover available model
  let chosenModel = ''
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    )
    const listData = await listRes.json()
    if (listData.models?.length) {
      const all = listData.models
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: { name: string }) => m.name.replace('models/', ''))
      const preferred = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro']
      for (const p of preferred) {
        const found = all.find((a: string) => a.startsWith(p))
        if (found) { chosenModel = found; break }
      }
      if (!chosenModel && all.length > 0) chosenModel = all[0]
    }
    if (!chosenModel) return NextResponse.json({ error: 'No working model found for this API key' }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: `Model discovery failed: ${e}` }, { status: 500 })
  }

  // Generate
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.92, maxOutputTokens: 8192 }
      })
    }
  )

  const data = await res.json()
  if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 })

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()

  let questions
  try {
    questions = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'Failed to parse generated questions' }, { status: 500 })
  }

  // Stamp IDs — use timestamp + index for uniqueness
  const now = Date.now()
  const stamped = questions.map((q: object, i: number) => ({
    ...q,
    id: `Q-${now}-${i}`,
  }))

  // Save to Supabase (upsert so reruns don't duplicate)
  const supabase = getSupabaseAdmin()
  const { error: dbError } = await supabase
    .from('sat_questions')
    .upsert(stamped, { onConflict: 'id' })

  if (dbError) {
    // Still return questions even if save fails
    console.error('DB save error:', dbError.message)
    return NextResponse.json({ text: raw, saved: false, dbError: dbError.message })
  }

  return NextResponse.json({ text: raw, saved: true, count: stamped.length })
}
