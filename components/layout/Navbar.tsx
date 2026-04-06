'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const path = usePathname()

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 h-15">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <Link href="/" className="font-serif text-xl text-gray-900 tracking-tight">
          Trades<span className="text-teal-600">Network</span>
        </Link>

        <div className="hidden md:flex items-center gap-7">
          <Link href="/" className={`text-sm transition-colors ${path === '/' ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
            Find a pro
          </Link>
          <Link href="/post-job" className={`text-sm transition-colors ${path === '/post-job' ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
            Post a job
          </Link>
          <Link href="/login" className={`text-sm transition-colors ${path === '/login' ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
            For pros
          </Link>
          <Link href="/community" className={`text-sm transition-colors ${path.startsWith('/community') ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`}>
            Community
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
            Log in
          </Link>
          <Link href="/login?tab=signup" className="text-sm font-semibold px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors">
            Join as pro
          </Link>
        </div>
      </div>
    </nav>
  )
}
