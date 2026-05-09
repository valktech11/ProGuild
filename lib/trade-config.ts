/**
 * lib/trade-config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for trade-specific CRM behaviour.
 *
 * RULES:
 *  1. Never import this from API routes — server-only modules will get bundled.
 *     Use only in client components and lib/trade-resolver.ts.
 *  2. To add a trade: add a TradeKey, add a TradeConfig entry, add DB slug
 *     mappings in TRADE_SLUG_MAP inside lib/trade-resolver.ts.
 *  3. To ship a soon feature: remove `soon: true` from its NavItemDef.
 *  4. Icon keys reference the `icon` object in DashboardShell.tsx.
 *     If a trade tool needs a new icon, add it there and add the key here.
 */

// ─── Canonical trade identifiers ──────────────────────────────────────────────
// These are internal keys — decoupled from DB slugs, stable across renames.
export type TradeKey =
  | 'roofing'
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'painting'
  | 'pool_spa'
  | 'drywall'
  | 'solar'
  | 'carpentry'
  | 'general_contractor'
  | 'general'  // fallback — all unrecognised trades

// ─── Feature flags ────────────────────────────────────────────────────────────
// Add a new feature here when you build it. Gate UI with hasFeature().
export type TradeFeature =
  // HVAC
  | 'equipment_records'
  | 'refrigerant_log'
  | 'maintenance_reminders'
  // Roofing
  | 'material_takeoffs'
  | 'warranty_tracking'
  | 'storm_workflow'
  // Shared field tools
  | 'permit_tracker'
  | 'inspection_log'
  | 'photo_progress'
  | 'blueprint_vault'
  // Pool & Spa
  | 'chemical_log'
  | 'route_planner'
  | 'membership_billing'
  // GC
  | 'change_orders'
  | 'subcontractor_mgmt'
  | 'draw_schedule'
  // Solar
  | 'system_design_vault'
  | 'utility_interconnect'
  | 'savings_estimator'
  | 'incentive_tracker'

// ─── Nav item definition ──────────────────────────────────────────────────────
// iconKey must be a key in the `icon` object in DashboardShell.tsx.
export type NavItemDef = {
  label: string
  href: string
  iconKey: string          // keyof typeof icon in DashboardShell
  soon?: true              // omit entirely when the feature ships
  feature?: TradeFeature   // future: hide if feature not enabled. not used yet.
}

export type NavSectionDef = {
  title: string            // ALL CAPS section heading in sidebar
  items: NavItemDef[]
}

// ─── Terminology ──────────────────────────────────────────────────────────────
// Only override words that are genuinely wrong for the trade.
// Undefined = use the ProGuild default.
export type TradeTerms = {
  // Sidebar + page h1
  overview?: string        // default: 'Overview'
  pipeline?: string        // default: 'Pipeline'
  clients?: string         // default: 'Clients'
  estimates?: string       // default: 'Estimates'
  // Used in empty states, CTAs, action buttons
  jobNoun?: string         // default: 'lead' → "Add a lead", "No leads yet"
  jobNounPlural?: string   // default: 'leads'
  jobWon?: string          // default: 'Job Won' (pipeline Paid stage label)
}

// ─── Full trade configuration ─────────────────────────────────────────────────
export type TradeConfig = {
  key: TradeKey
  displayName: string           // shown in sidebar under pro name
  features: ReadonlySet<TradeFeature>
  terms: TradeTerms
  // Extra nav sections injected between MONEY and MY BUSINESS.
  // Keep to 1 section per trade — sidebar real estate is limited.
  tradeSection?: NavSectionDef
}

// ─── Trade configs ────────────────────────────────────────────────────────────

const ROOFING: TradeConfig = {
  key: 'roofing',
  displayName: 'Roofing Contractor',
  features: new Set<TradeFeature>([
    'material_takeoffs',
    'warranty_tracking',
    'storm_workflow',
    'permit_tracker',
    'photo_progress',
  ]),
  terms: {
    pipeline:      'Jobs',
    jobNoun:       'job',
    jobNounPlural: 'jobs',
    jobWon:        'Signed',
    estimates:     'Proposals',
  },
  tradeSection: {
    title: 'ROOFING TOOLS',
    items: [
      { label: 'Properties',     href: '/dashboard/roofing/property',    iconKey: 'overview'   },
      { label: 'ProMeasure',     href: '/dashboard/roofing/promeasure',  iconKey: 'measure'   },
      { label: 'Calculator',     href: '/dashboard/roofing/calculator',  iconKey: 'revenue'    },
      { label: 'Warranties',     href: '/dashboard/roofing/warranties',  iconKey: 'compliance', soon: true },
      { label: 'Storm workflow', href: '/dashboard/roofing/storm',       iconKey: 'ai',         soon: true },
    ],
  },
}

