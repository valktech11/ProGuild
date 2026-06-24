import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Per-record data that changes — always read fresh.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const sb = () => getSupabaseAdmin()

// GET — load sessions history + streak data
export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  const [{ data: sessions }, { data: streak }, { data: todayRow }] = await Promise.all([
    sb().from('sat_sessions').select('*').order('started_at', { ascending: false }).limit(50),
    sb().from('sat_streak').select('*').order('date', { ascending: false }).limit(30),
    sb().from('sat_streak').select('*').eq('date', today).single(),
  ])

  // Compute current streak
  let currentStreak = 0
  let longestStreak = 0
  let temp = 0
  const streakDays = (streak || []).filter(r => r.streak_counted)
  const sortedDates = streakDays.map(r => r.date).sort().reverse()

  for (let i = 0; i < sortedDates.length; i++) {
    const expected = new Date()
    expected.setDate(expected.getDate() - i)
    const exp = expected.toISOString().split('T')[0]
    if (sortedDates[i] === exp) { temp++; if (i === 0 || temp > 1) currentStreak = temp }
    else break
  }
  for (const d of sortedDates) {
    void d; temp++; longestStreak = Math.max(longestStreak, temp)
  }

  return NextResponse.json({
    sessions: sessions || [],
    streak: streak || [],
    today: todayRow || { date: today, questions_answered: 0, correct: 0, streak_counted: false },
    currentStreak,
    longestStreak,
  })
}

// POST — create session | record answer | end session | update streak
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action } = body

  // ── CREATE SESSION ──────────────────────────────────────────
  if (action === 'create') {
    const { mode, time_limit_secs, topic_filter, diff_filter, source, total_questions } = body
    const { data, error } = await sb().from('sat_sessions').insert({
      mode, time_limit_secs, topic_filter, diff_filter, source, total_questions,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ session: data })
  }

  // ── SAVE SESSION QUESTIONS (batch) ──────────────────────────
  if (action === 'save_questions') {
    const { session_id, questions } = body
    const rows = questions.map((q: { id: string }, i: number) => ({
      session_id, question_id: q.id, order_index: i,
    }))
    const { error } = await sb().from('sat_session_questions').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── RECORD ANSWER ───────────────────────────────────────────
  if (action === 'answer') {
    const { session_id, question_id, answer_given, answer_state, time_taken_secs } = body

    // Update session_questions row
    await sb().from('sat_session_questions')
      .update({ answer_given, answer_state, time_taken_secs })
      .eq('session_id', session_id)
      .eq('question_id', question_id)

    // Increment session counters
    const { data: sess } = await sb().from('sat_sessions').select('answered,correct,wrong,unanswered').eq('id', session_id).single()
    if (sess) {
      await sb().from('sat_sessions').update({
        answered:   sess.answered   + (answer_state !== 'unanswered' ? 1 : 0),
        correct:    sess.correct    + (answer_state === 'correct'    ? 1 : 0),
        wrong:      sess.wrong      + (answer_state === 'wrong'      ? 1 : 0),
        unanswered: sess.unanswered + (answer_state === 'unanswered' ? 1 : 0),
      }).eq('id', session_id)
    }

    // Update sat_attempts (per-question lifetime stats)
    const { data: existing } = await sb().from('sat_attempts').select('*').eq('question_id', question_id).single()
    const isCorrect = answer_state === 'correct'
    if (existing) {
      await sb().from('sat_attempts').update({
        last_answer:     String(answer_given ?? ''),
        last_attempted:  new Date().toISOString(),
        times_attempted: existing.times_attempted + 1,
        times_correct:   existing.times_correct + (isCorrect ? 1 : 0),
        times_wrong:     existing.times_wrong   + (isCorrect ? 0 : 1),
      }).eq('question_id', question_id)
    } else {
      await sb().from('sat_attempts').insert({
        question_id, last_answer: String(answer_given ?? ''),
        last_attempted: new Date().toISOString(),
        times_attempted: 1,
        times_correct: isCorrect ? 1 : 0,
        times_wrong:   isCorrect ? 0 : 1,
      })
    }

    // Auto-flag if wrong 3 times in a row
    if (!isCorrect) {
      const { data: fl } = await sb().from('sat_flagged').select('*').eq('question_id', question_id).single()
      const newStreak = (fl?.wrong_streak || 0) + 1
      if (fl) {
        await sb().from('sat_flagged').update({ wrong_streak: newStreak, flagged_at: new Date().toISOString(), reason: newStreak >= 3 ? 'auto_wrong_streak' : fl.reason }).eq('question_id', question_id)
      } else if (newStreak >= 3) {
        await sb().from('sat_flagged').insert({ question_id, reason: 'auto_wrong_streak', wrong_streak: newStreak })
      } else {
        // track streak even before threshold
        await sb().from('sat_flagged').upsert({ question_id, reason: 'tracking', wrong_streak: newStreak }, { onConflict: 'question_id' })
      }
    } else {
      // Correct — reset wrong streak, unflag if needed
      await sb().from('sat_flagged').update({ wrong_streak: 0 }).eq('question_id', question_id)
    }

    // Update today's streak
    const today = new Date().toISOString().split('T')[0]
    const { data: todayRow } = await sb().from('sat_streak').select('*').eq('date', today).single()
    if (todayRow) {
      const newAnswered = todayRow.questions_answered + 1
      const newCorrect  = todayRow.correct + (isCorrect ? 1 : 0)
      await sb().from('sat_streak').update({
        questions_answered: newAnswered,
        correct: newCorrect,
        streak_counted: newAnswered >= 15,
      }).eq('date', today)
    } else {
      await sb().from('sat_streak').insert({
        date: today, questions_answered: 1,
        correct: isCorrect ? 1 : 0, streak_counted: false,
      })
    }

    return NextResponse.json({ ok: true })
  }

  // ── FLAG / UNFLAG ───────────────────────────────────────────
  if (action === 'flag') {
    const { question_id, flagged } = body
    if (flagged) {
      await sb().from('sat_flagged').upsert({ question_id, reason: 'manual', wrong_streak: 0 }, { onConflict: 'question_id' })
    } else {
      await sb().from('sat_flagged').delete().eq('question_id', question_id)
    }
    return NextResponse.json({ ok: true })
  }

  // ── END SESSION ─────────────────────────────────────────────
  if (action === 'end') {
    const { session_id } = body
    const { data: sess } = await sb().from('sat_sessions').select('*').eq('id', session_id).single()
    if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const total = sess.total_questions || 1
    const score_pct = Math.round((sess.correct / total) * 100)

    await sb().from('sat_sessions').update({
      ended_at: new Date().toISOString(),
      score_pct,
      completed: true,
    }).eq('id', session_id)

    // Load full session questions for report
    const { data: sq } = await sb().from('sat_session_questions')
      .select('*, sat_questions(*)')
      .eq('session_id', session_id)
      .order('order_index')

    return NextResponse.json({ ok: true, score_pct, session: { ...sess, score_pct }, questions: sq || [] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
