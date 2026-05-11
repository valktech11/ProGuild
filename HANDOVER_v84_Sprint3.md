# ProGuild.ai — Dev Handover v84 (Sprint 3 Debug Session)
**Date:** May 11, 2026  
**Last commit:** `656bb74` on `dev` + `staging`  
**Next session starts here.**

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/reportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Never rename, never add JSX syntax.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
3. **Git push: always use full token URL, never `&&`, always separate commands:**
   ```bash
   git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **`useSearchParams` always wrapped in `Suspense`** in Next.js App Router.
5. **DO NOT BUILD until user says "go".**
6. **NO Claude/Anthropic API in prod** — Gemini only for vision. No `ANTHROPIC_API_KEY` references in route.ts.

---

## 1. Project Stack

| Item | Value |
|---|---|
| Repo | github.com/valktech11/ProGuild |
| Token | ghp_REDACTED_SEE_VERCEL |
| Stack | Next.js 16.2.2, Supabase, Vercel, Cloudflare R2 |
| Vercel project | `tradesnetwork` |
| Staging | staging.proguild.ai (password: proguild2026) |
| Production | proguild.ai → `main` branch |
| Supabase staging | SUPABASE_URL_IN_VERCEL |
| R2 bucket | proguild-media-staging |
| Test account | wasimakram@wasim.com |
| Auth | sessionStorage `pg_pro` |
| Build time | ~35s. Ignored Build Step: `bash -c 'exit 1'` (always builds) |

---

## 2. Environment Variables (Vercel staging)

| Var | Purpose |
|---|---|
| `GOOGLE_SOLAR_API_KEY` | Solar API + Maps Static + Geocoding + Places (server-side, no referrer restriction) |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Browser-side Maps JS + Places autocomplete (has HTTP referrer restriction) |
| `GEMINI_API_KEY` | Gemini 2.0-flash for Vision condition assessment — **AI Studio prepay, $10 loaded May 11 2026** |
| `SUPABASE_URL` | Staging Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role |
| `R2_ACCOUNT_ID` | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `R2_BUCKET_NAME` | `proguild-media-staging` |

### API Key Architecture (GCP Project: ProGuild — project-657b5a72-f720-4820-89f)
- **ProGuild Server Key** → `GOOGLE_SOLAR_API_KEY` (Solar, Geocoding, Maps Static, Places)
- **Maps Platform API Key** → `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (Maps JS, Places autocomplete, HTTP referrer restricted)
- **Gemini API Key** → `GEMINI_API_KEY` (Generative Language API — AI Studio prepay, NOT GCP billing)

**IMPORTANT:** Gemini billing is separate from GCP billing. Managed at aistudio.google.com → Billing → prepay credits. $10 loaded = ~100,000 Vision calls. GCP free trial ($300) covers Solar/Maps/Places/Geocoding.

**IMPORTANT — `NEXT_PUBLIC_GOOGLE_MAPS_KEY` issue (unresolved):**  
Google Places autocomplete on Add Property modal NOT working on staging. Fix: Vercel → confirm key exists → Google Cloud Console → enable Places API → add `staging.proguild.ai/*` to HTTP referrers.

---

## 3. Key Files

| File | Purpose |
|---|---|
| `app/api/roofing/report/route.ts` | Main report pipeline POST handler |
| `app/api/roofing/reports/route.ts` | GET (re-signs URLs) + DELETE (R2 purge + DB) |
| `app/api/roofing/debug-sprint3/route.ts` | **TEMP debug route — DELETE after Sprint 3 verified** |
| `lib/roofing/reportPdf.ts` | PDF builder — React.createElement, NO JSX |
| `app/dashboard/roofing/property/[id]/page.tsx` | Property detail page — CTAs, report history |
| `app/dashboard/roofing/property/page.tsx` | Property list + Add Property modal |
| `components/layout/DashboardShell.tsx` | Nav icons |
| `lib/trade-config.ts` | Trade icon/label config |

---

## 4. Sprint 3 — Current State

### Gemini Vision Condition Assessment
- **Code: ✅ complete** — `getGeminiCondition()` in route.ts
- **Model chain:** `gemini-2.0-flash` → `gemini-1.5-flash-001` → `gemini-1.5-flash-latest`
- **Flow:** Solar dataLayers → rgbUrl → GeoTIFF (base64) → Gemini Vision → 2-3 sentence assessment
- **PDF:** Page 2 blue left-bordered box
- **Billing:** AI Studio prepay $10 loaded May 11 2026. Key: `GEMINI_API_KEY` in Vercel.
- **NOT YET TESTED END-TO-END** — billing propagation pending when session ended. Test first next session.

### Historic District Flag
- **Code: ✅ complete** — `checkHistoricDistrict()` in route.ts  
- **API:** NPS NRHP ArcGIS MapServer — `mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/1/query`
- **Method:** Point-in-polygon — returns districts whose boundary contains the coordinate
- **Fields:** `RESNAME, CITY, STATE, RESTYPE`
- **VERIFIED WORKING** via debug route: `2143 Riverside Ave Jacksonville FL` → `"Riverside Historic District"` ✅
- **PDF:** Amber badge on cover page when district found
- **NOT YET VERIFIED IN ACTUAL PDF** — test with a fresh report after Gemini billing propagates

