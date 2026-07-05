// lib/roofing/stormEvidencePdf.ts
// Court-ready NOAA storm evidence PDF for FL insurance claim submission.
// Uses @react-pdf/renderer v4 via React.createElement (no JSX — same pattern
// as reportPdf.ts; avoids SWC JSX transform conflict with react-pdf).

import React from 'react'
import {
  Document, Page, View, Text, StyleSheet,
} from '@react-pdf/renderer'
import type { StormDate, StormEvidenceResult } from './stormEvidence'

const h = React.createElement

// ── Design ────────────────────────────────────────────────────────────────────
const NAVY  = '#0A1628'
const TEAL  = '#0F766E'
const RED   = '#DC2626'
const AMBER = '#D97706'
const GRAY  = '#6B7280'
const LIGHT = '#F3F4F6'

const S = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 9, color: NAVY, padding: '36 48', backgroundColor: '#FFFFFF' },
  // Header
  hdrRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  hdrBrand:   { fontSize: 13, fontFamily: 'Helvetica-Bold', color: TEAL, marginRight: 6 },
  hdrDoc:     { fontSize: 10, color: GRAY },
  hdrDivider: { height: 2, backgroundColor: TEAL, marginBottom: 14 },
  // Summary card
  card:       { backgroundColor: LIGHT, borderRadius: 6, padding: '10 14', marginBottom: 12 },
  cardRow:    { flexDirection: 'row', marginBottom: 3 },
  cardLabel:  { fontSize: 8, color: GRAY, width: 100 },
  cardValue:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: NAVY, flex: 1 },
  // Best-date highlight
  bestDate:   { backgroundColor: '#FEF2F2', borderLeft: `3 solid ${RED}`, padding: '8 12', borderRadius: 4, marginBottom: 16 },
  bestTitle:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: RED, marginBottom: 2 },
  bestSub:    { fontSize: 8, color: '#991B1B' },
  // Section
  secTitle:   { fontSize: 10, fontFamily: 'Helvetica-Bold', color: TEAL, marginBottom: 6, marginTop: 14 },
  // Storm date block
  dateBlock:  { marginBottom: 10, borderLeft: `2 solid ${TEAL}`, paddingLeft: 10 },
  dateHdr:    { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dateLabel:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY, marginRight: 8 },
  score:      { fontSize: 7, color: '#FFFFFF', backgroundColor: TEAL, borderRadius: 3, padding: '1 4' },
  evRow:      { flexDirection: 'row', marginBottom: 2, alignItems: 'flex-start' },
  evBullet:   { fontSize: 8, color: RED, marginRight: 4, marginTop: 1 },
  evText:     { fontSize: 8, color: NAVY, flex: 1, lineHeight: 1.4 },
  warnPill:   { fontSize: 7, backgroundColor: '#FEF3C7', color: AMBER, borderRadius: 3, padding: '1 5', marginRight: 4, marginBottom: 2 },
  // Footer
  footer:     { position: 'absolute', bottom: 28, left: 48, right: 48, borderTop: `1 solid ${LIGHT}`, paddingTop: 6, flexDirection: 'row' },
  footL:      { fontSize: 7, color: GRAY, flex: 1 },
  footR:      { fontSize: 7, color: GRAY, textAlign: 'right' },
  // No-data
  noData:     { padding: 20, backgroundColor: LIGHT, borderRadius: 6, textAlign: 'center' },
  noDataTxt:  { fontSize: 9, color: GRAY },
})

function eventLine(ev: StormDate['hail_events'][0], i: number) {
  const isHail = ev.event_type.includes('HAIL')
  const mag = isHail
    ? `${ev.magnitude}" hail`
    : ev.magnitude > 0 ? `${ev.magnitude} mph` : ''
  const dist = ev.distance_miles < 0.5 ? 'on-property' : `${ev.distance_miles} mi away`
  return h(View, { key: i, style: S.evRow },
    h(Text, { style: S.evBullet }, isHail ? '⬡' : '≈'),
    h(Text, { style: S.evText },
      `${mag}${mag ? ' · ' : ''}${ev.county} Co · ${dist}`
      + (ev.remark ? ` — ${ev.remark.slice(0, 80)}` : '')
    )
  )
}

function dateBlock(sd: StormDate, idx: number) {
  const hailStr = sd.max_hail_in !== null ? `${sd.max_hail_in}"` : null
  const windStr = sd.max_wind_mph !== null ? `${sd.max_wind_mph} mph` : null
  const summary = [
    hailStr && `Hail ${hailStr}`,
    windStr && `Wind ${windStr}`,
    sd.has_tornado && 'Tornado',
  ].filter(Boolean).join(' · ')

  return h(View, { key: sd.date, style: S.dateBlock, wrap: false },
    h(View, { style: S.dateHdr },
      h(Text, { style: S.dateLabel }, `${idx + 1}. ${sd.date}`),
      h(Text, { style: S.score }, `Score ${sd.score}`),
    ),
    summary ? h(Text, { style: { ...S.evText, marginBottom: 4 } }, summary) : null,
    // NWS warnings
    sd.nws_warnings.length > 0 && h(View, { style: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 } },
      ...sd.nws_warnings.map((w, i) => h(Text, { key: i, style: S.warnPill }, w.event))
    ),
    // Hail events (top 5)
    ...sd.hail_events.slice(0, 5).map((e, i) => eventLine(e, i)),
    // Wind events (top 3, only if no hail or significant)
    ...(sd.hail_events.length === 0
      ? sd.wind_events.slice(0, 3).map((e, i) => eventLine(e, 100 + i))
      : sd.wind_events.filter(e => e.magnitude >= 58).slice(0, 2).map((e, i) => eventLine(e, 200 + i))
    ),
  )
}

