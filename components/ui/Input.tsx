/**
 * components/ui/Input.tsx
 * Canonical form primitives — Input, Textarea, Select, FormField.
 * Replaces every ad-hoc inputStyle object across the codebase.
 *
 * <FormField label="Street Address" required hint="Start typing to search" dk={dk}>
 *   <Input ref={ref} placeholder="123 Main St" dk={dk} />
 * </FormField>
 */
import React from 'react'
import { theme, T, BRAND } from '@/lib/tokens'

// ── Shared input base ─────────────────────────────────────────────────────────

interface InputBase {
  dk?:         boolean
  error?:      boolean
  size?:       'sm' | 'md' | 'lg'
  fullWidth?:  boolean
}

function inputStyles(dk: boolean, error: boolean, size: 'sm' | 'md' | 'lg', fullWidth: boolean): React.CSSProperties {
  const t = theme(dk)
  const pad: Record<typeof size, string> = {
    sm: `${T.sp2}px ${T.sp3}px`,
    md: `${T.sp3}px ${T.sp4}px`,
    lg: `${T.sp4}px ${T.sp4}px`,
  }
  const fs: Record<typeof size, number> = {
    sm: T.fontSub,
    md: T.fontBody,
    lg: T.fontEmphasis,
  }
  return {
    width:        fullWidth ? '100%' : undefined,
    padding:      pad[size],
    fontSize:     fs[size],
    fontFamily:   'inherit',
    fontWeight:   400,
    lineHeight:   T.lineNormal,
    color:        t.textPri,
    background:   t.inputBg,
    border:       `1.5px solid ${error ? BRAND.danger : t.inputBorder}`,
    borderRadius: T.radSm,
    outline:      'none',
    transition:   'border-color 0.12s',
    boxSizing:    'border-box' as const,
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, InputBase {
  prefixIcon?: React.ReactNode   // icon to show inside left edge
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { dk = false, error = false, size = 'md', fullWidth = true, prefixIcon, style, onFocus, onBlur, ...rest },
  ref,
) {
  const t = theme(dk)
  const base = inputStyles(dk, error, size, fullWidth)

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = error ? BRAND.danger : BRAND.teal
    onFocus?.(e)
  }
  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.style.borderColor = error ? BRAND.danger : t.inputBorder
    onBlur?.(e)
  }

  if (prefixIcon) {
    return (
      <div style={{ position: 'relative', width: fullWidth ? '100%' : undefined }}>
        <div style={{
          position: 'absolute', left: T.sp3, top: '50%', transform: 'translateY(-50%)',
          pointerEvents: 'none', zIndex: 1, color: t.textMuted,
        }}>
          {prefixIcon}
        </div>
        <input
          ref={ref}
          style={{ ...base, paddingLeft: T.sp3 * 3, ...style }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
      </div>
    )
  }

  return (
    <input
      ref={ref}
      style={{ ...base, ...style }}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...rest}
    />
  )
})

// ── Textarea ──────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, InputBase {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { dk = false, error = false, size = 'md', fullWidth = true, style, onFocus, onBlur, ...rest },
  ref,
) {
  const t = theme(dk)
  const base = inputStyles(dk, error, size, fullWidth)

  return (
    <textarea
      ref={ref}
      style={{ ...base, resize: 'vertical', minHeight: 80, ...style }}
      onFocus={e => { e.currentTarget.style.borderColor = BRAND.teal; onFocus?.(e) }}
      onBlur={e => { e.currentTarget.style.borderColor = t.inputBorder; onBlur?.(e) }}
      {...rest}
    />
  )
})

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>, InputBase {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { dk = false, error = false, size = 'md' as 'sm'|'md'|'lg', fullWidth = true, style, onFocus, onBlur, children, ...rest },
  ref,
) {
  const t = theme(dk)
  const base = inputStyles(dk, error, size, fullWidth)

  return (
    <select
      ref={ref}
      style={{ ...base, cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: `right ${T.sp3}px center`, paddingRight: T.sp3 * 3, ...style }}
      onFocus={e => { e.currentTarget.style.borderColor = BRAND.teal; onFocus?.(e) }}
      onBlur={e => { e.currentTarget.style.borderColor = t.inputBorder; onBlur?.(e) }}
      {...rest}
    >
      {children}
    </select>
  )
})

// ── FormField (Label + Input + Hint + Error) ──────────────────────────────────

interface FormFieldProps {
  label?:     string
  required?:  boolean
  hint?:      string
  error?:     string
  dk?:        boolean
  children:   React.ReactNode
  style?:     React.CSSProperties
}

/**
 * Wraps any input with a consistent label + hint + error message.
 *
 * <FormField label="Email" required hint="We never spam" dk={dk}>
 *   <Input type="email" dk={dk} />
 * </FormField>
 */
export function FormField({ label, required, hint, error, dk = false, children, style }: FormFieldProps) {
  const t = theme(dk)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp1, ...style }}>
      {label && (
        <label style={{
          fontSize:      T.fontBadge,
          fontWeight:    700,
          color:         t.textMuted,
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
        }}>
          {label}
          {required && <span style={{ color: BRAND.danger, marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p style={{ fontSize: T.fontBadge, color: t.textSubtle, margin: 0, lineHeight: T.lineNormal }}>
          {hint}
        </p>
      )}
      {error && (
        <p style={{ fontSize: T.fontBadge, color: BRAND.danger, margin: 0, lineHeight: T.lineNormal }}>
          {error}
        </p>
      )}
    </div>
  )
}
