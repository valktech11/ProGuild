import type { GCConfig } from './types'
import DefaultAddLeadModal from '../_default/components/AddLeadModal'

export const gcConfig: GCConfig = {
  slug: 'general-contractor', displayName: 'General Contractor',
  emoji: '🏗️', brandColor: '#374151', dbprCodes: ['CGC', 'RG'],

  labels: {
    pipeline: 'Pipeline', estimate: 'Estimate', client: 'Client',
    newButton: 'New Project', wonStage: 'Project Won',
    scopePlaceholder: 'Bathroom remodel, approximately 80 sq ft, need permits...',
    addClient: 'Add Client', clientsPage: 'Clients',
  },

  stages: [
    { key: 'lead_in',          label: 'Lead In',           icon: '📥', color: '#F59E0B', bg: '#FEF3C7', dot: '#F59E0B' },
    { key: 'bidding',          label: 'Bidding',           icon: '📊', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
    { key: 'contract_signed',  label: 'Contract Signed',   icon: '✍️', color: '#8B5CF6', bg: '#F5F3FF', dot: '#8B5CF6' },
    { key: 'permit_submitted', label: 'Permit Submitted',  icon: '📋', color: '#F97316', bg: '#FFF7ED', dot: '#F97316' },
    { key: 'milestone_1',      label: 'Phase 1 Complete',  icon: '🏁', color: '#0EA5E9', bg: '#F0F9FF', dot: '#0EA5E9' },
    { key: 'milestone_2',      label: 'Phase 2 Complete',  icon: '🚩', color: '#0F766E', bg: '#F0FDFA', dot: '#0F766E' },
    { key: 'closeout',         label: 'Closeout',          icon: '🔐', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
    { key: 'job_won',          label: 'Project Won',       icon: '🏆', color: '#10B981', bg: '#ECFDF5', dot: '#10B981' },
    { key: 'lost',             label: 'Lost',              icon: '❌', color: '#EF4444', bg: '#FEF2F2', dot: '#EF4444', terminal: true, reopenable: true },
    { key: 'unqualified',      label: 'Unqualified',       icon: '🚫', color: '#6B7280', bg: '#F9FAFB', dot: '#6B7280', terminal: true, reopenable: false },
  ],

  nav: [
    {
      title: 'JOBS',
      items: [
        { label: 'Pipeline',  href: '/dashboard/jobs',     icon: '📋', description: 'Your project pipeline' },
        { label: 'Calendar',  href: '/dashboard/calendar', icon: '📅', description: 'Milestones and site visits' },
        { label: 'Clients',   href: '/dashboard/clients',  icon: '👤', description: 'Client and project records' },
        { label: 'Invoices',  href: '/dashboard/invoices', icon: '💰', description: 'Payments and balances' },
      ],
    },
    {
      title: 'GC TOOLS',
      items: [
        { label: 'Subcontractors', href: '/dashboard/gc/subs',       icon: '👷', description: 'Verified sub roster', comingSoon: true },
        { label: 'Milestones',     href: '/dashboard/gc/milestones', icon: '🏁', description: 'Project milestone tracking', comingSoon: true },
        { label: 'Change Orders',  href: '/dashboard/gc/changes',    icon: '📝', description: 'Change order log', comingSoon: true },
        { label: 'Permit Tracker', href: '/dashboard/gc/permits',    icon: '📋', description: 'Permit status', comingSoon: true },
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
    subcontractorRoster: false,  // Phase 5
    milestoneTracking:   false,  // Phase 5
    materialsBudget:     false,  // Phase 5
    permitTracking:      false,  // Phase 5
    changeOrders:        false,  // Phase 6
  },

  // ── Components — use default until trade gets its own ──────────────────────
  components: {
    AddLeadModal: DefaultAddLeadModal,
  },
}
