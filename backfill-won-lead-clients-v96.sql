-- backfill-won-lead-clients-v96.sql
-- Run ONCE in Supabase staging SQL Editor.
--
-- Creates a client record for every won lead that has no client_id, then links
-- it back onto the lead. Dedups by phone then email against existing clients
-- (same logic as lib/leads/resolveClientForLead.ts) so no duplicate customers.
--
-- "won" is the job_won stage key for both roofing and HVAC.

-- ── 1. Link won leads to an EXISTING client by phone ─────────────────────────
UPDATE leads l
SET    client_id = c.id
FROM   clients c
WHERE  l.lead_status = 'job_won'
AND    l.client_id IS NULL
AND    l.contact_phone IS NOT NULL
AND    c.pro_id = l.pro_id
AND    c.phone = trim(l.contact_phone);

-- ── 2. Link remaining won leads to an EXISTING client by email ───────────────
UPDATE leads l
SET    client_id = c.id
FROM   clients c
WHERE  l.lead_status = 'job_won'
AND    l.client_id IS NULL
AND    l.contact_email IS NOT NULL
AND    c.pro_id = l.pro_id
AND    lower(c.email) = lower(trim(l.contact_email));

-- ── 3. Create a NEW client for won leads still unlinked, then link them ───────
-- Uses a CTE to insert and capture the new client id per lead.
WITH unlinked AS (
  SELECT id AS lead_id, pro_id, contact_name, contact_phone, contact_email,
         split_part(property_address, ',', 1) AS street,
         contact_city, contact_state, contact_zip
  FROM   leads
  WHERE  lead_status = 'job_won'
  AND    client_id IS NULL
  AND    contact_name IS NOT NULL
),
inserted AS (
  INSERT INTO clients (pro_id, full_name, phone, email, address_line1, city, state, zip_code)
  SELECT pro_id,
         trim(contact_name),
         NULLIF(trim(contact_phone), ''),
         NULLIF(lower(trim(contact_email)), ''),
         NULLIF(trim(street), ''),
         NULLIF(trim(contact_city), ''),
         NULLIF(trim(contact_state), ''),
         NULLIF(trim(contact_zip), '')
  FROM   unlinked
  RETURNING id AS client_id, full_name, pro_id
)
UPDATE leads l
SET    client_id = i.client_id
FROM   inserted i, unlinked u
WHERE  l.id = u.lead_id
AND    i.pro_id = u.pro_id
AND    i.full_name = trim(u.contact_name);

-- ── 4. Verify — won leads with no client should now be zero ──────────────────
SELECT count(*) AS won_leads_without_client
FROM   leads
WHERE  lead_status = 'job_won' AND client_id IS NULL AND contact_name IS NOT NULL;

-- Show the linked result
SELECT l.contact_name, l.lead_status, l.client_id, c.full_name AS client_name
FROM   leads l LEFT JOIN clients c ON l.client_id = c.id
WHERE  l.lead_status = 'job_won'
ORDER  BY l.updated_at DESC
LIMIT  20;
