'use client'
// app/estimate/[id]/page.tsx
// Public estimate page — homeowner-facing, no auth.
// Routes to roofing-specific component for roofing estimates,
// falls back to generic for other trades.

import { use, useEffect, useState } from 'react'
import RoofingEstimatePublicPage, { PublicRoofingEstimate } from '@/lib/trades/roofing/components/EstimatePublicPage'

export default function PublicEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [estimate, setEstimate] = useState<PublicRoofingEstimate | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/estimates/public/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); setLoading(false); return null }; return r.json() })
      .then(d => {
        if (!d) return
        setEstimate(d.estimate)
        setLoading(false)
        // Track view — deduped per browser session
        const key = `est_viewed_${id}`
        if (!sessionStorage.getItem(key)) {
          fetch(`/api/estimates/public/${id}/view`, { method: 'POST' }).catch(() => {})
          sessionStorage.setItem(key, '1')
        }
      })
      .catch(() => { setNotFound(true); setLoading(false) })
  }, [id])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F8FAFC', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center', color: '#64748B' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Loading proposal...</div>
      </div>
    </div>
  )

  if (notFound || !estimate) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F8FAFC', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center', color: '#64748B' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Proposal not found</div>
        <div style={{ fontSize: 15 }}>This link may have expired or been voided.</div>
      </div>
    </div>
  )

  const handleApprove = async (tierKey?: string, sigDataUrl?: string) => {
    const r = await fetch(`/api/estimates/public/${id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signer_name:   estimate.lead_name,
        sig_data_url:  sigDataUrl,
        selected_tier: tierKey,
      }),
    })
    if (!r.ok) throw new Error('Sign failed')


  }

  // Route to roofing component (covers all roofing estimates)
  // For future trades: check estimate.trade_slug and route accordingly
  return <RoofingEstimatePublicPage estimate={estimate} onApprove={handleApprove} />
}
