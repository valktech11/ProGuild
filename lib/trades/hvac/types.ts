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
  subLabel?:    string
  nextLabel?:   string
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
  exact?:       boolean
}

export interface HVACNavSection {
  title:  'TODAY' | 'BILLING' | 'EQUIPMENT' | 'MY EQUIPMENT' | 'MONEY' | 'COMPLIANCE' | 'REPORTS'
  items:  HVACNavItem[]
}

export interface HVACLabels {
  pipeline:    string
  estimate:    string
  invoice:     string
  client:      string
  clients:     string
  newButton:   string
  wonStage:    string
  scopePlaceholder?: string
}

export interface HVACStageAnchors {
  entry:           HVACStage   // 'new_call'
  won:             HVACStage   // 'job_won'
  lost:            HVACStage   // 'lost'
  sentTrigger?:    HVACStage   // 'quoted' — estimate sent moves lead here
  depositTrigger?: HVACStage   // 'scheduled' — estimate approved moves lead here
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
