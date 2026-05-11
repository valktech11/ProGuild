// lib/roofing/premiumReportPdf.ts
// Premium Roof Report PDF — EagleView Premium equivalent
// Uses React.createElement (aliased as h) — NO JSX — SWC JSX transform breaks react-pdf
// export const runtime = 'nodejs' is set on the API route, not here

import React from 'react'
import {
  Document, Page, View, Text, Image,
  StyleSheet, Font
} from '@react-pdf/renderer'

const h = React.createElement

// ── Colour tokens ──────────────────────────────────────────────────────────
const NAVY    = '#0A1628'
const TEAL    = '#0F766E'
const TEAL_L  = '#14B8A6'
const TEAL_XL = '#F0FDFA'
const CREAM   = '#F5F4F0'
const BORDER  = '#E8E2D9'
const MUTED   = '#9CA3AF'
const WHITE   = '#FFFFFF'
const AMBER   = '#F59E0B'
const AMBER_L = '#FFFBEB'
const AMBER_B = '#92400E'
const PURPLE  = '#7C3AED'
const PURPLE_L = '#F5F3FF'
const RED     = '#DC2626'
const GREEN   = '#166534'
const GREEN_L = '#DCFCE7'

// ── Types ──────────────────────────────────────────────────────────────────
export interface PremiumPitchRow {
  pitch: string
  area: number
  squares: number
  pct: number
  isLowSlope: boolean
}

export interface PremiumLinearFootage {
  ridge_ft: number
  hip_ft: number
  valley_ft: number
  rake_ft: number
  eave_ft: number
  total_linear_ft: number
  facet_count?: number
}

export interface PremiumReportData {
  address: string
  proName: string
  proEmail: string
  proPhone: string
  generatedDate: string
  imageryDate: string
  totalSqft: number
  totalSquaresOrder: number
  facetCount: number
  dominantPitch: string
  wasteFactor: number
  pitchBreakdown: PremiumPitchRow[]
  linearFootage: PremiumLinearFootage | null
  lat: number
  lng: number
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:         { backgroundColor: WHITE, fontFamily: 'Helvetica' },
  pageHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 14, paddingBottom: 10, backgroundColor: NAVY, marginBottom: 0 },
  headerAddr:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: WHITE },
  headerRight:  { fontSize: 9, color: TEAL_L, textAlign: 'right' },
  reportBadge:  { fontSize: 9, color: MUTED, textAlign: 'right' },
  body:         { paddingHorizontal: 28, paddingTop: 14, paddingBottom: 40, flex: 1 },
  footer:       { position: 'absolute', bottom: 14, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', borderTop: `1 solid ${BORDER}` },
  footerTxt:    { fontSize: 7, color: MUTED, paddingTop: 5 },
  sectionBar:   { backgroundColor: TEAL_XL, borderLeft: `4 solid ${TEAL}`, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10, marginTop: 14 },
  sectionTxt:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.6 },
  // Tables
  tbl:          { borderRadius: 6, overflow: 'hidden', marginTop: 4 },
  tblHead:      { flexDirection: 'row', backgroundColor: NAVY },
  tblHeadCell:  { flex: 1, padding: '6 8', fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE },
  tblHeadCellSm:{ width: 60, padding: '6 8', fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE },
  tblRow:       { flexDirection: 'row', borderBottom: `1 solid ${BORDER}` },
  tblRowAlt:    { flexDirection: 'row', borderBottom: `1 solid ${BORDER}`, backgroundColor: '#F9FAFB' },
  tblCell:      { flex: 1, padding: '5 8', fontSize: 9, color: NAVY },
  tblCellSm:    { width: 60, padding: '5 8', fontSize: 9, color: NAVY },
  tblCellAmber: { flex: 1, padding: '5 8', fontSize: 9, color: AMBER_B, backgroundColor: AMBER_L },
  tblCellAmberSm:{ width: 60, padding: '5 8', fontSize: 9, color: AMBER_B, backgroundColor: AMBER_L },
  // Metric boxes
  metricRow:    { flexDirection: 'row', gap: 8, marginTop: 10 },
  metricBox:    { flex: 1, padding: '10 8', backgroundColor: TEAL_XL, borderRadius: 8, alignItems: 'center', border: `1 solid #CCFBF1` },
  metricVal:    { fontSize: 18, fontFamily: 'Helvetica-Bold', color: TEAL },
  metricLbl:    { fontSize: 7, color: MUTED, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  metricSub:    { fontSize: 7, color: TEAL, marginTop: 1 },
  // Linear footage
  linRow:       { flexDirection: 'row', marginTop: 8, gap: 6 },
  linBox:       { flex: 1, padding: '8 6', backgroundColor: CREAM, borderRadius: 6, alignItems: 'center', border: `1 solid ${BORDER}` },
  linVal:       { fontSize: 14, fontFamily: 'Helvetica-Bold', color: NAVY },
  linLabel:     { fontSize: 7, color: MUTED, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  linSub:       { fontSize: 6.5, color: TEAL, marginTop: 1 },
  // Summary box
  summaryBox:   { marginTop: 14, padding: '12 14', backgroundColor: CREAM, borderRadius: 10 },
  summaryTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 8, borderBottom: `1 solid ${BORDER}`, paddingBottom: 5 },
  summaryRow:   { flexDirection: 'row', marginBottom: 3 },
  summaryKey:   { width: 160, fontSize: 9, color: MUTED },
  summaryVal:   { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  // Waste table
  wasteGrid:    { flexDirection: 'row', marginTop: 6 },
  wasteCell:    { flex: 1, padding: '5 4', alignItems: 'center', borderRight: `1 solid ${BORDER}`, borderBottom: `1 solid ${BORDER}` },
  wastePct:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY },
  wasteSq:      { fontSize: 7, color: MUTED, marginTop: 1 },
  // Complexity bar
  complexityBar: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginTop: 6, marginBottom: 4 },
  // Badges
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: '4 10', backgroundColor: PURPLE_L, borderRadius: 20, alignSelf: 'flex-start', border: `1 solid #DDD6FE`, marginBottom: 10 },
  premiumTxt:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: PURPLE },
})

