// ── HVAC Trade Config ───────────────────────────────────────────────────────

import type { HVACConfig } from './types'
import DefaultAddLeadModal from '../_default/components/AddLeadModal'

export const hvacConfig: HVACConfig = {
  slug:        'hvac-technician',
  displayName: 'HVAC Technician',
  emoji:       '❄️',
  brandColor:  '#0EA5E9',
  dbprCodes:   ['CA', 'RA'],

  labels: {
    pipeline:  'Jobs',
    estimate:  'Quote',
    invoice:   'Invoice',
    client:    'Client',
    clients:   'Clients',
    newButton: 'New Call',
    wonStage:  'Job Won',
    scopePlaceholder: 'AC not cooling, unit is 12 years old, needs inspection and possible replacement...',
  },
  stageAnchors: {
    entry: 'new_call',
    won:   'job_won',
    lost:  'lost',
  },

  stages: [
    { key: 'new_call',      label: 'New Call',      icon: '📞', color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B' },
    { key: 'diagnosed',     label: 'Diagnosed',     icon: '🔬', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
    { key: 'quoted',        label: 'Quoted',        icon: '💬', color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6' },
    { key: 'parts_ordered', label: 'Parts Ordered', icon: '📦', color: '#F97316', bg: '#FFF7ED', dot: '#F97316' },
    { key: 'scheduled',     label: 'Scheduled',     icon: '🗓️', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E' },
    { key: 'in_progress',   label: 'In Progress',   icon: '🔧', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
    { key: 'job_won',       label: 'Job Won',       icon: '✅', color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
    { key: 'lost',          label: 'Lost',          icon: '📵', color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444', terminal: true, reopenable: true },
    { key: 'unqualified',   label: 'Unqualified',   icon: '⛔', color: '#6B7280', bg: '#F9FAFB', dot: '#6B7280', terminal: true, reopenable: false },
  ],

  nav: [
    {
      title: 'TODAY',
      items: [
        { label: 'Overview',  href: '/dashboard',          icon: '⚡', description: "Today's snapshot" },
        { label: 'Jobs',      href: '/dashboard/pipeline', icon: '🔧', description: 'Your HVAC service board' },
        { label: 'Calendar',  href: '/dashboard/calendar', icon: '🗓️', description: 'Service appointments' },
      ],
    },
    {
      title: 'MONEY',
      items: [
        { label: 'Quotes',   href: '/dashboard/estimates', icon: '📝', description: 'Service quotes and proposals' },
        { label: 'Invoices', href: '/dashboard/invoices',  icon: '💰', description: 'Payments and balances' },
      ],
    },
    {
      title: 'MY EQUIPMENT',
      items: [
        { label: 'Clients',           href: '/dashboard/clients',          icon: '👤', description: 'Client and equipment records' },
        { label: 'Equipment Records', href: '/dashboard/hvac/equipment',   icon: '❄️', description: 'AC units, furnaces, heat pumps' },
        { label: 'Refrigerant Log',   href: '/dashboard/hvac/refrigerant', icon: '🧪', description: 'EPA 608 compliance log', badge: 'pro' },
        { label: 'Maintenance Plans', href: '/dashboard/hvac/maintenance', icon: '🔔', description: 'Annual service reminders' },
      ],
    },
    {
      title: 'COMPLIANCE',
      items: [
        { label: 'EPA Cert Tracker',   href: '/dashboard/hvac/epa',        icon: '📜', description: 'Your 608 certification dates', badge: 'pro', comingSoon: true },
        { label: 'Service Checklists', href: '/dashboard/hvac/checklists', icon: '✔️', description: 'AC tune-up, furnace, heat pump', badge: 'elite', comingSoon: true },
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

  // ── Components — use default until trade gets its own ──────────────────────
  components: {
    AddLeadModal: DefaultAddLeadModal,
  },
}
