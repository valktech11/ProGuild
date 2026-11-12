-- ProGuild — companies.email column
-- ===========================================================================
-- The companies table lost `email` on staging (schema drift — prod has it, so
-- claims succeed in prod but failed in staging with 42703 "column email of
-- relation companies does not exist"). createCompany() in
-- app/api/auth/signup/route.ts and the claim routes all insert `email`, so a
-- missing column breaks every claim on the affected DB. This re-adds it to
-- match prod. RUN once per environment in the Supabase SQL editor. Idempotent.
-- ===========================================================================

alter table companies add column if not exists email text;  -- owner contact email, nullable
