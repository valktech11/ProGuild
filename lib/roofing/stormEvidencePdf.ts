// lib/roofing/stormEvidencePdf.ts
// Court-ready NOAA storm evidence PDF for FL insurance claim submission.
// Uses @react-pdf/renderer v4 via React.createElement (no JSX).

import React from 'react'
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import type { StormDate, StormEvidenceResult } from './stormEvidence'

const h = React.createElement

const NAVY  = '#0A1628'
const TEAL  = '#0F766E'
const TEAL_L= '#F0FDFA'
const RED   = '#DC2626'
const AMBER = '#D97706'
const BLUE  = '#2563EB'
const CYAN  = '#0891B2'
const GRAY  = '#6B7280'
const LGRAY = '#F3F4F6'
const MID   = '#9CA3AF'

const S = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 9, color: NAVY, padding: '36 44', backgroundColor: '#FFFFFF' },
  // Header
  hdrBar:     { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hdrBrand:   { fontSize: 14, fontFamily: 'Helvetica-Bold', color: TEAL, marginRight: 8 },
  hdrDoc:     { fontSize: 10, color: GRAY, marginTop: 2 },
  hdrRule:    { height: 2, backgroundColor: TEAL, marginBottom: 16 },
  // 2-col meta grid
  metaGrid:   { flexDirection: 'row', gap: 10, marginBottom: 14 },
  metaCol:    { flex: 1, backgroundColor: LGRAY, borderRadius: 6, padding: '9 12' },
  metaLabel:  { fontSize: 7.5, color: MID, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  // Best-date banner
  bestBanner: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 7, overflow: 'hidden', marginBottom: 16 },
  bestAccent: { width: 5, backgroundColor: RED },
  bestBody:   { flex: 1, backgroundColor: '#FEF2F2', padding: '9 14' },
  bestLabel:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: RED, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 },
  bestDate:   { fontSize: 14, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 3 },
  bestSub:    { fontSize: 8, color: '#991B1B', lineHeight: 1.5 },
  // Section title
  secTitle:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 8, marginTop: 4,
                borderBottom: '1 solid #E2E8F0', paddingBottom: 4 },
  // Date block
  dateCard:   { marginBottom: 8, borderRadius: 6, overflow: 'hidden', border: '1 solid #E2E8F0' },
  dateHdr:    { flexDirection: 'row', alignItems: 'center', padding: '6 10', backgroundColor: '#F8FAFC' },
  dateNum:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: MID, width: 16 },
  dateVal:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: NAVY, flex: 1 },
  scorePill:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#fff', backgroundColor: TEAL,
                borderRadius: 3, padding: '2 6' },
  sevBar:     { height: 3 },
  // Event row — alternating shading done via index
  evRow:      { flexDirection: 'row', alignItems: 'flex-start', padding: '4 10' },
  tagHail:    { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#fff', backgroundColor: BLUE,
                borderRadius: 2, padding: '1 4', marginRight: 7, width: 28, textAlign: 'center', marginTop: 1 },
  tagWind:    { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#fff', backgroundColor: CYAN,
                borderRadius: 2, padding: '1 4', marginRight: 7, width: 28, textAlign: 'center', marginTop: 1 },
  tagDmge:    { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#fff', backgroundColor: GRAY,
                borderRadius: 2, padding: '1 4', marginRight: 7, width: 28, textAlign: 'center', marginTop: 1 },
  evMain:     { flex: 1 },
  evMag:      { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: NAVY, lineHeight: 1.3 },
  evRemark:   { fontSize: 7.5, color: GRAY, lineHeight: 1.35, marginTop: 1.5 },
  // Warnings row
  warnRow:    { flexDirection: 'row', flexWrap: 'wrap', padding: '3 10 5 10', gap: 4 },
  warnPill:   { fontSize: 7, color: AMBER, backgroundColor: '#FEF3C7', borderRadius: 3, padding: '1 5' },
  // Disclosure
  disclosure: { marginTop: 14, backgroundColor: LGRAY, borderRadius: 5, padding: '7 10' },
  discText:   { fontSize: 7, color: GRAY, lineHeight: 1.55 },
  // Footer
  footer:     { position: 'absolute', bottom: 26, left: 44, right: 44,
                flexDirection: 'row', borderTop: '1 solid #E2E8F0', paddingTop: 5 },
  footL:      { fontSize: 7, color: MID, flex: 1 },
  footR:      { fontSize: 7, color: MID, textAlign: 'right' },
})

