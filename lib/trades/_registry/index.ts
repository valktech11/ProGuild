// ── Trade Registry ───────────────────────────────────────────────────────────
// Single entry point for everything trade-related.
// Dashboard, pipeline, sidebar — all import from here.
// Never import from individual trade folders directly in UI code.
//
// ── Adding a new trade (e.g. solar) ─────────────────────────────────────────
//   1. Create lib/trades/solar/ with types.ts, config.ts, state-machine.ts
//   2. Import solarConfig below
//   3. Add to REGISTRY with all slug aliases
//   4. Add isSolar() type guard
//   5. Add isValidSolarTransition to getIsValidTransition()
//   Zero changes to dashboard, LeadPipeline, DashboardShell, or any UI file.

import { roofingConfig }     from '../roofing/config'
import { hvacConfig }        from '../hvac/config'
import { plumbingConfig }    from '../plumbing/config'
import { electricianConfig } from '../electrician/config'
import { gcConfig }          from '../general-contractor/config'
import { defaultConfig }     from '../_default/config'

import type {
  AnyTradeConfig,
  AnyTradeBase,
  AnyPipelineStage,
  AnyNavItem,
  AnyNavSection,
  AnyStageAnchors,
  AnyTradeLabels,
  RoofingConfig,
  HVACConfig,
  PlumbingConfig,
  ElectricianConfig,
  GCConfig,
  DefaultConfig,
} from './types'

// ── Registry map ──────────────────────────────────────────────────────────────
// Slug aliases handled here — single config object, multiple slugs.
// DB slug → config is the only mapping that matters.
const REGISTRY: Record<string, AnyTradeConfig> = {
  // Roofing — DBPR slug variants
  'roofing':              roofingConfig,
  'roofing-contractor':   roofingConfig,
  'roofer':               roofingConfig,

  // HVAC
  'hvac-technician':      hvacConfig,
  'hvac':                 hvacConfig,
  'hvac-contractor':      hvacConfig,
  'air-conditioning':     hvacConfig,

  // Plumbing
  'plumber':              plumbingConfig,
  'plumbing':             plumbingConfig,
  'plumbing-contractor':  plumbingConfig,

  // Electrical
  'electrician':          electricianConfig,
  'electrical':           electricianConfig,
  'electrical-contractor':electricianConfig,

  // General Contractor
  'general-contractor':   gcConfig,
  'gc':                   gcConfig,

  // ── Future trades — uncomment when ready ────────────────────────────────
  // 'solar-installer':   solarConfig,
  // 'solar-energy':      solarConfig,
  // 'pool-spa':          poolSpaConfig,
  // 'pool-spa-contractor': poolSpaConfig,
  // 'painting':          paintingConfig,
  // 'painter':           paintingConfig,
  // 'landscaper':        landscapingConfig,
  // 'landscaping':       landscapingConfig,
}

// ── Core lookup ───────────────────────────────────────────────────────────────
// Never throws. Unknown slug → defaultConfig (generic pipeline).
export function getTradeConfig(tradeSlug: string | null | undefined): AnyTradeConfig {
  if (!tradeSlug) return defaultConfig
  return REGISTRY[tradeSlug.toLowerCase().trim()] ?? defaultConfig
}

// ── Type guards ───────────────────────────────────────────────────────────────
// Use for type-narrowed feature access.
// TypeScript enforces correct feature shape after guard.
// Shell code uses these — never slug string comparisons.
//
// Usage:
//   const trade = getTradeConfig(session.trade_slug)
//   if (isRoofing(trade)) { trade.features.insuranceClaim }   // ✅ typed
//   if (isRoofing(trade)) { trade.features.equipmentRecords } // ✅ TS error
export function isRoofing(c: AnyTradeConfig): c is RoofingConfig {
  return c.slug === 'roofing' || c.slug === 'roofing-contractor'
}
export function isHVAC(c: AnyTradeConfig): c is HVACConfig {
  return c.slug === 'hvac-technician'
}
export function isPlumbing(c: AnyTradeConfig): c is PlumbingConfig {
  return c.slug === 'plumber'
}
export function isElectrician(c: AnyTradeConfig): c is ElectricianConfig {
  return c.slug === 'electrician'
}
export function isGC(c: AnyTradeConfig): c is GCConfig {
  return c.slug === 'general-contractor'
}
export function isDefault(c: AnyTradeConfig): c is DefaultConfig {
  return c.slug === '_default'
}

