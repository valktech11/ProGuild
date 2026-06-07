// Unit tests for FL Supplement Assistant logic. Vitest.
import { describe, it, expect } from 'vitest';
import {
  buildSupplementPrompt,
  buildItemsPrompt,
  buildLetterPrompt,
  parseSupplementResponse,
  FL_SUPPLEMENT_CHECKLIST,
} from '@/lib/fl/supplement';

describe('FL_SUPPLEMENT_CHECKLIST', () => {
  it('covers the core FL re-roof items', () => {
    const keys = FL_SUPPLEMENT_CHECKLIST.map(c => c.key);
    expect(keys).toContain('drip_edge');
    expect(keys).toContain('permit');
    expect(keys).toContain('oh_profit');
    expect(keys).toContain('code_upgrade');
  });
  it('every item cites a code/standard and a why', () => {
    for (const c of FL_SUPPLEMENT_CHECKLIST) {
      expect(c.code.length).toBeGreaterThan(0);
      expect(c.why.length).toBeGreaterThan(10);
    }
  });
});

describe('buildSupplementPrompt', () => {
  it('embeds the pasted scope verbatim', () => {
    const p = buildSupplementPrompt({ scopeText: 'Remove and replace shingles, 22 sq.' });
    expect(p).toContain('Remove and replace shingles, 22 sq.');
  });
  it('uses adjuster name in the salutation when provided', () => {
    const p = buildLetterPrompt({ scopeText: 'x', adjusterName: 'Michael Torres' }, []);
    expect(p).toContain('Dear Michael Torres');
  });
  it('falls back to generic salutation without a name', () => {
    const p = buildLetterPrompt({ scopeText: 'x' }, []);
    expect(p).toContain('Dear Insurance Adjuster');
  });
  it('includes provided claim context', () => {
    const p = buildSupplementPrompt({
      scopeText: 'x', claimNumber: 'CIT-2025-00447', roofSquares: 24.5,
    });
    expect(p).toContain('CIT-2025-00447');
    expect(p).toContain('24.5 squares');
  });
  it('handles missing context gracefully', () => {
    const p = buildItemsPrompt({ scopeText: 'x' });
    expect(p).toContain('(none)');
  });
});

describe('parseSupplementResponse', () => {
  const good = JSON.stringify({
    missing_items: [
      { item: 'Drip edge', reason: 'Missing from scope', fl_code: 'FBC §1507.2.8.3', suggested_quantity: '210 LF', suggested_unit_price: 2.5, suggested_total: 525 },
    ],
    underpaid_items: [
      { item: 'Ridge cap', reason: 'Underpriced', fl_code: 'Mfr. spec', suggested_quantity: '28 LF', suggested_unit_price: 5, suggested_total: 140 },
    ],
    total_supplement_estimate: 665,
    supplement_letter: 'Dear Michael Torres, ...',
  });

  it('parses a clean JSON response', () => {
    const r = parseSupplementResponse(good);
    expect(r.missing_items).toHaveLength(1);
    expect(r.underpaid_items).toHaveLength(1);
    expect(r.supplement_letter).toContain('Dear Michael Torres');
  });

  it('recomputes total from items (ignores a wrong model total)', () => {
    const wrongTotal = JSON.stringify({
      missing_items: [{ item: 'Drip edge', reason: 'x', fl_code: 'y', suggested_quantity: '210 LF', suggested_unit_price: 2.5, suggested_total: 525 }],
      underpaid_items: [],
      total_supplement_estimate: 99999, // wrong on purpose
      supplement_letter: 'x',
    });
    expect(parseSupplementResponse(wrongTotal).total_supplement_estimate).toBe(525);
  });

  it('strips markdown fences', () => {
    const fenced = '```json\n' + good + '\n```';
    expect(parseSupplementResponse(fenced).missing_items).toHaveLength(1);
  });

  it('handles preamble text around the JSON', () => {
    const withPreamble = 'Here is the analysis:\n' + good + '\nThanks.';
    expect(parseSupplementResponse(withPreamble).underpaid_items).toHaveLength(1);
  });

  it('drops items with no item name', () => {
    const partial = JSON.stringify({
      missing_items: [{ item: '', reason: 'x', fl_code: 'y', suggested_quantity: '', suggested_unit_price: 0, suggested_total: 0 }],
      underpaid_items: [],
      total_supplement_estimate: 0,
      supplement_letter: 'x',
    });
    expect(parseSupplementResponse(partial).missing_items).toHaveLength(0);
  });

  it('coerces string prices to numbers', () => {
    const strPrices = JSON.stringify({
      missing_items: [{ item: 'Permit', reason: 'x', fl_code: 'y', suggested_quantity: '1', suggested_unit_price: '$350', suggested_total: '$350' }],
      underpaid_items: [],
      total_supplement_estimate: 0,
      supplement_letter: 'x',
    });
    const r = parseSupplementResponse(strPrices);
    expect(r.missing_items[0].suggested_total).toBe(350);
    expect(r.total_supplement_estimate).toBe(350);
  });

  it('throws on empty input', () => {
    expect(() => parseSupplementResponse('')).toThrow();
  });

  it('throws when no JSON object present', () => {
    expect(() => parseSupplementResponse('no json here')).toThrow();
  });

  it('returns empty arrays for a thorough scope (no items)', () => {
    const none = JSON.stringify({
      missing_items: [], underpaid_items: [],
      total_supplement_estimate: 0, supplement_letter: 'Scope appears complete.',
    });
    const r = parseSupplementResponse(none);
    expect(r.missing_items).toHaveLength(0);
    expect(r.total_supplement_estimate).toBe(0);
  });
});
