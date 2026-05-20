import type { AnyTradeComponents } from '../_registry/types'
// ── Plumbing Trade — Types ──────────────────────────────────────────────────

export type PlumbingStage =
  | 'new_call'
  | 'assessed'
  | 'quoted'
  | 'scheduled'
  | 'in_progress'
  | 'job_won'
  | 'lost'
  | 'unqualified'

export interface PlumbingPipelineStage {
  key:          PlumbingStage
  label:        string
  icon:         string
  color:        string
  bg:           string
  dot:          string
  terminal?:    boolean
  reopenable?:  boolean
}

export interface PlumbingNavItem {
  label:        string
  href:         string
  icon:         string
  description:  string
  badge?:       'new' | 'pro' | 'elite'
  comingSoon?:  boolean
}

export interface PlumbingNavSection {
  title:  'TODAY' | 'MONEY' | 'PLUMBING TOOLS' | 'REPORTS'
  items:  PlumbingNavItem[]
}

export interface PlumbingLabels {
  pipeline:     'Jobs'
  estimate:     'Quote'
  client:       'Client'
  newButton:    'New Call'
  wonStage:     'Job Won'
  addClient:    'Add Client'
  clientsPage:  'Clients'
  scopePlaceholder?: string
}

export interface PlumbingFeatures {
  fixtureRecords:   boolean
  permitTracking:   boolean
  emergencyDispatch: boolean
  waterHeaterLog:   boolean
}

export interface PlumbingConfig {
  readonly slug:         'plumber'
  readonly displayName:  'Plumbing Contractor'
  readonly emoji:        '🪠'
  readonly brandColor:   string
  readonly dbprCodes:    string[]
  labels:   PlumbingLabels
  stages:   PlumbingPipelineStage[]
  nav:      PlumbingNavSection[]
  components:   AnyTradeComponents
  features: PlumbingFeatures
}