const HVAC: TradeConfig = {
  key: 'hvac',
  displayName: 'HVAC Technician',
  features: new Set<TradeFeature>([
    'equipment_records',
    'refrigerant_log',
    'maintenance_reminders',
    'permit_tracker',
  ]),
  terms: {
    overview:      'Dashboard',
    pipeline:      'Jobs',
    clients:       'Customers',
    jobNoun:       'job',
    jobNounPlural: 'jobs',
  },
  tradeSection: {
    title: 'MY EQUIPMENT',
    items: [
      { label: 'Refrigerant log', href: '/dashboard/hvac/refrigerant',  iconKey: 'compliance' },
      { label: 'Memberships',     href: '/dashboard/hvac/memberships',  iconKey: 'deals',     soon: true },
    ],
  },
}

const PLUMBING: TradeConfig = {
  key: 'plumbing',
  displayName: 'Plumbing Contractor',
  features: new Set<TradeFeature>([
    'permit_tracker',
    'inspection_log',
    'photo_progress',
  ]),
  terms: {
    pipeline:      'Jobs',
    jobNoun:       'job',
    jobNounPlural: 'jobs',
  },
  tradeSection: {
    title: 'PLUMBING TOOLS',
    items: [
      { label: 'Permit tracker',  href: '/dashboard/plumbing/permits',    iconKey: 'permit',   soon: true },
      { label: 'Inspection log',  href: '/dashboard/plumbing/inspections', iconKey: 'compliance', soon: true },
    ],
  },
}

const ELECTRICAL: TradeConfig = {
  key: 'electrical',
  displayName: 'Electrical Contractor',
  features: new Set<TradeFeature>([
    'permit_tracker',
    'inspection_log',
    'photo_progress',
  ]),
  terms: {
    pipeline:      'Jobs',
    jobNoun:       'job',
    jobNounPlural: 'jobs',
  },
  tradeSection: {
    title: 'ELECTRICAL TOOLS',
    items: [
      { label: 'Permit tracker',  href: '/dashboard/electrical/permits',    iconKey: 'permit',     soon: true },
      { label: 'Inspection log',  href: '/dashboard/electrical/inspections', iconKey: 'compliance', soon: true },
    ],
  },
}

const PAINTING: TradeConfig = {
  key: 'painting',
  displayName: 'Painting Contractor',
  features: new Set<TradeFeature>([
    'photo_progress',
  ]),
  terms: {
    // No overrides — "Pipeline", "Clients", "Estimates" all work for painters
    jobNoun:       'job',
    jobNounPlural: 'jobs',
  },
  tradeSection: {
    title: 'PAINTING TOOLS',
    items: [
      { label: 'Color vault',    href: '/dashboard/painting/colors',   iconKey: 'photos',  soon: true },
      { label: 'Photo progress', href: '/dashboard/painting/photos',   iconKey: 'photos',  soon: true },
    ],
  },
}

const POOL_SPA: TradeConfig = {
  key: 'pool_spa',
  displayName: 'Pool & Spa Contractor',
  features: new Set<TradeFeature>([
    'chemical_log',
    'equipment_records',
    'route_planner',
    'membership_billing',
  ]),
  terms: {
    pipeline:      'Route',
    clients:       'Properties',
    jobNoun:       'account',
    jobNounPlural: 'accounts',
  },
  tradeSection: {
    title: 'POOL TOOLS',
    items: [
      { label: 'Chemical log',   href: '/dashboard/pool/chemical',    iconKey: 'compliance', soon: true },
      { label: 'Route planner',  href: '/dashboard/pool/route',       iconKey: 'materials',  soon: true },
      { label: 'Memberships',    href: '/dashboard/pool/memberships', iconKey: 'deals',      soon: true },
    ],
  },
}

