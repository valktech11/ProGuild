// CIELAB recolour maths for the roof visualizer classical engine.
//
// PURE MODULE — no sharp, no next, no I/O. This is deliberate: scripts/visualizer-regression.mjs
// imports these functions directly rather than reimplementing the arithmetic inline. The old
// harness re-derived the additive-RGB formula by hand, which meant route.ts could drift from the
// test and both would stay green. Anything numeric lives here or it is not covered.
//
// WHY LAB AT ALL — the previous engine was additive in gamma-encoded sRGB:
//     out[ch] = chip[ch] + (lum - roofMeanLum) * K
// Adding the same offset to all three channels holds (max-min) chroma constant in code values,
// but perceptual chroma RISES as lightness falls, so shadows came back over-saturated. At the
// extremes the per-channel clamp to [0,255] hits one channel before the others and shifts hue —
// highlights on saturated chips skewed cyan, deep shadows skewed toward whichever channel
// survived. Working in L*a*b* fixes both: shading rides on L* alone, chroma is set explicitly,
// and out-of-gamut results are resolved by reducing chroma at constant hue instead of clipping.

// ── Tuning constants ─────────────────────────────────────────────────────────

/** Base shading contrast. Matches the legacy additive engine so short-travel recolours
 *  (dark chip on an already-dark roof) render as they did before. */
export const K_BASE = 0.55

/** Ceiling for adaptive K. 1.0 = source L* contrast reproduced 1:1 on the chip. */
export const K_MAX = 1.0

/** L* travel distance at which adaptive K reaches K_MAX. */
export const K_SPAN = 50

/** Below L_ROLLOFF_LO and above L_ROLLOFF_HI, chip chroma is tapered toward
 *  CHROMA_ROLLOFF_MIN. Without this, flat a-star/b-star substitution paints full chip saturation into
 *  specular highlights and deep shade, which reads as coloured plastic rather than shingle. */
export const L_ROLLOFF_LO = 20
export const L_ROLLOFF_HI = 85

/** Floor for the taper. Not zero: driving chroma to 0 makes deep shadow pure neutral grey,
 *  which reads just as wrong as over-saturation. Real shingle keeps some hue in shade. */
export const CHROMA_ROLLOFF_MIN = 0.35

/** Binary-search iterations for gamut mapping. 12 gives ~0.02% chroma resolution. */
const GAMUT_ITERATIONS = 12

// ── sRGB <-> linear, with LUT ────────────────────────────────────────────────

/** 256-entry lookup for the sRGB decode. The decode is the hot path — one call per channel
 *  per masked pixel — and the input is always an integer code value, so the LUT is exact,
 *  not an approximation. */
const SRGB_TO_LINEAR_LUT: Float64Array = (() => {
  const lut = new Float64Array(256)
  for (let i = 0; i < 256; i++) {
    const c = i / 255
    lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return lut
})()

/** Decode an 8-bit sRGB code value to linear light. */
export function srgbToLinear(codeValue: number): number {
  const i = codeValue < 0 ? 0 : codeValue > 255 ? 255 : codeValue | 0
  return SRGB_TO_LINEAR_LUT[i]
}

/** Encode linear light to a floating sRGB value in 0..255. Not clamped — callers that need
 *  to know whether a colour is in gamut inspect the raw result. */
export function linearToSrgb(linear: number): number {
  const c = linear <= 0.0031308
    ? 12.92 * linear
    : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
  return c * 255
}

// ── sRGB <-> CIELAB (D65) ────────────────────────────────────────────────────

const Xn = 0.95047, Yn = 1.0, Zn = 1.08883
const DELTA = 6 / 29
const DELTA_CUBED = DELTA * DELTA * DELTA
const DELTA_SQ_3 = 3 * DELTA * DELTA

function fwd(t: number): number {
  return t > DELTA_CUBED ? Math.cbrt(t) : t / DELTA_SQ_3 + 4 / 29
}

function inv(t: number): number {
  return t > DELTA ? t * t * t : DELTA_SQ_3 * (t - 4 / 29)
}

/** 8-bit sRGB -> CIELAB. Returns [L*, a*, b*]. */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b)

  const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl
  const Z = 0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl

  const fx = fwd(X / Xn), fy = fwd(Y / Yn), fz = fwd(Z / Zn)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIELAB -> sRGB, UNCLAMPED and floating. Values outside 0..255 mean out of gamut. */
export function labToRgbRaw(L: number, a: number, bb: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - bb / 200

  const X = Xn * inv(fx), Y = Yn * inv(fy), Z = Zn * inv(fz)

  const rl =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
  const gl = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z
  const bl =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)]
}

/** True when the Lab triple lands inside the sRGB cube. Small epsilon absorbs float error
 *  so a colour sitting exactly on the boundary is not chased by the gamut search. */
