'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

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

const TOPICS = [
  { v: 'all', l: 'All Topics' },
  { v: 'Algebra', l: 'Algebra' },
  { v: 'Advanced Math', l: 'Advanced Math' },
  { v: 'Problem Solving', l: 'Data & Stats' },
  { v: 'Geometry', l: 'Geometry' },
  { v: 'Trigonometry', l: 'Trigonometry' },
]

const SHORT_TOPIC: Record<string,string> = {
  'Problem Solving': 'Data',
  'Advanced Math': 'Adv Math',
}

export default function SATVaultPage() {
  const [theme,      setTheme]      = useState<'dark'|'light'>('dark')
  const [questions,  setQuestions]  = useState<Question[]>([])
  const [attempted,  setAttempted]  = useState<Record<string, number|string>>({})
  const [correct,    setCorrect]    = useState<Record<string, boolean>>({})
  const [currentId,  setCurrentId]  = useState<string|null>(null)
  const [topicF,     setTopicF]     = useState('all')
  const [diffF,      setDiffF]      = useState('all')
  const [batchN,     setBatchN]     = useState(5)
  const [isBusy,     setIsBusy]     = useState(false)
  const [sprValue,   setSprValue]   = useState('')
  const [loadMsg,    setLoadMsg]    = useState('Generating questions…')
  const [error,      setError]      = useState<string|null>(null)
  const qCounter = useRef(0)

  /* ── persist ── */
  useEffect(() => {
    try {
      const t = localStorage.getItem('sat_theme') as 'dark'|'light'|null
      if (t) setTheme(t)
      const s = localStorage.getItem('sat_state_v2')
      if (s) {
        const d = JSON.parse(s)
        setAttempted(d.attempted || {})
        setCorrect(d.correct || {})
        qCounter.current = d.qc || 0
      }
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('sat_state_v2', JSON.stringify({ attempted, correct, qc: qCounter.current })) } catch {}
  }, [attempted, correct])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem('sat_theme', next) } catch {}
  }

  /* ── filter ── */
  const filtered = useCallback(() =>
    questions.filter(q =>
      (topicF === 'all' || q.topic === topicF) &&
      (diffF  === 'all' || q.diff  === diffF)
    ), [questions, topicF, diffF])

  const vis      = filtered()
  const currentQ = questions.find(x => x.id === currentId) ?? null
  const isDone   = currentId ? attempted[currentId] !== undefined : false
  const isOk     = currentId ? !!correct[currentId] : false
  const visIdx   = vis.findIndex(q => q.id === currentId)
  const attCount = Object.keys(attempted).length
  const corCount = Object.values(correct).filter(Boolean).length
  const accuracy = attCount > 0 ? Math.round(corCount / attCount * 100) : null
  const estCost  = ((0.0006 * batchN) / 10).toFixed(4)

  /* ── generate ── */
  const generate = async () => {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    setSprValue('')

    const topicStr = topicF === 'all'
      ? 'a varied mix of Algebra, Advanced Math, Problem Solving & Data Analysis, Geometry, Trigonometry'
      : topicF
    const diffStr = diffF === 'all' ? 'a mix of easy, medium, and hard' : diffF

    const msgs = ['Writing question stems…','Crafting answer choices…','Writing step-by-step solutions…','Almost ready…']
    let mi = 0
    setLoadMsg(msgs[0])
    const ticker = setInterval(() => { mi = (mi+1) % msgs.length; setLoadMsg(msgs[mi]) }, 2000)

    const prompt = `You are an expert SAT Math question writer. Generate exactly ${batchN} original SAT-style math questions.
Requirements:
- Topic: ${topicStr}
- Difficulty: ${diffStr}
- Mix of type "mc" (4 choices) and type "spr" (single numeric answer)
- Authentic SAT language, realistic contexts, strong distractors
- Complete worked solution and plain-English explanation per question
Return ONLY a raw JSON array. No markdown, no fences, no extra text.
Schema: [{"topic":"Algebra"|"Advanced Math"|"Problem Solving"|"Geometry"|"Trigonometry","diff":"easy"|"medium"|"hard","type":"mc"|"spr","q":"question text","given":"optional or empty","opts":["A","B","C","D"],"ans":0,"exp":"explanation 2-3 sentences","math":"step by step one per line"}]
For mc: opts has 4 strings, ans is integer 0-3.
For spr: opts is [], ans is a numeric string like "7" or "3.5".`

    try {
      const res = await fetch(`${window.location.origin}/api/sat-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed')

      const raw   = data.text || ''
      const clean = raw.replace(/^```(?:json)?\s*/m,'').replace(/\s*```\s*$/m,'').trim()
      const parsed: Omit<Question,'id'>[] = JSON.parse(clean)

      const newQs: Question[] = parsed.map(q => {
        qCounter.current += 1
        return { ...q, id: `Q${String(qCounter.current).padStart(4,'0')}`, opts: q.opts || [], given: q.given || '' }
      })

      setQuestions(prev => [...prev, ...newQs])
      if (newQs.length > 0) { setCurrentId(newQs[0].id); setSprValue('') }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      console.error('Generate error:', msg)
    } finally {
      clearInterval(ticker)
      setIsBusy(false)
    }
  }

  /* ── answer ── */
  const pick = (i: number) => {
    if (!currentId || attempted[currentId] !== undefined || !currentQ) return
    setAttempted(p => ({ ...p, [currentId]: i }))
    setCorrect(p => ({ ...p, [currentId]: i === Number(currentQ.ans) }))
  }

  const submitSPR = () => {
    if (!currentId || attempted[currentId] !== undefined || !currentQ || !sprValue.trim()) return
    const val = sprValue.trim()
    const ok  = val === String(currentQ.ans) || (!isNaN(parseFloat(String(currentQ.ans))) && parseFloat(val) === parseFloat(String(currentQ.ans)))
    setAttempted(p => ({ ...p, [currentId]: val }))
    setCorrect(p => ({ ...p, [currentId]: ok }))
  }

  const goRel = (dir: number) => {
    const next = vis[visIdx + dir]
    if (next) { setCurrentId(next.id); setSprValue('') }
  }

  const retry = () => {
    if (!currentId) return
    setAttempted(p => { const n={...p}; delete n[currentId]; return n })
    setCorrect(p =>   { const n={...p}; delete n[currentId]; return n })
    setSprValue('')
  }

  const selectQ = (id: string) => { setCurrentId(id); setSprValue('') }

  /* ── styles ── */
  const css = `
[data-sv="${theme}"] {
  ${theme === 'dark' ? `
  --bg:#071418;--bg2:#0c1e24;--bg3:#122830;--bg4:#1a333d;
  --card:#0f2028;--ch:#142630;
  --bd:#1e3d48;--bd2:#2a5262;
  --tx:#d8f5f0;--tx2:#7db8b0;--tx3:#3d7a74;
  --ac:#2dd4bf;--as:rgba(45,212,191,.14);--ag:rgba(45,212,191,.32);
  --gr:#34d399;--gs:rgba(52,211,153,.12);
  --re:#fb7185;--rs:rgba(251,113,133,.12);
  --ye:#fcd34d;--ys:rgba(252,211,77,.12);
  --ec:#34d399;--mc:#fcd34d;--hc:#fb7185;
  --tb:rgba(7,20,24,.95);--sc:#1e3d48;
  --sh:0 4px 28px rgba(0,0,0,.5);
  ` : `
  --bg:#fafaf8;--bg2:#f4f4f0;--bg3:#eaeae4;--bg4:#deded6;
  --card:#ffffff;--ch:#fefefe;
  --bd:#e0e0d8;--bd2:#c8c8be;
  --tx:#1a2e2b;--tx2:#3d6b64;--tx3:#7a9e98;
  --ac:#0d9488;--as:rgba(13,148,136,.1);--ag:rgba(13,148,136,.22);
  --gr:#059669;--gs:rgba(5,150,105,.09);
  --re:#dc2626;--rs:rgba(220,38,38,.08);
  --ye:#b45309;--ys:rgba(180,83,9,.09);
  --ec:#059669;--mc:#b45309;--hc:#dc2626;
  --tb:rgba(250,250,248,.97);--sc:#deded6;
  --sh:0 4px 20px rgba(0,0,0,.08);
  `}
}
.sv{font-family:'Nunito',sans-serif;display:flex;flex-direction:column;height:100vh;overflow:hidden;color:var(--tx);font-size:15px;line-height:1.5;}
${theme==='dark'
  ? '.sv{background:radial-gradient(ellipse 70% 50% at 8% 15%,rgba(45,212,191,.07) 0%,transparent 60%),radial-gradient(ellipse 55% 45% at 92% 80%,rgba(103,232,249,.06) 0%,transparent 55%),#071418;}'
  : '.sv{background:#fafaf8;}'}
.sv *{box-sizing:border-box;}
.sv ::-webkit-scrollbar{width:4px;} .sv ::-webkit-scrollbar-thumb{background:var(--sc);border-radius:4px;}
/* top */
.sv-top{display:flex;align-items:center;justify-content:space-between;padding:0 22px;height:56px;background:var(--tb);backdrop-filter:blur(16px);border-bottom:1px solid var(--bd);flex-shrink:0;gap:12px;}
.sv-brand{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:900;letter-spacing:-.3px;white-space:nowrap;}
.sv-brand-ico{width:32px;height:32px;background:var(--ac);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 14px var(--ag);flex-shrink:0;}
.sv-brand em{color:var(--ac);font-style:normal;}
.sv-brand sub{font-size:12px;color:var(--tx3);font-family:monospace;margin-left:2px;}
.sv-tr{display:flex;align-items:center;gap:7px;}
.sv-stats{display:flex;gap:5px;}
.sv-sp{display:flex;flex-direction:column;align-items:center;padding:3px 11px;background:var(--bg3);border:1px solid var(--bd);border-radius:9px;min-width:54px;}
.sv-sp .n{font-size:16px;font-weight:800;color:var(--ac);line-height:1.1;font-variant-numeric:tabular-nums;}
.sv-sp .l{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);}
.sv-tb{width:37px;height:37px;border-radius:9px;background:var(--bg3);border:1px solid var(--bd);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;transition:all .2s;flex-shrink:0;}
.sv-tb:hover{background:var(--bg4);border-color:var(--ac);}
/* pbar */
.sv-pb{height:3px;background:var(--bd);flex-shrink:0;}
.sv-pbf{height:100%;background:linear-gradient(90deg,#2dd4bf,#67e8f9,#34d399);background-size:200%;animation:sv-sh 3s linear infinite;transition:width .5s;}
@keyframes sv-sh{0%{background-position:0%}100%{background-position:200%}}
/* body */
.sv-body{display:flex;flex:1;overflow:hidden;}
/* sidebar */
.sv-side{width:278px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--bd);background:var(--bg2);overflow:hidden;}
.sv-ctrl{padding:14px;display:flex;flex-direction:column;gap:12px;border-bottom:1px solid var(--bd);overflow-y:auto;flex-shrink:0;}
.sv-cl{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--tx3);font-weight:700;margin-bottom:3px;}
.sv-tg{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
.sb{padding:8px 5px;border:1.5px solid var(--bd);border-radius:9px;background:var(--bg3);color:var(--tx2);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center;line-height:1.3;font-family:'Nunito',sans-serif;}
.sb:hover{border-color:var(--ac);color:var(--ac);background:var(--as);}
.sb.on{background:var(--as);border-color:var(--ac);color:var(--ac);}
.sv-row{display:flex;gap:4px;}
.pb{flex:1;padding:7px 0;border:1.5px solid var(--bd);border-radius:9px;background:var(--bg3);color:var(--tx3);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;text-align:center;font-family:'Nunito',sans-serif;}
.pb:hover{border-color:var(--ac);color:var(--ac);}
.pb.on{background:var(--as);border-color:var(--ac);color:var(--ac);}
.pb.oe{background:var(--gs);border-color:var(--ec);color:var(--ec);}
.pb.om{background:var(--ys);border-color:var(--mc);color:var(--mc);}
.pb.oh{background:var(--rs);border-color:var(--hc);color:var(--hc);}
.sv-gen{width:100%;padding:12px;background:var(--ac);color:#fff;border:none;border-radius:11px;font-size:15px;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 16px var(--ag);font-family:'Nunito',sans-serif;}
.sv-gen:hover:not(:disabled){opacity:.9;transform:translateY(-1px);box-shadow:0 6px 22px var(--ag);}
.sv-gen:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none;}
.sv-cost{text-align:center;font-size:11px;color:var(--tx3);font-family:monospace;}
.sv-cost b{color:var(--gr);}
.sv-err{padding:8px 12px;background:var(--rs);border:1px solid var(--re);border-radius:8px;font-size:12px;color:var(--re);font-weight:600;}
/* qlist */
.sv-ql{flex:1;overflow-y:auto;}
.sv-qr{display:flex;align-items:flex-start;gap:9px;padding:11px 14px;border-bottom:1px solid var(--bd);cursor:pointer;transition:background .1s;}
.sv-qr:hover{background:var(--ch);}
.sv-qr.act{background:var(--card);border-left:3px solid var(--ac);padding-left:11px;}
.sv-ql-left{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:25px;padding-top:2px;flex-shrink:0;}
.sv-qn{font-family:monospace;font-size:10px;color:var(--tx3);}
.dd{width:7px;height:7px;border-radius:50%;}
.dd.easy{background:var(--ec);} .dd.medium{background:var(--mc);} .dd.hard{background:var(--hc);}
.sv-qb{flex:1;min-width:0;}
.sv-qm{font-size:10px;color:var(--tx3);font-weight:700;text-transform:uppercase;letter-spacing:.7px;margin-bottom:2px;}
.sv-qp{font-size:12px;color:var(--tx);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:500;}
.sv-qck{font-size:14px;flex-shrink:0;padding-top:1px;}
.sv-le{padding:34px 16px;text-align:center;color:var(--tx3);font-size:13px;line-height:2;}
.sv-le span{font-size:30px;display:block;margin-bottom:8px;}
/* detail */
.sv-det{flex:1;overflow-y:auto;background:var(--bg);}
/* welcome */
.sv-wl{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:44px 28px;text-align:center;gap:17px;}
.sv-wi{font-size:54px;line-height:1;}
.sv-wl h1{font-size:27px;font-weight:900;line-height:1.2;letter-spacing:-.5px;}
.sv-wl h1 em{color:var(--ac);font-style:normal;}
.sv-wl p{color:var(--tx2);font-size:14px;max-width:370px;line-height:1.7;}
.sv-st{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:490px;width:100%;margin-top:5px;}
.sv-stp{background:var(--card);border:1.5px solid var(--bd);border-radius:12px;padding:15px 11px;text-align:center;}
.sv-stn{width:33px;height:33px;border-radius:50%;background:var(--as);border:2px solid var(--ac);color:var(--ac);font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;}
.sv-stt{font-size:12px;color:var(--tx2);line-height:1.6;font-weight:600;}
/* qview */
.sv-qv{padding:28px 36px;max-width:730px;animation:sv-up .3s ease;}
@keyframes sv-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.sv-ch{display:flex;align-items:center;gap:7px;margin-bottom:19px;flex-wrap:wrap;}
.ch{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid;letter-spacing:.3px;}
.ch-id{color:var(--tx3);border-color:var(--bd);background:transparent;font-family:monospace;}
.ch-tp{color:var(--ac);border-color:var(--ac);background:var(--as);}
.ch-easy{color:var(--ec);border-color:var(--ec);background:var(--gs);}
.ch-medium{color:var(--mc);border-color:var(--mc);background:var(--ys);}
.ch-hard{color:var(--hc);border-color:var(--hc);background:var(--rs);}
.ch-ty{color:var(--tx3);border-color:var(--bd);background:var(--bg3);font-size:10px;}
.sv-nr{display:flex;align-items:center;justify-content:space-between;margin-bottom:15px;}
.sv-ni{font-size:13px;color:var(--tx3);font-weight:700;}
.sv-na{display:flex;gap:8px;}
.sv-ar{width:44px;height:44px;border-radius:10px;background:var(--bg3);border:1px solid var(--bd);color:var(--tx2);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:'Nunito',sans-serif;touch-action:manipulation;}
.sv-ar:hover{background:var(--as);border-color:var(--ac);color:var(--ac);}
.sv-ar:active{transform:scale(.93);background:var(--as);}
@media(max-width:680px){
.sv-ar{width:52px;height:52px;font-size:20px;border-radius:12px;}
.sv-na{gap:10px;}
.sv-ni{font-size:14px;}
}
.sv-qt{font-size:17px;line-height:1.85;font-weight:500;color:var(--tx);margin-bottom:20px;white-space:pre-wrap;}
.sv-gv{background:var(--bg3);border:1.5px solid var(--bd);border-left:4px solid var(--ac);border-radius:0 10px 10px 0;padding:12px 16px;font-family:monospace;font-size:14px;color:var(--ye);line-height:2;white-space:pre-wrap;margin-bottom:19px;}
/* opts */
.sv-opts{display:flex;flex-direction:column;gap:9px;margin-bottom:21px;}
.sv-opt{display:flex;align-items:flex-start;gap:12px;padding:13px 15px;border:1.5px solid var(--bd);border-radius:11px;cursor:pointer;background:var(--card);transition:all .18s;user-select:none;}
.sv-opt:hover:not(.dn){border-color:var(--ac);background:var(--as);transform:translateX(3px);}
.sv-opt.cor{border-color:var(--gr);background:var(--gs);cursor:default;transform:none;}
.sv-opt.wrg{border-color:var(--re);background:var(--rs);cursor:default;transform:none;}
.sv-opt.dn{cursor:default;} .sv-opt.nl{cursor:default;opacity:.5;}
.sv-ob{width:27px;height:27px;border-radius:50%;background:var(--bg3);border:1.5px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0;}
.sv-opt.cor .sv-ob{background:var(--gr);border-color:var(--gr);color:#fff;}
.sv-opt.wrg .sv-ob{background:var(--re);border-color:var(--re);color:#fff;}
.sv-ot{font-size:15px;line-height:1.55;font-weight:500;padding-top:1px;flex:1;}
/* spr */
.sv-spr{margin-bottom:21px;}
.sv-sl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--tx3);font-weight:700;margin-bottom:9px;}
.sv-si{background:var(--card);border:2px solid var(--bd);border-radius:11px;padding:12px 17px;color:var(--tx);font-family:monospace;font-size:20px;font-weight:500;width:215px;outline:none;transition:border-color .15s;}
.sv-si:focus{border-color:var(--ac);box-shadow:0 0 0 3px var(--as);}
.sv-si.cor{border-color:var(--gr);} .sv-si.wrg{border-color:var(--re);}
/* acts */
.sv-ac{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:21px;align-items:center;}
.sv-bp{padding:10px 24px;background:var(--ac);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:800;cursor:pointer;transition:all .15s;box-shadow:0 3px 12px var(--ag);font-family:'Nunito',sans-serif;}
.sv-bp:hover{opacity:.87;transform:translateY(-1px);}
.sv-bo{padding:10px 17px;background:transparent;color:var(--tx2);border:1.5px solid var(--bd);border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;transition:all .15s;font-family:'Nunito',sans-serif;}
.sv-bo:hover{border-color:var(--ac);color:var(--ac);background:var(--as);}
/* result */
.sv-res{padding:12px 15px;border-radius:11px;font-size:15px;font-weight:700;margin-bottom:17px;border:1.5px solid;display:flex;align-items:center;gap:9px;animation:sv-up .2s ease;}
.sv-res.cor{background:var(--gs);color:var(--gr);border-color:var(--gr);}
.sv-res.wrg{background:var(--rs);color:var(--re);border-color:var(--re);}
/* exp */
.sv-exp{background:var(--card);border:1.5px solid var(--bd);border-radius:14px;overflow:hidden;animation:sv-up .25s ease;}
.sv-eh{display:flex;align-items:center;gap:9px;padding:12px 17px;background:var(--bg3);border-bottom:1px solid var(--bd);}
.sv-et{font-size:11px;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;color:var(--ac);}
.sv-eb{padding:16px 18px;}
.sv-ex{font-size:14px;line-height:1.85;color:var(--tx);margin-bottom:11px;font-weight:500;}
.sv-em{background:var(--bg);border:1.5px solid var(--bd);border-radius:9px;padding:12px 15px;font-family:monospace;font-size:13px;color:var(--ye);white-space:pre-wrap;line-height:2;}
/* overlay */
.sv-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;z-index:999;}
.sv-lc{background:var(--card);border:1.5px solid var(--bd);border-radius:17px;padding:32px 44px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:var(--sh);min-width:260px;}
.sv-sp2{width:44px;height:44px;border:3px solid var(--bd);border-top-color:var(--ac);border-radius:50%;animation:sv-spin .75s linear infinite;}
@keyframes sv-spin{to{transform:rotate(360deg)}}
.sv-lt{font-size:16px;font-weight:800;color:var(--tx);}
.sv-ls{font-size:11px;color:var(--tx3);font-family:monospace;}
@media(max-width:680px){
  .sv{height:auto;min-height:100vh;overflow:auto;}
  .sv-body{flex-direction:column;overflow:visible;}
  .sv-side{width:100%;border-right:none;border-bottom:1px solid var(--bd);}
  .sv-det{overflow:visible;}
  .sv-qv{padding:18px 16px;}
  .sv-stats{display:none;}
  .sv-st{grid-template-columns:1fr;}
  .sv-ar{width:52px;height:52px;font-size:20px;border-radius:12px;}
  .sv-na{gap:10px;}
  .sv-ni{font-size:14px;}
  .sv-opt{padding:15px 14px;gap:14px;}
  .sv-ob{width:32px;height:32px;font-size:14px;flex-shrink:0;}
  .sv-ot{font-size:16px;}
  .sv-qt{font-size:18px;line-height:1.75;}
  .sv-bp{padding:13px 28px;font-size:15px;}
  .sv-bo{padding:13px 18px;font-size:15px;}
  .sv-si{font-size:22px;padding:14px 18px;width:100%;max-width:280px;}
  .sv-ch{gap:6px;}
  .ch{font-size:10px;padding:3px 9px;}
  .sv-gen{padding:15px;font-size:16px;}
  .sv-qr{padding:13px 14px;}
  .sv-qp{font-size:13px;}
}
`

  const diffClass = (v: string) =>
    diffF === v ? (v==='easy'?'pb oe':v==='medium'?'pb om':v==='hard'?'pb oh':'pb on') : 'pb'

  return (
    <div data-sv={theme}>
      <style>{css}</style>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="sv">
        {/* TOP */}
        <div className="sv-top">
          <div className="sv-brand">
            <div className="sv-brand-ico">🏆</div>
            SAT Math <em>Vault</em><sub>∞</sub>
          </div>
          <div className="sv-tr">
            <div className="sv-stats">
              <div className="sv-sp"><div className="n">{questions.length}</div><div className="l">Generated</div></div>
              <div className="sv-sp"><div className="n">{attCount}</div><div className="l">Attempted</div></div>
              <div className="sv-sp"><div className="n">{corCount}</div><div className="l">Correct</div></div>
              <div className="sv-sp"><div className="n">{accuracy !== null ? `${accuracy}%` : '—'}</div><div className="l">Accuracy</div></div>
            </div>
            <button className="sv-tb" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
        <div className="sv-pb"><div className="sv-pbf" style={{width:`${accuracy??0}%`}}/></div>

        {/* BODY */}
        <div className="sv-body">
          {/* SIDEBAR */}
          <div className="sv-side">
            <div className="sv-ctrl">
              {/* Topic */}
              <div>
                <div className="sv-cl">Topic</div>
                <div className="sv-tg">
                  {TOPICS.map(({v,l}) => (
                    <button key={v} className={`sb${topicF===v?' on':''}`} onClick={()=>setTopicF(v)}>{l}</button>
                  ))}
                </div>
              </div>
              {/* Difficulty */}
              <div>
                <div className="sv-cl">Difficulty</div>
                <div className="sv-row">
                  {(['all','easy','medium','hard'] as const).map(v=>(
                    <button key={v} className={diffClass(v)} onClick={()=>setDiffF(v)}>
                      {v==='all'?'All':v==='medium'?'Med':v.charAt(0).toUpperCase()+v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {/* Batch */}
              <div>
                <div className="sv-cl">Questions per Batch</div>
                <div className="sv-row">
                  {[5,10,20,30].map(n=>(
                    <button key={n} className={batchN===n?'pb on':'pb'} onClick={()=>setBatchN(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <button className="sv-gen" onClick={generate} disabled={isBusy}>
                <span>{isBusy?'⏳':'⚡'}</span>
                <span>{isBusy?'Generating…':'Generate Questions'}</span>
              </button>
              <div className="sv-cost">Est. cost per batch: <b>~${estCost}</b></div>
              {error && <div className="sv-err">⚠ {error}</div>}
            </div>

            {/* Q LIST */}
            <div className="sv-ql">
              {vis.length === 0 ? (
                <div className="sv-le">
                  <span>{questions.length>0?'🔍':'📚'}</span>
                  {questions.length>0 ? 'No questions match this filter.' : <><b style={{color:'var(--ac)'}}>Generate Questions</b> to start.</>}
                </div>
              ) : vis.map((q,i) => {
                const done = attempted[q.id]!==undefined
                return (
                  <div key={q.id} className={`sv-qr${currentId===q.id?' act':''}`} onClick={()=>selectQ(q.id)}>
                    <div className="sv-ql-left">
                      <span className="sv-qn">{String(i+1).padStart(2,'0')}</span>
                      <span className={`dd ${q.diff}`}/>
                    </div>
                    <div className="sv-qb">
                      <div className="sv-qm">{SHORT_TOPIC[q.topic]||q.topic} · {q.diff}</div>
                      <div className="sv-qp">{q.q.replace(/\n/g,' ')}</div>
                    </div>
                    {done && <span className="sv-qck">{correct[q.id]?'✅':'❌'}</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* DETAIL */}
          <div className="sv-det">
            {!currentQ ? (
              <div className="sv-wl">
                <div className="sv-wi">🏆</div>
                <h1>Infinite SAT Math<br/><em>Practice Engine</em></h1>
                <p>AI-generated SAT-style questions, forever. Pick a topic and difficulty, then hit Generate.</p>
                <div className="sv-st">
                  <div className="sv-stp"><div className="sv-stn">1</div><div className="sv-stt">Choose topic &amp; difficulty in the sidebar</div></div>
                  <div className="sv-stp"><div className="sv-stn">2</div><div className="sv-stt">Hit ⚡ Generate Questions</div></div>
                  <div className="sv-stp"><div className="sv-stn">3</div><div className="sv-stt">Answer → review solutions → repeat</div></div>
                </div>
              </div>
            ) : (
              <div className="sv-qv">
                {/* chips */}
                <div className="sv-ch">
                  <span className="ch ch-id">{currentQ.id}</span>
                  <span className="ch ch-tp">{currentQ.topic}</span>
                  <span className={`ch ch-${currentQ.diff}`}>{currentQ.diff}</span>
                  <span className="ch ch-ty">{currentQ.type==='spr'?'Open Response':'Multiple Choice'}</span>
                </div>
                {/* nav */}
                <div className="sv-nr">
                  <span className="sv-ni">Question {visIdx+1} of {vis.length}</span>
                  <div className="sv-na">
                    <button className="sv-ar" onClick={()=>goRel(-1)}>←</button>
                    <button className="sv-ar" onClick={()=>goRel(1)}>→</button>
                  </div>
                </div>
                {/* question */}
                <div className="sv-qt">{currentQ.q}</div>
                {currentQ.given && <div className="sv-gv">{currentQ.given}</div>}

                {/* MC */}
                {currentQ.type==='mc' ? (
                  <div className="sv-opts">
                    {currentQ.opts.map((opt,i)=>{
                      let cls='sv-opt'
                      if(isDone){ if(i===Number(currentQ.ans))cls+=' cor dn'; else if(attempted[currentId!]===i)cls+=' wrg dn'; else cls+=' nl dn'; }
                      return (
                        <div key={i} className={cls} onClick={()=>!isDone&&pick(i)}>
                          <div className="sv-ob">{'ABCD'[i]}</div>
                          <div className="sv-ot">{opt}</div>
                          {isDone&&i===Number(currentQ.ans)&&<span style={{marginLeft:'auto',fontSize:15}}>✓</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="sv-spr">
                    <div className="sv-sl">📝 Enter Your Answer</div>
                    <input
                      className={`sv-si${isDone?(isOk?' cor':' wrg'):''}`}
                      type="text"
                      placeholder="Type answer…"
                      value={isDone ? String(currentQ.ans) : sprValue}
                      disabled={isDone}
                      onChange={e=>setSprValue(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&submitSPR()}
                    />
                  </div>
                )}

                {/* result */}
                {isDone && (
                  <div className={`sv-res ${isOk?'cor':'wrg'}`}>
                    <span style={{fontSize:18}}>{isOk?'🎉':'❌'}</span>
                    <span>{isOk?'Correct! Great work.' : <>Not quite — correct answer: <strong>{currentQ.type==='mc'?currentQ.opts[Number(currentQ.ans)]:currentQ.ans}</strong></>}</span>
                  </div>
                )}

                {/* actions */}
                {isDone ? (
                  <div className="sv-ac">
                    <button className="sv-bp" onClick={()=>goRel(1)}>Next Question →</button>
                    <button className="sv-bo" onClick={retry}>↺ Retry</button>
                  </div>
                ) : currentQ.type==='spr' ? (
                  <div className="sv-ac">
                    <button className="sv-bp" onClick={submitSPR}>Submit Answer</button>
                    <button className="sv-bo" onClick={()=>goRel(1)}>Skip →</button>
                  </div>
                ) : null}

                {/* explanation */}
                {isDone && (
                  <div className="sv-exp">
                    <div className="sv-eh"><span style={{fontSize:17}}>💡</span><span className="sv-et">Full Solution &amp; Explanation</span></div>
                    <div className="sv-eb">
                      <div className="sv-ex">{currentQ.exp}</div>
                      <div className="sv-em">{currentQ.math}</div>
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
