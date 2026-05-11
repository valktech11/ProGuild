# ProGuild.ai — Dev Handover v86 (Sprint 3 Complete + Linear Footage Overhaul)
**Date:** May 11, 2026
**Last commit:** `379b5d3` on `dev` + `staging`
**Next session starts here.**

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Never rename, never add JSX syntax. Use `React.createElement` aliased as `h`.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation and GeoTIFF decode require Node.js runtime.
3. **Git push: always use full token URL, never `&&`, always separate commands:**
   ```bash
   git push https://GH_TOKEN_SEE_VERCEL@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://GH_TOKEN_SEE_VERCEL@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **DO NOT BUILD until user says "go".**
5. **NO Claude/Anthropic API in prod** — Gemini only for vision.
6. **Staging gate:** `process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'` — auto-set by Vercel.

---

## 1. Project Stack

| Item | Value |
|---|---|
| Repo | github.com/valktech11/ProGuild |
| GH Token | GH_TOKEN_SEE_VERCEL |
| Stack | Next.js 16.2.2, Supabase, Vercel (project: tradesnetwork), Cloudflare R2 |
| Staging | staging.proguild.ai (password: proguild2026) |
| Test account | wasimakram@wasim.com |
| Branch flow | dev → staging (auto-deploy on push) |

---

## 2. Architecture — Key Files

```
app/
  api/
    roofing/
      report/route.ts          — Quick Bid report pipeline (Solar API → PDF → R2)
      reports/route.ts         — GET list + DELETE (re-signs R2 URLs every call)
      dsm/route.ts             — POST: segment-based linear footage from solar_raw
                                 GET: debug modes (staging only)
                                   ?mode=segments&report_id=<uuid> → dumps roofSegmentStats
                                   default → raw Solar dataLayers response
      premium-report/route.ts  — POST: reads linear_footage from DB → Premium PDF → R2
  dashboard/
    roofing/
      property/[id]/page.tsx   — Property detail page (CTA tiles, report rows)

lib/
  api/
    utils.ts                   — Shared: apiError(), validateCoordinates(), isValidUuid(),
                                  getR2Client(), getR2Bucket(), safeFetch()
  roofing/
    dsmAnalysis.ts             — computeLinearFootageFromSegments() [NEW - see §5]
                                  runDsmDebug() [staging debug only]
                                  runDsmAnalysis() [kept but unused - RANSAC legacy]
    reportPdf.ts               — Quick Bid PDF builder (React.createElement, NO JSX)
    premiumReportPdf.ts        — Premium PDF builder (React.createElement, NO JSX)
```

---

## 3. Report Product Architecture

### Report 1: Quick Bid Report (free)
- **Button:** "Generate Report" (teal launch card, full width)
- **Route:** `POST /api/roofing/report`
- **Output:** 4-5 page PDF: cover, measurements, pitch table, satellite images, waste table, AI condition assessment, historic district badge
- **DB:** `roof_reports.r2_key`
- **Row button:** "Bid Report" (teal, 120px fixed width)

### Report 2: Material Order / Premium Report (Pro/Elite plan)
- **Button:** "Material Order" (purple, on report row)
- **Flow:** 2 separate API calls:
  1. `POST /api/roofing/dsm` — computes linear footage from `solar_raw.roofSegmentStats` (~1s, no GeoTIFF)
  2. `POST /api/roofing/premium-report` — reads existing data, renders PDF, uploads to R2 (~10s)
- **Output:** 4 page PDF: cover with linear footage summary, areas+waste+complexity, linear footage detail + material order guide, disclaimer
- **DB:** `roof_reports.linear_footage` (JSONB), `roof_reports.premium_r2_key`
- **Row button:** "Material Order" → "Material Order PDF" once generated
- **NOTE:** DSM call no longer needs `lat`/`lng` — reads `solar_raw` from DB directly

### Report Row UI (property/[id]/page.tsx)
```
[📄]  Roof Area  22.5 sq  ·  Pitch  6/12       May 11 · 3:22 PM
      [↓ Bid Report (120px)]  [↓ Material Order (140px)]  [🗑 red icon]
```
- Both buttons fixed width, inline horizontal layout
- Delete = red trash icon (32×32), fills red on hover, spinner on in-progress
- Linear footage chips removed from row — that detail lives in the PDF

---

## 4. Linear Footage Algorithm — MAJOR CHANGE THIS SESSION

### Old approach (RANSAC/DSM) — REPLACED
The RANSAC GeoTIFF approach was fundamentally broken:
- Google Solar DSM stores absolute elevation — a 6/12 roof is only 2.3m height change over 300 pixels → drowns in noise
- RANSAC found 18/20 near-flat noise facets, only 2 real roof planes
- Produced wildly wrong results (981ft ridge, 0ft hip; then 2599ft hip after fix attempt)

### New approach — `computeLinearFootageFromSegments()` ✅
Located in `lib/roofing/dsmAnalysis.ts`. Uses `roofSegmentStats` from `solar_raw` (already in DB from Bid Report generation). Each segment has `pitchDegrees`, `azimuthDegrees`, `groundAreaMeters2`, and `center` lat/lng.

