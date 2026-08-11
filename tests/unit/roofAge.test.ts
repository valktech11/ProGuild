import { describe, it, expect } from 'vitest';
import { computeRoofRuleEligibility, FBC_2007_EFFECTIVE } from '@/lib/fl/roofAge';

describe('computeRoofRuleEligibility', () => {
  it('roof on/after Mar 1 2009 -> exempt', () => {
    expect(computeRoofRuleEligibility('2015-06-01').verdict).toBe('exempt');
    expect(computeRoofRuleEligibility(FBC_2007_EFFECTIVE).verdict).toBe('exempt'); // boundary inclusive
  });
  it('roof before Mar 1 2009 -> subject', () => {
    expect(computeRoofRuleEligibility('2009-02-28').verdict).toBe('subject');
    expect(computeRoofRuleEligibility('2004-01-01').verdict).toBe('subject');
  });
  it('missing or invalid date -> unknown', () => {
    expect(computeRoofRuleEligibility(null).verdict).toBe('unknown');
    expect(computeRoofRuleEligibility('').verdict).toBe('unknown');
    expect(computeRoofRuleEligibility('not-a-date').verdict).toBe('unknown');
  });
});
