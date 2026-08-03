// lib/hvac/decisionTreeData.ts
// Guided diagnostic decision trees. Mirror of mobile
// lib/features/hvac/decision_tree/hvac_decision_tree_data.dart — edit BOTH.
// NEEDS 608-CERT TECH REVIEW before field use.

export type TreeAnswer = { label: string; next: string }
export type TreeNode = {
  id: string
  question?: string
  answers?: TreeAnswer[]
  outcomeTitle?: string
  outcomeDetail?: string
  outcomeAction?: string
}
export type DecisionTree = {
  key: string
  label: string
  icon: string
  description: string
  rootId: string
  nodes: Record<string, TreeNode>
}

const noCooling: Record<string, TreeNode> = {
  start: { id: 'start', question: 'Is the indoor blower running?', answers: [
    { label: 'Yes, air is moving', next: 'outdoor_check' },
    { label: 'No air from vents', next: 'blower_dead' }] },
  blower_dead: { id: 'blower_dead', question: 'At the thermostat, is it set to COOL and calling (fan on AUTO)?', answers: [
    { label: 'Yes, calling for cool', next: 'blower_power' },
    { label: 'No / unsure', next: 'tstat_fix' }] },
  tstat_fix: { id: 'tstat_fix', outcomeTitle: 'Thermostat setting',
    outcomeDetail: 'Set to COOL, temp below room temp, fan AUTO. Check thermostat batteries if the display is blank.',
    outcomeAction: 'Correct the thermostat, then re-test.' },
  blower_power: { id: 'blower_power', question: 'Check the float switch on the condensate pan — is it tripped (pan full of water)?', answers: [
    { label: 'Yes, pan is full', next: 'float_tripped' },
    { label: 'No, pan is dry', next: 'blower_motor' }] },
  float_tripped: { id: 'float_tripped', outcomeTitle: 'Condensate float switch tripped',
    outcomeDetail: 'A full pan opens the safety switch and stops the system. Common in summer with a clogged drain line.',
    outcomeAction: 'Clear and flush the condensate drain, confirm the pan drains and the switch resets. Treat the line to prevent regrowth.' },
  blower_motor: { id: 'blower_motor', outcomeTitle: 'Blower / control power issue',
    outcomeDetail: 'Thermostat calls but the blower won’t run and the safety isn’t tripped. Suspect the blower motor, capacitor, control board, or a blown low-voltage fuse.',
    outcomeAction: 'Check for 24V at the board, the blower capacitor, and the low-voltage fuse. Read any board fault code (Field Reference).' },
  outdoor_check: { id: 'outdoor_check', question: 'At the outdoor unit — is the condenser fan spinning?', answers: [
    { label: 'Yes, fan is spinning', next: 'compressor_check' },
    { label: 'No, fan is still', next: 'fan_dead' }] },
  fan_dead: { id: 'fan_dead', question: 'Is the compressor running (humming / vibration at the unit)?', answers: [
    { label: 'Compressor is running', next: 'fan_only_dead' },
    { label: 'Nothing running outside', next: 'contactor_check' }] },
  fan_only_dead: { id: 'fan_only_dead', outcomeTitle: 'Condenser fan motor or capacitor',
    outcomeDetail: 'Compressor runs but the fan doesn’t — the unit will overheat and trip on high pressure fast. Usually the fan side of a dual-run capacitor, or a failed fan motor.',
    outcomeAction: 'Shut down to protect the compressor. Test the capacitor (FAN µF) and the fan motor. Replace the failed part.' },
  contactor_check: { id: 'contactor_check', question: 'Is the contactor pulling in (24V on the coil, contacts closed)?', answers: [
    { label: 'Yes, contactor is closed', next: 'cap_check' },
    { label: 'No, contactor is open', next: 'no_24v' }] },
  no_24v: { id: 'no_24v', outcomeTitle: 'No 24V to the contactor',
    outcomeDetail: 'The call isn’t reaching the contactor. Suspect the transformer, low-voltage wiring, a tripped safety in the string (float, high-pressure), or the thermostat.',
    outcomeAction: 'Trace 24V from the transformer through the safety string to the contactor coil. Check the low-voltage fuse.' },
  cap_check: { id: 'cap_check', outcomeTitle: 'Capacitor / compressor start',
    outcomeDetail: 'Contactor is closed but nothing starts. The dual-run capacitor is the most common cause; also consider a seized compressor or open windings.',
    outcomeAction: 'Test the capacitor (HERM + FAN µF vs rating). If good, check compressor windings and amp draw. A hard-start kit may help a weak start.' },
  compressor_check: { id: 'compressor_check', question: 'Both fan and compressor run. Connect gauges — is the suction line cold and sweating?', answers: [
    { label: 'Yes, cold and sweating', next: 'airflow_or_charge' },
    { label: 'No, warm / not sweating', next: 'low_charge' }] },
  low_charge: { id: 'low_charge', outcomeTitle: 'Low charge or restriction',
    outcomeDetail: 'Running but not cooling with a warm suction line points to low refrigerant (leak) or a restriction.',
    outcomeAction: 'Run the Diagnose tool for exact superheat/subcooling. Leak-search before adding refrigerant — topping off a leak is not a repair.' },
  airflow_or_charge: { id: 'airflow_or_charge', outcomeTitle: 'Airflow or fine-tune charge',
    outcomeDetail: 'Running and moving refrigerant but comfort is off. Suspect airflow (dirty filter/coil, duct) or a charge slightly off.',
    outcomeAction: 'Check filter and evaporator coil, measure temperature split and static pressure, then verify charge with the Diagnose tool.' },
}

