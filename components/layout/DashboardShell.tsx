'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Session } from '@/types'
import { initials, avatarColor, planLabel } from '@/lib/utils'

// ── Nav structure ─────────────────────────────────────────────────────────────
type NavItem = {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number | null
  soon?: boolean
}

type NavGroup = {
  title: string
  items: NavItem[]
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const Icons = {
  overview:    <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  pipeline:    <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />,
  calendar:    <Icon d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />,
  messages:    <Icon d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  estimates:   <Icon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
  invoices:    <Icon d="M12 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM12 2v6h6M9 15l2 2 4-4" />,
  revenue:     <Icon d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />,
  clients:     <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  photos:      <Icon d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8" />,
  compliance:  <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  ai:          <Icon d="M12 2a10 10 0 100 20A10 10 0 0012 2zM12 8v4M12 16h.01" />,
  materials:   <Icon d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />,
  permit:      <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  time:        <Icon d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2" />,
  learn:       <Icon d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />,
  deals:       <Icon d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
  community:   <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  profile:     <Icon d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8" />,
  settings:    <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />,
  plus:        <Icon d="M12 5v14M5 12h14" size={22} />,
  more:        <Icon d="M3 12h18M3 6h18M3 18h18" size={22} />,
  chevron:     <Icon d="M9 18l6-6-6-6" size={16} />,
}

// ── Sidebar nav groups ────────────────────────────────────────────────────────
function buildNav(leads: number, newLeads: number): NavGroup[] {
  return [
    {
      title: 'TODAY',
      items: [
        { label: 'Overview',   href: '/dashboard',           icon: Icons.overview },
        { label: 'Pipeline',   href: '/dashboard/pipeline',  icon: Icons.pipeline, badge: newLeads },
        { label: 'Calendar',   href: '/dashboard/calendar',  icon: Icons.calendar,  soon: true },
        { label: 'Messages',   href: '/messages',            icon: Icons.messages },
      ],
    },
    {
      title: 'MONEY',
      items: [
        { label: 'Estimates',  href: '/dashboard/estimates', icon: Icons.estimates, soon: true },
        { label: 'Invoices',   href: '/dashboard/invoices',  icon: Icons.invoices,  soon: true },
        { label: 'Revenue',    href: '/dashboard/revenue',   icon: Icons.revenue,   soon: true },
      ],
    },
    {
      title: 'MY BUSINESS',
      items: [
        { label: 'Clients',    href: '/dashboard/clients',   icon: Icons.clients },
        { label: 'Photo Vault',href: '/dashboard/photos',    icon: Icons.photos,    soon: true },
        { label: 'Compliance', href: '/dashboard/compliance',icon: Icons.compliance,soon: true },
      ],
    },
    {
      title: 'TOOLS',
      items: [
        { label: 'AI Assistant',    href: '/dashboard/ai',        icon: Icons.ai,        soon: true },
        { label: 'Materials List',  href: '/dashboard/materials', icon: Icons.materials, soon: true },
        { label: 'Permit Tracker',  href: '/dashboard/permits',   icon: Icons.permit,    soon: true },
        { label: 'Time & Mileage',  href: '/dashboard/time',      icon: Icons.time,      soon: true },
      ],
    },
    {
      title: 'THE GUILD',
      items: [
        { label: 'Learn',      href: '/dashboard/learn',     icon: Icons.learn,     soon: true },
        { label: 'Local Deals',href: '/dashboard/deals',     icon: Icons.deals,     soon: true },
        { label: 'Community',  href: '/community',           icon: Icons.community },
      ],
    },
  ]
}

// ── NavItem component ─────────────────────────────────────────────────────────
function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const content = (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all relative group
      ${active
        ? 'text-white bg-white/10'
        : item.soon
          ? 'text-white/30 cursor-not-allowed'
          : 'text-white/60 hover:text-white hover:bg-white/8'
      }`}>
      {/* Active indicator */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
          style={{ backgroundColor: '#0F766E' }} />
      )}
      <span className={active ? 'text-white' : item.soon ? 'text-white/25' : 'text-white/50'}>
        {item.icon}
      </span>
      <span className="flex-1">{item.label}</span>
      {/* Badge */}
      {item.badge != null && item.badge > 0 && (
        <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
          style={{ backgroundColor: '#0F766E', color: 'white', minWidth: 18, textAlign: 'center' }}>
          {item.badge}
        </span>
      )}
      {/* Soon tooltip */}
      {item.soon && (
        <span className="hidden group-hover:block absolute left-full ml-2 top-1/2 -translate-y-1/2
          px-2 py-1 rounded text-xs font-medium whitespace-nowrap z-50"
          style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>
          Coming soon
        </span>
      )}
    </div>
  )

  if (item.soon) return content
  return <Link href={item.href}>{content}</Link>
}

// ── Quick Add button ──────────────────────────────────────────────────────────
function QuickAdd({ onAddLead }: { onAddLead: () => void }) {
  return (
    <button onClick={onAddLead}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold
        transition-all hover:opacity-90 active:scale-95"
      style={{ backgroundColor: '#0F766E', color: 'white' }}>
      {Icons.plus}
      Quick Add
    </button>
  )
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────
function MobileNav({ newLeads, onAddLead, onMore }: {
  newLeads: number
  onAddLead: () => void
  onMore: () => void
}) {
  const pathname = usePathname()

  const tabs = [
    { label: 'Today',    href: '/dashboard',          icon: Icons.overview },
    { label: 'Pipeline', href: '/dashboard/pipeline', icon: Icons.pipeline, badge: newLeads },
  ]
  const tabs2 = [
    { label: 'Clients',  href: '/dashboard/clients',  icon: Icons.clients },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{ backgroundColor: 'white', borderColor: '#E8E2D9', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(tab => {
          const active = pathname === tab.href
          return (
            <Link key={tab.href} href={tab.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg flex-1 relative">
              <span style={{ color: active ? '#0F766E' : '#9CA3AF' }}>{tab.icon}</span>
              <span className="text-xs font-medium" style={{ color: active ? '#0F766E' : '#9CA3AF' }}>
                {tab.label}
              </span>
              {tab.badge != null && tab.badge > 0 && (
                <span className="absolute top-0.5 right-3 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{ backgroundColor: '#0F766E', color: 'white', fontSize: 10 }}>
                  {tab.badge}
                </span>
              )}
            </Link>
          )
        })}

        {/* Centre FAB */}
        <button onClick={onAddLead}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg -mt-5
            transition-all active:scale-95 hover:opacity-90"
          style={{ backgroundColor: '#0F766E', color: 'white' }}>
          {Icons.plus}
        </button>

        {tabs2.map(tab => {
          const active = pathname === tab.href
          return (
            <Link key={tab.href} href={tab.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg flex-1">
              <span style={{ color: active ? '#0F766E' : '#9CA3AF' }}>{tab.icon}</span>
              <span className="text-xs font-medium" style={{ color: active ? '#0F766E' : '#9CA3AF' }}>
                {tab.label}
              </span>
            </Link>
          )
        })}

        {/* More */}
        <button onClick={onMore}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg flex-1">
          <span style={{ color: '#9CA3AF' }}>{Icons.more}</span>
          <span className="text-xs font-medium" style={{ color: '#9CA3AF' }}>More</span>
        </button>
      </div>
    </nav>
  )
}

// ── More drawer ───────────────────────────────────────────────────────────────
function MoreDrawer({ open, onClose, session, newLeads }: {
  open: boolean
  onClose: () => void
  session: Session | null
  newLeads: number
}) {
  const pathname = usePathname()
  const nav = buildNav(0, newLeads)
  if (!open) return null

  return (
    <div className="md:hidden fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Drawer */}
      <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
        style={{ backgroundColor: '#0A1628', maxHeight: '85vh', overflowY: 'auto' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        {/* Pro identity */}
        {session && (
          <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 mb-2">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ backgroundColor: avatarColor(session.name) }}>
              {initials(session.name)}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{session.name}</div>
              <div className="text-xs text-white/50">{planLabel(session.plan)} plan</div>
            </div>
          </div>
        )}
        {/* Nav groups */}
        <div className="px-3 pb-6">
          {nav.map(group => (
            <div key={group.title} className="mb-4">
              <div className="px-3 py-1 text-xs font-bold tracking-widest text-white/30 mb-1">
                {group.title}
              </div>
              {group.items.map(item => (
                <div key={item.href} onClick={!item.soon ? onClose : undefined}>
                  <NavLink item={item} active={pathname === item.href} />
                </div>
              ))}
            </div>
          ))}
          {/* Account */}
          <div className="mb-4">
            <div className="px-3 py-1 text-xs font-bold tracking-widest text-white/30 mb-1">ACCOUNT</div>
            <div onClick={onClose}><NavLink item={{ label: 'Profile', href: '/dashboard/edit-profile', icon: Icons.profile }} active={pathname === '/dashboard/edit-profile'} /></div>
            <div onClick={onClose}><NavLink item={{ label: 'Settings', href: '/dashboard/settings', icon: Icons.settings, soon: true }} active={false} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Quick Add sheet ───────────────────────────────────────────────────────────
function QuickAddSheet({ open, onClose, onAddLead }: {
  open: boolean
  onClose: () => void
  onAddLead: () => void
}) {
  if (!open) return null
  const options = [
    { label: 'New Lead',    sub: 'Add to your pipeline',    icon: Icons.pipeline, action: () => { onClose(); onAddLead() } },
    { label: 'New Client',  sub: 'Add to address book',     icon: Icons.clients,  action: () => { onClose(); window.location.href = '/dashboard/clients' } },
    { label: 'Estimate',    sub: 'Coming in v75',           icon: Icons.estimates,action: () => {},  soon: true },
    { label: 'Invoice',     sub: 'Coming in v76',           icon: Icons.invoices, action: () => {},  soon: true },
  ]
  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-5 pb-2">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">What do you want to add?</p>
          <div className="grid grid-cols-2 gap-3">
            {options.map(opt => (
              <button key={opt.label} onClick={opt.action}
                className={`flex flex-col items-start gap-1 p-4 rounded-2xl border text-left transition-all
                  ${opt.soon ? 'opacity-40 cursor-not-allowed' : 'active:scale-95 hover:border-teal-300'}`}
                style={{ borderColor: '#E8E2D9', backgroundColor: '#FAF9F6' }}>
                <span style={{ color: '#0F766E' }}>{opt.icon}</span>
                <span className="text-sm font-semibold" style={{ color: '#0A1628' }}>{opt.label}</span>
                <span className="text-xs" style={{ color: '#9CA3AF' }}>{opt.sub}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4">
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-medium"
            style={{ backgroundColor: '#F5F4F0', color: '#6B7280' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main shell ────────────────────────────────────────────────────────────────
export default function DashboardShell({
  children,
  session,
  newLeads = 0,
  onAddLead,
}: {
  children: React.ReactNode
  session: Session | null
  newLeads?: number
  onAddLead?: () => void
}) {
  const pathname = usePathname()
  const nav = buildNav(0, newLeads)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const handleAddLead = () => {
    if (onAddLead) onAddLead()
  }

  const handleMobileAdd = () => setSheetOpen(true)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F4F0' }}>

      {/* ── DESKTOP LAYOUT ──────────────────────────────────────────────── */}
      <div className="hidden md:flex h-screen overflow-hidden">

        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 flex flex-col h-full overflow-y-auto"
          style={{ backgroundColor: '#0A1628' }}>

          {/* Logo */}
          <div className="flex items-center gap-2 px-4 py-4 flex-shrink-0">
            <div className="w-7 h-7 flex-shrink-0">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z"
                  fill="url(#sb_grad)"/>
                <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white"
                  fontFamily="DM Sans,sans-serif">PG</text>
                <defs>
                  <linearGradient id="sb_grad" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-serif text-base font-bold tracking-tight text-white">ProGuild</span>
              <span className="font-sans text-sm font-medium" style={{ color: '#0F766E' }}>.ai</span>
            </div>
          </div>

          {/* Quick Add */}
          <div className="px-3 mb-4 flex-shrink-0">
            <QuickAdd onAddLead={handleAddLead} />
          </div>

          {/* Nav groups */}
          <div className="flex-1 px-3 overflow-y-auto">
            {nav.map(group => (
              <div key={group.title} className="mb-5">
                <div className="px-3 py-1 text-xs font-bold tracking-widest mb-1"
                  style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {group.title}
                </div>
                {group.items.map(item => (
                  <div key={item.href}>
                    <NavLink item={item} active={pathname === item.href} />
                  </div>
                ))}
              </div>
            ))}

            {/* Account */}
            <div className="mb-5">
              <div className="px-3 py-1 text-xs font-bold tracking-widest mb-1"
                style={{ color: 'rgba(255,255,255,0.25)' }}>
                ACCOUNT
              </div>
              <NavLink item={{ label: 'Profile', href: '/dashboard/edit-profile', icon: Icons.profile }}
                active={pathname === '/dashboard/edit-profile'} />
              <NavLink item={{ label: 'Settings', href: '/dashboard/settings', icon: Icons.settings, soon: true }}
                active={false} />
            </div>
          </div>

          {/* Pro avatar */}
          {session && (
            <div className="flex-shrink-0 border-t px-4 py-4"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: avatarColor(session.name) }}>
                  {initials(session.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{session.name}</div>
                  <div className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {planLabel(session.plan)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* ── MOBILE LAYOUT ───────────────────────────────────────────────── */}
      <div className="md:hidden">
        <main className="pb-20">
          {children}
        </main>
        <MobileNav
          newLeads={newLeads}
          onAddLead={handleMobileAdd}
          onMore={() => setMoreOpen(true)}
        />
        <MoreDrawer
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          session={session}
          newLeads={newLeads}
        />
        <QuickAddSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onAddLead={handleAddLead}
        />
      </div>
    </div>
  )
}

// Need React for useState
import React from 'react'
