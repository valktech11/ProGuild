// lib/hvac/checklistData.ts
//
// Job-type checklists for HVAC service calls. Static, offline.
// Mirrors mobile lib/features/hvac/checklists/hvac_checklist_data.dart — edit BOTH.
//
// SOURCES: standard HVAC service procedures (ACCA, manufacturer PM guides).
// Should be reviewed by a 608-cert tech before field use.

export type ChecklistItem = { text: string; hint?: string }
export type ChecklistSection = { title: string; items: ChecklistItem[] }
export type JobChecklist = {
  key: string
  label: string
  icon: string
  description: string
  sections: ChecklistSection[]
}

export const JOB_CHECKLISTS: JobChecklist[] = [
  { key: 'tuneup', label: 'Maintenance / Tune-Up', icon: '🔧',
    description: 'Seasonal preventive maintenance visit', sections: [
    { title: 'Outdoor unit', items: [
      { text: 'Inspect and clean condenser coil', hint: 'Straighten bent fins, clear debris' },
      { text: 'Check contactor for pitting/wear' },
      { text: 'Test capacitor (µF within ±6% of rating)' },
      { text: 'Inspect fan motor and blade' },
      { text: 'Check refrigerant charge (superheat/subcool)' },
      { text: 'Tighten electrical connections' },
      { text: 'Check disconnect and whip' },
    ]},
    { title: 'Indoor unit', items: [
      { text: 'Replace or clean air filter' },
      { text: 'Inspect evaporator coil' },
      { text: 'Clear and treat condensate drain', hint: 'Flush line, check float switch' },
      { text: 'Check blower wheel and motor' },
      { text: 'Inspect ductwork at unit for leaks' },
      { text: 'Test blower amp draw vs nameplate' },
    ]},
    { title: 'System performance', items: [
      { text: 'Measure temperature split (ΔT 16–22°F)' },
      { text: 'Verify thermostat operation and calibration' },
      { text: 'Check static pressure' },
      { text: 'Confirm proper cycling' },
    ]},
  ]},
  { key: 'no_cooling', label: 'No Cooling', icon: '❄️',
    description: 'System running but not cooling, or not running at all', sections: [
    { title: 'Power & controls', items: [
      { text: 'Confirm thermostat calling for cool' },
      { text: 'Check disconnect and breaker' },
      { text: 'Verify 24V at contactor' },
      { text: 'Test transformer output' },
      { text: 'Check float switch not tripped', hint: 'A full condensate pan opens the switch and kills cooling' },
    ]},
    { title: 'Outdoor unit', items: [
      { text: 'Is the condenser fan running?' },
      { text: 'Is the compressor running?' },
      { text: 'Test capacitor', hint: 'A failed capacitor is the most common no-cool cause' },
      { text: 'Check contactor pull-in' },
      { text: 'Measure compressor amp draw' },
    ]},
    { title: 'Refrigerant side', items: [
      { text: 'Connect gauges — check pressures' },
      { text: 'Calculate superheat and subcooling' },
      { text: 'Inspect for oil stains (leak indicator)' },
      { text: 'Check for iced-up lines or coil', hint: 'Ice = low charge, airflow problem, or dirty filter' },
    ]},
    { title: 'Airflow', items: [
      { text: 'Check filter condition' },
      { text: 'Verify blower running' },
      { text: 'Confirm supply registers open' },
    ]},
  ]},
  { key: 'no_heat', label: 'No Heating', icon: '🔥',
    description: 'Furnace or heat pump not producing heat', sections: [
    { title: 'Power & controls', items: [
      { text: 'Confirm thermostat calling for heat' },
      { text: 'Check breaker and disconnect' },
      { text: 'Verify power to furnace/air handler' },
      { text: 'Read control board fault code', hint: 'See Field Reference → Faults for the brand' },
    ]},
    { title: 'Gas furnace', items: [
      { text: 'Confirm gas supply on' },
      { text: 'Observe ignition sequence' },
      { text: 'Check igniter (resistance/glow)' },
      { text: 'Test flame sensor (µA reading)' },
      { text: 'Verify pressure switch operation' },
      { text: 'Inspect inducer motor' },
      { text: 'Check limit switches' },
    ]},
    { title: 'Heat pump', items: [
      { text: 'Verify reversing valve operation' },
      { text: 'Check defrost board and sensor' },
      { text: 'Confirm auxiliary/emergency heat works' },
      { text: 'Measure refrigerant pressures in heat mode' },
    ]},
  ]},
  { key: 'replacement', label: 'Replacement Quote', icon: '📋',
    description: 'Assessing a system for replacement or new install', sections: [
    { title: 'Existing system', items: [
      { text: 'Record make, model, serial of current unit' },
      { text: 'Note age and refrigerant type', hint: 'R-22 systems are strong replacement candidates' },
      { text: 'Assess overall condition and history' },
      { text: 'Check existing tonnage' },
    ]},
    { title: 'Load & sizing', items: [
      { text: 'Measure conditioned square footage' },
      { text: 'Note window count and orientation' },
      { text: 'Assess insulation quality' },
      { text: 'Perform or reference Manual J load calc', hint: 'Don\u2019t just match old tonnage — size to the load' },
    ]},
    { title: 'Installation factors', items: [
      { text: 'Inspect existing ductwork condition/sizing' },
      { text: 'Check electrical service capacity' },
      { text: 'Assess line set reuse vs replace' },
      { text: 'Note pad/mount and clearances' },
      { text: 'Identify code/permit requirements' },
      { text: 'Photograph install location' },
    ]},
    { title: 'Customer', items: [
      { text: 'Discuss efficiency options (SEER2 tiers)' },
      { text: 'Review financing if applicable' },
      { text: 'Note comfort complaints to address' },
    ]},
  ]},
  { key: 'airflow', label: 'Airflow / Comfort', icon: '💨',
    description: 'Uneven temps, weak airflow, humidity complaints', sections: [
    { title: 'Airflow measurement', items: [
      { text: 'Measure external static pressure', hint: 'High static = restricted system' },
      { text: 'Check filter type and condition' },
      { text: 'Inspect blower wheel for buildup' },
      { text: 'Measure blower CFM if possible' },
      { text: 'Verify blower speed tap/setting' },
    ]},
    { title: 'Distribution', items: [
      { text: 'Check for closed/blocked registers' },
      { text: 'Inspect ductwork for leaks/disconnects' },
      { text: 'Assess duct sizing for the load' },
      { text: 'Check return air sizing' },
      { text: 'Look for crushed flex duct' },
    ]},
    { title: 'Comfort factors', items: [
      { text: 'Measure room-to-room temperature spread' },
      { text: 'Check humidity levels' },
      { text: 'Verify thermostat location isn\u2019t skewed' },
    ]},
  ]},
]
