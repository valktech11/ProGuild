// Shared app-store badges. The ProGuild app is the CONTRACTOR CRM, so these
// belong on pro-facing surfaces (For Pros page, dashboard) — never the
// homeowner nav. Flat icon + label, navy on light.

export const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.proguild.mobile'

const APPLE_PATH = 'M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z'

export default function AppStoreBadges({
  className = '',
  tone = 'light',
}: { className?: string; tone?: 'light' | 'dark' }) {
  const fg = tone === 'dark' ? '#FFFFFF' : '#0A1628'
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Google Play — live (multicolor mark reads on both tones) */}
      <a href={ANDROID_URL} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
        title="Get it on Google Play">
        <svg width="16" height="17" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#00A0FF" d="M4 3 L11.5 12 L4 21 Z"/>
          <path fill="#00E676" d="M4 3 L17 10.1 L11.5 12 Z"/>
          <path fill="#FFCE00" d="M11.5 12 L17 10.1 L20.5 12 L17 13.9 Z"/>
          <path fill="#FF3A44" d="M4 21 L11.5 12 L17 13.9 Z"/>
        </svg>
        <span className="text-sm font-semibold" style={{ color: fg }}>Android</span>
      </a>
      {/* App Store — coming soon */}
      <span className="flex items-center gap-1.5 cursor-default select-none"
        title="iOS app — coming soon (pending App Store approval)">
        <svg width="14" height="17" viewBox="0 0 384 512" fill={fg} aria-hidden="true">
          <path d={APPLE_PATH}/>
        </svg>
        <span className="text-sm font-semibold" style={{ color: fg }}>iOS</span>
        <span className="text-[9px] font-bold px-1 rounded" style={{ background: '#FBBF24', color: '#0A1628' }}>Soon</span>
      </span>
    </div>
  )
}
