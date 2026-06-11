-- v102 — lead-edit fixes: missing contact_zip column + broaden lead_source constraint
--
-- Two issues surfaced while editing a lead:
--
-- (1) contact_zip: the edit form and several UI paths read/write leads.contact_zip,
--     but no migration ever created the column. (Added manually on staging; this
--     makes it repeatable for prod.)
--
-- (2) lead_source constraint: the roofing trade config (lib/trades/roofing/config.ts)
--     offers sources 'Storm', 'Door_Knock', and 'Google' that were never in the
--     leads_lead_source_check constraint, so saving a lead with those failed with:
--       new row for relation "leads" violates check constraint "leads_lead_source_check"
--
-- Safe to run on staging and prod (idempotent).

-- (1) Missing column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_zip text;

-- (2) Realign the source constraint with the values the UI actually presents
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check
  CHECK (lead_source IN (
    'Profile_Page','Job_Post','Search_Result','Direct','Registry_Card',
    'Phone_Call','Facebook','Instagram','Referral','Website',
    'Yard_Sign','Walk_In','Other','Insurance','Canvassing','Manual',
    'Storm','Door_Knock','Google'
  ));
