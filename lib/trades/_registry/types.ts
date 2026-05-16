// ── Registry Types ──────────────────────────────────────────────────────────
// The ONLY shared type file in the trade system.
// Imports from every trade, exports the union.
// Dashboard imports from here — never from individual trade folders directly.

import type { RoofingConfig }     from '../roofing/types'
import type { HVACConfig }        from '../hvac/types'
import type { PlumbingConfig }    from '../plumbing/types'
import type { ElectricianConfig } from '../electrician/types'
import type { GCConfig }          from '../general-contractor/types'
import type { DefaultConfig }     from '../_default/types'

// Discriminated union — TypeScript narrows automatically after type guard
export type AnyTradeConfig =
  | RoofingConfig
  | HVACConfig
  | PlumbingConfig
  | ElectricianConfig
  | GCConfig
  | DefaultConfig

// Re-export individual config types for callers that need them
export type {
  RoofingConfig, HVACConfig, PlumbingConfig,
  ElectricianConfig, GCConfig, DefaultConfig,
}

// Minimal shared stage shape — only what pipeline UI needs
// Each trade's full stage type is richer — this is the display contract
export interface AnyPipelineStage {
  key:          string
  label:        string
  icon:         string
  color:        string
  bg:           string
  dot:          string
  terminal?:    boolean
  reopenable?:  boolean
}

// Minimal shared nav shape — only what sidebar needs
export interface AnyNavItem {
  label:        string
  href:         string
  icon:         string
  description:  string
  badge?:       'new' | 'pro' | 'elite'
  comingSoon?:  boolean
}

export interface AnyNavSection {
  title: string
  items: AnyNavItem[]
}
