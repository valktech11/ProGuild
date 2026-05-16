export type ElectricianStage =
  | 'new_call' | 'site_visit' | 'quoted' | 'permit_submitted'
  | 'permit_approved' | 'scheduled' | 'in_progress' | 'job_won'
  | 'lost' | 'unqualified'

export interface ElectricianPipelineStage {
  key: ElectricianStage; label: string; icon: string
  color: string; bg: string; dot: string
  terminal?: boolean; reopenable?: boolean
}

export interface ElectricianNavItem {
  label: string; href: string; icon: string; description: string
  badge?: 'new' | 'pro' | 'elite'; comingSoon?: boolean
}

export interface ElectricianNavSection {
  title: 'JOBS' | 'ELECTRICAL TOOLS' | 'REPORTS'
  items: ElectricianNavItem[]
}

export interface ElectricianLabels {
  pipeline: 'Jobs'; estimate: 'Estimate'; client: 'Client'
  newButton: 'New Call'; wonStage: 'Job Won'
  addClient: 'Add Client'; clientsPage: 'Clients'
}

export interface ElectricianFeatures {
  panelRecords:   boolean
  permitTracking: boolean
  codeCompliance: boolean
  loadCalculator: boolean
}

export interface ElectricianConfig {
  readonly slug: 'electrician'
  readonly displayName: 'Electrician'
  readonly emoji: '⚡'
  readonly brandColor: string
  readonly dbprCodes: string[]
  labels: ElectricianLabels
  stages: ElectricianPipelineStage[]
  nav: ElectricianNavSection[]
  features: ElectricianFeatures
}
