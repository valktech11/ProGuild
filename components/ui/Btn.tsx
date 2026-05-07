import React from 'react'
import { T, BRAND } from '@/lib/tokens'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface BtnProps {
  variant?:   Variant
  size?:      Size
  dk?:        boolean
  loading?:   boolean
  icon?:      React.ReactNode
  fullWidth?: boolean
  children?:  React.ReactNode
  disabled?:  boolean
  style?:     React.CSSProperties
  className?: string
  onClick?:   React.MouseEventHandler<HTMLButtonElement>
  type?:      'button' | 'submit' | 'reset'
  title?:     string
}

export function Btn({
  variant = 'primary',
  size    = 'md',
  dk      = false,
  loading = false,
  icon,
  fullWidth = false,
  children,
  disabled,
  style,
  ...rest
}: BtnProps) {
  const padding: Record<Size, string> = {
    sm: `${T.sp2}px ${T.sp3}px`,
    md: `${T.sp3}px ${T.sp5}px`,
    lg: `${T.sp4}px ${T.sp6}px`,
  }
  const fontSize: Record<Size, number> = {
    sm: T.fontSub,
    md: T.fontEmphasis,
    lg: T.fontLabel,
  }

  const base: React.CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            T.sp2,
    padding:        padding[size],
    fontSize:       fontSize[size],
    fontWeight:     700,
    borderRadius:   T.radSm,
    border:         'none',
    cursor:         disabled || loading ? 'not-allowed' : 'pointer',
    opacity:        disabled || loading ? 0.6 : 1,
    transition:     'opacity 0.15s, transform 0.1s',
    width:          fullWidth ? '100%' : undefined,
    whiteSpace:     'nowrap' as const,
    fontFamily:     'inherit',
    letterSpacing:  '0.01em',
  }

  const variants: Record<Variant, React.CSSProperties> = {
    primary: {
      background: `linear-gradient(135deg, ${BRAND.teal}, #0D9488)`,
      color:      '#FFFFFF',
      boxShadow:  '0 2px 8px rgba(15,118,110,0.25)',
    },
    secondary: {
      background: 'none',
      color:      BRAND.teal,
      border:     `1.5px solid ${BRAND.teal}`,
      boxShadow:  'none',
    },
    ghost: {
      background: dk ? '#243044' : '#F3F4F6',
      color:      dk ? '#CBD5E1' : '#374151',
      border:     `1.5px solid ${dk ? '#2D3A4A' : '#D1D5DB'}`,
      boxShadow:  'none',
    },
    danger: {
      background: BRAND.danger,
      color:      '#FFFFFF',
      boxShadow:  '0 2px 8px rgba(220,38,38,0.2)',
    },
  }

  return (
    <button
      disabled={disabled || loading}
      style={{ ...base, ...variants[variant], ...style }}
      {...rest}
    >
      {loading ? (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ animation: 'spin 0.7s linear infinite' }}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      ) : icon}
      {children}
    </button>
  )
}
