'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AnyNavSection, AnyNavItem } from '@/lib/trades/_registry'
import type { PlanTier } from '@/types'
import { isPaidPlan, isElitePlan } from '@/types'

interface Props {
  nav:       AnyNavSection[]
  plan:      PlanTier
  tradeName: string
  tradeEmoji: string
  tradeColor: string
}

function NavItem({ item, plan, isActive }: {
  item:     AnyNavItem
  plan:     PlanTier
  isActive: boolean
}) {
  const isPro   = isPaidPlan(plan)
  const isElite = isElitePlan(plan)

  const locked =
    (item.badge === 'pro'   && !isPro)   ||
    (item.badge === 'elite' && !isElite) ||
    item.comingSoon

  return (
    <Link
      href={locked ? '/upgrade' : item.href}
      title={item.description}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all group relative"
      style={isActive
        ? { background: 'rgba(15,118,110,0.08)', color: '#0F766E', fontWeight: 600 }
        : { color: locked ? '#C4BCAF' : '#4B5563' }
      }
    >
      <span className="text-base leading-none flex-shrink-0">{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>

      {/* Badge chips */}
      {item.comingSoon && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#F3F4F6', color: '#9CA3AF' }}>
          Soon
        </span>
      )}
      {!item.comingSoon && item.badge === 'pro' && !isPro && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#FEF3C7', color: '#92400E' }}>
          Pro
        </span>
      )}
      {!item.comingSoon && item.badge === 'elite' && !isElite && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
          style={{ background: '#F5F3FF', color: '#5B21B6' }}>
          Elite
        </span>
      )}

      {/* Active indicator */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
          style={{ background: '#0F766E' }} />
      )}
    </Link>
  )
}

export default function TradeSidebar({ nav, plan, tradeName, tradeEmoji, tradeColor }: Props) {
  const pathname = usePathname()

  return (
    <aside
      className="hidden lg:flex flex-col w-56 flex-shrink-0 min-h-screen sticky top-0 border-r pt-6 pb-10 overflow-y-auto"
      style={{ borderColor: '#E8E2D9', background: '#FAFAF8' }}
    >
      {/* Trade identity header */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xl">{tradeEmoji}</span>
          <span className="text-xs font-bold uppercase tracking-wider"
            style={{ color: tradeColor }}>
            {tradeName}
          </span>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-2 space-y-6">
        {nav.map(section => (
          <div key={section.title}>
            <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: '#9CA3AF' }}>
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavItem
                  key={item.href}
                  item={item}
                  plan={plan}
                  isActive={pathname === item.href}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
