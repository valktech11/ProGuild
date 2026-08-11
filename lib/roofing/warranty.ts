// Single source for warranty status derivation. Computed server-side and
// returned by /api/roofing/warranties so web and mobile both paint the same
// value rather than each re-deriving it from expiry_date (§28).

export type WarrantyStatusKey = 'none' | 'expired' | 'expiring' | 'active'

export function computeWarrantyStatus(expiry: string | null | undefined): { key: WarrantyStatusKey; label: string } {
  const exp = expiry ? new Date(expiry) : null
  const valid = exp && !isNaN(exp.getTime())
  if (!valid) return { key: 'none', label: 'No expiry' }
  const days = Math.floor((exp!.getTime() - Date.now()) / 86400000)
  if (days < 0)    return { key: 'expired',  label: 'Expired' }
  if (days <= 365) return { key: 'expiring', label: 'Expiring soon' }
  return { key: 'active', label: 'Active' }
}
