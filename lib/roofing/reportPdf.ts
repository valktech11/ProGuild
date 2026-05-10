// lib/roofing/reportPdf.ts
// ProGuild Roof Measurement Report — @react-pdf/renderer v4
// Written with React.createElement (aliased as h) — NO JSX SYNTAX.
// Reason: Next.js SWC ignores @jsx pragmas in .tsx files and always uses
// the modern react-jsx transform, which breaks react-pdf's renderToBuffer.
// A plain .ts file bypasses the JSX transform entirely.

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'

// Shorthand — keeps code readable without JSX
const h = React.createElement

// ── Types ──────────────────────────────────────────────────────────────────
export interface PitchRow {
  pitch: string   // e.g. "7/12"
  sqft:  number
  sq:    number
  pct:   number
}

export interface ReportData {
  address:      string
  city:         string
  state:        string
  zip:          string
  generatedDate:string
  imageryDate:  string
  proName:      string
  proCompany:   string
  totalSqft:          number
  totalSquaresRaw:    number
  totalSquaresOrder:  number
  dominantPitch:      string
  facetCount:         number
  wasteFactor:        number
  pitchBreakdown:     PitchRow[]
  proPhone:   string
  proEmail:   string
  imgTopView: string
  imgZoom19:  string
  imgZoom20:  string
  imgZoom21:  string
  buildingLat: number
  buildingLng: number
}

// ── Design tokens ──────────────────────────────────────────────────────────
const TEAL   = '#0F766E'
const TEAL_L = '#14B8A6'
const TEAL_XL= '#F0FDFA'
const NAVY   = '#0A1628'
const CREAM  = '#F5F4F0'
const BORDER = '#E8E2D9'
const MUTED  = '#6B7280'
const WHITE  = '#FFFFFF'
const ROW_ALT= '#F9FAFB'

// ── Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:         { backgroundColor: WHITE, fontFamily: 'Helvetica', fontSize: 10, color: NAVY },

  // Cover
  coverHeader:  { backgroundColor: NAVY, padding: '32 40', alignItems: 'center' },
  coverTitle:   { color: WHITE, fontSize: 22, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  coverSub:     { color: TEAL_L, fontSize: 12, marginTop: 6 },
  coverImg:     { margin: '28 40 0 40', height: 220, width: 531 },
  coverAddress: { marginTop: 14, textAlign: 'center', fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  coverProBox:  { marginTop: 20, marginHorizontal: 60, padding: '14 20', backgroundColor: CREAM, borderRadius: 10, alignItems: 'center' },
  coverProName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY },
  coverProCo:   { fontSize: 11, color: MUTED, marginTop: 3 },
  coverProContact: { fontSize: 10, color: MUTED, marginTop: 2 },
  coverFooter:  { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#E5E7EB', padding: '8 40', flexDirection: 'row', justifyContent: 'space-between' },
  coverFootTxt: { fontSize: 8, color: MUTED },

  // Page header (pages 2+)
  pageHeader:   { backgroundColor: NAVY, padding: '10 20', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageHdrAddr:  { color: WHITE, fontSize: 11, fontFamily: 'Helvetica-Bold' },
  pageHdrRight: { color: TEAL_L, fontSize: 10 },

  // Section label
  sectionBar:   { backgroundColor: TEAL_XL, borderLeft: '3 solid ' + TEAL, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 12 },
  sectionLbl:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Body
  body:         { padding: '16 20 20 20' },

  // Metric boxes
  metricRow:    { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metricBox:    { flex: 1, backgroundColor: TEAL_XL, borderRadius: 10, padding: '12 14' },
  metricVal:    { fontSize: 20, fontFamily: 'Helvetica-Bold', color: TEAL },
  metricLbl:    { fontSize: 9, color: MUTED, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricSub:    { fontSize: 8, color: TEAL, marginTop: 2 },

  // Data image
  dataImg:      { height: 180, width: '100%', marginBottom: 14 },

  // Table
  tbl:          { borderRadius: 6, overflow: 'hidden' },
  tblHead:      { flexDirection: 'row', backgroundColor: TEAL },
  tblHeadCell:  { flex: 1, padding: '7 10', color: WHITE, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tblHeadCellSm:{ flex: 0.6, padding: '7 10', color: WHITE, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tblRow:       { flexDirection: 'row', borderTop: '1 solid ' + BORDER },
  tblRowAlt:    { flexDirection: 'row', borderTop: '1 solid ' + BORDER, backgroundColor: ROW_ALT },
  tblRowTot:    { flexDirection: 'row', borderTop: '1 solid ' + BORDER, backgroundColor: TEAL_XL },
  tblCell:      { flex: 1, padding: '7 10', fontSize: 10, color: NAVY },
  tblCellSm:    { flex: 0.6, padding: '7 10', fontSize: 10, color: NAVY },
  tblCellBold:  { flex: 1, padding: '7 10', fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },
  tblCellSmBold:{ flex: 0.6, padding: '7 10', fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY },
  tblCellTeal:  { flex: 1, padding: '7 10', fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL },
  tblCellSmTeal:{ flex: 0.6, padding: '7 10', fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL },

  // Cardinal grid
  gridRow:      { flexDirection: 'row', gap: 10, marginBottom: 10 },
  gridImgWrap:  { flex: 1 },
  gridImg:      { height: 150, borderRadius: 8 },
  gridLabel:    { fontSize: 9, color: MUTED, textAlign: 'center', marginTop: 4, fontFamily: 'Helvetica-Bold' },

  // Waste table
  wasteTbl:     { borderRadius: 6, overflow: 'hidden', marginTop: 14 },
  wasteThlHighlight: { flex: 1, padding: '7 10', color: WHITE, fontSize: 9, fontFamily: 'Helvetica-Bold', backgroundColor: TEAL_L },

  // Summary box
  summaryBox:   { marginTop: 16, padding: '12 14', backgroundColor: CREAM, borderRadius: 10 },
  summaryTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 8 },
  summaryRow:   { flexDirection: 'row', gap: 40 },
  summaryCol:   { gap: 4 },
  summaryLine:  { fontSize: 9, color: MUTED },
  summaryVal:   { fontFamily: 'Helvetica-Bold', color: NAVY },

  // Footnotes
  footnote:     { fontSize: 8, color: MUTED, marginTop: 10, lineHeight: 1.5 },
  disclaimer:   { fontSize: 8, color: MUTED, marginTop: 8, padding: '8 10', backgroundColor: '#FFF9F0', borderRadius: 6, lineHeight: 1.5 },
})

// ── Reusable elements ──────────────────────────────────────────────────────

function pageHeader(address: string, reportId: string) {
  return h(View, { style: S.pageHeader },
    h(Text, { style: S.pageHdrAddr }, address),
    h(Text, { style: S.pageHdrRight }, 'ProGuild Roof Report \u00B7 ' + reportId)
  )
}

function sectionBar(label: string) {
  return h(View, { style: S.sectionBar },
    h(Text, { style: S.sectionLbl }, label)
  )
}

function pageFooter(date: string) {
  return h(View, { style: S.coverFooter },
    h(Text, { style: S.coverFootTxt }, 'ProGuild.ai \u00B7 Satellite Roof Measurement Report'),
    h(Text, { style: S.coverFootTxt }, date)
  )
}

function wasteArea(baseSqft: number, pct: number): string {
  return (Math.ceil(baseSqft * (1 + pct / 100) / 100 * 2) / 2).toFixed(1)
}

// ── Main builder ──────────────────────────────────────────────────────────
export function buildRoofReportPDF(data: ReportData, reportId: string) {
  const fullAddress = [data.address, data.city, data.state, data.zip].filter(Boolean).join(', ')
  const wastePcts = [0, 10, 12, 15, 17, 20]

  // Steep pitches only for waste table (≥3/12)
  const steepSqft = data.pitchBreakdown
    .filter(p => parseInt(p.pitch.split('/')[0]) >= 3)
    .reduce((acc, p) => acc + p.sqft, 0)

  return h(Document, { title: 'ProGuild Roof Report \u2014 ' + data.address, author: 'ProGuild.ai' },

    // ── PAGE 1: COVER ───────────────────────────────────────────────────
    h(Page, { size: 'LETTER', style: S.page },
      // flex:1 wrapper — keeps absolute footer from collapsing image layout
      h(View, { style: { flex: 1 } },
        h(View, { style: S.coverHeader },
          h(Text, { style: S.coverTitle }, 'Satellite Roof Measurement Report'),
          h(Text, { style: S.coverSub }, 'Powered by ProGuild \u00B7 Google Solar API')
        ),
        h(Image, { src: data.imgTopView, style: S.coverImg }),
        h(Text, { style: S.coverAddress }, fullAddress),
        h(View, { style: S.coverProBox },
          h(Text, { style: S.coverProName }, data.proName),
          ...(data.proCompany ? [h(Text, { style: S.coverProCo }, data.proCompany)] : []),
          ...(data.proPhone ? [h(Text, { style: S.coverProContact }, data.proPhone)] : []),
          ...(data.proEmail ? [h(Text, { style: S.coverProContact }, data.proEmail)] : []),
          h(Text, { style: { ...S.coverProContact, marginTop: 6 } }, 'Generated ' + data.generatedDate)
        )
      ),
      h(View, { style: S.coverFooter },
        h(Text, { style: S.coverFootTxt }, 'Measurements via Google Solar API \u00B7 Images \u00A9 Google'),
        h(Text, { style: S.coverFootTxt }, 'ProGuild.ai \u2014 For bid preparation use')
      )
    ),

    // ── PAGE 2: MEASUREMENTS ────────────────────────────────────────────
    h(Page, { size: 'LETTER', style: S.page },
      pageHeader(data.address, reportId),
      // flex:1 wrapper isolates body from absolute footer
      h(View, { style: { flex: 1, padding: '16 20 20 20' } },
        sectionBar('Roof Measurements'),
        h(Image, { src: data.imgTopView, style: S.dataImg }),
        h(View, { style: S.metricRow },
          h(View, { style: S.metricBox },
            h(Text, { style: S.metricVal }, data.totalSquaresRaw.toFixed(2)),
            h(Text, { style: S.metricLbl }, 'Total Squares'),
            h(Text, { style: S.metricSub }, 'Order qty: ' + data.totalSquaresOrder.toFixed(1) + ' sq')
          ),
          h(View, { style: S.metricBox },
            h(Text, { style: S.metricVal }, data.dominantPitch),
            h(Text, { style: S.metricLbl }, 'Dominant Pitch'),
            h(Text, { style: S.metricSub }, data.totalSqft.toLocaleString() + ' sq ft total')
          ),
          h(View, { style: S.metricBox },
            h(Text, { style: S.metricVal }, String(data.facetCount)),
            h(Text, { style: S.metricLbl }, 'Roof Facets'),
            h(Text, { style: S.metricSub }, 'Complexity indicator')
          ),
          h(View, { style: S.metricBox },
            h(Text, { style: S.metricVal }, data.wasteFactor + '%'),
            h(Text, { style: S.metricLbl }, 'Waste Factor'),
            h(Text, { style: S.metricSub }, 'Not included in sq')
          )
        ),
        h(View, { style: S.tbl },
          h(View, { style: S.tblHead },
            h(Text, { style: S.tblHeadCellSm }, 'Pitch'),
            h(Text, { style: S.tblHeadCell }, 'Area (sq ft)'),
            h(Text, { style: S.tblHeadCell }, 'Squares'),
            h(Text, { style: S.tblHeadCell }, '% of Roof')
          ),
          ...data.pitchBreakdown.map((row, i) =>
            h(View, { key: row.pitch, style: i % 2 === 0 ? S.tblRow : S.tblRowAlt },
              h(Text, { style: S.tblCellSmBold }, row.pitch),
              h(Text, { style: S.tblCell }, row.sqft.toLocaleString()),
              h(Text, { style: S.tblCell }, row.sq.toFixed(1)),
              h(Text, { style: S.tblCell }, row.pct + '%')
            )
          ),
          h(View, { style: S.tblRowTot },
            h(Text, { style: S.tblCellSmTeal }, 'TOTAL'),
            h(Text, { style: S.tblCellTeal }, data.totalSqft.toLocaleString()),
            h(Text, { style: S.tblCellTeal }, data.totalSquaresRaw.toFixed(2)),
            h(Text, { style: S.tblCellTeal }, '100%')
          )
        ),
        h(Text, { style: S.footnote },
          '* Total squares does NOT include waste. Imagery date: ' + data.imageryDate + '.\nMeasurements provided by Google Solar API. Field verification recommended before ordering materials.'
        ),
        h(Text, { style: S.disclaimer },
          '\u26A0 This report is designed for bid preparation and sales use. For insurance claim submissions, a certified measurement report may be required by your carrier.'
        )
      ),
      pageFooter(data.generatedDate)
    ),

    // ── PAGE 3: TOP VIEW ────────────────────────────────────────────────
    h(Page, { size: 'LETTER', style: S.page },
      pageHeader(data.address, reportId),
      h(View, { style: S.body },
        sectionBar('Images \u2014 Top View'),
        h(Text, { style: { fontSize: 10, color: MUTED, marginBottom: 10 } },
          'Satellite top-down view of this structure for reference.'
        ),
        h(Image, { src: data.imgTopView, style: { height: 440, borderRadius: 10 } }),
        h(Text, { style: { ...S.footnote, textAlign: 'right', marginTop: 6 } },
          'Imagery date: ' + data.imageryDate + ' \u00B7 \u00A9 Google'
        )
      ),
      pageFooter(data.generatedDate)
    ),

    // ── PAGE 4: ZOOM PROGRESSION ─────────────────────────────────────────
    h(Page, { size: 'LETTER', style: S.page },
      pageHeader(data.address, reportId),
      h(View, { style: S.body },
        sectionBar('Images — Aerial Detail Views'),
        h(Text, { style: { fontSize: 10, color: MUTED, marginBottom: 12 } },
          'Satellite imagery at three zoom levels confirming property location and roof extent.'
        ),
        h(View, { style: S.gridRow },
          h(View, { style: S.gridImgWrap },
            h(Image, { src: data.imgZoom21, style: S.gridImg }),
            h(Text, { style: S.gridLabel }, 'Close-Up View')
          ),
          h(View, { style: S.gridImgWrap },
            h(Image, { src: data.imgZoom20, style: S.gridImg }),
            h(Text, { style: S.gridLabel }, 'Property View')
          )
        ),
        h(View, { style: { marginBottom: 10 } },
          h(Image, { src: data.imgZoom19, style: { height: 150, borderRadius: 8 } }),
          h(Text, { style: S.gridLabel }, 'Neighbourhood Context')
        ),
        h(Text, { style: S.footnote },
          'Imagery © Google. All views centered on building centroid (' + data.buildingLat.toFixed(6) + ', ' + data.buildingLng.toFixed(6) + '). Imagery date: ' + data.imageryDate + '.'
        )
      ),
      pageFooter(data.generatedDate)
    ),

        // ── PAGE 5: PITCH + WASTE TABLE ─────────────────────────────────────
    h(Page, { size: 'LETTER', style: S.page },
      pageHeader(data.address, reportId),
      h(View, { style: S.body },
        sectionBar('Areas Per Pitch'),
        h(View, { style: S.tbl },
          h(View, { style: S.tblHead },
            h(Text, { style: S.tblHeadCellSm }, 'Pitch'),
            h(Text, { style: S.tblHeadCell }, 'Area (sq ft)'),
            h(Text, { style: S.tblHeadCell }, '% of Roof'),
            h(Text, { style: S.tblHeadCell }, 'Squares')
          ),
          ...data.pitchBreakdown.map((row, i) =>
            h(View, { key: row.pitch, style: i % 2 === 0 ? S.tblRow : S.tblRowAlt },
              h(Text, { style: S.tblCellSmBold }, row.pitch),
              h(Text, { style: S.tblCell }, row.sqft.toLocaleString()),
              h(Text, { style: S.tblCell }, row.pct + '%'),
              h(Text, { style: S.tblCell }, row.sq.toFixed(1))
            )
          )
        ),

        // Waste Calculation Table
        h(View, { style: { marginTop: 20 } },
          sectionBar('Waste Calculation Table'),
          h(Text, { style: { fontSize: 9, color: MUTED, marginBottom: 8 } },
            'NOTE: Applies to asphalt shingle areas with pitch >= 3/12 only (' + steepSqft.toLocaleString() + ' sq ft). Ridge, hip, and starter lengths not included.'
          ),
          h(View, { style: S.wasteTbl },
            // Header row
            h(View, { style: S.tblHead },
              ...wastePcts.map(pct =>
                h(Text, {
                  key: pct,
                  style: pct === data.wasteFactor ? S.wasteThlHighlight : S.tblHeadCell
                }, pct + '%' + (pct === data.wasteFactor ? ' \u2605' : ''))
              )
            ),
            // Area row
            h(View, { style: S.tblRow },
              ...wastePcts.map((pct, i) =>
                h(Text, {
                  key: pct,
                  style: pct === data.wasteFactor
                    ? { ...S.tblCell, fontFamily: 'Helvetica-Bold', color: TEAL }
                    : i % 2 !== 0 ? { ...S.tblCell, backgroundColor: ROW_ALT } : S.tblCell
                }, Math.round(steepSqft * (1 + pct / 100)).toLocaleString() + ' ft\u00B2')
              )
            ),
            // Squares row
            h(View, { style: S.tblRowAlt },
              ...wastePcts.map(pct =>
                h(Text, {
                  key: pct,
                  style: pct === data.wasteFactor
                    ? { ...S.tblCell, fontFamily: 'Helvetica-Bold', color: TEAL }
                    : S.tblCell
                }, wasteArea(steepSqft, pct) + ' sq')
              )
            )
          ),
          h(Text, { style: { ...S.footnote, marginTop: 8 } },
            '\u2605 Suggested waste factor based on roof complexity (' + data.facetCount + ' facets). Actual percentages may differ based on installation techniques and crew experience.'
          )
        ),

        // Summary box
        h(View, { style: S.summaryBox },
          h(Text, { style: S.summaryTitle }, 'Report Summary'),
          h(View, { style: S.summaryRow },
            h(View, { style: S.summaryCol },
              h(Text, { style: S.summaryLine }, 'Total Roof Area: ', h(Text, { style: S.summaryVal }, data.totalSqft.toLocaleString() + ' sq ft')),
              h(Text, { style: S.summaryLine }, 'Measured Squares: ', h(Text, { style: S.summaryVal }, data.totalSquaresRaw.toFixed(2) + ' sq')),
              h(Text, { style: S.summaryLine }, 'Order Quantity: ', h(Text, { style: S.summaryVal }, data.totalSquaresOrder.toFixed(1) + ' sq'))
            ),
            h(View, { style: S.summaryCol },
              h(Text, { style: S.summaryLine }, 'Total Facets: ', h(Text, { style: S.summaryVal }, String(data.facetCount))),
              h(Text, { style: S.summaryLine }, 'Predominant Pitch: ', h(Text, { style: S.summaryVal }, data.dominantPitch)),
              h(Text, { style: S.summaryLine }, 'Suggested Waste: ', h(Text, { style: S.summaryVal }, data.wasteFactor + '%'))
            )
          )
        )
      ),
      pageFooter(data.generatedDate)
    )
  )
}
