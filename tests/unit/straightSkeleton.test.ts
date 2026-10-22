// Straight-skeleton roof-line geometry. Vitest.
// Validates the ProMeasure pre-draw engine against the four canonical orthogonal
// footprint classes the spec (§4) scopes: rectangle, L, T, cross.
import { describe, it, expect } from 'vitest';
import { buildSkeleton, isOrthogonal, totalLength, type Pt } from '@/lib/roofing/straightSkeleton';

const RECT: Pt[]  = [[0, 0], [40, 0], [40, 24], [0, 24]];
const SQUARE: Pt[] = [[0, 0], [24, 0], [24, 24], [0, 24]];
const L: Pt[]     = [[0, 0], [40, 0], [40, 20], [20, 20], [20, 40], [0, 40]];
const T: Pt[]     = [[0, 0], [60, 0], [60, 20], [40, 20], [40, 50], [20, 50], [20, 20], [0, 20]];
const CROSS: Pt[] = [[22, 0], [44, 0], [44, 22], [66, 22], [66, 44], [44, 44], [44, 66], [22, 66], [22, 44], [0, 44], [0, 22], [22, 22]];

// 45° run lengths for the differing insets of each polygon (half-width of the span
// the wavefront collapses): RECT insets 12, L/T inset 10, CROSS inset 11.
const H12 = Math.hypot(12, 12); // 16.9706
const H10 = Math.hypot(10, 10); // 14.1421
const H11 = Math.hypot(11, 11); // 15.5563

describe('isOrthogonal', () => {
  it('accepts rectangle, L, T, cross (right angles)', () => {
    for (const p of [RECT, SQUARE, L, T, CROSS]) expect(isOrthogonal(p)).toBe(true);
  });
  it('rejects a triangle', () => {
    expect(isOrthogonal([[0, 0], [10, 0], [5, 8]])).toBe(false);
  });
  it('rejects a skewed (non-right-angle) quad beyond tolerance', () => {
    expect(isOrthogonal([[0, 0], [10, 0], [13, 8], [3, 8]])).toBe(false);
  });
  it('honors tolerance — a corner 4° off 90° still passes at 5°', () => {
    // near-rectangle with slightly skewed top edge
    expect(isOrthogonal([[0, 0], [40, 0], [41.4, 24], [1.4, 24]], 5)).toBe(true);
    expect(isOrthogonal([[0, 0], [40, 0], [41.4, 24], [1.4, 24]], 2)).toBe(false);
  });
});

describe('buildSkeleton — rectangle', () => {
  const arcs = buildSkeleton(RECT);
  it('produces 4 hips + 1 ridge, no valleys', () => {
    expect(arcs.filter(a => a.kind === 'hip')).toHaveLength(4);
    expect(arcs.filter(a => a.kind === 'ridge')).toHaveLength(1);
    expect(arcs.filter(a => a.kind === 'valley')).toHaveLength(0);
  });
  it('ridge spans the long centerline (16 ft)', () => {
    expect(totalLength(arcs, 'ridge')).toBeCloseTo(16, 3);
  });
  it('four 45° hips total 4 × 12√2', () => {
    expect(totalLength(arcs, 'hip')).toBeCloseTo(4 * H12, 2);
  });
});

describe('buildSkeleton — square (pyramid hip, zero-length ridge)', () => {
  const arcs = buildSkeleton(SQUARE);
  it('is four hips meeting at the apex, no ridge', () => {
    expect(arcs.filter(a => a.kind === 'hip')).toHaveLength(4);
    expect(totalLength(arcs, 'ridge')).toBeCloseTo(0, 6);
    const apexes = new Set(arcs.map(a => `${a.end[0].toFixed(3)},${a.end[1].toFixed(3)}`));
    expect(apexes.has('12.000,12.000')).toBe(true);
  });
});

describe('buildSkeleton — L-shape (1 reflex corner → 1 valley)', () => {
  const arcs = buildSkeleton(L);
  it('emits exactly one valley from the reflex corner', () => {
    const valleys = arcs.filter(a => a.kind === 'valley');
    expect(valleys).toHaveLength(1);
    expect(totalLength(arcs, 'valley')).toBeCloseTo(H10, 2);
  });
  it('LF totals match the validated reference', () => {
    expect(totalLength(arcs, 'ridge')).toBeCloseTo(40.0, 1);
    expect(totalLength(arcs, 'hip')).toBeCloseTo(70.71, 1);
  });
});

describe('buildSkeleton — T-shape (2 reflex corners → 2 valleys)', () => {
  const arcs = buildSkeleton(T);
  it('emits two valleys', () => {
    expect(arcs.filter(a => a.kind === 'valley')).toHaveLength(2);
    expect(totalLength(arcs, 'valley')).toBeCloseTo(2 * H10, 1);
  });
  it('LF totals match the validated reference', () => {
    expect(totalLength(arcs, 'ridge')).toBeCloseTo(70.0, 1);
    expect(totalLength(arcs, 'hip')).toBeCloseTo(84.85, 1);
  });
});

describe('buildSkeleton — cross (4 reflex corners → 4 valleys to one peak)', () => {
  const arcs = buildSkeleton(CROSS);
  it('emits four valleys converging to the central node (33,33)', () => {
    const valleys = arcs.filter(a => a.kind === 'valley');
    expect(valleys).toHaveLength(4);
    for (const v of valleys) {
      expect(v.end[0]).toBeCloseTo(33, 3);
      expect(v.end[1]).toBeCloseTo(33, 3);
    }
  });
  it('LF totals match the validated reference', () => {
    expect(totalLength(arcs, 'ridge')).toBeCloseTo(88.0, 1);
    expect(totalLength(arcs, 'hip')).toBeCloseTo(8 * H11, 1);
    expect(totalLength(arcs, 'valley')).toBeCloseTo(4 * H11, 1);
  });
});

describe('determinism', () => {
  it('produces byte-identical output across repeated runs', () => {
    const a = JSON.stringify(buildSkeleton(CROSS));
    const b = JSON.stringify(buildSkeleton(CROSS));
    expect(a).toBe(b);
  });
});
