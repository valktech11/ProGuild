import type { AnyTradeComponents } from '../_registry/types'
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
  exact?:       boolean
}

export interface ElectricianNavSection {
  title: 'TODAY' | 'MONEY' | 'ELECTRICAL' | 'REPORTS'
  items: ElectricianNavItem[]
}

export interface ElectricianLabels {
  pipeline: 'Jobs'; estimate: 'Quote'; client: 'Client'
  newButton: 'New Call'; wonStage: 'Job Won'; scopePlaceholder?: string
  addClient: 'Add Client'; clientsPage: 'Clients'
}

export interface ElectricianFeatures {
  panelRecords:   boolean
  permitTracking: boolean
  codeCompliance: boolean
  loadCalculator: boolean
}


export interface ElectricianStageAnchors {
  entry: ElectricianStage
  won:   ElectricianStage
  lost:  ElectricianStage
}

export interface ElectricianConfig {
  readonly slug: 'electrician'
  readonly displayName: 'Electrician'
  readonly emoji: '⚡'
  readonly brandColor: string
  readonly dbprCodes: string[]
  labels: ElectricianLabels
  stageAnchors: ElectricianStageAnchors
  stages: ElectricianPipelineStage[]
  nav: ElectricianNavSection[]
  components:   AnyTradeComponents
  features: ElectricianFeatures
}
