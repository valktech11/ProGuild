# ProGuild.ai — Dev Handover v88 (Sprint 4 — Premium Report In Progress)
**Date:** May 12, 2026
**Last commit:** `fd4d752` on `dev` + `staging`
**Next session starts here.**

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/premiumReportPdf.ts` and `lib/roofing/reportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Never rename, never add JSX syntax. Use `React.createElement` aliased as `h`.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
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

## 2. Sprint 4 Status — Premium Report Full Rebuild

### What's DONE and working
- 12-page structure built and rendering
- Cover page: satellite image, metric boxes, LF summary, pro info card — white Roofr-style aesthetic
- Page 2: full satellite top view
- Pages 3-4: Street View N/S/E/W (street view fixed with metadata-first approach)
- Pages 9-12: Report summary, all structures, material estimate, disclaimer — all correct data
- Material estimate: 5 brand categories × 6 waste% columns — matches Roofr output
- Filename: `ProGuild_Premium_3919_Highgate_ct_JACKSONVILLE_FL_32216.pdf` ✅
- Auth pattern: `pro_id` + `report_id` from body (matches existing codebase)
- solar_raw fallback: auto-fetches from Solar API if null, persists back to DB

### What's STILL BROKEN
1. **SVG diagrams (pages 5-8) — blank** — "Segment data unavailable" shows despite solar_raw having 8 segments. Debug logging added in `fd4d752` — check Vercel logs for `[premium-report] Segments found: X` on next run. Root cause unknown — parse may be hitting a type mismatch on the JSONB → object deserialization.
2. **Street View** — fixed `source=outdoor` in metadata call. Not yet re-tested after fix.
3. **Cover dead space** — bottom half of page 1 empty below LF summary + pro card.
4. **Pro name** — fixed to use `full_name`, `business_name`, `phone_cell` columns. Not yet re-tested.

### Test Reports (Staging)

| Property | UUID | Solar segs | Status |
|---|---|---|---|
| 3919 Highgate ct, Jacksonville FL | `f501139a-967f-4284-a89d-568546804e05` | 8 | solar_raw ✅, lf ✅, premium needs regen |
| 17507 Cypress Hilltop Way, Hockley TX | `3ed6e40e-017c-4343-8511-fd027e55e206` | 15 | solar_raw ❌, lf ❌ — needs full regen |
| 3696 Walnut Brook Dr, Rochester Hills MI | `754f5244-5469-4a23-91f4-dc0cbb53f17b` | 16 | solar_raw ❌, lf ❌ — needs full regen |

**To reset Highgate for fresh premium PDF:**
```sql
UPDATE roof_reports SET premium_r2_key = NULL
WHERE id = 'f501139a-967f-4284-a89d-568546804e05';
```

**For Hockley + Rochester Hills (need everything):**
Generate Report → DSM → Material Order in UI sequence.

---

## 3. Key Architecture

```
app/
  api/
    roofing/
      report/route.ts          — Quick Bid pipeline (Solar → PDF → R2)
      reports/route.ts         — GET list + DELETE
      dsm/route.ts             — POST: segment-based linear footage
      premium-report/route.ts  — POST: images + PDF build — REBUILT Sprint 4

lib/
  roofing/
    dsmAnalysis.ts             — computeLinearFootageFromSegments() v2.1
    reportPdf.ts               — Quick Bid PDF (NO JSX)
    premiumReportPdf.ts        — Premium PDF (NO JSX) — REBUILT Sprint 4
  api/
    utils.ts                   — apiError(), isValidUuid(), getR2Client(), getR2Bucket()
  supabase.ts                  — getSupabaseAdmin(), getSupabase()
```

### Pros Table Columns (CRITICAL — wrong columns caused "ProGuild Pro" bug)
```
full_name        — NOT "name"
business_name    — NOT "company_name"  
phone_cell       — NOT "phone"
email
license_verified
```

### Solar Raw Structure
```
solar_raw = full buildingInsights response = {
  solarPotential: {
    roofSegmentStats: [...],  ← segments for SVG diagrams
    boundingBox: { sw: {latitude, longitude}, ne: {latitude, longitude} }
  },
  imageryDate: { year, month, day }
}
```

### Street View Approach
```typescript
// Metadata-first: find nearest outdoor pano_id within 500m
// source=outdoor in METADATA call excludes user-uploaded indoor photos
const metaUrl = `...streetview/metadata?location=${lat},${lng}&radius=500&source=outdoor&key=${apiKey}`
// Then fetch image by pano_id
const imgUrl = `...streetview?pano=${meta.pano_id}&heading=${heading}&pitch=10&fov=90&size=640x400&key=${apiKey}`
```

### Edge Colors (SVG diagrams)
```
Ridge:  #1E3A8A  (dark blue)
Hip:    #D97706  (amber)
Valley: #DC2626  (red)
Rake:   #16A34A  (green)
Eave:   #6B7280  (gray)
```

---

## 4. SVG Diagram Debug — Next Session Priority

The segment parsing was made permissive in `fd4d752`. On next Material Order run, check Vercel function logs for:
- `[premium-report] solar_raw is null` — means fallback fetch ran
- `[premium-report] solarPotential missing` — structure issue
- `[premium-report] roofSegmentStats missing or empty, keys: [...]` — shows actual keys
- `[premium-report] found X segments` — success path
- `[premium-report] Segments found: X for: <uuid>` — after parse

If segments found > 0 but diagrams still blank, issue is in `buildDiagramSvg()` in `premiumReportPdf.ts` — likely the SVG element construction failing silently in react-pdf.

---

## 5. Commits This Session

| Hash | Message |
|---|---|
| `fd4d752` | fix: pros columns, segment parse permissive+debug, special chars, image heights, Street View source=outdoor |
| `ac3cbcb` | fix: Street View metadata radius 200m → 500m |
| `44ed745` | fix: Street View metadata-first approach — find nearest pano_id |
| `340e30a` | fix: Street View remove source=outdoor from image URL, add radius |
| `f0bdf43` | fix: solar_raw fallback fetch when null, emoji placeholder fix |
| `dc302f9` | fix: white Roofr aesthetic, complexity badge from facetCount, filename with address |
| `d19d2e6` | fix: auth pattern — pro_id+report_id from body, getSupabaseAdmin |
| `cebe239` | feat: premium report full rebuild — 12-page EagleView+Roofr parity |

---

## 6. Sprint Roadmap

| Sprint | Status |
|---|---|
| 1-3 | ✅ Complete |
| 4 — Premium PDF full rebuild | ⚠️ In progress — SVG diagrams + Street View remaining |
| 4 — Street View + Gemini classification | ⬜ After PDF done |
| 4 — Report→Calculator→Estimate pre-fill | ⬜ Sprint 4 |
| 5 — Microsoft Building Footprints | ⬜ Sprint 5 |
| 6 — Nearmap AI Features | ⬜ Sprint 6 |

---

## 7. Env Vars (Vercel staging)

```
GOOGLE_SOLAR_API_KEY      — Solar API + Maps Static + Street View Static + Gemini
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME            — proguild-media-staging
NEXT_PUBLIC_VERCEL_ENV    — auto-set by Vercel
GEMINI_API_KEY            — AI Studio prepay, $10 loaded May 11 2026
```

---

## 8. Pending Before Launch (Unchanged)

1. Supabase Pro ($25/mo) — free tier pauses after inactivity
2. Twilio 10DLC — start now, 1-2 week approval
3. Clean debug routes before prod
4. Stripe production activation
5. Google Places autocomplete referrer allowlist
