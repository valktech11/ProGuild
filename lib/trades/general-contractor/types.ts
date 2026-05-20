import type { AnyTradeComponents } from '../_registry/types'
// ── General Contractor — Types ──────────────────────────────────────────────

export type GCStage =
  | 'lead_in' | 'bidding' | 'contract_signed' | 'permit_submitted'
  | 'milestone_1' | 'milestone_2' | 'closeout' | 'job_won'
  | 'lost' | 'unqualified'

export interface GCPipelineStage {
  key: GCStage; label: string; icon: string
  color: string; bg: string; dot: string
  terminal?: boolean; reopenable?: boolean
}

export interface GCNavItem {
  label: string; href: string; icon: string; description: string
  badge?: 'new' | 'pro' | 'elite'; comingSoon?: boolean
}

export interface GCNavSection {
  title: 'TODAY' | 'MONEY' | 'MY PROJECTS' | 'REPORTS'
  items: GCNavItem[]
}

export interface GCLabels {
  pipeline: 'Projects'; estimate: 'Bid'; client: 'Client'
  newButton: 'New Project'; wonStage: 'Project Won'; scopePlaceholder?: string
  addClient: 'Add Client'; clientsPage: 'Clients'
}

export interface GCFeatures {
  subcontractorRoster: boolean
  milestoneTracking:   boolean
  materialsBudget:     boolean
  permitTracking:      boolean
  changeOrders:        boolean
}

export interface GCConfig {
  readonly slug: 'general-contractor'
  readonly displayName: 'General Contractor'
  readonly emoji: '🏗️'
  readonly brandColor: string
  readonly dbprCodes: string[]
  labels: GCLabels
  stages: GCPipelineStage[]
  nav: GCNavSection[]
  components:   AnyTradeComponents
  features: GCFeatures
}
