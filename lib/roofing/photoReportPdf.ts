// lib/roofing/photoReportPdf.ts
// Damage photo report PDF — assembles lead photos by phase into a branded
// carrier-ready document. Uses React.createElement (no JSX) — same pattern
// as reportPdf.ts. Photos fetched server-side from R2 public URLs as base64.

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet,
} from '@react-pdf/renderer'

const h = React.createElement

const NAVY = '#0A1628'
const TEAL = '#0F766E'
const GRAY = '#6B7280'
const LGRAY = '#F3F4F6'

const S = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, color: NAVY, padding: '36 44', backgroundColor: '#fff' },
  hdrBar:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  hdrBrand:    { fontSize: 14, fontFamily: 'Helvetica-Bold', color: TEAL, marginRight: 8 },
  hdrDoc:      { fontSize: 10, color: GRAY },
  hdrRule:     { height: 2, backgroundColor: TEAL, marginBottom: 16 },
  metaGrid:    { flexDirection: 'row', gap: 10, marginBottom: 18 },
  metaCol:     { flex: 1, backgroundColor: LGRAY, borderRadius: 6, padding: '8 12' },
  metaLabel:   { fontSize: 7.5, color: GRAY, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: NAVY },
  phaseHdr:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: TEAL,
                 borderBottom: '1 solid #E2E8F0', paddingBottom: 5, marginBottom: 10, marginTop: 16 },
  photoGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap:   { width: '48%', borderRadius: 6, overflow: 'hidden', border: '1 solid #E2E8F0', marginBottom: 4 },
  photoImg:    { width: '100%', height: 160, objectFit: 'cover' },
  photoCaption:{ padding: '4 6', fontSize: 7.5, color: GRAY, backgroundColor: LGRAY },
  footer:      { position: 'absolute', bottom: 26, left: 44, right: 44,
                 flexDirection: 'row', borderTop: '1 solid #E2E8F0', paddingTop: 5 },
  footL:       { fontSize: 7, color: GRAY, flex: 1 },
  footR:       { fontSize: 7, color: GRAY, textAlign: 'right' },
  noPhotos:    { padding: 20, backgroundColor: LGRAY, borderRadius: 6, textAlign: 'center' },
  noPhotosTxt: { fontSize: 9, color: GRAY },
})

export interface PhotoReportData {
  address:     string
  claimNumber: string
  carrier:     string
  dateOfLoss:  string
  proName:     string
  proCompany:  string
  phases:      PhotoPhase[]
  generatedAt: string
}

export interface PhotoPhase {
  phase:  string
  photos: PhotoItem[]
}

export interface PhotoItem {
  url:        string       // base64 data URI or public URL
  caption:    string
  takenAt:    string
  hasAnnotation: boolean
  annotatedUrl?: string
}

const PHASE_LABELS: Record<string, string> = {
  damage:      'Damage Documentation',
  overview:    'Property Overview',
  interior:    'Interior',
  gutters:     'Gutters & Drainage',
  flashing:    'Flashing & Penetrations',
  decking:     'Decking',
  other:       'Other',
  before:      'Before',
  after:       'After',
  progress:    'In Progress',
}

function phaseLabel(p: string) {
  return PHASE_LABELS[p?.toLowerCase()] ?? p?.replace(/_/g, ' ') ?? 'Photos'
}

function photoBlock(photo: PhotoItem, idx: number) {
  const src = photo.hasAnnotation && photo.annotatedUrl ? photo.annotatedUrl : photo.url
  const cap = photo.caption ||
    (photo.takenAt ? new Date(photo.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
  const annLabel = photo.hasAnnotation ? ' · annotated' : ''
  return h(View, { key: idx, style: S.photoWrap },
    h(Image, { src, style: S.photoImg }),
    h(Text, { style: S.photoCaption }, cap + annLabel),
  )
}

export function renderPhotoReportPdf(data: PhotoReportData): React.ReactElement {
  const allCount = data.phases.reduce((n, p) => n + p.photos.length, 0)

  return h(Document, { title: `Photo Report — ${data.address}` },
    h(Page, { size: 'LETTER', style: S.page },

      // Header
      h(View, { style: S.hdrBar },
        h(Text, { style: S.hdrBrand }, 'ProGuild'),
        h(Text, { style: S.hdrDoc }, '/ Damage Photo Report'),
      ),
      h(View, { style: S.hdrRule }),

      // Meta grid
      h(View, { style: S.metaGrid },
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Property'),
          h(Text, { style: S.metaValue }, data.address || '—'),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Carrier / Claim'),
          h(Text, { style: S.metaValue },
            `${data.carrier || '—'}${data.claimNumber ? `  ·  ${data.claimNumber}` : ''}`),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Date of Loss'),
          h(Text, { style: S.metaValue }, data.dateOfLoss || '—'),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Prepared By'),
          h(Text, { style: S.metaValue },
            `${data.proName}${data.proCompany ? `  ·  ${data.proCompany}` : ''}`),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Total Photos'),
          h(Text, { style: S.metaValue }, `${allCount} across ${data.phases.length} phase${data.phases.length !== 1 ? 's' : ''}`),
        ),
        h(View, { style: S.metaCol },
          h(Text, { style: S.metaLabel }, 'Generated'),
          h(Text, { style: S.metaValue }, data.generatedAt),
        ),
      ),

      // No photos
      allCount === 0 && h(View, { style: S.noPhotos },
        h(Text, { style: S.noPhotosTxt }, 'No photos found for this job.'),
      ),

      // Phases
      ...data.phases.filter(p => p.photos.length > 0).map(phase =>
        h(View, { key: phase.phase },
          h(Text, { style: S.phaseHdr }, phaseLabel(phase.phase)),
          h(View, { style: S.photoGrid },
            ...phase.photos.map((photo, i) => photoBlock(photo, i)),
          ),
        )
      ),

      // Footer
      h(View, { style: S.footer },
        h(Text, { style: S.footL }, 'ProGuild  ·  proguild.ai  ·  Damage Photo Report'),
        h(Text, { style: S.footR }, `${data.generatedAt}  ·  Confidential`),
      ),
    ),
  )
}
