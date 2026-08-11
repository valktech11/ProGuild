/**
 * components/ui/Modal.tsx
 * Canonical modal — replaces every ad-hoc overlay/dialog block.
 *
 * <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Property" dk={dk}>
 *   …content…
 *   <Modal.Footer>
 *     <Btn variant="ghost" dk={dk} onClick={onClose}>Cancel</Btn>
 *     <Btn variant="primary" dk={dk} onClick={handleSubmit}>Save</Btn>
 *   </Modal.Footer>
 * </Modal>
 */
import React, { useEffect } from 'react'
import { theme, T } from '@/lib/tokens'

interface ModalProps {
  open:      boolean
  onClose:   () => void
  title?:    string
  subtitle?: string
  icon?:     React.ReactNode
  dk?:       boolean
  width?:    number
  children?: React.ReactNode
}

export function Modal({ open, onClose, title, subtitle, icon, dk = false, width = 440, children }: ModalProps) {
  const t = theme(dk)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.52)',
        zIndex:         9999,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        T.sp4,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:   t.cardBg,
          border:       `1px solid ${t.cardBorder}`,
          borderRadius: T.radLg,
          width:        '100%',
          maxWidth:     width,
          maxHeight:    '90dvh',
          overflowY:    'auto',
          boxShadow:    '0 24px 64px rgba(0,0,0,0.28)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {(title || icon) && (
          <div style={{
            display:       'flex',
            alignItems:    'center',
            gap:           T.sp3,
            padding:       `${T.sp5}px ${T.sp6}px ${T.sp4}px`,
            borderBottom:  `1px solid ${t.cardBorder}`,
          }}>
            {icon && (
              <div style={{
                width: 40, height: 40, borderRadius: T.radMd,
                background: dk ? '#1A2A3A' : '#F0FDFA',
                border: `1px solid ${dk ? '#2D3A4A' : '#99F6E4'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {icon}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: T.fontHeading, fontWeight: 800, color: t.textPri, margin: 0 }}>
                {title}
              </h2>
              {subtitle && (
                <p style={{ fontSize: T.fontSub, color: t.textMuted, margin: `${T.sp1}px 0 0` }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/** Body section — standard padding, accepts any content */
Modal.Body = function ModalBody({ children, dk = false }: { children: React.ReactNode; dk?: boolean }) {
  return (
    <div style={{ padding: `${T.sp5}px ${T.sp6}px`, display: 'flex', flexDirection: 'column', gap: T.sp4 }}>
      {children}
    </div>
  )
}

/** Footer with cancel + confirm button row */
Modal.Footer = function ModalFooter({ children, dk = false }: { children: React.ReactNode; dk?: boolean }) {
  const t = theme(dk)
  return (
    <div style={{
      display:      'flex',
      gap:          T.sp3,
      padding:      `${T.sp4}px ${T.sp6}px ${T.sp5}px`,
      borderTop:    `1px solid ${t.cardBorder}`,
    }}>
      {children}
    </div>
  )
}

/** Destructive confirm modal — "Are you sure?" pattern */
interface ConfirmModalProps {
  open:       boolean
  onClose:    () => void
  onConfirm:  () => void
  title?:     string
  message?:   string
  confirmLabel?: string
  loading?:   boolean
  dk?:        boolean
}

export function ConfirmModal({
  open, onClose, onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  loading = false,
  dk = false,
}: ConfirmModalProps) {
  const t = theme(dk)
  return (
    <Modal open={open} onClose={onClose} dk={dk} width={360}
      icon={
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth={2} strokeLinecap="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      }
      title={title}
    >
      <Modal.Body dk={dk}>
        <p style={{ fontSize: T.fontBody, color: t.textBody, margin: 0, lineHeight: T.lineRelaxed }}>
          {message}
        </p>
      </Modal.Body>
      <Modal.Footer dk={dk}>
        <button onClick={onClose} style={{
          flex: 1, padding: `${T.sp3}px`, borderRadius: T.radSm,
          border: `1.5px solid ${t.cardBorder}`, background: 'transparent',
          color: t.textMuted, fontSize: T.fontBody, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={loading} style={{
          flex: 1, padding: `${T.sp3}px`, borderRadius: T.radSm,
          border: 'none', background: '#DC2626',
          color: 'white', fontSize: T.fontBody, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
          boxShadow: '0 4px 12px rgba(220,38,38,0.28)',
          fontFamily: 'inherit',
        }}>
          {loading ? 'Deleting…' : confirmLabel}
        </button>
      </Modal.Footer>
    </Modal>
  )
}
