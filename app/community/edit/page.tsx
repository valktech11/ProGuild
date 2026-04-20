'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CommunityEditRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/edit-profile?tab=portfolio') }, [])
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
