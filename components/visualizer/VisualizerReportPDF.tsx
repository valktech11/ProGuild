import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

export interface VisualizerRender {
  renderUrl:    string
  skuName:      string
  manufacturer: string
  hexPreview:   string
  isChosen?:    boolean
}

export interface VisualizerReportData {
  proName:     string
  proCompany?: string
  proPhone?:   string
  proCity?:    string
  proState?:   string
  isVerified?: boolean
  renders:     VisualizerRender[]
  generatedAt: string
}

// ── Brand colours ─────────────────────────────────────────────────────────────
const TEAL   = '#0F766E'
const TEAL_LT= '#CCFBF1'
const NAVY   = '#111827'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'
const GREEN  = '#16A34A'

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', backgroundColor: WHITE },
  header:      { backgroundColor: TEAL, padding: '26 36 22', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brand:       { fontSize: 22, fontFamily: 'Helvetica-Bold', color: WHITE },
  brandSub:    { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  headerRight: { fontSize: 9, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  body:        { padding: '26 36 56' },
  // Cover
  titleBlock:  { marginBottom: 18, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 14 },
  reportTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  reportSub:   { fontSize: 11, color: MUTED },
  proBlock:    { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: BG, borderRadius: 6, padding: '12 16', marginBottom: 16 },
  proLabel:    { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  proValue:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY },
  proValueSm:  { fontSize: 10, color: MUTED, marginTop: 2 },
  // Credibility badges
  badgeRow:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 18 },
  badge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: TEAL_LT, borderRadius: 10, padding: '3 9' },
  badgeText:   { fontSize: 8, color: TEAL, fontFamily: 'Helvetica-Bold' },
  // Page guide (cover)
  guideRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  guideLabel:  { fontSize: 9, color: MUTED, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Comparison page
  compRow:     { flexDirection: 'row', gap: 10, marginBottom: 0 },
  compCard:    { flex: 1, borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  compImg:     { width: '100%', height: 165, objectFit: 'cover' },
  compSwatch:  { height: 10, width: '100%' },
  compInfo:    { padding: '7 8 9' },
  compName:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },
  compMfg:     { fontSize: 7, color: MUTED },
  recBadge:    { backgroundColor: TEAL, borderRadius: 4, padding: '2 6', marginTop: 5, alignSelf: 'flex-start' },
  recText:     { fontSize: 7, color: WHITE, fontFamily: 'Helvetica-Bold' },
  // Per-render page
  renderImage: { width: '100%', height: 390, objectFit: 'cover', borderRadius: 5 },
  swatchBar:   { height: 16, width: '100%' },
  renderInfo:  { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch:      { width: 22, height: 22, borderRadius: 4 },
  skuName:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY },
  mfgName:     { fontSize: 11, color: MUTED, marginTop: 2 },
  chosenBadge: { backgroundColor: TEAL, borderRadius: 10, padding: '3 10', marginLeft: 'auto' },
  chosenText:  { color: WHITE, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  // Next steps page
  stepRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  stepNum:     { width: 26, height: 26, borderRadius: 13, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumTxt:  { fontSize: 12, fontFamily: 'Helvetica-Bold', color: WHITE },
  stepTitle:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },
  stepDesc:    { fontSize: 10, color: MUTED, lineHeight: 1.4 },
  ctaBlock:    { backgroundColor: TEAL, borderRadius: 8, padding: '18 22', marginTop: 24 },
  ctaTitle:    { fontSize: 14, fontFamily: 'Helvetica-Bold', color: WHITE, marginBottom: 10 },
  ctaRow:      { flexDirection: 'row', gap: 32 },
  ctaLabel:    { fontSize: 8, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  ctaValue:    { fontSize: 13, fontFamily: 'Helvetica-Bold', color: WHITE },
  // Footer
  footer:      { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: BORDER, padding: '9 36', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerBrand: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL },
  footerNote:  { fontSize: 7, color: MUTED, maxWidth: 320, textAlign: 'center' },
  footerPage:  { fontSize: 8, color: MUTED },
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const titleCase = (str: string) =>
  str.replace(/\b\w/g, c => c.toUpperCase())

// Pick the "recommended" render — homeowner's choice if available, otherwise
// the one most visually different (highest chroma as a rough proxy).
const pickRecommended = (renders: VisualizerRender[]) => {
  const chosen = renders.find(r => r.isChosen)
  if (chosen) return chosen
  const chroma = (hex: string) => {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16)
    return Math.max(r,g,b) - Math.min(r,g,b)
  }
  return [...renders].sort((a,b) => chroma(b.hexPreview) - chroma(a.hexPreview))[0]
}

const Footer = ({ page, total }: { page: number; total: number }) => (
  <View style={s.footer} fixed>
    <Text style={s.footerBrand}>ProGuild.ai</Text>
    <Text style={s.footerNote}>
      Visualization only — actual colour may vary due to lighting and monitor calibration.
      Not a contract or guarantee of product availability.
    </Text>
    <Text style={s.footerPage}>{page} / {total}</Text>
  </View>
)

// ── Document ──────────────────────────────────────────────────────────────────
export function VisualizerReportPDF({ data }: { data: VisualizerReportData }) {
  const { proName, proCompany, proPhone, proCity, proState, isVerified, renders, generatedAt } = data
  // Pages: cover + comparison + N render pages + next steps
  const totalPages  = 1 + 1 + renders.length + 1
  const location    = [proCity, proState].filter(Boolean).join(', ')
  const displayName = proName ? titleCase(proName) : 'Your Roofing Contractor'
  const recommended = renders.length > 0 ? pickRecommended(renders) : null

  const STEPS = [
    { title: 'Choose your preferred colour', desc: 'Review the options in this report and let us know which colour you prefer.' },
    { title: 'Schedule a final inspection', desc: 'We\'ll visit to confirm measurements, ventilation, and any structural considerations.' },
    { title: 'Approve the proposal', desc: 'We\'ll send a detailed written estimate. Once approved, we lock in your installation date.' },
    { title: 'Installation day', desc: 'Our crew handles everything — permits, removal, installation, and clean-up.' },
  ]

  return (
    <Document title={`Roof Visualization Report — ${displayName}`} author="ProGuild.ai">

      {/* ── PAGE 1: COVER ─────────────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ProGuild</Text>
            <Text style={s.brandSub}>Roof Visualization Report</Text>
          </View>
          <Text style={s.headerRight}>Generated {fmtDate(generatedAt)}</Text>
        </View>

        <View style={s.body}>
          <View style={s.titleBlock}>
            <Text style={s.reportTitle}>Roof Visualization Report</Text>
            <Text style={s.reportSub}>
              Real manufacturer shingle colours rendered on your home — {renders.length} option{renders.length !== 1 ? 's' : ''} compared
            </Text>
          </View>

          {/* Pro info */}
          <View style={s.proBlock}>
            <View>
              <Text style={s.proLabel}>Prepared by</Text>
              <Text style={s.proValue}>{displayName}</Text>
              {proCompany && <Text style={s.proValueSm}>{proCompany}</Text>}
              {location   && <Text style={s.proValueSm}>{location}</Text>}
            </View>
            {proPhone && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.proLabel}>Contact</Text>
                <Text style={s.proValue}>{proPhone}</Text>
              </View>
            )}
          </View>

          {/* Credibility badges */}
          <View style={s.badgeRow}>
            <View style={s.badge}><Text style={s.badgeText}>✓ Licensed &amp; Insured</Text></View>
            {isVerified && <View style={s.badge}><Text style={s.badgeText}>✓ ProGuild Verified</Text></View>}
            {location && <View style={s.badge}><Text style={s.badgeText}>✓ Serving {location}</Text></View>}
            <View style={s.badge}><Text style={s.badgeText}>✓ Real Manufacturer Colours</Text></View>
            <View style={s.badge}><Text style={s.badgeText}>✓ AI-Powered Visualisation</Text></View>
          </View>

          {/* Page contents guide */}
          <Text style={s.guideLabel}>This report contains</Text>
          {[
            { pg: 2, label: 'Side-by-side colour comparison' },
            ...renders.map((r, i) => ({ pg: 3 + i, label: `${r.skuName} — ${r.manufacturer}${r.isChosen ? '  ✓ Homeowner\'s choice' : ''}` })),
            { pg: 3 + renders.length, label: 'Next steps & contact information' },
          ].map((item, i) => (
            <View key={i} style={s.guideRow}>
              <Text style={{ fontSize: 9, color: TEAL, fontFamily: 'Helvetica-Bold', width: 22 }}>P{item.pg}</Text>
              <Text style={{ fontSize: 10, color: NAVY }}>{item.label}</Text>
            </View>
          ))}
        </View>

        <Footer page={1} total={totalPages} />
      </Page>

      {/* ── PAGE 2: SIDE-BY-SIDE COMPARISON ───────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ProGuild</Text>
            <Text style={s.brandSub}>Colour Comparison</Text>
          </View>
          <Text style={s.headerRight}>{displayName}</Text>
        </View>

        <View style={s.body}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 }}>
              All Options Side by Side
            </Text>
            <Text style={{ fontSize: 10, color: MUTED }}>
              Compare all {renders.length} colours on your actual home. See page {3 + renders.length} for next steps.
            </Text>
          </View>

          <View style={s.compRow}>
            {renders.map((r, i) => {
              const isRec = recommended && r.skuName === recommended.skuName
              return (
                <View key={i} style={[s.compCard, isRec ? { borderColor: TEAL, borderWidth: 2 } : {}]}>
                  <Image style={s.compImg} src={r.renderUrl} />
                  <View style={[s.compSwatch, { backgroundColor: r.hexPreview }]} />
                  <View style={s.compInfo}>
                    <Text style={s.compName}>{r.skuName}</Text>
                    <Text style={s.compMfg}>{r.manufacturer}</Text>
                    {isRec && (
                      <View style={s.recBadge}>
                        <Text style={s.recText}>★ Recommended</Text>
                      </View>
                    )}
                    {r.isChosen && !isRec && (
                      <View style={[s.recBadge, { backgroundColor: GREEN }]}>
                        <Text style={s.recText}>✓ Your choice</Text>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
          </View>

          {recommended && (
            <View style={{ marginTop: 18, backgroundColor: TEAL_LT, borderRadius: 6, padding: '10 14', flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: recommended.hexPreview, marginTop: 1, flexShrink: 0 }} />
              <View>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 3 }}>
                  {recommended.isChosen ? 'Homeowner\'s Choice' : 'Our Recommendation'}: {recommended.skuName}
                </Text>
                <Text style={{ fontSize: 9, color: MUTED, lineHeight: 1.4 }}>
                  {recommended.isChosen
                    ? 'The homeowner selected this colour. Turn to the detailed page for a full-size view.'
                    : 'Based on your home\'s exterior, this colour offers the most striking visual impact. Turn to the detailed page for a full-size view.'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <Footer page={2} total={totalPages} />
      </Page>

      {/* ── PAGES 3+: ONE RENDER PER PAGE ─────────────────────────────────── */}
      {renders.map((r, i) => (
        <Page key={i} size="LETTER" style={s.page}>
          <View style={s.header}>
            <View>
              <Text style={s.brand}>ProGuild</Text>
              <Text style={s.brandSub}>Option {i + 1} of {renders.length}</Text>
            </View>
            <Text style={s.headerRight}>{displayName}</Text>
          </View>

          <View style={s.body}>
            <Image style={s.renderImage} src={r.renderUrl} />
            <View style={[s.swatchBar, { backgroundColor: r.hexPreview }]} />
            <View style={s.renderInfo}>
              <View style={[s.swatch, { backgroundColor: r.hexPreview }]} />
              <View>
                <Text style={s.skuName}>{r.skuName}</Text>
                <Text style={s.mfgName}>{r.manufacturer}</Text>
              </View>
              {r.isChosen && (
                <View style={s.chosenBadge}>
                  <Text style={s.chosenText}>✓ Homeowner's choice</Text>
                </View>
              )}
              {!r.isChosen && recommended && r.skuName === recommended.skuName && (
                <View style={[s.chosenBadge, { backgroundColor: '#065F46' }]}>
                  <Text style={s.chosenText}>★ Recommended</Text>
                </View>
              )}
            </View>
          </View>

          <Footer page={i + 3} total={totalPages} />
        </Page>
      ))}

      {/* ── LAST PAGE: NEXT STEPS ─────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ProGuild</Text>
            <Text style={s.brandSub}>Next Steps</Text>
          </View>
          <Text style={s.headerRight}>{displayName}</Text>
        </View>

        <View style={s.body}>
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 }}>
              Ready to move forward?
            </Text>
            <Text style={{ fontSize: 10, color: MUTED }}>
              Here's what happens next. We'll guide you through every step.
            </Text>
          </View>

          {STEPS.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <View style={s.stepNum}>
                <Text style={s.stepNumTxt}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}

          {/* CTA block */}
          <View style={s.ctaBlock}>
            <Text style={s.ctaTitle}>Get in touch</Text>
            <View style={s.ctaRow}>
              {proPhone && (
                <View>
                  <Text style={s.ctaLabel}>Call or text</Text>
                  <Text style={s.ctaValue}>{proPhone}</Text>
                </View>
              )}
              {location && (
                <View>
                  <Text style={s.ctaLabel}>Service area</Text>
                  <Text style={s.ctaValue}>{location}</Text>
                </View>
              )}
              <View>
                <Text style={s.ctaLabel}>Powered by</Text>
                <Text style={s.ctaValue}>ProGuild.ai</Text>
              </View>
            </View>
          </View>
        </View>

        <Footer page={totalPages} total={totalPages} />
      </Page>

    </Document>
  )
}
