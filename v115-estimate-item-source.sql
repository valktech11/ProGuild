-- v115-estimate-item-source.sql
-- Adds line-item provenance so the estimate UI can show a "Detected from
-- measurements" badge — the roofer sees WHY a line (e.g. valley lining, ridge
-- caps) is on the estimate: it was derived from their traced ProMeasure linear
-- footage, not typed manually.
--
-- Values:
--   'measurement' — quantity derived from traced LF (ridge/hip/valley/perimeter)
--   'manual'      — added or edited by the roofer (default; also back-fills
--                   every pre-existing row so nothing is mislabelled as detected)
--
-- Run on staging (zttsqqvaakblgbutviai) first, then prod (bzfauzqqxwtqqskjhrgq).

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Existing rows are unknown provenance; 'manual' (the default) is the safe,
-- non-misleading label — they will simply not show the "detected" badge.
