// lib/roofing/reportPdf.tsx
// ProGuild Roof Measurement Report — @react-pdf/renderer v4
// Mirrors EagleView Bid Perfect layout in ProGuild teal/cream/navy design system
// PRAGMA: must use classic React.createElement — react-pdf cannot use react/jsx-runtime
/* @jsxRuntime classic */
/* @jsx React.createElement */

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, Font,
} from '@react-pdf/renderer'

// ── Types ──────────────────────────────────────────────────────────────────
export interface PitchRow {
  pitch: string      // e.g. "7/12"
  sqft: number
  sq: number
  pct: number
}

export interface ReportData {
  // Property
  address: string
  city: string
  state: string
  zip: string
  generatedDate: string
  imageryDate: string

  // Pro
  proName: string
  proCompany: string

  // Measurements
  totalSqft: number
  totalSquaresRaw: number    // e.g. 31.48
  totalSquaresOrder: number  // e.g. 31.5
  facetCount: number
  dominantPitch: string
  wasteFactor: number        // 10, 12, or 15

  // Pitch breakdown — sorted by sqft desc
  pitchBreakdown: PitchRow[]

  // Images — base64 data URLs (jpeg)
  imgTopView: string
  imgNorth: string
  imgSouth: string
  imgEast: string
  imgWest: string
}

// ── Design tokens ──────────────────────────────────────────────────────────
const TEAL       = '#0F766E'
const TEAL_L     = '#14B8A6'
const TEAL_XL    = '#F0FDFA'
const NAVY       = '#0A1628'
const CREAM      = '#F5F4F0'
const BORDER     = '#E8E2D9'
const MUTED      = '#6B7280'
const WHITE      = '#FFFFFF'
const ROW_ALT    = '#F9FAFB'
const TH_BG      = '#0F766E'

// ── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { backgroundColor: WHITE, fontFamily: 'Helvetica', fontSize: 10, color: NAVY },

  // Cover
  coverHeader: { backgroundColor: NAVY, padding: '32 40', alignItems: 'center' },
  coverTitle:  { color: WHITE, fontSize: 22, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  coverSub:    { color: TEAL_L, fontSize: 12, marginTop: 6 },
  coverImg:    { marginTop: 28, marginHorizontal: 40, height: 220, borderRadius: 8 },
  coverAddress:{ marginTop: 14, textAlign: 'center', fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  coverProBox: { marginTop: 20, marginHorizontal: 60, padding: '14 20', backgroundColor: CREAM, borderRadius: 10, alignItems: 'center' },
  coverProName:{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  coverProCo:  { fontSize: 11, color: MUTED, marginTop: 3 },
  coverFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#E5E7EB', padding: '8 40', flexDirection: 'row', justifyContent: 'space-between' },
  coverFootTxt:{ fontSize: 8, color: MUTED },

  // Page header (pages 2+)
  pageHeader:  { backgroundColor: NAVY, padding: '10 20', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageHdrAddr: { color: WHITE, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  pageHdrRight:{ color: TEAL_L, fontSize: 10 },

  // Section label
  sectionBar:  { backgroundColor: TEAL_XL, borderLeft: `3 solid ${TEAL}`, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 12 },
  sectionLbl:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Body padding
  body:        { padding: '16 20 20 20' },

  // Summary table
  tbl:         { borderRadius: 6, overflow: 'hidden', border: `1 solid ${BORDER}` },
  tblHead:     { flexDirection: 'row', backgroundColor: TH_BG },
  tblHeadCell: { flex: 1, padding: '7 10', color: WHITE, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tblRow:      { flexDirection: 'row', borderTop: `1 solid ${BORDER}` },
  tblRowAlt:   { flexDirection: 'row', borderTop: `1 solid ${BORDER}`, backgroundColor: ROW_ALT },
  tblCell:     { flex: 1, padding: '7 10', fontSize: 10, color: NAVY },
  tblCellBold: { flex: 1, padding: '7 10', fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },

  // Measurement highlights
  metricRow:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricBox:   { flex: 1, backgroundColor: TEAL_XL, borderRadius: 10, border: `1 solid ${TEAL_L}`, padding: '12 14' },
  metricVal:   { fontSize: 20, fontFamily: 'Helvetica-Bold', color: TEAL },
  metricLbl:   { fontSize: 9, color: MUTED, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricSub:   { fontSize: 8, color: TEAL, marginTop: 2 },

  // Satellite image on data page
  dataImg:     { height: 180, borderRadius: 8, marginBottom: 14, border: `1 solid ${BORDER}` },

  // Cardinal views
  gridRow:     { flexDirection: 'row', gap: 10, marginBottom: 10 },
  gridImg:     { flex: 1, height: 150, borderRadius: 8, border: `1 solid ${BORDER}` },
  gridLabel:   { fontSize: 9, color: MUTED, textAlign: 'center', marginTop: 4, fontFamily: 'Helvetica-Bold' },

  // Waste table
  wasteTbl:    { borderRadius: 6, overflow: 'hidden', border: `1 solid ${BORDER}`, marginTop: 14 },

  // Footnotes
  footnote:    { fontSize: 8, color: MUTED, marginTop: 10, lineHeight: 1.5 },
  disclaimer:  { fontSize: 8, color: MUTED, marginTop: 8, padding: '8 10', backgroundColor: '#FFF9F0', borderRadius: 6, border: `1 solid #FDE68A`, lineHeight: 1.5 },
})

// ── Helpers ────────────────────────────────────────────────────────────────
function PageHeader({ address, reportId }: { address: string; reportId: string }) {
  return (
    <View style={S.pageHeader}>
      <Text style={S.pageHdrAddr}>{address}</Text>
      <Text style={S.pageHdrRight}>ProGuild Roof Report · {reportId}</Text>
    </View>
  )
}

function SectionBar({ label }: { label: string }) {
  return (
    <View style={S.sectionBar}>
      <Text style={S.sectionLbl}>{label}</Text>
    </View>
  )
}

// Waste calc: area at each waste %
function wasteArea(baseSqft: number, pct: number) {
  return Math.ceil((baseSqft * (1 + pct / 100)) / 100 * 2) / 2 // nearest 0.5 sq
}

// ── Report Document ────────────────────────────────────────────────────────
// Returns a Document JSX element directly — NOT a React component.
// renderToBuffer requires the Document element itself, not a wrapper component.
export function buildRoofReportPDF(data: ReportData, reportId: string) {
  const fullAddress = `${data.address}, ${data.city}, ${data.state} ${data.zip}`
  // Only include pitches >3/12 in waste table (EagleView convention)
  const steepSqft = data.pitchBreakdown
    .filter(p => {
      const rise = parseInt(p.pitch.split('/')[0])
      return rise >= 3
    })
    .reduce((acc, p) => acc + p.sqft, 0)

  const wastePcts = [0, 10, 12, 15, 17, 20]

  return (
    <Document title={`ProGuild Roof Report — ${data.address}`} author="ProGuild.ai">

      {/* ── PAGE 1: COVER ─────────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        {/* Navy header */}
        <View style={S.coverHeader}>
          <Text style={S.coverTitle}>Satellite Roof Measurement Report</Text>
          <Text style={S.coverSub}>Powered by ProGuild · Google Solar API</Text>
        </View>

        {/* Top-down satellite */}
        <Image src={data.imgTopView} style={S.coverImg} />

        {/* Address */}
        <Text style={S.coverAddress}>{fullAddress}</Text>

        {/* Pro box */}
        <View style={S.coverProBox}>
          <Text style={S.coverProName}>{data.proName}</Text>
          {data.proCompany ? <Text style={S.coverProCo}>{data.proCompany}</Text> : null}
          <Text style={[S.coverProCo, { marginTop: 6 }]}>Generated {data.generatedDate}</Text>
        </View>

        {/* Footer */}
        <View style={S.coverFooter}>
          <Text style={S.coverFootTxt}>Measurements via Google Solar API · Images © Google</Text>
          <Text style={S.coverFootTxt}>ProGuild.ai — For bid preparation use</Text>
        </View>
      </Page>

      {/* ── PAGE 2: MEASUREMENTS ──────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <PageHeader address={data.address} reportId={reportId} />

        <View style={S.body}>
          <SectionBar label="Roof Measurements" />

          {/* Satellite image repeated (EagleView does this on data page) */}
          <Image src={data.imgTopView} style={S.dataImg} />

          {/* 4 metric boxes */}
          <View style={S.metricRow}>
            <View style={S.metricBox}>
              <Text style={S.metricVal}>{data.totalSquaresRaw.toFixed(2)}</Text>
              <Text style={S.metricLbl}>Total Squares</Text>
              <Text style={S.metricSub}>Order qty: {data.totalSquaresOrder.toFixed(1)} sq</Text>
            </View>
            <View style={S.metricBox}>
              <Text style={S.metricVal}>{data.dominantPitch}</Text>
              <Text style={S.metricLbl}>Dominant Pitch</Text>
              <Text style={S.metricSub}>{data.totalSqft.toLocaleString()} sq ft total</Text>
            </View>
            <View style={S.metricBox}>
              <Text style={S.metricVal}>{data.facetCount}</Text>
              <Text style={S.metricLbl}>Roof Facets</Text>
              <Text style={S.metricSub}>Complexity indicator</Text>
            </View>
            <View style={S.metricBox}>
              <Text style={S.metricVal}>{data.wasteFactor}%</Text>
              <Text style={S.metricLbl}>Waste Factor</Text>
              <Text style={S.metricSub}>Not included in sq</Text>
            </View>
          </View>

          {/* Pitch breakdown table */}
          <View style={S.tbl}>
            <View style={S.tblHead}>
              <Text style={[S.tblHeadCell, { flex: 0.6 }]}>Pitch</Text>
              <Text style={S.tblHeadCell}>Area (sq ft)</Text>
              <Text style={S.tblHeadCell}>Squares</Text>
              <Text style={S.tblHeadCell}>% of Roof</Text>
            </View>
            {data.pitchBreakdown.map((row, i) => (
              <View key={row.pitch} style={i % 2 === 0 ? S.tblRow : S.tblRowAlt}>
                <Text style={[S.tblCellBold, { flex: 0.6 }]}>{row.pitch}</Text>
                <Text style={S.tblCell}>{row.sqft.toLocaleString()}</Text>
                <Text style={S.tblCell}>{row.sq.toFixed(1)}</Text>
                <Text style={S.tblCell}>{row.pct}%</Text>
              </View>
            ))}
            {/* Total row */}
            <View style={[S.tblRow, { backgroundColor: TEAL_XL }]}>
              <Text style={[S.tblCellBold, { flex: 0.6, color: TEAL }]}>TOTAL</Text>
              <Text style={[S.tblCellBold, { color: TEAL }]}>{data.totalSqft.toLocaleString()}</Text>
              <Text style={[S.tblCellBold, { color: TEAL }]}>{data.totalSquaresRaw.toFixed(2)}</Text>
              <Text style={[S.tblCellBold, { color: TEAL }]}>100%</Text>
            </View>
          </View>

          <Text style={S.footnote}>
            * Total squares does NOT include waste. Imagery date: {data.imageryDate}.{'\n'}
            Measurements provided by Google Solar API. Field verification recommended before ordering materials.
          </Text>
          <Text style={S.disclaimer}>
            ⚠ This report is designed for bid preparation and sales use. For insurance claim submissions, a certified measurement report may be required by your carrier.
          </Text>
        </View>

        {/* Footer */}
        <View style={[S.coverFooter]}>
          <Text style={S.coverFootTxt}>ProGuild.ai · Satellite Roof Measurement Report</Text>
          <Text style={S.coverFootTxt}>{data.generatedDate}</Text>
        </View>
      </Page>

      {/* ── PAGE 3: TOP VIEW ──────────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <PageHeader address={data.address} reportId={reportId} />
        <View style={S.body}>
          <SectionBar label="Images — Top View" />
          <Text style={{ fontSize: 10, color: MUTED, marginBottom: 10 }}>
            Satellite top-down view of this structure for reference.
          </Text>
          <Image src={data.imgTopView} style={{ height: 440, borderRadius: 10, border: `1 solid ${BORDER}` }} />
          <Text style={[S.footnote, { textAlign: 'right', marginTop: 6 }]}>
            Imagery date: {data.imageryDate} · © Google
          </Text>
        </View>
        <View style={S.coverFooter}>
          <Text style={S.coverFootTxt}>ProGuild.ai · Satellite Roof Measurement Report</Text>
          <Text style={S.coverFootTxt}>{data.generatedDate}</Text>
        </View>
      </Page>

      {/* ── PAGE 4: CARDINAL VIEWS ────────────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <PageHeader address={data.address} reportId={reportId} />
        <View style={S.body}>
          <SectionBar label="Images — Oblique Views" />
          <Text style={{ fontSize: 10, color: MUTED, marginBottom: 12 }}>
            The following street-level images show different angles of this structure for reference.
          </Text>

          {/* North + South */}
          <View style={S.gridRow}>
            <View style={{ flex: 1 }}>
              <Image src={data.imgNorth} style={S.gridImg} />
              <Text style={S.gridLabel}>North Side</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Image src={data.imgSouth} style={S.gridImg} />
              <Text style={S.gridLabel}>South Side</Text>
            </View>
          </View>

          {/* East + West */}
          <View style={S.gridRow}>
            <View style={{ flex: 1 }}>
              <Image src={data.imgEast} style={S.gridImg} />
              <Text style={S.gridLabel}>East Side</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Image src={data.imgWest} style={S.gridImg} />
              <Text style={S.gridLabel}>West Side</Text>
            </View>
          </View>

          <Text style={S.footnote}>
            Street View imagery © Google. Views captured at 30° pitch angle facing each cardinal direction.
          </Text>
        </View>
        <View style={S.coverFooter}>
          <Text style={S.coverFootTxt}>ProGuild.ai · Satellite Roof Measurement Report</Text>
          <Text style={S.coverFootTxt}>{data.generatedDate}</Text>
        </View>
      </Page>

      {/* ── PAGE 5: PITCH + WASTE TABLE ───────────────────────────── */}
      <Page size="LETTER" style={S.page}>
        <PageHeader address={data.address} reportId={reportId} />
        <View style={S.body}>
          <SectionBar label="Areas Per Pitch" />

          <View style={S.tbl}>
            <View style={S.tblHead}>
              <Text style={[S.tblHeadCell, { flex: 0.6 }]}>Pitch</Text>
              <Text style={S.tblHeadCell}>Area (sq ft)</Text>
              <Text style={S.tblHeadCell}>% of Roof</Text>
              <Text style={S.tblHeadCell}>Squares</Text>
            </View>
            {data.pitchBreakdown.map((row, i) => (
              <View key={row.pitch} style={i % 2 === 0 ? S.tblRow : S.tblRowAlt}>
                <Text style={[S.tblCellBold, { flex: 0.6 }]}>{row.pitch}</Text>
                <Text style={S.tblCell}>{row.sqft.toLocaleString()}</Text>
                <Text style={S.tblCell}>{row.pct}%</Text>
                <Text style={S.tblCell}>{row.sq.toFixed(1)}</Text>
              </View>
            ))}
          </View>

          {/* Waste Calculation Table */}
          <View style={{ marginTop: 20 }}>
            <SectionBar label="Waste Calculation Table" />
            <Text style={{ fontSize: 9, color: MUTED, marginBottom: 8 }}>
              NOTE: Waste calculation applies to asphalt shingle areas with pitch ≥ 3/12 only ({steepSqft.toLocaleString()} sq ft).
              Additional materials for ridge, hip, and starter lengths not included.
            </Text>

            <View style={S.wasteTbl}>
              <View style={S.tblHead}>
                {wastePcts.map(pct => (
                  <Text key={pct} style={[S.tblHeadCell, pct === data.wasteFactor ? { backgroundColor: TEAL_L } : {}]}>
                    {pct}%{pct === data.wasteFactor ? ' ★' : ''}
                  </Text>
                ))}
              </View>
              {/* Area row */}
              <View style={S.tblRow}>
                {wastePcts.map((pct, i) => (
                  <Text key={pct} style={[S.tblCell, i % 2 !== 0 ? { backgroundColor: ROW_ALT } : {}, pct === data.wasteFactor ? { fontFamily: 'Helvetica-Bold', color: TEAL } : {}]}>
                    {Math.round(steepSqft * (1 + pct / 100)).toLocaleString()} ft²
                  </Text>
                ))}
              </View>
              {/* Squares row */}
              <View style={S.tblRowAlt}>
                {wastePcts.map((pct, i) => (
                  <Text key={pct} style={[S.tblCell, pct === data.wasteFactor ? { fontFamily: 'Helvetica-Bold', color: TEAL } : {}]}>
                    {wasteArea(steepSqft, pct).toFixed(1)} sq
                  </Text>
                ))}
              </View>
            </View>

            <Text style={[S.footnote, { marginTop: 8 }]}>
              ★ Suggested waste factor based on roof complexity ({data.facetCount} facets). Actual waste percentages may differ based on installation techniques, crew experience, and shingle material. Field verification recommended.
            </Text>
          </View>

          {/* Report summary box */}
          <View style={{ marginTop: 16, padding: '12 14', backgroundColor: CREAM, borderRadius: 10, border: `1 solid ${BORDER}` }}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 8 }}>Report Summary</Text>
            <View style={{ flexDirection: 'row', gap: 40 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 9, color: MUTED }}>Total Roof Area: <Text style={{ color: NAVY, fontFamily: 'Helvetica-Bold' }}>{data.totalSqft.toLocaleString()} sq ft</Text></Text>
                <Text style={{ fontSize: 9, color: MUTED }}>Total Squares (measured): <Text style={{ color: NAVY, fontFamily: 'Helvetica-Bold' }}>{data.totalSquaresRaw.toFixed(2)} sq</Text></Text>
                <Text style={{ fontSize: 9, color: MUTED }}>Order Quantity: <Text style={{ color: NAVY, fontFamily: 'Helvetica-Bold' }}>{data.totalSquaresOrder.toFixed(1)} sq</Text></Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 9, color: MUTED }}>Total Facets: <Text style={{ color: NAVY, fontFamily: 'Helvetica-Bold' }}>{data.facetCount}</Text></Text>
                <Text style={{ fontSize: 9, color: MUTED }}>Predominant Pitch: <Text style={{ color: NAVY, fontFamily: 'Helvetica-Bold' }}>{data.dominantPitch}</Text></Text>
                <Text style={{ fontSize: 9, color: MUTED }}>Suggested Waste: <Text style={{ color: NAVY, fontFamily: 'Helvetica-Bold' }}>{data.wasteFactor}%</Text></Text>
              </View>
            </View>
          </View>
        </View>

        <View style={S.coverFooter}>
          <Text style={S.coverFootTxt}>ProGuild.ai · Measurements via Google Solar API · Images © Google</Text>
          <Text style={S.coverFootTxt}>{data.generatedDate}</Text>
        </View>
      </Page>

    </Document>
  )
}
