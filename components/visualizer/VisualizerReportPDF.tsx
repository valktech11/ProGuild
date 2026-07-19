import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface VisualizerRender {
  renderUrl:    string
  skuName:      string
  manufacturer: string
  hexPreview:   string
  isChosen?:    boolean
}

export interface VisualizerReportData {
  proName:      string
  proCompany?:  string
  proPhone?:    string
  proCity?:     string
  proState?:    string
  renders:      VisualizerRender[]
  generatedAt:  string  // ISO string
}

// ── Colours (match ProGuild brand) ───────────────────────────────────────────
const TEAL   = '#0F766E'
const NAVY   = '#111827'
const MUTED  = '#6B7280'
const BORDER = '#E5E7EB'
const BG     = '#F9FAFB'
const WHITE  = '#FFFFFF'

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: WHITE, paddingBottom: 48 },

  // Header
  header: { backgroundColor: TEAL, padding: '28 36 24', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerLeft: { flexDirection: 'column' },
  brand: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: WHITE, letterSpacing: -0.5 },
  brandSub: { fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 3 },
  headerDate: { fontSize: 9, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },

  // Body
  body: { padding: '28 36' },

  // Title block
  titleBlock: { marginBottom: 24, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 18 },
  reportTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 },
  reportSub: { fontSize: 11, color: MUTED },

  // Pro info
  proBlock: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: BG, borderRadius: 6, padding: '12 16', marginBottom: 22 },
  proLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  proValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY },
  proValueSm: { fontSize: 10, color: MUTED },

  // Hero render (page 1)
  heroWrap: { marginBottom: 16 },
  heroImage: { width: '100%', height: 310, objectFit: 'cover', borderRadius: 6 },
  heroLabel: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  heroSwatch: { width: 18, height: 18, borderRadius: 3 },
  heroName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  heroMfg: { fontSize: 10, color: MUTED, marginLeft: 4 },
  chosenBadge: { backgroundColor: TEAL, borderRadius: 10, padding: '2 8', marginLeft: 'auto' },
  chosenBadgeText: { color: WHITE, fontSize: 9, fontFamily: 'Helvetica-Bold' },

  // Comparison grid (page 2)
  gridTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 14 },
  grid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  gridCard: { width: '31%', borderRadius: 6, overflow: 'hidden', border: `1 solid ${BORDER}` },
  gridImage: { width: '100%', height: 148, objectFit: 'cover' },
  gridSwatch: { height: 28, width: '100%' },
  gridInfo: { padding: '8 8 10' },
  gridName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 2 },
  gridMfg: { fontSize: 8, color: MUTED },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: BORDER, padding: '10 36', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerBrand: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL },
  footerNote: { fontSize: 8, color: MUTED, maxWidth: 340, textAlign: 'center' },
  footerPage: { fontSize: 8, color: MUTED },
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

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
  const { proName, proCompany, proPhone, proCity, proState, renders, generatedAt } = data
  const pageCount = renders.length > 0 ? 2 : 1
  const hero = renders.find(r => r.isChosen) ?? renders[0]
  const location = [proCity, proState].filter(Boolean).join(', ')

  return (
    <Document title={`Roof Visualization Report — ${proName}`} author="ProGuild.ai">

      {/* ── Page 1: Cover + Hero ─────────────────────────────────────────── */}
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.brand}>ProGuild</Text>
            <Text style={s.brandSub}>Roof Visualization Report</Text>
          </View>
          <Text style={s.headerDate}>Generated {fmtDate(generatedAt)}</Text>
        </View>

        <View style={s.body}>
          {/* Title */}
          <View style={s.titleBlock}>
            <Text style={s.reportTitle}>Roof Visualization Report</Text>
            <Text style={s.reportSub}>
              AI-powered shingle colour preview — real manufacturer colours, rendered on your home
            </Text>
          </View>

          {/* Pro info */}
          <View style={s.proBlock}>
            <View>
              <Text style={s.proLabel}>Prepared by</Text>
              <Text style={s.proValue}>{proName || 'Your Roofing Contractor'}</Text>
              {proCompany && <Text style={s.proValueSm}>{proCompany}</Text>}
              {location && <Text style={s.proValueSm}>{location}</Text>}
            </View>
            {proPhone && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.proLabel}>Contact</Text>
                <Text style={s.proValue}>{proPhone}</Text>
              </View>
            )}
          </View>

          {/* Hero render */}
          {hero && (
            <View style={s.heroWrap}>
              <Image style={s.heroImage} src={hero.renderUrl} />
              <View style={s.heroLabel}>
                <View style={[s.heroSwatch, { backgroundColor: hero.hexPreview }]} />
                <Text style={s.heroName}>{hero.skuName}</Text>
                {hero.manufacturer && <Text style={s.heroMfg}>· {hero.manufacturer}</Text>}
                {hero.isChosen && (
                  <View style={s.chosenBadge}>
                    <Text style={s.chosenBadgeText}>✓ Homeowner's choice</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        <Footer page={1} total={pageCount} />
      </Page>

      {/* ── Page 2: Comparison grid ──────────────────────────────────────── */}
      {renders.length > 0 && (
        <Page size="LETTER" style={s.page}>
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Text style={s.brand}>ProGuild</Text>
              <Text style={s.brandSub}>Shingle Colour Comparison</Text>
            </View>
            <Text style={s.headerDate}>{proName}</Text>
          </View>

          <View style={s.body}>
            <Text style={s.gridTitle}>All Options Side by Side</Text>
            <View style={s.grid}>
              {renders.map((r, i) => (
                <View key={i} style={[s.gridCard, r.isChosen ? { borderColor: TEAL, borderWidth: 2 } : {}]}>
                  <Image style={s.gridImage} src={r.renderUrl} />
                  <View style={[s.gridSwatch, { backgroundColor: r.hexPreview }]} />
                  <View style={s.gridInfo}>
                    <Text style={s.gridName}>{r.skuName}{r.isChosen ? '  ✓ Chosen' : ''}</Text>
                    <Text style={s.gridMfg}>{r.manufacturer}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <Footer page={2} total={pageCount} />
        </Page>
      )}

    </Document>
  )
}
