'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Session, Lead } from '@/types'
import DashboardShell from '@/components/layout/DashboardShell'
import LeadPipeline from '@/components/ui/LeadPipeline'
import ActionAlert from '@/components/ui/ActionAlert'
import AddLeadModal from '@/components/ui/AddLeadModal'

export default function PipelinePage() {
  const router = useRouter()
  const [session,     setSession]     = useState<Session | null>(null)
  const [leads,       setLeads]       = useState<Lead[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('pg_session')
    if (!stored) { router.push('/login'); return }
    const s: Session = JSON.parse(stored)
    setSession(s)
    fetch(`/api/leads?pro_id=${s.id}`)
      .then(r => r.json())
      .then(data => { setLeads(data.leads || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [router])

  const newLeads = leads.filter(l => l.lead_status === 'New')
  const overdue  = leads.filter(l => {
    const days = (Date.now() - new Date(l.created_at).getTime()) / 86400000
    return days >= 3 && l.lead_status === 'New'
  })

  const TEAL = '#0F766E'

  if (loading) {
    return (
      <DashboardShell session={null} newLeads={0}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: TEAL, borderTopColor: 'transparent' }} />
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell session={session} newLeads={newLeads.length} onAddLead={() => setShowAddLead(true)}>
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#0A1628' }}>Pipeline</h1>
            <p className="text-sm mt-0.5" style={{ color: '#9CA3AF' }}>
              {leads.length} lead{leads.length !== 1 ? 's' : ''} total
            </p>
          </div>
          <button onClick={() => setShowAddLead(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
              transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: TEAL, color: 'white' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Lead
          </button>
        </div>
        {overdue.length > 0 && (
          <div className="mb-4">
            <ActionAlert
              leads={overdue.slice(0, 3)}
              onRespond={(leadId) => {
                const el = document.getElementById(`lead-${leadId}`)
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            />
          </div>
        )}
        {session && (
          <LeadPipeline
            leads={leads}
            onStatusChange={async (leadId: string, status: string) => {
              await fetch(`/api/leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead_status: status }),
              })
              setLeads(prev => prev.map(l => l.id === leadId ? { ...l, lead_status: status as Lead['lead_status'] } : l))
            }}
            onUpdate={async (leadId: string, fields: Partial<Lead>) => {
              await fetch(`/api/leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(fields),
              })
              setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...fields } : l))
            }}
            isPaid={['Pro','Elite','Pro_Founding','Elite_Founding','Pro_Annual','Elite_Annual','Pro_Founding_Annual','Elite_Founding_Annual'].includes(session.plan)}
          />
        )}
      </div>
      {showAddLead && session && (
        <AddLeadModal
          proId={session.id}
          onClose={() => setShowAddLead(false)}
          onAdded={() => {
            setShowAddLead(false)
            fetch(`/api/leads?pro_id=${session.id}`)
              .then(r => r.json())
              .then(data => setLeads(data.leads || []))
          }}
        />
      )}
    </DashboardShell>
  )
}
