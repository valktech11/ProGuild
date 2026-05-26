import type { AnyTradeComponents } from '../_registry/types'
// ── Default Trade Config ────────────────────────────────────────────────────
// Fallback for any trade not in the registry:
// painter, mason, carpenter, landscaper, pool-spa, gutters etc.
// Clean generic pipeline. No trade-specific tools. Works immediately.

export type DefaultStage =
  | 'lead_in' | 'new' | 'quoted' | 'scheduled' | 'in_progress' | 'job_won'
  | 'lost' | 'unqualified'

export interface DefaultPipelineStage {
  key: DefaultStage; label: string; icon: string
  color: string; bg: string; dot: string
  terminal?: boolean; reopenable?: boolean
}

export interface DefaultNavItem {
  label: string; href: string; icon: string; description: string
  badge?: 'new' | 'pro' | 'elite'
  exact?: boolean
  comingSoon?: boolean
}

export interface DefaultNavSection {
  title: 'TODAY' | 'MONEY' | 'MY BUSINESS' | 'REPORTS'
  items: DefaultNavItem[]
}

export interface DefaultLabels {
  pipeline:  'Jobs'
  estimate:  'Estimate'
  invoice:   'Invoice'
  client:    'Client'
  clients:   'Clients'
  newButton: 'New Lead'
  wonStage:  'Job Won'
  scopePlaceholder?: string
}

export interface DefaultStageAnchors {
  entry: DefaultStage   // 'new'
  won:   DefaultStage   // 'job_won'
  lost:  DefaultStage   // 'lost'
}

export interface DefaultFeatures {
  // Intentionally empty — no trade-specific features for misc trades
  _placeholder: true
}

export interface DefaultConfig {
  readonly slug:        '_default'
  readonly displayName: string
  readonly emoji:       '🛠️'
  readonly brandColor:  string
  labels:       DefaultLabels
  stageAnchors:  DefaultStageAnchors
  stages:        DefaultPipelineStage[]
  nav:      DefaultNavSection[]
  components:   AnyTradeComponents
  features: DefaultFeatures
}
