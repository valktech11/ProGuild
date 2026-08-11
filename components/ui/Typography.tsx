/**
 * components/ui/Typography.tsx
 * Canonical text components — replaces all hardcoded fontSize/color pairs.
 *
 * <PageTitle dk={dk}>Property Profiles</PageTitle>
 * <SectionLabel dk={dk}>Roofing Tools</SectionLabel>
 * <BodyText dk={dk} muted>Last updated 2 days ago</BodyText>
 */
import React from 'react'
import { theme, T } from '@/lib/tokens'

interface TextProps {
  dk?:       boolean
  muted?:    boolean
  subtle?:   boolean
  children:  React.ReactNode
  style?:    React.CSSProperties
  className?: string
}

/** Page h1 — 24px bold */
export function PageTitle({ dk = false, children, style }: TextProps) {
  const t = theme(dk)
  return (
    <h1 style={{ fontSize: T.fontTitle, fontWeight: 800, color: t.textPri, margin: 0, lineHeight: T.lineSnug, ...style }}>
      {children}
    </h1>
  )
}

/** Section h2 — 18px bold */
export function SectionHeading({ dk = false, children, style }: TextProps) {
  const t = theme(dk)
  return (
    <h2 style={{ fontSize: T.fontHeading, fontWeight: 700, color: t.textPri, margin: 0, lineHeight: T.lineSnug, ...style }}>
      {children}
    </h2>
  )
}

/** Card title — 16px bold */
export function CardTitle({ dk = false, children, style }: TextProps) {
  const t = theme(dk)
  return (
    <h3 style={{ fontSize: T.fontLabel, fontWeight: 700, color: t.textPri, margin: 0, lineHeight: T.lineSnug, ...style }}>
      {children}
    </h3>
  )
}

/** Uppercase section label — 11px tracking */
export function SectionLabel({ dk = false, children, style }: TextProps) {
  const t = theme(dk)
  return (
    <span style={{
      fontSize:      T.fontBadge,
      fontWeight:    700,
      color:         t.textMuted,
      letterSpacing: '0.07em',
      textTransform: 'uppercase' as const,
      ...style,
    }}>
      {children}
    </span>
  )
}

/** Standard body text — 14px */
export function BodyText({ dk = false, muted, subtle, children, style }: TextProps) {
  const t = theme(dk)
  const color = subtle ? t.textSubtle : muted ? t.textMuted : t.textBody
  return (
    <p style={{ fontSize: T.fontBody, color, margin: 0, lineHeight: T.lineNormal, ...style }}>
      {children}
    </p>
  )
}

/** Small metadata / timestamp — 12px */
export function MetaText({ dk = false, muted, subtle, children, style }: TextProps) {
  const t = theme(dk)
  const color = subtle ? t.textSubtle : muted ? t.textMuted : t.textBody
  return (
    <span style={{ fontSize: T.fontSub, color, lineHeight: T.lineNormal, ...style }}>
      {children}
    </span>
  )
}
