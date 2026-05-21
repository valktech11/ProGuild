'use client'
import { useEffect, useRef, useState } from 'react'

const GOOGLE_KEY = 'AIzaSyDxW8wFQHbT2VkK55L4IlxfUuGAeV12wAE'

interface Question {
  id: string
  topic: string
  diff: string
  type: 'mc' | 'spr'
  q: string
  given?: string
  opts: string[]
  ans: number | string
  exp: string
  math: string
}

export default function SATVaultPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [questions, setQuestions] = useState<Question[]>([])
  const [attempted, setAttempted] = useState<Record<string, number | string>>({})
  const [correct, setCorrect] = useState<Record<string, boolean>>({})
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [topicF, setTopicF] = useState('all')
  const [diffF, setDiffF] = useState('all')
  const [batchN, setBatchN] = useState(5)
  const [isBusy, setIsBusy] = useState(false)
  const [qCounter, setQCounter] = useState(0)
  const [sprValue, setSprValue] = useState('')
  const [loadingMsg, setLoadingMsg] = useState('Generating questions…')

  const qCounterRef = useRef(0)

  // Load theme from localStorage
  useEffect(() => {
    try {
      const t = localStorage.getItem('sat_theme') as 'dark' | 'light' | null
      if (t) setTheme(t)
    } catch {}
  }, [])

  // Load saved stats
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sat_state')
      if (saved) {
        const d = JSON.parse(saved)
        setAttempted(d.attempted || {})
        setCorrect(d.correct || {})
        qCounterRef.current = d.qCounter || 0
        setQCounter(d.qCounter || 0)
      }
    } catch {}
  }, [])

  // Save stats
  useEffect(() => {
    try {
      localStorage.setItem('sat_state', JSON.stringify({ attempted, correct, qCounter }))
    } catch {}
  }, [attempted, correct, qCounter])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem('sat_theme', next) } catch {}
  }

  const filtered = () => questions.filter(q =>
    (topicF === 'all' || q.topic === topicF) &&
    (diffF === 'all' || q.diff === diffF)
  )

  const attemptsCount = Object.keys(attempted).length
  const correctCount = Object.values(correct).filter(Boolean).length
  const accuracy = attemptsCount > 0 ? Math.round(correctCount / attemptsCount * 100) : null

  const generateBatch = async () => {
    if (isBusy) return
    setIsBusy(true)
    setSprValue('')

    const topicStr = topicF === 'all'
      ? 'a varied mix of Algebra, Advanced Math, Problem Solving & Data Analysis, Geometry, Trigonometry'
      : topicF
    const diffStr = diffF === 'all' ? 'a mix of easy, medium, and hard' : diffF

    const msgs = [
      'Writing question stems…',
      'Crafting answer choices…',
      'Writing step-by-step solutions…',
      'Almost ready…',
    ]
    let mi = 0
    setLoadingMsg(msgs[0])
    const ticker = setInterval(() => {
      mi = (mi + 1) % msgs.length
      setLoadingMsg(msgs[mi])
    }, 2000)

    const prompt = `You are an expert SAT Math question writer. Generate exactly ${batchN} original SAT-style math questions.
Requirements:
- Topic: ${topicStr}
- Difficulty: ${diffStr}
- Mix of type "mc" (4 choices) and type "spr" (single numeric answer)
- Authentic SAT language, realistic contexts, strong distractors
- Complete worked solution and plain-English explanation per question
Return ONLY a raw JSON array — no markdown, no fences, no extra text.
Schema: [{"topic":"Algebra"|"Advanced Math"|"Problem Solving"|"Geometry"|"Trigonometry","diff":"easy"|"medium"|"hard","type":"mc"|"spr","q":"question text","given":"optional equation or empty string","opts":["A","B","C","D"],"ans":0,"exp":"explanation","math":"step by step"}]
For mc: opts has 4 strings, ans is integer 0-3. For spr: opts is [], ans is a string like "7" or "3.5".`

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_KEY}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.92, maxOutputTokens: 8192 }
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const clean = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
      const parsed: Omit<Question, 'id'>[] = JSON.parse(clean)

      const newQs: Question[] = parsed.map(q => {
        qCounterRef.current += 1
        return {
          ...q,
          id: `Q${String(qCounterRef.current).padStart(4, '0')}`,
          opts: q.opts || [],
          given: q.given || '',
        }
      })
      setQCounter(qCounterRef.current)
      setQuestions(prev => {
        const updated = [...prev, ...newQs]
        return updated
      })
      if (newQs.length > 0) {
        setCurrentId(newQs[0].id)
        setSprValue('')
      }
    } catch (err: unknown) {
      console.error('Generation error:', err)
    } finally {
      clearInterval(ticker)
      setIsBusy(false)
    }
  }

  const pick = (i: number) => {
    if (!currentId || attempted[currentId] !== undefined) return
    const q = questions.find(x => x.id === currentId)
    if (!q) return
    setAttempted(prev => ({ ...prev, [currentId]: i }))
    setCorrect(prev => ({ ...prev, [currentId]: i === Number(q.ans) }))
  }

  const submitSPR = () => {
    if (!currentId || attempted[currentId] !== undefined) return
    const q = questions.find(x => x.id === currentId)
    if (!q || !sprValue.trim()) return
    const val = sprValue.trim()
    const isCorrect = val === String(q.ans) || (!isNaN(parseFloat(String(q.ans))) && parseFloat(val) === parseFloat(String(q.ans)))
    setAttempted(prev => ({ ...prev, [currentId]: val }))
    setCorrect(prev => ({ ...prev, [currentId]: isCorrect }))
  }

  const goRelative = (dir: number) => {
    const vis = filtered()
    const idx = vis.findIndex(q => q.id === currentId)
    const next = vis[idx + dir]
    if (next) { setCurrentId(next.id); setSprValue('') }
  }

  const retryQ = () => {
    if (!currentId) return
    setAttempted(prev => { const n = { ...prev }; delete n[currentId]; return n })
    setCorrect(prev => { const n = { ...prev }; delete n[currentId]; return n })
    setSprValue('')
  }

  const vis = filtered()
  const currentQ = questions.find(x => x.id === currentId)
  const done = currentId ? attempted[currentId] !== undefined : false
  const isOk = currentId ? correct[currentId] : false
  const currentIdx = vis.findIndex(q => q.id === currentId)

  const css = `
[data-sv-theme="dark"] {
  --bg:#071418;--bg2:#0c1e24;--bg3:#122830;--bg4:#1a333d;
  --card:#0f2028;--card-hover:#142630;
  --border:#1e3d48;--border2:#2a5262;
  --text:#d8f5f0;--text2:#7db8b0;--text3:#3d7a74;
  --accent:#2dd4bf;--as:rgba(45,212,191,.14);--ag:rgba(45,212,191,.32);
  --green:#34d399;--gs:rgba(52,211,153,.12);
  --red:#fb7185;--rs:rgba(251,113,133,.12);
  --yellow:#fcd34d;--ys:rgba(252,211,77,.12);
  --easy-c:#34d399;--med-c:#fcd34d;--hard-c:#fb7185;
  --topbar:rgba(7,20,24,.95);--scroll:#1e3d48;
  --shadow:0 4px 28px rgba(0,0,0,.5);
}
[data-sv-theme="light"] {
  --bg:#fafaf8;--bg2:#f4f4f0;--bg3:#eaeae4;--bg4:#deded6;
  --card:#ffffff;--card-hover:#fefefe;
  --border:#e0e0d8;--border2:#c8c8be;
  --text:#1a2e2b;--text2:#3d6b64;--text3:#7a9e98;
  --accent:#0d9488;--as:rgba(13,148,136,.1);--ag:rgba(13,148,136,.22);
  --green:#059669;--gs:rgba(5,150,105,.09);
  --red:#dc2626;--rs:rgba(220,38,38,.08);
  --yellow:#b45309;--ys:rgba(180,83,9,.09);
  --easy-c:#059669;--med-c:#b45309;--hard-c:#dc2626;
  --topbar:rgba(250,250,248,.97);--scroll:#deded6;
  --shadow:0 4px 20px rgba(0,0,0,.08);
}
.sv-wrap{font-family:'Nunito',sans-serif;display:flex;flex-direction:column;height:100vh;overflow:hidden;background:var(--bg);color:var(--text);transition:background .3s,color .3s;font-size:15px;}
[data-sv-theme="dark"] .sv-wrap{background:radial-gradient(ellipse 70% 50% at 8% 15%,rgba(45,212,191,.07) 0%,transparent 60%),radial-gradient(ellipse 55% 45% at 92% 80%,rgba(103,232,249,.06) 0%,transparent 55%),#071418;}
.sv-wrap *{box-sizing:border-box;}
.sv-wrap ::-webkit-scrollbar{width:4px;}
.sv-wrap ::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:4px;}
/* TOPBAR */
.sv-top{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:58px;background:var(--topbar);backdrop-filter:blur(16px);border-bottom:1px solid var(--border);flex-shrink:0;gap:12px;}
.sv-brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:900;letter-spacing:-.3px;white-space:nowrap;}
.sv-brand-icon{width:33px;height:33px;background:var(--accent);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 0 14px var(--ag);flex-shrink:0;}
.sv-brand em{color:var(--accent);font-style:normal;}
.sv-brand sub{font-size:12px;color:var(--text3);font-family:monospace;margin-left:2px;}
.sv-top-right{display:flex;align-items:center;gap:8px;}
.sv-stats{display:flex;gap:5px;}
.sv-pill{display:flex;flex-direction:column;align-items:center;padding:3px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;min-width:56px;}
.sv-pill .sv-n{font-size:17px;font-weight:800;color:var(--accent);line-height:1.1;font-variant-numeric:tabular-nums;}
.sv-pill .sv-l{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);}
.sv-theme-btn{width:38px;height:38px;border-radius:9px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .2s;flex-shrink:0;}
.sv-theme-btn:hover{background:var(--bg4);border-color:var(--accent);}
/* PBAR */
.sv-pbar{height:3px;background:var(--border);flex-shrink:0;}
.sv-pbar-fill{height:100%;background:linear-gradient(90deg,#2dd4bf,#67e8f9,#34d399);background-size:200%;animation:sv-shimmer 3s linear infinite;transition:width .5s;}
@keyframes sv-shimmer{0%{background-position:0%}100%{background-position:200%}}
/* BODY */
.sv-body{display:flex;flex:1;overflow:hidden;}
/* SIDEBAR */
.sv-sidebar{width:282px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--bg2);overflow:hidden;}
.sv-controls{padding:15px;display:flex;flex-direction:column;gap:13px;border-bottom:1px solid var(--border);overflow-y:auto;flex-shrink:0;}
.sv-clabel{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3);font-weight:700;margin-bottom:4px;}
.sv-topic-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.sv-btn{padding:8px 6px;border:1.5px solid var(--border);border-radius:9px;background:var(--bg3);color:var(--text2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center;line-height:1.3;font-family:'Nunito',sans-serif;}
.sv-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--as);}
.sv-btn.on{background:var(--as);border-color:var(--accent);color:var(--accent);}
.sv-row{display:flex;gap:5px;}
.sv-pill-btn{flex:1;padding:8px 0;border:1.5px solid var(--border);border-radius:9px;background:var(--bg3);color:var(--text3);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;text-align:center;font-family:'Nunito',sans-serif;}
.sv-pill-btn:hover{border-color:var(--accent);color:var(--accent);}
.sv-pill-btn.on{background:var(--as);border-color:var(--accent);color:var(--accent);}
.sv-pill-btn.on-easy{background:var(--gs);border-color:var(--easy-c);color:var(--easy-c);}
.sv-pill-btn.on-med{background:var(--ys);border-color:var(--med-c);color:var(--med-c);}
.sv-pill-btn.on-hard{background:var(--rs);border-color:var(--hard-c);color:var(--hard-c);}
.sv-gen-btn{width:100%;padding:13px;background:var(--accent);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px var(--ag);font-family:'Nunito',sans-serif;}
.sv-gen-btn:hover:not(:disabled){opacity:.9;transform:translateY(-1px);box-shadow:0 6px 22px var(--ag);}
.sv-gen-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
.sv-cost{text-align:center;font-size:11px;color:var(--text3);font-family:monospace;}
.sv-cost b{color:var(--green);}
/* QLIST */
.sv-qlist{flex:1;overflow-y:auto;}
.sv-qrow{display:flex;align-items:flex-start;gap:9px;padding:11px 15px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s;}
.sv-qrow:hover{background:var(--card-hover);}
.sv-qrow.active{background:var(--card);border-left:3px solid var(--accent);padding-left:12px;}
.sv-qrow-left{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:26px;padding-top:2px;flex-shrink:0;}
.sv-qrow-num{font-family:monospace;font-size:10px;color:var(--text3);}
.sv-dot{width:7px;height:7px;border-radius:50%;}
.sv-dot.easy{background:var(--easy-c);}
.sv-dot.medium{background:var(--med-c);}
.sv-dot.hard{background:var(--hard-c);}
.sv-qrow-body{flex:1;min-width:0;}
.sv-qrow-meta{font-size:10px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.7px;margin-bottom:2px;}
.sv-qrow-preview{font-size:12px;color:var(--text);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:500;}
.sv-qrow-check{font-size:14px;flex-shrink:0;padding-top:1px;}
.sv-list-empty{padding:36px 18px;text-align:center;color:var(--text3);font-size:13px;line-height:2;}
.sv-list-empty span{font-size:32px;display:block;margin-bottom:8px;}
/* DETAIL */
.sv-detail{flex:1;overflow-y:auto;background:var(--bg);}
/* WELCOME */
.sv-welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:48px 32px;text-align:center;gap:18px;}
.sv-welcome-icon{font-size:56px;line-height:1;}
.sv-welcome h1{font-size:28px;font-weight:900;line-height:1.2;letter-spacing:-.5px;}
.sv-welcome h1 em{color:var(--accent);font-style:normal;}
.sv-welcome p{color:var(--text2);font-size:15px;max-width:380px;line-height:1.7;}
.sv-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;max-width:500px;width:100%;margin-top:6px;}
.sv-step{background:var(--card);border:1.5px solid var(--border);border-radius:13px;padding:16px 12px;text-align:center;}
.sv-step-n{width:34px;height:34px;border-radius:50%;background:var(--as);border:2px solid var(--accent);color:var(--accent);font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;margin:0 auto 9px;}
.sv-step-t{font-size:12px;color:var(--text2);line-height:1.6;font-weight:600;}
/* QVIEW */
.sv-qview{padding:30px 38px;max-width:740px;animation:sv-up .3s ease;}
@keyframes sv-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.sv-chips{display:flex;align-items:center;gap:7px;margin-bottom:20px;flex-wrap:wrap;}
.sv-chip{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid;letter-spacing:.3px;}
.sv-chip-id{color:var(--text3);border-color:var(--border);background:transparent;font-family:monospace;}
.sv-chip-topic{color:var(--accent);border-color:var(--accent);background:var(--as);}
.sv-chip-easy{color:var(--easy-c);border-color:var(--easy-c);background:var(--gs);}
.sv-chip-medium{color:var(--med-c);border-color:var(--med-c);background:var(--ys);}
.sv-chip-hard{color:var(--hard-c);border-color:var(--hard-c);background:var(--rs);}
.sv-chip-type{color:var(--text3);border-color:var(--border);background:var(--bg3);font-size:10px;}
.sv-nav-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.sv-nav-info{font-size:13px;color:var(--text3);font-weight:700;}
.sv-nav-arrows{display:flex;gap:5px;}
.sv-arrow{width:30px;height:30px;border-radius:7px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:'Nunito',sans-serif;}
.sv-arrow:hover{background:var(--as);border-color:var(--accent);color:var(--accent);}
.sv-qtext{font-size:17px;line-height:1.85;font-weight:500;color:var(--text);margin-bottom:22px;white-space:pre-wrap;}
.sv-given{background:var(--bg3);border:1.5px solid var(--border);border-left:4px solid var(--accent);border-radius:0 11px 11px 0;padding:13px 17px;font-family:monospace;font-size:14px;color:var(--yellow);line-height:2;white-space:pre-wrap;margin-bottom:20px;}
/* OPTIONS */
.sv-opts{display:flex;flex-direction:column;gap:9px;margin-bottom:22px;}
.sv-opt{display:flex;align-items:flex-start;gap:13px;padding:13px 16px;border:1.5px solid var(--border);border-radius:11px;cursor:pointer;background:var(--card);transition:all .18s;user-select:none;}
.sv-opt:hover:not(.done){border-color:var(--accent);background:var(--as);transform:translateX(3px);}
.sv-opt.cor{border-color:var(--green);background:var(--gs);cursor:default;transform:none;}
.sv-opt.wrg{border-color:var(--red);background:var(--rs);cursor:default;transform:none;}
.sv-opt.done{cursor:default;}
.sv-opt.neutral{cursor:default;opacity:.55;}
.sv-opt-badge{width:28px;height:28px;border-radius:50%;background:var(--bg3);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;}
.sv-opt.cor .sv-opt-badge{background:var(--green);border-color:var(--green);color:#fff;}
.sv-opt.wrg .sv-opt-badge{background:var(--red);border-color:var(--red);color:#fff;}
.sv-opt-txt{font-size:15px;line-height:1.55;font-weight:500;padding-top:1px;flex:1;}
/* SPR */
.sv-spr{margin-bottom:22px;}
.sv-spr-lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3);font-weight:700;margin-bottom:9px;}
.sv-spr-input{background:var(--card);border:2px solid var(--border);border-radius:11px;padding:12px 18px;color:var(--text);font-family:monospace;font-size:20px;font-weight:500;width:220px;outline:none;transition:border-color .15s;}
.sv-spr-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--as);}
.sv-spr-input.cor{border-color:var(--green);}
.sv-spr-input.wrg{border-color:var(--red);}
/* ACTIONS */
.sv-acts{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:22px;align-items:center;}
.sv-btn-primary{padding:10px 26px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;transition:all .15s;box-shadow:0 3px 12px var(--ag);font-family:'Nunito',sans-serif;}
.sv-btn-primary:hover{opacity:.87;transform:translateY(-1px);}
.sv-btn-outline{padding:10px 18px;background:transparent;color:var(--text2);border:1.5px solid var(--border);border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;font-family:'Nunito',sans-serif;}
.sv-btn-outline:hover{border-color:var(--accent);color:var(--accent);background:var(--as);}
/* RESULT */
.sv-result{padding:13px 16px;border-radius:11px;font-size:15px;font-weight:700;margin-bottom:18px;border:1.5px solid;display:flex;align-items:center;gap:10px;animation:sv-up .2s ease;}
.sv-result.cor{background:var(--gs);color:var(--green);border-color:var(--green);}
.sv-result.wrg{background:var(--rs);color:var(--red);border-color:var(--red);}
.sv-result-icon{font-size:19px;}
/* EXPLANATION */
.sv-exp{background:var(--card);border:1.5px solid var(--border);border-radius:15px;overflow:hidden;animation:sv-up .25s ease;}
.sv-exp-head{display:flex;align-items:center;gap:9px;padding:13px 18px;background:var(--bg3);border-bottom:1px solid var(--border);}
.sv-exp-title{font-size:11px;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;color:var(--accent);}
.sv-exp-body{padding:17px 19px;}
.sv-exp-text{font-size:14px;line-height:1.85;color:var(--text);margin-bottom:12px;font-weight:500;}
.sv-exp-math{background:var(--bg);border:1.5px solid var(--border);border-radius:9px;padding:13px 16px;font-family:monospace;font-size:13px;color:var(--yellow);white-space:pre-wrap;line-height:2;}
/* LOADING */
.sv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:999;}
.sv-loader{background:var(--card);border:1.5px solid var(--border);border-radius:18px;padding:34px 46px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:13px;box-shadow:var(--shadow);min-width:270px;}
.sv-spin{width:46px;height:46px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:sv-spin .75s linear infinite;}
@keyframes sv-spin{to{transform:rotate(360deg)}}
.sv-loader-title{font-size:16px;font-weight:800;color:var(--text);}
.sv-loader-sub{font-size:11px;color:var(--text3);font-family:monospace;}
@media(max-width:680px){
  .sv-wrap{height:auto;min-height:100vh;overflow:auto;}
  .sv-body{flex-direction:column;overflow:visible;}
  .sv-sidebar{width:100%;border-right:none;border-bottom:1px solid var(--border);}
  .sv-detail{overflow:visible;}
  .sv-qview{padding:18px;}
  .sv-stats{display:none;}
  .sv-steps{grid-template-columns:1fr;}
}
  `

  const diffOnClass = (v: string) => {
    if (v === 'easy') return 'sv-pill-btn on-easy'
    if (v === 'medium') return 'sv-pill-btn on-med'
    if (v === 'hard') return 'sv-pill-btn on-hard'
    return 'sv-pill-btn on'
  }

  const estCost = ((0.0006 * batchN) / 10).toFixed(4)

  return (
    <div data-sv-theme={theme}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      <div className="sv-wrap">

        {/* TOPBAR */}
        <div className="sv-top">
          <div className="sv-brand">
            <div className="sv-brand-icon">🏆</div>
            SAT Math <em>Vault</em><sub>∞</sub>
          </div>
          <div className="sv-top-right">
            <div className="sv-stats">
              <div className="sv-pill"><div className="sv-n">{questions.length}</div><div className="sv-l">Generated</div></div>
              <div className="sv-pill"><div className="sv-n">{attemptsCount}</div><div className="sv-l">Attempted</div></div>
              <div className="sv-pill"><div className="sv-n">{correctCount}</div><div className="sv-l">Correct</div></div>
              <div className="sv-pill"><div className="sv-n">{accuracy !== null ? `${accuracy}%` : '—'}</div><div className="sv-l">Accuracy</div></div>
            </div>
            <button className="sv-theme-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
        <div className="sv-pbar">
          <div className="sv-pbar-fill" style={{ width: `${accuracy ?? 0}%` }} />
        </div>

        {/* BODY */}
        <div className="sv-body">

          {/* SIDEBAR */}
          <div className="sv-sidebar">
            <div className="sv-controls">

              {/* Topic */}
              <div>
                <div className="sv-clabel">Topic</div>
                <div className="sv-topic-grid">
                  {[
                    { v: 'all', l: 'All Topics' },
                    { v: 'Algebra', l: 'Algebra' },
                    { v: 'Advanced Math', l: 'Advanced Math' },
                    { v: 'Problem Solving', l: 'Data & Stats' },
                    { v: 'Geometry', l: 'Geometry' },
                    { v: 'Trigonometry', l: 'Trigonometry' },
                  ].map(({ v, l }) => (
                    <button key={v} className={`sv-btn${topicF === v ? ' on' : ''}`} onClick={() => setTopicF(v)}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <div className="sv-clabel">Difficulty</div>
                <div className="sv-row">
                  {[
                    { v: 'all', l: 'All' },
                    { v: 'easy', l: 'Easy' },
                    { v: 'medium', l: 'Med' },
                    { v: 'hard', l: 'Hard' },
                  ].map(({ v, l }) => (
                    <button
                      key={v}
                      className={diffF === v ? diffOnClass(v) : 'sv-pill-btn'}
                      onClick={() => setDiffF(v)}
                    >{l}</button>
                  ))}
                </div>
              </div>

              {/* Batch */}
              <div>
                <div className="sv-clabel">Questions per Batch</div>
                <div className="sv-row">
                  {[5, 10, 20, 30].map(n => (
                    <button key={n} className={batchN === n ? 'sv-pill-btn on' : 'sv-pill-btn'} onClick={() => setBatchN(n)}>{n}</button>
                  ))}
                </div>
              </div>

              <button className="sv-gen-btn" onClick={generateBatch} disabled={isBusy}>
                <span>{isBusy ? '⏳' : '⚡'}</span>
                <span>{isBusy ? 'Generating…' : 'Generate Questions'}</span>
              </button>
              <div className="sv-cost">Est. cost per batch: <b>~${estCost}</b></div>
            </div>

            {/* Question list */}
            <div className="sv-qlist">
              {vis.length === 0 ? (
                <div className="sv-list-empty">
                  <span>{questions.length > 0 ? '🔍' : '📚'}</span>
                  {questions.length > 0
                    ? 'No questions match this filter.'
                    : <><b style={{ color: 'var(--accent)' }}>Generate Questions</b> to start.</>}
                </div>
              ) : vis.map((q, i) => {
                const isDone = attempted[q.id] !== undefined
                const isRight = correct[q.id]
                const short: Record<string, string> = { 'Problem Solving': 'Data', 'Advanced Math': 'Adv Math' }
                return (
                  <div
                    key={q.id}
                    className={`sv-qrow${currentId === q.id ? ' active' : ''}`}
                    onClick={() => { setCurrentId(q.id); setSprValue('') }}
                  >
                    <div className="sv-qrow-left">
                      <span className="sv-qrow-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`sv-dot ${q.diff}`} />
                    </div>
                    <div className="sv-qrow-body">
                      <div className="sv-qrow-meta">{short[q.topic] || q.topic} · {q.diff}</div>
                      <div className="sv-qrow-preview">{q.q.replace(/\n/g, ' ')}</div>
                    </div>
                    {isDone && <span className="sv-qrow-check">{isRight ? '✅' : '❌'}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* DETAIL */}
          <div className="sv-detail">
            {!currentQ ? (
              <div className="sv-welcome">
                <div className="sv-welcome-icon">🏆</div>
                <h1>Infinite SAT Math<br /><em>Practice Engine</em></h1>
                <p>AI-generated SAT-style questions, forever. Pick a topic and difficulty, then hit Generate.</p>
                <div className="sv-steps">
                  <div className="sv-step"><div className="sv-step-n">1</div><div className="sv-step-t">Choose topic &amp; difficulty in the sidebar</div></div>
                  <div className="sv-step"><div className="sv-step-n">2</div><div className="sv-step-t">Hit ⚡ Generate Questions</div></div>
                  <div className="sv-step"><div className="sv-step-n">3</div><div className="sv-step-t">Answer → review solutions → repeat</div></div>
                </div>
              </div>
            ) : (
              <div className="sv-qview">
                {/* Chips */}
                <div className="sv-chips">
                  <span className="sv-chip sv-chip-id">{currentQ.id}</span>
                  <span className="sv-chip sv-chip-topic">{currentQ.topic}</span>
                  <span className={`sv-chip sv-chip-${currentQ.diff}`}>{currentQ.diff}</span>
                  <span className="sv-chip sv-chip-type">{currentQ.type === 'spr' ? 'Open Response' : 'Multiple Choice'}</span>
                </div>

                {/* Nav */}
                <div className="sv-nav-row">
                  <span className="sv-nav-info">Question {currentIdx + 1} of {vis.length}</span>
                  <div className="sv-nav-arrows">
                    <button className="sv-arrow" onClick={() => goRelative(-1)}>←</button>
                    <button className="sv-arrow" onClick={() => goRelative(1)}>→</button>
                  </div>
                </div>

                {/* Question text */}
                <div className="sv-qtext">{currentQ.q}</div>
                {currentQ.given && <div className="sv-given">{currentQ.given}</div>}

                {/* MC or SPR */}
                {currentQ.type === 'mc' ? (
                  <div className="sv-opts">
                    {currentQ.opts.map((opt, i) => {
                      let cls = 'sv-opt'
                      if (done) {
                        if (i === Number(currentQ.ans)) cls += ' cor done'
                        else if (attempted[currentId!] === i) cls += ' wrg done'
                        else cls += ' neutral done'
                      }
                      return (
                        <div key={i} className={cls} onClick={() => !done && pick(i)}>
                          <div className="sv-opt-badge">{'ABCD'[i]}</div>
                          <div className="sv-opt-txt">{opt}</div>
                          {done && i === Number(currentQ.ans) && <span style={{ marginLeft: 'auto', fontSize: 16 }}>✓</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="sv-spr">
                    <div className="sv-spr-lbl">📝 Enter Your Answer</div>
                    <input
                      className={`sv-spr-input${done ? (isOk ? ' cor' : ' wrg') : ''}`}
                      type="text"
                      placeholder="Type answer here…"
                      value={done ? String(currentQ.ans) : sprValue}
                      disabled={done}
                      onChange={e => setSprValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitSPR()}
                    />
                  </div>
                )}

                {/* Result banner */}
                {done && (
                  <div className={`sv-result ${isOk ? 'cor' : 'wrg'}`}>
                    <span className="sv-result-icon">{isOk ? '🎉' : '❌'}</span>
                    <span>
                      {isOk ? 'Correct! Great work.' : (
                        <>Not quite — correct answer: <strong>{currentQ.type === 'mc' ? currentQ.opts[Number(currentQ.ans)] : currentQ.ans}</strong></>
                      )}
                    </span>
                  </div>
                )}

                {/* Actions */}
                {done ? (
                  <div className="sv-acts">
                    <button className="sv-btn-primary" onClick={() => goRelative(1)}>Next Question →</button>
                    <button className="sv-btn-outline" onClick={retryQ}>↺ Retry</button>
                  </div>
                ) : currentQ.type === 'spr' ? (
                  <div className="sv-acts">
                    <button className="sv-btn-primary" onClick={submitSPR}>Submit Answer</button>
                    <button className="sv-btn-outline" onClick={() => goRelative(1)}>Skip →</button>
                  </div>
                ) : null}

                {/* Explanation */}
                {done && (
                  <div className="sv-exp">
                    <div className="sv-exp-head">
                      <span style={{ fontSize: 17 }}>💡</span>
                      <span className="sv-exp-title">Full Solution &amp; Explanation</span>
                    </div>
                    <div className="sv-exp-body">
                      <div className="sv-exp-text">{currentQ.exp}</div>
                      <div className="sv-exp-math">{currentQ.math}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isBusy && (
        <div className="sv-overlay">
          <div className="sv-loader">
            <div className="sv-spin" />
            <div className="sv-loader-title">{loadingMsg}</div>
            <div className="sv-loader-sub">Powered by Google Gemini</div>
          </div>
        </div>
      )}
    </div>
  )
}
