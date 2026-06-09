// app/supplement/page.tsx
'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'

function WaitlistForm({ okText }: { okText: string }) {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus('loading'); setErr('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, company, source: 'supplement-landing' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { setStatus('error'); setErr(data.error || 'Something went wrong.'); return }
      setStatus('done')
    } catch {
      setStatus('error'); setErr('Network error — please try again.')
    }
  }

  if (status === 'done') return <div className="form-ok">{okText}</div>

  return (
    <form className="signup" onSubmit={submit} noValidate>
      <label className="field">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Your work email" required autoComplete="email" />
      </label>
      <input type="text" name="company" value={company} onChange={(e) => setCompany(e.target.value)}
        className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button className="go" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Adding…' : 'Get early access'}
      </button>
      {status === 'error' && <p className="err">{err}</p>}
    </form>
  )
}

export default function SupplementLanding() {
  return (
    <div className="pg-landing">
      <title>ProGuild — Recover What Carriers Underpay on FL Roof Claims</title>
      <meta name="description" content="ProGuild helps Florida roofing contractors catch the items insurance adjusters miss, document them to code, and build a supplement package — keeping 100% of their margin. No supplement-service cut." />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <nav>
        <div className="wrap nav-inner">
          <div className="logo">Pro<b>Guild</b></div>
          <div className="nav-tag">Florida Roofing · Insurance Supplements</div>
        </div>
      </nav>

      <header className="hero">
        <div className="wrap hero-inner">
          <span className="eyebrow"><span className="dot" /> For Florida roofing contractors</span>
          <h1>Carriers underpay the average roof claim by <span className="amber">$7,000–$8,000.</span></h1>
          <p className="sub">ProGuild finds what the adjuster left out, documents it to Florida code, and builds your supplement package in minutes — <strong>so you recover what you&rsquo;re owed and keep 100% of your margin.</strong> No supplement service taking a cut.</p>
          <div className="cta">
            <WaitlistForm okText="You're on the list. I'll reach out personally when the first version is ready — and ask what would make it genuinely useful for your shop." />
            <p className="microline">Built for Florida roofers. <b>Founding members lock in early pricing.</b> No spam — one note when it&rsquo;s ready.</p>
          </div>
          <div className="stats">
            <div className="stat"><div className="n accent">90%+</div><div className="l">of initial carrier estimates leave out required items*</div></div>
            <div className="stat"><div className="n accent">10–25%</div><div className="l">is what done-for-you supplement services keep of your recovery</div></div>
            <div className="stat"><div className="n amber">$0</div><div className="l">cut taken by ProGuild — flat software fee, you keep every dollar</div></div>
          </div>
        </div>
      </header>

      <section className="band">
        <div className="wrap">
          <div className="kicker">The math on a short check</div>
          <h2>Right now you&rsquo;ve got two bad options.</h2>
          <p className="lead">When the adjuster&rsquo;s estimate comes in low — and it almost always does — you either eat the gap or pay someone a slice of what they claw back. ProGuild is the third option.</p>
          <div className="options">
            <div className="opt"><div className="tag">Option 1</div><h3>Eat the underpayment</h3><p>Accept the short check and absorb the missing drip edge, starter, decking, and code items out of your own margin.</p></div>
            <div className="opt"><div className="tag">Option 2</div><h3>Hire a supplement service</h3><p>They recover the money — and keep 10–25% of it. On a $7,500 recovery that&rsquo;s up to $1,875 gone, every claim.</p></div>
            <div className="opt win"><div className="tag">Option 3 — ProGuild</div><h3>Do it yourself, in minutes</h3><p>Software that flags the missed items, tells you exactly what to photograph, and assembles the package — so you&rsquo;re not doing claim paperwork at 9pm. Flat fee. Keep 100%.</p></div>
          </div>
        </div>
      </section>

      <section className="band light">
        <div className="wrap">
          <div className="kicker">How it works</div>
          <h2>From short check to documented supplement.</h2>
          <p className="lead">No black box. You stay in the driver&rsquo;s seat the whole way.</p>
          <div className="steps">
            <div className="step"><div className="num">1</div><h3>Drop in the carrier estimate</h3><p>Paste the adjuster&rsquo;s scope and check off what they already paid for. ProGuild handles the rest.</p></div>
            <div className="step"><div className="num">2</div><h3>See what they left out</h3><p>Every Florida re-roof item the carrier missed — drip edge, starter, decking, code upgrades — with why it&rsquo;s owed and what to photograph.</p></div>
            <div className="step"><div className="num">3</div><h3>Generate the package</h3><p>A clean, photo-backed supplement letter and itemized list. You review it, you send it, you own it.</p></div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="kicker">Why ProGuild</div>
          <h2>Built for Florida — and built to keep you in control.</h2>
          <div className="why-grid">
            <div className="why"><div className="ic" aria-hidden>🛡️</div><h3>Florida-specific</h3><p>Built around the items and code upgrades Florida carriers routinely leave off re-roof estimates — drip edge, starter, decking, secondary water barrier, wind-rated underlayment — with the current-code context for each.</p></div>
            <div className="why"><div className="ic" aria-hidden>✓</div><h3>You verify everything</h3><p>ProGuild organizes and documents — you confirm each item and submit it. The claim is always yours, never an AI guessing on your behalf.</p></div>
            <div className="why"><div className="ic" aria-hidden>$</div><h3>Flat fee, full margin</h3><p>No percentage of your recovery. One predictable software cost — every dollar you claw back stays in your business.</p></div>
          </div>
        </div>
      </section>

      <section className="final">
        <div className="wrap">
          <h2>Stop leaving thousands on every roof.</h2>
          <p className="sub">Early access is opening to a first group of Florida roofers. Add your email and you&rsquo;re in line.</p>
          <div className="cta"><WaitlistForm okText="You're on the list — talk soon." /><p className="microline">Florida-first. Founding pricing for early shops.</p></div>
        </div>
      </section>

      <footer>
        <div className="wrap footer-inner">
          <div className="logo">Pro<b>Guild</b></div>
          <div>© 2026 ProGuild · Florida roofing software · Early access</div>
        </div>
        <div className="wrap"><p className="fineprint">*Source: IA Solutions, based on 10,000+ supplements — ~90% of initial estimates omit required items, averaging $7,000–$8,000/claim. Shown for context; verify against your own claims.</p></div>
      </footer>

      <style jsx global>{`
        .pg-landing{
          --ink:#0c1217;--ink2:#121b22;--line:#26333d;--teal:#2dd4bf;--teal-deep:#0d9488;
          --amber:#f6b73c;--cream:#f5f2ea;--fg:#e9eef1;--muted:#94a3ad;--muted-2:#6f7e88;--maxw:1100px;
          background:var(--ink);color:var(--fg);font-family:"Hanken Grotesk",system-ui,sans-serif;
          font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh;
        }
        .pg-landing *{box-sizing:border-box;margin:0;padding:0}
        .pg-landing h1,.pg-landing h2,.pg-landing h3,.pg-landing .logo{font-family:"Bricolage Grotesque",serif;font-weight:700;line-height:1.04;letter-spacing:-.02em}
        .pg-landing .accent{color:var(--teal)} .pg-landing .amber{color:var(--amber)}
        .pg-landing .wrap{max-width:var(--maxw);margin:0 auto;padding:0 28px}
        .pg-landing nav{position:absolute;top:0;left:0;right:0;z-index:10}
        .pg-landing .nav-inner{display:flex;align-items:center;justify-content:space-between;padding-top:26px}
        .pg-landing .logo{font-weight:800;font-size:21px;letter-spacing:-.03em}
        .pg-landing .logo b{color:var(--teal)}
        .pg-landing .nav-tag{font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted-2)}
        .pg-landing .hero{position:relative;padding:150px 0 96px;overflow:hidden}
        .pg-landing .hero::before{content:"";position:absolute;top:-220px;right:-160px;width:680px;height:680px;background:radial-gradient(circle,rgba(45,212,191,.16),transparent 62%);pointer-events:none}
        .pg-landing .hero::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:54px 54px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 30% 0%,#000,transparent 75%);mask-image:radial-gradient(ellipse 70% 60% at 30% 0%,#000,transparent 75%)}
        .pg-landing .hero-inner{position:relative;z-index:2}
        .pg-landing .eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--teal);border:1px solid var(--line);background:rgba(45,212,191,.05);border-radius:100px;padding:7px 15px;margin-bottom:30px}
        .pg-landing .eyebrow .dot{width:6px;height:6px;border-radius:50%;background:var(--teal);box-shadow:0 0 10px var(--teal)}
        .pg-landing h1{font-size:clamp(40px,6.4vw,74px);max-width:16ch}
        .pg-landing .sub{font-size:clamp(17px,2vw,21px);color:var(--muted);max-width:54ch;margin-top:26px;line-height:1.55}
        .pg-landing .sub strong{color:var(--fg);font-weight:600}
        .pg-landing .cta{margin-top:38px;max-width:520px}
        .pg-landing form.signup{display:flex;gap:10px;flex-wrap:wrap}
        .pg-landing .field{flex:1 1 240px;display:flex;align-items:center;background:var(--ink2);border:1px solid var(--line);border-radius:12px;padding:0 16px;transition:border-color .2s,box-shadow .2s}
        .pg-landing .field:focus-within{border-color:var(--teal);box-shadow:0 0 0 3px rgba(45,212,191,.14)}
        .pg-landing .field input{flex:1;background:none;border:none;outline:none;color:var(--fg);font:inherit;padding:16px 0}
        .pg-landing .field input::placeholder{color:var(--muted-2)}
        .pg-landing .hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}
        .pg-landing button.go{background:var(--amber);color:#1a1206;font-family:"Bricolage Grotesque";font-weight:700;font-size:16px;border:none;border-radius:12px;padding:0 26px;cursor:pointer;white-space:nowrap;transition:transform .15s,box-shadow .2s;box-shadow:0 6px 22px rgba(246,183,60,.22)}
        .pg-landing button.go:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(246,183,60,.34)}
        .pg-landing button.go:disabled{opacity:.7;cursor:default;transform:none}
        .pg-landing .microline{font-size:13.5px;color:var(--muted-2);margin-top:14px}
        .pg-landing .microline b{color:var(--muted)}
        .pg-landing .err{color:#ff9b9b;font-size:13.5px;margin-top:10px;flex-basis:100%}
        .pg-landing .form-ok{background:rgba(45,212,191,.08);border:1px solid var(--teal-deep);border-radius:12px;padding:18px 20px;color:var(--fg);font-size:15.5px;max-width:520px}
        .pg-landing .stats{display:flex;gap:14px;flex-wrap:wrap;margin-top:54px}
        .pg-landing .stat{background:var(--ink2);border:1px solid var(--line);border-radius:14px;padding:20px 22px;flex:1 1 180px}
        .pg-landing .stat .n{font-family:"Bricolage Grotesque";font-weight:800;font-size:30px;letter-spacing:-.02em}
        .pg-landing .stat .l{font-size:13px;color:var(--muted);margin-top:4px;line-height:1.35}
        .pg-landing .band{padding:84px 0;border-top:1px solid var(--line)}
        .pg-landing .kicker{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--teal);margin-bottom:16px}
        .pg-landing .band h2{font-size:clamp(28px,4vw,42px);max-width:20ch}
        .pg-landing .lead{color:var(--muted);max-width:60ch;margin-top:18px;font-size:18px}
        .pg-landing .options{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:42px}
        .pg-landing .opt{border:1px solid var(--line);border-radius:16px;padding:26px;background:var(--ink2)}
        .pg-landing .opt h3{font-size:19px;margin-bottom:10px}
        .pg-landing .opt.win{border-color:var(--teal-deep);background:linear-gradient(180deg,rgba(45,212,191,.07),rgba(45,212,191,.01))}
        .pg-landing .opt p{color:var(--muted);font-size:15px}
        .pg-landing .opt .tag{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted-2);margin-bottom:14px}
        .pg-landing .opt.win .tag{color:var(--teal)}
        .pg-landing .light{background:var(--cream);color:#16212a}
        .pg-landing .light .kicker{color:var(--teal-deep)} .pg-landing .light h2{color:#101a20} .pg-landing .light .lead{color:#4a5a63}
        .pg-landing .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:46px}
        .pg-landing .step{padding-top:14px}
        .pg-landing .step .num{font-family:"Bricolage Grotesque";font-weight:800;font-size:15px;color:#fff;background:var(--teal-deep);width:34px;height:34px;border-radius:9px;display:grid;place-items:center;margin-bottom:18px}
        .pg-landing .step h3{font-size:20px;color:#101a20;margin-bottom:8px}
        .pg-landing .step p{color:#4a5a63;font-size:15.5px}
        .pg-landing .why-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:42px}
        .pg-landing .why{border:1px solid var(--line);border-radius:16px;padding:26px;background:var(--ink2)}
        .pg-landing .why .ic{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;margin-bottom:16px;background:rgba(45,212,191,.1);border:1px solid var(--teal-deep);font-size:18px}
        .pg-landing .why h3{font-size:18px;margin-bottom:8px}
        .pg-landing .why p{color:var(--muted);font-size:15px}
        .pg-landing .final{padding:96px 0;text-align:center;border-top:1px solid var(--line);position:relative;overflow:hidden}
        .pg-landing .final::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 50% 70% at 50% 100%,rgba(45,212,191,.12),transparent 70%);pointer-events:none}
        .pg-landing .final .wrap{position:relative;z-index:2}
        .pg-landing .final h2{font-size:clamp(30px,4.5vw,48px);max-width:18ch;margin:0 auto}
        .pg-landing .final .sub{margin:22px auto 0}
        .pg-landing .final .cta{margin:34px auto 0}
        .pg-landing .final form.signup,.pg-landing .final .form-ok{justify-content:center;margin-left:auto;margin-right:auto}
        .pg-landing footer{border-top:1px solid var(--line);padding:34px 0 28px}
        .pg-landing .footer-inner{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;color:var(--muted-2);font-size:13.5px}
        .pg-landing footer .logo{font-size:16px}
        .pg-landing .fineprint{color:var(--muted-2);font-size:11.5px;margin-top:18px;max-width:80ch;line-height:1.5}
        @media(max-width:820px){
          .pg-landing .options,.pg-landing .steps,.pg-landing .why-grid{grid-template-columns:1fr}
          .pg-landing .hero{padding:128px 0 72px}
          .pg-landing .nav-tag{display:none}
        }
      `}</style>
    </div>
  )
}
