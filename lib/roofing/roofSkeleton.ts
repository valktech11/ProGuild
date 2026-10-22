/**
 * Geo wrapper around the planar straight-skeleton engine (straightSkeleton.ts).
 *
 * ProMeasure's outline is a lat/lng polygon on a Google Map; the skeleton math is planar.
 * This projects the outline to a local equirectangular frame in FEET (accurate to <0.01%
 * at building scale), runs the skeleton, and projects the result back to lat/lng — returning
 * lines in ProMeasure's existing LineRec shape, tagged `source: 'skeleton'`, `user_adjusted:false`.
 *
 * Pitch is intentionally NOT an input: under uniform pitch the plan-view skeleton is
 * pitch-independent, and the manual line tool already reports PLAN-view LF for hips/valleys
 * (spherical.computeDistanceBetween × 3.28084, no slope factor), so the pre-draw matches
 * parity without it. Non-orthogonal footprints return { orthogonal:false, lines:[] } so the
 * caller falls back to today's unchanged blank-canvas flow (spec §4).
 *
 * §25.6: nothing here is authoritative. Output is a starting layer only — not written to
 * roofing_job_data until the roofer saves the (possibly corrected) line layer.
 */
import { buildSkeleton, isOrthogonal, type Pt, type ArcKind } from './straightSkeleton';

export interface LatLng { lat: number; lng: number }
export interface SkeletonLine {
  type: ArcKind;
  lf: number;
  latlngs: [LatLng, LatLng];
  user_adjusted: false;
  source: 'skeleton';
}
export interface RoofSkeletonResult {
  orthogonal: boolean;
  lines: SkeletonLine[];
  /** plan-view LF totals per kind (feet) — convenience for callers/telemetry */
  totals: { ridge: number; hip: number; valley: number };
}

const FEET_PER_METER = 3.28084;
const M_PER_DEG_LAT = 111320;

/**
 * Compute the pre-draw roof-line skeleton for a building-outline polygon.
 * @param outline  building footprint as lat/lng vertices (ring order either way)
 * @param opts.toleranceDeg  orthogonality tolerance; corners within this of 90° (default 5°)
 */
export function computeRoofSkeleton(
  outline: LatLng[],
  opts: { toleranceDeg?: number } = {}
): RoofSkeletonResult {
  const empty: RoofSkeletonResult = { orthogonal: false, lines: [], totals: { ridge: 0, hip: 0, valley: 0 } };
  if (!Array.isArray(outline) || outline.length < 4) return empty;
  for (const p of outline) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return empty;
  }

  // Local equirectangular projection to FEET about the outline centroid.
  const lat0 = outline.reduce((s, p) => s + p.lat, 0) / outline.length;
  const lng0 = outline.reduce((s, p) => s + p.lng, 0) / outline.length;
  const ftPerDegLat = M_PER_DEG_LAT * FEET_PER_METER;
  const ftPerDegLng = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180) * FEET_PER_METER;

  const toPlanar = (p: LatLng): Pt => [(p.lng - lng0) * ftPerDegLng, (p.lat - lat0) * ftPerDegLat];
  const toGeo = (pt: Pt): LatLng => ({ lat: lat0 + pt[1] / ftPerDegLat, lng: lng0 + pt[0] / ftPerDegLng });

  const planar = outline.map(toPlanar);

  const toleranceDeg = opts.toleranceDeg ?? 5;
  if (!isOrthogonal(planar, toleranceDeg)) return { ...empty, orthogonal: false };

  const arcs = buildSkeleton(planar);
  const totals = { ridge: 0, hip: 0, valley: 0 };
  const lines: SkeletonLine[] = arcs.map(a => {
    const lf = Math.hypot(a.end[0] - a.start[0], a.end[1] - a.start[1]); // plan-view feet
    totals[a.kind] += lf;
    return {
      type: a.kind,
      lf: Math.round(lf),
      latlngs: [toGeo(a.start), toGeo(a.end)] as [LatLng, LatLng],
      user_adjusted: false as const,
      source: 'skeleton' as const,
    };
  });

  return {
    orthogonal: true,
    lines,
    totals: {
      ridge: +totals.ridge.toFixed(1),
      hip: +totals.hip.toFixed(1),
      valley: +totals.valley.toFixed(1),
    },
  };
}
