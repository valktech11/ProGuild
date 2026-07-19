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
  renders:     VisualizerRender[]
  generatedAt: string
}

const TEAL  = '#0F766E'
const NAVY  = '#111827'
const MUTED = '#6B7280'
const BORDER= '#E5E7EB'
const BG    = '#F9FAFB'
const WHITE = '#FFFFFF'

const s = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', backgroundColor: WHITE },
  header:     { backgroundColor: TEAL, padding: '28 36 24', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brand:      { fontSize: 22, fontFamily: 'Helvetica-Bold', color: WHITE },
  brandSub:   { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  headerRight:{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  body:       { padding: '28 36 56' },
  titleBlock: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 16 },
  reportTitle:{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  reportSub:  { fontSize: 11, color: MUTED },
  proBlock:   { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: BG, borderRadius: 6, padding: '12 16', marginBottom: 0 },
  proLabel:   { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  proValue:   { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY },
  proValueSm: { fontSize: 10, color: MUTED },
  // Per-render page
  renderImage:{ width: '100%', height: 400, objectFit: 'cover', borderRadius: 6, marginBottom: 0 },
  swatchBar:  { height: 18, width: '100%', borderRadius: '0 0 0 0' },
  renderInfo: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch:     { width: 22, height: 22, borderRadius: 4 },
  skuName:    { fontSize: 18, fontFamily: 'Helvetica-Bold', color: NAVY },
  mfgName:    { fontSize: 11, color: MUTED, marginTop: 2 },
  chosenBadge:{ backgroundColor: TEAL, borderRadius: 10, padding: '3 10', marginLeft: 'auto' },
  chosenText: { color: WHITE, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  // Footer
  footer:     { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: BORDER, padding: '9 36', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerBrand:{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL },
  footerNote: { fontSize: 7, color: MUTED, maxWidth: 320, textAlign: 'center' },
  footerPage: { fontSize: 8, color: MUTED },
})

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// Title-case a name so "gary sobers" → "Gary Sobers"
const titleCase = (s: string) =>
  s.replace(/\b\w/g, c => c.toUpperCase())

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

export function VisualizerReportPDF({ data }: { data: VisualizerReportData }) {
  const { proName, proCompany, proPhone, proCity, proState, renders, generatedAt } = data
  const totalPages = 1 + renders.length
  const location   = [proCity, proState].filter(Boolean).join(', ')
  const displayName = proName ? titleCase(proName) : 'Your Roofing Contractor'

  return (
    <Document title={`Roof Visualization Report — ${displayName}`} author="ProGuild.ai">

      {/* ── Page 1: Cover ─────────────────────────────────────────────────── */}
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

          {/* Page guide */}
          <View style={{ marginTop: 28, gap: 10 }}>
            <Text style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>This report contains:</Text>
            {renders.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: r.hexPreview }} />
                <Text style={{ fontSize: 11, color: NAVY }}>
                  Page {i + 2} — {r.skuName}
                  {'  '}<Text style={{ color: MUTED }}>{r.manufacturer}</Text>
                  {r.isChosen ? <Text style={{ color: TEAL, fontFamily: 'Helvetica-Bold' }}>{'  '}✓ Homeowner's choice</Text> : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Footer page={1} total={totalPages} />
      </Page>

      {/* ── Pages 2+: One render per page ──────────────────────────────────── */}
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
            {/* Full-width render image */}
            <Image style={s.renderImage} src={r.renderUrl} />

            {/* Colour band below image */}
            <View style={[s.swatchBar, { backgroundColor: r.hexPreview }]} />

            {/* SKU info */}
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
            </View>
          </View>

          <Footer page={i + 2} total={totalPages} />
        </Page>
      ))}

    </Document>
  )
}
