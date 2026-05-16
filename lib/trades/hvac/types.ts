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
  title:  'JOBS' | 'MY EQUIPMENT' | 'COMPLIANCE' | 'REPORTS'
  items:  HVACNavItem[]
}

export interface HVACLabels {
  pipeline:     'Jobs'
  estimate:     'Estimate'
  client:       'Client'
  newButton:    'New Call'
  wonStage:     'Job Won'
  addClient:    'Add Client'
  clientsPage:  'Clients'
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
  labels:   HVACLabels
  stages:   HVACPipelineStage[]
  nav:      HVACNavSection[]
  features: HVACFeatures
}
