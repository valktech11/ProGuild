// ── Trade Registry ──────────────────────────────────────────────────────────
// Single entry point for all trade config lookups.
// Dashboard, pipeline, sidebar — all import from here.
// Never import from individual trade folders directly in UI code.
//
// Adding a new trade (e.g. solar):
//   1. Create lib/trades/solar/ with types, config, state-machine
//   2. Import solarConfig below
//   3. Add to REGISTRY
//   4. Add isSolar() type guard
//   Zero changes to dashboard, LeadPipeline, or any existing UI file.

import { roofingConfig }     from '../roofing/config'
import { hvacConfig }        from '../hvac/config'
import { plumbingConfig }    from '../plumbing/config'
import { electricianConfig } from '../electrician/config'
import { gcConfig }          from '../general-contractor/config'
import { defaultConfig }     from '../_default/config'

import type {
  AnyTradeConfig,
  RoofingConfig,
  HVACConfig,
  PlumbingConfig,
  ElectricianConfig,
  GCConfig,
  DefaultConfig,
} from './types'

// ── Registry map ─────────────────────────────────────────────────────────────
// Slug aliases handled here — single config object, multiple slugs.
const REGISTRY: Record<string, AnyTradeConfig> = {
  // Roofing — two slug variants from DBPR data
  'roofing':              roofingConfig,
  'roofing-contractor':   roofingConfig,
  'roofer':               roofingConfig,

  // HVAC
  'hvac-technician':      hvacConfig,
  'hvac':                 hvacConfig,

  // Plumbing
  'plumber':              plumbingConfig,
  'plumbing':             plumbingConfig,

  // Electrical
  'electrician':          electricianConfig,
  'electrical':           electricianConfig,

  // General Contractor
  'general-contractor':   gcConfig,
  'gc':                   gcConfig,

  // Future trades — add here when ready:
  // 'solar-installer': solarConfig,
  // 'solar-energy':    solarConfig,
  // 'pool-spa':        poolSpaConfig,
}

// ── Main lookup ───────────────────────────────────────────────────────────────
// Never throws. Unknown slug → defaultConfig (generic pipeline).
export function getTradeConfig(tradeSlug: string | null | undefined): AnyTradeConfig {
  if (!tradeSlug) return defaultConfig
  return REGISTRY[tradeSlug.toLowerCase().trim()] ?? defaultConfig
}

// ── Type guards ───────────────────────────────────────────────────────────────
// Use these for type-narrowed feature access.
// TypeScript guarantees features are the right shape after the guard.
//
// Usage:
//   const trade = getTradeConfig(session.trade_slug)
//   if (isRoofing(trade)) {
//     trade.features.insuranceClaim  // ✓ typed
//     trade.features.equipmentRecords // ✗ TypeScript error — good!
//   }

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

// ── Convenience helpers ───────────────────────────────────────────────────────

// Returns the initial (entry) stage key for any trade
export function getInitialStage(tradeSlug: string | null | undefined): string {
  const trade = getTradeConfig(tradeSlug)
  // First non-terminal stage is always the entry stage
  const first = trade.stages.find(s => !s.terminal)
  return first?.key ?? 'new'
}

// Returns all active (non-terminal) stages for a trade
export function getActiveStages(tradeSlug: string | null | undefined) {
  const trade = getTradeConfig(tradeSlug)
  return trade.stages.filter(s => !s.terminal)
}

// Returns all terminal stages for a trade
export function getTerminalStages(tradeSlug: string | null | undefined) {
  const trade = getTradeConfig(tradeSlug)
  return trade.stages.filter(s => s.terminal)
}

// List of all registered trade slugs (for admin / analytics)
export function getAllTradeSlugs(): string[] {
  return Object.keys(REGISTRY)
}

// Re-export types for convenience
export type { AnyTradeConfig, RoofingConfig, HVACConfig, PlumbingConfig, ElectricianConfig, GCConfig, DefaultConfig }
export type { AnyPipelineStage, AnyNavItem, AnyNavSection } from './types'


// ── Stage transition validator ─────────────────────────────────────────────
// Single entry point for isValidTransition — no dynamic imports, no template
// literal module resolution (breaks Turbopack). Always statically imported.

import { isValidRoofingTransition }     from '../roofing/state-machine'
import { isValidHVACTransition }        from '../hvac/state-machine'
import { isValidPlumbingTransition }    from '../plumbing/state-machine'
import { isValidElectricianTransition } from '../electrician/state-machine'
import { isValidGCTransition }          from '../general-contractor/state-machine'

// Default: allow any transition (for misc trades with no state machine)
function isValidDefaultTransition(_from: string, _to: string): boolean {
  return _from !== _to
}

// Returns the correct isValidTransition fn for a given trade slug.
// Used by the stage API route — replaces dynamic import() pattern.
export function getIsValidTransition(tradeSlug: string | null | undefined): (from: string, to: string) => boolean {
  const slug = (tradeSlug ?? '').toLowerCase().trim()
  if (slug === 'roofing' || slug === 'roofing-contractor' || slug === 'roofer')
    return isValidRoofingTransition as (from: string, to: string) => boolean
  if (slug === 'hvac-technician' || slug === 'hvac')
    return isValidHVACTransition as (from: string, to: string) => boolean
  if (slug === 'plumber' || slug === 'plumbing')
    return isValidPlumbingTransition as (from: string, to: string) => boolean
  if (slug === 'electrician' || slug === 'electrical')
    return isValidElectricianTransition as (from: string, to: string) => boolean
  if (slug === 'general-contractor' || slug === 'gc')
    return isValidGCTransition as (from: string, to: string) => boolean
  return isValidDefaultTransition
}
