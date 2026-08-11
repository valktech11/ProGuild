// lib/trades/roofing/leadSources.ts
//
// SINGLE GOLDEN SOURCE for roofing lead sources.
//
// Every place that shows a lead-source picker or dropdown (Add Lead modals,
// the detail-page source dropdown, the pipeline Filter panel) MUST import from
// here — do NOT redefine the list inline. This file is the one authority.
//
// ⚠️ MOBILE SYNC: the Flutter app mirrors this list exactly in
//    ProGuildMobile › lib/shared/models/lead_sources.dart
//    If you add/remove/rename a source here, update that file too.

export interface LeadSource {
  value: string   // stored in leads.lead_source — never change an existing value
  label: string   // shown in UI
  icon:  string   // emoji used by simple pickers
}

export const LEAD_SOURCES: LeadSource[] = [
  { value: 'Phone_Call', label: 'Phone Call',    icon: '📞' },
  { value: 'Storm',      label: 'Storm Damage',  icon: '⛈️' },
  { value: 'Referral',   label: 'Referral',      icon: '🤝' },
  { value: 'Facebook',   label: 'Facebook',      icon: '📘' },
  { value: 'Instagram',  label: 'Instagram',     icon: '📸' },
  { value: 'Door_Knock', label: 'Door Knock',    icon: '🚪' },
  { value: 'Yard_Sign',  label: 'Yard Sign',     icon: '🪧' },
  { value: 'Insurance',  label: 'Insurance Co.', icon: '🛡️' },
  { value: 'Website',    label: 'Website',       icon: '🌐' },
  { value: 'Google',     label: 'Google',        icon: '🔍' },
  { value: 'Canvassing', label: 'Canvassing',    icon: '🏘️' },
  { value: 'Other',      label: 'Other',         icon: '📌' },
]

// Quick lookups
export const LEAD_SOURCE_VALUES = LEAD_SOURCES.map(s => s.value)
export const leadSourceLabel = (value: string): string =>
  LEAD_SOURCES.find(s => s.value === value)?.label ?? value
