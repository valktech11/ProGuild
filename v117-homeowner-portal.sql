-- v117 — Homeowner portal access tokens
-- Each lead can have a portal token for the homeowner to track job progress.
-- Token is generated on demand; never expires (revocable by deleting the row).

CREATE TABLE IF NOT EXISTS homeowner_portal_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id       uuid NOT NULL,
  token        text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_lead ON homeowner_portal_tokens (lead_id);
CREATE INDEX IF NOT EXISTS idx_portal_token ON homeowner_portal_tokens (token);
