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

// ── Feature data ─────────────────────────────────────────────────────────────

const roofingFeatures = [
  { icon: '🛡️', title: 'Insurance Supplement Recovery', desc: 'AI scans every claim and surfaces missed line items. Roofers often recover several thousand dollars per supplemented claim — most CRMs don\'t touch supplements at all.' },
  { icon: '🛰️', title: 'Free Satellite Measurements', desc: 'Pull rooftop dimensions from satellite imagery in seconds. EagleView charges $40–91 per report. We include unlimited measurements with every plan.' },
  { icon: '🎨', title: 'Roof Visualizer', desc: 'Upload a photo and show homeowners their roof in 15 real shingle colors from GAF, Owens Corning, CertainTeed, IKO and Atlas. Close deals on the spot.' },
  { icon: '📋', title: 'Insurance Pipeline', desc: 'Built-in stages for every step of the insurance claim cycle — from inspection to adjuster meeting to supplement to check received.' },
  { icon: '🏷️', title: 'Free Roofing Estimate Tool', desc: 'Homeowners get a free instant roof estimate powered by satellite data. They come to you pre-educated — no cold leads, no tire kickers.' },
  { icon: '💳', title: 'Milestone Invoicing', desc: 'Send an invoice with deposit, material delivery, and completion milestones. Homeowners confirm payment online.' },
]

const hvacFeatures = [
  { icon: '🔧', title: 'Equipment Twins', desc: 'Every unit on every job has a digital twin — model, serial, install date, last service. Pull it up by scanning a QR code at the equipment.' },
  { icon: '📅', title: 'Maintenance Plans', desc: 'Schedule recurring maintenance, send automated reminders, and track completion. Your most loyal customers on autopilot.' },
  { icon: '🌡️', title: 'PT Diagnostic Table', desc: 'In-app pressure/temperature chart for R-410A, R-22, R-32, and R-454B — extended to 130°F. No more paper charts at job sites.' },
  { icon: '🎙️', title: 'Voice Job Notes', desc: 'Speak your notes on-site, AI structures them into a job record. No typing in dirty gloves.' },
]

const allTradeFeatures = [
  { icon: '📊', title: 'Visual Job Pipeline', desc: 'Kanban board showing every job by stage. See your whole book of business at a glance.' },
  { icon: '📱', title: 'Mobile App — Android', desc: 'Full CRM in your pocket — capture photos, measure roofs, create leads on-site. Live on Android; iOS coming soon.' },
  { icon: '✅', title: 'License Verified', desc: 'Your license is verified against state databases. Homeowners see the checkmark — instant credibility.' },
  { icon: '🗂️', title: 'Client & Property Records', desc: 'Every client, every property, every job — searchable, organized, one place.' },
  { icon: '📆', title: 'Job Calendar', desc: 'Schedule inspections, installs, and follow-ups. See your week without juggling spreadsheets.' },
  { icon: '📍', title: 'Contractor Directory', desc: 'Your verified profile appears when homeowners search for licensed contractors in your area. No per-lead fee.' },
  { icon: '👥', title: 'Team & Multi-User', desc: 'Add your crew with roles and per-member lead attribution — see who\'s working what, on web and mobile.' },
]

// What you'd otherwise pay — the stack ProGuild replaces (publicly listed ranges).
const stackReplaces = [
  { tool: 'CRM (AccuLynx / JobNimbus)', cost: '$150–200/mo' },
  { tool: 'Measurements (EagleView)',    cost: '$40–91/report' },
  { tool: 'Leads (Angi / Thumbtack)',    cost: '$50–300/lead' },
  { tool: 'Supplementing service',       cost: '% of every claim' },
]

// From lead to paid job — the field workflow.
const workflow = [
  { n: '01', title: 'Get the lead',    desc: 'Directory, free estimate tool, or import your book.' },
  { n: '02', title: 'Measure & build', desc: 'Free satellite measurement → estimate in minutes.' },
  { n: '03', title: 'Win the work',    desc: 'Visualizer close, e-signed proposal, deposit collected.' },
  { n: '04', title: 'Run production',  desc: 'Photos, milestones, supplements, documents — tracked.' },
  { n: '05', title: 'Get paid',        desc: 'Milestone invoices, online payment, claim reconciled.' },
]

