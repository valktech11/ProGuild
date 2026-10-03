'use client'
import Link from 'next/link'
// NOTE: signup lives at /login?tab=signup (there is no /signup route).
// Claim-your-profile self-serve flow lives at /claim/find (FL license lookup).
import { useState } from 'react'
import AppStoreBadges from '@/components/ui/AppStoreBadges'

const teal   = '#0F766E'
const tealLt = '#2DD4BF'
const navy   = '#0A1628'
const navyMd = '#0F2240'
const navyLt = '#1E3A5F'
const gold   = '#F59E0B'
const white  = '#FFFFFF'

// ── Core platform — every contractor gets these (trade-neutral, all real) ────
const coreFeatures = [
  { icon: '📊', title: 'Visual Job Pipeline',       desc: 'Track every job from first contact to final payment on one board.' },
  { icon: '🗂️', title: 'Customer & Property Records', desc: 'Every customer, property and job — searchable, in one place.' },
  { icon: '📝', title: 'Estimates & Proposals',      desc: 'Build and send professional estimates in minutes.' },
  { icon: '📸', title: 'Photos & Documents',         desc: 'Capture and organize job photos, docs and permits.' },
  { icon: '📆', title: 'Job Calendar',               desc: 'Schedule inspections, installs and follow-ups.' },
  { icon: '👥', title: 'Team & Multi-User',          desc: 'Add your crew with roles and per-member lead attribution.' },
  { icon: '💳', title: 'Invoicing & Payments',       desc: 'Send invoices and collect payment online.' },
  { icon: '✅', title: 'Verified Contractor Profile', desc: 'Get a verified profile and get discovered by homeowners.' },
]

// ── Trade-specific tools — dynamic per selected trade ────────────────────────
type Trade = 'roofing' | 'hvac' | 'plumbing' | 'electrical' | 'gc'

const TRADES: { id: Trade; label: string; emoji: string }[] = [
  { id: 'roofing',    label: 'Roofing',            emoji: '🏠' },
  { id: 'hvac',       label: 'HVAC',               emoji: '❄️' },
  { id: 'plumbing',   label: 'Plumbing',           emoji: '🔧' },
  { id: 'electrical', label: 'Electrical',         emoji: '⚡' },
  { id: 'gc',         label: 'General Contractor', emoji: '🏗️' },
]

