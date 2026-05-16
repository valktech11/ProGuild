import type { ElectricianConfig } from './types'

export const electricianConfig: ElectricianConfig = {
  slug: 'electrician', displayName: 'Electrician', emoji: '⚡',
  brandColor: '#EAB308', dbprCodes: ['EC', 'ER'],

  labels: {
    pipeline: 'Jobs', estimate: 'Estimate', client: 'Client',
    newButton: 'New Call', wonStage: 'Job Won',
    addClient: 'Add Client', clientsPage: 'Clients',
  },

  stages: [
    { key: 'new_call',         label: 'New Call',         icon: '📞', color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B' },
    { key: 'site_visit',       label: 'Site Visit',       icon: '🔍', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
    { key: 'quoted',           label: 'Quoted',           icon: '💬', color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6' },
    { key: 'permit_submitted', label: 'Permit Submitted', icon: '📋', color: '#F97316', bg: '#FFF7ED', dot: '#F97316' },
    { key: 'permit_approved',  label: 'Permit Approved',  icon: '✅', color: '#0EA5E9', bg: '#F0F9FF', dot: '#0EA5E9' },
    { key: 'scheduled',        label: 'Scheduled',        icon: '📅', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E' },
    { key: 'in_progress',      label: 'In Progress',      icon: '⚡', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
    { key: 'job_won',          label: 'Job Won',          icon: '🏆', color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
    { key: 'lost',             label: 'Lost',             icon: '❌', color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444', terminal: true, reopenable: true },
    { key: 'unqualified',      label: 'Unqualified',      icon: '🚫', color: '#6B7280', bg: '#F9FAFB', dot: '#6B7280', terminal: true, reopenable: false },
  ],

  nav: [
    {
      title: 'JOBS',
      items: [
        { label: 'Job Board', href: '/dashboard/jobs',     icon: '📋', description: 'Your electrical pipeline' },
        { label: 'Calendar',  href: '/dashboard/calendar', icon: '📅', description: 'Service appointments' },
        { label: 'Clients',   href: '/dashboard/clients',  icon: '👤', description: 'Client records' },
        { label: 'Invoices',  href: '/dashboard/invoices', icon: '💰', description: 'Payments and balances' },
      ],
    },
    {
      title: 'ELECTRICAL TOOLS',
      items: [
        { label: 'Panel Records',   href: '/dashboard/electrician/panels',  icon: '⚡', description: 'Panel amps, age, last inspection', comingSoon: true },
        { label: 'Permit Tracker',  href: '/dashboard/electrician/permits', icon: '📋', description: 'Permit status and inspections', comingSoon: true },
        { label: 'Code Reference',  href: '/dashboard/electrician/code',    icon: '📖', description: 'NEC code compliance notes', comingSoon: true },
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
    panelRecords:   false,  // Phase 2
    permitTracking: false,  // Phase 2
    codeCompliance: false,  // Phase 2
    loadCalculator: false,  // Phase 2
  },
}
