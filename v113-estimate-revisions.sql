-- ── v113 Estimate Revisions ─────────────────────────────────────────────────
-- Activates the revision system. `revision_of` already exists (v76); this adds
-- the human-facing revision number so revisions can be labelled (Rev 1, Rev 2…).
--
-- Behaviour (app-level, see app/api/estimates/route.ts):
--   • Re-pricing a FROZEN estimate (approved/invoiced/paid) never overwrites it.
--     A new draft estimate is created, linked via revision_of, numbered here.
--   • Original keeps its signature, invoice and status intact.
--   • There is no cap on revisions — each new one increments revision_number.
--
-- Run on staging first, then production.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0;

-- Index for fast chain lookups per lead (revision depth counting).
CREATE INDEX IF NOT EXISTS idx_estimates_revision_of ON estimates(revision_of)
  WHERE revision_of IS NOT NULL;

COMMENT ON COLUMN estimates.revision_number IS
  'Revision depth: 0 = original, 1 = first revision, etc. Set by app on revision create.';
