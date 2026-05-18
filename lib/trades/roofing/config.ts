// ── Roofing Trade Config ────────────────────────────────────────────────────
// Complete self-contained roofing configuration.
// No references to other trades. Evolves independently.

import type { RoofingConfig } from './types'

export const roofingConfig: RoofingConfig = {
  slug:        'roofing',
  displayName: 'Roofing Contractor',
  emoji:       '🏠',
  brandColor:  '#DC2626',
  dbprCodes:   ['CCC', 'RCC'],

  labels: {
    pipeline:    'Jobs',
    estimate:    'Proposal',
    client:      'Property',
    newButton:   'New Job',
    wonStage:    'Job Won',
    addClient:   'Add Property',
    clientsPage: 'Properties',
  },

  stages: [
    {
      key:   'lead_in',
      label: 'Lead In',
      icon:  '📥',
      color: '#0369A1',
      bg:    '#F0F9FF',
      dot:   '#0369A1',
    },
    {
      key:   'inspection_scheduled',
      label: 'Inspection Scheduled',
      icon:  '🔍',
      color: '#0284C7',
      bg:    '#F0F9FF',
      dot:   '#0284C7',
    },
    {
      key:   'proposal_sent',
      label: 'Proposal Sent',
      icon:  '📄',
      color: '#D97706',
      bg:    '#FFFBEB',
      dot:   '#D97706',
    },
    {
      key:   'proposal_signed',
      label: 'Proposal Signed',
      icon:  '✍️',
      color: '#059669',
      bg:    '#ECFDF5',
      dot:   '#059669',
    },
    {
      key:   'insurance_approved',
      label: 'Insurance Approved',
      icon:  '🛡️',
      color: '#0891B2',
      bg:    '#F0F9FF',
      dot:   '#0891B2',
    },
    {
      key:   'scheduled',
      label: 'Scheduled',
      icon:  '📅',
      color: '#2563EB',
      bg:    '#EFF6FF',
      dot:   '#2563EB',
    },
    {
      key:   'in_progress',
      label: 'In Progress',
      icon:  '🔨',
      color: '#EA580C',
      bg:    '#FFF7ED',
      dot:   '#EA580C',
    },
    {
      key:   'job_won',
      label: 'Job Won',
      icon:  '🏆',
      color: '#047857',
      bg:    '#D1FAE5',
      dot:   '#047857',
    },
    {
      key:        'lost',
      label:      'Lost',
      icon:       '❌',
      color:      '#6B7280',
      bg:         '#F3F4F6',
      dot:        '#6B7280',
      terminal:   true,
      reopenable: true,
    },
    {
      key:        'unqualified',
      label:      'Unqualified',
      icon:       '🚫',
      color:      '#6B7280',
      bg:         '#F9FAFB',
      dot:        '#6B7280',
      terminal:   true,
      reopenable: false,
    },
  ],

  nav: [
    {
      title: 'JOBS',
      items: [
        {
          label:       'Job Board',
          href:        '/dashboard/jobs',
          icon:        '📋',
          description: 'Your full roofing pipeline',
        },
        {
          label:       'Calendar',
          href:        '/dashboard/calendar',
          icon:        '📅',
          description: 'Inspections and installs',
        },
        {
          label:       'Properties',
          href:        '/dashboard/clients',
          icon:        '🏠',
          description: 'Property records and job history',
        },
        {
          label:       'Invoices',
          href:        '/dashboard/invoices',
          icon:        '💰',
          description: 'Payments and outstanding balances',
        },
      ],
    },
    {
      title: 'ROOFING TOOLS',
      items: [
        {
          label:       'ProMeasure',
          href:        '/dashboard/roofing/measure',
          icon:        '📐',
          description: 'Satellite polygon measurement',
        },
        {
          label:       'Quick Bid PDF',
          href:        '/dashboard/roofing/report',
          icon:        '📊',
          description: 'Instant 5-page measurement report',
          badge:       'pro',
        },
        {
          label:       'Takeoffs',
          href:        '/dashboard/roofing/takeoffs',
          icon:        '🔢',
          description: 'Squares + pitch + waste calculator',
        },
        {
          label:       'Warranties',
          href:        '/dashboard/roofing/warranties',
          icon:        '🛡️',
          description: 'Shingle warranty records',
        },
        {
          label:       'Permits',
          href:        '/dashboard/roofing/permits',
          icon:        '📋',
          description: 'Permit tracking and status',
        },
      ],
    },
    {
      title: 'DOCUMENTS',
      items: [
        {
          label:       'Proposals',
          href:        '/dashboard/estimates',
          icon:        '📝',
          description: 'Good / Better / Best proposals',
        },
        {
          label:       'Contracts',
          href:        '/dashboard/roofing/contracts',
          icon:        '🤝',
          description: 'FL roofing contracts — attorney reviewed',
          badge:       'elite',
          comingSoon:  true,
        },
        {
          label:       'Lien Waivers',
          href:        '/dashboard/roofing/liens',
          icon:        '⚖️',
          description: 'FL lien waivers — 4 types',
          badge:       'elite',
          comingSoon:  true,
        },
      ],
    },
    {
      title: 'REPORTS',
      items: [
        {
          label:       'Performance',
          href:        '/dashboard/performance',
          icon:        '📈',
          description: 'Win rate, revenue, pipeline value',
          badge:       'pro',
        },
        {
          label:       'Storm Alerts',
          href:        '/dashboard/roofing/storm',
          icon:        '⛈️',
          description: 'Hail events near your service area',
          badge:       'elite',
          comingSoon:  true,
        },
      ],
    },
  ],

  features: {
    // Measurement & reporting — built
    satelliteMeasure:    true,
    quickBidPdf:         true,
    premiumMaterialPdf:  true,
    pitchDiagram:        false,   // Phase 2 — wire dormant roofDiagramSvg.ts
    elevationAccuracy:   false,   // Phase 2 — ~$0.02/property cost
    // Estimating
    roofingCalculator:   true,    // built — receive side needs wiring
    goodBetterBest:      true,    // Sprint B
    aiEstimateWriter:    false,   // Phase 3
    aiPriceAdvisor:      false,   // Phase 3
    // Insurance
    insuranceClaim:      true,    // Sprint B
    adjusterPhotoZip:    true,    // Sprint C
    supplementWriter:    false,   // Phase 3
    // Job management
    jobPhotoLog:         true,    // Sprint C
    propertyProfile:     true,    // built Sprint 6
    warrantyRecord:      true,    // Sprint C
    homeownerStatusPage: false,   // Phase 2
    // Post-job
    autoReviewRequest:   false,   // post-Twilio 10DLC
    smartReminders:      false,   // Phase 5
    stormCanvassing:     false,   // Phase 3
    // Compliance
    permitTracking:      true,    // Sprint B stub
    lienWaivers:         false,   // Phase 6
    flRoofingContract:   false,   // Phase 6
  },
}
