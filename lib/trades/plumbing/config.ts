import type { PlumbingConfig } from './types'

export const plumbingConfig: PlumbingConfig = {
  slug:        'plumber',
  displayName: 'Plumbing Contractor',
  emoji:       '🪠',
  brandColor:  '#1D4ED8',
  dbprCodes:   ['CFC', 'RF'],

  labels: {
    pipeline: 'Jobs', estimate: 'Estimate', client: 'Client',
    newButton: 'New Call', wonStage: 'Job Won',
    addClient: 'Add Client', clientsPage: 'Clients',
  },

  stages: [
    { key: 'new_call',    label: 'New Call',    icon: '📞', color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B' },
    { key: 'assessed',    label: 'Assessed',    icon: '🔍', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
    { key: 'quoted',      label: 'Quoted',      icon: '💬', color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6' },
    { key: 'scheduled',   label: 'Scheduled',   icon: '📅', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E' },
    { key: 'in_progress', label: 'In Progress', icon: '🔧', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
    { key: 'job_won',     label: 'Job Won',     icon: '✅', color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
    { key: 'lost',        label: 'Lost',        icon: '❌', color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444', terminal: true, reopenable: true },
    { key: 'unqualified', label: 'Unqualified', icon: '🚫', color: '#6B7280', bg: '#F9FAFB', dot: '#6B7280', terminal: true, reopenable: false },
  ],

  nav: [
    {
      title: 'JOBS',
      items: [
        { label: 'Job Board', href: '/dashboard/jobs',     icon: '📋', description: 'Your plumbing pipeline' },
        { label: 'Calendar',  href: '/dashboard/calendar', icon: '📅', description: 'Service appointments' },
        { label: 'Clients',   href: '/dashboard/clients',  icon: '👤', description: 'Client records' },
        { label: 'Invoices',  href: '/dashboard/invoices', icon: '💰', description: 'Payments and balances' },
      ],
    },
    {
      title: 'PLUMBING TOOLS',
      items: [
        { label: 'Fixture Records', href: '/dashboard/plumbing/fixtures', icon: '🚿', description: 'Fixture and appliance log', comingSoon: true },
        { label: 'Permit Tracker',  href: '/dashboard/plumbing/permits',  icon: '📋', description: 'Permit status and expiry', comingSoon: true },
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
    fixtureRecords:    false,  // Phase 2
    permitTracking:    false,  // Phase 2
    emergencyDispatch: false,  // Phase 2
    waterHeaterLog:    false,  // Phase 2
  },
}
