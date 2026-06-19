-- ── v114 Calculator Measurement Snapshot ────────────────────────────────────
-- Slice 1 of the calculator↔estimate parity cleanup.
--
-- PROBLEM: the estimate stored only square_count / pitch / waste_pct of the
-- calculator's inputs. The rest — linear footage (ridge / eave / perimeter),
-- pipe-boot count, and tear-off layers — lived only transiently on each client
-- (report sessionStorage, rjd, constructor prefill) and were re-derived on every
-- open. Different sourcing per client = drift between web and mobile, and values
-- reset on re-open.
--
-- FIX: the estimate becomes the single canonical record of the FULL calculator
-- input set. These 5 columns complete that snapshot. The app writes them on
-- every roofing apply path (see app/api/estimates/route.ts: new-estimate, merge,
-- revision, and the measurement-freshness pre-sync).
--
-- This slice is WRITE-ONLY: nothing reads these columns yet. Hydration (clients
-- loading every field back from here, identically) lands in Slices 2–3.
--
-- ORDERING NOTE: the app code that writes these columns is already deployed to
-- staging. Until this migration runs, a calculator apply on staging will fail
-- the roofing_estimate_data upsert (unknown column). Run this FIRST, then test.
--
-- Run on staging first, verify, then production.

ALTER TABLE roofing_estimate_data
  ADD COLUMN IF NOT EXISTS ridge_lf       NUMERIC,
  ADD COLUMN IF NOT EXISTS eave_lf        NUMERIC,
  ADD COLUMN IF NOT EXISTS perimeter_lf   NUMERIC,
  ADD COLUMN IF NOT EXISTS pipe_boots     INTEGER,
  ADD COLUMN IF NOT EXISTS tearoff_layers INTEGER;

COMMENT ON COLUMN roofing_estimate_data.ridge_lf       IS 'Calculator input: ridge linear feet. Part of the canonical measurement snapshot (v114).';
COMMENT ON COLUMN roofing_estimate_data.eave_lf        IS 'Calculator input: eave linear feet.';
COMMENT ON COLUMN roofing_estimate_data.perimeter_lf   IS 'Calculator input: perimeter (eave+rake) linear feet, drives drip edge.';
COMMENT ON COLUMN roofing_estimate_data.pipe_boots     IS 'Calculator input: pipe-boot / vent count.';
COMMENT ON COLUMN roofing_estimate_data.tearoff_layers IS 'Calculator input: tear-off layers. 0 none, 1 single, 2 double.';
