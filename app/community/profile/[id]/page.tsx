'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Loader from '@/components/ui/Loader'

export default function CommunityProfileRedirect() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  useEffect(() => {
    // Redirect to the unified pro profile page
    router.replace(`/pro/${id}`)
  }, [id])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F0E8' }}>
      <Loader size={48} />
    </div>
  )
}
