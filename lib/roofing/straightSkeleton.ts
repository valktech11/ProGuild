/**
 * Straight-skeleton (wavefront) — deterministic roof-line geometry for ProMeasure pre-draw.
 *
 * Given a building-footprint polygon, computes the ridge / hip / valley layout as a pure
 * geometric construction (Felkel/Obdrzalek wavefront: edge events + split events). No AI,
 * no image, no elevation — same polygon in, identical lines out, every run, any hardware.
 *
 * Scope (per spec §4): exact for ORTHOGONAL footprints (right angles — rectangle, L, T,
 * cross), which covers most FL residential hip/gable roofs. Non-orthogonal footprints are
 * rejected by `isOrthogonal` upstream so the caller falls back to today's blank canvas.
 *
 * Operates in a planar metric (feet). The geo projection wrapper lives in roofSkeleton.ts.
 * Validated against the four canonical footprints in tests/unit/straightSkeleton.test.ts.
 */

export type Pt = [number, number];
export type ArcKind = 'ridge' | 'hip' | 'valley';
export interface Arc { start: Pt; end: Pt; kind: ArcKind }

const EPS = 1e-6;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt): number => a[0] * b[1] - a[1] * b[0];
const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
function normalize(a: Pt): Pt {
  const m = Math.hypot(a[0], a[1]);
  return m > 1e-12 ? [a[0] / m, a[1] / m] : [0, 0];
}

function signedArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Supporting line of an original polygon edge, moving inward at unit speed. */
class Edge {
  p: Pt; d: Pt; n: Pt; c: number;
  constructor(p0: Pt, p1: Pt) {
    this.p = p0;
    this.d = normalize(sub(p1, p0));
    this.n = [-this.d[1], this.d[0]]; // inward normal, CCW polygon
    this.c = dot(this.n, p0);
  }
}

/** Intersection of two wavefront lines each offset inward by t. */
function wfPoint(ea: Edge, eb: Edge, t: number): Pt | null {
  const [a1, a2] = ea.n;
  const [b1, b2] = eb.n;
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return null;
  const ca = ea.c + t, cb = eb.c + t;
  return [(ca * b2 - cb * a2) / det, (a1 * cb - b1 * ca) / det];
}

class V {
  pos: Pt; ea: Edge; eb: Edge; birth: number; isCorner: boolean;
  alive = true; start: Pt; reflex: boolean;
  prev!: V; next!: V;
  constructor(pos: Pt, ea: Edge, eb: Edge, birth: number, isCorner: boolean) {
    this.pos = pos; this.ea = ea; this.eb = eb; this.birth = birth;
    this.isCorner = isCorner; this.start = pos;
    this.reflex = cross(ea.d, eb.d) < -EPS;
  }
}

/** Linear trajectory P0 + t*Dir of the wavefront vertex of edges (ea,eb). */
function traj(ea: Edge, eb: Edge, anchor: Pt): [Pt, Pt] {
  const p0 = wfPoint(ea, eb, 0.0);
  const p1 = wfPoint(ea, eb, 1.0);
  if (!p0 || !p1) return [anchor, [0, 0]];
  return [p0, sub(p1, p0)];
}

interface Evt { t: number; pri: number; seq: number; fire: () => void }

/**
 * Detect whether a polygon's corners are all near 90° (right angles) within tolerance.
 * Orthogonal polygons are the class the straight skeleton is exact for.
 */
export function isOrthogonal(poly: Pt[], toleranceDeg = 5): boolean {
  const n = poly.length;
  if (n < 4) return false;
  const tol = (toleranceDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
    const d1 = normalize(sub(b, a));
    const d2 = normalize(sub(c, b));
    // turn angle between consecutive edges; orthogonal corners turn ±90°
    const ang = Math.abs(Math.atan2(cross(d1, d2), dot(d1, d2)));
    if (Math.abs(ang - Math.PI / 2) > tol) return false;
  }
  return true;
}

/**
 * Build the straight skeleton of `poly` and classify each arc ridge / hip / valley.
 * Returns the skeleton as a flat list of arcs in the same planar metric as the input.
 */