export function renderStormEvidencePdf(
  data: StormEvidenceResult,
  proName: string,
  proCompany: string,
): React.ReactElement {
  const best = data.storm_dates[0] ?? null
  const generatedDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return h(Document, { title: 'Storm Evidence Report — ProGuild' },
    h(Page, { size: 'LETTER', style: S.page },

      // ── Header ──────────────────────────────────────────────────────────────
      h(View, { style: S.hdrRow },
        h(Text, { style: S.hdrBrand }, 'ProGuild'),
        h(Text, { style: S.hdrDoc }, '/ NOAA Storm Evidence Report'),
      ),
      h(View, { style: S.hdrDivider }),

      // ── Property summary ────────────────────────────────────────────────────
      h(View, { style: S.card },
        h(View, { style: S.cardRow },
          h(Text, { style: S.cardLabel }, 'Property'),
          h(Text, { style: S.cardValue }, data.address || `${data.lat.toFixed(5)}, ${data.lon.toFixed(5)}`),
        ),
        h(View, { style: S.cardRow },
          h(Text, { style: S.cardLabel }, 'Search radius'),
          h(Text, { style: S.cardValue }, `${data.search_radius_mi} miles`),
        ),
        h(View, { style: S.cardRow },
          h(Text, { style: S.cardLabel }, 'Period scanned'),
          h(Text, { style: S.cardValue }, `${data.years_back} years (${data.storm_dates[data.storm_dates.length - 1]?.date ?? '—'} – ${data.storm_dates[0]?.date ?? '—'})`),
        ),
        h(View, { style: S.cardRow },
          h(Text, { style: S.cardLabel }, 'Storm dates found'),
          h(Text, { style: S.cardValue }, String(data.storm_dates.length)),
        ),
        h(View, { style: S.cardRow },
          h(Text, { style: S.cardLabel }, 'Prepared by'),
          h(Text, { style: S.cardValue }, `${proName}${proCompany ? ` · ${proCompany}` : ''}`),
        ),
        h(View, { style: S.cardRow },
          h(Text, { style: S.cardLabel }, 'Generated'),
          h(Text, { style: S.cardValue }, generatedDate),
        ),
      ),

      // ── Best date of loss ────────────────────────────────────────────────────
      best
        ? h(View, { style: S.bestDate },
            h(Text, { style: S.bestTitle },
              `Recommended Date of Loss: ${best.date}`
            ),
            h(Text, { style: S.bestSub },
              `Highest-scoring storm event within ${data.search_radius_mi} miles. `
              + (best.max_hail_in !== null ? `Largest hail: ${best.max_hail_in}". ` : '')
              + (best.max_wind_mph !== null ? `Max wind: ${best.max_wind_mph} mph. ` : '')
              + `${best.event_count} ground-truth LSR report${best.event_count !== 1 ? 's' : ''} from NOAA/IEM.`
            ),
          )
        : h(View, { style: S.noData },
            h(Text, { style: S.noDataTxt },
              'No significant storm events found within the search area and period. '
              + 'Consider expanding the radius or years-back parameter, or consult NOAA Storm Data directly.'
            )
          ),

      // ── Ranked dates ─────────────────────────────────────────────────────────
      data.storm_dates.length > 0 && h(View, null,
        h(Text, { style: S.secTitle }, `Storm Events — Ranked by Evidence Strength`),
        ...data.storm_dates.map((sd, i) => dateBlock(sd, i)),
      ),

      // ── Data source disclosure ───────────────────────────────────────────────
      h(View, { style: { ...S.card, marginTop: 16 } },
        h(Text, { style: { fontSize: 7, color: GRAY, lineHeight: 1.5 } },
          'Data sources: NOAA/NWS Local Storm Reports (LSR) via Iowa Environmental Mesonet (IEM); '
          + 'NWS Cooperative Observers and Trained Spotters. '
          + 'Events filtered to within ' + data.search_radius_mi + ' miles of the subject property. '
          + 'Hail magnitude in inches (decimal); wind magnitude in mph. '
          + 'This report is prepared for claim documentation purposes. '
          + 'Verify all loss dates and magnitudes with the carrier and public adjuster.'
        ),
      ),

      // ── Footer ───────────────────────────────────────────────────────────────
      h(View, { style: S.footer },
        h(Text, { style: S.footL }, 'ProGuild · proguild.ai · NOAA Storm Evidence Report'),
        h(Text, { style: S.footR }, `Generated ${generatedDate} · Confidential`),
      ),
    )
  )
}
