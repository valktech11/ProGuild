import { theme, T, PAGE_MAX_W } from '@/lib/tokens'
import React from 'react'

interface PageContainerProps {
  children: React.ReactNode
  dk: boolean
  /** Override max-width — default is PAGE_MAX_W (1200px) */
  maxWidth?: number
  /** For full-height pages like Calendar that handle their own layout */
  fullHeight?: boolean
}

/**
 * Canonical page content wrapper.
 * Provides consistent max-width, padding, background for ALL dashboard pages.
 *
 * Wrap the entire page content (inside DashboardShell) with this:
 * <PageContainer dk={dk}>
 *   <PageHeader ... />
 *   ...content...
 * </PageContainer>
 */
export function PageContainer({ children, dk, maxWidth, fullHeight }: PageContainerProps) {
  const t = theme(dk)
  if (fullHeight) {
    return (
      <div style={{ background: t.pageBg, minHeight: '100%', height: '100%' }}>
        {children}
      </div>
    )
  }
  return (
    <div style={{ background: t.pageBg, minHeight: '100vh', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
      <div style={{
        maxWidth: maxWidth ?? PAGE_MAX_W,
        margin: '0 auto',
        padding: `${T.sp6}px ${T.sp4}px`,
      }}
        className="md:px-8 md:py-8">
        {children}
      </div>
    </div>
  )
}
