// lib/trades/photoPhases.ts
//
// SINGLE GOLDEN SOURCE for job-photo phases, per trade.
//
// Photos are organized by "phase" (a stage-of-work tag). Each trade has its own
// natural set — a roofer's phases are not a GC's are not a solar installer's.
// This file is the one authority for the list, labels, and colors.
//
// ⚠️ MOBILE SYNC: the Flutter app mirrors this in
//    ProGuildMobile › lib/shared/models/photo_phases.dart
//    Keep the phase `value`s identical across web + mobile (the value is stored
//    in lead_photos.phase, so changing one breaks historical photos).
//
// Adding a trade = add an entry to PHASES_BY_TRADE. Roofing is the live set;
// the others are scaffolded for when those verticals build (GC/HVAC/solar).

export interface PhotoPhase {
  value: string                 // stored in lead_photos.phase — never rename an existing value
  label: string
  color: { bg: string; text: string }
}

// Roofing — the live vertical. Insurance-heavy (Damage + Insurance phases feed
// the supplement workflow; capture them from day one even before that's wired).
export const ROOFING_PHASES: PhotoPhase[] = [
  { value: 'Before',       label: 'Before',       color: { bg: '#FEF3C7', text: '#B45309' } },
  { value: 'Decking',      label: 'Decking',      color: { bg: '#EFF6FF', text: '#1D4ED8' } },
  { value: 'Installation', label: 'Installation', color: { bg: '#F5F3FF', text: '#6D28D9' } },
  { value: 'Completion',   label: 'Completion',   color: { bg: '#F0FDF4', text: '#15803D' } },
  { value: 'Damage',       label: 'Damage',       color: { bg: '#FEF2F2', text: '#DC2626' } },
  { value: 'Insurance',    label: 'Insurance',    color: { bg: '#FFF7ED', text: '#C2410C' } },
]

// General Contractor — progress/draw documentation (scaffold; GC vertical TBD).
export const GC_PHASES: PhotoPhase[] = [
  { value: 'Before',       label: 'Before',       color: { bg: '#FEF3C7', text: '#B45309' } },
  { value: 'Demo',         label: 'Demo',         color: { bg: '#FEF2F2', text: '#DC2626' } },
  { value: 'Framing',      label: 'Framing',      color: { bg: '#EFF6FF', text: '#1D4ED8' } },
  { value: 'Rough_In',     label: 'Rough-in',     color: { bg: '#F5F3FF', text: '#6D28D9' } },
  { value: 'Finish',       label: 'Finish',       color: { bg: '#F0FDF4', text: '#15803D' } },
  { value: 'Completion',   label: 'Completion',   color: { bg: '#ECFDF5', text: '#047857' } },
]

// HVAC — equipment-first (scaffold; HVAC is the named CRM beachhead).
export const HVAC_PHASES: PhotoPhase[] = [
  { value: 'Existing',     label: 'Existing Unit', color: { bg: '#FEF3C7', text: '#B45309' } },
  { value: 'Removal',      label: 'Removal',       color: { bg: '#FEF2F2', text: '#DC2626' } },
  { value: 'Installation', label: 'Installation',  color: { bg: '#F5F3FF', text: '#6D28D9' } },
  { value: 'Nameplate',    label: 'Nameplate',     color: { bg: '#EFF6FF', text: '#1D4ED8' } },
  { value: 'Completion',   label: 'Completion',    color: { bg: '#F0FDF4', text: '#15803D' } },
]

// Solar — install + interconnection/inspection proof (scaffold).
export const SOLAR_PHASES: PhotoPhase[] = [
  { value: 'Pre_Install',  label: 'Pre-install',   color: { bg: '#FEF3C7', text: '#B45309' } },
  { value: 'Array',        label: 'Array',         color: { bg: '#EFF6FF', text: '#1D4ED8' } },
  { value: 'Electrical',   label: 'Electrical',    color: { bg: '#F5F3FF', text: '#6D28D9' } },
  { value: 'Inspection',   label: 'Inspection',    color: { bg: '#FFF7ED', text: '#C2410C' } },
  { value: 'Completion',   label: 'Completion',    color: { bg: '#F0FDF4', text: '#15803D' } },
]

// Generic fallback for any trade without a specific set.
export const GENERIC_PHASES: PhotoPhase[] = [
  { value: 'Before',       label: 'Before',       color: { bg: '#FEF3C7', text: '#B45309' } },
  { value: 'During',       label: 'During',       color: { bg: '#EFF6FF', text: '#1D4ED8' } },
  { value: 'Completion',   label: 'Completion',   color: { bg: '#F0FDF4', text: '#15803D' } },
]

export const PHASES_BY_TRADE: Record<string, PhotoPhase[]> = {
  roofing: ROOFING_PHASES,
  gc:      GC_PHASES,
  hvac:    HVAC_PHASES,
  solar:   SOLAR_PHASES,
}

/** Phases for a trade slug, falling back to a generic set. */
export function phasesForTrade(tradeSlug: string | null | undefined): PhotoPhase[] {
  if (!tradeSlug) return GENERIC_PHASES
  return PHASES_BY_TRADE[tradeSlug.toLowerCase()] ?? GENERIC_PHASES
}

/** Look up the display label for a stored phase value (any trade). */
export function photoPhaseLabel(value: string): string {
  for (const set of Object.values(PHASES_BY_TRADE)) {
    const hit = set.find(p => p.value === value)
    if (hit) return hit.label
  }
  return value.replace(/_/g, ' ')
}
