import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET — load question bank + attempt stats
export async function GET() {
  const supabase = getSupabaseAdmin()

  const [{ data: questions, error: qErr }, { data: attempts, error: aErr }] =
    await Promise.all([
      supabase.from('sat_questions').select('*').order('created_at', { ascending: true }).limit(1000),
      supabase.from('sat_attempts').select('*'),
    ])

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  // Merge attempts into questions as a map
  const attemptsMap: Record<string, object> = {}
  for (const a of attempts || []) {
    attemptsMap[(a as { question_id: string }).question_id] = a
  }

  return NextResponse.json({ questions: questions || [], attemptsMap })
}

// POST — generate questions + save to bank
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const { prompt, recordAttempt } = body

  // Handle attempt recording (called when student answers)
  if (recordAttempt) {
    const { questionId, answer, isCorrect } = body
    const supabase = getSupabaseAdmin()

    // Upsert — increment counters
    const { data: existing } = await supabase
      .from('sat_attempts')
      .select('*')
      .eq('question_id', questionId)
      .single()

    if (existing) {
      await supabase.from('sat_attempts').update({
        last_answer:    String(answer),
        last_attempted: new Date().toISOString(),
        times_attempted: existing.times_attempted + 1,
        times_correct:   existing.times_correct + (isCorrect ? 1 : 0),
        times_wrong:     existing.times_wrong   + (isCorrect ? 0 : 1),
      }).eq('question_id', questionId)
    } else {
      await supabase.from('sat_attempts').insert({
        question_id:    questionId,
        last_answer:    String(answer),
        last_attempted: new Date().toISOString(),
        times_attempted: 1,
        times_correct:   isCorrect ? 1 : 0,
        times_wrong:     isCorrect ? 0 : 1,
      })
    }
    return NextResponse.json({ ok: true })
  }

  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })

  // Discover model
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
  try { questions = JSON.parse(clean) }
  catch { return NextResponse.json({ error: 'Failed to parse questions' }, { status: 500 }) }

  const now = Date.now()
  const stamped = questions.map((q: object, i: number) => ({ ...q, id: `Q-${now}-${i}` }))

  const { error: dbError } = await getSupabaseAdmin()
    .from('sat_questions')
    .upsert(stamped, { onConflict: 'id' })

  if (dbError) console.error('DB save error:', dbError.message)

  return NextResponse.json({ text: raw, saved: !dbError, count: stamped.length })
}