const tradeData: Record<Trade, { headline: string; sub: string; phone: string; cards: { icon: string; title: string; desc: string }[] }> = {
  roofing: {
    headline: 'Powerful tools built for roofers.',
    sub: 'From satellite measurements to insurance supplements — everything you need to win more roofs and recover what you’re owed.',
    phone: '/app/estimate.jpg',
    cards: [
      { icon: '🛡️', title: 'Insurance Supplement Recovery', desc: 'AI scans every claim and surfaces missed line items — recovery often runs several thousand per supplemented claim.' },
      { icon: '🛰️', title: 'Free Satellite Measurements',   desc: 'Rooftop dimensions from satellite imagery in seconds. EagleView charges $40–91/report — we include it.' },
      { icon: '🎨', title: 'Roof Visualizer',               desc: 'Show homeowners their roof in 15 real shingle colors from GAF, Owens Corning, CertainTeed and more.' },
      { icon: '📋', title: 'Insurance Pipeline',            desc: 'Stages for the whole claim cycle — inspection, adjuster, supplement, check received.' },
      { icon: '🏷️', title: 'Free Roofing Estimate Tool',    desc: 'Homeowners get a free satellite-powered estimate and come to you pre-educated.' },
      { icon: '💳', title: 'Milestone Invoicing',           desc: 'Deposit, material delivery and completion milestones — paid online.' },
    ],
  },
  hvac: {
    headline: 'Built for HVAC service & install.',
    sub: 'Track every unit, keep maintenance on autopilot, and run service and install jobs from one place.',
    phone: '/app/hvac-ptchart.jpg',
    cards: [
      { icon: '🔧', title: 'Equipment & System Tracking', desc: 'A digital twin for every unit — model, serial, install date and service history, by QR scan.' },
      { icon: '📅', title: 'Maintenance Plans',           desc: 'Recurring maintenance with automated reminders and completion tracking.' },
      { icon: '🌡️', title: 'PT Diagnostic Table',         desc: 'In-app pressure/temperature chart for R-410A, R-22, R-32 and R-454B — to 130°F.' },
      { icon: '🎙️', title: 'Voice Job Notes',             desc: 'Speak notes on-site; AI structures them into the job record.' },
      { icon: '📊', title: 'Service Pipeline',            desc: 'Track every service and install call from first contact to paid.' },
      { icon: '💳', title: 'Estimates & Invoicing',       desc: 'Professional estimates and online invoicing built in.' },
    ],
  },
  plumbing: {
    headline: 'Run your plumbing jobs end to end.',
    sub: 'From the first call to the final invoice — the whole job tracked in one place, on web and in the field.',
    phone: '/app/dashboard.jpg',
    cards: [
      { icon: '📊', title: 'Service Pipeline',          desc: 'Track every job from call to completion on a visual board.' },
      { icon: '📝', title: 'Estimates & Proposals',     desc: 'Build and send professional estimates in minutes.' },
      { icon: '📸', title: 'Job Photos & Documents',    desc: 'Capture and organize job photos, permits and docs.' },
      { icon: '🗂️', title: 'Customer & Property Records', desc: 'Every customer and property, searchable in one place.' },
      { icon: '📆', title: 'Scheduling & Follow-ups',   desc: 'Book jobs and automate follow-up reminders.' },
      { icon: '💳', title: 'Invoicing & Payments',      desc: 'Send invoices and collect payment online.' },
    ],
  },
  electrical: {
    headline: 'Built for electrical contractors.',
    sub: 'Keep permits, inspections and jobs organized — and get paid faster.',
    phone: '/app/dashboard.jpg',
    cards: [
      { icon: '📊', title: 'Service Pipeline',          desc: 'Track every job from first contact to final payment.' },
      { icon: '⚡', title: 'Permit & Inspection Tracking', desc: 'Record permit numbers, inspection dates and code notes per job.' },
      { icon: '📝', title: 'Estimates & Proposals',     desc: 'Build and send professional estimates in minutes.' },
      { icon: '📸', title: 'Job Photos & Documents',    desc: 'Capture and organize job photos, docs and permits.' },
      { icon: '📆', title: 'Scheduling & Dispatch',     desc: 'Book jobs, dispatch crew and automate reminders.' },
      { icon: '💳', title: 'Invoicing & Payments',      desc: 'Send invoices and collect payment online.' },
    ],
  },
  gc: {
    headline: 'Built for general contractors.',
    sub: 'Track projects, subs, budgets and documents across your whole book of work.',
    phone: '/app/dashboard.jpg',
    cards: [
      { icon: '🏗️', title: 'Project Pipeline',          desc: 'See every project by stage across your whole book.' },
      { icon: '📐', title: 'Sub & Budget Tracking',     desc: 'Track subcontractors, materials budget and permits per project.' },
      { icon: '📝', title: 'Estimates & Proposals',     desc: 'Build and send professional estimates in minutes.' },
      { icon: '📁', title: 'Documents & Permits',       desc: 'Store plans, permits and approvals on each project.' },
      { icon: '📆', title: 'Scheduling & Milestones',   desc: 'Schedule crews and track project milestones.' },
      { icon: '💳', title: 'Milestone Invoicing',       desc: 'Bill by project milestone and collect online.' },
    ],
  },
}

// ── Stack ProGuild replaces (publicly listed ranges) ─────────────────────────
const stackReplaces = [
  { tool: 'CRM (AccuLynx / JobNimbus)', cost: '$150–200/mo' },
  { tool: 'Measurements (EagleView)',    cost: '$40–91/report' },
  { tool: 'Leads (Angi / Thumbtack)',    cost: '$50–300/lead' },
  { tool: 'Supplementing service',       cost: '% of every claim' },
]

// ── From lead to paid job ────────────────────────────────────────────────────
const workflow = [
  { n: '01', title: 'Get the lead',    desc: 'Directory, free estimate tool, or import your book.' },
  { n: '02', title: 'Measure & build', desc: 'Measurement or site photos → estimate in minutes.' },
  { n: '03', title: 'Win the work',    desc: 'E-signed proposal, deposit collected.' },
  { n: '04', title: 'Run production',  desc: 'Photos, milestones, documents — all tracked.' },
  { n: '05', title: 'Get paid',        desc: 'Milestone invoices, paid online.' },
]