const noHeat: Record<string, TreeNode> = {
  start: { id: 'start', question: 'What type of heating system?', answers: [
    { label: 'Gas furnace', next: 'gas_start' },
    { label: 'Heat pump', next: 'hp_start' }] },
  gas_start: { id: 'gas_start', question: 'Does the furnace try to start (inducer spins, then ignition)?', answers: [
    { label: 'Yes, it tries', next: 'gas_ignition' },
    { label: 'No, nothing happens', next: 'gas_nopower' }] },
  gas_nopower: { id: 'gas_nopower', outcomeTitle: 'No call or no power',
    outcomeDetail: 'Furnace doesn’t attempt to start. Check power (breaker, door switch), thermostat calling for heat, 24V, and the low-voltage fuse.',
    outcomeAction: 'Confirm the blower door switch is engaged, power is on, and the thermostat calls. Read the board LED fault code.' },
  gas_ignition: { id: 'gas_ignition', question: 'Does it light and then shut off after a few seconds?', answers: [
    { label: 'Lights then drops out', next: 'flame_sense' },
    { label: 'Never lights at all', next: 'no_ignition' }] },
  flame_sense: { id: 'flame_sense', outcomeTitle: 'Flame sensor (most likely)',
    outcomeDetail: 'Lights then drops out on lockout = the board isn’t sensing flame. A dirty flame sensor is the #1 cause of short-cycle no-heat on gas furnaces.',
    outcomeAction: 'Clean the flame sensor with a fine abrasive pad and check the µA signal. Verify good ground. If still low, replace it.' },
  no_ignition: { id: 'no_ignition', outcomeTitle: 'No ignition',
    outcomeDetail: 'Never lights. Check the igniter (glow/spark), gas supply/valve, and the pressure switch (inducer must prove draft before ignition).',
    outcomeAction: 'Confirm gas on, igniter glows/sparks, and the pressure switch closes. Read the board fault code to narrow it down.' },
  hp_start: { id: 'hp_start', question: 'Is the outdoor unit running in heat mode?', answers: [
    { label: 'Yes, running', next: 'hp_reversing' },
    { label: 'No, outdoor unit off', next: 'hp_nopower' }] },
  hp_nopower: { id: 'hp_nopower', outcomeTitle: 'Outdoor unit not running',
    outcomeDetail: 'Same electrical checks as a no-cool: contactor, capacitor, 24V call, defrost board. Confirm the thermostat is in HEAT and aux/emergency heat behaves correctly.',
    outcomeAction: 'Check 24V to the contactor, the capacitor, and the defrost board. Verify the reversing valve wiring (O/B) is correct.' },
  hp_reversing: { id: 'hp_reversing', outcomeTitle: 'Reversing valve / charge',
    outcomeDetail: 'Outdoor unit runs but no heat inside. Suspect the reversing valve stuck (or O/B wiring), low charge, or a defrost fault leaving it in the wrong mode.',
    outcomeAction: 'Verify the reversing valve energizes and shifts, check head/suction pressures for heat mode, and confirm aux heat works.' },
}

const poorCool: Record<string, TreeNode> = {
  start: { id: 'start', question: 'The system runs but cooling is weak. Is the air filter clean?', answers: [
    { label: 'Filter is clean', next: 'coil_check' },
    { label: 'Filter is dirty', next: 'dirty_filter' }] },
  dirty_filter: { id: 'dirty_filter', outcomeTitle: 'Airflow restriction — filter',
    outcomeDetail: 'A dirty filter starves airflow, drops capacity, and can freeze the coil. The most common comfort complaint cause.',
    outcomeAction: 'Replace the filter. If the coil is iced, shut down to thaw, then re-check. Advise the customer on change frequency.' },
  coil_check: { id: 'coil_check', question: 'Is the evaporator coil or outdoor condenser coil dirty?', answers: [
    { label: 'A coil is dirty', next: 'dirty_coil' },
    { label: 'Coils look clean', next: 'measure_split' }] },
  dirty_coil: { id: 'dirty_coil', outcomeTitle: 'Dirty coil',
    outcomeDetail: 'A dirty condenser coil raises head pressure and kills capacity; a dirty evaporator restricts airflow. Both hurt cooling.',
    outcomeAction: 'Clean the affected coil. Re-check temperature split and pressures afterward.' },
  measure_split: { id: 'measure_split', question: 'Measure the temperature split (return minus supply). Is it in the 16–22°F range?', answers: [
    { label: 'Normal (16–22)', next: 'duct_check' },
    { label: 'Low (<16)', next: 'low_split' }] },
  low_split: { id: 'low_split', outcomeTitle: 'Low split — charge or airflow',
    outcomeDetail: 'A low temperature split with clean coils and filter points to a refrigerant charge problem or excess airflow.',
    outcomeAction: 'Run the Diagnose tool for superheat/subcooling to confirm charge. Check blower speed if the split is very low.' },
  duct_check: { id: 'duct_check', outcomeTitle: 'Distribution / duct issue',
    outcomeDetail: 'The unit cools properly at the equipment (good split, clean coils) but comfort is still poor — the problem is getting cool air to the rooms. Suspect duct leakage, undersized returns, or crushed flex.',
    outcomeAction: 'Inspect ductwork for leaks and disconnects, check static pressure, and assess return sizing. See the Airflow/Comfort checklist.' },
}

export const DECISION_TREES: DecisionTree[] = [
  { key: 'no_cooling', label: 'No Cooling', icon: '❄️', description: 'Walk through a no-cool call step by step', rootId: 'start', nodes: noCooling },
  { key: 'no_heat', label: 'No Heating', icon: '🔥', description: 'Gas furnace or heat pump not heating', rootId: 'start', nodes: noHeat },
  { key: 'poor_cooling', label: 'Weak Cooling', icon: '💨', description: 'System runs but cooling is weak or uneven', rootId: 'start', nodes: poorCool },
]
