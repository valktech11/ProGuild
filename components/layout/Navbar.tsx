'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Session } from '@/types'
import { initials, avatarColor } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/',          label: 'Find a pro',  match: (p: string) => p === '/' },
  { href: '/post-job',  label: 'Post a job',  match: (p: string) => p === '/post-job' },
  { href: '/jobs',      label: 'Jobs',        match: (p: string) => p.startsWith('/jobs') },
  { href: '/hire',      label: 'Hire',        match: (p: string) => p.startsWith('/hire') },
  { href: '/community', label: 'Community',   match: (p: string) => p.startsWith('/community') },
]

export default function Navbar() {
  const path   = usePathname()
  const router = useRouter()
  const [session, setSession]         = useState<Session | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifOpen, setNotifOpen]         = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const mobileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    if (raw) { try { setSession(JSON.parse(raw)) } catch {} }

    const sync = () => {
      const r = sessionStorage.getItem('tn_pro')
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
    window.addEventListener('tn-session-changed', sync)

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false)
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileMenuOpen(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside as any)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('tn-session-changed', sync)
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside as any)
    }
  }, [])

  // Close mobile menu on navigation
  useEffect(() => { setMobileMenuOpen(false) }, [path])

  function logout() {
    sessionStorage.removeItem('tn_pro')
    setSession(null)
    router.push('/')
  }

  const [bg, fg] = session ? avatarColor(session.name) : ['#e5e7eb', '#6b7280']

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[56px] flex items-center justify-between gap-3">

        {/* Logo */}
        <Link href="/" className="font-serif text-xl text-gray-900 tracking-tight flex-shrink-0">
          Pro<span className="text-teal-600">Guild</span><span className="text-gray-400 font-sans font-light text-base">.ai</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-5 flex-1 justify-center">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href}
              className={`text-sm transition-colors ${l.match(path) ? 'text-gray-900 font-semibold' : 'text-gray-500 hover:text-gray-900'}`}>
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Mobile hamburger */}
          <div className="md:hidden" ref={mobileMenuRef}>
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg hover:bg-stone-100 transition-colors"
              aria-label="Menu">
              <span className={`block w-5 h-0.5 bg-gray-700 transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-5 h-0.5 bg-gray-700 transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-gray-700 transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>

            {/* Mobile menu dropdown */}
            {mobileMenuOpen && (
              <div className="absolute left-0 right-0 top-[56px] bg-white border-b border-gray-200 shadow-lg z-50 px-4 py-3">
                <div className="grid grid-cols-2 gap-1 mb-3">
                  {NAV_LINKS.map(l => (
                    <Link key={l.href} href={l.href}
                      className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        l.match(path)
                          ? 'bg-teal-50 text-teal-700'
                          : 'text-gray-700 hover:bg-stone-100'
                      }`}>
                      {l.label}
                    </Link>
                  ))}
                  {session && (
                    <Link href="/dashboard"
                      className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-stone-100 transition-colors">
                      Dashboard
                    </Link>
                  )}
                </div>
                {!session && (
                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    <Link href="/login"
                      className="flex-1 text-center py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">
                      Log in
                    </Link>
                    <Link href="/login?tab=signup"
                      className="flex-1 text-center py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold">
                      Join as pro
                    </Link>
                  </div>
                )}
                {session && (
                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    <Link href={`/pro/${session.id}`}
                      className="flex-1 text-center py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">
                      My profile
                    </Link>
                    <button onClick={logout}
                      className="flex-1 text-center py-2 rounded-xl border border-red-200 text-sm font-medium text-red-500">
                      Log out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desktop: logged-in state */}
          {session ? (
            <>
              <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors hidden md:block">
                Dashboard
              </Link>
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
                            <div className="text-xs text-gray-400 mt-0.5">{n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
                      { href: '/dashboard',          label: '📊 Dashboard' },
                      { href: `/pro/${session.id}`,  label: '👤 My profile' },
                      { href: '/community',           label: '🌐 Community' },
                      { href: '/messages',            label: '💬 Messages' },
                      { href: '/edit-profile',        label: '✏️ Edit profile' },
                      { href: '/apprenticeship',      label: '🎓 Apprenticeship' },
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
            /* Desktop: logged-out state */
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
  )
}
