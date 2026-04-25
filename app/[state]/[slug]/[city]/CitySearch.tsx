'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  stateSlug: string
  tradeSlug: string
  currentCity: string
}

function cityToSlug(c: string) {
  return c.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export default function CitySearch({ stateSlug, tradeSlug, currentCity }: Props) {
  const router  = useRouter()
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    const raw = input.trim()
    if (!raw) return
    setLoading(true)

    // ZIP detection — resolve via our API
    if (/^\d{5}$/.test(raw)) {
      try {
        const res  = await fetch(`/api/zip?zip=${raw}`)
        const data = await res.json()
        if (data.city) {
          router.push(`/${stateSlug}/${tradeSlug}/${cityToSlug(data.city)}`)
          return
        }
      } catch {}
    }

    router.push(`/${stateSlug}/${tradeSlug}/${cityToSlug(raw)}`)
    setLoading(false)
  }

  async function detectLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        setLoading(true)
        const { latitude: lat, longitude: lng } = pos.coords
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        const data = await res.json()
        const detected = data.address?.city || data.address?.town || data.address?.village || ''
        if (detected) {
          router.push(`/${stateSlug}/${tradeSlug}/${cityToSlug(detected)}`)
        }
      } catch {}
      finally { setLoading(false) }
    })
  }

  return (
    <div className="flex gap-2 max-w-lg">
      <div className="flex flex-1 items-center gap-3 bg-white border rounded-xl px-4 py-3"
        style={{ borderColor: '#E8E2D9' }}>
        <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#A89F93' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={`Change city — currently ${currentCity}`}
          className="flex-1 text-sm outline-none bg-transparent"
          style={{ color: '#0A1628' }}
        />
        {input && (
          <button onClick={() => setInput('')} className="text-gray-300 hover:text-gray-500">×</button>
        )}
      </div>
      <button onClick={handleSearch} disabled={!input || loading}
        className="px-4 py-3 rounded-xl text-sm font-bold text-white flex-shrink-0 disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #0F766E, #0C5F57)' }}>
        {loading ? '...' : 'Go →'}
      </button>
      <button onClick={detectLocation}
        className="px-3 py-3 rounded-xl text-sm border flex-shrink-0"
        style={{ borderColor: '#E8E2D9', color: '#0F766E', background: 'white' }}
        title="Use my location">
        📍
      </button>
    </div>
  )
}
