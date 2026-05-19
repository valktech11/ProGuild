import type { AnyTradeComponents } from '../_registry/types'
// ── Roofing Trade — Isolated Type Definitions ──────────────────────────────
// No imports from other trade modules. Zero shared interfaces.
// If another trade happens to have a field with the same name, that is
// a coincidence — not a coupling. These types evolve independently.

export type RoofingStage =
  | 'lead_in'
  | 'inspection_scheduled'
  | 'proposal_sent'
  | 'proposal_signed'
  | 'insurance_approved'
  | 'scheduled'
  | 'in_progress'
  | 'job_won'
  | 'lost'
  | 'unqualified'

export interface RoofingPipelineStage {
  key:          RoofingStage
  label:        string
  icon:         string       // roofing-specific icons
  color:        string       // hex
  bg:           string       // hex
  dot:          string       // hex — mobile dot indicator
  subLabel?:    string       // e.g. "Awaiting inspection"
  nextLabel?:   string       // CTA: "Schedule Inspection", "Run Inspection"
  terminal?:    boolean      // lost / unqualified — hidden from main board
  reopenable?:  boolean      // lost can reopen; unqualified cannot
}

// ── Stage anchors ─────────────────────────────────────────────────────────────
// Business logic reads these — never hardcodes stage key strings.
// Auto-triggers, warranty creation, deposit firing — all use anchors.
export interface RoofingStageAnchors {
  entry:            RoofingStage   // 'lead_in'
  won:              RoofingStage   // 'job_won'
  lost:             RoofingStage   // 'lost'
  depositTrigger:   RoofingStage   // 'proposal_signed' — Stripe deposit fires here
  insuranceStage:   RoofingStage   // 'insurance_approved' — insurance-specific UI
  warrantyTrigger:  RoofingStage   // 'job_won' — warranty record prompt
}

export interface RoofingNavItem {
  label:        string
  href:         string
  icon:         string
  description:  string
  badge?:       'new' | 'pro' | 'elite'
  comingSoon?:  boolean
}

export interface RoofingNavSection {
  title:  'JOBS' | 'MONEY' | 'ROOFING TOOLS' | 'DOCUMENTS' | 'REPORTS'
  items:  RoofingNavItem[]
}

export interface RoofingLabels {
  pipeline:    'Jobs'
  estimate:    'Proposal'
  invoice:     'Invoice'
  client:      'Property'
  clients:     'Properties'
  newButton:   'New Job'
  wonStage:    'Job Won'
}

export type RoofingAutoAction =
  | 'stripe_deposit'               // proposal_signed
  | 'send_proposal_signed_email'   // proposal_signed
  | 'create_warranty_record'       // job_won
  | 'queue_review_request'         // job_won
  | 'generate_job_summary'         // job_won

export interface RoofingFeatures {
  // Measurement & reporting
  satelliteMeasure:     boolean
  quickBidPdf:          boolean
  premiumMaterialPdf:   boolean
  pitchDiagram:         boolean    // Phase 2
  elevationAccuracy:    boolean    // Phase 2 — ~$0.02/property
  // Estimating
  roofingCalculator:    boolean
  goodBetterBest:       boolean
  aiEstimateWriter:     boolean    // Phase 3
  aiPriceAdvisor:       boolean    // Phase 3
  // Insurance workflow
  insuranceClaim:       boolean
  adjusterPhotoZip:     boolean
  supplementWriter:     boolean    // Phase 3
  // Job management
  jobPhotoLog:          boolean
  propertyProfile:      boolean
  warrantyRecord:       boolean
  homeownerStatusPage:  boolean    // Phase 2
  // Post-job
  autoReviewRequest:    boolean    // post-Twilio 10DLC
  smartReminders:       boolean    // Phase 5
  stormCanvassing:      boolean    // Phase 3
  // Compliance
  permitTracking:       boolean
  lienWaivers:          boolean    // Phase 6
  flRoofingContract:    boolean    // Phase 6
}

export interface RoofingLeadSource {
  value:  string
  label:  string
  icon:   string
}

export interface RoofingConfig {
  readonly slug:         'roofing' | 'roofing-contractor'
  readonly displayName:  'Roofing Contractor'
  readonly emoji:        '🏠'
  readonly brandColor:   string   // '#0F766E' — teal
  readonly dbprCodes:    string[] // ['CCC', 'RCC']
  labels:       RoofingLabels
  stageAnchors: RoofingStageAnchors
  stages:       RoofingPipelineStage[]
  nav:          RoofingNavSection[]
  components:   AnyTradeComponents
  features:     RoofingFeatures
  leadSources:  RoofingLeadSource[]
}
