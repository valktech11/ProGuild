'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Session } from '@/types'
import { initials, avatarColor, planLabel } from '@/lib/utils'

type NavItem = { label: string; href: string; icon: (a: boolean) => React.ReactNode; badge?: number | null; soon?: boolean; exact?: boolean }
type NavGroup = { title: string; items: NavItem[] }

function Ic({ d, a }: { d: string; a: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={a ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const I = {
  overview:   (a: boolean) => <Ic a={a} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  pipeline:   (a: boolean) => <Ic a={a} d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />,
  calendar:   (a: boolean) => <Ic a={a} d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />,
  messages:   (a: boolean) => <Ic a={a} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  estimates:  (a: boolean) => <Ic a={a} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8" />,
  invoices:   (a: boolean) => <Ic a={a} d="M12 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM12 2v6h6M9 15l2 2 4-4" />,
  revenue:    (a: boolean) => <Ic a={a} d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />,
  clients:    (a: boolean) => <Ic a={a} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  photos:     (a: boolean) => <Ic a={a} d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8" />,
  compliance: (a: boolean) => <Ic a={a} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  ai:         (a: boolean) => <Ic a={a} d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />,
  materials:  (a: boolean) => <Ic a={a} d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />,
  permit:     (a: boolean) => <Ic a={a} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  time:       (a: boolean) => <Ic a={a} d="M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2" />,
  learn:      (a: boolean) => <Ic a={a} d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />,
  deals:      (a: boolean) => <Ic a={a} d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
  community:  (a: boolean) => <Ic a={a} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  profile:    (a: boolean) => <Ic a={a} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8" />,
  settings:   (a: boolean) => <Ic a={a} d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />,
}

function buildNav(nl: number): NavGroup[] {
  return [
    { title: 'TODAY', items: [
      { label: 'Overview',    href: '/dashboard',          icon: I.overview,   exact: true },
      { label: 'Pipeline',    href: '/dashboard/pipeline', icon: I.pipeline,   badge: nl },
      { label: 'Calendar',    href: '/dashboard/calendar', icon: I.calendar,   soon: true },
      { label: 'Messages',    href: '/messages',           icon: I.messages },
    ]},
    { title: 'MONEY', items: [
      { label: 'Estimates',   href: '/dashboard/estimates', icon: I.estimates,  soon: true },
      { label: 'Invoices',    href: '/dashboard/invoices',  icon: I.invoices,   soon: true },
      { label: 'Revenue',     href: '/dashboard/revenue',   icon: I.revenue,    soon: true },
    ]},
    { title: 'MY BUSINESS', items: [
      { label: 'Clients',     href: '/dashboard/clients',    icon: I.clients },
      { label: 'Photo Vault', href: '/dashboard/photos',     icon: I.photos,     soon: true },
      { label: 'Compliance',  href: '/dashboard/compliance', icon: I.compliance, soon: true },
    ]},
    { title: 'TOOLS', items: [
      { label: 'AI Assistant',   href: '/dashboard/ai',        icon: I.ai,        soon: true },
      { label: 'Materials',      href: '/dashboard/materials', icon: I.materials, soon: true },
      { label: 'Permit Tracker', href: '/dashboard/permits',   icon: I.permit,    soon: true },
      { label: 'Time & Mileage', href: '/dashboard/time',      icon: I.time,      soon: true },
    ]},
    { title: 'THE GUILD', items: [
      { label: 'Learn',       href: '/dashboard/learn', icon: I.learn,     soon: true },
      { label: 'Local Deals', href: '/dashboard/deals', icon: I.deals,     soon: true },
      { label: 'Community',   href: '/community',       icon: I.community },
    ]},
  ]
}

function NavLink({ item, active, onNav }: { item: NavItem; active: boolean; onNav?: () => void }) {
  const base = (
    <div className="relative flex items-center gap-2.5 px-3 py-[7px] rounded-[9px] text-[12.5px] font-medium transition-all duration-100 select-none"
      style={active ? {
        background: 'linear-gradient(135deg,rgba(20,184,166,.22) 0%,rgba(20,184,166,.08) 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(20,184,166,.22)',
        color: '#fff',
      } : item.soon ? { color: 'rgba(255,255,255,.18)', cursor: 'default' } : { color: 'rgba(255,255,255,.44)' }}
    >
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[16px] rounded-r-full" style={{ background: 'linear-gradient(to bottom,#2DD4BF,#0F766E)' }} />}
      <span style={{ color: active ? '#5EEAD4' : item.soon ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.28)' }} className="flex-shrink-0">
        {item.icon(active)}
      </span>
      <span className="flex-1">{item.label}</span>
      {(item.badge ?? 0) > 0 && (
        <span className="flex items-center justify-center h-[17px] min-w-[17px] px-1 rounded-full text-[10px] font-bold" style={{ background: 'linear-gradient(135deg,#14B8A6,#0C6B62)', color: '#fff' }}>
          {item.badge}
        </span>
      )}
      {item.soon && <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: 'rgba(255,255,255,.08)' }} />}
    </div>
  )
  if (item.soon) return base
  return <Link href={item.href} onClick={onNav} className="block">{base}</Link>
}

function Avatar({ session, px }: { session: Session; px: number }) {
  const [bg, fg] = avatarColor(session.name || 'P')
  if ((session as any).avatar_url) return <img src={(session as any).avatar_url} alt={session.name} className="rounded-full object-cover flex-shrink-0" style={{ width: px, height: px }} />
  return <div className="rounded-full flex items-center justify-center font-semibold flex-shrink-0" style={{ width: px, height: px, background: bg, color: fg, fontSize: px * .38 }}>{initials(session.name || 'P')}</div>
}

const SB = `
.pg-sb::-webkit-scrollbar{width:3px}.pg-sb::-webkit-scrollbar-track{background:transparent}.pg-sb::-webkit-scrollbar-thumb{background:rgba(255,255,255,.07);border-radius:99px}.pg-sb::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.15)}
.pg-main::-webkit-scrollbar{width:4px}.pg-main::-webkit-scrollbar-track{background:transparent}.pg-main::-webkit-scrollbar-thumb{background:rgba(0,0,0,.1);border-radius:99px}.pg-main::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.18)}
`

function MobileNav({ nl, onAdd, onMore }: { nl: number; onAdd: () => void; onMore: () => void }) {
  const p = usePathname()
  const isA = (h: string, ex?: boolean) => ex ? p === h : p === h
  const left  = [{ label: 'Today', href: '/dashboard', icon: I.overview, exact: true }, { label: 'Pipeline', href: '/dashboard/pipeline', icon: I.pipeline, badge: nl }]
  const right = [{ label: 'Clients', href: '/dashboard/clients', icon: I.clients }]
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{ background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderTop: '1px solid rgba(0,0,0,.06)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-[60px] px-1">
        {left.map(t => { const a = isA(t.href, t.exact); return (
          <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 flex-1 py-2 relative">
            <span style={{ color: a ? '#0F766E' : '#BEB5A9' }}>{t.icon(a)}</span>
            <span className="text-[10px] font-semibold" style={{ color: a ? '#0F766E' : '#BEB5A9' }}>{t.label}</span>
            {(t.badge ?? 0) > 0 && <span className="absolute top-1 right-2.5 w-[14px] h-[14px] rounded-full flex items-center justify-center" style={{ background: '#0F766E', color: '#fff', fontSize: 8, fontWeight: 700 }}>{t.badge}</span>}
          </Link>
        )})}
        <button onClick={onAdd} className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center -mt-4 transition-all active:scale-95" style={{ background: 'linear-gradient(145deg,#14B8A6 0%,#0A6B63 100%)', boxShadow: '0 8px 24px rgba(15,118,110,.45)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        {right.map(t => { const a = isA(t.href); return (
          <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 flex-1 py-2">
            <span style={{ color: a ? '#0F766E' : '#BEB5A9' }}>{t.icon(a)}</span>
            <span className="text-[10px] font-semibold" style={{ color: a ? '#0F766E' : '#BEB5A9' }}>{t.label}</span>
          </Link>
        )})}
        <button onClick={onMore} className="flex flex-col items-center gap-0.5 flex-1 py-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BEB5A9" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          <span className="text-[10px] font-semibold" style={{ color: '#BEB5A9' }}>More</span>
        </button>
      </div>
    </nav>
  )
}

