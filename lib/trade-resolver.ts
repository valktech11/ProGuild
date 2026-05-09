/**
 * lib/trade-resolver.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Maps raw DB values (trade_categories.slug, trade_categories.category_name)
 * to a canonical TradeConfig.
 *
 * RULES:
 *  1. Prefer trade_slug (DB slug) over trade (category_name) — slugs are
 *     controlled, category names can have typos or vary by region.
 *  2. All matching is case-insensitive and trimmed.
 *  3. To support a new DB entry: add its slug and/or name to the maps below.
 *     Never touch DashboardShell or any page component.
 *  4. resolveTradeConfig() is pure and fast — safe to call on every render.
 */

import { TRADE_CONFIGS, TradeConfig, TradeFeature, TradeKey } from './trade-config'

// ─── DB slug → TradeKey ───────────────────────────────────────────────────────
// Keyed by trade_categories.slug from Supabase.
// This is the primary lookup path when trade_slug is available in session.
const SLUG_TO_KEY: Record<string, TradeKey> = {
  // Roofing variants
  'roofing':                    'roofing',
  'roofing-contractor':         'roofing',
  'roofer':                     'roofing',

  // HVAC variants
  'hvac':                       'hvac',
  'hvac-technician':            'hvac',
  'hvac-contractor':            'hvac',
  'air-conditioning':           'hvac',
  'air-conditioning-contractor':'hvac',
  'refrigeration':              'hvac',

  // Plumbing
  'plumber':                    'plumbing',
  'plumbing':                   'plumbing',
  'plumbing-contractor':        'plumbing',

  // Electrical
  'electrician':                'electrical',
  'electrical':                 'electrical',
  'electrical-contractor':      'electrical',

  // Painting
  'painter':                    'painting',
  'painting':                   'painting',
  'painting-contractor':        'painting',

  // Pool & Spa
  'pool-spa':                   'pool_spa',
  'pool-and-spa':               'pool_spa',
  'pool-contractor':            'pool_spa',
  'swimming-pool':              'pool_spa',

  // Drywall
  'drywall':                    'drywall',
  'drywall-plastering':         'drywall',
  'drywall-and-plastering':     'drywall',
  'plastering':                 'drywall',

  // Solar
  'solar':                      'solar',
  'solar-installer':            'solar',
  'solar-contractor':           'solar',

  // Carpentry
  'carpenter':                  'carpentry',
  'carpentry':                  'carpentry',
  'cabinet-maker':              'carpentry',
  'finish-carpenter':           'carpentry',

  // General Contractor
  'general-contractor':         'general_contractor',
  'general-contracting':        'general_contractor',
  'gc':                         'general_contractor',
}

// ─── category_name → TradeKey ────────────────────────────────────────────────
// Fallback when trade_slug is null (e.g. new sign-up before slug is set).
// Keyed by trade_categories.category_name, lowercased.
const NAME_TO_KEY: Record<string, TradeKey> = {
  'roofing contractor':         'roofing',
  'roofing':                    'roofing',
  'roofer':                     'roofing',

  'hvac technician':            'hvac',
  'hvac':                       'hvac',
  'air conditioning contractor':'hvac',
  'refrigeration':              'hvac',

  'plumber':                    'plumbing',
  'plumbing contractor':        'plumbing',
  'plumbing':                   'plumbing',

  'electrician':                'electrical',
  'electrical contractor':      'electrical',

  'painter':                    'painting',
  'painting contractor':        'painting',

  'pool & spa':                 'pool_spa',
  'pool and spa':               'pool_spa',
  'pool & spa contractor':      'pool_spa',
  'pool contractor':            'pool_spa',

  'drywall & plastering':       'drywall',
  'drywall and plastering':     'drywall',
  'drywall':                    'drywall',
  'plastering':                 'drywall',

  'solar installer':            'solar',
  'solar contractor':           'solar',
  'solar':                      'solar',

  'carpenter':                  'carpentry',
  'carpentry':                  'carpentry',

  'general contractor':         'general_contractor',
}

// ─── Core resolver ────────────────────────────────────────────────────────────

function toKey(tradeSlug: string | null | undefined, tradeName: string | null | undefined): TradeKey {
  if (tradeSlug) {
    const k = SLUG_TO_KEY[tradeSlug.toLowerCase().trim()]
    if (k) return k
  }
  if (tradeName) {
    const k = NAME_TO_KEY[tradeName.toLowerCase().trim()]
    if (k) return k
  }
  return 'general'
}

/**
 * Returns the TradeConfig for a pro given their trade_slug and/or trade name.
 * Prefers trade_slug. Falls back to trade name. Falls back to 'general'.
 *
 * Call with session values:
 *   resolveTradeConfig(session.trade_slug, session.trade)
 */
export function resolveTradeConfig(
  tradeSlug: string | null | undefined,
  tradeName: string | null | undefined,
): TradeConfig {
  return TRADE_CONFIGS[toKey(tradeSlug, tradeName)]
}

/**
 * Returns true if the trade has a specific feature enabled.
 * Use this to gate trade-specific UI anywhere in the app.
 *
 * Example:
 *   hasFeature(session.trade_slug, session.trade, 'equipment_records')
 */
export function hasFeature(
  tradeSlug: string | null | undefined,
  tradeName: string | null | undefined,
  feature: TradeFeature,
): boolean {
  return resolveTradeConfig(tradeSlug, tradeName).features.has(feature)
}

/**
 * Returns the trade-specific term for a UI label, falling back to the default.
 *
 * Example:
 *   tradeTerm(session.trade_slug, session.trade, 'pipeline', 'Pipeline')
 *   // → "Jobs" for roofers, "Projects" for GCs, "Pipeline" for everyone else
 */
export function tradeTerm(
  tradeSlug: string | null | undefined,
  tradeName: string | null | undefined,
  key: keyof TradeConfig['terms'],
  fallback: string,
): string {
  return resolveTradeConfig(tradeSlug, tradeName).terms[key] ?? fallback
}
