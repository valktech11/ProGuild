'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface AttemptStats {
  last_answer?: string
  last_attempted?: string
  times_attempted?: number
  times_correct?: number
  times_wrong?: number
}
interface Question {
  id: string; topic: string; diff: string; type: 'mc'|'spr'
  q: string; given?: string; opts: string[]
  ans: number|string; exp: string; math: string
}
interface Session {
  id: string; mode: string; time_limit_secs: number|null
  topic_filter: string; diff_filter: string; source: string
  total_questions: number; answered: number; correct: number
  wrong: number; unanswered: number; score_pct: number|null; completed: boolean
}
interface MockExam {
  id: string; title: string; created_at: string; m2_difficulty: string
}
interface MockAttempt {
  id: string; exam_id: string; attempt_number: number
  sat_score: number; raw_score: number; m1_raw: number; m2_raw: number
  completed: boolean; started_at: string; ended_at?: string
  m1_answers?: Record<string,{answer:string;state:string;correct_ans:string|number}>
  m2_answers?: Record<string,{answer:string;state:string;correct_ans:string|number}>
  m1_time_secs?: number; m2_time_secs?: number
}
interface StreakDay { date: string; questions_answered: number; correct: number; streak_counted: boolean }

const TOPICS = ['Algebra','Advanced Math','Problem Solving','Geometry','Trigonometry']
const SHORT: Record<string,string> = {'Problem Solving':'Data','Advanced Math':'Adv Math'}
const SAT_SCALE: Record<number,number> = {44:800,43:790,42:780,41:770,40:760,39:750,38:740,37:730,36:720,35:710,34:700,33:690,32:680,31:670,30:660,29:640,28:620,27:610,26:600,25:590,24:580,23:570,22:560,21:540,20:530,19:520,18:510,17:500,16:490,15:480,14:470,13:460,12:450,11:440,10:430,9:420,8:410,7:400,6:390,5:380,4:370,3:360,2:340,1:320,0:200}

