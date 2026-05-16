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
  icon:         string   // roofing-specific icons
  color:        string   // hex
  bg:           string   // hex
  dot:          string   // hex — for mobile dot indicator
  terminal?:    boolean  // lost / unqualified — hidden from main board
  reopenable?:  boolean  // lost can reopen, unqualified cannot
}

export interface RoofingNavItem {
  label:        string
  href:         string
  icon:         string
  description:  string  // tooltip shown on onboarding
  badge?:       'new' | 'pro' | 'elite'
  comingSoon?:  boolean
}

export interface RoofingNavSection {
  title:  'JOBS' | 'ROOFING TOOLS' | 'DOCUMENTS' | 'REPORTS'
  items:  RoofingNavItem[]
}

export interface RoofingLabels {
  pipeline:     'Jobs'
  estimate:     'Proposal'
  client:       'Property'
  newButton:    'New Job'
  wonStage:     'Job Won'
  addClient:    'Add Property'
  clientsPage:  'Properties'
}

export interface RoofingAutoTrigger {
  stage:   RoofingStage
  actions: RoofingAutoAction[]
}

export type RoofingAutoAction =
  | 'stripe_deposit'          // proposal_signed
  | 'send_proposal_signed_email'
  | 'create_warranty_record'  // job_won
  | 'queue_review_request'
  | 'generate_job_summary'

export interface RoofingFeatures {
  // Measurement & reporting
  satelliteMeasure:     boolean
  quickBidPdf:          boolean
  premiumMaterialPdf:   boolean
  pitchDiagram:         boolean
  elevationAccuracy:    boolean  // ~$0.02/property — Phase 2
  // Estimating
  roofingCalculator:    boolean
  goodBetterBest:       boolean
  aiEstimateWriter:     boolean  // Phase 3
  aiPriceAdvisor:       boolean  // Phase 3
  // Insurance workflow
  insuranceClaim:       boolean
  adjusterPhotoZip:     boolean
  supplementWriter:     boolean  // Phase 3
  // Job management
  jobPhotoLog:          boolean
  propertyProfile:      boolean
  warrantyRecord:       boolean
  homeownerStatusPage:  boolean  // Phase 2
  // Post-job
  autoReviewRequest:    boolean  // post-Twilio
  smartReminders:       boolean  // Phase 5
  stormCanvassing:      boolean  // Phase 3
  // Compliance
  permitTracking:       boolean
  lienWaivers:          boolean  // Phase 6
  flRoofingContract:    boolean  // Phase 6
}

export interface RoofingConfig {
  readonly slug:         'roofing' | 'roofing-contractor'
  readonly displayName:  'Roofing Contractor'
  readonly emoji:        '🏠'
  readonly brandColor:   string   // '#DC2626' — storm red
  readonly dbprCodes:    string[] // ['CCC', 'RCC']
  labels:   RoofingLabels
  stages:   RoofingPipelineStage[]
  nav:      RoofingNavSection[]
  features: RoofingFeatures
}
