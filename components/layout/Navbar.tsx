'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Session } from '@/types'
import { initials, avatarColor } from '@/lib/utils'

export default function Navbar() {
  const path    = usePathname()
  const router  = useRouter()
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('tn_pro')
    if (raw) setSession(JSON.parse(raw))
    // Listen for storage changes (login/logout in other tabs)
    const handler = () => {
      const r = sessionStorage.getItem('tn_pro')
      setSession(r ? JSON.parse(r) : null)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  function logout() {
    sessionStorage.removeItem('tn_pro')
    setSession(null)
    router.push('/')
  }

  const [bg, fg] = session ? avatarColor(session.name) : ['#e5e7eb', '#6b7280']

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-[60px] flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="font-serif text-xl text-gray-900 tracking-tight">
          Trades<span className="text-teal-600">Network</span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-6">
          <Link href="/" className={`text-sm transition-colors ${path === '/' ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
            Find a pro
          </Link>
          <Link href="/post-job" className={`text-sm transition-colors ${path === '/post-job' ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
            Post a job
          </Link>
          <Link href="/community" className={`text-sm transition-colors ${path.startsWith('/community') ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
            Community
          </Link>
        </div>

        {/* Right side — logged in vs logged out */}
        {session ? (
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors hidden md:block">
              Dashboard
            </Link>
            {/* Avatar dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-full border border-gray-200 hover:border-teal-300 transition-colors">
                {session.name && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{ background: bg, color: fg }}>
                    {initials(session.name)}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 hidden md:block max-w-[100px] truncate">{session.name?.split(' ')[0]}</span>
                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-100 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 rounded-t-xl transition-colors">
                  📊 Dashboard
                </Link>
                <Link href={`/pro/${session.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 transition-colors">
                  👤 My profile
                </Link>
                <Link href="/community" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 transition-colors">
                  🌐 Community
                </Link>
                <Link href="/messages" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 transition-colors">
                  💬 Messages
                </Link>
                <Link href="/edit-profile" className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-stone-50 transition-colors">
                  ✏️ Edit profile
                </Link>
                <div className="border-t border-gray-100 mt-1">
                  <button onClick={logout} className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-b-xl w-full text-left transition-colors">
                    → Log out
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
              Log in
            </Link>
            <Link href="/login?tab=signup" className="text-sm font-semibold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors">
              Join as pro
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}