const competitors = [
  { name: 'ProGuild', price: '$49.99/mo', supplement: true, satellite: true, visualizer: true, directory: true, mobile: true, perLead: false, highlight: true },
  { name: 'AccuLynx', price: '$200+/mo', supplement: false, satellite: false, visualizer: false, directory: false, mobile: true, perLead: false, highlight: false },
  { name: 'JobNimbus', price: '$150+/mo', supplement: false, satellite: false, visualizer: false, directory: false, mobile: true, perLead: false, highlight: false },
  { name: 'Angi / Thumbtack', price: '$50–300/lead', supplement: false, satellite: false, visualizer: false, directory: true, mobile: false, perLead: true, highlight: false },
  { name: 'EagleView alone', price: '$40–91/report', supplement: false, satellite: true, visualizer: false, directory: false, mobile: false, perLead: false, highlight: false },
]

// ── Small components ─────────────────────────────────────────────────────────
function Check({ yes }: { yes: boolean }) {
  return <span style={{ fontSize: 18, color: yes ? '#10B981' : '#CBD5E1' }}>{yes ? '✓' : '✕'}</span>
}

function SectionLabel({ text, color = tealLt }: { text: string; color?: string }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>{text}</div>
}

function Card({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ background: navyMd, border: `1px solid ${navyLt}`, borderRadius: 16, padding: '22px 20px', transition: 'transform 0.2s, box-shadow 0.2s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.25)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: white, marginBottom: 7 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#94A3B8', lineHeight: 1.6 }}>{desc}</div>
    </div>
  )
}

