'use client'

import { useState } from 'react'
import { Lead } from '@/types'

interface ActionAlertProps {
  leads: Lead[]
  onRespond: (leadId: string) => void
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

export default function ActionAlert({ leads, onRespond }: ActionAlertProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Build alerts from leads — no API call, all client-side from existing data
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alerts: Array<{
    id: string
    lead_id: string
    type: 'overdue' | 'followup'
    contact_name: string
    days: number
  }> = []

  leads
    .filter(l => !['Completed', 'Paid', 'Lost', 'Archived'].includes(l.lead_status))
    .forEach(l => {
      // Overdue: no activity for 3+ days
      const days = daysSince(l.created_at)
      if (days >= 3) {
        alerts.push({
          id: `overdue-${l.id}`,
          lead_id: l.id,
          type: 'overdue',
          contact_name: l.contact_name,
          days,
        })
      }
      // Follow-up due today or past due
      if (l.follow_up_date) {
        const fDate = new Date(l.follow_up_date)
        fDate.setHours(0, 0, 0, 0)
        if (fDate <= today) {
          alerts.push({
            id: `followup-${l.id}`,
            lead_id: l.id,
            type: 'followup',
            contact_name: l.contact_name,
            days: 0,
          })
        }
      }
    })

  const visible = alerts.filter(a => !dismissed.has(a.id))
  if (visible.length === 0) return null

  return (
    <div className="mb-5 rounded-2xl overflow-hidden border border-amber-200">
      {visible.map((alert, i) => (
        <div
          key={alert.id}
          className={`flex items-center gap-3 px-4 py-3 ${
            i > 0 ? 'border-t border-amber-200' : ''
          } ${alert.type === 'overdue' ? 'bg-amber-50' : 'bg-blue-50'}`}
        >
          {/* Urgency dot */}
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              alert.type === 'overdue'
                ? alert.days > 5 ? 'bg-red-500 animate-pulse' : 'bg-amber-400'
                : 'bg-blue-500'
            }`}
          />

          {/* Message */}
          <p className="text-sm text-gray-800 flex-1">
            {alert.type === 'overdue' ? (
              <>
                <span className="font-semibold">{alert.contact_name}</span>
                {' '}hasn't been contacted in{' '}
                <span className="font-semibold text-red-600">{alert.days} day{alert.days !== 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                Follow-up with{' '}
                <span className="font-semibold">{alert.contact_name}</span>
                {' '}is due today
              </>
            )}
          </p>

          {/* Respond CTA */}
          <button
            onClick={() => onRespond(alert.lead_id)}
            className="text-sm font-semibold text-teal-700 hover:text-teal-900 whitespace-nowrap transition-colors"
          >
            Respond →
          </button>

          {/* Dismiss — session only, reappears next visit if still overdue */}
          <button
            onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none ml-1"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
