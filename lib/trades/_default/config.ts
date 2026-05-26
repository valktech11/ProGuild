import type { DefaultConfig } from './types'
import DefaultAddLeadModal from './components/AddLeadModal'
import DefaultOverviewWidget from './components/OverviewWidget'

export const defaultConfig: DefaultConfig = {
  slug:        '_default',
  displayName: 'Contractor',
  emoji:       '🛠️',
  brandColor:  '#0F766E',

  labels: {
    pipeline:  'Jobs',
    estimate:  'Estimate',
    invoice:   'Invoice',
    client:    'Client',
    clients:   'Clients',
    newButton: 'New Lead',
    wonStage:  'Job Won',
    scopePlaceholder: 'Describe what needs to be done, size of job, any urgency...',
  },
  stageAnchors: {
    entry: 'lead_in',
    won:   'job_won',
    lost:  'lost',
  },

  stages: [
    { key: 'new',         label: 'New',         icon: '📥', color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B' },
    { key: 'quoted',      label: 'Quoted',       icon: '💬', color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6' },
    { key: 'scheduled',   label: 'Scheduled',    icon: '📅', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E' },
    { key: 'in_progress', label: 'In Progress',  icon: '🔨', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
    { key: 'job_won',     label: 'Job Won',      icon: '🏆', color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
    { key: 'lost',        label: 'Lost',         icon: '❌', color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444', terminal: true, reopenable: true },
    { key: 'unqualified', label: 'Unqualified',  icon: '🚫', color: '#6B7280', bg: '#F9FAFB', dot: '#6B7280', terminal: true, reopenable: false },
  ],

  nav: [
    {
      title: 'TODAY',
      items: [
        { label: 'Overview', exact: true,  href: '/dashboard',          icon: '⚡', description: "Today's snapshot" },
        { label: 'Jobs',      href: '/dashboard/pipeline', icon: '📋', description: 'Your job pipeline' },
        { label: 'Calendar',  href: '/dashboard/calendar', icon: '📅', description: 'Appointments and schedule' },
      ],
    },
    {
      title: 'MONEY',
      items: [
        { label: 'Estimates', href: '/dashboard/estimates', icon: '📝', description: 'Quotes and proposals' },
        { label: 'Invoices',  href: '/dashboard/invoices',  icon: '💰', description: 'Payments and balances' },
      ],
    },
    {
      title: 'MY BUSINESS',
      items: [
        { label: 'Clients',     href: '/dashboard/clients',     icon: '👤', description: 'Client records' },
        { label: 'Performance', href: '/dashboard/performance', icon: '📈', description: 'Revenue and win rate', badge: 'pro' },
      ],
    },
  ],

    features: { _placeholder: true },

  // ── Components ────────────────────────────────────────────────────────────
  components: {
    AddLeadModal:   DefaultAddLeadModal,
    OverviewWidget: DefaultOverviewWidget,
  },
}

export const DEFAULT_STAGE_ORDER: Record<string, number> = {
  new: 0, quoted: 1, scheduled: 2, in_progress: 3,
  job_won: 4, lost: 5, unqualified: 6,
}

export function isValidDefaultTransition(from: string, to: string): boolean {
  const VALID: Record<string, string[]> = {
    new:         ['quoted', 'scheduled', 'lost', 'unqualified'],
    quoted:      ['new', 'scheduled', 'lost', 'unqualified'],
    scheduled:   ['quoted', 'in_progress', 'lost'],
    in_progress: ['scheduled', 'job_won', 'lost'],
    job_won:     ['in_progress'],
    lost:        ['new'],
    unqualified: [],
  }
  if (from === to) return false
  return VALID[from]?.includes(to) ?? false
}
