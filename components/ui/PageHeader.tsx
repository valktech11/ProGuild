import { theme, T } from '@/lib/tokens'
import React from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode   // right-side CTA button
  dk: boolean
}

/**
 * Canonical page header — h1 + subtitle + optional right-side action.
 * <PageHeader title="Invoices" subtitle="Track and manage client payments" action={<Btn>New Invoice</Btn>} dk={dk} />
 */
export function PageHeader({ title, subtitle, action, dk }: PageHeaderProps) {
  const t = theme(dk)
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: T.sp4,
      marginBottom: T.sp6,
      flexWrap: 'wrap' as const,
    }}>
      <div>
        <h1 style={{ fontSize: T.fontTitle, fontWeight: 800, color: t.textPri, margin: 0, lineHeight: 1.2 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: T.fontBody, color: t.textMuted, marginTop: T.sp1, marginBottom: 0 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div style={{ flexShrink: 0 }}>
          {action}
        </div>
      )}
    </div>
  )
}