// ── Helpers ──────────────────────────────────────────────────────────────────
function pageHeader(address: string, reportType: string) {
  return h(View, { style: S.pageHeader },
    h(Text, { style: S.headerAddr }, address),
    h(View, null,
      h(Text, { style: S.headerRight }, reportType),
      h(Text, { style: S.reportBadge }, 'ProGuild.ai — Premium Roof Report')
    )
  )
}

function pageFooter(date: string, pageNum: string) {
  return h(View, { style: S.footer },
    h(Text, { style: S.footerTxt }, `© ProGuild.ai · Powered by Google Solar API · ${date} · For bid preparation use only`),
    h(Text, { style: S.footerTxt }, `PAGE ${pageNum}`)
  )
}

function sectionBar(label: string) {
  return h(View, { style: S.sectionBar },
    h(Text, { style: S.sectionTxt }, label)
  )
}

function complexityLevel(facetCount: number): { label: string; position: number } {
  if (facetCount <= 6) return { label: 'Simple', position: 0.17 }
  if (facetCount <= 14) return { label: 'Normal', position: 0.5 }
  return { label: 'Complex', position: 0.83 }
}

// ── PDF Document ─────────────────────────────────────────────────────────────
export function buildPremiumRoofReportPDF(data: PremiumReportData) {
  const lf = data.linearFootage
  const complexity = complexityLevel(data.facetCount)

  // Waste table columns (matching EagleView's 9-column format)
  const wasteFactors = [0, 3, 8, 11, 13, 15, 18, 23, 28]
  const eligibleSqft = (data.pitchBreakdown ?? [])
    .filter(r => !r.isLowSlope)
    .reduce((s, r) => s + (r.area || 0), 0)

  return h(Document, null,

    // ══ PAGE 1: COVER ════════════════════════════════════════════════════════
    h(Page, { size: 'LETTER', style: S.page },
      // Navy header banner
      h(View, { style: { backgroundColor: NAVY, padding: '20 28 18 28' } },
        h(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 } },
          h(Text, { style: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: WHITE } }, 'ProGuild Premium Report'),
          h(View, { style: S.premiumBadge },
            h(Text, { style: S.premiumTxt }, 'PREMIUM — Detailed Measurements + Material Quantities')
          )
        ),
        h(Text, { style: { fontSize: 10, color: TEAL_L } }, 'Powered by ProGuild · Google Solar API')
      ),

      h(View, { style: { padding: '16 28 0 28' } },
        // Address
        h(Text, { style: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: NAVY, textAlign: 'center', marginBottom: 14 } }, data.address),

        // Two-column layout: Measurements summary + Prepared For
        h(View, { style: { flexDirection: 'row', gap: 14 } },

          // Left: Measurements summary box
          h(View, { style: { flex: 1, padding: '12 14', backgroundColor: CREAM, borderRadius: 10, border: `1 solid ${BORDER}` } },
            h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 } }, 'MEASUREMENTS'),
            ...[
              ['Total Roof Area', `${(data.totalSqft || 0).toLocaleString()} sq ft`],
              ['Order Quantity', `${(data.totalSquaresOrder || 0).toFixed(1)} squares`],
              ['Total Facets', `${data.facetCount}`],
              ['Predominant Pitch', data.dominantPitch],
              ['Suggested Waste', `${data.wasteFactor}%`],
              ...(lf ? [
                ['Total Ridges/Hips', `${((lf.ridge_ft || 0) + (lf.hip_ft || 0))} ft`],
                ['Total Valleys', `${lf.valley_ft || 0} ft`],
                ['Total Rakes', `${lf.rake_ft || 0} ft`],
                ['Total Eaves', `${lf.eave_ft || 0} ft`],
              ] : [['Linear Footage', 'Run DSM analysis']]),
            ].map(([k, v]) =>
              h(View, { style: { flexDirection: 'row', marginBottom: 3 } },
                h(Text, { style: { width: 120, fontSize: 8, color: MUTED } }, k),
                h(Text, { style: { flex: 1, fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY } }, v)
              )
            )
          ),

          // Right: Pro box
          h(View, { style: { width: 200, padding: '12 14', backgroundColor: CREAM, borderRadius: 10, border: `1 solid ${BORDER}` } },
            h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: TEAL, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 } }, 'PREPARED FOR'),
            h(Text, { style: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 3 } }, data.proName),
            ...(data.proEmail ? [h(Text, { style: { fontSize: 8, color: MUTED, marginBottom: 2 } }, data.proEmail)] : []),
            ...(data.proPhone ? [h(Text, { style: { fontSize: 8, color: MUTED, marginBottom: 2 } }, data.proPhone)] : []),
            h(View, { style: { marginTop: 10, padding: '6 8', backgroundColor: GREEN_L, borderRadius: 6, border: `1 solid #BBF7D0` } },
              h(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: GREEN } }, '✓ ProGuild Verified'),
              h(Text, { style: { fontSize: 7, color: GREEN, marginTop: 1 } }, 'Generated ' + data.generatedDate)
            )
          )
        ),

        // Metric boxes row
        h(View, { style: S.metricRow },
          ...[
            { val: (data.totalSquaresOrder || 0).toFixed(1) + ' sq', lbl: 'Order Quantity', sub: (data.totalSqft || 0).toLocaleString() + ' sq ft total' },
            { val: data.dominantPitch, lbl: 'Dominant Pitch', sub: 'Predominant slope' },
            { val: String(data.facetCount), lbl: 'Roof Facets', sub: 'Complexity indicator' },
            { val: data.wasteFactor + '%', lbl: 'Waste Factor', sub: 'Not incl. in sq' },
          ].map(({ val, lbl, sub }) =>
            h(View, { style: S.metricBox },
              h(Text, { style: S.metricVal }, val),
              h(Text, { style: S.metricLbl }, lbl),
              h(Text, { style: S.metricSub }, sub)
            )
          )
        ),

        // Linear footage boxes (if available)
        ...(lf ? [
          h(View, { style: { marginTop: 12 } },
            h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 6 } }, 'LINEAR FOOTAGE SUMMARY'),
            h(View, { style: S.linRow },
              ...[
                { val: (lf.ridge_ft || 0), lbl: 'Ridge', sub: 'Ridge cap' },
                { val: (lf.hip_ft || 0), lbl: 'Hip', sub: 'Hip cap' },
                { val: (lf.valley_ft || 0), lbl: 'Valley', sub: 'Flashing' },
                { val: (lf.rake_ft || 0), lbl: 'Rake', sub: 'Drip edge' },
                { val: (lf.eave_ft || 0), lbl: 'Eave', sub: 'Starter/drip' },
                { val: (lf.total_linear_ft || 0), lbl: 'Total LF', sub: 'All lines' },
              ].map(({ val, lbl, sub }) =>
                h(View, { style: S.linBox },
                  h(Text, { style: S.linVal }, val + ' ft'),
                  h(Text, { style: S.linLabel }, lbl),
                  h(Text, { style: S.linSub }, sub)
                )
              )
            ),
            h(Text, { style: { fontSize: 7, color: MUTED, marginTop: 4 } },
              '\u00B1 6 inches per line segment. Sufficient for material ordering. Field verification recommended.'
            )
          )
        ] : []),
      ),

      pageFooter(data.generatedDate, '1')
    ),

    // ══ PAGE 2: REPORT SUMMARY ════════════════════════════════════════════════
    h(Page, { size: 'LETTER', style: S.page },
      pageHeader(data.address, 'Premium Report'),
      h(View, { style: S.body },

        sectionBar('Areas Per Pitch'),
        h(View, { style: S.tbl },
          h(View, { style: S.tblHead },
            h(Text, { style: S.tblHeadCellSm }, 'Pitch'),
            h(Text, { style: S.tblHeadCell }, 'Area (sq ft)'),
            h(Text, { style: S.tblHeadCell }, '% of Roof'),
            h(Text, { style: S.tblHeadCell }, 'Squares'),
            h(Text, { style: { width: 80, padding: '6 8', fontSize: 8, fontFamily: 'Helvetica-Bold', color: WHITE } }, 'Type')
          ),
          ...data.pitchBreakdown.map((row, i) =>
            h(View, { style: row.isLowSlope ? { flexDirection: 'row', borderBottom: `1 solid ${BORDER}`, backgroundColor: AMBER_L } : (i % 2 === 0 ? S.tblRow : S.tblRowAlt) },
              h(Text, { style: row.isLowSlope ? { ...S.tblCellSm, color: AMBER_B, fontFamily: 'Helvetica-Bold' } : S.tblCellSm }, row.pitch),
              h(Text, { style: row.isLowSlope ? S.tblCellAmber : S.tblCell }, (row.area || 0).toLocaleString()),
              h(Text, { style: row.isLowSlope ? S.tblCellAmber : S.tblCell }, row.pct + '%'),
              h(Text, { style: row.isLowSlope ? S.tblCellAmber : S.tblCell }, (row.squares || 0).toFixed(1)),
              h(Text, { style: { width: 80, padding: '5 8', fontSize: 9, color: row.isLowSlope ? AMBER_B : MUTED } }, row.isLowSlope ? 'Low Slope' : 'Steep Slope')
            )
          ),
          h(View, { style: { flexDirection: 'row', borderTop: `2 solid ${TEAL}`, backgroundColor: TEAL_XL } },
            h(Text, { style: { ...S.tblCellSm, fontFamily: 'Helvetica-Bold', color: TEAL } }, 'TOTAL'),
            h(Text, { style: { ...S.tblCell, fontFamily: 'Helvetica-Bold', color: TEAL } }, (data.totalSqft || 0).toLocaleString()),
            h(Text, { style: { ...S.tblCell, fontFamily: 'Helvetica-Bold', color: TEAL } }, '100%'),
            h(Text, { style: { ...S.tblCell, fontFamily: 'Helvetica-Bold', color: TEAL } }, ((data.totalSqft || 0) / 100).toFixed(2)),
            h(Text, { style: { width: 80, padding: '5 8' } }, '')
          )
        ),

        sectionBar('Structure Complexity'),
        h(View, { style: { marginTop: 4, marginBottom: 2 } },
          h(View, { style: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 } },
            h(Text, { style: { fontSize: 8, color: MUTED } }, 'Simple (≤6 facets)'),
            h(Text, { style: { fontSize: 8, color: MUTED } }, 'Normal (7–14 facets)'),
            h(Text, { style: { fontSize: 8, color: MUTED } }, 'Complex (15+ facets)')
          ),
          h(View, { style: { height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row' } },
            h(View, { style: { flex: 1, backgroundColor: '#BBF7D0' } }),
            h(View, { style: { flex: 1, backgroundColor: TEAL_L } }),
            h(View, { style: { flex: 1, backgroundColor: TEAL } })
          ),
          h(View, { style: { marginTop: 4, alignItems: complexity.position < 0.33 ? 'flex-start' : complexity.position < 0.66 ? 'center' : 'flex-end' } },
            h(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
              h(View, { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: NAVY } }),
              h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY } }, `${complexity.label} — ${data.facetCount} facets`)
            )
          )
        ),

        sectionBar('Waste Calculation Table'),
        h(Text, { style: { fontSize: 7.5, color: MUTED, marginBottom: 6 } },
          `Applies to asphalt shingle areas with pitch ≥ 3/12 only (${(eligibleSqft || 0).toLocaleString()} sq ft). Ridge, hip, and starter lengths not included.`
        ),
        h(View, { style: { border: `1 solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' } },
          h(View, { style: { flexDirection: 'row', backgroundColor: NAVY } },
            ...wasteFactors.map(w => h(View, { style: { flex: 1, padding: '5 4', alignItems: 'center', borderRight: `1 solid rgba(255,255,255,0.1)` } },
              h(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: w === data.wasteFactor ? AMBER : WHITE } }, w + '%'),
              h(Text, { style: { fontSize: 7, color: w === data.wasteFactor ? AMBER_L : MUTED, marginTop: 1 } }, w === data.wasteFactor ? '← Suggested' : '')
            ))
          ),
          h(View, { style: { flexDirection: 'row', borderTop: `1 solid ${BORDER}` } },
            ...wasteFactors.map(w => {
              const adjusted = eligibleSqft * (1 + w / 100)
              const squares = adjusted / 100
              const isSuggested = w === data.wasteFactor
              return h(View, { style: { flex: 1, padding: '5 4', alignItems: 'center', borderRight: `1 solid ${BORDER}`, backgroundColor: isSuggested ? AMBER_L : WHITE } },
                h(Text, { style: { fontSize: 7.5, fontFamily: isSuggested ? 'Helvetica-Bold' : 'Helvetica', color: isSuggested ? AMBER_B : NAVY } }, Math.round(adjusted || 0).toLocaleString() + ' ft²'),
                h(Text, { style: { fontSize: 7, color: isSuggested ? AMBER_B : MUTED, marginTop: 1 } }, squares.toFixed(1) + ' sq')
              )
            })
          )
        ),
        h(Text, { style: { fontSize: 7, color: MUTED, marginTop: 4, lineHeight: 1.4 } },
          'Suggested waste is a guide. Actual waste may differ based on installation techniques, crew experience, and material subtleties. Ridge, hip, and starter strip lengths are not included — order separately based on linear footage above.'
        ),

        // All structures totals
        h(View, { style: S.summaryBox },
          h(Text, { style: S.summaryTitle }, 'All Structures Summary'),
          h(View, { style: { flexDirection: 'row', gap: 20 } },
            h(View, { style: { flex: 1 } },
              ...[
                ['Total Roof Area', (data.totalSqft || 0).toLocaleString() + ' sq ft'],
                ['Total Roof Facets', String(data.facetCount)],
                ['Predominant Pitch', data.dominantPitch],
                ['Order Quantity', (data.totalSquaresOrder || 0).toFixed(1) + ' sq'],
                ['Suggested Waste', data.wasteFactor + '%'],
              ].map(([k, v]) => h(View, { style: S.summaryRow },
                h(Text, { style: S.summaryKey }, k),
                h(Text, { style: S.summaryVal }, v)
              ))
            ),
            h(View, { style: { flex: 1 } },
              ...(lf ? [
                ['Total Ridges + Hips', `${((lf.ridge_ft || 0) + (lf.hip_ft || 0))} ft`],
                ['  · Ridges', `${lf.ridge_ft || 0} ft`],
                ['  · Hips', `${lf.hip_ft || 0} ft`],
                ['Total Valleys', `${lf.valley_ft || 0} ft`],
                ['Total Rakes', `${lf.rake_ft || 0} ft`],
                ['Total Eaves', `${lf.eave_ft || 0} ft`],
                ['Drip Edge (Eaves + Rakes)', `${((lf.eave_ft || 0) + (lf.rake_ft || 0))} ft`],
              ] : [['Linear Footage', 'Run DSM analysis first']]).map(([k, v]) =>
                h(View, { style: S.summaryRow },
                  h(Text, { style: S.summaryKey }, k),
                  h(Text, { style: S.summaryVal }, v)
                )
              )
            )
          ),
          h(View, { style: { marginTop: 8, flexDirection: 'row', gap: 8 } },
            h(View, null,
              h(Text, { style: { fontSize: 7.5, color: MUTED } }, `Imagery date: ${data.imageryDate}`),
              h(Text, { style: { fontSize: 7.5, color: MUTED } }, `Coordinates: ${(data.lat || 0).toFixed(6)}, ${(data.lng || 0).toFixed(6)}`)
            )
          )
        )
      ),
      pageFooter(data.generatedDate, '2')
    ),

    // ══ PAGE 3: LINEAR FOOTAGE DETAIL (if available) ══════════════════════════
    ...(lf ? [
      h(Page, { size: 'LETTER', style: S.page },
        pageHeader(data.address, 'Premium Report'),
        h(View, { style: S.body },
          sectionBar('Linear Footage — Detailed Breakdown'),
          h(Text, { style: { fontSize: 9, color: MUTED, marginBottom: 10, lineHeight: 1.5 } },
            'Linear footage computed from Google Solar API roof segment geometry. Accuracy: ±15% estimated. Sufficient for material ordering. Field verification recommended before final order.'
          ),

          // Large linear footage display
          h(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 } },
            ...[
              { label: 'Ridge', val: (lf.ridge_ft || 0), color: RED, bg: '#FEF2F2', border: '#FECACA', use: 'Ridge cap shingles', order: 'Per bundle (33 lf)' },
              { label: 'Hip', val: (lf.hip_ft || 0), color: '#D97706', bg: AMBER_L, border: '#FDE68A', use: 'Hip & ridge cap', order: 'Per bundle (33 lf)' },
              { label: 'Valley', val: (lf.valley_ft || 0), color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', use: 'Valley flashing / ice & water', order: 'Per roll (50 lf)' },
              { label: 'Eave', val: (lf.eave_ft || 0), color: NAVY, bg: CREAM, border: BORDER, use: 'Drip edge + starter strip', order: 'Per 10-ft piece / roll' },
              { label: 'Rake', val: (lf.rake_ft || 0), color: TEAL, bg: TEAL_XL, border: '#CCFBF1', use: 'Rake drip edge', order: 'Per 10-ft piece' },
            ].map(({ label, val, color, bg, border, use, order }) =>
              h(View, { style: { width: '18%', padding: '12 8', backgroundColor: bg, borderRadius: 10, border: `1.5 solid ${border}`, alignItems: 'center' } },
                h(Text, { style: { fontSize: 22, fontFamily: 'Helvetica-Bold', color } }, val + ' ft'),
                h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginTop: 4 } }, label),
                h(Text, { style: { fontSize: 7, color: MUTED, marginTop: 2, textAlign: 'center' } }, use),
                h(Text, { style: { fontSize: 7, color, marginTop: 2, fontFamily: 'Helvetica-Bold' } }, order)
              )
            )
          ),

          // Material order guide table
          sectionBar('Material Order Guide'),
          h(View, { style: S.tbl },
            h(View, { style: S.tblHead },
              h(Text, { style: S.tblHeadCellSm }, 'Line Type'),
              h(Text, { style: S.tblHeadCell }, 'Linear Footage'),
              h(Text, { style: S.tblHeadCell }, 'Material Needed'),
              h(Text, { style: S.tblHeadCell }, 'Unit Size'),
              h(Text, { style: S.tblHeadCell }, 'Order Qty (suggested)')
            ),
            ...[
              { type: 'Ridge', ft: lf.ridge_ft, material: 'Ridge cap shingles', unit: 'Bundle = 33 lf', qty: Math.ceil((lf.ridge_ft || 0) / 33) + ' bundles' },
              { type: 'Hip', ft: lf.hip_ft, material: 'Hip & ridge cap', unit: 'Bundle = 33 lf', qty: Math.ceil((lf.hip_ft || 0) / 33) + ' bundles' },
              { type: 'Valley', ft: lf.valley_ft, material: 'Valley flashing / ice & water', unit: 'Roll = 50 lf', qty: Math.ceil((lf.valley_ft || 0) / 50) + ' rolls' },
              { type: 'Eave', ft: lf.eave_ft, material: 'Drip edge + starter strip', unit: '10-ft pieces / 100-lf roll', qty: Math.ceil((lf.eave_ft || 0) / 10) + ' pcs drip + ' + Math.ceil((lf.eave_ft || 0) / 100) + ' roll starter' },
              { type: 'Rake', ft: lf.rake_ft, material: 'Rake drip edge', unit: '10-ft pieces', qty: Math.ceil((lf.rake_ft || 0) / 10) + ' pieces' },
            ].map((row, i) =>
              h(View, { style: i % 2 === 0 ? S.tblRow : S.tblRowAlt },
                h(Text, { style: { ...S.tblCellSm, fontFamily: 'Helvetica-Bold' } }, row.type),
                h(Text, { style: { ...S.tblCell, fontFamily: 'Helvetica-Bold', color: TEAL } }, row.ft + ' ft'),
                h(Text, { style: S.tblCell }, row.material),
                h(Text, { style: S.tblCell }, row.unit),
                h(Text, { style: { ...S.tblCell, fontFamily: 'Helvetica-Bold' } }, row.qty)
              )
            )
          ),
          h(Text, { style: { fontSize: 7.5, color: MUTED, marginTop: 8, lineHeight: 1.5 } },
            'Order quantities are minimums. Add 10% overage for cuts and waste on linear materials. Verify counts with supplier before ordering. Flashing and step flashing quantities require on-site measurement.'
          ),

          // Coordinates + directions
          h(View, { style: { marginTop: 16, padding: '10 12', backgroundColor: CREAM, borderRadius: 8 } },
            h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 4 } }, 'Property Information'),
            h(Text, { style: { fontSize: 8, color: MUTED } }, `Coordinates: ${(data.lat || 0).toFixed(6)}, ${(data.lng || 0).toFixed(6)}`),
            h(Text, { style: { fontSize: 8, color: TEAL, marginTop: 2 } }, `Open in Google Maps: https://maps.google.com/?q=${data.lat},${data.lng}`),
            h(Text, { style: { fontSize: 8, color: MUTED, marginTop: 4 } }, `Imagery date: ${data.imageryDate} · Report generated: ${data.generatedDate}`)
          )
        ),
        pageFooter(data.generatedDate, '3')
      )
    ] : []),

    // ══ FINAL PAGE: Disclaimer ════════════════════════════════════════════════
    h(Page, { size: 'LETTER', style: S.page },
      pageHeader(data.address, 'Premium Report'),
      h(View, { style: { ...S.body, justifyContent: 'center' } },
        h(View, { style: { padding: '20 24', backgroundColor: CREAM, borderRadius: 12 } },
          h(Text, { style: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: NAVY, marginBottom: 12 } }, 'Important Notice and Disclaimer'),
          ...[
            'This report is designed for bid preparation and sales use. Area measurements are derived from Google Solar API satellite imagery. Linear footage (ridge, hip, valley, eave, rake) is estimated from Google Solar API roof segment geometry.',
            'Linear footage accuracy: ±20% estimated from roof segment azimuth and area relationships. Sufficient for material ordering and bid preparation. Not suitable for permit drawings or engineering calculations.',
            'Imagery may be up to 3 years old. Verify current roof condition with a site visit before ordering materials or submitting insurance claims.',
            'For insurance claim submissions, a certified measurement report from a licensed inspector may be required by your carrier.',
            'ProGuild.ai makes no guarantee of accuracy and accepts no liability for material over- or under-ordering based on this report. Field verification is always recommended before final material orders.',
          ].map((txt, i) => h(Text, { style: { fontSize: 8.5, color: NAVY, lineHeight: 1.6, marginBottom: 8 } }, txt))
        )
      ),
      pageFooter(data.generatedDate, lf ? '4' : '3')
    )
  )
}