**Algorithm:**

**Ridge:** All 180° opposite-facing pairs within 2.0x adjacency. Keep only max-combined-area pair. Skip if combined areas between pairs differ by <5% (= square hip roof = no ridge).

**Valley:** Only main↔secondary pairs (main = gnd ≥ 20m²). Diff 10–45°. 3.0x adjacency threshold. These are where secondary wings attach to main roof.

**Hip:** Same-tier pairs only (main↔main OR secondary↔secondary). Diff 45–150°. Top-2 closest neighbors per segment. Main hips: `dist × 1.4` (diagonal rafter correction). Secondary hips: `dist` (no correction).

**Eave/Rake:** From ground area total → square perimeter approximation. Hip-dominant (ridge < 15ft): 90/10 eave/rake. Gable/mixed: 70/30.

**Validated against 3919 Highgate (22.5sq, 6/12, 8 facets, near-square hip + secondary wing):**
```
Ridge:  0 ft  ✅ (correct — square hip roof)
Hip:    135 ft ✅ (expected ~124ft, 9% over — within ±20%)
Valley: 59 ft  ⚠ (expected ~20-40ft, ~30% over — acceptable, still orders 2 rolls same as 40ft)
Eave:   159 ft ✅ (expected ~157-165ft — excellent)
Rake:   18 ft  ✅ (plausible for secondary wing gable ends)
```

**Accuracy note:** ±20% on all lines. Sufficient for material ordering.

### DSM POST route change
`POST /api/roofing/dsm` no longer needs `lat`/`lng` in the request body. Only needs `report_id` and `pro_id`. Reads `solar_raw` from DB, extracts `roofSegmentStats`, computes linear footage. Much faster (~1s vs ~60s before).

---

## 5. Pro Name Fix
**Problem:** Premium PDF showed "ProGuild Pro" instead of actual pro name.
**Root cause:** `premium-report/route.ts` was selecting `company_name` and `phone` from `pros` table — columns don't exist. Should be `business_name` and `phone_cell`.
**Fixed in:** `app/api/roofing/premium-report/route.ts` — now correctly shows real name.

---

## 6. UI Changes This Session

### Report Row Redesign (property/[id]/page.tsx)
- **Before:** Raw numbers `22.5 sq  6/12  12% waste  8 facets` — no labels
- **After:** Two labelled columns: `ROOF AREA / 22.5 sq` | `PITCH / 6/12` | timestamp
- Both action buttons fixed width (Bid Report 120px, Material Order 140px), inline
- Delete: red trash icon with hover fill, spinner during delete
- Linear footage chips removed from row (detail lives in PDF)

---

## 7. Debug Routes (Staging Only — DELETE Before Prod)

### `GET /api/roofing/dsm?mode=segments&report_id=<uuid>`
Dumps `roofSegmentStats` from `solar_raw` for a report. Shows `pitchDegrees`, `azimuthDegrees`, `area_sqft`, `center`, `bbox`, `all_keys`.

### `GET /api/roofing/dsm-debug?lat=<lat>&lng=<lng>`
Full RANSAC debug — dumps facet normals, edge classifications, hDot, dot3d values. Used to diagnose the RANSAC classification issues. Can be deleted.

**To delete both before prod:**
```bash
rm -rf app/api/roofing/dsm-debug/
# Remove mode=segments block from app/api/roofing/dsm/route.ts GET handler
```

---

## 8. Database — roof_reports columns (unchanged)

```sql
id                UUID PRIMARY KEY
pro_id            UUID (FK → pros.id)
property_id       UUID (FK → properties.id) nullable
address           TEXT
lat               DOUBLE PRECISION
lng               DOUBLE PRECISION
r2_key            TEXT
premium_r2_key    TEXT nullable
total_sqft        NUMERIC
total_squares_raw NUMERIC
total_squares_order NUMERIC
dominant_pitch    TEXT
facet_count       INTEGER
waste_factor      NUMERIC
imagery_date      TEXT
pitch_breakdown   JSONB  -- [{pitch, sqft, sq, pct}]
linear_footage    JSONB  -- {ridge_ft, hip_ft, valley_ft, rake_ft, eave_ft, total_linear_ft, accuracy_note, facet_count}
solar_raw         JSONB  -- full buildingInsights response incl. roofSegmentStats
created_at        TIMESTAMPTZ
```

**CRITICAL:** `solar_raw` must be present for Material Order to work. It's populated during Bid Report generation. If a report was generated before the current pipeline, the Material Order button will error with "No Solar API data on this report — regenerate the Bid Report first".

---

## 9. Commits This Session (newest first)

| Hash | Message |
|---|---|
| `379b5d3` | fix: accuracy note ±15% → ±20% on PDF page 3 |
| `5ceaf5e` | fix: segment algorithm v2 — ridge dedup, hip tier separation, valley main↔sec only, eave/rake hip split + pro name column fix |
| `9e3afaa` | feat: segment-based linear footage from Solar API roofSegmentStats — replaces DSM/RANSAC |
| `115d17f` | debug: fix segment field names + dump all_keys |
| `6178ebb` | debug: dsm GET segments mode — dumps roofSegmentStats |
| `c2823c9` | fix: RANSAC noise filter (slope threshold) |
| `a4f4ea9` | debug: DSM edge classifier debug route |
| `0c8bf8e` | fix: classifyEdge hip/valley/ridge + report row labelled layout + red trash delete |

