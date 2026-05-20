import type { AnyTradeComponents } from '../_registry/types'
// ── HVAC Trade — Isolated Type Definitions ─────────────────────────────────

export type HVACStage =
  | 'new_call'
  | 'diagnosed'
  | 'quoted'
  | 'parts_ordered'
  | 'scheduled'
  | 'in_progress'
  | 'job_won'
  | 'lost'
  | 'unqualified'

export interface HVACPipelineStage {
  key:          HVACStage
  label:        string
  icon:         string   // HVAC-specific — wrench, thermometer, snowflake etc
  color:        string
  bg:           string
  dot:          string
  terminal?:    boolean
  reopenable?:  boolean
}

export interface HVACNavItem {
  label:        string
  href:         string
  icon:         string
  description:  string
  badge?:       'new' | 'pro' | 'elite'
  comingSoon?:  boolean
}

export interface HVACNavSection {
  title:  'TODAY' | 'MONEY' | 'MY EQUIPMENT' | 'COMPLIANCE' | 'REPORTS'
  items:  HVACNavItem[]
}

export interface HVACLabels {
  pipeline:    'Jobs'
  estimate:    'Quote'
  invoice:     'Invoice'
  client:      'Client'
  clients:     'Clients'
  newButton:   'New Call'
  wonStage:    'Job Won'
  scopePlaceholder?: string
}

export interface HVACStageAnchors {
  entry:  HVACStage   // 'new_call'
  won:    HVACStage   // 'job_won'
  lost:   HVACStage   // 'lost'
}

export type HVACAutoAction =
  | 'send_estimate_email'
  | 'create_maintenance_reminder'
  | 'queue_review_request'
  | 'generate_service_summary'

export interface HVACFeatures {
  // Equipment
  equipmentRecords:      boolean
  equipmentHistory:      boolean
  filterTracking:        boolean
  // EPA compliance
  refrigerantLog:        boolean
  epaCertTracking:       boolean  // Phase 2
  // Service
  maintenancePlans:      boolean
  serviceChecklists:     boolean  // Phase 2: AC tune-up, furnace, heat pump PDFs
  // Homeowner
  qrHomeownerPortal:     boolean  // Phase 2
  maintenanceMembership: boolean  // Phase 2: annual billing plans
}

export interface HVACConfig {
  readonly slug:         'hvac-technician'
  readonly displayName:  'HVAC Technician'
  readonly emoji:        '❄️'
  readonly brandColor:   string   // '#0EA5E9' — cool blue
  readonly dbprCodes:    string[] // ['CA', 'RA']
  labels:       HVACLabels
  stageAnchors:  HVACStageAnchors
  stages:   HVACPipelineStage[]
  nav:      HVACNavSection[]
  components:   AnyTradeComponents
  features: HVACFeatures
}
