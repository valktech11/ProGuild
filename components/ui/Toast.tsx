'use client'
import { useEffect } from 'react'
import { T } from '@/lib/tokens'

export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  action?: { label: string; onClick: () => void }
}

interface ToastProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

/**
 * Canonical toast notification display.
 * Fixed at bottom-center, auto-dismisses after 4s.
 *
 * Usage:
 *   const [toasts, setToasts] = useState<ToastItem[]>([])
 *   function showToast(message: string, type: ToastItem['type'] = 'success') {
 *     const id = Date.now()
 *     setToasts(t => [...t, { id, message, type }])
 *     setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
 *   }
 *   <Toast toasts={toasts} onDismiss={id => setToasts(t => t.filter(x => x.id !== id))} />
 */
export function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: T.sp8, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: T.sp2,
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const colors = {
          success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
          error:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
          info:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
        }[toast.type]
        return (
          <div key={toast.id} style={{
            pointerEvents: 'all',
            background: colors.bg,
            border: `1.5px solid ${colors.border}`,
            borderRadius: T.radMd,
            padding: `${T.sp3}px ${T.sp5}px`,
            display: 'flex', alignItems: 'center', gap: T.sp3,
            fontSize: T.fontBody, fontWeight: 500, color: colors.text,
            minWidth: 280, maxWidth: 420,
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          }}>
            <span style={{ flex: 1 }}>{toast.message}</span>
            {toast.action && (
              <button onClick={toast.action.onClick} style={{
                fontSize: T.fontSub, color: colors.text, fontWeight: 700,
                background: 'none', border: 'none', cursor: 'pointer',
                textDecoration: 'underline', padding: 0, whiteSpace: 'nowrap' as const,
              }}>
                {toast.action.label}
              </button>
            )}
            <button onClick={() => onDismiss(toast.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.text, fontSize: 20, lineHeight: 1, padding: 0, opacity: 0.6,
            }}>×</button>
          </div>
        )
      })}
    </div>
  )
}

/** Hook to manage toasts — use this in any page */
export function useToast() {
  const { useState } = require('react')
  const [toasts, setToasts] = useState<ToastItem[]>([])

  function showToast(message: string, type: ToastItem['type'] = 'success', action?: ToastItem['action']) {
    const id = Date.now()
    setToasts((t: ToastItem[]) => [...t, { id, message, type, action }])
    setTimeout(() => setToasts((t: ToastItem[]) => t.filter((x: ToastItem) => x.id !== id)), 4000)
  }

  function dismissToast(id: number) {
    setToasts((t: ToastItem[]) => t.filter((x: ToastItem) => x.id !== id))
  }

  return { toasts, showToast, dismissToast }
}