export default function SATVaultPage() {
  // ── THEME & VIEW ──────────────────────────────────────────────
  const [theme, setTheme]   = useState<'dark'|'light'>('dark')
  const [view,  setView]    = useState<'home'|'practice'|'mock'|'insights'>('home')

  // ── QUESTION BANK ─────────────────────────────────────────────
  const [questions,  setQuestions]  = useState<Question[]>([])
  const [dbStats,    setDbStats]    = useState<Record<string,AttemptStats>>({})
  const [flagged,    setFlagged]    = useState<Set<string>>(new Set())

  // ── PRACTICE STATE ────────────────────────────────────────────
  const [currentId,  setCurrentId]  = useState<string|null>(null)
  const [attempted,  setAttempted]  = useState<Record<string,number|string>>({})
  const [correct,    setCorrect]    = useState<Record<string,boolean>>({})
  const [sprValue,   setSprValue]   = useState('')
  const [topicF,     setTopicF]     = useState('all')
  const [diffF,      setDiffF]      = useState('all')
  const [batchN,     setBatchN]     = useState(10)
  const [source,     setSource]     = useState<'fresh'|'bank'|'weak'|'unseen'>('fresh')
  const [isBusy,     setIsBusy]     = useState(false)
  const [loadMsg,    setLoadMsg]    = useState('Generating questions…')
  const [genError,   setGenError]   = useState<string|null>(null)
  const [sidebarOpen,setSidebarOpen]= useState(true)

  // ── SESSION STATE ─────────────────────────────────────────────
  const [sessionMode, setSessionMode] = useState<'open'|'timed'>('open')
  const [timeChoice,  setTimeChoice]  = useState(15)
  const [showSetup,   setShowSetup]   = useState(false)
  const [activeSession, setActiveSession] = useState<Session|null>(null)
  const [sessionQs, setSessionQs] = useState<Question[]>([])
  const [sessionIdx, setSessionIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number|null>(null)
  const [sessionReport, setSessionReport] = useState<{session:Session;questions:Question[];results:Record<string,{state:string;answer:string|number}>}|null>(null)
  const timerRef = useRef<NodeJS.Timeout|null>(null)
  const qStartTime = useRef<number>(Date.now())

  // ── STREAK ────────────────────────────────────────────────────
  const [currentStreak, setCurrentStreak] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [streakDays,    setStreakDays]     = useState<StreakDay[]>([])
  const [todayStats,    setTodayStats]     = useState<StreakDay|null>(null)

  // ── MOCK EXAM STATE ───────────────────────────────────────────
  const [mockExams,     setMockExams]     = useState<MockExam[]>([])
  const [mockAttempts,  setMockAttempts]  = useState<MockAttempt[]>([])
  const [mockPhase,     setMockPhase]     = useState<'lobby'|'generating'|'m1'|'break'|'m2'|'report'>('lobby')
  const [currentExam,   setCurrentExam]   = useState<MockExam|null>(null)
  const [m1Qs,          setM1Qs]          = useState<Question[]>([])
  const [m2Qs,          setM2Qs]          = useState<Question[]>([])
  const [mockAnswers,   setMockAnswers]   = useState<Record<string,string>>({})
  const [mockQIdx,      setMockQIdx]      = useState(0)
  const [mockModule,    setMockModule]    = useState<1|2>(1)
  const [mockTimeLeft,  setMockTimeLeft]  = useState(35*60)
  const [mockAttemptId, setMockAttemptId] = useState<string|null>(null)
  const [mockReport,    setMockReport]    = useState<{m1Raw:number;m2Raw:number;rawScore:number;satScore:number;m1Results:Record<string,{answer:string;state:string;correct_ans:string|number}>;m2Results:Record<string,{answer:string;state:string;correct_ans:string|number}>;m1Questions:Question[];m2Questions:Question[]}|null>(null)
  const [m1TimeSecs,    setM1TimeSecs]    = useState(0)
  const mockTimerRef = useRef<NodeJS.Timeout|null>(null)
  const [mockError,     setMockError]     = useState<string|null>(null)
  const qCounter = useRef(0)

  // ─────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    try { const t = localStorage.getItem('sat_theme') as 'dark'|'light'|null; if(t) setTheme(t) } catch{}
    try { const s = localStorage.getItem('sat_state_v3'); if(s){ const d=JSON.parse(s); setAttempted(d.attempted||{}); setCorrect(d.correct||{}); qCounter.current=d.qc||0 } } catch{}
    // Load bank + stats + streak
    fetch('/api/sat-generate').then(r=>r.json()).then(data => {
      if(data.questions?.length){ const loaded=data.questions.map((q:Question)=>({...q,opts:Array.isArray(q.opts)?q.opts:[],given:q.given||''})); setQuestions(loaded); qCounter.current=Math.max(qCounter.current,loaded.length) }
      if(data.attemptsMap) setDbStats(data.attemptsMap)
      if(data.flagged) setFlagged(new Set(data.flagged.map((f:{question_id:string})=>f.question_id)))
    }).catch(()=>{})
    fetch('/api/sat-session').then(r=>r.json()).then(data => {
      setCurrentStreak(data.currentStreak||0); setLongestStreak(data.longestStreak||0)
      setStreakDays(data.streak||[]); setTodayStats(data.today||null)
    }).catch(()=>{})
    fetch('/api/sat-mock').then(r=>r.json()).then(data => {
      setMockExams(data.exams||[]); setMockAttempts(data.attempts||[])
    }).catch(()=>{})
  }, [])

  useEffect(() => { try{ localStorage.setItem('sat_state_v3', JSON.stringify({attempted,correct,qc:qCounter.current})) }catch{} }, [attempted,correct])

  const toggleTheme = () => { const n=theme==='dark'?'light':'dark'; setTheme(n); try{localStorage.setItem('sat_theme',n)}catch{} }

  // ─────────────────────────────────────────────────────────────
  // PRACTICE HELPERS
  // ─────────────────────────────────────────────────────────────
  const filtered = useCallback(() => questions.filter(q=>(topicF==='all'||q.topic===topicF)&&(diffF==='all'||q.diff===diffF)), [questions,topicF,diffF])
  const vis = filtered()
  const currentQ = questions.find(x=>x.id===currentId)??null
  const isDone = currentId ? attempted[currentId]!==undefined : false
  const isOk   = currentId ? !!correct[currentId] : false
  const visIdx = vis.findIndex(q=>q.id===currentId)
  const attCount = Object.keys(attempted).length
  const corCount = Object.values(correct).filter(Boolean).length
  const accuracy = attCount>0 ? Math.round(corCount/attCount*100) : null

  // ─────────────────────────────────────────────────────────────
  // RECORD ANSWER TO DB
  // ─────────────────────────────────────────────────────────────
  const recordAnswer = (qid:string, answer:string|number, state:string, timeSecs:number) => {
    const sessionId = activeSession?.id
    fetch('/api/sat-session',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'answer',session_id:sessionId,question_id:qid,answer_given:String(answer),answer_state:state,time_taken_secs:timeSecs})
    }).then(r=>r.json()).then(data=>{
      if(data.ok){ setDbStats(prev=>{ const ex=prev[qid]||{times_attempted:0,times_correct:0,times_wrong:0}; return {...prev,[qid]:{last_answer:String(answer),last_attempted:new Date().toISOString(),times_attempted:(ex.times_attempted||0)+1,times_correct:(ex.times_correct||0)+(state==='correct'?1:0),times_wrong:(ex.times_wrong||0)+(state==='wrong'?1:0)}} }) }
    }).catch(()=>{})
  }

  // ─────────────────────────────────────────────────────────────
  // GENERATE
  // ─────────────────────────────────────────────────────────────
  const generate = async (qs?:Question[]) => {
    if(isBusy) return
    if(source!=='fresh'&&!qs){ loadFromBank(); return }
    setIsBusy(true); setGenError(null); setSprValue('')
    const topicStr=topicF==='all'?'a varied mix of Algebra, Advanced Math, Problem Solving & Data Analysis, Geometry, Trigonometry':topicF
    const diffStr=diffF==='all'?'a mix of easy, medium, and hard':diffF
    const msgs=['Writing question stems…','Crafting answer choices…','Writing solutions…','Almost ready…']
    let mi=0; setLoadMsg(msgs[0])
    const ticker=setInterval(()=>{mi=(mi+1)%msgs.length;setLoadMsg(msgs[mi])},2000)
    const prompt = `You are an expert SAT Math question writer. Generate exactly ${batchN} original SAT-style math questions.

Topic: ${topicStr}
Difficulty: ${diffStr}

Requirements:
- Mix of type "mc" (multiple choice, 4 options) and type "spr" (student-produced response, single numeric answer)
- Authentic SAT language, plausible distractors, realistic contexts
- Each question must have a complete worked solution and plain-English explanation

Return a JSON array of exactly ${batchN} objects. Each object must have ALL these fields:
{
  "topic": "Algebra",
  "diff": "easy",
  "type": "mc",
  "q": "Full question text",
  "given": "",
  "opts": ["Option A", "Option B", "Option C", "Option D"],
  "ans": 0,
  "exp": "Plain English explanation in 2-3 sentences",
  "math": "Step 1: ...\nStep 2: ...\nAnswer: ..."
}

For mc questions: opts must have exactly 4 strings, ans must be integer 0, 1, 2, or 3.
For spr questions: opts must be an empty array [], ans must be a numeric string like "7" or "3.5".
topic must be one of: Algebra, Advanced Math, Problem Solving, Geometry, Trigonometry
diff must be one of: easy, medium, hard`
    try {
      const res=await fetch('/api/sat-generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})})
      const data=await res.json()
      if(!res.ok||data.error) throw new Error(data.error||'Generation failed')
      const raw=data.text||''
      const clean=raw.replace(/^```(?:json)?\s*/m,'').replace(/\s*```\s*$/m,'').trim()
      const parsed:Omit<Question,'id'>[]=JSON.parse(clean)
      const now=Date.now()
      const newQs:Question[]=parsed.map((q,i)=>({...q,id:`Q-${now}-${i}`,opts:q.opts||[],given:q.given||''}))
      setQuestions(prev=>[...prev,...newQs]); qCounter.current+=newQs.length
      if(newQs.length>0){ setCurrentId(newQs[0].id); setSprValue('') }
      await startSession(newQs)
    } catch(e:unknown){ setGenError(e instanceof Error?e.message:'Failed') }
    finally{ clearInterval(ticker); setIsBusy(false) }
  }

  const loadFromBank = () => {
    let pool = [...questions]
    if(topicF!=='all') pool=pool.filter(q=>q.topic===topicF)
    if(diffF!=='all')  pool=pool.filter(q=>q.diff===diffF)
    if(source==='weak') pool=pool.filter(q=>{ const s=dbStats[q.id]; if(!s) return false; const t=(s.times_correct||0)+(s.times_wrong||0); return t>0&&(s.times_correct||0)/t<0.6 })
    if(source==='unseen') pool=pool.filter(q=>!dbStats[q.id])
    pool=pool.sort(()=>Math.random()-0.5).slice(0,batchN)
    if(!pool.length){ setGenError('No questions match this filter in your bank.'); return }
    setCurrentId(pool[0].id); setSprValue('')
    startSession(pool)
  }

  // ─────────────────────────────────────────────────────────────
  // SESSION
  // ─────────────────────────────────────────────────────────────
  const startSession = async (qs:Question[]) => {
    const timeSecs = sessionMode==='timed' ? timeChoice*60 : null
    const res = await fetch('/api/sat-session',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'create',mode:sessionMode,time_limit_secs:timeSecs,topic_filter:topicF,diff_filter:diffF,source,total_questions:qs.length})
    })
    const data = await res.json()
    if(data.session){
      setActiveSession(data.session); setSessionQs(qs); setSessionIdx(0)
      await fetch('/api/sat-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save_questions',session_id:data.session.id,questions:qs})})
      if(timeSecs){ setTimeLeft(timeSecs); startTimer(timeSecs, data.session.id, qs) }
      qStartTime.current=Date.now()
      setShowSetup(false); setSidebarOpen(false)
    }
  }

  const startTimer = (secs:number, sessionId:string, qs:Question[]) => {
    if(timerRef.current) clearInterval(timerRef.current)
    let remaining=secs
    timerRef.current=setInterval(()=>{ remaining--; setTimeLeft(remaining); if(remaining<=0){ clearInterval(timerRef.current!); autoSubmitRemaining(sessionId,qs) } },1000)
  }

  const autoSubmitRemaining = async (sessionId:string, qs:Question[]) => {
    setAttempted(prev=>{ const n={...prev}; qs.forEach(q=>{ if(n[q.id]===undefined) n[q.id]='__unanswered__' }); return n })
    await endSession(sessionId)
  }

  const endSession = async (sid?:string) => {
    const sessionId = sid || activeSession?.id
    if(!sessionId) return
    if(timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(null)
    const res = await fetch('/api/sat-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'end',session_id:sessionId})})
    const data = await res.json()
    if(data.ok){
      const results:Record<string,{state:string;answer:string|number}>= {}
      sessionQs.forEach(q=>{ const a=attempted[q.id]; if(a==='__unanswered__'||a===undefined){ results[q.id]={state:'unanswered',answer:''} } else { const state=correct[q.id]?'correct':'wrong'; results[q.id]={state,answer:a} } })
      setSessionReport({session:data.session||activeSession!,questions:sessionQs,results})
      setActiveSession(null); setSessionQs([])
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ANSWER HANDLERS
  // ─────────────────────────────────────────────────────────────
  const pick = (i:number) => {
    if(!currentId||attempted[currentId]!==undefined||!currentQ) return
    const ok=i===Number(currentQ.ans)
    const secs=Math.round((Date.now()-qStartTime.current)/1000)
    setAttempted(p=>({...p,[currentId]:i})); setCorrect(p=>({...p,[currentId]:ok}))
    recordAnswer(currentId,i,ok?'correct':'wrong',secs)
    qStartTime.current=Date.now()
  }
  const submitSPR = () => {
    if(!currentId||attempted[currentId]!==undefined||!currentQ||!sprValue.trim()) return
    const val=sprValue.trim()
    const ok=val===String(currentQ.ans)||(!isNaN(parseFloat(String(currentQ.ans)))&&parseFloat(val)===parseFloat(String(currentQ.ans)))
    const secs=Math.round((Date.now()-qStartTime.current)/1000)
    setAttempted(p=>({...p,[currentId]:val})); setCorrect(p=>({...p,[currentId]:ok}))
    recordAnswer(currentId,val,ok?'correct':'wrong',secs)
    qStartTime.current=Date.now()
  }
  const goRel = (dir:number) => { const next=vis[visIdx+dir]; if(next){setCurrentId(next.id);setSprValue('');qStartTime.current=Date.now()} }
  const retry = () => { if(!currentId) return; setAttempted(p=>{const n={...p};delete n[currentId];return n}); setCorrect(p=>{const n={...p};delete n[currentId];return n}); setSprValue('') }
  const toggleFlag = (qid:string) => {
    const now=flagged.has(qid); setFlagged(prev=>{const s=new Set(prev);now?s.delete(qid):s.add(qid);return s})
    fetch('/api/sat-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'flag',question_id:qid,flagged:!now})}).catch(()=>{})
  }

  // ─────────────────────────────────────────────────────────────
  // MOCK EXAM
  // ─────────────────────────────────────────────────────────────
  const generateMock = async () => {
    setMockPhase('generating'); setMockError(null)
    try {
      const res=await fetch('/api/sat-mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate'})})
      const data=await res.json()
      if(data.error) throw new Error(data.error)
      setCurrentExam(data.exam); setM1Qs(data.m1Questions); setM2Qs(data.m2Questions)
      setMockExams(prev=>[data.exam,...prev])
      const attRes=await fetch('/api/sat-mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start_attempt',exam_id:data.exam.id,attempt_number:1})})
      const attData=await attRes.json()
      setMockAttemptId(attData.attempt.id)
      setMockPhase('m1'); setMockQIdx(0); setMockAnswers({}); setMockTimeLeft(35*60)
      startMockTimer(35*60)
    } catch(e:unknown){ setMockError(e instanceof Error?e.message:'Failed'); setMockPhase('lobby') }
  }

  const loadExistingMock = async (exam:MockExam) => {
    setMockError(null)
    const res=await fetch('/api/sat-mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'load',exam_id:exam.id})})
    const data=await res.json()
    if(data.error){setMockError(data.error);return}
    const attemptNum=(data.attempts?.length||0)+1
    setCurrentExam(data.exam); setM1Qs(data.exam.m1_questions||[]); setM2Qs(data.exam.m2_questions||[])
    const attRes=await fetch('/api/sat-mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start_attempt',exam_id:exam.id,attempt_number:attemptNum})})
    const attData=await attRes.json()
    setMockAttemptId(attData.attempt.id)
    setMockPhase('m1'); setMockQIdx(0); setMockAnswers({}); setMockTimeLeft(35*60)
    startMockTimer(35*60)
  }

  const startMockTimer = (secs:number) => {
    if(mockTimerRef.current) clearInterval(mockTimerRef.current)
    let r=secs
    mockTimerRef.current=setInterval(()=>{ r--; setMockTimeLeft(r); if(r<=0){clearInterval(mockTimerRef.current!); if(mockModule===1) finishM1(true); else submitMock(true)} },1000)
  }

  const finishM1 = (timedOut=false) => {
    if(mockTimerRef.current) clearInterval(mockTimerRef.current)
    setM1TimeSecs(35*60-mockTimeLeft)
    setMockPhase('break'); setMockModule(2)
  }

  const startM2 = () => {
    setMockPhase('m2'); setMockQIdx(0); setMockTimeLeft(35*60)
    startMockTimer(35*60)
  }

  const submitMock = async (timedOut=false) => {
    if(mockTimerRef.current) clearInterval(mockTimerRef.current)
    const m2Time=35*60-mockTimeLeft
    const res=await fetch('/api/sat-mock',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'submit',attempt_id:mockAttemptId,exam_id:currentExam?.id,
        m1_answers:Object.fromEntries(m1Qs.map(q=>[q.id,mockAnswers[q.id]||''])),
        m2_answers:Object.fromEntries(m2Qs.map(q=>[q.id,mockAnswers[q.id]||''])),
        m1_time_secs:m1TimeSecs,m2_time_secs:m2Time
      })
    })
    const data=await res.json()
    if(data.ok){ setMockReport(data); setMockPhase('report'); setMockAttempts(prev=>[{id:mockAttemptId||'',exam_id:currentExam?.id||'',attempt_number:1,sat_score:data.satScore,raw_score:data.rawScore,m1_raw:data.m1Raw,m2_raw:data.m2Raw,completed:true,started_at:new Date().toISOString()},...prev]) }
  }

  const mockAnswer = (qid:string, val:string) => setMockAnswers(p=>({...p,[qid]:val}))
  const mockQs = mockPhase==='m2' ? m2Qs : m1Qs
  const curMockQ = mockQs[mockQIdx]

  // ─────────────────────────────────────────────────────────────
  // CSS
  // ─────────────────────────────────────────────────────────────
  const css = `
[data-sv="${theme}"]{
${theme==='dark'?`
--bg:#071418;--bg2:#0c1e24;--bg3:#122830;--bg4:#1a333d;
--card:#0f2028;--ch:#142630;--bd:#1e3d48;--bd2:#2a5262;
--tx:#d8f5f0;--tx2:#7db8b0;--tx3:#3d7a74;
--ac:#2dd4bf;--as:rgba(45,212,191,.14);--ag:rgba(45,212,191,.32);
--gr:#34d399;--gs:rgba(52,211,153,.12);
--re:#fb7185;--rs:rgba(251,113,133,.12);
--ye:#fcd34d;--ys:rgba(252,211,77,.12);
--ec:#34d399;--mc:#fcd34d;--hc:#fb7185;
--tb:rgba(7,20,24,.95);--sc:#1e3d48;--sh:0 4px 28px rgba(0,0,0,.5);
`:`
--bg:#fafaf8;--bg2:#f4f4f0;--bg3:#eaeae4;--bg4:#deded6;
--card:#fff;--ch:#fefefe;--bd:#e0e0d8;--bd2:#c8c8be;
--tx:#1a2e2b;--tx2:#3d6b64;--tx3:#7a9e98;
--ac:#0d9488;--as:rgba(13,148,136,.1);--ag:rgba(13,148,136,.22);
--gr:#059669;--gs:rgba(5,150,105,.09);
--re:#dc2626;--rs:rgba(220,38,38,.08);
--ye:#b45309;--ys:rgba(180,83,9,.09);
--ec:#059669;--mc:#b45309;--hc:#dc2626;
--tb:rgba(250,250,248,.97);--sc:#deded6;--sh:0 4px 20px rgba(0,0,0,.08);
`}}
.sv{font-family:'Nunito',sans-serif;display:flex;flex-direction:column;height:100vh;overflow:hidden;color:var(--tx);font-size:15px;}
${theme==='dark'?'.sv{background:radial-gradient(ellipse 70% 50% at 8% 15%,rgba(45,212,191,.07) 0%,transparent 60%),radial-gradient(ellipse 55% 45% at 92% 80%,rgba(103,232,249,.06) 0%,transparent 55%),#071418;}':'.sv{background:#fafaf8;}'}
.sv *{box-sizing:border-box;}
.sv ::-webkit-scrollbar{width:4px;} .sv ::-webkit-scrollbar-thumb{background:var(--sc);border-radius:4px;}
/* TOPBAR */
.sv-top{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:54px;background:var(--tb);backdrop-filter:blur(16px);border-bottom:1px solid var(--bd);flex-shrink:0;gap:12px;}
.sv-brand{display:flex;align-items:center;gap:9px;font-size:17px;font-weight:900;letter-spacing:-.3px;white-space:nowrap;}
.sv-brand-ico{width:31px;height:31px;background:var(--ac);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 14px var(--ag);flex-shrink:0;}
.sv-brand em{color:var(--ac);font-style:normal;}
.sv-tr{display:flex;align-items:center;gap:7px;}
.sv-stats{display:flex;gap:4px;}
.sv-sp{display:flex;flex-direction:column;align-items:center;padding:3px 10px;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;min-width:52px;}
.sv-sp .n{font-size:15px;font-weight:800;color:var(--ac);line-height:1.1;}
.sv-sp .l{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);}
.sv-tb{width:36px;height:36px;border-radius:8px;background:var(--bg3);border:1px solid var(--bd);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .2s;flex-shrink:0;}
.sv-tb:hover{background:var(--bg4);border-color:var(--ac);}
/* PBAR */
.sv-pb{height:3px;background:var(--bd);flex-shrink:0;}
.sv-pbf{height:100%;background:linear-gradient(90deg,#2dd4bf,#67e8f9,#34d399);background-size:200%;animation:sv-sh 3s linear infinite;transition:width .5s;}
@keyframes sv-sh{0%{background-position:0%}100%{background-position:200%}}
/* TABS */
.sv-tabs{display:flex;border-bottom:1px solid var(--bd);flex-shrink:0;background:var(--bg2);}
.sv-tab{flex:1;padding:11px 0;font-size:12px;font-weight:700;text-align:center;cursor:pointer;border:none;background:transparent;color:var(--tx3);border-bottom:3px solid transparent;transition:all .2s;font-family:'Nunito',sans-serif;}
.sv-tab:hover{color:var(--tx);}
.sv-tab.on{color:var(--ac);border-bottom-color:var(--ac);}
/* BODY */
.sv-body{display:flex;flex:1;overflow:hidden;}
/* HOME TAB */
.sv-home{flex:1;overflow-y:auto;padding:24px 28px;}
.sv-home-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:24px;}
.sv-hcard{background:var(--card);border:1.5px solid var(--bd);border-radius:14px;padding:20px;transition:all .2s;}
.sv-hcard:hover{border-color:var(--ac);transform:translateY(-2px);}
.sv-hcard .hc-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.sv-hcard .hc-icon{font-size:24px;}
.sv-hcard .hc-title{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;}
.sv-hcard .hc-val{font-size:32px;font-weight:900;color:var(--tx);line-height:1;}
.sv-hcard .hc-sub{font-size:12px;color:var(--tx3);margin-top:4px;}
/* STREAK */
.sv-streak-card{background:var(--card);border:1.5px solid var(--bd);border-radius:14px;padding:20px;margin-bottom:24px;}
.sv-streak-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.sv-streak-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);}
.sv-streak-num{font-size:36px;font-weight:900;color:var(--ye);line-height:1;}
.sv-streak-label{font-size:11px;color:var(--tx3);}
.sv-cal{display:flex;gap:4px;flex-wrap:wrap;}
.sv-cal-day{width:18px;height:18px;border-radius:4px;cursor:default;transition:all .2s;}
.sv-cal-day.active{background:var(--ac);}
.sv-cal-day.inactive{background:var(--bg3);}
.sv-cal-day.today-active{background:var(--gr);box-shadow:0 0 8px var(--gr);}
.sv-cal-day.today-inactive{background:var(--bg4);border:1px solid var(--ac);}
.sv-quick-btns{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;}
.sv-qbtn{flex:1;min-width:140px;padding:14px 16px;background:var(--card);border:1.5px solid var(--bd);border-radius:12px;cursor:pointer;text-align:left;transition:all .2s;font-family:'Nunito',sans-serif;}
.sv-qbtn:hover{border-color:var(--ac);background:var(--as);transform:translateY(-2px);}
.sv-qbtn .qb-icon{font-size:22px;margin-bottom:6px;}
.sv-qbtn .qb-title{font-size:13px;font-weight:800;color:var(--tx);}
.sv-qbtn .qb-sub{font-size:11px;color:var(--tx3);margin-top:2px;}
/* SIDEBAR */
.sv-side{width:272px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--bd);background:var(--bg2);transition:width .25s ease,opacity .25s ease;overflow:hidden;}
.sv-side.collapsed{width:0;opacity:0;pointer-events:none;}
.sv-ctrl{padding:14px;display:flex;flex-direction:column;gap:11px;border-bottom:1px solid var(--bd);overflow-y:auto;flex-shrink:0;}
.sv-cl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--tx3);font-weight:700;margin-bottom:3px;}
.sv-tg{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
.sb{padding:7px 5px;border:1.5px solid var(--bd);border-radius:9px;background:var(--bg3);color:var(--tx2);font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center;line-height:1.3;font-family:'Nunito',sans-serif;}
.sb:hover{border-color:var(--ac);color:var(--ac);background:var(--as);}
.sb.on{background:var(--as);border-color:var(--ac);color:var(--ac);}
.sv-row{display:flex;gap:4px;}
.pb{flex:1;padding:7px 0;border:1.5px solid var(--bd);border-radius:9px;background:var(--bg3);color:var(--tx3);font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;text-align:center;font-family:'Nunito',sans-serif;}
.pb:hover{border-color:var(--ac);color:var(--ac);}
.pb.on{background:var(--as);border-color:var(--ac);color:var(--ac);}
.pb.oe{background:var(--gs);border-color:var(--ec);color:var(--ec);}
.pb.om{background:var(--ys);border-color:var(--mc);color:var(--mc);}
.pb.oh{background:var(--rs);border-color:var(--hc);color:var(--hc);}
.sv-gen{width:100%;padding:11px;background:var(--ac);color:#fff;border:none;border-radius:11px;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:7px;box-shadow:0 4px 16px var(--ag);font-family:'Nunito',sans-serif;}
.sv-gen:hover:not(:disabled){opacity:.9;transform:translateY(-1px);}
.sv-gen:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
/* TIMER */
.sv-timer{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;font-family:monospace;font-size:14px;font-weight:700;}
.sv-timer.ok{background:var(--gs);color:var(--gr);}
.sv-timer.warn{background:var(--ys);color:var(--ye);}
.sv-timer.danger{background:var(--rs);color:var(--re);animation:pulse .8s ease-in-out infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
/* Q LIST */
.sv-ql{flex:1;overflow-y:auto;}
.sv-qr{display:flex;align-items:flex-start;gap:9px;padding:10px 13px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s;}
.sv-qr:hover{background:var(--ch);}
.sv-qr.act{background:var(--card);border-left:3px solid var(--ac);padding-left:10px;}
.sv-qr-left{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:24px;padding-top:2px;flex-shrink:0;}
.sv-qn{font-family:monospace;font-size:10px;color:var(--tx3);}
.dd{width:6px;height:6px;border-radius:50%;}
.dd.easy{background:var(--ec);} .dd.medium{background:var(--mc);} .dd.hard{background:var(--hc);}
.sv-qb{flex:1;min-width:0;}
.sv-qm{font-size:10px;color:var(--tx3);font-weight:700;text-transform:uppercase;letter-spacing:.7px;margin-bottom:2px;}
.sv-qp{font-size:12px;color:var(--tx);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:500;}
.sv-qck{font-size:13px;flex-shrink:0;padding-top:1px;}
.sv-le{padding:30px 14px;text-align:center;color:var(--tx3);font-size:13px;line-height:2;}
/* DETAIL */
.sv-det{flex:1;overflow-y:auto;background:var(--bg);position:relative;}
.sv-side-toggle{position:absolute;top:12px;left:12px;z-index:10;width:32px;height:32px;border-radius:8px;background:var(--bg3);border:1px solid var(--bd);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .15s;font-family:'Nunito',sans-serif;}
.sv-side-toggle:hover{background:var(--as);border-color:var(--ac);}
.sv-session-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 16px 8px 52px;background:var(--bg2);border-bottom:1px solid var(--bd);font-size:12px;color:var(--tx3);font-weight:700;flex-shrink:0;}
/* WELCOME */
.sv-wl{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:40px 28px;text-align:center;gap:16px;}
.sv-wi{font-size:52px;line-height:1;}
.sv-wl h1{font-size:26px;font-weight:900;line-height:1.2;letter-spacing:-.5px;}
.sv-wl h1 em{color:var(--ac);font-style:normal;}
.sv-wl p{color:var(--tx2);font-size:14px;max-width:360px;line-height:1.7;}
/* QVIEW */
.sv-qv{padding:22px 28px 28px;max-width:720px;animation:sv-up .3s ease;}
@keyframes sv-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.sv-qv-top{padding-left:44px;}
.sv-chips{display:flex;align-items:center;gap:7px;margin-bottom:16px;flex-wrap:wrap;}
.ch{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid;letter-spacing:.3px;}
.ch-id{color:var(--tx3);border-color:var(--bd);background:transparent;font-family:monospace;}
.ch-tp{color:var(--ac);border-color:var(--ac);background:var(--as);}
.ch-easy{color:var(--ec);border-color:var(--ec);background:var(--gs);}
.ch-medium{color:var(--mc);border-color:var(--mc);background:var(--ys);}
.ch-hard{color:var(--hc);border-color:var(--hc);background:var(--rs);}
.ch-ty{color:var(--tx3);border-color:var(--bd);background:var(--bg3);font-size:10px;}
.ch-flag{color:var(--re);border-color:var(--re);background:var(--rs);cursor:pointer;}
.sv-nr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.sv-ni{font-size:13px;color:var(--tx3);font-weight:700;}
.sv-na{display:flex;gap:7px;align-items:center;}
.sv-ar{width:40px;height:40px;border-radius:9px;background:var(--bg3);border:1px solid var(--bd);color:var(--tx2);font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;touch-action:manipulation;font-family:'Nunito',sans-serif;}
.sv-ar:hover{background:var(--as);border-color:var(--ac);color:var(--ac);}
.sv-ar:active{transform:scale(.92);}
.sv-ar.end-btn{background:var(--rs);border-color:var(--re);color:var(--re);font-size:11px;font-weight:700;width:auto;padding:0 12px;}
.sv-ar.end-btn:hover{background:var(--re);color:#fff;}
.sv-qt{font-size:17px;line-height:1.85;font-weight:500;color:var(--tx);margin-bottom:20px;white-space:pre-wrap;}
.sv-gv{background:var(--bg3);border:1.5px solid var(--bd);border-left:4px solid var(--ac);border-radius:0 10px 10px 0;padding:12px 16px;font-family:monospace;font-size:14px;color:var(--ye);line-height:2;white-space:pre-wrap;margin-bottom:18px;}
.sv-opts{display:flex;flex-direction:column;gap:8px;margin-bottom:20px;}
.sv-opt{display:flex;align-items:flex-start;gap:12px;padding:13px 15px;border:1.5px solid var(--bd);border-radius:11px;cursor:pointer;background:var(--card);transition:all .18s;user-select:none;}
.sv-opt:hover:not(.dn){border-color:var(--ac);background:var(--as);transform:translateX(3px);}
.sv-opt.cor{border-color:var(--gr);background:var(--gs);cursor:default;transform:none;}
.sv-opt.wrg{border-color:var(--re);background:var(--rs);cursor:default;transform:none;}
.sv-opt.dn{cursor:default;} .sv-opt.nl{cursor:default;opacity:.5;}
.sv-ob{width:27px;height:27px;border-radius:50%;background:var(--bg3);border:1.5px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;}
.sv-opt.cor .sv-ob{background:var(--gr);border-color:var(--gr);color:#fff;}
.sv-opt.wrg .sv-ob{background:var(--re);border-color:var(--re);color:#fff;}
.sv-ot{font-size:15px;line-height:1.55;font-weight:500;padding-top:1px;flex:1;}
.sv-spr{margin-bottom:20px;}
.sv-sl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--tx3);font-weight:700;margin-bottom:8px;}
.sv-si{background:var(--card);border:2px solid var(--bd);border-radius:11px;padding:11px 16px;color:var(--tx);font-family:monospace;font-size:20px;font-weight:500;width:210px;outline:none;transition:border-color .15s;}
.sv-si:focus{border-color:var(--ac);box-shadow:0 0 0 3px var(--as);}
.sv-si.cor{border-color:var(--gr);} .sv-si.wrg{border-color:var(--re);}
.sv-ac{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;}
.sv-bp{padding:10px 22px;background:var(--ac);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;transition:all .15s;box-shadow:0 3px 12px var(--ag);font-family:'Nunito',sans-serif;}
.sv-bp:hover{opacity:.87;transform:translateY(-1px);}
.sv-bo{padding:10px 16px;background:transparent;color:var(--tx2);border:1.5px solid var(--bd);border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;font-family:'Nunito',sans-serif;}
.sv-bo:hover{border-color:var(--ac);color:var(--ac);background:var(--as);}
.sv-res{padding:12px 15px;border-radius:11px;font-size:15px;font-weight:700;margin-bottom:16px;border:1.5px solid;display:flex;align-items:center;gap:9px;animation:sv-up .2s ease;}
.sv-res.cor{background:var(--gs);color:var(--gr);border-color:var(--gr);}
.sv-res.wrg{background:var(--rs);color:var(--re);border-color:var(--re);}
.sv-exp{background:var(--card);border:1.5px solid var(--bd);border-radius:13px;overflow:hidden;animation:sv-up .25s ease;}
.sv-eh{display:flex;align-items:center;gap:8px;padding:11px 16px;background:var(--bg3);border-bottom:1px solid var(--bd);}
.sv-et{font-size:11px;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;color:var(--ac);}
.sv-eb{padding:15px 17px;}
.sv-ex{font-size:14px;line-height:1.85;color:var(--tx);margin-bottom:10px;font-weight:500;}
.sv-em{background:var(--bg);border:1.5px solid var(--bd);border-radius:9px;padding:12px 15px;font-family:monospace;font-size:13px;color:var(--ye);white-space:pre-wrap;line-height:2;}
.sv-stats-bar{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;padding:10px 13px;background:var(--bg3);border:1px solid var(--bd);border-radius:10px;}
.sv-stat-item{display:flex;flex-direction:column;align-items:center;min-width:56px;flex:1;}
.sv-stat-item .sv-sval{font-size:16px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;}
.sv-stat-item .sv-slbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);margin-top:2px;text-align:center;}
.sv-stat-item.att .sv-sval{color:var(--ac);}
.sv-stat-item.cor2 .sv-sval{color:var(--gr);}
.sv-stat-item.wrg2 .sv-sval{color:var(--re);}
.sv-stat-item.last .sv-sval{font-size:10px;color:var(--tx2);font-family:monospace;font-weight:500;}
.sv-divider{width:1px;background:var(--bd);align-self:stretch;margin:0 3px;}
/* SESSION SETUP MODAL */
.sv-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;}
.sv-modal{background:var(--card);border:1.5px solid var(--bd);border-radius:18px;padding:28px;width:100%;max-width:440px;box-shadow:var(--sh);}
.sv-modal-title{font-size:18px;font-weight:900;margin-bottom:20px;color:var(--tx);}
.sv-modal-section{margin-bottom:16px;}
.sv-modal-label{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--tx3);font-weight:700;margin-bottom:8px;}
.sv-modal-row{display:flex;gap:7px;flex-wrap:wrap;}
.sv-mopt{padding:8px 14px;border:1.5px solid var(--bd);border-radius:9px;background:var(--bg3);color:var(--tx2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'Nunito',sans-serif;}
.sv-mopt:hover{border-color:var(--ac);color:var(--ac);}
.sv-mopt.on{background:var(--as);border-color:var(--ac);color:var(--ac);}
.sv-modal-actions{display:flex;gap:8px;margin-top:20px;}
/* SESSION REPORT MODAL */
.sv-report-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:300;padding:20px;overflow-y:auto;}
.sv-report{background:var(--card);border:1.5px solid var(--bd);border-radius:18px;padding:28px;width:100%;max-width:520px;box-shadow:var(--sh);animation:sv-up .3s ease;}
.sv-report-score{text-align:center;padding:20px 0;margin-bottom:20px;border-bottom:1px solid var(--bd);}
.sv-report-pct{font-size:56px;font-weight:900;line-height:1;}
.sv-report-label{font-size:12px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;margin-top:4px;}
.sv-report-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;}
.sv-rc{background:var(--bg3);border-radius:10px;padding:12px 8px;text-align:center;}
.sv-rc .rv{font-size:20px;font-weight:800;color:var(--tx);}
.sv-rc .rl{font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;margin-top:3px;}
.sv-rc.green .rv{color:var(--gr);}
.sv-rc.red .rv{color:var(--re);}
.sv-rc.yellow .rv{color:var(--ye);}
/* MOCK EXAM */
.sv-mock{flex:1;overflow-y:auto;padding:24px 28px;background:var(--bg);}
.sv-mock-lobby{max-width:700px;}
.sv-mock-hero{background:linear-gradient(135deg,var(--ac),var(--gr));border-radius:16px;padding:28px;color:#000;margin-bottom:24px;position:relative;overflow:hidden;}
.sv-mock-hero h2{font-size:24px;font-weight:900;margin-bottom:6px;}
.sv-mock-hero p{font-size:14px;opacity:.75;}
.sv-mock-info{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;}
.sv-mock-info-card{background:var(--card);border:1.5px solid var(--bd);border-radius:12px;padding:16px;text-align:center;}
.sv-mock-info-card .mi-n{font-size:22px;font-weight:900;color:var(--ac);}
.sv-mock-info-card .mi-l{font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;margin-top:3px;}
.sv-mock-past{margin-top:24px;}
.sv-mock-past-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);margin-bottom:12px;}
.sv-exam-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--card);border:1.5px solid var(--bd);border-radius:11px;margin-bottom:8px;cursor:pointer;transition:all .15s;}
.sv-exam-row:hover{border-color:var(--ac);background:var(--as);}
.sv-exam-row .er-title{font-size:13px;font-weight:700;color:var(--tx);}
.sv-exam-row .er-meta{font-size:11px;color:var(--tx3);margin-top:2px;}
.sv-exam-row .er-score{font-size:20px;font-weight:900;color:var(--ac);}
/* MOCK EXAM TAKING */
.sv-mock-exam{display:flex;flex-direction:column;height:100%;}
.sv-mock-header{padding:12px 24px;background:var(--bg2);border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.sv-mock-prog{display:flex;gap:4px;}
.sv-mock-dot{width:8px;height:8px;border-radius:50%;background:var(--bg4);transition:background .2s;}
.sv-mock-dot.answered{background:var(--ac);}
.sv-mock-dot.current{background:var(--ye);box-shadow:0 0 6px var(--ye);}
.sv-mock-body{flex:1;overflow-y:auto;padding:28px 32px;max-width:760px;}
.sv-mock-nav{padding:16px 32px;border-top:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;background:var(--bg2);}
/* BREAK SCREEN */
.sv-break{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;text-align:center;padding:40px;gap:16px;}
.sv-break-icon{font-size:60px;}
.sv-break h2{font-size:26px;font-weight:900;color:var(--tx);}
.sv-break p{color:var(--tx2);font-size:15px;max-width:400px;line-height:1.7;}
.sv-break-score{display:flex;gap:20px;justify-content:center;margin:8px 0;}
.sv-break-stat{text-align:center;}
.sv-break-stat .bs-n{font-size:28px;font-weight:900;color:var(--ac);}
.sv-break-stat .bs-l{font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;}
/* MOCK REPORT */
.sv-mock-report{max-width:640px;margin:0 auto;padding:28px;}
.sv-sat-score{text-align:center;padding:28px 20px;background:linear-gradient(135deg,var(--as),var(--gs));border:2px solid var(--ac);border-radius:18px;margin-bottom:24px;}
.sv-sat-num{font-size:72px;font-weight:900;color:var(--ac);line-height:1;}
.sv-sat-label{font-size:13px;color:var(--tx3);text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;}
.sv-sat-sub{font-size:14px;color:var(--tx2);margin-top:8px;}
.sv-report-modules{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}
.sv-mod-card{background:var(--card);border:1.5px solid var(--bd);border-radius:12px;padding:18px;}
.sv-mod-card h3{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;margin-bottom:10px;}
.sv-mod-score{font-size:30px;font-weight:900;color:var(--tx);}
.sv-mod-sub{font-size:12px;color:var(--tx3);margin-top:2px;}
.sv-q-review{margin-bottom:20px;}
.sv-q-review-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);margin-bottom:10px;}
.sv-rq{padding:10px 14px;border-radius:9px;border:1px solid var(--bd);margin-bottom:6px;display:flex;align-items:flex-start;gap:10px;}
.sv-rq.cor{border-color:var(--gr);background:var(--gs);}
.sv-rq.wrg{border-color:var(--re);background:var(--rs);}
.sv-rq.una{border-color:var(--bd);background:var(--bg3);opacity:.6;}
.sv-rq-icon{font-size:14px;flex-shrink:0;margin-top:1px;}
.sv-rq-text{font-size:12px;color:var(--tx);flex:1;line-height:1.5;}
.sv-rq-ans{font-size:11px;color:var(--tx3);font-family:monospace;margin-top:2px;}
/* INSIGHTS */
.sv-insights{flex:1;overflow-y:auto;padding:22px 26px;background:var(--bg);}
.sv-ins-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px;}
.sv-ins-card{background:var(--card);border:1.5px solid var(--bd);border-radius:13px;padding:16px;text-align:center;}
.sv-ins-card .ic-n{font-size:24px;font-weight:800;color:var(--ac);line-height:1.1;font-variant-numeric:tabular-nums;}
.sv-ins-card .ic-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);margin-top:3px;}
.sv-ins-card.green .ic-n{color:var(--gr);}
.sv-ins-card.red .ic-n{color:var(--re);}
.sv-section-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);margin-bottom:10px;margin-top:2px;}
.sv-topic-table{width:100%;border-collapse:collapse;margin-bottom:22px;}
.sv-topic-table th{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);text-align:left;padding:7px 12px;border-bottom:1px solid var(--bd);font-weight:700;}
.sv-topic-table td{padding:11px 12px;border-bottom:1px solid var(--bd);font-size:13px;font-weight:500;}
.sv-topic-table tr:last-child td{border-bottom:none;}
.sv-topic-table tr:hover td{background:var(--bg3);}
.sv-bar-wrap{height:8px;background:var(--bg3);border-radius:10px;overflow:hidden;width:120px;}
.sv-bar-fill{height:100%;border-radius:10px;transition:width .6s ease;}
.sv-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;}
.sv-badge.strong{background:var(--gs);color:var(--gr);}
.sv-badge.average{background:var(--ys);color:var(--ye);}
.sv-badge.weak{background:var(--rs);color:var(--re);}
.sv-diff-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px;}
.sv-diff-card{background:var(--card);border:1.5px solid var(--bd);border-radius:13px;padding:15px;position:relative;overflow:hidden;}
.sv-diff-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;}
.sv-diff-card.easy::before{background:var(--ec);}
.sv-diff-card.medium::before{background:var(--mc);}
.sv-diff-card.hard::before{background:var(--hc);}
.sv-diff-card .dc-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;}
.sv-diff-card.easy .dc-label{color:var(--ec);}
.sv-diff-card.medium .dc-label{color:var(--mc);}
.sv-diff-card.hard .dc-label{color:var(--hc);}
.sv-diff-card .dc-pct{font-size:26px;font-weight:900;color:var(--tx);line-height:1;}
.sv-diff-card .dc-sub{font-size:11px;color:var(--tx3);margin-top:3px;}
.sv-diff-card .dc-bar{height:5px;background:var(--bg3);border-radius:10px;margin-top:8px;overflow:hidden;}
.sv-diff-card .dc-bar-fill{height:100%;border-radius:10px;}
.sv-diff-card.easy .dc-bar-fill{background:var(--ec);}
.sv-diff-card.medium .dc-bar-fill{background:var(--mc);}
.sv-diff-card.hard .dc-bar-fill{background:var(--hc);}
/* LOADING */
.sv-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;z-index:999;}
.sv-lc{background:var(--card);border:1.5px solid var(--bd);border-radius:17px;padding:30px 42px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:11px;box-shadow:var(--sh);min-width:250px;}
.sv-sp2{width:42px;height:42px;border:3px solid var(--bd);border-top-color:var(--ac);border-radius:50%;animation:sv-spin .75s linear infinite;}
@keyframes sv-spin{to{transform:rotate(360deg)}}
.sv-lt{font-size:15px;font-weight:800;color:var(--tx);}
.sv-ls{font-size:11px;color:var(--tx3);font-family:monospace;}
@media(max-width:700px){
  .sv{height:auto;min-height:100vh;overflow:auto;}
  .sv-body{flex-direction:column;overflow:visible;}
  .sv-side{width:100%!important;opacity:1!important;pointer-events:auto!important;border-right:none;border-bottom:1px solid var(--bd);}
  .sv-side.collapsed{max-height:0;overflow:hidden;border:none;}
  .sv-det{overflow:visible;min-height:60vh;}
  .sv-qv{padding:16px 14px;}
  .sv-stats{display:none;}
  .sv-ins-grid{grid-template-columns:repeat(2,1fr);}
  .sv-diff-grid{grid-template-columns:1fr;}
  .sv-home-grid{grid-template-columns:1fr 1fr;}
  .sv-mock-body{padding:18px 16px;}
  .sv-ar{width:48px;height:48px;font-size:19px;}
  .sv-report-modules{grid-template-columns:1fr;}
}
`
  const fmtTime = (s:number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
  const timerClass = timeLeft===null?'ok':timeLeft>120?'ok':timeLeft>30?'warn':'danger'
  const mockTimerClass = mockTimeLeft>120?'ok':mockTimeLeft>30?'warn':'danger'
  const diffOnClass = (v:string) => diffF===v?(v==='easy'?'pb oe':v==='medium'?'pb om':v==='hard'?'pb oh':'pb on'):'pb'

  // ─────────────────────────────────────────────────────────────
  // INSIGHTS COMPUTE
  // ─────────────────────────────────────────────────────────────
  const topicStats = TOPICS.map(topic => {
    const tqs=questions.filter(q=>q.topic===topic)
    const tatt=tqs.filter(q=>dbStats[q.id])
    const tcor=tatt.reduce((s,q)=>s+(dbStats[q.id]?.times_correct??0),0)
    const twrg=tatt.reduce((s,q)=>s+(dbStats[q.id]?.times_wrong??0),0)
    const ttot=tcor+twrg
    const pct=ttot>0?Math.round(tcor/ttot*100):null
    const level=pct===null?'untested':pct>=80?'strong':pct>=50?'average':'weak'
    return {topic,total:tqs.length,attempted:tatt.length,correct:tcor,wrong:twrg,pct,level}
  })
  const diffStats=(['easy','medium','hard'] as const).map(diff=>{
    const dqs=questions.filter(q=>q.diff===diff)
    const datt=dqs.filter(q=>dbStats[q.id])
    const dcor=datt.reduce((s,q)=>s+(dbStats[q.id]?.times_correct??0),0)
    const dwrg=datt.reduce((s,q)=>s+(dbStats[q.id]?.times_wrong??0),0)
    const dtot=dcor+dwrg
    const pct=dtot>0?Math.round(dcor/dtot*100):null
    return {diff,total:dqs.length,attempted:datt.length,correct:dcor,wrong:dwrg,pct}
  })
  const totalAttempts=Object.values(dbStats).reduce((s,a)=>s+(a.times_attempted??0),0)
  const totalCorrectAttempts=Object.values(dbStats).reduce((s,a)=>s+(a.times_correct??0),0)
  const attemptAccuracy=totalAttempts>0?Math.round(totalCorrectAttempts/totalAttempts*100):null
  const bestMockScore=mockAttempts.filter(a=>a.completed).reduce((best,a)=>Math.max(best,a.sat_score||0),0)
  const [insightDrill, setInsightDrill] = useState<{type:'topic'|'diff'|'flag', value:string}|null>(null)

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div data-sv={theme}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="sv">
        {/* TOPBAR */}
        <div className="sv-top">
          <div className="sv-brand"><div className="sv-brand-ico">🏆</div>SAT Math <em>Vault</em></div>
          <div className="sv-tr">
            {timeLeft!==null&&<div className={`sv-timer ${timerClass}`}>⏱ {fmtTime(timeLeft)}</div>}
            <div className="sv-stats">
              <div className="sv-sp"><div className="n">{questions.length}</div><div className="l">Bank</div></div>
              <div className="sv-sp"><div className="n">{attCount}</div><div className="l">Tried</div></div>
              <div className="sv-sp"><div className="n">{accuracy!==null?`${accuracy}%`:'—'}</div><div className="l">Accuracy</div></div>
              <div className="sv-sp"><div className="n" style={{color:'var(--ye)'}}>{currentStreak}🔥</div><div className="l">Streak</div></div>
            </div>
            <button className="sv-tb" onClick={toggleTheme}>{theme==='dark'?'🌙':'☀️'}</button>
          </div>
        </div>
        <div className="sv-pb"><div className="sv-pbf" style={{width:`${accuracy??0}%`}}/></div>

        {/* TABS */}
        <div className="sv-tabs">
          <button className={`sv-tab${view==='home'?' on':''}`} onClick={()=>setView('home')}>🏠 Home</button>
          <button className={`sv-tab${view==='practice'?' on':''}`} onClick={()=>setView('practice')}>📚 Practice</button>
          <button className={`sv-tab${view==='mock'?' on':''}`} onClick={()=>setView('mock')}>📝 Mock Exam</button>
          <button className={`sv-tab${view==='insights'?' on':''}`} onClick={()=>setView('insights')}>📊 Insights</button>
        </div>

        {/* ══ HOME ══ */}
        {view==='home'&&(
          <div className="sv-home">
            {/* Streak */}
            <div className="sv-streak-card">
              <div className="sv-streak-top">
                <div>
                  <div className="sv-streak-title">Daily Streak</div>
                  <div className="sv-streak-num">{currentStreak}🔥</div>
                  <div className="sv-streak-label">Current · Longest: {longestStreak} days · Need 15 questions/day</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,color:'var(--tx3)',marginBottom:4}}>Today: {todayStats?.questions_answered||0}/15 questions</div>
                  <div style={{width:140,height:8,background:'var(--bg3)',borderRadius:10,overflow:'hidden'}}>
                    <div style={{width:`${Math.min(100,((todayStats?.questions_answered||0)/15)*100)}%`,height:'100%',background:'var(--ac)',borderRadius:10,transition:'width .4s'}}/>
                  </div>
                </div>
              </div>
              <div className="sv-cal">
                {Array.from({length:30},(_,i)=>{
                  const d=new Date(); d.setDate(d.getDate()-29+i)
                  const dateStr=d.toISOString().split('T')[0]
                  const today=new Date().toISOString().split('T')[0]
                  const isToday=dateStr===today
                  const dayData=streakDays.find(s=>s.date===dateStr)
                  const active=dayData?.streak_counted
                  return <div key={i} className={`sv-cal-day ${isToday?(active?'today-active':'today-inactive'):active?'active':'inactive'}`} title={`${dateStr}: ${dayData?.questions_answered||0} questions`}/>
                })}
              </div>
            </div>

            {/* Summary cards */}
            <div className="sv-home-grid">
              <div className="sv-hcard">
                <div className="hc-top"><span className="hc-icon">📚</span><span className="hc-title">Question Bank</span></div>
                <div className="hc-val">{questions.length}</div>
                <div className="hc-sub">{Object.keys(dbStats).length} attempted</div>
              </div>
              <div className="sv-hcard">
                <div className="hc-top"><span className="hc-icon">🎯</span><span className="hc-title">Overall Accuracy</span></div>
                <div className="hc-val" style={{color:attemptAccuracy!==null?(attemptAccuracy>=70?'var(--gr)':attemptAccuracy>=50?'var(--ye)':'var(--re)'):'var(--tx)'}}>{attemptAccuracy!==null?`${attemptAccuracy}%`:'—'}</div>
                <div className="hc-sub">{totalCorrectAttempts} correct of {totalAttempts} attempts</div>
              </div>
              <div className="sv-hcard">
                <div className="hc-top"><span className="hc-icon">📝</span><span className="hc-title">Best Mock Score</span></div>
                <div className="hc-val" style={{color:'var(--ac)'}}>{bestMockScore||'—'}</div>
                <div className="hc-sub">{mockAttempts.filter(a=>a.completed).length} exams taken</div>
              </div>
            </div>

            {/* Weakest topic */}
            {topicStats.some(t=>t.pct!==null)&&(()=>{
              const worst=topicStats.filter(t=>t.pct!==null).sort((a,b)=>(a.pct??100)-(b.pct??100))[0]
              const best=topicStats.filter(t=>t.pct!==null).sort((a,b)=>(b.pct??0)-(a.pct??0))[0]
              return (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:24}}>
                  <div className="sv-hcard" style={{borderColor:'var(--re)'}}>
                    <div className="hc-top"><span className="hc-icon">⚠️</span><span className="hc-title">Needs Work</span></div>
                    <div className="hc-val" style={{fontSize:18}}>{worst.topic}</div>
                    <div className="hc-sub" style={{color:'var(--re)'}}>{worst.pct}% accuracy</div>
                  </div>
                  <div className="sv-hcard" style={{borderColor:'var(--gr)'}}>
                    <div className="hc-top"><span className="hc-icon">💪</span><span className="hc-title">Strongest</span></div>
                    <div className="hc-val" style={{fontSize:18}}>{best.topic}</div>
                    <div className="hc-sub" style={{color:'var(--gr)'}}>{best.pct}% accuracy</div>
                  </div>
                </div>
              )
            })()}

            {/* Quick actions */}
            <div style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:1,color:'var(--tx3)',marginBottom:10}}>Quick Start</div>
            <div className="sv-quick-btns">
              <button className="sv-qbtn" onClick={()=>{setView('practice');setSource('fresh');setShowSetup(true)}}>
                <div className="qb-icon">⚡</div><div className="qb-title">Fresh Practice</div><div className="qb-sub">Generate new AI questions</div>
              </button>
              <button className="sv-qbtn" onClick={()=>{setView('practice');setSource('weak');setShowSetup(true)}}>
                <div className="qb-icon">🎯</div><div className="qb-title">Weak Areas</div><div className="qb-sub">Practice what you get wrong</div>
              </button>
              <button className="sv-qbtn" onClick={()=>{setView('practice');setSource('unseen');setShowSetup(true)}}>
                <div className="qb-icon">🆕</div><div className="qb-title">Not Yet Tried</div><div className="qb-sub">Untouched questions from bank</div>
              </button>
              <button className="sv-qbtn" onClick={()=>{setView('mock');generateMock()}}>
                <div className="qb-icon">📝</div><div className="qb-title">Take Mock Exam</div><div className="qb-sub">Full 44-question digital SAT</div>
              </button>
            </div>
          </div>
        )}

        {/* ══ PRACTICE ══ */}
        {view==='practice'&&(
          <div className="sv-body">
            {/* SIDEBAR */}
            <div className={`sv-side${sidebarOpen?'':' collapsed'}`}>
              <div className="sv-ctrl">
                <div>
                  <div className="sv-cl">Source</div>
                  <div className="sv-row" style={{flexWrap:'wrap',gap:4}}>
                    {(['fresh','bank','weak','unseen'] as const).map(s=>(
                      <button key={s} className={`pb${source===s?' on':''}`} onClick={()=>setSource(s)} style={{flex:'none',padding:'6px 10px'}}>
                        {s==='fresh'?'⚡ Fresh':s==='bank'?'🗄 Bank':s==='weak'?'🎯 Weak':'🆕 New'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="sv-cl">Topic</div>
                  <div className="sv-tg">
                    {[{v:'all',l:'All Topics'},...TOPICS.map(t=>({v:t,l:t}))].map(({v,l})=>(
                      <button key={v} className={`sb${topicF===v?' on':''}`} onClick={()=>setTopicF(v)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="sv-cl">Difficulty</div>
                  <div className="sv-row">
                    {(['all','easy','medium','hard'] as const).map(v=>(
                      <button key={v} className={diffOnClass(v)} onClick={()=>setDiffF(v)}>{v==='all'?'All':v==='medium'?'Med':v.charAt(0).toUpperCase()+v.slice(1)}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="sv-cl">Questions</div>
                  <div className="sv-row">
                    {[5,10,15,20].map(n=>(
                      <button key={n} className={batchN===n?'pb on':'pb'} onClick={()=>setBatchN(n)}>{n}</button>
                    ))}
                  </div>
                </div>
                <button className="sv-gen" onClick={()=>setShowSetup(true)} disabled={isBusy}>
                  <span>{isBusy?'⏳':'▶'}</span>
                  <span>{isBusy?'Loading…':'Start Session'}</span>
                </button>
                {genError&&<div style={{fontSize:12,color:'var(--re)',padding:'8px 10px',background:'var(--rs)',borderRadius:8,border:'1px solid var(--re)'}}>{genError}</div>}
              </div>
              <div className="sv-ql">
                {vis.length===0?(
                  <div className="sv-le">
                    <span style={{fontSize:28,display:'block',marginBottom:8}}>{questions.length>0?'🔍':'📚'}</span>
                    {questions.length>0?'No questions match.':'Start a session to begin.'}
                  </div>
                ):vis.map((q,i)=>{
                  const done=attempted[q.id]!==undefined; const ok=correct[q.id]
                  return(
                    <div key={q.id} className={`sv-qr${currentId===q.id?' act':''}`} onClick={()=>{setCurrentId(q.id);setSprValue('')}}>
                      <div className="sv-qr-left">
                        <span className="sv-qn">{String(i+1).padStart(2,'0')}</span>
                        <span className={`dd ${q.diff}`}/>
                        {flagged.has(q.id)&&<span style={{fontSize:8}}>🚩</span>}
                      </div>
                      <div className="sv-qb">
                        <div className="sv-qm">{SHORT[q.topic]||q.topic} · {q.diff}</div>
                        <div className="sv-qp">{q.q.replace(/\n/g,' ')}</div>
                      </div>
                      {done&&<span className="sv-qck">{ok?'✅':'❌'}</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* DETAIL */}
            <div className="sv-det">
              <button className="sv-side-toggle" onClick={()=>setSidebarOpen(p=>!p)} title={sidebarOpen?'Collapse sidebar':'Expand sidebar'}>
                {sidebarOpen?'◀':'▶'}
              </button>
              {activeSession&&(
                <div className="sv-session-bar">
                  <span>Session: {sessionQs.filter(q=>attempted[q.id]!==undefined).length}/{sessionQs.length} answered</span>
                  <button className="sv-ar end-btn" onClick={()=>endSession()}>End Session</button>
                </div>
              )}
              {!currentQ?(
                <div className="sv-wl">
                  <div className="sv-wi">🏆</div>
                  <h1>SAT Math <em>Practice</em></h1>
                  <p>Choose a source and hit Start Session — or pick any question from the sidebar.</p>
                </div>
              ):(
                <div className="sv-qv">
                  <div className="sv-qv-top">
                    <div className="sv-chips">
                      <span className="ch ch-id">{currentQ.id}</span>
                      <span className="ch ch-tp">{currentQ.topic}</span>
                      <span className={`ch ch-${currentQ.diff}`}>{currentQ.diff}</span>
                      <span className="ch ch-ty">{currentQ.type==='spr'?'Open Response':'Multiple Choice'}</span>
                      <span className={`ch${flagged.has(currentQ.id)?' ch-flag':''}`} style={{cursor:'pointer',borderColor:flagged.has(currentQ.id)?'var(--re)':'var(--bd)',color:flagged.has(currentQ.id)?'var(--re)':'var(--tx3)',background:'transparent'}} onClick={()=>toggleFlag(currentQ.id)}>
                        {flagged.has(currentQ.id)?'🚩 Flagged':'⚑ Flag'}
                      </span>
                    </div>
                    <div className="sv-nr">
                      <span className="sv-ni">Q {visIdx+1} of {vis.length}</span>
                      <div className="sv-na">
                        <button className="sv-ar" onClick={()=>goRel(-1)}>←</button>
                        <button className="sv-ar" onClick={()=>goRel(1)}>→</button>
                      </div>
                    </div>
                    {currentId&&dbStats[currentId]&&(
                      <div className="sv-stats-bar">
                        <div className="sv-stat-item att"><span className="sv-sval">{dbStats[currentId].times_attempted??0}</span><span className="sv-slbl">Tried</span></div>
                        <div className="sv-divider"/>
                        <div className="sv-stat-item cor2"><span className="sv-sval">{dbStats[currentId].times_correct??0}</span><span className="sv-slbl">Correct</span></div>
                        <div className="sv-divider"/>
                        <div className="sv-stat-item wrg2"><span className="sv-sval">{dbStats[currentId].times_wrong??0}</span><span className="sv-slbl">Wrong</span></div>
                        <div className="sv-divider"/>
                        <div className="sv-stat-item last"><span className="sv-sval">{dbStats[currentId].last_attempted?new Date(dbStats[currentId].last_attempted!).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}):'—'}</span><span className="sv-slbl">Last</span></div>
                      </div>
                    )}
                  </div>
                  <div className="sv-qt">{currentQ.q}</div>
                  {currentQ.given&&<div className="sv-gv">{currentQ.given}</div>}
                  {currentQ.type==='mc'?(
                    <div className="sv-opts">
                      {currentQ.opts.map((opt,i)=>{
                        let cls='sv-opt'
                        if(isDone){if(i===Number(currentQ.ans))cls+=' cor dn';else if(attempted[currentId!]===i)cls+=' wrg dn';else cls+=' nl dn'}
                        return(<div key={i} className={cls} onClick={()=>!isDone&&pick(i)}><div className="sv-ob">{'ABCD'[i]}</div><div className="sv-ot">{opt}</div>{isDone&&i===Number(currentQ.ans)&&<span style={{marginLeft:'auto',fontSize:14}}>✓</span>}</div>)
                      })}
                    </div>
                  ):(
                    <div className="sv-spr">
                      <div className="sv-sl">📝 Enter Your Answer</div>
                      <input className={`sv-si${isDone?(isOk?' cor':' wrg'):''}`} type="text" placeholder="Type answer…" value={isDone?String(currentQ.ans):sprValue} disabled={isDone} onChange={e=>setSprValue(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitSPR()}/>
                    </div>
                  )}
                  {isDone&&<div className={`sv-res ${isOk?'cor':'wrg'}`}><span style={{fontSize:17}}>{isOk?'🎉':'❌'}</span><span>{isOk?'Correct!':(<>Not quite — answer: <strong>{currentQ.type==='mc'?currentQ.opts[Number(currentQ.ans)]:currentQ.ans}</strong></>)}</span></div>}
                  {isDone?(
                    <div className="sv-ac">
                      <button className="sv-bp" onClick={()=>goRel(1)}>Next →</button>
                      <button className="sv-bo" onClick={retry}>↺ Retry</button>
                    </div>
                  ):currentQ.type==='spr'?(
                    <div className="sv-ac">
                      <button className="sv-bp" onClick={submitSPR}>Submit</button>
                      <button className="sv-bo" onClick={()=>goRel(1)}>Skip →</button>
                    </div>
                  ):null}
                  {isDone&&(
                    <div className="sv-exp">
                      <div className="sv-eh"><span style={{fontSize:16}}>💡</span><span className="sv-et">Full Solution</span></div>
                      <div className="sv-eb"><div className="sv-ex">{currentQ.exp}</div><div className="sv-em">{currentQ.math}</div></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ MOCK EXAM ══ */}
        {view==='mock'&&(()=>{
          // GENERATING
          if(mockPhase==='generating') return(
            <div className="sv-mock" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div className="sv-lc" style={{position:'static'}}>
                <div className="sv-sp2"/>
                <div className="sv-lt">Generating 44 Questions…</div>
                <div className="sv-ls">Module 1 + Module 2 · Takes ~30 seconds</div>
              </div>
            </div>
          )

          // MODULE 1 or 2
          if(mockPhase==='m1'||mockPhase==='m2'){
            const moduleLabel = mockPhase==='m1'?'Module 1':'Module 2'
            const answered=mockQs.filter(q=>mockAnswers[q.id]).length
            return(
              <div className="sv-mock-exam">
                <div className="sv-mock-header">
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>{moduleLabel} of 2 · {mockQs.length} Questions</div>
                    <div style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{answered} answered · {mockQs.length-answered} remaining</div>
                  </div>
                  <div className="sv-mock-prog">
                    {mockQs.map((_,i)=><div key={i} className={`sv-mock-dot${mockAnswers[mockQs[i].id]?'answered':''} ${i===mockQIdx?'current':''}`}/>)}
                  </div>
                  <div className={`sv-timer ${mockTimerClass}`}>⏱ {fmtTime(mockTimeLeft)}</div>
                </div>
                <div className="sv-mock-body">
                  {curMockQ&&(()=>{
                    const mq=curMockQ
                    const given=mockAnswers[mq.id]
                    return(
                      <>
                        <div className="sv-chips">
                          <span className="ch ch-id">Q{mockQIdx+1}</span>
                          <span className="ch ch-tp">{mq.topic}</span>
                          <span className={`ch ch-${mq.diff}`}>{mq.diff}</span>
                          <span className="ch ch-ty">{mq.type==='spr'?'Open Response':'Multiple Choice'}</span>
                        </div>
                        <div className="sv-qt">{mq.q}</div>
                        {mq.given&&<div className="sv-gv">{mq.given}</div>}
                        {mq.type==='mc'?(
                          <div className="sv-opts">
                            {mq.opts.map((opt,i)=>(
                              <div key={i} className={`sv-opt${mockAnswers[mq.id]===String(i)?' sel':''}`}
                                style={mockAnswers[mq.id]===String(i)?{borderColor:'var(--ac)',background:'var(--as)'}:{}}
                                onClick={()=>mockAnswer(mq.id,String(i))}>
                                <div className="sv-ob" style={mockAnswers[mq.id]===String(i)?{background:'var(--ac)',borderColor:'var(--ac)',color:'#fff'}:{}}>{' ABCD'[i+1]}</div>
                                <div className="sv-ot">{opt}</div>
                              </div>
                            ))}
                          </div>
                        ):(
                          <div className="sv-spr">
                            <div className="sv-sl">📝 Student-Produced Response</div>
                            <input className="sv-si" type="text" placeholder="Your answer…" value={mockAnswers[mq.id]||''} onChange={e=>mockAnswer(mq.id,e.target.value)} onKeyDown={e=>e.key==='Enter'&&setMockQIdx(p=>Math.min(mockQs.length-1,p+1))}/>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
                <div className="sv-mock-nav">
                  <button className="sv-bp" style={{background:'var(--bg3)',color:'var(--tx2)',boxShadow:'none'}} onClick={()=>setMockQIdx(p=>Math.max(0,p-1))} disabled={mockQIdx===0}>← Back</button>
                  <span style={{fontSize:12,color:'var(--tx3)',fontWeight:700}}>{mockQIdx+1} / {mockQs.length}</span>
                  {mockQIdx<mockQs.length-1
                    ?<button className="sv-bp" onClick={()=>setMockQIdx(p=>p+1)}>Next →</button>
                    :<button className="sv-bp" style={{background:mockPhase==='m1'?'var(--ye)':'var(--gr)'}} onClick={()=>mockPhase==='m1'?finishM1():submitMock()}>
                      {mockPhase==='m1'?'Submit Module 1 →':'Submit Exam ✓'}
                    </button>
                  }
                </div>
              </div>
            )
          }

          // BREAK
          if(mockPhase==='break'){
            const m1Answered=m1Qs.filter(q=>mockAnswers[q.id]).length
            const m1Correct=m1Qs.filter(q=>{const a=mockAnswers[q.id];if(!a)return false;const c=String(q.ans);return a===c||(!isNaN(parseFloat(c))&&parseFloat(a)===parseFloat(c))}).length
            return(
              <div className="sv-mock" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div className="sv-break">
                  <div className="sv-break-icon">☕</div>
                  <h2>Module 1 Complete</h2>
                  <div className="sv-break-score">
                    <div className="sv-break-stat"><div className="bs-n">{m1Correct}</div><div className="bs-l">Correct</div></div>
                    <div className="sv-break-stat"><div className="bs-n">{m1Answered-m1Correct}</div><div className="bs-l">Wrong</div></div>
                    <div className="sv-break-stat"><div className="bs-n">{m1Qs.length-m1Answered}</div><div className="bs-l">Unanswered</div></div>
                  </div>
                  <p>Take a short break. Module 2 has 22 questions and 35 minutes. Your performance in Module 1 determines the difficulty level.</p>
                  <button className="sv-bp" style={{marginTop:8}} onClick={startM2}>Start Module 2 →</button>
                </div>
              </div>
            )
          }

          // REPORT
          if(mockPhase==='report'&&mockReport) return(
            <div className="sv-mock" style={{overflowY:'auto'}}>
              <div className="sv-mock-report">
                <div className="sv-sat-score">
                  <div className="sv-sat-num">{mockReport.satScore}</div>
                  <div className="sv-sat-label">SAT Math Score</div>
                  <div className="sv-sat-sub">Raw Score: {mockReport.rawScore}/44 · {Math.round(mockReport.rawScore/44*100)}% correct</div>
                </div>
                <div className="sv-report-modules">
                  <div className="sv-mod-card">
                    <h3>Module 1</h3>
                    <div className="sv-mod-score">{mockReport.m1Raw}/22</div>
                    <div className="sv-mod-sub">{Math.round(mockReport.m1Raw/22*100)}% correct</div>
                  </div>
                  <div className="sv-mod-card">
                    <h3>Module 2</h3>
                    <div className="sv-mod-score">{mockReport.m2Raw}/22</div>
                    <div className="sv-mod-sub">{Math.round(mockReport.m2Raw/22*100)}% correct</div>
                  </div>
                </div>
                {/* Question review */}
                {(['m1','m2'] as const).map(mod=>{
                  const qs=mod==='m1'?mockReport.m1Questions:mockReport.m2Questions
                  const results=mod==='m1'?mockReport.m1Results:mockReport.m2Results
                  return(
                    <div key={mod} className="sv-q-review">
                      <div className="sv-q-review-title">{mod==='m1'?'Module 1':'Module 2'} Review ({qs.length} questions)</div>
                      {qs.map((q,i)=>{
                        const r=results[q.id]
                        return(
                          <div key={q.id} className={`sv-rq ${r?.state||'una'}`}>
                            <div className="sv-rq-icon">{r?.state==='correct'?'✅':r?.state==='wrong'?'❌':'⬜'}</div>
                            <div>
                              <div className="sv-rq-text">Q{i+1}: {q.q.slice(0,80)}{q.q.length>80?'…':''}</div>
                              <div className="sv-rq-ans">
                                {r?.state==='wrong'?<>Your answer: <b>{r.answer||'none'}</b> · Correct: <b>{String(q.ans)}</b></>
                                :r?.state==='correct'?<>Correct ✓ ({r.answer})</>
                                :<>Not answered · Correct: <b>{String(q.ans)}</b></>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                <div style={{display:'flex',gap:10,marginTop:16}}>
                  <button className="sv-bp" onClick={()=>{setMockPhase('lobby');setCurrentExam(null)}}>Back to Exams</button>
                  <button className="sv-bo" onClick={()=>currentExam&&loadExistingMock(currentExam)}>Retake This Exam</button>
                </div>
              </div>
            </div>
          )

          // LOBBY
          return(
            <div className="sv-mock">
              <div className="sv-mock-lobby">
                <div className="sv-mock-hero">
                  <h2>📝 Digital SAT Mock Exam</h2>
                  <p>Full 44-question exam · 70 minutes · Adaptive scoring · Real SAT format</p>
                </div>
                <div className="sv-mock-info">
                  <div className="sv-mock-info-card"><div className="mi-n">44</div><div className="mi-l">Questions</div></div>
                  <div className="sv-mock-info-card"><div className="mi-n">70</div><div className="mi-l">Minutes</div></div>
                  <div className="sv-mock-info-card"><div className="mi-n">200–800</div><div className="mi-l">Score Range</div></div>
                </div>
                {mockError&&<div style={{padding:'10px 14px',background:'var(--rs)',border:'1px solid var(--re)',borderRadius:10,color:'var(--re)',fontSize:13,marginBottom:16}}>{mockError}</div>}
                <button className="sv-gen" style={{marginBottom:24,maxWidth:320}} onClick={generateMock}>⚡ Generate New Exam</button>
                {mockExams.length>0&&(
                  <div className="sv-mock-past">
                    <div className="sv-mock-past-title">Past Exams</div>
                    {mockExams.map(exam=>{
                      const att=mockAttempts.filter(a=>a.exam_id===exam.id&&a.completed)
                      const best=att.reduce((b,a)=>Math.max(b,a.sat_score||0),0)
                      return(
                        <div key={exam.id} className="sv-exam-row" onClick={()=>loadExistingMock(exam)}>
                          <div>
                            <div className="er-title">{exam.title}</div>
                            <div className="er-meta">{att.length} attempt{att.length!==1?'s':''} · {new Date(exam.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
                          </div>
                          <div className="er-score">{best||'—'}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* ══ INSIGHTS ══ */}
        {view==='insights'&&(
          <div className="sv-insights">
            {totalAttempts===0?(
              <div style={{textAlign:'center',padding:'60px 20px',color:'var(--tx3)'}}>
                <div style={{fontSize:48,marginBottom:12}}>📊</div>
                <div style={{fontSize:18,fontWeight:800,color:'var(--tx)',marginBottom:8}}>No data yet</div>
                <div style={{fontSize:14}}>Answer questions in Practice mode to see your insights.</div>
              </div>
            ):(
              <>
                <div className="sv-ins-grid">
                  <div className="sv-ins-card"><div className="ic-n">{questions.length}</div><div className="ic-l">In Bank</div></div>
                  <div className="sv-ins-card"><div className="ic-n">{totalAttempts}</div><div className="ic-l">Total Attempts</div></div>
                  <div className="sv-ins-card green"><div className="ic-n">{attemptAccuracy!==null?`${attemptAccuracy}%`:'—'}</div><div className="ic-l">Accuracy</div></div>
                  <div className="sv-ins-card" style={bestMockScore?{borderColor:'var(--ac)'}:{}}><div className="ic-n" style={{color:'var(--ac)'}}>{bestMockScore||'—'}</div><div className="ic-l">Best SAT Score</div></div>
                </div>
                <div className="sv-section-title">By Difficulty</div>
                <div className="sv-diff-grid">
                  {diffStats.map(({diff,total,attempted:att,correct:cor,wrong:wrg,pct})=>(
                    <div key={diff} className={`sv-diff-card ${diff}`} style={{cursor:'pointer'}} onClick={()=>setInsightDrill(d=>d?.value===diff&&d?.type==='diff'?null:{type:'diff',value:diff})} title={`Drill into ${diff} questions`}>
                      <div className="dc-label">{diff.charAt(0).toUpperCase()+diff.slice(1)}</div>
                      <div className="dc-pct">{pct!==null?`${pct}%`:'—'}</div>
                      <div className="dc-sub">{cor}✓ {wrg}✗ of {att} tried ({total} in bank)</div>
                      <div className="dc-bar"><div className="dc-bar-fill" style={{width:`${pct??0}%`}}/></div>
                    </div>
                  ))}
                </div>
                <div className="sv-section-title">By Topic</div>
                <table className="sv-topic-table">
                  <thead><tr><th>Topic</th><th>Accuracy</th><th>Progress</th><th>✓ / ✗</th><th>Status</th></tr></thead>
                  <tbody>
                    {topicStats.map(({topic,total,attempted:att,correct:cor,wrong:wrg,pct,level})=>(
                      <tr key={topic} style={{cursor:'pointer'}} onClick={()=>setInsightDrill(d=>d?.value===topic&&d?.type==='topic'?null:{type:'topic',value:topic})} title={`Drill into ${topic} questions`}>
                        <td style={{fontWeight:700,color:'var(--ac)'}}>{topic} <span style={{fontSize:10,color:'var(--tx3)'}}>{insightDrill?.value===topic&&insightDrill?.type==='topic'?'▲':'▼'}</span></td>
                        <td style={{fontWeight:800,color:pct===null?'var(--tx3)':pct>=80?'var(--gr)':pct>=50?'var(--ye)':'var(--re)'}}>{pct!==null?`${pct}%`:'—'}</td>
                        <td><div className="sv-bar-wrap"><div className="sv-bar-fill" style={{width:`${pct??0}%`,background:pct===null?'var(--bd)':pct>=80?'var(--gr)':pct>=50?'var(--ye)':'var(--re)'}}/></div></td>
                        <td style={{color:'var(--tx3)',fontSize:12}}>{cor}✓ {wrg}✗ <span style={{opacity:.6}}>({att}/{total})</span></td>
                        <td>{level==='untested'?<span style={{color:'var(--tx3)',fontSize:11}}>Not tried</span>:<span className={`sv-badge ${level}`}>{level.charAt(0).toUpperCase()+level.slice(1)}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* DRILL-DOWN PANEL */}
                {insightDrill&&(()=>{
                  const drillQs = questions.filter(q => {
                    if (insightDrill.type === 'topic') return q.topic === insightDrill.value
                    if (insightDrill.type === 'diff')  return q.diff  === insightDrill.value
                    return false
                  }).sort((a,b) => {
                    // Sort by accuracy ascending (worst first)
                    const sa = dbStats[a.id]; const sb2 = dbStats[b.id]
                    const pa = sa ? (sa.times_correct||0)/Math.max(1,(sa.times_attempted||0)) : 0.5
                    const pb = sb2 ? (sb2.times_correct||0)/Math.max(1,(sb2.times_attempted||0)) : 0.5
                    return pa - pb
                  })
                  const label = insightDrill.value
                  return (
                    <div style={{marginBottom:24,background:'var(--card)',border:'1.5px solid var(--ac)',borderRadius:14,overflow:'hidden',animation:'sv-up .25s ease'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',background:'var(--as)',borderBottom:'1px solid var(--bd)'}}>
                        <div>
                          <span style={{fontWeight:800,fontSize:14,color:'var(--ac)'}}>{label}</span>
                          <span style={{fontSize:12,color:'var(--tx3)',marginLeft:10}}>{drillQs.length} questions</span>
                        </div>
                        <div style={{display:'flex',gap:8}}>
                          <button className="sv-bp" style={{padding:'6px 14px',fontSize:12}} onClick={()=>{setTopicF(insightDrill.type==='topic'?insightDrill.value:'all');setDiffF(insightDrill.type==='diff'?insightDrill.value:'all');setView('practice');setSidebarOpen(true);setInsightDrill(null)}}>
                            Practice These →
                          </button>
                          <button className="sv-bo" style={{padding:'6px 12px',fontSize:12}} onClick={()=>setInsightDrill(null)}>✕</button>
                        </div>
                      </div>
                      <div style={{maxHeight:400,overflowY:'auto'}}>
                        {drillQs.slice(0,50).map((q,i)=>{
                          const s=dbStats[q.id]
                          const tried=s?.times_attempted??0
                          const cor=s?.times_correct??0
                          const wrg=s?.times_wrong??0
                          const pct=tried>0?Math.round(cor/tried*100):null
                          return(
                            <div key={q.id} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'12px 18px',borderBottom:'1px solid var(--bd)',cursor:'pointer',transition:'background .1s'}}
                              onClick={()=>{setCurrentId(q.id);setSprValue('');setView('practice');setSidebarOpen(false);setInsightDrill(null)}}
                              onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background='var(--bg3)'}
                              onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background='transparent'}>
                              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,minWidth:28,paddingTop:2,flexShrink:0}}>
                                <span style={{fontFamily:'monospace',fontSize:10,color:'var(--tx3)'}}>{String(i+1).padStart(2,'0')}</span>
                                <span style={{width:6,height:6,borderRadius:'50%',background:q.diff==='easy'?'var(--ec)':q.diff==='medium'?'var(--mc)':'var(--hc)',display:'block'}}/>
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:11,color:'var(--tx3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',marginBottom:2}}>
                                  {SHORT[q.topic]||q.topic} · {q.diff} · {q.type==='spr'?'Open':'MC'}
                                </div>
                                <div style={{fontSize:13,color:'var(--tx)',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
                                  {q.q.replace(/\n/g,' ')}
                                </div>
                              </div>
                              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0}}>
                                {tried>0?(
                                  <>
                                    <span style={{fontSize:13,fontWeight:800,color:pct!==null?(pct>=80?'var(--gr)':pct>=50?'var(--ye)':'var(--re)'):'var(--tx3)'}}>{pct}%</span>
                                    <span style={{fontSize:10,color:'var(--tx3)'}}>{cor}✓ {wrg}✗</span>
                                  </>
                                ):(
                                  <span style={{fontSize:10,color:'var(--tx3)',padding:'2px 7px',background:'var(--bg3)',borderRadius:10}}>Not tried</span>
                                )}
                                {flagged.has(q.id)&&<span style={{fontSize:10}}>🚩</span>}
                              </div>
                            </div>
                          )
                        })}
                        {drillQs.length>50&&<div style={{padding:'12px 18px',fontSize:12,color:'var(--tx3)',textAlign:'center'}}>Showing 50 of {drillQs.length} questions</div>}
                      </div>
                    </div>
                  )
                })()}

                {mockAttempts.filter(a=>a.completed).length>0&&(
                  <>
                    <div className="sv-section-title">Mock Exam History</div>
                    <table className="sv-topic-table">
                      <thead><tr><th>Exam</th><th>Attempt</th><th>SAT Score</th><th>Raw</th><th>M1</th><th>M2</th><th>Date</th></tr></thead>
                      <tbody>
                        {mockAttempts.filter(a=>a.completed).map(a=>(
                          <tr key={a.id} style={{cursor:'pointer'}} onClick={()=>setView('mock')} title="View mock exam">
                            <td style={{fontSize:11,color:'var(--tx3)'}}>#{mockExams.findIndex(e=>e.id===a.exam_id)+1||'?'}</td>
                            <td style={{fontSize:11}}>Attempt {a.attempt_number}</td>
                            <td style={{fontWeight:800,color:'var(--ac)',fontSize:16}}>{a.sat_score}</td>
                            <td>{a.raw_score}/44</td>
                            <td>{a.m1_raw}/22</td>
                            <td>{a.m2_raw}/22</td>
                            <td style={{fontSize:11,color:'var(--tx3)'}}>{new Date(a.started_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── SESSION SETUP MODAL ── */}
      {showSetup&&(
        <div className="sv-modal-bg" onClick={()=>setShowSetup(false)}>
          <div className="sv-modal" onClick={e=>e.stopPropagation()}>
            <div className="sv-modal-title">⚙️ Session Setup</div>
            <div className="sv-modal-section">
              <div className="sv-modal-label">Mode</div>
              <div className="sv-modal-row">
                <button className={`sv-mopt${sessionMode==='open'?' on':''}`} onClick={()=>setSessionMode('open')}>📖 Open Ended</button>
                <button className={`sv-mopt${sessionMode==='timed'?' on':''}`} onClick={()=>setSessionMode('timed')}>⏱ Timed</button>
              </div>
            </div>
            {sessionMode==='timed'&&(
              <div className="sv-modal-section">
                <div className="sv-modal-label">Time Limit</div>
                <div className="sv-modal-row">
                  {[5,10,15,20,30].map(t=>(
                    <button key={t} className={`sv-mopt${timeChoice===t?' on':''}`} onClick={()=>setTimeChoice(t)}>{t} min</button>
                  ))}
                </div>
              </div>
            )}
            <div className="sv-modal-section">
              <div style={{fontSize:13,color:'var(--tx2)'}}>
                <b>{batchN} questions</b> · {topicF==='all'?'All Topics':topicF} · {diffF==='all'?'All Difficulties':diffF} · Source: {source}
                {sessionMode==='timed'?` · ${timeChoice} minutes`:''}
              </div>
            </div>
            <div className="sv-modal-actions">
              <button className="sv-bp" onClick={()=>generate()}>▶ Start Session</button>
              <button className="sv-bo" onClick={()=>setShowSetup(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION REPORT MODAL ── */}
      {sessionReport&&(
        <div className="sv-report-overlay" onClick={()=>setSessionReport(null)}>
          <div className="sv-report" onClick={e=>e.stopPropagation()}>
            <div className="sv-report-score">
              <div className="sv-report-pct" style={{color:sessionReport.session.score_pct!=null?(sessionReport.session.score_pct>=70?'var(--gr)':sessionReport.session.score_pct>=50?'var(--ye)':'var(--re)'):'var(--tx)'}}>
                {sessionReport.session.score_pct!=null?`${sessionReport.session.score_pct}%`:'—'}
              </div>
              <div className="sv-report-label">Session Score</div>
            </div>
            <div className="sv-report-grid">
              <div className="sv-rc green"><div className="rv">{sessionReport.session.correct}</div><div className="rl">Correct</div></div>
              <div className="sv-rc red"><div className="rv">{sessionReport.session.wrong}</div><div className="rl">Wrong</div></div>
              <div className="sv-rc yellow"><div className="rv">{sessionReport.session.unanswered}</div><div className="rl">Unanswered</div></div>
              <div className="sv-rc"><div className="rv">{sessionReport.questions.length}</div><div className="rl">Total</div></div>
            </div>
            <div style={{fontSize:13,color:'var(--tx3)',marginBottom:16}}>
              {Object.entries(sessionReport.results).filter(([,r])=>r.state==='wrong').length>0&&(
                <div style={{padding:'10px 14px',background:'var(--rs)',borderRadius:9,border:'1px solid var(--re)',color:'var(--re)',fontWeight:700}}>
                  🚩 {Object.entries(sessionReport.results).filter(([,r])=>r.state==='wrong').length} questions need review
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="sv-bp" onClick={()=>{setSessionReport(null);setShowSetup(true)}}>New Session</button>
              <button className="sv-bo" onClick={()=>setSessionReport(null)}>Review Answers</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {isBusy&&(
        <div className="sv-ov">
          <div className="sv-lc">
            <div className="sv-sp2"/>
            <div className="sv-lt">{loadMsg}</div>
            <div className="sv-ls">Powered by Google Gemini</div>
          </div>
        </div>
      )}
    </div>
  )
}
