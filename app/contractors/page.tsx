'use client'
import Link from 'next/link'
import { useState } from 'react'

const teal   = '#0F766E'
const tealLt = '#2DD4BF'
const navy   = '#0A1628'
const navyMd = '#0F2240'
const navyLt = '#1E3A5F'
const cream  = '#F8F6F1'
const gold   = '#F59E0B'
const white  = '#FFFFFF'

// ── Feature data ─────────────────────────────────────────────────────────────

const roofingFeatures = [
  { icon: '🛡️', title: 'Insurance Supplement Recovery', desc: 'AI scans every claim and surfaces missed line items. Roofers recover an average of $4,200 per supplemented claim — most CRMs don\'t touch supplements at all.' },
  { icon: '🛰️', title: 'Free Satellite Measurements', desc: 'Pull rooftop dimensions from satellite imagery in seconds. EagleView charges $35 per report. We include unlimited measurements with every plan.' },
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
  { icon: '📱', title: 'iOS + Android App', desc: 'Full CRM in your pocket. Capture photos, measure roofs, create leads from the job site.' },
  { icon: '✅', title: 'License Verified', desc: 'Your license is verified against state databases. Homeowners see the checkmark — instant credibility.' },
  { icon: '🗂️', title: 'Client & Property Records', desc: 'Every client, every property, every job — searchable, organized, one place.' },
  { icon: '📆', title: 'Job Calendar', desc: 'Schedule inspections, installs, and follow-ups. See your week without juggling spreadsheets.' },
  { icon: '📍', title: 'Contractor Directory', desc: 'Your verified profile appears when homeowners search for licensed contractors in your area. No per-lead fee.' },
]

