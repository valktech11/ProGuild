'use client'
// Guided diagnostic walk-through. Mirror of mobile decision tree screen.

import { useState } from 'react'
import DashboardShell from '@/components/layout/DashboardShell'
import { useProSession } from '@/lib/hooks/useProSession'
import { theme } from '@/lib/theme'
import { DECISION_TREES, DecisionTree, TreeNode, TreeAnswer } from '@/lib/hvac/decisionTreeData'

export default function GuidedPage() {
  const { session } = useProSession()
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('pg_darkmode') === '1'
  })
  const toggleDark = () => { const n = !dk; localStorage.setItem('pg_darkmode', n ? '1' : '0'); setDk(n) }
  const t = theme(dk)

  const [tree, setTree] = useState<DecisionTree | null>(null)
  const [path, setPath] = useState<string[]>([])
  const [trail, setTrail] = useState<string[]>([])

  const current: TreeNode | null = tree && path.length ? tree.nodes[path[path.length - 1]] : null
  const isOutcome = (n: TreeNode) => !!n.outcomeTitle

  const pickTree = (tr: DecisionTree) => { setTree(tr); setPath([tr.rootId]); setTrail([]) }
  const answer = (a: TreeAnswer) => { setTrail(x => [...x, a.label]); setPath(x => [...x, a.next]) }
  const restart = () => { if (tree) { setPath([tree.rootId]); setTrail([]) } }
  const back = () => {
    if (path.length > 1) { setPath(x => x.slice(0, -1)); setTrail(x => x.slice(0, -1)) }
    else { setTree(null); setPath([]); setTrail([]) }
  }

  const card: React.CSSProperties = { background: t.cardBg, border: `1px solid ${t.cardBorder}`, borderRadius: 14 }

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}} darkMode={dk} onToggleDark={toggleDark}>
      <div style={{ background: t.pageBg, minHeight: '100vh', padding: '16px 16px 60px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            {tree && (
              <button onClick={back}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: t.textMuted }}>←</button>
            )}
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPri, margin: 0, flex: 1 }}>
              {tree ? tree.label : 'Guided Diagnosis'}
            </h1>
            {tree && path.length > 1 && (
              <button onClick={restart}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#0F766E' }}>
                Restart
              </button>
            )}
          </div>

          {/* Picker */}
          {!tree && (
            <>
              <p style={{ fontSize: 13, color: t.textMuted, margin: '0 0 16px' }}>
                Answer one question at a time and it&apos;ll walk you to the likely cause.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {DECISION_TREES.map(tr => (
                  <button key={tr.key} onClick={() => pickTree(tr)}
                    style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 14,
                      cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <span style={{ fontSize: 26 }}>{tr.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 700, color: t.textPri }}>{tr.label}</div>
                      <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{tr.description}</div>
                    </div>
                    <span style={{ color: t.textMuted, fontSize: 18 }}>›</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Walk */}
          {tree && current && (
            <>
              {trail.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {trail.map((step, i) => (
                    <span key={i} style={{ fontSize: 11.5, color: t.textMuted, background: t.cardBorder,
                      padding: '4px 10px', borderRadius: 20 }}>{step}</span>
                  ))}
                </div>
              )}

              {!isOutcome(current) ? (
                <>
                  <div style={{ ...card, padding: 18, marginBottom: 16 }}>
                    <div style={{ fontSize: 17, lineHeight: 1.35, fontWeight: 700, color: t.textPri }}>
                      {current.question}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(current.answers ?? []).map((a, i) => (
                      <button key={i} onClick={() => answer(a)}
                        style={{ ...card, padding: '16px 18px', cursor: 'pointer', textAlign: 'left',
                          display: 'flex', alignItems: 'center', width: '100%' }}>
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: t.textPri }}>{a.label}</span>
                        <span style={{ color: '#0F766E', fontSize: 18 }}>›</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ padding: 18, borderRadius: 14, marginBottom: 14,
                    background: '#0F766E14', border: '1px solid #0F766E66' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: '#0F766E', marginBottom: 10 }}>
                      💡 LIKELY CAUSE
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: t.textPri }}>{current.outcomeTitle}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.45, color: t.textMuted, marginTop: 8 }}>{current.outcomeDetail}</div>
                  </div>
                  {current.outcomeAction && (
                    <div style={{ ...card, padding: 16, marginBottom: 20 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', color: t.textMuted, marginBottom: 6 }}>
                        NEXT STEP
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.45, color: t.textPri }}>{current.outcomeAction}</div>
                    </div>
                  )}
                  <button onClick={restart}
                    style={{ width: '100%', padding: '12px', borderRadius: 12, cursor: 'pointer',
                      background: 'transparent', border: '1.5px solid #0F766E', color: '#0F766E',
                      fontWeight: 700, fontSize: 14 }}>
                    ↻ Start over
                  </button>
                  <p style={{ fontSize: 11.5, fontStyle: 'italic', color: t.textMuted, marginTop: 12 }}>
                    Guided aid, not a replacement for manufacturer service documentation or hands-on judgment.
                  </p>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </DashboardShell>
  )
}
