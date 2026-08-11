-- v75-estimates-contacts-sql.sql
-- Run on STAGING then PRODUCTION
-- Adds contact fields to estimates table so email/phone actions work

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text;
