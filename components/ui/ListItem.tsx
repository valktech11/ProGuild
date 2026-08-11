/**
 * components/ui/ListItem.tsx
 * Canonical list row — property rows, report rows, client rows, lead rows.
 *
 * <ListItem
 *   dk={dk}
 *   icon={<HouseIcon />}
 *   title="1704 Avondale Avenue"
 *   subtitle="Jacksonville, FL 32205"
 *   meta="Today"
 *   badge={<Badge status="Quoted" type="stage" dk={dk} />}
 *   chip="31.5 sq · 6/12"
 *   chipColor="#0F766E"
 *   onClick={() => router.push('/property/id')}
 *   actions={<Btn size="sm">View</Btn>}
 * />
 */
import React from 'react'
import { theme, T } from '@/lib/tokens'

interface ListItemProps {
  dk?:          boolean
  icon?:        React.ReactNode          // left icon/avatar block (32–44px)
  iconBg?:      string                   // icon container background
  title:        string
  subtitle?:    string
  meta?:        string                   // right-aligned secondary text (date, time)
  badge?:       React.ReactNode          // status badge
  chip?:        string                   // small data pill (e.g. "31.5 sq · 6/12")
  chipColor?:   string
  actions?:     React.ReactNode          // right side action buttons
  onClick?:     () => void
  style?:       React.CSSProperties
  separator?:   boolean                  // show top border (for lists)
  href?:        string
  children?:    React.ReactNode          // extra content below subtitle
}

export function ListItem({
  dk = false,
  icon,
  iconBg,
  title,
  subtitle,
  meta,
  badge,
  chip,
  chipColor,
  actions,
  onClick,
  style,
  separator = false,
  href,
  children,
}: ListItemProps) {
  const t = theme(dk)

  const content = (
    <div
      onClick={onClick}
      style={{
        display:          'flex',
        alignItems:       'center',
        gap:              T.sp3,
        padding:          `${T.sp3}px ${T.sp4}px`,
        borderTop:        separator ? `1px solid ${t.cardBorder}` : 'none',
        cursor:           onClick || href ? 'pointer' : 'default',
        transition:       'background 0.1s',
        ...style,
      }}
      onMouseEnter={e => { if (onClick || href) (e.currentTarget as HTMLElement).style.background = t.cardBgHover }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* Left icon */}
      {icon && (
        <div style={{
          width:          40,
          height:         40,
          borderRadius:   T.radSm,
          background:     iconBg ?? (dk ? '#1A2A3A' : '#F0FDFA'),
          border:         `1.5px solid ${dk ? '#2D3A4A' : '#CCFBF1'}`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}>
          {icon}
        </div>
      )}

      {/* Text block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2, flexWrap: 'wrap' as const }}>
          <span style={{
            fontSize:     T.fontEmphasis,
            fontWeight:   700,
            color:        t.textPri,
            whiteSpace:   'nowrap' as const,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
          }}>
            {title}
          </span>
          {badge}
        </div>
        {subtitle && (
          <span style={{ fontSize: T.fontSub, color: t.textMuted, display: 'block', marginTop: 1 }}>
            {subtitle}
          </span>
        )}
        {chip && (
          <span style={{
            display:      'inline-block',
            fontSize:     T.fontBadge,
            fontWeight:   600,
            color:        chipColor ?? t.teal,
            marginTop:    T.sp1,
          }}>
            {chip}
          </span>
        )}
        {children}
      </div>

      {/* Right: meta + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: T.sp2, flexShrink: 0 }}>
        {meta && (
          <span style={{ fontSize: T.fontSub, color: t.textSubtle, whiteSpace: 'nowrap' as const }}>
            {meta}
          </span>
        )}
        {actions}
        {(onClick || href) && !actions && (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke={t.textSubtle} strokeWidth={2.5} strokeLinecap="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        )}
      </div>
    </div>
  )

  if (href) return <a href={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</a>
  return content
}
