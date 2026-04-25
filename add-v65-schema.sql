-- ── v65 schema: ZIP code lookup table ────────────────────────────────────────
-- Import data after running this:
-- Download free CSV from simplemaps.com/data/us-zips
-- Import via Supabase Table Editor → Import CSV
-- Or run: COPY zip_codes FROM '/path/to/uszips.csv' CSV HEADER;

CREATE TABLE IF NOT EXISTS zip_codes (
  zip     TEXT PRIMARY KEY,
  city    TEXT NOT NULL,
  state   TEXT NOT NULL,  -- 2-letter abbreviation e.g. 'FL'
  county  TEXT,
  lat     NUMERIC,
  lng     NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_zip_state ON zip_codes(state);
CREATE INDEX IF NOT EXISTS idx_zip_city  ON zip_codes(city, state);

-- Enable RLS but allow public read (ZIP codes are public data)
ALTER TABLE zip_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zip_codes_public_read" ON zip_codes
  FOR SELECT USING (true);

SELECT 'zip_codes table ready — import CSV data now' as status;
