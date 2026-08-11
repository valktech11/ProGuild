# HANDOVER — May 17 2026 — DB Architecture + Sprint B Session

## Session Summary
This was a major architecture and DB design session. No new app features were shipped to production. Three SQL migrations were written, committed, and run on staging. The complete 134-table schema is now live on staging.

## Branch State

| Branch | What it has | Status |
|---|---|---|
| dev | Sprint B code + v90/v91/v92 SQL files | Active dev branch |
| staging | Same as dev | Deployed to staging.proguild.ai |
| main | Old bare-bones product | OUTDATED — 437 commits behind staging |
| sprint-b-trade-system | Trade isolation (already merged into dev) | Can be deleted |

## SQL Migrations — Staging Status

| File | Staging | Production |
|---|---|---|
| v90-master-schema.sql | ✅ RAN — all checks passed | ⏳ NOT RUN |
| v91-definitive-schema.sql | ✅ RAN — all checks passed | ⏳ NOT RUN |
| v92-domain-tables.sql | ✅ RAN — all checks passed | ⏳ NOT RUN |

**FIRST THING NEXT SESSION: Run v90 → v91 → v92 on PRODUCTION Supabase (bzfauzqqxwtqqskjhrgq)**

## What Was Built This Session

### Sprint B Code (already on dev + staging)
- `app/api/leads/[id]/stage/route.ts` — PATCH with isValidTransition() guard, 422 on invalid, queues to lead_trigger_log
- `app/api/leads/[id]/photos/route.ts` — GET list, POST upload to R2
- `app/dashboard/roofing/calculator/page.tsx` — reads sessionStorage from report, material formula, pushes to estimates
- `components/roofing/InsuranceClaimFields.tsx` — 9 field toggle, roofing only
- `components/roofing/JobPhotoLog.tsx` — upload phases, grid, ZIP for adjuster
- `components/estimate/GoodBetterBest.tsx` — 3-column tiered proposal (uses tiered_data not tiers)
- `components/roofing/WarrantyRecord.tsx` — triggered on Job Won

### SQL Migrations (on dev + staging)
- v90-master-schema.sql — 20 new tables, trade job data, audit triggers, RLS fixes, composite indexes
- v91-definitive-schema.sql — 58 new tables, identity layer, community redesign, event sourcing, API layer
- v92-domain-tables.sql — 40 new tables, all 10 product domains

### Documentation
- ProGuild_DB_Architecture_v1.docx — complete 9-section document, 1,200 paragraphs
- ProGuild_Founders_Bible_v5.1.docx — updated bible with git workflow merged in (Section 19)

## Complete Schema Summary — 134 Tables

### 3 Tables Need Attention (Deprecated)
- `post_likes` → superseded by `post_reactions` (v91). Old table still exists for backward compat.
- `messages` → superseded by `conversations` + `conversation_members` + `conversation_messages` (v91)
- `lead_trigger_log` → superseded by `job_queue` (v91). Old table still exists.

### Key Architecture Decisions Made
1. Trade job data in separate tables (roofing_job_data etc.) NOT columns on leads
2. Event sourcing via pipeline_events — immutable append-only timeline
3. GoodBetterBest uses estimates.tiered_data column (NOT estimates.tiers — that duplicate was dropped)
4. No secret Q&A — NIST deprecated it, we use cryptographic reset tokens
5. Google + Apple OAuth — Google for conversion rate, Apple required for App Store
6. RLS enabled on all 134 tables (was disabled on 14 critical tables before v91)
7. 6 audit triggers on leads, estimates, invoices, estimate_items, roofing_job_data, signatures

## Sprint B — What's Still Needed (Code, Not DB)

The DB is ready. Code needed:

### Missing API Routes
- `PATCH /api/leads/[id]` — needs insurance claim fields added to whitelist (currently silently ignores them)
- `DELETE /api/leads/[id]/photos/[photoId]` — delete single photo from R2 + DB
- `GET /api/leads/[id]/photos/zip` — stream ZIP of all photos for adjuster
- `POST /api/roofing/warranties` — INSERT to roofing_warranties table
- `PUT /api/estimates/[id]/tiers` → CORRECTED to `PATCH /api/estimates/[id]` with tiered_data key

### Wire Components into Existing Pages
All wiring instructions are in SPRINT_B_README.md in the repo root.

1. InsuranceClaimFields → `app/dashboard/pipeline/[id]/page.tsx` with isRoofing() guard
2. JobPhotoLog → same page after InsuranceClaimFields
3. GoodBetterBest → `app/dashboard/estimates/[id]/page.tsx` with isRoofing() guard
4. WarrantyRecord → modal on job_won stage change if isRoofing()
5. Calculator → report generation pushes pg_report_data to sessionStorage then routes to /dashboard/roofing/calculator

## Supabase Credentials

- Staging project ID: zttsqqvaakblgbutviai
- Production project ID: bzfauzqqxwtqqskjhrgq
- Staging URL: https://zttsqqvaakblgbutviai.supabase.co
- Test account: wasimakram@wasim.com (ID: 7e883161-f9af-4de8-8bc6-71933033100f)

## Environment Variables (Vercel)

All must be set on PRODUCTION before go-live:
- NEXT_PUBLIC_SITE_URL = https://proguild.ai
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- GEMINI_API_KEY (AI Studio — separate billing from GCP)
- GOOGLE_SOLAR_API_KEY (GCP — separate from GEMINI_API_KEY)
- NEXT_PUBLIC_GOOGLE_MAPS_KEY
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_ELITE
- R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME=proguild-media
- R2_PUBLIC_BUCKET_URL

## GitHub

- Repo: github.com/valktech11/ProGuild
- Token: YOUR_GITHUB_TOKEN — ROTATE THIS. Exposed in conversation.
- Push to dev: `git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:dev`
- Push to staging: `git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:staging`

## Next Session Priority Order

1. Run v90 → v91 → v92 on PRODUCTION Supabase
2. Verify all checks pass on production
3. Rotate GitHub token
4. Wire Sprint B components into pipeline and estimate pages
5. Build missing API routes (photos delete, ZIP, warranties, insurance patch)
6. QA all Sprint B features at 360px mobile
7. HVAC QA pass (Gate 3)

## Documents Produced This Session
- `/mnt/user-data/outputs/ProGuild_DB_Architecture_v1.docx` — DB design document
- `/mnt/user-data/outputs/ProGuild_Founders_Bible_v5.1.docx` — updated bible
- `/mnt/user-data/outputs/ProGuild_SprintB_Build.zip` — Sprint B code package

## Start Next Session With
Share: ProGuild_Founders_Bible_v5.1.docx + this handover file
Say: "Read both documents. Run v90/v91/v92 on production first. Then continue Sprint B wiring from Step 4."