const DRYWALL: TradeConfig = {
  key: 'drywall',
  displayName: 'Drywall & Plastering',
  features: new Set<TradeFeature>([
    'photo_progress',
    'blueprint_vault',
  ]),
  terms: {
    jobNoun:       'job',
    jobNounPlural: 'jobs',
  },
  tradeSection: {
    title: 'DRYWALL TOOLS',
    items: [
      { label: 'Material list',  href: '/dashboard/drywall/materials', iconKey: 'materials', soon: true },
      { label: 'Photo progress', href: '/dashboard/drywall/photos',    iconKey: 'photos',    soon: true },
    ],
  },
}

const SOLAR: TradeConfig = {
  key: 'solar',
  displayName: 'Solar Installer',
  features: new Set<TradeFeature>([
    'system_design_vault',
    'permit_tracker',
    'utility_interconnect',
    'savings_estimator',
    'incentive_tracker',
  ]),
  terms: {
    pipeline:      'Projects',
    estimates:     'Proposals',
    jobNoun:       'project',
    jobNounPlural: 'projects',
    jobWon:        'Contracted',
  },
  tradeSection: {
    title: 'SOLAR TOOLS',
    items: [
      { label: 'System designs',   href: '/dashboard/solar/designs',     iconKey: 'ai',         soon: true },
      { label: 'Permit tracker',   href: '/dashboard/solar/permits',     iconKey: 'permit',     soon: true },
      { label: 'Utility connect',  href: '/dashboard/solar/utility',     iconKey: 'compliance', soon: true },
      { label: 'Incentive tracker',href: '/dashboard/solar/incentives',  iconKey: 'revenue',    soon: true },
    ],
  },
}

const CARPENTRY: TradeConfig = {
  key: 'carpentry',
  displayName: 'Carpenter',
  features: new Set<TradeFeature>([
    'material_takeoffs',
    'photo_progress',
    'blueprint_vault',
  ]),
  terms: {
    jobNoun:       'job',
    jobNounPlural: 'jobs',
  },
  tradeSection: {
    title: 'CARPENTRY TOOLS',
    items: [
      { label: 'Material list',    href: '/dashboard/carpentry/materials',  iconKey: 'materials', soon: true },
      { label: 'Blueprint vault',  href: '/dashboard/carpentry/blueprints', iconKey: 'photos',    soon: true },
    ],
  },
}

const GENERAL_CONTRACTOR: TradeConfig = {
  key: 'general_contractor',
  displayName: 'General Contractor',
  features: new Set<TradeFeature>([
    'change_orders',
    'subcontractor_mgmt',
    'draw_schedule',
    'permit_tracker',
    'photo_progress',
    'blueprint_vault',
  ]),
  terms: {
    pipeline:      'Projects',
    clients:       'Owners',
    estimates:     'Proposals',
    jobNoun:       'project',
    jobNounPlural: 'projects',
    jobWon:        'Signed',
  },
  tradeSection: {
    title: 'GC TOOLS',
    items: [
      { label: 'Change orders',   href: '/dashboard/gc/change-orders',   iconKey: 'estimates',  soon: true },
      { label: 'Subcontractors',  href: '/dashboard/gc/subcontractors',  iconKey: 'clients',    soon: true },
      { label: 'Permits',         href: '/dashboard/gc/permits',         iconKey: 'permit',     soon: true },
      { label: 'Blueprint vault', href: '/dashboard/gc/blueprints',      iconKey: 'photos',     soon: true },
    ],
  },
}

// Fallback — any trade not explicitly configured
const GENERAL: TradeConfig = {
  key: 'general',
  displayName: '',
  features: new Set<TradeFeature>([]),
  terms: {},
  tradeSection: undefined,
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// All configs by TradeKey. Used by trade-resolver.ts.
export const TRADE_CONFIGS: Record<TradeKey, TradeConfig> = {
  roofing:            ROOFING,
  hvac:               HVAC,
  plumbing:           PLUMBING,
  electrical:         ELECTRICAL,
  painting:           PAINTING,
  pool_spa:           POOL_SPA,
  drywall:            DRYWALL,
  solar:              SOLAR,
  carpentry:          CARPENTRY,
  general_contractor: GENERAL_CONTRACTOR,
  general:            GENERAL,
}
