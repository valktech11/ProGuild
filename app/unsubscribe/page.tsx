'use client'
import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import Link from 'next/link'

function UnsubscribeContent() {
  const params = useSearchParams()
  const email = params.get('email') || ''
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function unsubscribe() {
    setLoading(true)
    await fetch('/api/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setLoading(false)
    setDone(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E8E2D9', padding: '40px 36px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>✉️</div>
        {done ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0A1628', marginBottom: 8 }}>Unsubscribed</div>
            <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 24 }}>
              {email ? `${email} has been removed` : 'You have been removed'} from ProGuild lead notifications.
            </div>
            <Link href="/" style={{ fontSize: 14, color: '#0F766E', fontWeight: 600 }}>← Back to ProGuild</Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0A1628', marginBottom: 8 }}>Unsubscribe from ProGuild</div>
            <div style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.6, marginBottom: 8 }}>
              You will no longer receive lead notifications from ProGuild.
            </div>
            {email && (
              <div style={{ fontSize: 13, color: '#A89F93', marginBottom: 24 }}>{email}</div>
            )}
            <button onClick={unsubscribe} disabled={loading}
              style={{ width: '100%', padding: '12px 24px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
              {loading ? 'Processing...' : 'Unsubscribe'}
            </button>
            <Link href="/" style={{ fontSize: 13, color: '#A89F93' }}>No thanks — keep receiving notifications</Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeContent />
    </Suspense>
  )
}
