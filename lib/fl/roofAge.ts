// FL 25% roof-rule eligibility (FBC-EB §706 / FL §553.844(5), SB 4-D 2022).
// Pure, framework-free, unit-tested. Informational only — NOT legal/code advice.
// The Mar 1, 2009 date is the 2007 FBC effective date and the statutory threshold.
// Date is a PROXY: actual 2007-FBC compliance must be verified by permit, not age.

export type RoofRuleVerdict = 'exempt' | 'subject' | 'unknown';

export interface RoofEligibility {
  verdict:  RoofRuleVerdict;
  headline: string;
  detail:   string;
}

// 2007 Florida Building Code effective date.
export const FBC_2007_EFFECTIVE = '2009-03-01';

/**
 * Determine which 25%-rule regime a roof falls under from its build/last-reroof date.
 * @param roofDate YYYY-MM-DD (build or last reroof permit date)
 * @returns null only when a non-empty date string is unparseable
 */
export function computeRoofRuleEligibility(roofDate?: string | null): RoofEligibility {
  if (!roofDate) {
    return {
      verdict: 'unknown',
      headline: 'Roof age unknown',
      detail: 'Pull the last reroof permit. Permitted on/after Mar 1, 2009 → SB 4-D exception likely applies (damaged portion only). Before that → the 25% rule may force full-section replacement.',
    };
  }
  const d = new Date(`${roofDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { verdict: 'unknown', headline: 'Roof age unknown', detail: 'Enter a valid roof build / last-reroof date.' };
  }
  const cutoff = new Date(`${FBC_2007_EFFECTIVE}T00:00:00Z`);
  if (d.getTime() >= cutoff.getTime()) {
    return {
      verdict: 'exempt',
      headline: 'Likely exempt — SB 4-D / §553.844(5)',
      detail: 'Built to the 2007 FBC or later: repairing >25% does NOT trigger full replacement — only the damaged portion must meet current code. Verify via permit; age alone is not proof of compliance.',
    };
  }
  return {
    verdict: 'subject',
    headline: 'Pre-2009 roof — 25% rule applies',
    detail: 'If >25% of a roof section is repaired/replaced/recovered in any 12-month period, the ENTIRE section must be brought to current code — supports a full-roof claim. Confirm the roof section and damage extent.',
  };
}

export const ROOF_RULE_DISCLAIMER =
  'Informational only — not legal/code advice. FBC-EB §706 / FL §553.844(5); compliance verified by permit, not age.';