const competitors = [
  { name: 'ProGuild', price: '$49.99/mo', supplement: true, satellite: true, visualizer: true, directory: true, mobile: true, perLead: false, highlight: true },
  { name: 'AccuLynx', price: '$200+/mo', supplement: false, satellite: false, visualizer: false, directory: false, mobile: true, perLead: false, highlight: false },
  { name: 'JobNimbus', price: '$150+/mo', supplement: false, satellite: false, visualizer: false, directory: false, mobile: true, perLead: false, highlight: false },
  { name: 'Angi / Thumbtack', price: '$50–300/lead', supplement: false, satellite: false, visualizer: false, directory: true, mobile: false, perLead: true, highlight: false },
  { name: 'EagleView alone', price: '$35/report', supplement: false, satellite: true, visualizer: false, directory: false, mobile: false, perLead: false, highlight: false },
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContractorsPage() {
  const [activeTab, setActiveTab] = useState<'roofing' | 'hvac'>('roofing')

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: navy, color: white, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg,${teal},${tealLt})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: white }}>PG</div>
            <span style={{ fontSize: 17, fontWeight: 700, color: white }}>ProGuild.ai</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/roof-size-calculator" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Free Measurement</Link>
            <Link href="/roof-visualizer" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Roof Visualizer</Link>
            <Link href="/login" style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'none' }}>Sign in</Link>
            <Link href="/signup" style={{ fontSize: 14, fontWeight: 700, color: white, background: teal, padding: '8px 18px', borderRadius: 8, textDecoration: 'none' }}>Start Free →</Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Glow */}
        <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: `radial-gradient(ellipse,${teal}33 0%,transparent 70%)`, pointerEvents: 'none' }} />

        <div style={{ maxWidth: 780, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${teal}22`, border: `1px solid ${teal}44`, borderRadius: 20, padding: '6px 14px', marginBottom: 28 }}>
            <span style={{ fontSize: 12, color: tealLt, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>State-Licensed · Verified Contractors</span>
          </div>

          <h1 style={{ fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 900, lineHeight: 1.05, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
            The CRM built for<br />
            <span style={{ background: `linear-gradient(90deg,${tealLt},${gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>trade contractors</span>
          </h1>

          <p style={{ fontSize: 18, color: '#94A3B8', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 40px' }}>
            Satellite measurements, insurance supplement recovery, roof visualizer, and a verified contractor directory — all in one flat subscription. No per-lead fees. No per-report charges.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" style={{ fontSize: 16, fontWeight: 800, color: white, background: `linear-gradient(135deg,${teal},#0D9488)`, padding: '14px 32px', borderRadius: 12, textDecoration: 'none', boxShadow: `0 8px 32px ${teal}55` }}>
              Start 3-Month Free Trial →
            </Link>
            <Link href="/roof-size-calculator" style={{ fontSize: 16, fontWeight: 700, color: white, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '14px 32px', borderRadius: 12, textDecoration: 'none' }}>
              🛰️ Free Roof Measurement
            </Link>
            <Link href="/roof-visualizer" style={{ fontSize: 16, fontWeight: 700, color: tealLt, background: 'rgba(45,212,191,0.1)', border: `1px solid ${tealLt}44`, padding: '14px 32px', borderRadius: 12, textDecoration: 'none' }}>
              🎨 Roof Visualizer
            </Link>
          </div>

          <p style={{ fontSize: 13, color: '#475569', marginTop: 16 }}>No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── Social proof strip ── */}
      <div style={{ background: navyMd, borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '18px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            ['Free', 'Satellite Roof Measurement'],
            ['Free', 'Homeowner Estimate Tool'],
            ['124,000+', 'Licensed Contractors in Database'],
            ['$0', 'Per-Lead Fee'],
            ['$0', 'Per Measurement Report'],
            ['15', 'Real Shingle Colors'],
            ['3 months', 'Free Trial, No Card'],
          ].map(([num, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: tealLt }}>{num}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trade tabs ── */}
      <section style={{ padding: '72px 24px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, margin: '0 0 16px' }}>
              Built for your trade.<br />Not a generic field service app.
            </h2>
            <p style={{ color: '#64748B', fontSize: 16, maxWidth: 480, margin: '0 auto 32px' }}>
              Every trade gets purpose-built tools. Roofers aren't HVAC techs. We built for both.
            </p>
            {/* Tab switcher */}
            <div style={{ display: 'inline-flex', background: navyMd, borderRadius: 12, padding: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
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
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
                {roofingFeatures.map(f => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} dark />)}
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, padding: '16px', background: `${teal}18`, borderRadius: 12, border: `1px solid ${teal}33` }}>
                <span style={{ fontSize: 14, color: tealLt, fontWeight: 600 }}>🛰️ Roofers save $35 per job vs EagleView · 📋 Supplement recovery averages $4,200 per claim</span>
              </div>
            </div>
          )}

          {activeTab === 'hvac' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
              {hvacFeatures.map(f => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} dark />)}
            </div>
          )}
        </div>
      </section>

      {/* ── All trades section ── */}
      <section style={{ padding: '72px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: tealLt, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Every Trade</div>
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>Everything in the box</h2>
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

      {/* ── Competitor comparison ── */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: gold, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Honest Comparison</div>
            <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>Why contractors switch to ProGuild</h2>
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
          <p style={{ fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 16 }}>* Competitor pricing approximate. EagleView charges per report. Angi/Thumbtack charges per lead.</p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: tealLt, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Simple Pricing</div>
          <h2 style={{ fontSize: 'clamp(26px,4vw,40px)', fontWeight: 800, margin: '0 0 12px' }}>One flat rate. No surprises.</h2>
          <p style={{ color: '#64748B', marginBottom: 48 }}>Start free for 3 months — no credit card needed.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
            {[
              { trade: 'Roofing', price: '$49.99', color: teal, features: ['Free homeowner estimate tool (drives leads to you)', 'Insurance supplement recovery', 'Free satellite measurements', 'Roof Visualizer (15 shingle colors)', 'Full CRM + pipeline', 'Proposals + milestone invoicing', 'Mobile app (iOS + Android)', 'Verified contractor directory listing'] },
              { trade: 'All Other Trades', price: '$29.99', color: '#7C3AED', features: ['Equipment tracking (HVAC, Plumbing)', 'Full CRM + pipeline', 'Estimates + invoicing', 'Calendar + scheduling', 'Mobile app (iOS + Android)', 'Verified contractor directory listing', 'Voice-to-notes'] },
            ].map(plan => (
              <div key={plan.trade} style={{ background: navyMd, border: `1px solid ${plan.color}44`, borderRadius: 20, padding: 32, textAlign: 'left' }}>
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
                <Link href="/signup" style={{ display: 'block', textAlign: 'center', padding: '13px 0', borderRadius: 10, background: `linear-gradient(135deg,${plan.color},${plan.color}cc)`, color: white, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  Start Free Trial →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', background: `linear-gradient(135deg,${navyMd},${navyLt})`, border: `1px solid ${teal}33`, borderRadius: 24, padding: '56px 40px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🏆</div>
          <h2 style={{ fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, margin: '0 0 16px' }}>
            Your competitors are already<br />using better tools.
          </h2>
          <p style={{ color: '#64748B', fontSize: 16, lineHeight: 1.6, marginBottom: 36 }}>
            Join the verified contractor network. Start free for 3 months — no credit card, no commitment. Your profile goes live the day you sign up.
          </p>
          <Link href="/signup" style={{ display: 'inline-block', fontSize: 17, fontWeight: 800, color: white, background: `linear-gradient(135deg,${teal},#0D9488)`, padding: '16px 40px', borderRadius: 12, textDecoration: 'none', boxShadow: `0 8px 32px ${teal}55` }}>
            Claim Your Free Profile →
          </Link>
          <div style={{ marginTop: 20, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['✓ No credit card', '✓ 3 months free', '✓ Cancel anytime'].map(t => (
              <span key={t} style={{ fontSize: 13, color: '#475569' }}>{t}</span>
            ))}
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
