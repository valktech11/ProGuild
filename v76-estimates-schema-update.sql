-- ── v76 Estimates Schema Update ─────────────────────────────────────────────
-- Adds declined, void status support + related timestamp columns
-- Run on staging first, then production

-- 1. Add new timestamp + metadata columns to estimates
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS declined_at   timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at     timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason   text,
  ADD COLUMN IF NOT EXISTS revision_of   uuid REFERENCES estimates(id) ON DELETE SET NULL;

-- 2. The status column is text — just ensure application handles all values:
--    'draft' | 'sent' | 'viewed' | 'approved' | 'declined' | 'invoiced' | 'paid' | 'void'
--    No enum change needed since we use text with app-level validation.

-- 3. Add decline_reason to estimates (client can optionally provide on public page)
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS decline_reason text;
