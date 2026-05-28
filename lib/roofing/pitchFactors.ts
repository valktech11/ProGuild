// Shared pitch factor constants — used by Calculator, ProMeasure, EstimatePage
// Factor = (1 + (rise/12)²)^0.5 — standard roofing industry values
export const PITCH_FACTORS: Record<string, number> = {
  '2/12': 1.014,
  '3/12': 1.031,
  '4/12': 1.054,
  '5/12': 1.083,
  '6/12': 1.118,
  '7/12': 1.158,
  '8/12': 1.202,
  '9/12': 1.250,
  '10/12': 1.302,
  '11/12': 1.357,
  '12/12': 1.414,
}

export const PITCH_OPTIONS = Object.keys(PITCH_FACTORS)

export function getPitchFactor(pitch: string, fallback = 1.118): number {
  return PITCH_FACTORS[pitch] ?? fallback
}