### Debug Route (TEMP)
- `GET /api/roofing/debug-sprint3?lat=LAT&lng=LNG`
- Returns full intermediate output for both features
- **DELETE after Sprint 3 fully verified** — remove `app/api/roofing/debug-sprint3/` directory

---

## 5. Immediate Next Actions

**First: verify Gemini billing propagated**
1. Hit debug route: `https://staging.proguild.ai/api/roofing/debug-sprint3?lat=30.310988&lng=-81.683345`
2. Check `gemini.conditionText` — should be non-null string
3. Check `gemini.geminiApiStatus` — should be 200

**Second: end-to-end test**
1. `DELETE FROM solar_cache;` in Supabase SQL editor
2. Generate report → `2143 Riverside Ave, Jacksonville, FL` (has historic district)
3. Verify PDF page 2 has blue Gemini condition box
4. Verify PDF cover has amber "Historic District" badge
5. Generate report → `123 East Illinois Road, Lake Forest, IL 60045` (another historic test)
6. Generate report → `1234 Lipan St, Denver, CO 80204` (no historic district — badge should be absent)

**Third: delete debug route**
```bash
rm -rf app/api/roofing/debug-sprint3/
git add -A && git commit -m "chore: remove temp Sprint 3 debug route"
```

**Fourth: fix Google Places autocomplete (config, not code)**
- Verify `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in Vercel staging
- Enable Places API on that key in Google Cloud Console
- Add `staging.proguild.ai/*` to HTTP referrer allowlist

**Fifth: DSM + RANSAC (Sprint 3 remaining)**
- Python microservice for GeoTIFF DSM processing
- RANSAC plane fitting → ridge/hip/valley/rake/eave linear footage
- See HANDOVER_v83 section 9 for architecture plan

---

## 6. Report Pipeline — Current State

```
POST /api/roofing/report
1. Geocode address → lat/lng (Google Geocoding)
2. solar_cache lookup (sha256, 90-day TTL)
3. Solar API buildingInsights (if cache miss)
4. Parse measurements (pitch smoothing, flags)
5. PARALLEL:
   a. fetchTopView (satellite + bbox overlay)
   b. fetchZoomView x3 (z18/z20/z22)
   c. checkNoaaStorms (SWDI nx3hail) — BLOCKED, dataset frozen
   d. findNearestSupplier (Google Places)
   e. getGeminiCondition (dataLayers → GeoTIFF → Gemini 2.0-flash) ← Sprint 3
   f. checkHistoricDistrict (NPS NRHP ArcGIS MapServer point-in-polygon) ← Sprint 3
6. Fetch pro details from DB
7. Build reportId + date strings
8. Assemble ReportData
9. renderToBuffer PDF
10. Upload to R2
11. Save to roof_reports DB
12. Return signed URL + debug block
```

---

## 7. Commits This Session (newest first)

| Hash | Message |
|---|---|
| `656bb74` | fix: Gemini model order — 2.0-flash primary, correct 1.5 fallback names |
| `ed28975` | fix: remove Claude entirely — Gemini-only vision, no Anthropic dependency in prod |
| `d808845` | fix: NPS NRHP correct MapServer URL (mapservices.nps.gov layer 1 polygons) |
| `4d62f30` | fix: Claude vision + ArcGIS NPS NRHP point-in-polygon (intermediate — superseded) |
| `3ac769b` | fix: Gemini model fallback chain + Census 502 retry (intermediate — superseded) |
| `6774a56` | debug: temp Sprint 3 diagnostic route |
| `b8cddb3` | fix: gemini-2.0-flash model + Census TIGER historic (intermediate — superseded) |

---

## 8. Known Issues / Parked

- **NOAA hail badge** — SWDI nx3hail dataset frozen/deprecated. Code correct, park until NOAA restores.
- **Places autocomplete** — `NEXT_PUBLIC_GOOGLE_MAPS_KEY` config issue, not code.
- **DSM + RANSAC** — not started. Python microservice needed.

---

## 9. Pre-Launch Checklist (still pending)

- [ ] SQL migrations on PRODUCTION (v74, v76-*, v77, v78, v83, v84)
- [ ] Supabase Free → Pro ($25/mo) — pauses on inactivity
- [ ] `NEXT_PUBLIC_SITE_URL=https://proguild.ai` in Vercel prod
- [ ] All env vars to Vercel PRODUCTION (including GEMINI_API_KEY)
- [ ] `hello@proguild.ai` verify in Resend
- [ ] Cloudflare DNS orange-cloud
- [ ] Twilio 10DLC registration (1-2 weeks lead time)
- [ ] Submit sitemap to Google Search Console
- [ ] Fix `NEXT_PUBLIC_GOOGLE_MAPS_KEY` config for Places autocomplete
- [ ] Delete `app/api/roofing/debug-sprint3/` after Sprint 3 verified
- [ ] Set GCP billing alerts at $50/$100/$200 in Cloud Console