// ── Stage helpers ──────────────────────────────────────────────────────────────
export function getActiveStages(tradeSlug: string | null | undefined): AnyPipelineStage[] {
  return getTradeConfig(tradeSlug).stages.filter(s => !s.terminal)
}
export function getTerminalStages(tradeSlug: string | null | undefined): AnyPipelineStage[] {
  return getTradeConfig(tradeSlug).stages.filter(s => s.terminal)
}
export function getInitialStage(tradeSlug: string | null | undefined): string {
  return (getTradeConfig(tradeSlug) as unknown as AnyTradeBase).stageAnchors.entry
}

// ── Stage anchors ──────────────────────────────────────────────────────────────
// Business logic uses these — never hardcodes 'job_won' or 'lead_in'.
// When stages become DB-driven, only the config stageAnchors changes.
export function getStageAnchors(tradeSlug: string | null | undefined): AnyStageAnchors {
  return (getTradeConfig(tradeSlug) as unknown as AnyTradeBase).stageAnchors
}

// ── Labels ────────────────────────────────────────────────────────────────────
// Replaces tradeTerm() from old lib/trade-resolver.ts.
// Returns trade-specific display terms. No fallback logic needed in callers.
export function getTradeLabels(tradeSlug: string | null | undefined): AnyTradeLabels {
  return (getTradeConfig(tradeSlug) as unknown as AnyTradeBase).labels as AnyTradeLabels
}

// ── All stage keys — derived, never hand-maintained ──────────────────────────
// Used by the stage API to validate incoming stage strings.
// Adding a new trade automatically includes its stages here.
// No more hand-editing KNOWN_STATUSES in API routes.
export function getAllTradeStageKeys(): string[] {
  const seen = new Set<string>()
  for (const config of Object.values(REGISTRY)) {
    for (const stage of config.stages) {
      seen.add(stage.key)
    }
  }
  // defaultConfig stages
  for (const stage of defaultConfig.stages) {
    seen.add(stage.key)
  }
  return Array.from(seen)
}

// ── All registered slugs — for admin / analytics ───────────────────────────
export function getAllTradeSlugs(): string[] {
  return Object.keys(REGISTRY)
}

// ── Stage transition validator ─────────────────────────────────────────────────
// Returns the correct isValidTransition function for a trade.
// Statically imported — no dynamic import() — safe with Turbopack.
// ⚠️  Add a new trade here when you add it to the registry.
import { isValidRoofingTransition }     from '../roofing/state-machine'
import { isValidHVACTransition }        from '../hvac/state-machine'
import { isValidPlumbingTransition }    from '../plumbing/state-machine'
import { isValidElectricianTransition } from '../electrician/state-machine'
import { isValidGCTransition }          from '../general-contractor/state-machine'

function isValidDefaultTransition(_from: string, _to: string): boolean {
  return _from !== _to
}

export function getIsValidTransition(
  tradeSlug: string | null | undefined
): (from: string, to: string) => boolean {
  const trade = getTradeConfig(tradeSlug)
  if (isRoofing(trade))     return isValidRoofingTransition     as (from: string, to: string) => boolean
  if (isHVAC(trade))        return isValidHVACTransition        as (from: string, to: string) => boolean
  if (isPlumbing(trade))    return isValidPlumbingTransition     as (from: string, to: string) => boolean
  if (isElectrician(trade)) return isValidElectricianTransition as (from: string, to: string) => boolean
  if (isGC(trade))          return isValidGCTransition          as (from: string, to: string) => boolean
  return isValidDefaultTransition
}

// ── Re-exports ────────────────────────────────────────────────────────────────
export type {
  AnyTradeConfig,
  AnyTradeBase,
  AnyPipelineStage,
  AnyNavItem,
  AnyNavSection,
  AnyStageAnchors,
  AnyTradeLabels,
  RoofingConfig, HVACConfig, PlumbingConfig,
  ElectricianConfig, GCConfig, DefaultConfig,
} from './types'
