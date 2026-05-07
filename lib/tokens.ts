/**
 * ProGuild Design Tokens — Single Source of Truth
 * ─────────────────────────────────────────────────
 * Import T for spacing/radius/typography constants.
 * Import theme(dk) for colour tokens.
 *
 * RULE: No hardcoded px font sizes, colours, or border-radius values
 * anywhere in the codebase. Everything flows from here.
 */

// ─── Typography scale ─────────────────────────────────────────────────────────
// Desktop values. Mobile subtract 1–2px via isMobile prop or CSS.
export const T = {
  // Font sizes (px) — 9 semantic slots only
  fontBadge:    11,   // status chips, timestamps, uppercase micro-labels
  fontSub:      12,   // secondary descriptions, hints, metadata
  fontBody:     14,   // primary readable body text, card content, list items
  fontEmphasis: 15,   // input text, slightly elevated body, button labels
  fontLabel:    16,   // section labels, card titles, nav items, form labels
  fontHeading:  18,   // section headers (Action Center, Pipeline, Reviews…)
  fontTitle:    24,   // page h1 titles
  fontStat:     32,   // big numbers in stat cards
  fontStatLg:   40,   // hero numbers (pipeline value, star rating)

  // Mobile overrides (used with isMobile flag)
  fontBadgeMobile:    10,
  fontSubMobile:      12,
  fontBodyMobile:     13,
  fontEmphasisMobile: 14,
  fontLabelMobile:    15,
  fontHeadingMobile:  16,
  fontTitleMobile:    22,
  fontStatMobile:     28,
  fontStatLgMobile:   32,

  // Border radius — 5 values only
  radXs:   6,    // tiny chips, inline badges
  radSm:   8,    // buttons, inputs, small cards
  radMd:  12,    // standard cards, modals, inner panels
  radLg:  16,    // large cards, sheet containers
  radXl:  20,    // page-level containers, hero cards

  // Spacing — 8-point grid
  sp1:   4,
  sp2:   8,
  sp3:  12,
  sp4:  16,
  sp5:  20,
  sp6:  24,
  sp8:  32,
  sp10: 40,

  // Icon sizes
  iconXs: 14,
  iconSm: 16,
  iconMd: 18,
  iconLg: 22,
  iconXl: 28,

  // Line heights
  lineSnug:   1.3,
  lineNormal: 1.5,
  lineRelaxed:1.65,
} as const

// ─── Colour palette ───────────────────────────────────────────────────────────
// Brand constants — never change between light/dark
export const BRAND = {
  teal:      '#0F766E',
  tealLight: '#14B8A6',
  tealDark:  '#0D5C55',
  tealAlpha: 'rgba(15,118,110,0.12)',

  // Stage colours — light mode values (used in chips/badges always)
  stageNew:       '#D97706',
  stageContacted: '#2563EB',
  stageQuoted:    '#7C3AED',
  stageScheduled: '#0F766E',
  stageCompleted: '#374151',
  stagePaid:      '#15803D',

  // Semantic
  success:  '#15803D',
  warning:  '#B45309',
  danger:   '#DC2626',
  info:     '#2563EB',
} as const

// ─── Theme function — light vs dark surfaces ──────────────────────────────────
// Warm dark palette aligned to the sidebar navy, not cold blue-slate
export function theme(dk: boolean) {
  return {
    // ── Page & surface backgrounds ──────────────────────────────────────────
    pageBg:       dk ? '#0E1118' : '#F5F4F0',
    cardBg:       dk ? '#181E2A' : '#FFFFFF',
    cardBgAlt:    dk ? '#1A2130' : '#F9F8F6',   // slightly recessed (table alt rows, notes bg)
    cardBgEdit:   dk ? '#1C2840' : '#F0FDF9',   // edit/active state highlight
    cardBgHover:  dk ? '#1F2B3A' : '#F0FAFA',   // hover state

    // ── Borders ─────────────────────────────────────────────────────────────
    cardBorder:   dk ? '#2D3A4A' : '#E8E2D9',   // main card/section borders
    inputBorder:  dk ? '#3D4E60' : '#D1D5DB',   // inputs — must be clearly visible
    divider:      dk ? '#1E2D3D' : '#F3F4F6',   // subtle inner dividers (table rows)

    // ── Text hierarchy ───────────────────────────────────────────────────────
    textPri:      dk ? '#F1F5F9' : '#111827',   // headings, names, primary values
    textBody:     dk ? '#CBD5E1' : '#374151',   // body text, readable content
    textMuted:    dk ? '#94A3B8' : '#4B5563',   // labels, secondary info
    textSubtle:   dk ? '#64748B' : '#6B7280',   // timestamps, hints — use sparingly

    // ── Interactive elements ─────────────────────────────────────────────────
    btnBorder:    dk ? '#3D4E60' : '#D1D5DB',
    btnText:      dk ? '#CBD5E1' : '#374151',
    btnHoverBg:   dk ? '#243044' : '#F9FAFB',

    // ── Inputs ───────────────────────────────────────────────────────────────
    inputBg:      dk ? '#0E1118' : '#FFFFFF',

    // ── Table rows ───────────────────────────────────────────────────────────
    tableRowAlt:  dk ? '#1A2130' : '#F9F8F6',
    tableRowHover:dk ? '#1F2B3A' : '#F0FAFA',

    // ── Status / semantic surfaces ───────────────────────────────────────────
    // In dark mode: cardBg bg + coloured border — NO tinted backgrounds
    successBg:    dk ? '#181E2A' : '#F0FDF4',
    successBorder:dk ? '#166534' : '#BBF7D0',
    warningBg:    dk ? '#181E2A' : '#FFFBEB',
    warningBorder:dk ? '#92400E' : '#FDE68A',
    dangerBg:     dk ? '#181E2A' : '#FEF2F2',
    dangerBorder: dk ? '#7F1D1D' : '#FECACA',
    infoBg:       dk ? '#181E2A' : '#EFF6FF',
    infoBorder:   dk ? '#1E3A5F' : '#DBEAFE',

    // ── Calendar-specific ────────────────────────────────────────────────────
    calSidebar:      dk ? '#111827' : '#F7F6F3',
    calToolbar:      dk ? '#0E1118' : '#FFFFFF',   // matches page — no stripe artifact
    calGridBg:       dk ? '#0E1118' : '#FFFFFF',
    calColToday:     dk ? 'rgba(15,118,110,0.14)' : '#F0FDFA',
    calColWeekend:   dk ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
    calColSelected:  dk ? 'rgba(15,118,110,0.08)' : '#F9FEFE',
    calDayHeader:    dk ? '#111827' : '#FFFFFF',
    calCellBorder:   dk ? '#2D3A4A' : '#F0EEE9',   // visible — matches cardBorder
    calEmptyText:    dk ? '#2D3A4A' : '#D1D5DB',
    calAgendaBg:     dk ? '#111827' : '#F7F6F3',

    // ── Overdue alert ─────────────────────────────────────────────────────────
    overdueAlertBg:     dk ? 'rgba(220,38,38,0.10)' : '#FEF2F2',
    overdueAlertBorder: dk ? '#7F1D1D'              : '#FECACA',
    overdueText:        dk ? '#FCA5A5'              : '#991B1B',

    // ── Filter toggles ────────────────────────────────────────────────────────
    filterTrackOff: dk ? '#2D3A4A' : '#E5E7EB',

    // ── Convenience shorthands (brand colours don't change) ─────────────────
    teal:  BRAND.teal,
    tealL: BRAND.tealLight,
  }
}

export type Theme = ReturnType<typeof theme>
