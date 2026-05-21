import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const sb = () => getSupabaseAdmin()

// SAT Math score conversion table (raw 0-44 → scaled 200-800)
const SAT_SCALE: Record<number, number> = {
  44:800,43:790,42:780,41:770,40:760,39:750,38:740,37:730,
  36:720,35:710,34:700,33:690,32:680,31:670,30:660,29:640,
  28:620,27:610,26:600,25:590,24:580,23:570,22:560,21:540,
  20:530,19:520,18:510,17:500,16:490,15:480,14:470,13:460,
  12:450,11:440,10:430,9:420,8:410,7:400,6:390,5:380,
  4:370,3:360,2:340,1:320,0:200,
}
const toSATScore = (raw: number) => SAT_SCALE[Math.max(0, Math.min(44, raw))] ?? 200

// Topic distribution for real SAT Math
const M1_DISTRIBUTION = [
  { topic: 'Algebra',        diff: 'easy',   count: 3 },
  { topic: 'Algebra',        diff: 'medium', count: 3 },
  { topic: 'Advanced Math',  diff: 'easy',   count: 2 },
  { topic: 'Advanced Math',  diff: 'medium', count: 3 },
  { topic: 'Problem Solving',diff: 'easy',   count: 2 },
  { topic: 'Problem Solving',diff: 'medium', count: 2 },
  { topic: 'Geometry',       diff: 'easy',   count: 2 },
  { topic: 'Geometry',       diff: 'medium', count: 2 },
  { topic: 'Trigonometry',   diff: 'medium', count: 1 },
  { topic: 'Advanced Math',  diff: 'hard',   count: 2 },
]
const M2_HARD_DISTRIBUTION = [
  { topic: 'Algebra',        diff: 'medium', count: 2 },
  { topic: 'Algebra',        diff: 'hard',   count: 3 },
  { topic: 'Advanced Math',  diff: 'medium', count: 2 },
  { topic: 'Advanced Math',  diff: 'hard',   count: 4 },
  { topic: 'Problem Solving',diff: 'medium', count: 2 },
  { topic: 'Problem Solving',diff: 'hard',   count: 2 },
  { topic: 'Geometry',       diff: 'medium', count: 2 },
  { topic: 'Geometry',       diff: 'hard',   count: 2 },
  { topic: 'Trigonometry',   diff: 'hard',   count: 3 },
]
const M2_EASY_DISTRIBUTION = [
  { topic: 'Algebra',        diff: 'easy',   count: 4 },
  { topic: 'Algebra',        diff: 'medium', count: 3 },
  { topic: 'Advanced Math',  diff: 'easy',   count: 3 },
  { topic: 'Advanced Math',  diff: 'medium', count: 3 },
  { topic: 'Problem Solving',diff: 'easy',   count: 3 },
  { topic: 'Problem Solving',diff: 'medium', count: 2 },
  { topic: 'Geometry',       diff: 'easy',   count: 2 },
  { topic: 'Trigonometry',   diff: 'easy',   count: 2 },
]

async function generateModule(
  apiKey: string,
  model: string,
  distribution: typeof M1_DISTRIBUTION,
  moduleLabel: string
) {
  const groups = distribution.map(d =>
    `${d.count} ${d.diff} ${d.topic} questions`
  ).join(', ')

  const prompt = `You are an expert SAT Math question writer for ${moduleLabel} of the Digital SAT.

Generate exactly 22 original SAT-style math questions with this exact distribution:
${groups}

Mix of Multiple Choice (type "mc", 4 options) and Student-Produced Response (type "spr", numeric answer).
Roughly 75% mc and 25% spr. Be authentic to real SAT language and difficulty.
Each question must have a complete worked solution.

Return ONLY a raw JSON array of exactly 22 objects. No markdown. No fences.
Schema:
[{
  "topic": "Algebra"|"Advanced Math"|"Problem Solving"|"Geometry"|"Trigonometry",
  "diff": "easy"|"medium"|"hard",
  "type": "mc"|"spr",
  "q": "question text",
  "given": "optional equation block or empty string",
  "opts": ["A","B","C","D"],
  "ans": 0,
  "exp": "plain English explanation",
  "math": "step-by-step worked solution"
}]
For mc: opts has 4 strings, ans is integer 0-3.
For spr: opts is [], ans is numeric string like "7" or "3.5".`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 12000 }
      })
    }
  )
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  return JSON.parse(clean)
}

async function getBestModel(apiKey: string): Promise<string> {
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
}

// GET — list all exams with attempt counts
export async function GET() {
  const { data: exams } = await sb()
    .from('sat_mock_exams')
    .select('id, title, created_at, m2_difficulty')
    .order('created_at', { ascending: false })

  const { data: attempts } = await sb()
    .from('sat_mock_attempts')
    .select('id, exam_id, attempt_number, sat_score, raw_score, completed, started_at, ended_at')
    .order('started_at', { ascending: false })

  return NextResponse.json({ exams: exams || [], attempts: attempts || [] })
}

