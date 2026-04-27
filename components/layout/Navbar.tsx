'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Session } from '@/types'
import { initials, avatarColor } from '@/lib/utils'


// ── Staging environment badge ────────────────────────────────────────────────
declare const process: { env: Record<string, string | undefined> }
const NEXT_PUBLIC_ENV = process.env.NEXT_PUBLIC_ENV
function StagingBadge() {
  if (NEXT_PUBLIC_ENV !== 'staging') return null
  return (
    <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold tracking-wide"
      style={{ backgroundColor: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D' }}>
      STAGING
    </span>
  )
}

// ── Role-aware nav links ────────────────────────────────────────────────────
// Homeowner (logged out): Find a Pro · Request a Pro · Community
// Pro (logged in):        Find Work · Community · Dashboard
const HOMEOWNER_LINKS = [
  { href: '/',           label: 'Find a Pro',     match: (p: string) => p === '/' },
  { href: '/post-job',   label: 'Request a Pro',  match: (p: string) => p === '/post-job' },
  { href: '/community',  label: 'Community',      match: (p: string) => p.startsWith('/community') },
]

const PRO_LINKS = [
  { href: '/jobs',       label: 'Find Work',      match: (p: string) => p.startsWith('/jobs') },
  { href: '/community',  label: 'Community',      match: (p: string) => p.startsWith('/community') },
  { href: '/dashboard',  label: 'Dashboard',      match: (p: string) => p === '/dashboard' },
]

// ── Mobile bottom nav ───────────────────────────────────────────────────────
// Shows only on mobile (md:hidden), role-aware
const MOBILE_HOMEOWNER = [
  { href: '/',          label: 'Home',      icon: HomeIcon },
  { href: '/post-job',  label: 'Request',   icon: PlusIcon },
  { href: '/community', label: 'Community', icon: UsersIcon },
  { href: '/search',    label: 'Search',    icon: SearchIcon },
]

const MOBILE_PRO = [
  { href: '/dashboard',  label: 'Home',      icon: HomeIcon },
  { href: '/jobs',       label: 'Find Work', icon: BriefcaseIcon },
  { href: '/community',  label: 'Community', icon: UsersIcon },
  { href: '/messages',   label: 'Messages',  icon: MessageIcon },
]

// ── SVG icons for mobile nav ────────────────────────────────────────────────
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}
function PlusIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  )
}
function UsersIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  )
}
function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}
function BriefcaseIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
    </svg>
  )
}
function MessageIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
}

