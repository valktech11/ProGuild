/**
 * components/ui/Card.tsx
 * Canonical surface container — replaces every ad-hoc cardBg/cardBorder block.
 *
 * <Card dk={dk}>…</Card>
 * <Card dk={dk} pad="lg" radius="xl" shadow>…</Card>
 * <Card dk={dk} variant="teal">…</Card>   ← teal-tinted highlight card
 * <Card dk={dk} variant="danger">…</Card> ← error/destructive card
 */
import React from 'react'
import { theme, T } from '@/lib/tokens'

type CardVariant = 'default' | 'teal' | 'warning' | 'danger' | 'purple'
type CardPad     = 'none' | 'sm' | 'md' | 'lg'
type CardRadius  = 'sm' | 'md' | 'lg' | 'xl'

interface CardProps {
  dk?:       boolean
  variant?:  CardVariant
  pad?:      CardPad
  radius?:   CardRadius
  shadow?:   boolean
  hover?:    boolean          // adds hover background shift
  onClick?:  () => void
  style?:    React.CSSProperties
  className?: string
  children?: React.ReactNode
}

const PAD: Record<CardPad, string> = {
  none: '0',
  sm:   `${T.sp3}px`,
  md:   `${T.sp4}px`,
  lg:   `${T.sp6}px`,
}
const RAD: Record<CardRadius, number> = {
  sm: T.radSm,
  md: T.radMd,
  lg: T.radLg,
  xl: T.radXl,
}

export function Card({
  dk = false,
  variant = 'default',
  pad = 'md',
  radius = 'md',
  shadow = false,
  hover = false,
  onClick,
  style,
  className,
  children,
}: CardProps) {
  const t = theme(dk)

  const variantStyles: Record<CardVariant, React.CSSProperties> = {
    default: {
      background:  t.cardBg,
      border:      `1px solid ${t.cardBorder}`,
    },
    teal: {
      background:  dk ? '#0D2820' : '#F0FDFA',
      border:      `1px solid ${dk ? '#0F4A3A' : '#99F6E4'}`,
    },
    warning: {
      background:  t.warningBg,
      border:      `1px solid ${t.warningBorder}`,
    },
    danger: {
      background:  t.dangerBg,
      border:      `1px solid ${t.dangerBorder}`,
    },
    purple: {
      background:  t.accentPurpleBg,
      border:      `1px solid ${t.accentPurpleBorder}`,
    },
  }

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        borderRadius:  RAD[radius],
        padding:       PAD[pad],
        boxShadow:     shadow ? '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)' : 'none',
        cursor:        onClick ? 'pointer' : 'default',
        transition:    hover || onClick ? 'background 0.12s' : 'none',
        overflow:      'hidden',
        ...variantStyles[variant],
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Horizontal divider inside a Card — matches card border colour */
export function CardDivider({ dk = false }: { dk?: boolean }) {
  const t = theme(dk)
  return <div style={{ height: 1, background: t.cardBorder, marginLeft: -T.sp4, marginRight: -T.sp4 }} />
}
