// lib/hvac/referenceData.ts
//
// Field reference data for HVAC techs. Static, no API.
//
// MIRRORS mobile/lib/features/hvac/reference/hvac_reference_data.dart —
// if you edit one, edit both.
//
// SOURCES: standard published saturation tables per refrigerant (ASHRAE /
// manufacturer PT charts). REFERENCE values — the UI tells the tech to confirm
// against their gauge manufacturer's chart before charging.

export type Refrigerant = {
  key: string
  label: string
  note: string
  /** temp °F -> pressure psig (saturated / bubble point) */
  pt: Record<number, number>
}

export const REFRIGERANTS: Refrigerant[] = [
  { key: 'R-410A', label: 'R-410A', note: 'Most common in systems 2005+. Near-azeotropic.', pt: {
    30: 100.8,  35: 109.9,  40: 118.5,  45: 128.0,  50: 137.1,
    55: 147.6,  60: 157.7,  65: 168.4,  70: 179.8,  75: 191.6,
    80: 204.0,  85: 217.1,  90: 230.8,  95: 245.0, 100: 259.9,
   105: 275.4, 110: 291.6, 115: 308.6, 120: 326.4, 125: 344.9,
  }},
  { key: 'R-22', label: 'R-22', note: 'Legacy systems pre-2010. Phased out — recovery required.', pt: {
    30:  54.9,  35:  61.5,  40:  68.6,  45:  76.1,  50:  84.1,
    55:  92.6,  60: 101.6,  65: 111.3,  70: 121.5,  75: 132.2,
    80: 143.7,  85: 155.7,  90: 168.4,  95: 181.9, 100: 196.0,
   105: 210.8, 110: 226.4, 115: 242.8, 120: 260.0, 125: 278.1,
  }},
  { key: 'R-32', label: 'R-32', note: 'A2L mildly flammable. Newer ductless / VRF.', pt: {
    30: 105.7,  35: 114.7,  40: 124.2,  45: 134.0,  50: 144.6,
    55: 155.5,  60: 167.0,  65: 179.0,  70: 191.6,  75: 204.8,
    80: 218.5,  85: 232.9,  90: 247.8,  95: 263.5, 100: 279.7,
   105: 296.7, 110: 314.3, 115: 332.7, 120: 351.7, 125: 371.5,
  }},
  { key: 'R-454B', label: 'R-454B', note: 'A2L. R-410A replacement in 2025+ equipment.', pt: {
    30:  98.5,  35: 107.0,  40: 116.0,  45: 125.2,  50: 134.9,
    55: 145.0,  60: 155.4,  65: 166.3,  70: 177.7,  75: 189.5,
    80: 201.9,  85: 214.7,  90: 228.1,  95: 242.0, 100: 256.4,
   105: 271.4, 110: 287.0, 115: 303.2, 120: 320.0, 125: 337.5,
  }},
]

export type ChargeTarget = { system: string; target: string; detail: string }

export const CHARGE_TARGETS: ChargeTarget[] = [
  { system: 'TXV / EEV — subcooling', target: '10–12 °F',
    detail: 'Primary charging method on TXV systems. Measure at the liquid line service valve.' },
  { system: 'TXV / EEV — superheat', target: '8–12 °F',
    detail: 'Verification only. If subcooling is right but superheat is high, suspect a restriction.' },
  { system: 'Fixed orifice — superheat', target: 'Chart-dependent',
    detail: 'Target varies with indoor wet bulb and outdoor dry bulb. Use the manufacturer charging chart.' },
  { system: 'Delta-T (return vs supply)', target: '16–22 °F',
    detail: 'Low delta-T: airflow, charge or coil. High delta-T: low airflow, dirty filter or blower.' },
]

export type FaultCode = { code: string; meaning: string; action: string }
export type BrandFaults = { brand: string; alsoKnownAs: string; indicator: string; codes: FaultCode[] }

