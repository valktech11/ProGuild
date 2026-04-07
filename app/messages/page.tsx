import { Suspense } from 'react'
import MessagesContent from './MessagesContent'

export const dynamic = 'force-dynamic'

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-stone-50 flex items-center justify-center"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <MessagesContent />
    </Suspense>
  )
}
