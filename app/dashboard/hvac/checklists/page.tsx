'use client'
// Job-type checklists — pick a job type, work through inspection points.
// Mirrors mobile lib/features/hvac/checklists/hvac_checklist_screen.dart.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/theme'
import { JOB_CHECKLISTS, JobChecklist } from '@/lib/hvac/checklistData'

export default function ChecklistsPage() {
  const router = useRouter()
  const { session } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }
  const t = theme(dk)

  const [selected, setSelected] = useState<JobChecklist | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const totalItems = selected?.sections.reduce((s, sec) => s + sec.items.length, 0) ?? 0
  const checkedCount = checked.size

  const pick = (c: JobChecklist) => { setSelected(c); setChecked(new Set()) }
  const toggle = (s: number, i: number) => {
    const key = `${s}:${i}`
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const card: React.CSSProperties = {
    background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14,
  }

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 60px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            {selected && (
              <button onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: t.textMuted }}>←</button>
            )}
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0 }}>
                {selected ? selected.label : 'Job Checklists'}
              </h1>
              {!selected && (
                <p style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                  Step-by-step inspection points by job type
                </p>
              )}
            </div>
          </div>

          {/* Picker */}
          {!selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {JOB_CHECKLISTS.map(c => (
                <button key={c.key} onClick={() => pick(c)}
                  style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 14,
                    cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <span style={{ fontSize: 26 }}>{c.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: t.textPri }}>{c.label}</div>
                    <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{c.description}</div>
                  </div>
                  <span style={{ color: t.textMuted, fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          )}

          {/* Checklist */}
          {selected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: t.cardBorder, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${totalItems ? (checkedCount / totalItems) * 100 : 0}%`,
                    background: '#0F766E', transition: 'width 0.2s' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.textPri }}>{checkedCount}/{totalItems}</span>
              </div>

              {selected.sections.map((sec, s) => (
                <div key={s} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em',
                    color: t.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>{sec.title}</div>
                  <div style={card}>
                    {sec.items.map((item, i) => {
                      const isChecked = checked.has(`${s}:${i}`)
                      return (
                        <div key={i} onClick={() => toggle(s, i)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                            cursor: 'pointer', borderTop: i > 0 ? `1px solid ${t.cardBorder}80` : 'none' }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                            background: isChecked ? '#0F766E' : 'transparent',
                            border: `1.5px solid ${isChecked ? '#0F766E' : t.textMuted}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 14 }}>
                            {isChecked ? '✓' : ''}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14.5, lineHeight: 1.3,
                              color: isChecked ? t.textMuted : t.textPri,
                              textDecoration: isChecked ? 'line-through' : 'none' }}>
                              {item.text}
                            </div>
                            {item.hint && (
                              <div style={{ fontSize: 12, fontStyle: 'italic', color: t.textMuted, marginTop: 2 }}>
                                {item.hint}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

        </div>
      </div>
    </DashboardShell>
  )
}
