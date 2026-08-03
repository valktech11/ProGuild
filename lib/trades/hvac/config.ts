// ── HVAC Trade Config ───────────────────────────────────────────────────────

import type { HVACConfig } from './types'
import HVACAddLeadModal    from './components/AddLeadModal'
import HVACOverviewWidget  from './components/OverviewWidget'

export const hvacConfig: HVACConfig = {
  slug:        'hvac-technician',
  displayName: 'HVAC Technician',
  emoji:       '❄️',
  brandColor:  '#0EA5E9',
  dbprCodes:   ['CA', 'RA'],

  labels: {
    pipeline:  'Service Board',
    estimate:  'Quote',
    invoice:   'Invoice',
    client:    'Customer',
    clients:   'Customers',
    newButton: 'New Call',
    wonStage:  'Completed',
    scopePlaceholder: 'AC not cooling — unit is 12 years old, R-410A, needs diagnosis and possible replacement...',
  },
  stageAnchors: {
    entry:          'new_call',
    won:            'job_won',
    lost:           'lost',
    sentTrigger:    'quoted',   // estimate sent → lead moves here
    depositTrigger: 'scheduled', // estimate approved → lead moves here (deposit paid → job scheduled)
  },

  stages: [
    { key: 'new_call',      label: 'New Call',        icon: '📞', color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B', subLabel: 'Call received, not yet visited' },
    { key: 'diagnosed',     label: 'Diagnosed',       icon: '🔍', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6', subLabel: 'On-site diagnosis complete' },
    { key: 'quoted',        label: 'Quote Sent',      icon: '📋', color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6', subLabel: 'Waiting on customer approval' },
    { key: 'parts_ordered', label: 'Parts Ordered',   icon: '📦', color: '#F97316', bg: '#FFF7ED', dot: '#F97316', subLabel: 'Waiting on parts delivery' },
    { key: 'scheduled',     label: 'Job Scheduled',   icon: '🗓️', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E', subLabel: 'Appointment confirmed' },
    { key: 'in_progress',   label: 'On the Job',      icon: '🔧', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED', subLabel: 'Tech on site' },
    { key: 'job_won',       label: 'Completed',       icon: '✅', color: '#10B981', bg: '#ECFDF5', dot: '#10B981', subLabel: 'Job done, ready to invoice' },
    { key: 'lost',          label: 'Lost',            icon: '📵', color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444', terminal: true, reopenable: true },
    { key: 'unqualified',   label: 'Not a Fit',       icon: '⛔', color: '#6B7280', bg: '#F9FAFB', dot: '#6B7280', terminal: true, reopenable: false },
  ],

  nav: [
    {
      title: 'TODAY',
      items: [
        { label: 'Overview',       href: '/dashboard',          icon: '⚡', description: "Today's calls and reminders" },
        { label: 'Service Board',  href: '/dashboard/pipeline', icon: '🔧', description: 'All active service calls' },
        { label: 'Calendar',       href: '/dashboard/calendar', icon: '🗓️', description: 'Scheduled appointments' },
      ],
    },
    {
      title: 'BILLING',
      items: [
        { label: 'Quotes',   href: '/dashboard/estimates', icon: '📋', description: 'Service quotes and proposals' },
        { label: 'Invoices', href: '/dashboard/invoices',  icon: '💰', description: 'Payments and balances' },
      ],
    },
    {
      title: 'EQUIPMENT',
      items: [
        { label: 'Customers',         href: '/dashboard/clients',          icon: '👤', description: 'Customer records' },
        { label: 'Equipment Records', href: '/dashboard/hvac/equipment',   icon: '🛠️', description: 'AC units, furnaces, heat pumps' },
        { label: 'Maintenance Plans', href: '/dashboard/hvac/maintenance', icon: '🗓️', description: 'Annual service reminders' },
        { label: 'Refrigerant Log',   href: '/dashboard/hvac/refrigerant', icon: '🧪', description: 'EPA 608 refrigerant tracking', badge: 'pro' },
        { label: 'Field Reference',   href: '/dashboard/hvac/reference',   icon: '📖', description: 'P-T charts, fault codes, manuals' },
        { label: 'Job Checklists',    href: '/dashboard/hvac/checklists',  icon: '✅', description: 'Step-by-step by job type' },
        { label: 'Guided Diagnosis',  href: '/dashboard/hvac/guided',      icon: '🧭', description: 'Step-by-step troubleshooting' },
      ],
    },
    {
      title: 'COMPLIANCE',
      items: [
        { label: 'EPA Cert Tracker',  href: '/dashboard/hvac/epa', icon: '📜', description: '608 cert dates and renewals', badge: 'pro', comingSoon: true },
      ],
    },
    {
      title: 'REPORTS',
      items: [
        { label: 'Performance', href: '/dashboard/performance', icon: '📈', description: 'Revenue and win rate', badge: 'pro' },
      ],
    },
  ],

    features: {
    equipmentRecords:      true,
    equipmentHistory:      true,
    filterTracking:        true,
    refrigerantLog:        true,
    epaCertTracking:       false,  // Phase 2
    maintenancePlans:      true,
    serviceChecklists:     false,  // Phase 2
    qrHomeownerPortal:     false,  // Phase 2
    maintenanceMembership: false,  // Phase 2
  },

  components: {
    AddLeadModal:   HVACAddLeadModal,
    OverviewWidget: HVACOverviewWidget,
  },
}
