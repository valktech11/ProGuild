// ── Roofing Trade Config ────────────────────────────────────────────────────
// Complete self-contained roofing configuration.
// No references to other trades. Evolves independently.
// Business logic reads stageAnchors — never hardcodes stage key strings.

import type { RoofingConfig } from './types'
import RoofingAddLeadModal from './components/AddLeadModal'
import RoofingOverviewWidget from './components/OverviewWidget'

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
      requires:  'lead_has_address',
      icon:      '🔍',
      color:     '#0284C7',
      bg:        '#F0F9FF',
      dot:       '#0284C7',
      subLabel:  'Inspection booked',
      nextLabel: 'Run Inspection',
    },
    {
      key:       'insurance_approved',
      label:     'Insurance Approved',
      requires:  'insurance_claim_filed',   // roofing_job_data.insurance_claim must be true
      icon:      '🛡️',
      color:     '#0891B2',
      bg:        '#ECFEFF',
      dot:       '#0891B2',
      subLabel:  'Carrier approved — write estimate',
      nextLabel: 'Create Proposal',
    },
    {
      key:       'proposal_sent',
      label:     'Proposal Sent',
      requires:  'estimate_ready',          // estimate must exist with total > 0
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
      requires:  'estimate_sent',
      icon:      '✍️',
      color:     '#059669',
      bg:        '#ECFDF5',
      dot:       '#059669',
      subLabel:  'Contract signed — schedule install',
      nextLabel: 'Schedule Install',
    },
    {
      key:       'scheduled',
      label:     'Scheduled',
      requires:  'estimate_approved',       // estimate must be approved or proposal_signed stage reached
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
      requires:  'scheduled_date',          // lead.scheduled_date must be set
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
      requires:  'invoice_exists',          // invoice must exist
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
  // ── Navigation — roofing sidebar ─────────────────────────────────────────────
  // Nav order: JOBS → MONEY → MY RECORDS → ROOFING TOOLS → REPORTS
  nav: [
    {
      title: 'JOBS',
      items: [
        { label: 'Overview',  href: '/dashboard',          icon: '⚡', description: "Today's snapshot" },
        { label: 'Jobs',      href: '/dashboard/pipeline', icon: '📋', description: 'Your full roofing pipeline' },
        { label: 'Calendar',  href: '/dashboard/calendar', icon: '📅', description: 'Inspections and installs' },
        { label: 'Messages',  href: '/messages',           icon: '💬', description: 'Leads and homeowner messages' },
      ],
    },
    {
      title: 'MONEY',
      items: [
        { label: 'Proposals', href: '/dashboard/estimates', icon: '📝', description: 'Good / Better / Best proposals' },
        { label: 'Invoices',  href: '/dashboard/invoices',  icon: '💰', description: 'Payments and outstanding balances' },
        { label: 'Revenue',   href: '/dashboard/revenue',   icon: '📈', description: 'Revenue and performance', badge: 'pro', comingSoon: true },
      ],
    },
    {
      title: 'MY RECORDS',
      items: [
        { label: 'Clients',    href: '/dashboard/clients',              icon: '👤', description: 'Homeowner contacts and job history' },
        { label: 'Properties', href: '/dashboard/roofing/property',     icon: '🏠', description: 'Property records, roof data, satellite reports' },
        { label: 'Warranties', href: '/dashboard/roofing/warranties',   icon: '🛡️', description: 'Shingle warranty records' },
      ],
    },
    {
      title: 'ROOFING TOOLS',
      items: [
        { label: 'Quick Bid PDF', href: '/dashboard/roofing/quickbid', icon: '⚡', description: 'Address → satellite PDF in 30 seconds' },
        { label: 'ProMeasure',    href: '/dashboard/roofing/promeasure',               icon: '📐', description: 'Satellite polygon measurement' },
        { label: 'Material Prices', href: '/dashboard/roofing/settings',               icon: '💲', description: 'Set your material costs for estimates' },
      ],
    },
    {
      title: 'REPORTS',
      items: [
        { label: 'Performance',  href: '/dashboard/performance',   icon: '📈', description: 'Win rate, revenue, pipeline value', badge: 'pro' },
        { label: 'Storm Alerts', href: '/dashboard/roofing/storm', icon: '⛈️', description: 'Hail events near you', badge: 'elite', comingSoon: true },
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

  // ── Components ────────────────────────────────────────────────────────────
  // Shell pages import via plugin.components — never import roofing components directly.
  components: {
    AddLeadModal:   RoofingAddLeadModal,
    OverviewWidget: RoofingOverviewWidget,
  },
}