export const FAULT_CODES: BrandFaults[] = [
  { brand: 'Carrier / Bryant', alsoKnownAs: 'Payne, Day & Night', indicator: 'Amber LED flash count on control board', codes: [
    { code: '1 flash',   meaning: 'No previous fault / system OK',      action: 'No action — normal standby.' },
    { code: '2 flashes', meaning: 'Pressure switch stuck closed',        action: 'Check for a shorted switch or blocked drain float.' },
    { code: '3 flashes', meaning: 'Pressure switch stuck open',          action: 'Inspect inducer, vent blockage, condensate trap.' },
    { code: '4 flashes', meaning: 'Limit switch open',                   action: 'Airflow problem — filter, blower, or closed registers.' },
    { code: '5 flashes', meaning: 'Flame sensed with gas valve closed',  action: 'Check for a leaking gas valve or stuck sensor.' },
    { code: '6 flashes', meaning: 'Four consecutive limit trips',        action: 'Airflow restriction. Verify blower speed and static.' },
    { code: '8 flashes', meaning: 'Gas heating lockout',                 action: 'Failed ignition after retries — igniter, gas supply, sensor.' },
    { code: '9 flashes', meaning: 'Reversed polarity / no ground',       action: 'Verify line voltage polarity and equipment ground.' },
  ]},
  { brand: 'Trane / American Standard', alsoKnownAs: 'Ameristar', indicator: 'Red LED flash count on integrated control', codes: [
    { code: '2 flashes', meaning: 'System lockout',                 action: 'Retries exhausted. Cycle power and observe ignition sequence.' },
    { code: '3 flashes', meaning: 'Pressure switch open',           action: 'Inducer, vent, or condensate blockage.' },
    { code: '4 flashes', meaning: 'High limit open',                action: 'Airflow restriction or failed limit switch.' },
    { code: '5 flashes', meaning: 'Flame sensed out of sequence',   action: 'Gas valve leaking through or shorted sensor wire.' },
    { code: '6 flashes', meaning: 'Flame lost / weak signal',       action: 'Clean the flame sensor. Verify microamps (target 2–6 μA).' },
    { code: '7 flashes', meaning: 'Gas valve circuit fault',        action: 'Check valve coil resistance and wiring.' },
    { code: '8 flashes', meaning: 'Igniter circuit fault',          action: 'Igniter open or control board output failed.' },
  ]},
  { brand: 'Lennox', alsoKnownAs: 'Armstrong, Ducane, Aire-Flo', indicator: 'Alphanumeric display or LED codes', codes: [
    { code: 'E200 / E201', meaning: 'Low pressure switch open',   action: 'Check refrigerant charge and suction line restriction.' },
    { code: 'E202',        meaning: 'High pressure switch open',  action: 'Condenser airflow, overcharge, or non-condensables.' },
    { code: 'E230',        meaning: 'Outdoor thermistor fault',   action: 'Check sensor resistance against the chart, inspect harness.' },
    { code: 'E240',        meaning: 'Compressor not running',     action: 'Verify contactor, capacitor, and compressor windings.' },
    { code: 'E250',        meaning: 'Low supply voltage',         action: 'Measure at contactor under load. Check service conductors.' },
    { code: 'E320',        meaning: 'Indoor blower fault',        action: 'ECM motor or control failure — check motor comms.' },
  ]},
  { brand: 'Goodman / Amana', alsoKnownAs: 'Daikin (residential)', indicator: 'Red and green LEDs on control board', codes: [
    { code: 'Steady red',    meaning: 'Control board failure',            action: 'Replace the integrated control module.' },
    { code: '1 red flash',   meaning: 'Flame sensed with no call',        action: 'Gas valve leaking through or wiring fault.' },
    { code: '2 red flashes', meaning: 'Pressure switch stuck closed',     action: 'Switch shorted or hose connected incorrectly.' },
    { code: '3 red flashes', meaning: 'Pressure switch open',             action: 'Inducer, vent pipe, or blocked condensate drain.' },
    { code: '4 red flashes', meaning: 'Open high limit',                  action: 'Airflow — dirty filter, closed dampers, weak blower.' },
    { code: '5 red flashes', meaning: 'Flame present with valve closed',  action: 'Gas valve leaking. Replace the valve.' },
    { code: '7 red flashes', meaning: 'Low flame signal',                 action: 'Clean or replace the flame sensor.' },
    { code: '8 red flashes', meaning: 'Igniter circuit fault',            action: 'Igniter cracked or open. Verify 120V at the igniter.' },
  ]},
  { brand: 'Rheem / Ruud', alsoKnownAs: 'Weatherking', indicator: 'Green and amber LED sequence', codes: [
    { code: '2 flashes', meaning: 'Pressure switch closed at start',  action: 'Shorted switch or blocked drain.' },
    { code: '3 flashes', meaning: 'Pressure switch failed to close',  action: 'Inducer weak, vent restricted, or trap full.' },
    { code: '4 flashes', meaning: 'Open high limit',                  action: 'Restricted airflow or failed limit.' },
    { code: '5 flashes', meaning: 'Flame sensed without call',        action: 'Gas valve leak-through.' },
    { code: '6 flashes', meaning: 'Ignition lockout',                 action: 'Failed to establish flame after retries.' },
    { code: '7 flashes', meaning: 'Low flame current',                action: 'Clean the sensor. Check ground and burner alignment.' },
    { code: '8 flashes', meaning: 'Rollout switch open',              action: 'Blocked heat exchanger or flue. Do NOT reset without diagnosis.' },
  ]},
  { brand: 'York', alsoKnownAs: 'Coleman, Luxaire', indicator: 'Status LED on furnace control', codes: [
    { code: '1 flash',   meaning: 'Pressure switch stuck closed',   action: 'Verify switch opens with the inducer off.' },
    { code: '2 flashes', meaning: 'Pressure switch open',           action: 'Inducer, vent, or condensate blockage.' },
    { code: '3 flashes', meaning: 'Limit switch open',              action: 'Airflow restriction or failed limit.' },
    { code: '4 flashes', meaning: 'Rollout switch open',            action: 'Heat exchanger or flue blockage. Diagnose before reset.' },
    { code: '5 flashes', meaning: 'Flame present with valve off',   action: 'Gas valve leaking through.' },
    { code: '6 flashes', meaning: 'Ignition lockout',               action: 'Check igniter, gas supply, flame sensor.' },
    { code: '8 flashes', meaning: 'Low flame sense',                action: 'Clean sensor. Target 1.5 μA minimum.' },
  ]},
]

// ── Interpolation helpers (shared by the page) ───────────────────────────────

export function psiForTemp(r: Refrigerant, tempF: number): number | null {
  const keys = Object.keys(r.pt).map(Number).sort((a, b) => a - b)
  if (tempF < keys[0] || tempF > keys[keys.length - 1]) return null
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i], hi = keys[i + 1]
    if (tempF >= lo && tempF <= hi) {
      const t = (tempF - lo) / (hi - lo)
      return r.pt[lo] + (r.pt[hi] - r.pt[lo]) * t
    }
  }
  return null
}

export function tempForPsi(r: Refrigerant, psi: number): number | null {
  const keys = Object.keys(r.pt).map(Number).sort((a, b) => a - b)
  const lowest = r.pt[keys[0]], highest = r.pt[keys[keys.length - 1]]
  if (psi < lowest || psi > highest) return null
  for (let i = 0; i < keys.length - 1; i++) {
    const loP = r.pt[keys[i]], hiP = r.pt[keys[i + 1]]
    if (psi >= loP && psi <= hiP) {
      const t = (psi - loP) / (hiP - loP)
      return keys[i] + (keys[i + 1] - keys[i]) * t
    }
  }
  return null
}
