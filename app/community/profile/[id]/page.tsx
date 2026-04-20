'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function CommunityProfileRedirect() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  useEffect(() => {
    // Redirect to the unified pro profile page
    router.replace(`/pro/${id}`)
  }, [id])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F0E8' }}>
      <div className="w-8 h-8 border-2 border-t-teal-500 rounded-full animate-spin"
        style={{ borderColor: '#E8E2D9', borderTopColor: '#14B8A6' }} />
    </div>
  )
}
