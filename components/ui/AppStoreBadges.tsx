// Shared app-store badges. The ProGuild app is the CONTRACTOR CRM, so these
// belong on pro-facing surfaces (For Pros page, dashboard) — never the
// homeowner nav.
//
// variant="compact" (default): small icon + label, used in the dashboard
//   sidebar nudge.
// variant="store": official-style store badges (Google Play LIVE, App Store
//   COMING SOON — iOS is not approved yet, so we never show it as live).

export const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.proguild.mobile'

const APPLE_PATH = 'M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z'

function PlayMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#00A0FF" d="M4 3 L11.5 12 L4 21 Z" />
      <path fill="#00E676" d="M4 3 L17 10.1 L11.5 12 Z" />
      <path fill="#FFCE00" d="M11.5 12 L17 10.1 L20.5 12 L17 13.9 Z" />
      <path fill="#FF3A44" d="M4 21 L11.5 12 L17 13.9 Z" />
    </svg>
  )
}

// ── Official-style badge (black pill, two-line label) ────────────────────────
function StoreBadge({
  href, icon, top, bottom, title, dim = false,
}: {
  href?: string; icon: React.ReactNode; top: string; bottom: string; title: string; dim?: boolean
}) {
  const inner = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, textAlign: 'left' }}>
        <span style={{ fontSize: 9, letterSpacing: '0.04em', color: '#CBD5E1', fontWeight: 500 }}>{top}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginTop: 1 }}>{bottom}</span>
      </span>
    </>
  )
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 10,
    background: '#000000', border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: 11, padding: '9px 16px', textDecoration: 'none',
    opacity: dim ? 0.82 : 1, cursor: href ? 'pointer' : 'default',
    transition: 'opacity 0.15s, transform 0.15s',
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title} style={style}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}>
        {inner}
      </a>
    )
  }
  return <span title={title} style={style} aria-disabled>{inner}</span>
}

export default function AppStoreBadges({
  className = '',
  tone = 'light',
  variant = 'compact',
}: { className?: string; tone?: 'light' | 'dark'; variant?: 'compact' | 'store' }) {

  // ── Official store badges — marketing surfaces ─────────────────────────────
  if (variant === 'store') {
    return (
      <div className={`flex items-center ${className}`} style={{ gap: 12, flexWrap: 'wrap' }}>
        <StoreBadge
          href={ANDROID_URL}
          title="Get it on Google Play"
          icon={<PlayMark size={22} />}
          top="GET IT ON"
          bottom="Google Play"
        />
        <StoreBadge
          title="iOS app — coming soon (pending App Store approval)"
          dim
          icon={<svg width="18" height="22" viewBox="0 0 384 512" fill="#FFFFFF" aria-hidden="true"><path d={APPLE_PATH} /></svg>}
          top="COMING SOON"
          bottom="App Store"
        />
      </div>
    )
  }

  // ── Compact icon + label — dashboard sidebar ───────────────────────────────
  const fg = tone === 'dark' ? '#FFFFFF' : '#0A1628'
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
        title="Get it on Google Play">
        <PlayMark size={16} />
        <span className="text-sm font-semibold" style={{ color: fg }}>Android</span>
      </a>
      <span className="flex items-center gap-1.5 cursor-default select-none"
        title="iOS app — coming soon (pending App Store approval)">
        <svg width="14" height="17" viewBox="0 0 384 512" fill={fg} aria-hidden="true">
          <path d={APPLE_PATH} />
        </svg>
        <span className="text-sm font-semibold" style={{ color: fg }}>iOS</span>
        <span className="text-[9px] font-bold px-1 rounded" style={{ background: '#FBBF24', color: '#0A1628' }}>Soon</span>
      </span>
    </div>
  )
}
