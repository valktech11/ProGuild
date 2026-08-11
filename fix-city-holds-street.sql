-- fix-city-holds-street.sql
--
-- Repairs rows where the STREET ADDRESS was written into the city column.
--
-- CAUSE (fixed in code — see lib/address.ts):
--   The Places autocomplete handler in four modals parsed Google's
--   formatted_address with `parts[parts.length - 3]`. That index was correct
--   while the string still ended in ", USA" (4 segments). A later
--   `.replace(', USA', '')` dropped it to 3 segments, making length-3 == 0 —
--   the STREET. So city was written with the street address.
--
--   "3931 Highgate Ct, Tampa, FL 33614, USA"
--     -> ["3931 Highgate Ct","Tampa","FL 33614"]
--     -> parts[0] = "3931 Highgate Ct"   <-- written into city
--
-- EFFECT: every surface rendering [address, city, state] showed
--   "3931 Highgate Ct, 3931 Highgate Ct, FL"
--
-- RUN ORDER: sections 1 and 2 are read-only. Inspect their output BEFORE
-- running section 3. Section 4 verifies. Take a snapshot first.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. HOW BAD IS IT? (read-only)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'leads'   AS tbl,
       count(*) FILTER (WHERE lower(trim(contact_city)) = lower(trim(property_address))) AS exact_dupes,
       count(*) FILTER (WHERE contact_city ~ '^\s*\d')                                    AS city_starts_with_digit,
       count(*)                                                                            AS total_rows
FROM leads
WHERE contact_city IS NOT NULL AND contact_city <> ''
UNION ALL
SELECT 'clients',
       count(*) FILTER (WHERE lower(trim(city)) = lower(trim(address_line1))),
       count(*) FILTER (WHERE city ~ '^\s*\d'),
       count(*)
FROM clients
WHERE city IS NOT NULL AND city <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. EXACTLY WHICH ROWS WOULD CHANGE (read-only — review before section 3)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT id, contact_name, property_address, contact_city, contact_state, contact_zip
FROM leads
WHERE contact_city IS NOT NULL
  AND contact_city <> ''
  AND ( lower(trim(contact_city)) = lower(trim(property_address))
        OR contact_city ~ '^\s*\d' )
ORDER BY created_at DESC;

SELECT id, full_name, address_line1, city, state, zip_code
FROM clients
WHERE city IS NOT NULL
  AND city <> ''
  AND ( lower(trim(city)) = lower(trim(address_line1))
        OR city ~ '^\s*\d' )
ORDER BY created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REPAIR  (destructive — run only after reviewing section 2)
--
--    Sets the bad city to NULL rather than guessing a value. We cannot
--    recover the true city from what is stored: the street overwrote it and
--    the original Places result is gone. NULL is honest and re-fillable by
--    editing the record; a wrong city is silent corruption.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

UPDATE leads
SET    contact_city = NULL
WHERE  contact_city IS NOT NULL
  AND  contact_city <> ''
  AND  ( lower(trim(contact_city)) = lower(trim(property_address))
         OR contact_city ~ '^\s*\d' );

UPDATE clients
SET    city = NULL
WHERE  city IS NOT NULL
  AND  city <> ''
  AND  ( lower(trim(city)) = lower(trim(address_line1))
         OR city ~ '^\s*\d' );

-- Inspect the row counts above, then COMMIT (or ROLLBACK to abort).
COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. VERIFY — both counts must be 0
-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'leads' AS tbl, count(*) AS still_bad
FROM leads
WHERE contact_city IS NOT NULL AND contact_city <> ''
  AND ( lower(trim(contact_city)) = lower(trim(property_address))
        OR contact_city ~ '^\s*\d' )
UNION ALL
SELECT 'clients', count(*)
FROM clients
WHERE city IS NOT NULL AND city <> ''
  AND ( lower(trim(city)) = lower(trim(address_line1))
        OR city ~ '^\s*\d' );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. OPTIONAL GUARD — reject the bug at the DB level if it ever returns.
--    Not enabled by default: a legitimate city CAN start with a digit
--    (e.g. "29 Palms", CA). Enable only if you accept that trade-off.
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER TABLE leads   ADD CONSTRAINT leads_city_not_street
--   CHECK (contact_city IS NULL OR property_address IS NULL
--          OR lower(trim(contact_city)) <> lower(trim(property_address)));
-- ALTER TABLE clients ADD CONSTRAINT clients_city_not_street
--   CHECK (city IS NULL OR address_line1 IS NULL
--          OR lower(trim(city)) <> lower(trim(address_line1)));
