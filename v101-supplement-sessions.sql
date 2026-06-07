-- v101 — Supplement Assistant (FL AI claim-supplement)
-- Stores every run: the pasted adjuster scope + the AI result. This is the
-- claim-outcome data moat — supplements by carrier/property accumulate here.
-- Run manually on Supabase staging. Idempotent.

CREATE TABLE IF NOT EXISTS supplement_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pro_id       uuid NOT NULL,
  scope_text   text NOT NULL,
  result_json  jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplement_sessions_lead ON supplement_sessions (lead_id);
CREATE INDEX IF NOT EXISTS idx_supplement_sessions_pro  ON supplement_sessions (pro_id);
