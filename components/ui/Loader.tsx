/**
 * ProGuild branded loader — the real icon sits still while a teal segment
 * traces the brand hexagon around it.
 *
 * Crisp at any size: the hexagon is vector SVG (pathLength-normalized so the
 * trace is exact at any dimension) and the logo is rendered at a 1:1 square so
 * it never distorts. Use size >= 40 so the icon detail stays clean.
 */
export default function Loader({
  size = 48,
  className = '',
  label = 'Loading',
}: { size?: number; className?: string; label?: string }) {
  const icon = Math.round(size * 0.52) // icon fits inside the traced hexagon

  return (
    <span
      role="status"
      aria-label={label}
      className={`relative inline-block align-middle ${className}`}
      style={{ width: size, height: size }}
    >
      {/* real icon, centered, square (no distortion) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/pg-mark.png"
        alt=""
        aria-hidden="true"
        width={icon}
        height={icon}
        className="absolute rounded-[26%]"
        style={{ top: (size - icon) / 2, left: (size - icon) / 2 }}
      />
      {/* tracing hexagon */}
      <svg
        viewBox="0 0 56 56"
        width={size}
        height={size}
        className="absolute inset-0"
        aria-hidden="true"
        fill="none"
      >
        <path
          className="pg-trace"
          d="M28 3 L49 15 L49 41 L28 53 L7 41 L7 15 Z"
          pathLength={100}
          stroke="#14B8A6"
          strokeWidth={Math.max(1.5, 140 / size)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="26 74"
        />
      </svg>
    </span>
  )
}