function severityColor(sd: StormDate): string {
  const h = sd.max_hail_in ?? 0
  const w = sd.max_wind_mph ?? 0
  if (h >= 1 || w >= 58) return RED
  if (h >= 0.75 || w >= 45) return AMBER
  return CYAN
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function eventRow(ev: StormDate['hail_events'][0], rowIdx: number) {
  const isHail = ev.event_type.includes('HAIL')
  const hasMag = ev.magnitude > 0
  const tag  = isHail ? 'HAIL' : (hasMag ? 'WIND' : 'DMGE')
  const style = isHail ? S.tagHail : (hasMag ? S.tagWind : S.tagDmge)
  const mag  = isHail ? `${ev.magnitude}"` : (hasMag ? `${ev.magnitude} mph` : 'Storm damage')
  const dist = ev.distance_miles < 0.5 ? 'on-property' : `${ev.distance_miles} mi away`
  const bg   = rowIdx % 2 === 0 ? '#fff' : LGRAY
  return h(View, { key: `${ev.datetime}-${rowIdx}`, style: { ...S.evRow, backgroundColor: bg } },
    h(Text, { style }, tag),
    h(View, { style: S.evMain },
      h(Text, { style: S.evMag }, `${mag}  ·  ${ev.county} Co  ·  ${dist}`),
      ev.remark ? h(Text, { style: S.evRemark }, ev.remark.slice(0, 120)) : null,
    ),
  )
}

function dateCard(sd: StormDate, cardIdx: number) {
  const hailStr = sd.max_hail_in  !== null ? `${sd.max_hail_in}" hail` : null
  const windStr = sd.max_wind_mph !== null ? `${sd.max_wind_mph} mph wind` : null
  const summary = [hailStr, windStr].filter(Boolean).join('  ·  ')
  const sevColor = severityColor(sd)

  const hailEvts = sd.hail_events.slice(0, 5)
  const windEvts = sd.hail_events.length === 0
    ? sd.wind_events.slice(0, 4)
    : sd.wind_events.filter(e => e.magnitude >= 45).slice(0, 2)
  const allEvts  = [...hailEvts, ...windEvts]
  let rowIdx = 0

  return h(View, { key: sd.date, style: S.dateCard, wrap: false },
    // Date header row
    h(View, { style: S.dateHdr },
      h(Text, { style: S.dateNum }, `${cardIdx + 1}.`),
      h(Text, { style: S.dateVal }, formatDate(sd.date)),
      summary ? h(Text, { style: { ...S.evMag, fontSize: 8, marginRight: 8 } }, summary) : null,
      h(Text, { style: S.scorePill }, `Score ${sd.score}`),
    ),
    // Severity bar
    h(View, { style: { ...S.sevBar, backgroundColor: sevColor } }),
    // NWS warnings
    sd.nws_warnings.length > 0 && h(View, { style: S.warnRow },
      ...sd.nws_warnings.map((w, i) => h(Text, { key: i, style: S.warnPill }, w.event))
    ),
    // Event rows with alternating shading
    ...allEvts.map(ev => eventRow(ev, rowIdx++)),
  )
}

export function renderStormEvidencePdf(
  data: StormEvidenceResult,
  proName: string,
  proCompany: string,
): React.ReactElement {
  const best = data.storm_dates[0] ?? null
  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return h(Document, { title: 'Storm Evidence Report — ProGuild' },
    h(Page, { size: 'LETTER', style: S.page },

      // Header
      h(View, { style: S.hdrBar },
        h(Text, { style: S.hdrBrand }, 'ProGuild'),
        h(Text, { style: S.hdrDoc }, '/ NOAA Storm Evidence Report'),
      ),
      h(View, { style: S.hdrRule }),

      // 2-col metadata grid
      h(View, { style: S.metaGrid },
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Property'),
          h(Text, { style: S.metaValue }, data.address || `${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}`),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Prepared by'),
          h(Text, { style: S.metaValue }, `${proName}${proCompany ? `  ·  ${proCompany}` : ''}`),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Search radius'),
          h(Text, { style: S.metaValue }, `${data.search_radius_mi} mi  ·  ${data.years_back}-yr scan`),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Generated'),
          h(Text, { style: S.metaValue }, generated),
        ),
      ),

      // Best date banner
      best
        ? h(View, { style: S.bestBanner },
            h(View, { style: S.bestAccent }),
            h(View, { style: S.bestBody },
              h(Text, { style: S.bestLabel }, 'Recommended Date of Loss'),
              h(Text, { style: S.bestDate }, formatDate(best.date)),
              h(Text, { style: S.bestSub },
                `${best.event_count} NOAA ground-truth report${best.event_count !== 1 ? 's' : ''} within ${data.search_radius_mi} miles`
                + (best.max_hail_in !== null ? `  ·  Largest hail: ${best.max_hail_in}"` : '')
                + (best.max_wind_mph !== null ? `  ·  Max wind: ${best.max_wind_mph} mph` : '')
              ),
            ),
          )
        : h(View, { style: S.disclosure },
            h(Text, { style: S.discText },
              'No significant storm events found within the search parameters. '
              + 'Consider expanding the radius or scan window, or consult NOAA Storm Data directly.')
          ),

      // Ranked event cards
      data.storm_dates.length > 0 && h(View, null,
        h(Text, { style: S.secTitle }, 'Storm Events — Ranked by Evidence Strength'),
        ...data.storm_dates.map((sd, i) => dateCard(sd, i)),
      ),

      // Disclosure
      h(View, { style: S.disclosure },
        h(Text, { style: S.discText },
          'Data: NOAA/NWS Local Storm Reports via Iowa Environmental Mesonet (IEM); NWS Cooperative Observers and Trained Spotters. '
          + `Events filtered within ${data.search_radius_mi} miles. Hail in decimal inches; wind in mph. `
          + 'Prepared for claim documentation — verify loss dates and magnitudes with carrier and public adjuster.'
        ),
      ),

      // Footer
      h(View, { style: S.footer },
        h(Text, { style: S.footL }, `ProGuild  ·  proguild.ai  ·  NOAA Storm Evidence`),
        h(Text, { style: S.footR }, `${generated}  ·  Confidential`),
      ),
    ),
  )
}
