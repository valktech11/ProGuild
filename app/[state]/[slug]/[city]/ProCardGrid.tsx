'use client'
import ProCard from '@/components/ui/ProCard'

export default function ProCardGrid({ pros }: { pros: any[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
      {pros.map((pro, i) => (
        <ProCard key={pro.id} pro={pro} index={i} />
      ))}
    </div>
  )
}
