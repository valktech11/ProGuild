'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [config, setConfig]     = useState<Record<string, string> | null>(null)
  const [isAdmin, setIsAdmin]   = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    // Check if current user is admin
    const raw = sessionStorage.getItem('tn_pro')
    if (raw) {
      try {
        const s = JSON.parse(raw)
        if (s?.id) {
          fetch(`/api/admin?section=dashboard`, { headers: { 'x-pro-id': s.id } })
            .then(r => { if (r.ok) setIsAdmin(true) })
        }
      } catch {}
    }
    // Fetch config
    fetch('/api/config').then(r => r.json()).then(d => setConfig(d.config || {}))
  }, [])

  // Routes that always pass through regardless of maintenance mode
  const isAdminRoute   = pathname?.startsWith('/admin')
  const isLoginRoute   = pathname === '/login' || pathname === '/admin-login'
  const isApiRoute     = pathname?.startsWith('/api')

  // While loading config, render children (avoids flash of maintenance page on normal operation)
  if (config === null) return <>{children}</>

  // Not in maintenance mode — render normally
  if (config.maintenance_mode !== 'true') {
    return <>{children}</>
  }

  // Always let login pages and API routes through — needed to authenticate and recover
  if (isLoginRoute || isApiRoute) {
    return <>{children}</>
  }

  // In maintenance mode — admin users and admin routes pass through with reminder banner
  if (isAdminRoute || isAdmin) {
    return (
      <>
        {/* Admin banner reminder */}
        <div className="w-full py-2 px-4 text-center text-xs font-semibold bg-amber-500 text-white">
          🔧 Maintenance mode is ON — only admins can see the site
        </div>
        {children}
      </>
    )
  }

  // Non-admin, maintenance mode ON — show full maintenance page
  const jokes = [
    "Our hardhat-wearing hamsters are upgrading the wheel.",
    "We're tightening some bolts. The digital kind.",
    "Even the internet needs a coffee break sometimes.",
    "Our plumbers are fixing a digital pipe leak.",
    "The electricians are rewiring the cloud.",
  ]
  const joke = jokes[Math.floor(Date.now() / 86400000) % jokes.length]

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
      {/* Animated hard hat */}
      <div className="text-8xl mb-6 animate-bounce">🦺</div>

      <h1
        className="font-serif text-4xl md:text-5xl text-white mb-3"
        style={{ fontFamily: "'DM Serif Display', serif" }}
      >
        We'll be right back.
      </h1>

      <p className="text-gray-400 text-lg mb-2 max-w-md leading-relaxed">
        {config.maintenance_message || 'TradesNetwork is down for scheduled maintenance.'}
      </p>

      <p className="text-gray-600 text-sm italic mb-10 max-w-sm">
        "{joke}"
      </p>

      {/* Status indicators */}
      <div className="flex flex-col gap-3 mb-10">
        {[
          { icon: '⚙️', label: 'System upgrades in progress' },
          { icon: '🔒', label: 'Your data is safe' },
          { icon: '⚡', label: 'Back soon — usually under 30 min' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-3 text-gray-400 text-sm">
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Log in as admin link */}
      <div className="border-t border-gray-800 pt-6">
        <a
          href="/admin-login"
          className="text-xs text-gray-600 hover:text-teal-400 transition-colors"
        >
          Admin? Log in →
        </a>
      </div>

      {/* Brand */}
      <div className="mt-8 text-gray-700 text-sm font-serif">
        Trades<span className="text-teal-600">Network</span>
      </div>
    </div>
  )
}
