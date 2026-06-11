-- v102 — broaden leads_lead_source_check to include all UI-offered roofing sources
--
-- Root cause: the roofing trade config (lib/trades/roofing/config.ts) offers lead
-- sources 'Storm', 'Door_Knock', and 'Google' that were never added to the DB check
-- constraint. Editing a lead and choosing any of those failed with:
--   new row for relation "leads" violates check constraint "leads_lead_source_check"
--
-- This realigns the constraint with the values the UI actually presents.
-- Safe to run on both staging and prod (idempotent drop + recreate).

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_lead_source_check
  CHECK (lead_source IN (
    'Profile_Page','Job_Post','Search_Result','Direct','Registry_Card',
    'Phone_Call','Facebook','Instagram','Referral','Website',
    'Yard_Sign','Walk_In','Other','Insurance','Canvassing','Manual',
    'Storm','Door_Knock','Google'
  ));