// ── Phone frame wrapping a real app screenshot ───────────────────────────────
function Phone({ src, w = 258, style, className }: { src: string; w?: number; style?: React.CSSProperties; className?: string }) {
  const bezel = Math.max(8, Math.round(w * 0.038))
  const rad = Math.round(w * 0.145)
  const btn = (pos: React.CSSProperties) => (
    <span style={{ position: 'absolute', width: 3, background: '#0A1220', borderRadius: 2, ...pos }} />
  )
  return (
    <div className={className} style={{
      width: w, borderRadius: rad, padding: bezel, position: 'relative', flexShrink: 0,
      background: 'linear-gradient(145deg,#33445f 0%,#121c2e 42%,#0a1220 100%)',
      boxShadow: '0 44px 90px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.18)',
      ...style,
    }}>
      <div style={{ borderRadius: rad - bezel, overflow: 'hidden', position: 'relative', background: '#000' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="ProGuild mobile app" style={{ width: '100%', display: 'block' }} />
        {/* punch-hole camera */}
        <span style={{ position: 'absolute', top: Math.round(w * 0.028), left: '50%', transform: 'translateX(-50%)', width: Math.round(w * 0.032), height: Math.round(w * 0.032), background: '#05080f', borderRadius: '50%', boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }} />
        {/* screen reflection */}
        <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(118deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.03) 24%, rgba(255,255,255,0) 40%)' }} />
      </div>
      {/* side buttons */}
      {btn({ right: -2, top: '20%', height: '6%' })}
      {btn({ right: -2, top: '30%', height: '11%' })}
      {btn({ left: -2, top: '26%', height: '9%' })}
    </div>
  )
}

// ── Hero visual: two real phones side by side — roof measurement + visualizer ─
function DeviceMock() {
  return (
    <div className="pg-hero-visual" style={{ display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {/* Roof measurement (trace) first */}
      <Phone src="/app/trace.jpg" w={228} style={{ transform: 'perspective(1700px) rotateY(-8deg)' }} />
      {/* Roof Visualizer second */}
      <Phone src="/app/visualizer.jpg" w={228} style={{ transform: 'perspective(1700px) rotateY(-8deg)' }} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ContractorsPage() {
  const [trade, setTrade] = useState<Trade>('roofing')
  const t = tradeData[trade]

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: navy, color: white, overflowX: 'hidden' }}>
      <style jsx global>{`
        .pg-hero { display: flex; gap: 48px; align-items: center; justify-content: space-between; max-width: 1100px; margin: 0 auto; }
        .pg-hero-copy { flex: 1 1 520px; text-align: left; }
        .pg-hero-ctas, .pg-hero-badges, .pg-hero-badge-row { justify-content: flex-start; }
        .pg-split { }
        @media (max-width: 900px) {
          .pg-hero { flex-direction: column; text-align: center; }
          .pg-hero-copy { text-align: center; flex-basis: auto; }
          .pg-hero-ctas, .pg-hero-badges, .pg-hero-badge-row { justify-content: center !important; }
          .pg-hero-visual { display: none !important; }
          .pg-split { flex-direction: column; text-align: center; }
          .pg-split-copy { flex-basis: auto !important; }
          .pg-split-copy > div { align-items: center; }
          .pg-field-media { width: 100% !important; max-width: 420px; margin: 0 auto 36px; }
          .pg-roi { flex-direction: column; }
          .pg-roi-phone { display: none !important; }
          .pg-trade { flex-direction: column; }
          .pg-trade-phone { display: none !important; }
          .pg-hvac-extra { display: none !important; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" width={32} height={32} alt="ProGuild" style={{ borderRadius: 8 }} />
            <span style={{ fontSize: 17, fontWeight: 700, color: white }}>ProGuild.ai</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <a href="#platform" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }} className="pg-navlink">Product</a>
            <a href="#trades" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }} className="pg-navlink">Trades</a>
            <a href="#pricing" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }} className="pg-navlink">Pricing</a>
            <a href="#get-app" style={{ fontSize: 13.5, color: white, textDecoration: 'none', fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '7px 13px', whiteSpace: 'nowrap' }}>Get the App 📱</a>
            <Link href="/login" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none', whiteSpace: 'nowrap' }}>Sign in</Link>
            <Link href="/login?tab=signup" style={{ fontSize: 14, fontWeight: 700, color: white, background: teal, padding: '8px 18px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>Start Free →</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── trade-neutral */}
      <section style={{ padding: '72px 24px 56px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -120, left: '42%', width: 620, height: 420, background: `radial-gradient(ellipse,${teal}33 0%,transparent 70%)`, pointerEvents: 'none' }} />
        <div className="pg-hero">
          <div className="pg-hero-copy">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${teal}22`, border: `1px solid ${teal}44`, borderRadius: 20, padding: '6px 14px', marginBottom: 24 }}>
              <span style={{ fontSize: 12, color: tealLt, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Roofing · HVAC · Plumbing · Electrical &amp; more</span>
            </div>
            <h1 style={{ fontSize: 'clamp(38px, 6vw, 66px)', fontWeight: 900, lineHeight: 1.04, margin: '0 0 22px', letterSpacing: '-0.02em' }}>
              Win more jobs.<br />
              <span style={{ background: `linear-gradient(90deg,${tealLt},${gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Keep more of the money.</span>
            </h1>
            <p style={{ fontSize: 17.5, color: '#CBD5E1', lineHeight: 1.65, maxWidth: 520, margin: '0 0 12px' }}>
              The CRM built for trade contractors — from roofing and HVAC to plumbing, electrical and more.
            </p>
            <p style={{ fontSize: 15, color: '#94A3B8', lineHeight: 1.6, maxWidth: 500, margin: '0 0 34px' }}>
              Manage leads, estimates, jobs, documents and payments in one place. No per-lead fees.
            </p>

            <div className="pg-hero-ctas" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link href="/login?tab=signup" style={{ fontSize: 16, fontWeight: 800, color: white, background: `linear-gradient(135deg,${teal},#0D9488)`, padding: '15px 32px', borderRadius: 12, textDecoration: 'none', boxShadow: `0 8px 32px ${teal}55` }}>
                Start 3-Month Free Trial →
              </Link>
              <Link href="/roof-size-calculator" style={{ fontSize: 15, fontWeight: 700, color: white, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', padding: '15px 26px', borderRadius: 12, textDecoration: 'none' }}>
                🛰️ Free Roof Measurement
              </Link>
            </div>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 16 }}>No credit card required · Cancel anytime</p>

            <div className="pg-hero-badge-row" style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Available on</span>
              <AppStoreBadges variant="store" />
            </div>
          </div>

          <DeviceMock />
        </div>
      </section>

      {/* ── Value strip ── */}
      <div style={{ background: navyMd, borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '18px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 30, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            ['Free', 'Satellite Measurements'],
            ['Free', 'Homeowner Estimates'],
            ['$0', 'Lead Fees'],
            ['$0', 'Measurement Fees'],
            ['101K+', 'Verified FL Contractor Profiles'],
            ['15+', 'Built-in Tools'],
            ['3 mo', 'Free Trial'],
          ].map(([num, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: tealLt }}>{num}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, maxWidth: 120 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile section ── one strong field-first block */}
      <section id="get-app" style={{ padding: '64px 24px', background: navy }}>
        <div className="pg-split" style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', gap: 56, alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="pg-split-copy" style={{ flex: '1 1 460px' }}>
            <SectionLabel text="Your business, in your pocket" />
            <h2 style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, margin: '0 0 14px', lineHeight: 1.12 }}>
              A complete job site in your pocket.
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 15.5, lineHeight: 1.7, margin: '0 0 22px', maxWidth: 480 }}>
              Measure roofs, shoot job photos, build estimates and update job status — all from the truck, the roof or the driveway.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 26 }}>
              {['Pull a roof measurement from satellite in ~30 seconds', 'Price the job and send an estimate from the field', 'Track every job from lead to paid', 'Live on Android · iOS coming soon'].map(x => (
                <span key={x} style={{ fontSize: 14.5, color: '#CBD5E1', display: 'inline-flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: tealLt, fontWeight: 700 }}>✓</span>{x}
                </span>
              ))}
            </div>
            <AppStoreBadges variant="store" />
          </div>
          <div className="pg-field-media" style={{ position: 'relative', flex: '0 0 auto', width: 500 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/app/roofer.jpg" alt="Roofing contractor managing a job from the field on ProGuild"
              style={{ width: '100%', display: 'block', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 30px 70px rgba(0,0,0,0.5)' }} />
            <Phone src="/app/dashboard.jpg" w={166} style={{ position: 'absolute', right: -14, bottom: -38, transform: 'perspective(1500px) rotateY(-10deg)' }} />
          </div>
        </div>
      </section>

      {/* ── Core platform ── everything you need (ABOVE trade-specific) */}
      <section id="platform" style={{ padding: '72px 24px', background: navyMd }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 46 }}>
            <SectionLabel text="Every contractor gets" />
            <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 800, margin: '0 0 12px' }}>Everything you need to run the business.</h2>
            <p style={{ color: '#64748B', fontSize: 15.5 }}>A complete CRM, built for how trade contractors actually work.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 16 }}>
            {coreFeatures.map(f => <Card key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      {/* ── Trade-specific ── dynamic tabs */}
      <section id="trades" style={{ padding: '72px 24px', background: navy }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <SectionLabel text="Built for your trade" />
            <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 800, margin: '0 0 12px' }}>Trade-specific tools. One platform.</h2>
            <p style={{ color: '#64748B', fontSize: 15.5, maxWidth: 520, margin: '0 auto' }}>
              Not a generic field-service app. Every trade gets purpose-built tools — roofing is where we go deepest today.
            </p>
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4, background: navyMd, borderRadius: 14, padding: 5, border: '1px solid rgba(255,255,255,0.08)' }}>
              {TRADES.map(tr => (
                <button key={tr.id} onClick={() => setTrade(tr.id)} style={{
                  padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13.5,
                  background: trade === tr.id ? teal : 'transparent',
                  color: trade === tr.id ? white : '#94A3B8',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}>
                  {tr.emoji} {tr.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h3 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, margin: '0 0 8px' }}>{t.headline}</h3>
            <p style={{ color: '#64748B', fontSize: 14.5, maxWidth: 560, margin: '0 auto' }}>{t.sub}</p>
          </div>

          <div className="pg-trade" style={{ display: 'flex', gap: 40, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ flex: '1 1 580px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
              {t.cards.map(c => <Card key={c.title} {...c} />)}
            </div>
            <Phone className="pg-trade-phone" src={t.phone} w={246} style={{ transform: 'perspective(1600px) rotateY(-9deg)' }} />
          </div>
        </div>
      </section>

      {/* ── HVAC depth showcase ── always-visible HVAC screens */}
      <section style={{ padding: '64px 24px', background: navyMd }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <SectionLabel text="Built for HVAC" />
          <h2 style={{ fontSize: 'clamp(24px,4vw,38px)', fontWeight: 800, margin: '0 0 12px' }}>Down to the refrigerant.</h2>
          <p style={{ color: '#64748B', fontSize: 15, maxWidth: 560, margin: '0 auto 8px' }}>
            Equipment digital twins, guided diagnosis and EPA-ready refrigerant logs — the HVAC-specific tools a generic field-service app doesn&rsquo;t have.
          </p>
          <div style={{ display: 'flex', gap: 26, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 40 }}>
            <Phone className="pg-hvac-extra" src="/app/hvac-diagnosis.jpg" w={210} style={{ transform: 'perspective(1600px) rotateY(9deg)' }} />
            <Phone src="/app/hvac-twin.jpg" w={226} style={{ transform: 'perspective(1700px) rotateY(0deg)', zIndex: 2 }} />
            <Phone className="pg-hvac-extra" src="/app/hvac-refrigerant.jpg" w={210} style={{ transform: 'perspective(1600px) rotateY(-9deg)' }} />
          </div>
        </div>
      </section>

      {/* ── Workflow ── */}
      <section style={{ padding: '72px 24px', background: navy }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 46 }}>
            <SectionLabel text="How it works" />
            <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 800, margin: '0 0 12px' }}>From lead to paid job.</h2>
            <p style={{ color: '#64748B', fontSize: 15, maxWidth: 520, margin: '0 auto' }}>One system for the whole job — no spreadsheets, no disconnected tools.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14 }}>
            {workflow.map((s, i) => (
              <div key={s.n} style={{ padding: '22px 18px', background: navyMd, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: i === workflow.length - 1 ? gold : tealLt, letterSpacing: '0.08em', marginBottom: 10 }}>{s.n}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: white, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Migration ── honest, quiet */}
      <section style={{ padding: '64px 24px', background: navy }}>
        <div style={{ maxWidth: 980, margin: '0 auto', background: navyMd, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '40px 36px', display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 340px' }}>
            <SectionLabel text="Bring your jobs with you" />
            <h2 style={{ fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, margin: '0 0 12px' }}>Switching from another CRM?</h2>
            <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.65, margin: 0 }}>
              Import your existing customers, jobs and insurance data via CSV — including exports from JobNimbus, AccuLynx, Roofr and other popular CRMs. We auto-map the columns.
            </p>
          </div>
          <div style={{ flex: '0 1 320px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
              {['JobNimbus', 'AccuLynx', 'Roofr', 'CSV'].map((x, i, a) => (
                <span key={x} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#CBD5E1', background: navy, border: `1px solid ${navyLt}`, borderRadius: 8, padding: '7px 12px' }}>{x}</span>
                  {i < a.length - 1 && <span style={{ color: tealLt, fontSize: 14 }}>→</span>}
                </span>
              ))}
            </div>
            <Link href="/login?tab=signup" style={{ display: 'inline-block', fontSize: 14, fontWeight: 700, color: white, background: teal, padding: '11px 22px', borderRadius: 10, textDecoration: 'none' }}>
              Import Your Jobs →
            </Link>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 12 }}>Column auto-mapping · Insurance data included · Up to 500 rows per file</div>
          </div>
        </div>
      </section>

      {/* ── Comparison + stack math ── */}
      <section style={{ padding: '56px 24px 80px', background: navy }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div className="pg-roi" style={{ display: 'flex', gap: 44, alignItems: 'center', marginBottom: 48 }}>
            <div style={{ flex: '1 1 540px' }}>
              <div style={{ marginBottom: 24 }}>
                <SectionLabel text="More tools. Less cost." color={gold} />
                <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>Everything your business needs, in one place.</h2>
                <p style={{ color: '#94A3B8', fontSize: 15, maxWidth: 520, margin: 0 }}>
                  Most contractors juggle a CRM, a measurement vendor, a lead service and a supplementing cut. ProGuild is all of it — flat.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
                {stackReplaces.map(s => (
                  <div key={s.tool} style={{ padding: '14px 16px', background: navyMd, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 6, textDecoration: 'line-through', textDecorationColor: '#EF444488' }}>{s.tool}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#EF4444' }}>{s.cost}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', padding: '16px', background: `${teal}18`, borderRadius: 12, border: `1px solid ${teal}44` }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: white }}>ProGuild: all of it, for </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: tealLt }}>$49.99/mo flat.</span>
                <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>One EagleView report costs more than a month of ProGuild. One recovered supplement pays for years.</div>
              </div>
            </div>
            <Phone className="pg-roi-phone" src="/app/pricing.jpg" w={226} style={{ transform: 'perspective(1600px) rotateY(-9deg)' }} />
          </div>

          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h3 style={{ fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, margin: '0 0 10px' }}>How ProGuild compares</h3>
            <p style={{ color: '#64748B', fontSize: 14, maxWidth: 560, margin: '0 auto' }}>
              A check means it&rsquo;s included in the base subscription at no extra cost. Competitors may offer some of these as paid add-ons or third-party integrations.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', color: '#94A3B8', fontWeight: 600 }}>Tool</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', color: '#94A3B8', fontWeight: 600 }}>Price</th>
                  <th style={{ textAlign: 'center', padding: '12px 10px', color: '#94A3B8', fontWeight: 600, fontSize: 12 }}>Supplement</th>
                  <th style={{ textAlign: 'center', padding: '12px 10px', color: '#94A3B8', fontWeight: 600, fontSize: 12 }}>Satellite</th>
                  <th style={{ textAlign: 'center', padding: '12px 10px', color: '#94A3B8', fontWeight: 600, fontSize: 12 }}>Visualizer</th>
                  <th style={{ textAlign: 'center', padding: '12px 10px', color: '#94A3B8', fontWeight: 600, fontSize: 12 }}>Directory</th>
                  <th style={{ textAlign: 'center', padding: '12px 10px', color: '#94A3B8', fontWeight: 600, fontSize: 12 }}>Mobile</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c, i) => (
                  <tr key={c.name} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: c.highlight ? `${teal}18` : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    outline: c.highlight ? `1px solid ${teal}44` : 'none',
                  }}>
                    <td style={{ padding: '14px 16px', fontWeight: c.highlight ? 800 : 400, color: c.highlight ? tealLt : white }}>
                      {c.highlight && <span style={{ fontSize: 10, background: teal, color: white, padding: '2px 6px', borderRadius: 4, marginRight: 8, fontWeight: 700 }}>YOU</span>}
                      {c.name}
                    </td>
                    <td style={{ textAlign: 'center', padding: '14px 16px', color: c.highlight ? tealLt : (c.perLead ? '#EF4444' : '#94A3B8'), fontWeight: c.highlight ? 700 : 400 }}>{c.price}</td>
                    <td style={{ textAlign: 'center', padding: '14px 10px' }}><Check yes={c.supplement} /></td>
                    <td style={{ textAlign: 'center', padding: '14px 10px' }}><Check yes={c.satellite} /></td>
                    <td style={{ textAlign: 'center', padding: '14px 10px' }}><Check yes={c.visualizer} /></td>
                    <td style={{ textAlign: 'center', padding: '14px 10px' }}><Check yes={c.directory} /></td>
                    <td style={{ textAlign: 'center', padding: '14px 10px' }}><Check yes={c.mobile} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 16 }}>* Reflects features included in each tool&rsquo;s base plan and publicly listed pricing (2026); some competitors offer additional capabilities via paid add-ons or integrations. Verify current details with each vendor. EagleView charges per report; Angi/Thumbtack charge per lead.</p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" style={{ padding: '72px 24px 80px', background: navyMd }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <SectionLabel text="Simple Pricing" />
          <h2 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 800, margin: '0 0 12px' }}>One flat rate. No surprises.</h2>
          <p style={{ color: '#64748B', marginBottom: 48 }}>Start free for 3 months — no credit card needed.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20, textAlign: 'left' }}>
            {[
              { trade: 'Roofing', price: '$49.99', color: teal, features: ['Free homeowner estimate tool (drives leads to you)', 'Insurance supplement recovery', 'Free satellite measurements', 'Roof Visualizer (15 shingle colors)', 'Full CRM + pipeline', 'Proposals + milestone invoicing', 'Team & multi-user access', 'Mobile app (Android — iOS soon)', 'Verified contractor directory listing'] },
              { trade: 'All Other Trades', price: '$29.99', color: '#7C3AED', features: ['Full CRM + pipeline', 'Estimates + invoicing', 'Calendar + scheduling', 'Client & property records', 'Trade-specific job fields', 'Team & multi-user access', 'Mobile app (Android — iOS soon)', 'Verified contractor directory listing'] },
            ].map(plan => (
              <div key={plan.trade} style={{ background: navy, border: `1px solid ${plan.color}44`, borderRadius: 20, padding: 32 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: plan.color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{plan.trade}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 6 }}>
                  <span style={{ fontSize: 46, fontWeight: 900, color: white, lineHeight: 1 }}>{plan.price}</span>
                  <span style={{ fontSize: 16, color: '#64748B', marginBottom: 8 }}>/mo</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>after 3-month free trial</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ display: 'flex', gap: 10, fontSize: 13.5, color: '#CBD5E1' }}>
                      <span style={{ color: plan.color, flexShrink: 0, marginTop: 1 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login?tab=signup" style={{ display: 'block', textAlign: 'center', padding: '13px 0', borderRadius: 10, background: `linear-gradient(135deg,${plan.color},${plan.color}cc)`, color: white, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  Start Free Trial →
                </Link>
              </div>
            ))}

            {/* Reassurance card */}
            <div style={{ background: navy, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
              {[
                ['💳', 'No credit card required', 'Start your trial in minutes.'],
                ['🚫', 'Cancel anytime', 'No contracts, no lock-in.'],
                ['📥', 'Bring your jobs', 'Import by CSV from your old CRM — insurance claim data included.'],
              ].map(([icon, title, desc]) => (
                <div key={title as string} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: white }}>{title}</div>
                    <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5, marginTop: 2 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Claim your profile ── FL-map band */}
      <section style={{ padding: '72px 24px', background: navy }}>
        <div style={{ maxWidth: 940, margin: '0 auto', background: `linear-gradient(135deg,${navyMd},${navyLt})`, border: `1px solid ${teal}33`, borderRadius: 24, padding: '48px 40px', display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
          {/* FL map */}
          <div style={{ flex: '0 0 auto', position: 'relative' }}>
            <svg viewBox="0 0 160 140" width="180" height="158" aria-hidden="true">
              <path d="M8,34 L96,30 L100,46 L112,50 L118,44 L126,48 L130,62 L138,86 L140,106 L134,122 L124,130 L116,126 L112,108 L104,88 L92,70 L78,60 L60,56 L40,56 L24,50 L12,44 Z"
                fill={`${teal}33`} stroke={tealLt} strokeWidth="2" strokeLinejoin="round" />
              {[[46, 44], [88, 54], [120, 92]].map(([cx, cy], i) => (
                <g key={i}>
                  <circle cx={cx} cy={cy} r="7" fill={navy} stroke={gold} strokeWidth="2" />
                  <circle cx={cx} cy={cy} r="2.5" fill={gold} />
                </g>
              ))}
              <text x="74" y="110" fill={tealLt} fontSize="11" fontWeight="700" letterSpacing="1.5" textAnchor="middle" style={{ opacity: 0.8 }}>FLORIDA</text>
            </svg>
          </div>
          <div style={{ flex: '1 1 380px', minWidth: 300 }}>
            <SectionLabel text="Your ProGuild profile may already be live" />
            <h2 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, margin: '0 0 14px', lineHeight: 1.12 }}>
              Claim your verified profile.
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 15.5, lineHeight: 1.65, marginBottom: 24, maxWidth: 440 }}>
              We may already have your business profile from Florida state licensing records — over 101,000 contractors are in the directory. Find yours, claim it free, and start managing your jobs.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
              <Link href="/claim/find" style={{ fontSize: 15, fontWeight: 800, color: white, background: `linear-gradient(135deg,${teal},#0D9488)`, padding: '14px 30px', borderRadius: 12, textDecoration: 'none', boxShadow: `0 8px 32px ${teal}55` }}>
                Find My Profile →
              </Link>
              <Link href="/login?tab=signup" style={{ fontSize: 15, fontWeight: 700, color: white, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', padding: '14px 26px', borderRadius: 12, textDecoration: 'none' }}>
                Start Free Trial
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Verified from state records', 'Appear in homeowner searches', 'Build your reputation', 'No lead fees'].map(x => (
                <span key={x} style={{ fontSize: 12.5, color: '#64748B', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: tealLt }}>✓</span>{x}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final app CTA ── bookend */}
      <section style={{ padding: '0 24px 90px', background: navy }}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${teal}22`, border: `1px solid ${teal}44`, borderRadius: 20, padding: '6px 14px', marginBottom: 20 }}>
            <span style={{ fontSize: 12, color: tealLt, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>For Contractors</span>
          </div>
          <h2 style={{ fontSize: 'clamp(22px,3.5vw,30px)', fontWeight: 800, margin: '0 0 12px' }}>Your business doesn&rsquo;t stop at the office.</h2>
          <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.6, margin: '0 auto 24px', maxWidth: 440 }}>
            Run ProGuild from the truck, the roof, or the job site. Manage leads, send estimates and invoices, and track jobs from the field.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <AppStoreBadges variant="store" />
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#475569' }}>
          © 2026 ProGuild LLC · <Link href="/privacy" style={{ color: '#475569', textDecoration: 'none' }}>Privacy</Link> · <Link href="/terms" style={{ color: '#475569', textDecoration: 'none' }}>Terms</Link> · contact@proguild.ai
        </div>
      </footer>
    </div>
  )
}
