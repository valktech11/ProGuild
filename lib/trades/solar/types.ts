// ── Solar Trade — Future Ready ──────────────────────────────────────────────
// Scaffold only. Activates when solar wave begins.
// Add to registry when ready. Zero changes to existing files.

export type SolarStage =
  | 'lead_in' | 'site_survey' | 'design_approved' | 'permit_submitted'
  | 'permit_approved' | 'scheduled' | 'in_progress' | 'inspection'
  | 'utility_approval' | 'job_won' | 'lost' | 'unqualified'

export interface SolarFeatures {
  siteAssessment:      boolean
  systemDesign:        boolean
  utilityCoordination: boolean
  permitTracking:      boolean
  productionMonitor:   boolean
  financingOptions:    boolean
}

export interface SolarConfig {
  readonly slug:        'solar-installer' | 'solar-energy'
  readonly displayName: 'Solar Contractor'
  readonly emoji:       '☀️'
  readonly brandColor:  string
  readonly dbprCodes:   string[]
  // stages, nav, labels, features — add when solar wave starts
}