export default function Navbar() {
  const path   = usePathname()
  const router = useRouter()
  const [session, setSession]           = useState<Session | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen]       = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount]   = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const notifRef     = useRef<HTMLDivElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('pg_pro')
    if (raw) { try { setSession(JSON.parse(raw)) } catch {} }

    const sync = () => {
      const r = sessionStorage.getItem('pg_pro')
      const s = r ? JSON.parse(r) : null
      setSession(s)
      if (s?.id) {
        fetch(`/api/notifications?pro_id=${s.id}`)
          .then(r => r.json())
          .then(d => { setNotifications(d.notifications || []); setUnreadCount(d.unread || 0) })
          .catch(() => {})
      }
    }
    window.addEventListener('storage', sync)
    window.addEventListener('pg-session-changed', sync)

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside as any)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('pg-session-changed', sync)
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside as any)
    }
  }, [])

  useEffect(() => { setMobileMenuOpen(false) }, [path])

  function logout() {
    sessionStorage.removeItem('pg_pro')
    setSession(null)
    router.push('/')
  }

  const [bg, fg] = session ? avatarColor(session.name) : ['#e5e7eb', '#6b7280']
  const navLinks = session ? PRO_LINKS : HOMEOWNER_LINKS
  const mobileLinks = session ? MOBILE_PRO : MOBILE_HOMEOWNER

  return (
    <>
      {/* ── TOP NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b" style={{ borderColor: '#E8E2D9' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 flex-shrink-0">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#nb)"/>
                <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
                <defs><linearGradient id="nb" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/></linearGradient></defs>
              </svg>
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="font-serif text-lg font-bold tracking-tight" style={{ color: '#0A1628' }}>ProGuild</span>
              <span className="font-sans font-medium text-sm" style={{ color: '#0F766E' }}>.ai</span>
            </div>
            <StagingBadge />
          </Link>

          {/* Desktop nav — role-aware */}
          <div className="hidden md:flex items-center gap-5 flex-1 justify-center">
            {navLinks.map(l => (
              <Link key={l.href} href={l.href}
                className={`text-sm transition-colors ${l.match(path) ? 'text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-900'}`}>
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {/* Mobile hamburger — only shown on mobile */}
            <div className="md:hidden" ref={mobileMenuRef}>
              <button
                onClick={() => setMobileMenuOpen(o => !o)}
                className="flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                aria-label="Menu">
                <span className={`block w-5 h-0.5 bg-gray-700 transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`block w-5 h-0.5 bg-gray-700 transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-5 h-0.5 bg-gray-700 transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
              </button>

              {mobileMenuOpen && (
                <div className="absolute left-0 right-0 top-14 bg-white border-b shadow-lg z-50 px-4 py-3" style={{ borderColor: '#E8E2D9' }}>
                  <div className="grid grid-cols-2 gap-1 mb-3">
                    {navLinks.map(l => (
                      <Link key={l.href} href={l.href}
                        className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          l.match(path) ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-stone-100'
                        }`}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                  {!session ? (
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <Link href="/login" className="flex-1 text-center py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">
                        Log in
                      </Link>
                      <Link href="/login?tab=signup" className="flex-1 text-center py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold">
                        Join as pro
                      </Link>
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-2 border-t border-gray-100">
                      <Link href={`/pro/${session.id}`} className="flex-1 text-center py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">
                        My profile
                      </Link>
                      <button onClick={logout} className="flex-1 text-center py-2 rounded-xl border border-red-200 text-sm font-medium text-red-500">
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Desktop logged-in */}
            {session ? (
              <>
                {/* Notification bell */}
                <div className="relative hidden md:block" ref={notifRef}>
                  <button onClick={async () => {
                    setNotifOpen(o => !o)
                    if (!notifOpen && unreadCount > 0 && session) {
                      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pro_id: session.id }) })
                      setUnreadCount(0)
                      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
                    }
                  }} className="relative p-1.5 rounded-lg hover:bg-stone-100 transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">Notifications</span>
                        <Link href="/dashboard" className="text-xs text-teal-600">See all</Link>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</div>
                        ) : notifications.map((n: any) => (
                          <a key={n.id} href={n.link || '/dashboard'}
                            className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-stone-50 transition-colors ${!n.is_read ? 'bg-teal-50/50' : ''}`}>
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.is_read ? 'bg-teal-500' : 'bg-gray-200'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-800">{n.message}</div>
                              <div className="text-sm text-gray-400 mt-0.5">{n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Avatar dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button onClick={() => setDropdownOpen(o => !o)}
                    className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-full border border-gray-200 hover:border-teal-300 transition-colors">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{ background: bg, color: fg }}>
                      {initials(session.name)}
                    </div>
                    <span className="text-sm font-medium text-gray-700 hidden md:block max-w-[100px] truncate">{session.name?.split(' ')[0]}</span>
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {dropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg z-50">
                      {[
                        { href: '/dashboard',         label: '📊 Dashboard' },
                        { href: `/pro/${session.id}`, label: '👤 My profile' },
                        { href: '/community',          label: '🌐 Community' },
                        { href: '/messages',           label: '💬 Messages' },
                        { href: '/edit-profile',       label: '✏️ Edit profile' },
                        { href: '/apprenticeship',     label: '🎓 Apprenticeship' },
                      ].map(item => (
                        <Link key={item.href} href={item.href}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 first:rounded-t-xl transition-colors">
                          {item.label}
                        </Link>
                      ))}
                      <div className="border-t border-gray-100">
                        <button onClick={logout}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-b-xl w-full text-left transition-colors">
                          → Log out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link href="/login"
                  className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                  Log in
                </Link>
                <Link href="/login?tab=signup"
                  className="text-sm font-semibold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                  Join as pro
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── MOBILE STICKY BOTTOM NAV ────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-t"
        style={{ borderColor: '#E8E2D9', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch h-16">
          {mobileLinks.map(item => {
            const active = path === item.href || (item.href !== '/' && item.href !== '/dashboard' && path.startsWith(item.href))
            const Icon   = item.icon
            return (
              <Link key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
                style={{ color: active ? '#0F766E' : '#9CA3AF' }}>
                <Icon active={active} />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Spacer so content isn't hidden behind bottom nav on mobile */}
      <div className="md:hidden h-16" />
    </>
  )
}