const competitors = [
  { name: 'ProGuild', price: '$49.99/mo', supplement: true, satellite: true, visualizer: true, directory: true, mobile: true, perLead: false, highlight: true },
  { name: 'AccuLynx', price: '$200+/mo', supplement: false, satellite: false, visualizer: false, directory: false, mobile: true, perLead: false, highlight: false },
  { name: 'JobNimbus', price: '$150+/mo', supplement: false, satellite: false, visualizer: false, directory: false, mobile: true, perLead: false, highlight: false },
  { name: 'Angi / Thumbtack', price: '$50–300/lead', supplement: false, satellite: false, visualizer: false, directory: true, mobile: false, perLead: true, highlight: false },
  { name: 'EagleView alone', price: '$40–91/report', supplement: false, satellite: true, visualizer: false, directory: false, mobile: false, perLead: false, highlight: false },
]

// ── Components ────────────────────────────────────────────────────────────────

function Check({ yes }: { yes: boolean }) {
  return <span style={{ fontSize: 18, color: yes ? '#10B981' : '#CBD5E1' }}>{yes ? '✓' : '✕'}</span>
}

function FeatureCard({ icon, title, desc, dark }: { icon: string; title: string; desc: string; dark?: boolean }) {
  return (
    <div style={{
      background: dark ? navyMd : white,
      border: `1px solid ${dark ? navyLt : '#E2E8F0'}`,
      borderRadius: 16, padding: '24px 20px',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.15)' }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: dark ? white : navy, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: dark ? '#94A3B8' : '#64748B', lineHeight: 1.6 }}>{desc}</div>
    </div>
  )
}

function SectionLabel({ text, color = tealLt }: { text: string; color?: string }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>{text}</div>
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContractorsPage() {
  const [activeTab, setActiveTab] = useState<'roofing' | 'hvac'>('roofing')

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: navy, color: white, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" width={32} height={32} alt="ProGuild" style={{ borderRadius: 8 }} />
            <span style={{ fontSize: 17, fontWeight: 700, color: white }}>ProGuild.ai</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/roof-size-calculator" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Free Measurement</Link>
            <Link href="/claim/find" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Claim Profile</Link>
            <Link href="/login" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Sign in</Link>
            <Link href="/login?tab=signup" style={{ fontSize: 14, fontWeight: 700, color: white, background: teal, padding: '8px 18px', borderRadius: 8, textDecoration: 'none' }}>Start Free →</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── money-first */}
      <section style={{ padding: '80px 24px 56px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Glow */}
        <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: `radial-gradient(ellipse,${teal}33 0%,transparent 70%)`, pointerEvents: 'none' }} />

        <div style={{ maxWidth: 820, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${teal}22`, border: `1px solid ${teal}44`, borderRadius: 20, padding: '6px 14px', marginBottom: 28 }}>
            <span style={{ fontSize: 12, color: tealLt, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Built for Florida roofing &amp; restoration pros</span>
          </div>

          <h1 style={{ fontSize: 'clamp(38px, 6.5vw, 72px)', fontWeight: 900, lineHeight: 1.03, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
            Win more roofs.<br />
            <span style={{ background: `linear-gradient(90deg,${tealLt},${gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Keep more of the money.</span>
          </h1>

          <p style={{ fontSize: 18, color: '#CBD5E1', lineHeight: 1.7, maxWidth: 620, margin: '0 auto 14px' }}>
            Free satellite measurements, insurance supplement recovery, and a homeowner directory that sends you leads — with no per-lead fees.
          </p>
          <p style={{ fontSize: 15, color: '#94A3B8', lineHeight: 1.6, maxWidth: 560, margin: '0 auto 38px' }}>
            Everything you&rsquo;re paying AccuLynx, EagleView and Angi for — in one app, for <strong style={{ color: white }}>$49.99/mo</strong>.
          </p>

          {/* CTA hierarchy: primary / secondary / tertiary */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/login?tab=signup" style={{ fontSize: 17, fontWeight: 800, color: white, background: `linear-gradient(135deg,${teal},#0D9488)`, padding: '16px 36px', borderRadius: 12, textDecoration: 'none', boxShadow: `0 8px 32px ${teal}55` }}>
              Start 3-Month Free Trial →
            </Link>
            <Link href="/roof-size-calculator" style={{ fontSize: 15, fontWeight: 700, color: white, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', padding: '15px 26px', borderRadius: 12, textDecoration: 'none' }}>
              🛰️ Measure a roof free
            </Link>
          </div>
          <div style={{ marginTop: 14 }}>
            <Link href="/roof-visualizer" style={{ fontSize: 14, color: tealLt, textDecoration: 'none', fontWeight: 600 }}>
              🎨 Try the Roof Visualizer →
            </Link>
          </div>

          <p style={{ fontSize: 13, color: '#64748B', marginTop: 18 }}>No credit card required · Cancel anytime</p>

          {/* Mobile availability */}
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Run it from the field</span>
            <AppStoreBadges tone="dark" />
          </div>
        </div>
      </section>

      {/* ── Honest proof strip ── */}
      <div style={{ background: navyMd, borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '18px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            ['Free', 'Satellite Roof Measurements'],
            ['Free', 'Homeowner Estimate Tool'],
            ['$0', 'Per-Lead Fees — Ever'],
            ['$0', 'Per Measurement Report'],
            ['101k', 'DBPR-Verified FL Profiles'],
            ['15', 'Real Shingle Colors'],
            ['3 mo', 'Free Trial, No Card'],
          ].map(([num, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: tealLt }}>{num}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile micro-block ── field-first */}
      <section style={{ padding: '56px 24px', background: navy }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ flex: '1 1 420px', maxWidth: 560 }}>
            <SectionLabel text="Your business, in your pocket" />
            <h2 style={{ fontSize: 'clamp(24px,3.5vw,34px)', fontWeight: 800, margin: '0 0 14px', lineHeight: 1.15 }}>
              Measure the roof while you&rsquo;re standing on it.
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 15.5, lineHeight: 1.7, margin: '0 auto 22px', maxWidth: 480 }}>
              Shoot job photos, pull a measurement, build an estimate, and create leads before you leave the driveway. The whole CRM travels with your crew — live on Android, iOS coming soon.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AppStoreBadges tone="dark" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trade tabs ── */}
      <section style={{ padding: '64px 24px 0', background: navyMd }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, margin: '0 0 16px' }}>
              Built for your trade.<br />Not a generic field service app.
            </h2>
            <p style={{ color: '#64748B', fontSize: 16, maxWidth: 480, margin: '0 auto 32px' }}>
              Every trade gets purpose-built tools. Roofers aren&rsquo;t HVAC techs. We built for both.
            </p>
            {/* Tab switcher */}
            <div style={{ display: 'inline-flex', background: navy, borderRadius: 12, padding: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
              {(['roofing', 'hvac'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: '10px 28px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                  background: activeTab === tab ? teal : 'transparent',
                  color: activeTab === tab ? white : '#64748B',
                  transition: 'all 0.2s',
                }}>
                  {tab === 'roofing' ? '🏠 Roofing' : '❄️ HVAC'}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'roofing' && (
            <div style={{ paddingBottom: 64 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
                {roofingFeatures.map(f => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />)}
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, padding: '16px', background: `${teal}18`, borderRadius: 12, border: `1px solid ${teal}33` }}>
                <span style={{ fontSize: 14, color: tealLt, fontWeight: 600 }}>🛰️ Roofers save $40+ per report vs EagleView · 📋 Supplement recovery often runs several thousand per claim</span>
              </div>
            </div>
          )}

          {activeTab === 'hvac' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16, paddingBottom: 64 }}>
              {hvacFeatures.map(f => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── All trades section ── */}
      <section style={{ padding: '72px 24px', background: navy }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <SectionLabel text="Every Trade" />
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>Everything you need to run the business</h2>
            <p style={{ color: '#64748B', fontSize: 15 }}>Included with every plan — no add-ons, no surprises.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
            {allTradeFeatures.map(f => (
              <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '18px 20px', background: navyMd, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: white, marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── from lead to paid job */}
      <section style={{ padding: '72px 24px', background: navyMd }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <SectionLabel text="How it works" />
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>From lead to paid job.</h2>
            <p style={{ color: '#64748B', fontSize: 15, maxWidth: 520, margin: '0 auto' }}>One system for the whole job — not five apps duct-taped together.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14 }}>
            {workflow.map((s, i) => (
              <div key={s.n} style={{ position: 'relative', padding: '22px 18px', background: navy, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: i === workflow.length - 1 ? gold : tealLt, letterSpacing: '0.08em', marginBottom: 10 }}>{s.n}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: white, marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stack replacement + comparison ── */}
      <section style={{ padding: '72px 24px 80px', background: navy }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <SectionLabel text="The math" color={gold} />
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>One app replaces four subscriptions.</h2>
            <p style={{ color: '#94A3B8', fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
              Most roofers juggle a CRM, a measurement vendor, a lead service, and a supplementing cut. ProGuild is all four — flat.
            </p>
          </div>

          {/* Stack-replacement callout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 20 }}>
            {stackReplaces.map(s => (
              <div key={s.tool} style={{ padding: '16px 18px', background: navyMd, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#CBD5E1', marginBottom: 6, textDecoration: 'line-through', textDecorationColor: '#EF444488' }}>{s.tool}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#EF4444' }}>{s.cost}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginBottom: 44, padding: '18px', background: `${teal}18`, borderRadius: 12, border: `1px solid ${teal}44` }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: white }}>ProGuild: all four, for </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: tealLt }}>$49.99/mo flat.</span>
            <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>One EagleView report costs more than a month of ProGuild. One recovered supplement pays for years.</div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
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
      <section style={{ padding: '72px 24px 80px', background: navyMd }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <SectionLabel text="Simple Pricing" />
          <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>One flat rate. No surprises.</h2>
          <p style={{ color: '#64748B', marginBottom: 48 }}>Start free for 3 months — no credit card needed.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
            {[
              { trade: 'Roofing', price: '$49.99', color: teal, features: ['Free homeowner estimate tool (drives leads to you)', 'Insurance supplement recovery', 'Free satellite measurements', 'Roof Visualizer (15 shingle colors)', 'Full CRM + pipeline', 'Proposals + milestone invoicing', 'Team & multi-user access', 'Mobile app (Android — iOS soon)', 'Verified contractor directory listing'] },
              { trade: 'All Other Trades', price: '$29.99', color: '#7C3AED', features: ['Equipment tracking (HVAC, Plumbing)', 'Full CRM + pipeline', 'Estimates + invoicing', 'Calendar + scheduling', 'Team & multi-user access', 'Mobile app (Android — iOS soon)', 'Verified contractor directory listing', 'Voice-to-notes'] },
            ].map(plan => (
              <div key={plan.trade} style={{ background: navy, border: `1px solid ${plan.color}44`, borderRadius: 20, padding: 32, textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: plan.color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{plan.trade}</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 6 }}>
                  <span style={{ fontSize: 48, fontWeight: 900, color: white, lineHeight: 1 }}>{plan.price}</span>
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
          </div>

          {/* Import reassurance — honest, low-key */}
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 28, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Switching from AccuLynx, JobNimbus or Roofr? Bring your jobs with you — import by CSV and we auto-map the columns, insurance claim data included.
          </p>
        </div>
      </section>

      {/* ── Claim your profile ── replaces competitor-shaming CTA */}
      <section style={{ padding: '72px 24px', background: navy }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', background: `linear-gradient(135deg,${navyMd},${navyLt})`, border: `1px solid ${teal}33`, borderRadius: 24, padding: '56px 40px' }}>
          <SectionLabel text="Already licensed in Florida?" />
          <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, margin: '0 0 14px', lineHeight: 1.1 }}>
            Your verified profile may already be live.
          </h2>
          <p style={{ color: '#94A3B8', fontSize: 16, lineHeight: 1.6, marginBottom: 32, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            Over 101,000 Florida contractors are already DBPR-verified in the ProGuild directory. Find yours by license number, claim it free, and start showing homeowners the verified checkmark.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/claim/find" style={{ fontSize: 16, fontWeight: 800, color: white, background: `linear-gradient(135deg,${teal},#0D9488)`, padding: '15px 34px', borderRadius: 12, textDecoration: 'none', boxShadow: `0 8px 32px ${teal}55` }}>
              Find My Profile →
            </Link>
            <Link href="/login?tab=signup" style={{ fontSize: 15, fontWeight: 700, color: white, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', padding: '15px 28px', borderRadius: 12, textDecoration: 'none' }}>
              Start a Free Trial
            </Link>
          </div>
          <div style={{ marginTop: 24, display: 'flex', gap: 22, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['✓ DBPR-verified', '✓ No lead fees', '✓ Your data is yours', '✓ Cancel anytime'].map(t => (
              <span key={t} style={{ fontSize: 13, color: '#64748B' }}>{t}</span>
            ))}
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
            <AppStoreBadges tone="dark" />
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
