import type React from 'react'

// ── Trade Registry — Shared Contract ────────────────────────────────────────
// THE ONLY shared type file in the trade system.
// Every trade imports FROM here (for shared interfaces) but never from each
// other's folders. The dashboard imports FROM here exclusively.
//
// ⚠️  Adding a new trade?
//   1. Create lib/trades/{trade}/types.ts  (no imports from here)
//   2. Create lib/trades/{trade}/config.ts
//   3. Create lib/trades/{trade}/state-machine.ts
//   4. Add config to REGISTRY in index.ts
//   5. Add type guard in index.ts
//   6. Add to AnyTradeConfig union below
//   Zero changes to dashboard, pipeline, or any UI file.

import type { RoofingConfig }     from '../roofing/types'
import type { HVACConfig }        from '../hvac/types'
import type { PlumbingConfig }    from '../plumbing/types'
import type { ElectricianConfig } from '../electrician/types'
import type { GCConfig }          from '../general-contractor/types'
import type { DefaultConfig }     from '../_default/types'

// ── Minimal shared base — every trade config satisfies this ─────────────────
// Registry functions (getStageAnchors, getTradeLabels) read these safely
// without needing a type guard first.
// ── Component prop interfaces ─────────────────────────────────────────────────
// The contract between shell pages and trade components.
// Shell pages only know these interfaces — never the concrete implementations.

export interface AddLeadModalProps {
  proId:    string
  tradeSlug?: string
  onClose:  () => void
  onAdded:  (lead: any) => void
  dk?:      boolean
}

export interface PipelineDetailExtrasProps {
  leadId:   string
  proId:    string
  lead:     any
  session:  any
  dk:       boolean
  // Roofing-specific extras passed through — ignored by non-roofing
  isRoofing?: boolean
  onWarrantySaved?: () => void
  onPhotosLoaded?:  (n: number) => void
}

// ── Components slot on every trade plugin ────────────────────────────────────
// Shell pages delegate rendering to these. No direct trade imports in shell.
// ── OverviewWidget props — passed by app/dashboard/page.tsx to trade plugin ──
export interface OverviewWidgetProps {
  leads:    any[]
  session:  any
  dk:       boolean
  overview?: any
}

export interface AnyTradeComponents {
  // Add lead modal — trade-specific source picker, fields, placeholders
  AddLeadModal:   React.ComponentType<AddLeadModalProps>
  // Trade-specific overview sections (Today's Schedule, Revenue Forecast, etc.)
  // Returns null for trades that don't need custom overview sections (_default)
  OverviewWidget: React.ComponentType<OverviewWidgetProps>
  // Future slots:
  // PipelineBoardPage:  React.ComponentType<PipelineBoardProps>
  // PipelineDetailPage: React.ComponentType<PipelineDetailExtrasProps>
  // EstimatePage:       React.ComponentType<EstimatePageProps>
  // InvoicePage:        React.ComponentType<InvoicePageProps>
}

export interface AnyTradeBase {
  slug:         string
  labels:       AnyTradeLabels
  stageAnchors: AnyStageAnchors
  stages:       AnyPipelineStage[]
  nav:          AnyNavSection[]
  components:   AnyTradeComponents
}

// ── Discriminated union ───────────────────────────────────────────────────────
// TypeScript narrows automatically after a type guard.
export type AnyTradeConfig =
  | RoofingConfig
  | HVACConfig
  | PlumbingConfig
  | ElectricianConfig
  | GCConfig
  | DefaultConfig

// Re-export individual types for callers that need them
export type {
  RoofingConfig, HVACConfig, PlumbingConfig,
  ElectricianConfig, GCConfig, DefaultConfig,
}

// ── Minimal shared stage shape ────────────────────────────────────────────────
// Display contract only — every trade's stage must satisfy this.
// Each trade's own PipelineStage type can have additional fields.
export interface AnyPipelineStage {
  key:          string   // immutable semantic key — business logic binds to this
  label:        string   // human-readable, future: customisable per contractor
  icon:         string   // emoji or icon key — trade-specific
  color:        string   // hex — top bar accent
  bg:           string   // hex — column background
  dot:          string   // hex — mobile dot indicator
  subLabel?:    string   // brief description shown in stage picker dropdown
  nextLabel?:   string   // CTA label: "Schedule Inspection", "Run Inspection"
  terminal?:    boolean  // lost / unqualified — hidden from main board
  reopenable?:  boolean  // lost can reopen; unqualified cannot
  requires?:    string   // gate key — checked by moveStage gate evaluator
}

// ── Stage anchors ─────────────────────────────────────────────────────────────
// Named semantic handles for stages that matter to business logic.
// Business logic ALWAYS reads plugin.stageAnchors.won — NEVER hardcodes 'job_won'.
// This makes the system safe for future DB-driven stage customisation.
export interface AnyStageAnchors {
  entry:    string   // initial stage when lead created — 'lead_in', 'new_call'
  won:      string   // job complete — 'job_won' for all current trades
  lost:     string   // dead lead — 'lost' for all current trades
}

// ── Shared nav shape ──────────────────────────────────────────────────────────
// DashboardShell renders trade.nav using this interface.
// Each trade defines its own nav sections — completely different per trade.
export interface AnyNavItem {
  label:        string
  href:         string
  icon:         string
  description:  string   // tooltip / onboarding hint
  badge?:       'new' | 'pro' | 'elite'
  comingSoon?:  boolean
}

export interface AnyNavSection {
  title: string
  items: AnyNavItem[]
}

// ── Shared labels ─────────────────────────────────────────────────────────────
// Every trade customises these display terms.
// DashboardShell, pipeline page, estimates page read plugin.labels — no tradeTerm() calls.
export interface AnyTradeLabels {
  pipeline:         string   // "Jobs" | "Pipeline" | "Projects"
  estimate:         string   // "Proposal" | "Estimate" | "Quote"
  invoice:          string   // "Invoice" | "Bill"
  client:           string   // "Property" | "Client" | "Customer"
  clients:          string   // plural — "Properties" | "Clients"
  newButton:        string   // "New Job" | "New Call" | "New Lead"
  wonStage:         string   // "Job Won" | "Completed" | "Closed Won"
  scopePlaceholder?: string  // Add Lead modal scope field placeholder — trade-specific
}
