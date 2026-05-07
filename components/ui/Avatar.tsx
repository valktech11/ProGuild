import { avatarColor, initials } from '@/lib/utils'
import { T } from '@/lib/tokens'

interface AvatarProps {
  name: string
  size?: number   // px — default 36
  fontSize?: number
}

/** Initials circle with deterministic background colour from avatarColor() */
export function Avatar({ name, size = 36, fontSize }: AvatarProps) {
  const [bg, fg] = avatarColor(name || '?')
  const fs = fontSize ?? Math.round(size * 0.38)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fs, fontWeight: 700, flexShrink: 0,
      userSelect: 'none',
    }}>
      {initials(name || '?')}
    </div>
  )
}
