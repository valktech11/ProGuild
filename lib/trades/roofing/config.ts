// ── Roofing Trade Config ────────────────────────────────────────────────────
// Complete self-contained roofing configuration.
// No references to other trades. Evolves independently.
// Business logic reads stageAnchors — never hardcodes stage key strings.

import type { RoofingConfig } from './types'

export const roofingConfig: RoofingConfig = {
  slug:        'roofing',
  displayName: 'Roofing Contractor',
  emoji:       '🏠',
  brandColor:  '#0F766E',
  dbprCodes:   ['CCC', 'RCC'],

  // ── Labels — what roofing calls things ─────────────────────────────────────
  labels: {
    pipeline:  'Jobs',
    estimate:  'Proposal',
    invoice:   'Invoice',
    client:    'Property',
    clients:   'Properties',
    newButton: 'New Job',
    wonStage:  'Job Won',
  },

  // ── Stage anchors — semantic handles for business logic ────────────────────
  // ⚠️  Business logic ALWAYS reads these. Never hardcode 'job_won' in code.
  // When stages become DB-driven, only this block changes.
  stageAnchors: {
    entry:           'lead_in',
    won:             'job_won',
    lost:            'lost',
    depositTrigger:  'proposal_signed',
    insuranceStage:  'insurance_approved',
    warrantyTrigger: 'job_won',
  },

  // ── Stages ──────────────────────────────────────────────────────────────────
  // subLabel: shown in stage picker dropdown under stage name
  // nextLabel: the CTA button label on the kanban card / detail page
  stages: [
    {
      key:       'lead_in',
      label:     'Lead In',
      icon:      '📥',
      color:     '#0369A1',
      bg:        '#F0F9FF',
      dot:       '#0369A1',
      subLabel:  'Awaiting inspection',
      nextLabel: 'Schedule Inspection',
    },
    {
      key:       'inspection_scheduled',
      label:     'Inspection Scheduled',
      icon:      '🔍',
      color:     '#0284C7',
      bg:        '#F0F9FF',
      dot:       '#0284C7',
      subLabel:  'Inspection booked',
      nextLabel: 'Run Inspection',
    },
    {
      key:       'proposal_sent',
      label:     'Proposal Sent',
      icon:      '📄',
      color:     '#D97706',
      bg:        '#FFFBEB',
      dot:       '#D97706',
      subLabel:  'Proposal with homeowner',
      nextLabel: 'Get Signature',
    },
    {
      key:       'proposal_signed',
      label:     'Proposal Signed',
      icon:      '✍️',
      color:     '#059669',
      bg:        '#ECFDF5',
      dot:       '#059669',
      subLabel:  'Ready for insurance',
      nextLabel: 'Submit to Insurance',
    },
    {
      key:       'insurance_approved',
      label:     'Insurance Approved',
      icon:      '🛡️',
      color:     '#0891B2',
      bg:        '#F0F9FF',
      dot:       '#0891B2',
      subLabel:  'Carrier approved',
      nextLabel: 'Schedule Install',
    },
    {
      key:       'scheduled',
      label:     'Scheduled',
      icon:      '📅',
      color:     '#2563EB',
      bg:        '#EFF6FF',
      dot:       '#2563EB',
      subLabel:  'Job on calendar',
      nextLabel: 'Start Job',
    },
    {
      key:       'in_progress',
      label:     'In Progress',
      icon:      '🔨',
      color:     '#EA580C',
      bg:        '#FFF7ED',
      dot:       '#EA580C',
      subLabel:  'Crew on site',
      nextLabel: 'Mark Complete',
    },
    {
      key:       'job_won',
      label:     'Job Won',
      icon:      '🏆',
      color:     '#047857',
      bg:        '#D1FAE5',
      dot:       '#047857',
      subLabel:  'Complete & paid',
      nextLabel: 'View Summary',
    },
    {
      key:        'lost',
      label:      'Lost',
      icon:       '❌',
      color:      '#6B7280',
      bg:         '#F3F4F6',
      dot:        '#6B7280',
      subLabel:   'Did not proceed',
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
      subLabel:   'Not a fit',
      terminal:   true,
      reopenable: false,
    },
  ],

  // ── Navigation — roofing sidebar ────────────────────────────────────────────
  // DashboardShell renders this directly. No buildNav() logic needed.
  nav: [
    {
      title: 'JOBS',
      items: [
        { label: 'Overview',    href: '/dashboard',                   icon: '⚡', description: 'Today\'s snapshot' },
        { label: 'Jobs',        href: '/dashboard/pipeline',          icon: '📋', description: 'Your full roofing pipeline' },
        { label: 'Calendar',    href: '/dashboard/calendar',          icon: '📅', description: 'Inspections and installs' },
        { label: 'Messages',    href: '/messages',                    icon: '💬', description: 'Leads and homeowner messages' },
      ],
    },
    {
      title: 'DOCUMENTS',
      items: [
        { label: 'Proposals',   href: '/dashboard/estimates',         icon: '📝', description: 'Good / Better / Best proposals' },
        { label: 'Invoices',    href: '/dashboard/invoices',          icon: '💰', description: 'Payments and outstanding balances' },
        { label: 'Revenue',     href: '/dashboard/revenue',           icon: '📈', description: 'Revenue and performance', badge: 'pro', comingSoon: true },
      ],
    },
    {
      title: 'ROOFING TOOLS',
      items: [
        { label: 'Properties',    href: '/dashboard/clients',               icon: '🏠', description: 'Property records and job history' },
        { label: 'ProMeasure',    href: '/dashboard/roofing/promeasure',    icon: '📐', description: 'Satellite polygon measurement' },
        { label: 'Quick Bid PDF', href: '/dashboard/roofing/report',        icon: '📊', description: 'Instant 5-page measurement report', badge: 'pro' },
        { label: 'Calculator',    href: '/dashboard/roofing/calculator',    icon: '🔢', description: 'Squares + pitch + waste calculator' },
        { label: 'Warranties',    href: '/dashboard/roofing/warranties',    icon: '🛡️', description: 'Shingle warranty records', comingSoon: true },
        { label: 'Permits',       href: '/dashboard/roofing/permits',       icon: '📋', description: 'Permit tracking and status', comingSoon: true },
      ],
    },
    {
      title: 'DOCUMENTS',
      items: [
        { label: 'Contracts',     href: '/dashboard/roofing/contracts',     icon: '🤝', description: 'FL roofing contracts', badge: 'elite', comingSoon: true },
        { label: 'Lien Waivers',  href: '/dashboard/roofing/liens',         icon: '⚖️', description: 'FL lien waivers — 4 types', badge: 'elite', comingSoon: true },
      ],
    },
    {
      title: 'REPORTS',
      items: [
        { label: 'Performance',   href: '/dashboard/performance',           icon: '📈', description: 'Win rate, revenue, pipeline value', badge: 'pro' },
        { label: 'Storm Alerts',  href: '/dashboard/roofing/storm',         icon: '⛈️', description: 'Hail events near your service area', badge: 'elite', comingSoon: true },
      ],
    },
  ],

  // ── Features ─────────────────────────────────────────────────────────────────
  features: {
    satelliteMeasure:    true,
    quickBidPdf:         true,
    premiumMaterialPdf:  true,
    pitchDiagram:        false,
    elevationAccuracy:   false,
    roofingCalculator:   true,
    goodBetterBest:      true,
    aiEstimateWriter:    false,
    aiPriceAdvisor:      false,
    insuranceClaim:      true,
    adjusterPhotoZip:    true,
    supplementWriter:    false,
    jobPhotoLog:         true,
    propertyProfile:     true,
    warrantyRecord:      true,
    homeownerStatusPage: false,
    autoReviewRequest:   false,
    smartReminders:      false,
    stormCanvassing:     false,
    permitTracking:      true,
    lienWaivers:         false,
    flRoofingContract:   false,
  },

  // ── Lead sources — roofing-specific ──────────────────────────────────────────
  // Shown in AddLeadModal. Each trade has its own source list.
  leadSources: [
    { value: 'Phone_Call',    label: 'Phone Call',     icon: '📞' },
    { value: 'Storm',         label: 'Storm Damage',   icon: '⛈️' },
    { value: 'Referral',      label: 'Referral',       icon: '🤝' },
    { value: 'Facebook',      label: 'Facebook',       icon: '📘' },
    { value: 'Instagram',     label: 'Instagram',      icon: '📸' },
    { value: 'Door_Knock',    label: 'Door Knock',     icon: '🚪' },
    { value: 'Yard_Sign',     label: 'Yard Sign',      icon: '🪧' },
    { value: 'Insurance',     label: 'Insurance Co.',  icon: '🛡️' },
    { value: 'Website',       label: 'Website',        icon: '🌐' },
    { value: 'Google',        label: 'Google',         icon: '🔍' },
    { value: 'Canvassing',    label: 'Canvassing',     icon: '🏘️' },
    { value: 'Other',         label: 'Other',          icon: '📌' },
  ],
}