function MoreDrawer({ open, onClose, session, nl }: { open: boolean; onClose: () => void; session: Session | null; nl: number }) {
  const p = usePathname()
  const nav = buildNav(nl)
  if (!open) return null
  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      <div className="absolute inset-0" onClick={onClose} style={{ background: 'rgba(8,18,34,.68)', backdropFilter: 'blur(6px)' }} />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-[28px]" style={{ background: 'linear-gradient(175deg,#0E2040 0%,#091524 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex justify-center pt-3"><div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,.12)' }} /></div>
        {session && (
          <div className="flex items-center gap-3 mx-4 mt-4 mb-2 px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
            <Avatar session={session} px={36} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">{session.name}</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,.32)' }}>{planLabel(session.plan)}</div>
            </div>
          </div>
        )}
        <div className="px-3 pb-8">
          {nav.map(g => (
            <div key={g.title} className="mb-1.5">
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-[.12em]" style={{ color: 'rgba(255,255,255,.16)' }}>{g.title}</div>
              {g.items.map(item => <div key={item.href}><NavLink item={item} active={p === item.href} onNav={onClose} /></div>)}
            </div>
          ))}
          <div className="pt-2 mb-1.5" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
            <div className="px-3 pt-3 pb-1 text-[10px] font-bold tracking-[.12em]" style={{ color: 'rgba(255,255,255,.16)' }}>ACCOUNT</div>
            <NavLink item={{ label: 'Profile', href: '/edit-profile', icon: I.profile }} active={p === '/edit-profile'} onNav={onClose} />
            <NavLink item={{ label: 'Settings', href: '/dashboard/settings', icon: I.settings, soon: true }} active={false} />
          </div>
        </div>
      </div>
    </div>
  )
}

