/**
 * ProGuild Design Tokens
 * Single source of truth for dark/light mode colors.
 * Import and call theme(dk) in any component that accepts a darkMode prop.
 */
export function theme(dk: boolean) {
  return {
    // Page & card backgrounds
    pageBg:       dk ? '#0A1628' : '#F5F4F0',
    cardBg:       dk ? '#1E293B' : '#ffffff',
    cardBgAlt:    dk ? '#0F172A' : '#F9FAFB',   // slightly recessed areas (tax row, notes bg)
    cardBgEdit:   dk ? '#1a2e44' : '#F0FDF9',   // edit mode highlight

    // Borders
    cardBorder:   dk ? '#334155' : '#E8E2D9',   // card / section dividers
    inputBorder:  dk ? '#475569' : '#D1D5DB',   // inputs, action buttons — must be visible
    divider:      dk ? '#1E293B' : '#F3F4F6',   // subtle inner table dividers

    // Text
    textPri:      dk ? '#F1F5F9' : '#111827',   // headings, names, primary values
    textBody:     dk ? '#CBD5E1' : '#374151',   // body text, amounts, button labels
    textMuted:    dk ? '#94A3B8' : '#4B5563',   // labels, secondary info, placeholders
    textSubtle:   dk ? '#64748B' : '#6B7280',   // timestamps, hints — use sparingly

    // Interactive
    btnBorder:    dk ? '#475569' : '#D1D5DB',   // icon action buttons
    btnText:      dk ? '#CBD5E1' : '#374151',   // icon action buttons text/icon color
    btnHoverBg:   dk ? '#334155' : '#F9FAFB',

    // Inputs
    inputBg:      dk ? '#0F172A' : '#ffffff',

    // Table alternating rows
    tableRowAlt:  dk ? '#1a2535' : '#F9F8F6',   // odd rows — warm off-white / dark blue-gray
    tableRowHover:dk ? '#1a2940' : '#F0FAFA',   // hover — light teal tint

    // Misc
    teal:         '#0F766E',
    tealL:        '#14B8A6',

    // Calendar — semantic tokens (no hardcoding in calendar components)
    calSidebar:       dk ? '#0F172A' : '#F7F6F3',
    calToolbar:       dk ? '#1E293B' : '#ffffff',
    calGridBg:        dk ? '#0F172A' : '#ffffff',
    calColToday:      dk ? 'rgba(15,118,110,0.12)' : '#F0FDFA',
    calColWeekend:    dk ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
    calColSelected:   dk ? 'rgba(15,118,110,0.07)' : '#F9FEFE',
    calDayHeader:     dk ? '#1E293B' : '#ffffff',
    calCellBorder:    dk ? '#1E2D3D' : '#F0EEE9',
    calEmptyText:     dk ? '#334155' : '#D1D5DB',
    calAgendaBg:      dk ? '#0A1628' : '#F7F6F3',
    calChipJobBg:     dk ? '#0D2B25' : '#CCFBF1',
    calChipJobText:   dk ? '#5EEAD4' : '#0F766E',
    calChipFuBg:      dk ? '#2D1F00' : '#FEF3C7',
    calChipFuText:    dk ? '#FCD34D' : '#92400E',
    filterTrackOff:   dk ? '#1E293B' : '#E5E7EB',
    overdueAlertBg:   dk ? '#2D0A0A' : '#FEF2F2',
    overdueAlertBorder:dk ? '#7F1D1D' : '#FECACA',
    overdueText:      dk ? '#FCA5A5' : '#991B1B',
  }
}

export type Theme = ReturnType<typeof theme>

// Status-aware event chip colors — dark mode aware
export function statusColors(status: string, isFollowup: boolean, dk: boolean) {
  if (isFollowup) return { bg: dk?'#2D1F00':'#FEF3C7', border:'#D97706', text: dk?'#FCD34D':'#92400E', chipBg: dk?'#3D2800':'#FDE68A' }
  const map: Record<string, {bg:string;border:string;text:string;chipBg:string}> = {
    New:       { bg: dk?'#2D1A00':'#FEF3C7', border:'#D97706', text: dk?'#FCD34D':'#D97706', chipBg: dk?'#3D2400':'#FDE68A' },
    Contacted: { bg: dk?'#0A1628':'#DBEAFE', border:'#2563EB', text: dk?'#93C5FD':'#2563EB', chipBg: dk?'#1E3A5F':'#BFDBFE' },
    Quoted:    { bg: dk?'#1A0A2E':'#EDE9FE', border:'#7C3AED', text: dk?'#C4B5FD':'#7C3AED', chipBg: dk?'#2E1065':'#DDD6FE' },
    Scheduled: { bg: dk?'#0D2B25':'#CCFBF1', border:'#0F766E', text: dk?'#5EEAD4':'#0F766E', chipBg: dk?'#134E4A':'#99F6E4' },
    Completed: { bg: dk?'#1E293B':'#F3F4F6', border:'#6B7280', text: dk?'#9CA3AF':'#374151', chipBg: dk?'#374151':'#E5E7EB' },
    Paid:      { bg: dk?'#052E16':'#DCFCE7', border:'#15803D', text: dk?'#86EFAC':'#15803D', chipBg: dk?'#14532D':'#BBF7D0' },
  }
  return map[status] || map['Scheduled']
}