export function isInGamut(L: number, a: number, b: number, epsilon = 0.5): boolean {
  const [r, g, bl] = labToRgbRaw(L, a, b)
  return r >= -epsilon && r <= 255 + epsilon
      && g >= -epsilon && g <= 255 + epsilon
      && bl >= -epsilon && bl <= 255 + epsilon
}

/**
 * Resolve an out-of-gamut Lab colour to 8-bit sRGB by reducing CHROMA at constant L* and hue.
 *
 * The naive alternative — clamping each channel independently — is what the old additive engine
 * did, and it shifts hue: on a saturated brown at high lightness the red channel saturates first,
 * so the result drifts yellow-green. Reducing chroma keeps the hue angle exactly and desaturates,
 * which is what a printer or a display would do and what the eye forgives.
 *
 * Binary search rather than analytic solve: the sRGB gamut boundary in Lab is not convex in a
 * form worth closed-forming for 12 iterations of work.
 */
export function labToRgbGamutMapped(L: number, a: number, b: number): [number, number, number] {
  if (isInGamut(L, a, b)) {
    const [r, g, bl] = labToRgbRaw(L, a, b)
    return [clamp8(r), clamp8(g), clamp8(bl)]
  }

  // L* itself must be in range or no chroma reduction can rescue it.
  const Lc = L < 0 ? 0 : L > 100 ? 100 : L

  let lo = 0, hi = 1
  for (let i = 0; i < GAMUT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    if (isInGamut(Lc, a * mid, b * mid)) lo = mid
    else hi = mid
  }

  const [r, g, bl] = labToRgbRaw(Lc, a * lo, b * lo)
  return [clamp8(r), clamp8(g), clamp8(bl)]
}

function clamp8(v: number): number {
  const r = Math.round(v)
  return r < 0 ? 0 : r > 255 ? 255 : r
}

// ── Recolour maths ───────────────────────────────────────────────────────────

/**
 * Shading contrast factor, scaled by how far the chip has to travel in lightness.
 *
 * A fixed K compresses source contrast by the same absolute amount regardless of the recolour.
 * That is invisible when chip and roof are already close (dark chip on a dark roof) and badly
 * wrong when they are far apart: a light tan roof at L* 61 recoloured to Onyx Black at L* 26
 * had its L* spread cut from sd 12.7 to sd 7.0, so the render read as flat paint rather than
 * shingle. Scaling K with |dL| keeps the relative texture intact across the travel.
 *
 * Degrades exactly to K_BASE when chip and roof means coincide, so short-travel recolours are
 * bit-comparable with the legacy engine.
 */
export function adaptiveK(chipL: number, roofMeanL: number, kBase = K_BASE): number {
  const travel = Math.abs(chipL - roofMeanL)
  const t = Math.min(travel / K_SPAN, 1)
  const k = kBase + t * (K_MAX - kBase)
  return k < kBase ? kBase : k > K_MAX ? K_MAX : k
}

/**
 * Chroma scaling factor for a given output lightness. 1.0 through the midtones, tapering to
 * CHROMA_ROLLOFF_MIN at the black and white ends.
 */
export function chromaRolloff(L: number): number {
  if (L >= L_ROLLOFF_LO && L <= L_ROLLOFF_HI) return 1

  if (L < L_ROLLOFF_LO) {
    const t = L <= 0 ? 0 : L / L_ROLLOFF_LO
    return CHROMA_ROLLOFF_MIN + (1 - CHROMA_ROLLOFF_MIN) * t
  }

  const span = 100 - L_ROLLOFF_HI
  const t = L >= 100 ? 0 : (100 - L) / span
  return CHROMA_ROLLOFF_MIN + (1 - CHROMA_ROLLOFF_MIN) * t
}

export interface LabRecolorInput {
  /** Source pixel L* from the original photograph — carries all the shading. */
  srcL: number
  /** Mean L* over the masked roof pixels. The anchor the shading is measured against. */
  roofMeanL: number
  /** Target chip in Lab. */
  chipL: number
  chipA: number
  chipB: number
  /** Precomputed adaptiveK(chipL, roofMeanL) — hoisted out of the pixel loop by callers. */
  k: number
  /** Additive L* jitter for granule texture, already scaled. */
  lumJitter?: number
  /** Additive a-star/b-star jitter for granule hue variation, already scaled. */
  aJitter?: number
  bJitter?: number
}

/**
 * Recolour one pixel. Shading rides on L*, hue and chroma come from the chip, chroma is tapered
 * at the lightness extremes, and the result is gamut-mapped rather than clipped.
 */
export function labRecolorPixel(input: LabRecolorInput): [number, number, number] {
  const { srcL, roofMeanL, chipL, chipA, chipB, k } = input

  const outL = chipL + (srcL - roofMeanL) * k + (input.lumJitter ?? 0)
  const rolloff = chromaRolloff(outL)

  const outA = chipA * rolloff + (input.aJitter ?? 0)
  const outB = chipB * rolloff + (input.bJitter ?? 0)

  return labToRgbGamutMapped(outL, outA, outB)
}
