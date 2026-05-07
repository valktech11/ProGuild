import { theme, T, BRAND } from '@/lib/tokens'

interface EmptyStateProps {
  icon?: string          // emoji
  title: string
  description?: string
  ctaLabel?: string
  onCta?: () => void
  ctaHref?: string
  dk: boolean
}

/**
 * Canonical empty state.
 * <EmptyState icon="📋" title="No leads yet" description="Add your first lead." ctaLabel="Add Lead" onCta={...} dk={dk} />
 */
export function EmptyState({ icon, title, description, ctaLabel, onCta, ctaHref, dk }: EmptyStateProps) {
  const t = theme(dk)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: `${T.sp10}px ${T.sp6}px`,
      textAlign: 'center',
    }}>
      {icon && (
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: `linear-gradient(135deg, ${BRAND.teal}18, ${BRAND.tealLight}18)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, marginBottom: T.sp5,
        }}>
          {icon}
        </div>
      )}
      <div style={{ fontSize: T.fontLabel, fontWeight: 700, color: t.textPri, marginBottom: T.sp2 }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: T.fontBody, color: t.textBody, marginBottom: T.sp6, maxWidth: 340, lineHeight: T.lineRelaxed }}>
          {description}
        </div>
      )}
      {ctaLabel && (onCta || ctaHref) && (
        ctaHref ? (
          <a href={ctaHref} style={{
            display: 'inline-flex', alignItems: 'center', gap: T.sp2,
            padding: `${T.sp3}px ${T.sp6}px`,
            borderRadius: T.radMd,
            background: `linear-gradient(135deg, ${BRAND.teal}, #0D9488)`,
            color: 'white', fontSize: T.fontEmphasis, fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 4px 14px rgba(15,118,110,0.25)',
          }}>
            {ctaLabel}
          </a>
        ) : (
          <button onClick={onCta} style={{
            display: 'inline-flex', alignItems: 'center', gap: T.sp2,
            padding: `${T.sp3}px ${T.sp6}px`,
            borderRadius: T.radMd, border: 'none',
            background: `linear-gradient(135deg, ${BRAND.teal}, #0D9488)`,
            color: 'white', fontSize: T.fontEmphasis, fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(15,118,110,0.25)',
          }}>
            {ctaLabel}
          </button>
        )
      )}
    </div>
  )
}
