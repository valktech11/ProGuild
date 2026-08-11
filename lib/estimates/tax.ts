// Single source of truth for sales-tax resolution.
//
// RULE: tax follows the JOB, not the contractor's profile and never a client
// session snapshot. The job's location (the lead's contact_state) is
// authoritative. The pro's profile state is a fallback used only when the lead
// has no state on file. We never read tax from a client-passed value, because
// that snapshot can be stale/empty at create time and then freezes onto the
// estimate forever (this is exactly how EST-1048 / Keith ended up at 0% — the
// estimate was created before the FL state had propagated into the session).
//
// Resolving from the lead means a FL job is 6% at 06:54 and 6% at 08:21,
// regardless of when the pro filled in their profile.

// Base state sales tax rates (Tax Foundation 2024).
// State-level rates only — county/city additions vary.
export const STATE_TAX_RATES: Record<string, number> = {
  AL: 4.0,  AK: 0.0,  AZ: 5.6,  AR: 6.5,  CA: 7.25,
  CO: 2.9,  CT: 6.35, DE: 0.0,  FL: 6.0,  GA: 4.0,
  HI: 4.0,  ID: 6.0,  IL: 6.25, IN: 7.0,  IA: 6.0,
  KS: 6.5,  KY: 6.0,  LA: 4.45, ME: 5.5,  MD: 6.0,
  MA: 6.25, MI: 6.0,  MN: 6.875,MS: 7.0,  MO: 4.225,
  MT: 0.0,  NE: 5.5,  NV: 6.85, NH: 0.0,  NJ: 6.625,
  NM: 5.125,NY: 4.0,  NC: 4.75, ND: 5.0,  OH: 5.75,
  OK: 4.5,  OR: 0.0,  PA: 6.0,  RI: 7.0,  SC: 6.0,
  SD: 4.5,  TN: 7.0,  TX: 6.25, UT: 5.95, VT: 6.0,
  VA: 5.3,  WA: 6.5,  WV: 6.0,  WI: 5.0,  WY: 4.0,
  DC: 6.0,
}

/**
 * Resolve the sales-tax percentage (e.g. 6 for 6%) for an estimate.
 *
 * Priority: job location (leadState) → pro profile (proState) → 0.
 * A state that is a real 0%-tax state (e.g. OR, NH) correctly resolves to 0
 * because it is present in the table; only an unknown/blank state falls
 * through to the final 0.
 */
export function resolveTaxRate(
  leadState?: string | null,
  proState?: string | null,
): number {
  const lead = leadState?.trim().toUpperCase()
  if (lead && lead in STATE_TAX_RATES) return STATE_TAX_RATES[lead]

  const pro = proState?.trim().toUpperCase()
  if (pro && pro in STATE_TAX_RATES) return STATE_TAX_RATES[pro]

  return 0
}