// POST — generate exam | submit attempt | get results
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action } = body

  // ── GENERATE NEW EXAM ───────────────────────────────────────
  if (action === 'generate') {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 })

    let model: string
    try { model = await getBestModel(apiKey) }
    catch { return NextResponse.json({ error: 'Could not find available model' }, { status: 500 }) }

    // Generate both modules in parallel
    let m1Qs, m2Qs
    try {
      [m1Qs, m2Qs] = await Promise.all([
        generateModule(apiKey, model, M1_DISTRIBUTION, 'Module 1'),
        generateModule(apiKey, model, M2_HARD_DISTRIBUTION, 'Module 2 (standard difficulty)')
      ])
    } catch (e) {
      return NextResponse.json({ error: `Generation failed: ${e}` }, { status: 500 })
    }

    const now = Date.now()
    const stamp = (qs: object[], prefix: string) =>
      qs.map((q, i) => ({ ...q, id: `MOCK-${prefix}-${now}-${i}`, given: (q as { given?: string }).given || '' }))

    const m1 = stamp(m1Qs, 'M1')
    const m2 = stamp(m2Qs, 'M2')

    // Save all questions to sat_questions bank
    await sb().from('sat_questions').upsert([...m1, ...m2], { onConflict: 'id' })

    const title = `Mock Exam — ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    const { data: exam, error } = await sb().from('sat_mock_exams').insert({
      title, m1_questions: m1, m2_questions: m2, m2_difficulty: 'hard'
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ exam, m1Questions: m1, m2Questions: m2 })
  }

  // ── LOAD EXAM QUESTIONS ─────────────────────────────────────
  if (action === 'load') {
    const { exam_id } = body
    const { data: exam } = await sb().from('sat_mock_exams').select('*').eq('id', exam_id).single()
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    // Get attempt count for this exam
    const { data: attempts } = await sb().from('sat_mock_attempts')
      .select('id, attempt_number, sat_score, raw_score, completed, started_at')
      .eq('exam_id', exam_id)
      .order('attempt_number', { ascending: false })

    return NextResponse.json({ exam, attempts: attempts || [] })
  }

  // ── START ATTEMPT ───────────────────────────────────────────
  if (action === 'start_attempt') {
    const { exam_id, attempt_number } = body
    const { data, error } = await sb().from('sat_mock_attempts').insert({
      exam_id, attempt_number: attempt_number || 1,
      m1_answers: {}, m2_answers: {},
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ attempt: data })
  }

  // ── SUBMIT ATTEMPT ──────────────────────────────────────────
  if (action === 'submit') {
    const { attempt_id, m1_answers, m2_answers, m1_time_secs, m2_time_secs, exam_id } = body

    // Load exam to check correct answers
    const { data: exam } = await sb().from('sat_mock_exams').select('*').eq('id', exam_id).single()
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const m1Qs: { id: string; ans: string | number }[] = exam.m1_questions || []
    const m2Qs: { id: string; ans: string | number }[] = exam.m2_questions || []

    const scoreModule = (qs: typeof m1Qs, answers: Record<string, string>) => {
      let correct = 0
      const results: Record<string, { answer: string; state: string; correct_ans: string | number }> = {}
      for (const q of qs) {
        const given = answers[q.id] ?? ''
        const correctAns = String(q.ans)
        const isCorrect = given !== '' && (
          given === correctAns ||
          (!isNaN(parseFloat(correctAns)) && parseFloat(given) === parseFloat(correctAns))
        )
        const state = given === '' ? 'unanswered' : isCorrect ? 'correct' : 'wrong'
        if (isCorrect) correct++
        results[q.id] = { answer: given, state, correct_ans: q.ans }
      }
      return { correct, results }
    }

    const { correct: m1Raw, results: m1Results } = scoreModule(m1Qs, m1_answers || {})
    const { correct: m2Raw, results: m2Results } = scoreModule(m2Qs, m2_answers || {})
    const rawScore  = m1Raw + m2Raw
    const satScore  = toSATScore(rawScore)

    await sb().from('sat_mock_attempts').update({
      m1_answers: m1Results,
      m2_answers: m2Results,
      m1_time_secs, m2_time_secs,
      m1_raw: m1Raw, m2_raw: m2Raw,
      raw_score: rawScore, sat_score: satScore,
      ended_at: new Date().toISOString(),
      completed: true,
    }).eq('id', attempt_id)

    // Update lifetime sat_attempts for each question
    const allAnswers = { ...m1Results, ...m2Results }
    for (const [qid, res] of Object.entries(allAnswers)) {
      const isCorrect = res.state === 'correct'
      const { data: ex } = await sb().from('sat_attempts').select('*').eq('question_id', qid).single()
      if (ex) {
        await sb().from('sat_attempts').update({
          last_answer: res.answer, last_attempted: new Date().toISOString(),
          times_attempted: ex.times_attempted + 1,
          times_correct: ex.times_correct + (isCorrect ? 1 : 0),
          times_wrong:   ex.times_wrong   + (isCorrect ? 0 : 1),
        }).eq('question_id', qid)
      } else {
        await sb().from('sat_attempts').insert({
          question_id: qid, last_answer: res.answer,
          last_attempted: new Date().toISOString(),
          times_attempted: 1,
          times_correct: isCorrect ? 1 : 0,
          times_wrong:   isCorrect ? 0 : 1,
        })
      }
    }

    // Update today's streak
    const today = new Date().toISOString().split('T')[0]
    const answered = Object.values(allAnswers).filter(r => r.state !== 'unanswered').length
    const { data: todayRow } = await sb().from('sat_streak').select('*').eq('date', today).single()
    if (todayRow) {
      const newAns = todayRow.questions_answered + answered
      await sb().from('sat_streak').update({
        questions_answered: newAns,
        correct: todayRow.correct + m1Raw + m2Raw,
        streak_counted: newAns >= 15,
      }).eq('date', today)
    } else {
      await sb().from('sat_streak').insert({
        date: today, questions_answered: answered,
        correct: m1Raw + m2Raw, streak_counted: answered >= 15,
      })
    }

    return NextResponse.json({
      ok: true, m1Raw, m2Raw, rawScore, satScore,
      m1Results, m2Results,
      m1Questions: exam.m1_questions,
      m2Questions: exam.m2_questions,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