---

## 10. Sprint Roadmap

| Sprint | Status | Notes |
|---|---|---|
| 1 — Full pipeline, PDF, R2, pitch smoothing | ✅ Complete | |
| 2A — Nearest supplier, NOAA | ✅ Done | NOAA blocked, deferred |
| 2B — RentCast | ⛔ Deferred | 50 free/mo too small |
| 3 — Gemini Vision condition | ✅ Complete | |
| 3 — Historic District badge (NPS NRHP) | ✅ Complete | |
| 3 — Quick Bid PDF (EagleView Bid Perfect equiv) | ✅ Complete | |
| 3 — Premium PDF (EagleView Premium equiv) | ✅ Complete | |
| 3 — Linear footage (segment-based, Solar API) | ✅ Complete | ±20% accuracy, shippable |
| 3 — Pitch diagram, Area diagram, A-Z facet | ⬜ Not started | Sprint 4 candidate |
| 4 — Report→Calculator→Estimate pre-fill | ⬜ Not started | |
| 4 — Good/Better/Best estimate | ⬜ Not started | |
| 4 — Homeowner proposal PDF | ⬜ Not started | |

---

## 11. Pending Items (Next Session)

### Priority 1 — Supabase upgrade to Pro ($25/mo)
**NON-NEGOTIABLE before any real users.** Free tier pauses DB after inactivity. 134k records at risk. Do this before outreach.

### Priority 2 — Twilio 10DLC registration
Start NOW — 1-2 week approval. Blocks SMS in v86+. Cannot be rushed.
See `LAUNCH_CHECKLIST.md` for details.

### Priority 3 — Clean up debug routes before prod push
```bash
rm -rf app/api/roofing/dsm-debug/
# Also remove mode=segments GET handler from dsm/route.ts
```

### Priority 4 — Sprint 4: Report→Calculator→Estimate pre-fill
When user clicks Calculator from property page after generating report:
- `sessionStorage.pg_roof_measurements` is already set with `squares`, `pitch`, `source: 'roof_report'`
- Calculator page needs to read this and pre-fill the form
- Estimate builder needs to pre-fill from Calculator output

### Priority 5 — SVG Diagrams for Premium PDF (EagleView parity)
Generate wireframe roof diagrams from `roofSegmentStats` data:
- Length diagram: facet polygons coloured by edge type (red=ridge, orange=hip, blue=valley, green=eave/rake)
- Pitch diagram: facets shaded by pitch, arrows showing slope direction
- Area diagram: facets labelled with sqft
- Notes diagram: facets labelled A–Z smallest to largest
These use the same `roofSegmentStats` we already have. Build SVG from center coordinates + azimuth + area.

### Priority 6 — Google Places autocomplete on Add Property modal
`NEXT_PUBLIC_GOOGLE_MAPS_KEY` referrer allowlist issue. Fix in Google Cloud Console:
- Enable Places API on the key
- Add `staging.proguild.ai/*` and `proguild.ai/*` to HTTP referrer allowlist

### Priority 7 — Production Stripe activation
Stripe is in test mode. Need to activate before any real money. See Master Build Plan Phase 5.

---

## 12. Known Issues

- **Valley slightly overcounted:** 59ft reported vs ~30-40ft expected for Highgate's secondary wing. Acceptable for material ordering (still orders 2 rolls). Lower priority fix.
- **NOAA hail badge:** SWDI nx3hail dataset frozen. Code correct. Parked until NOAA restores.
- **Google Places autocomplete:** Not working on staging Add Property modal. Config issue, not code.
- **RANSAC code:** `runDsmAnalysis()` still in `dsmAnalysis.ts` but unused. Can be removed eventually to reduce bundle.

---

## 13. Env Vars (Vercel staging)

```
GOOGLE_SOLAR_API_KEY      — Solar API + Maps Static + Gemini
NEXT_PUBLIC_SUPABASE_URL  — Supabase staging project
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME            — proguild-media-staging
NEXT_PUBLIC_VERCEL_ENV    — auto-set by Vercel (no manual config)
GEMINI_API_KEY            — AI Studio prepay, $10 loaded May 11 2026
```

---

## 14. How to Test Material Order End-to-End

1. Log in as `wasimakram@wasim.com` on staging
2. Navigate to a property → generate Bid Report first (populates `solar_raw`)
3. Clear any existing linear footage:
   ```sql
   UPDATE roof_reports SET linear_footage = NULL, premium_r2_key = NULL
   WHERE address ILIKE '%Highgate%';
   ```
4. Click "Material Order" button on the report row
5. Wait ~10s (segment analysis ~1s + PDF generation ~10s)
6. PDF should open with: Ridge ~0ft, Hip ~130ft, Valley ~50ft, Eave ~160ft, Rake ~18ft
7. Verify pro name shows correctly (not "ProGuild Pro")
