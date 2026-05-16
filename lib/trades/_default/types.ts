// ── Default Trade Config ────────────────────────────────────────────────────
// Fallback for any trade not in the registry:
// painter, mason, carpenter, landscaper, pool-spa, gutters etc.
// Clean generic pipeline. No trade-specific tools. Works immediately.

export type DefaultStage =
  | 'new' | 'quoted' | 'scheduled' | 'in_progress' | 'job_won'
  | 'lost' | 'unqualified'

export interface DefaultPipelineStage {
  key: DefaultStage; label: string; icon: string
  color: string; bg: string; dot: string
  terminal?: boolean; reopenable?: boolean
}

export interface DefaultNavItem {
  label: string; href: string; icon: string; description: string
  badge?: 'new' | 'pro' | 'elite'
}

export interface DefaultNavSection {
  title: 'JOBS' | 'REPORTS'
  items: DefaultNavItem[]
}

export interface DefaultLabels {
  pipeline: 'Jobs'; estimate: 'Estimate'; client: 'Client'
  newButton: 'New Lead'; wonStage: 'Job Won'
  addClient: 'Add Client'; clientsPage: 'Clients'
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
  labels:   DefaultLabels
  stages:   DefaultPipelineStage[]
  nav:      DefaultNavSection[]
  features: DefaultFeatures
}