export function buildSkeleton(inputPoly: Pt[]): Arc[] {
  let poly: Pt[] = inputPoly.map(([x, y]) => [x, y] as Pt);
  if (signedArea(poly) < 0) poly = poly.slice().reverse();
  const n = poly.length;
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) edges.push(new Edge(poly[i], poly[(i + 1) % n]));

  const verts: V[] = [];
  for (let i = 0; i < n; i++) {
    const ea = edges[(i - 1 + n) % n], eb = edges[i];
    verts.push(new V(poly[i], ea, eb, 0.0, true));
  }
  for (let i = 0; i < n; i++) {
    verts[i].prev = verts[(i - 1 + n) % n];
    verts[i].next = verts[(i + 1) % n];
  }

  const arcs: Arc[] = [];
  const heap: Evt[] = [];
  let seq = 0;
  const push = (t: number, pri: number, fire: () => void) => {
    heap.push({ t, pri, seq: seq++, fire });
  };
  const popMin = (): Evt | null => {
    if (heap.length === 0) return null;
    let bi = 0;
    for (let i = 1; i < heap.length; i++) {
      const a = heap[i], b = heap[bi];
      if (a.t < b.t - 1e-12 || (Math.abs(a.t - b.t) <= 1e-12 && (a.pri < b.pri || (a.pri === b.pri && a.seq < b.seq)))) bi = i;
    }
    return heap.splice(bi, 1)[0];
  };

  const emit = (v: V, node: Pt) => {
    if (dist(v.start, node) < 1e-7) return;
    let kind: ArcKind;
    if (v.isCorner) kind = v.reflex ? 'valley' : 'hip';
    else kind = 'ridge';
    arcs.push({ start: v.start, end: node, kind });
  };

  const edgeEvent = (a: V, b: V) => {
    // a.next===b, sharing wavefront edge a.eb===b.ea. Time when that edge collapses.
    const [pa0, da] = traj(a.ea, a.eb, a.pos);
    const [pb0, db] = traj(b.ea, b.eb, b.pos);
    const dP = sub(pa0, pb0), dD = sub(da, db);
    const k = Math.abs(dD[0]) >= Math.abs(dD[1]) ? 0 : 1;
    if (Math.abs(dD[k]) < 1e-12) return;
    const t = -dP[k] / dD[k];
    if (t < Math.max(a.birth, b.birth) - EPS) return;
    const node = wfPoint(a.ea, a.eb, t);
    if (!node) return;
    push(t, 1, () => {
      if (!(a.alive && b.alive) || a.next !== b) return;
      if (a.prev === b) {
        // 2-gon with non-parallel edges collapsing to a point
        emit(a, node); emit(b, node);
        if (dist(a.start, b.start) > 1e-7) arcs.push({ start: a.start, end: b.start, kind: cornerKind(a, b) });
        a.alive = b.alive = false;
        return;
      }
      emit(a, node); emit(b, node);
      a.alive = b.alive = false;
      const nv = new V(node, a.ea, b.eb, t, false);
      nv.prev = a.prev; nv.next = b.next; a.prev.next = nv; b.next.prev = nv;
      schedule(nv);
    });
  };

  const cornerKind = (a: V, b: V): ArcKind => {
    for (const z of [a, b]) if (z.isCorner) return z.reflex ? 'valley' : 'hip';
    return 'ridge';
  };

  const splitEvent = (v: V) => {
    if (!v.reflex) return;
    const [p0, D] = traj(v.ea, v.eb, v.pos);
    let best: { t: number; B: Pt; e: Edge } | null = null;
    for (const e of edges) {
      if (e === v.ea || e === v.eb) continue;
      const denom = dot(e.n, D) - 1.0;
      if (Math.abs(denom) < 1e-12) continue;
      const t = (e.c - dot(e.n, p0)) / denom;
      if (t < v.birth + EPS) continue;
      const B = add(p0, mul(D, t));
      if (!best || t < best.t) best = { t, B, e };
    }
    if (!best) return;
    const { t, B, e } = best;
    push(t, 0, () => {
      if (!v.alive) return;
      // locate the alive vertex pair bounding wavefront edge e, on v's current loop
      let found: [V, V] | null = null;
      let x: V = v, steps = 0;
      do {
        if (x.eb === e && x.next.ea === e) { found = [x, x.next]; break; }
        x = x.next; steps++;
      } while (x !== v && steps < 10000);
      if (!found) return; // edge already consumed
      const [Lx, Rx] = found;
      emit(v, B);
      v.alive = false;
      const v1 = new V(B, v.ea, e, t, false);
      const v2 = new V(B, e, v.eb, t, false);
      // loop A: v.prev -> v1 -> Rx ...
      v1.prev = v.prev; v1.next = Rx; v.prev.next = v1; Rx.prev = v1;
      // loop B: Lx -> v2 -> v.next ...
      v2.prev = Lx; v2.next = v.next; Lx.next = v2; v.next.prev = v2;
      schedule(v1); schedule(v2);
    });
  };

  const closeIf2gon = (v: V): boolean => {
    if (!v.alive) return false;
    const w = v.next;
    if (w && w !== v && w.next === v && w.alive) {
      // 2-vertex loop (parallel wavefronts) = final ridge; its edge-event
      // trajectory is degenerate and never schedules, so emit directly.
      let kind: ArcKind = 'ridge';
      for (const z of [v, w]) if (z.isCorner) { kind = z.reflex ? 'valley' : 'hip'; break; }
      if (dist(v.start, w.start) > 1e-7) arcs.push({ start: v.start, end: w.start, kind });
      v.alive = w.alive = false;
      return true;
    }
    return false;
  };

  const schedule = (v: V) => {
    if (closeIf2gon(v)) return;
    if (v.next && v.alive && v.next.alive) edgeEvent(v, v.next);
    if (v.prev && v.alive && v.prev.alive) edgeEvent(v.prev, v);
    splitEvent(v);
  };

  for (const v of verts) edgeEvent(v, v.next);
  for (const v of verts) splitEvent(v);

  let guard = 0;
  while (heap.length && guard < 20000) {
    guard++;
    const ev = popMin();
    if (ev) ev.fire();
  }
  return arcs;
}

/** Sum of arc lengths of a given kind (planar metric of the input). */
export function totalLength(arcs: Arc[], kind: ArcKind): number {
  return arcs.filter(a => a.kind === kind).reduce((s, a) => s + dist(a.start, a.end), 0);
}