function QuickSheet({ open, onClose, onAddLead }: { open: boolean; onClose: () => void; onAddLead: () => void }) {
  if (!open) return null
  const opts = [
    { label: 'New Lead',   sub: 'Add to pipeline',    icon: I.pipeline,  fn: () => { onClose(); onAddLead() },                                         soon: false },
    { label: 'New Client', sub: 'Add to address book', icon: I.clients,   fn: () => { onClose(); window.location.href = '/dashboard/clients' }, soon: false },
    { label: 'Estimate',   sub: 'Coming in v75',       icon: I.estimates, fn: () => {},                                                                  soon: true  },
    { label: 'Invoice',    sub: 'Coming in v76',        icon: I.invoices,  fn: () => {},                                                                  soon: true  },
  ]
  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      <div className="absolute inset-0" onClick={onClose} style={{ background: 'rgba(8,18,34,.45)', backdropFilter: 'blur(4px)' }} />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-[28px] bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-center pt-3"><div className="w-9 h-1 rounded-full bg-gray-200" /></div>
        <div className="px-5 pt-3 pb-2">
          <p className="text-[11px] font-bold tracking-[.1em] uppercase mb-4" style={{ color: '#BEB5A9' }}>What would you like to add?</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {opts.map(o => (
              <button key={o.label} onClick={o.fn} disabled={o.soon}
                className="flex flex-col items-start gap-2 p-4 rounded-2xl text-left transition-all active:scale-[.97]"
                style={{ backgroundColor: o.soon ? '#FAFAF9' : '#F5F4F0', border: `1px solid ${o.soon ? '#EDE9E4' : '#E2DDD8'}`, opacity: o.soon ? .4 : 1 }}>
                <span style={{ color: '#0F766E' }}>{o.icon(false)}</span>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: '#0A1628' }}>{o.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>{o.sub}</div>
                </div>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl text-sm font-semibold mb-3" style={{ backgroundColor: '#F5F4F0', color: '#9CA3AF' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardShell({ children, session, newLeads = 0, onAddLead }: {
  children: React.ReactNode; session: Session | null; newLeads?: number; onAddLead?: () => void
}) {
  const p = usePathname()
  const nav = buildNav(newLeads)
  const [moreOpen,  setMoreOpen]  = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const isA = (h: string, ex?: boolean) => ex ? p === h : p === h

  return (
    <>
      <style>{SB}</style>
      <div className="min-h-screen" style={{ backgroundColor: '#ECEAE5' }}>

        {/* DESKTOP */}
        <div className="hidden md:flex h-screen overflow-hidden">
          <aside className="pg-sb w-[214px] flex-shrink-0 flex flex-col h-full overflow-y-auto" style={{ background: 'linear-gradient(170deg,#0D1F38 0%,#091524 100%)', borderRight: '1px solid rgba(255,255,255,.04)' }}>

            {/* Logo */}
            <div className="flex items-center gap-2.5 px-5 pt-5 pb-4 flex-shrink-0">
              <svg width="27" height="27" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#sg)"/>
                <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                <defs><linearGradient id="sg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs>
              </svg>
              <div className="flex items-baseline gap-[1px]">
                <span className="font-serif text-[15px] font-bold text-white tracking-tight">ProGuild</span>
                <span className="text-[13px] font-semibold" style={{ color: '#2DD4BF' }}>.ai</span>
              </div>
            </div>

            {/* Quick Add */}
            <div className="px-4 mb-5 flex-shrink-0">
              <button onClick={onAddLead}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12.5px] font-semibold tracking-wide transition-all hover:opacity-90 active:scale-[.98]"
                style={{ background: 'linear-gradient(135deg,#14B8A6 0%,#0A6B63 100%)', color: '#fff', boxShadow: '0 4px 16px rgba(20,184,166,.3)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Quick Add
              </button>
            </div>

            {/* Nav */}
            <div className="flex-1 px-3 pb-4 overflow-y-auto">
              {nav.map((g, gi) => (
                <div key={g.title} className={gi > 0 ? 'mt-3' : ''}>
                  <div className="px-3 pb-1.5 text-[9.5px] font-bold tracking-[.14em]" style={{ color: 'rgba(255,255,255,.16)' }}>{g.title}</div>
                  {g.items.map(item => <div key={item.href}><NavLink item={item} active={isA(item.href, item.exact)} /></div>)}
                </div>
              ))}
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                <div className="px-3 pb-1.5 text-[9.5px] font-bold tracking-[.14em]" style={{ color: 'rgba(255,255,255,.16)' }}>ACCOUNT</div>
                <NavLink item={{ label: 'Profile', href: '/edit-profile', icon: I.profile }} active={p === '/edit-profile'} />
                <NavLink item={{ label: 'Settings', href: '/dashboard/settings', icon: I.settings, soon: true }} active={false} />
              </div>
            </div>

            {/* Pro */}
            {session && (
              <div className="flex-shrink-0 px-4 py-3.5" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                <div className="flex items-center gap-2.5">
                  <Avatar session={session} px={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-white truncate">{session.name}</div>
                    <div className="text-[10.5px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,.28)' }}>{planLabel(session.plan)}</div>
                  </div>
                </div>
              </div>
            )}
          </aside>

          <main className="pg-main flex-1 overflow-y-auto" style={{ backgroundColor: '#ECEAE5' }}>
            {children}
          </main>
        </div>

        {/* MOBILE */}
        <div className="md:hidden">
          <main className="pb-[68px] min-h-screen" style={{ backgroundColor: '#ECEAE5' }}>
            {children}
          </main>
          <MobileNav nl={newLeads} onAdd={() => setSheetOpen(true)} onMore={() => setMoreOpen(true)} />
          <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} session={session} nl={newLeads} />
          <QuickSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onAddLead={() => { if (onAddLead) onAddLead() }} />
        </div>
      </div>
    </>
  )
}
