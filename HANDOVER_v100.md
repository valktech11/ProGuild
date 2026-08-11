# ProGuild.ai — Dev Handover v100
**Date:** May 22, 2026
**Latest commit:** `ebaaded` on `dev` + `d65e98c` on `staging`
**Branch flow:** dev → staging (auto-deploy on Vercel push) → main (manual, production)
**Staging URL:** staging.proguild.ai (password: proguild2026)
**Test accounts:** samaltman@sam.com (roofer), wasimakram@wasim.com (hvac)
**Repo:** github.com/valktech11/ProGuild
**Stack:** Next.js 16.2.2 (Turbopack), Supabase, Vercel, Cloudflare R2, TypeScript strict

---

## 0. ARCHITECTURE CONSTRAINTS — READ BEFORE TOUCHING ANY FILE

These are non-negotiable. Every build session must internalize these before writing a single line.

### 0.1 CRM Pages Are 100% Trade-Independent
**Pipeline, Estimates, Invoices, Calendar, Clients** — same pages, same URLs for ALL trades.
- NEVER add `if (isRoofing)` or trade conditionals to these shell pages
- Trade-specific content goes in `lib/trades/{trade}/components/` ONLY
- Shell pages call `plugin.components.X` — never import trade components directly
- The estimate builder shell (`app/dashboard/estimates/[id]/page.tsx`) routes to `RoofingEstimatePage` via `plugin.components.EstimatePage` — this is the correct pattern
- If you find yourself writing `isRoofing()` in a shell page, STOP — put it in the trade component instead

### 0.2 Overview Dashboard — ONE Page, ONE URL
**`/dashboard` is the only overview URL for ALL trades. No redirects. No separate pages per trade.**
- `app/dashboard/page.tsx` is the one overview page for all trades
- Trade-specific sections render via `plugin.components.OverviewWidget` slot
- `lib/trades/roofing/components/OverviewWidget.tsx` — roofing-specific (Today's Schedule, Revenue Forecast)
- `lib/trades/_default/components/OverviewWidget.tsx` — returns null (generic trades use current layout)
- `OverviewWidget` slot is already planned in `lib/trades/_registry/types.ts` (line 61, currently commented out)
- NEVER create `app/dashboard/overview/roofing/page.tsx` or any per-trade overview URL
- Adding a new trade overview = create one `OverviewWidget.tsx` + wire in trade config. Zero changes to `app/dashboard/page.tsx`.

### 0.3 Trade Plugin Pattern — The Only Way to Add Trade Features
```
lib/trades/_registry/index.ts     ← ONLY file that imports from trade folders
lib/trades/_registry/types.ts     ← ONLY shared type file
lib/trades/roofing/               ← self-contained, evolves independently
lib/trades/hvac/                  ← self-contained, evolves independently
lib/trades/_default/              ← fallback for all other trades
```
- Dashboard code imports FROM `_registry` only, never from individual trade folders
- Type guards (`isRoofing()`, `isHVAC()`) used for feature access — never slug string comparisons
- Adding a new trade: create folder + add to REGISTRY + add type guard. Zero changes to any shell page.
- `AnyTradeComponents` interface defines all plugin slots: `AddLeadModal`, `OverviewWidget` (to be activated), others planned

### 0.4 PATCH /api/leads/[id] — Dual-Path Write Architecture
The PATCH handler has TWO independent write paths:
1. Lead fields (`updateFields`) → `leads` table
2. Roofing fields (`roofingPayload`) → `roofing_job_data` table

**The empty guard checks BOTH together** — returns 400 only if BOTH are empty.
- NEVER place the empty check before building `roofingPayload`
- NEVER gate on `updateFields` alone — roofing measurement saves have no lead fields
- This was a critical bug that caused ProMeasure measurements to silently fail

### 0.5 Measurement Save Chain — All Three Paths Must Include `pro_id`
All PATCH calls to `/api/leads/[id]` MUST include `pro_id` in the body:
- ProMeasure `pushToCalc()` → includes `pro_id: session.id` ✅ (fixed May 22)
- Property detail "Apply to Lead" → includes `pro_id: session.id` ✅ (fixed May 22)
- Pipeline detail `saveEdit()` → uses `patch()` helper which auto-adds `pro_id` ✅

### 0.6 DB Extension Table Pattern — leads Table is Sacred
- `leads` table: universal CRM columns ONLY. Never add trade-specific columns.
- Trade data → extension tables: `roofing_job_data`, `hvac_job_data`, etc. (linked by `lead_id` FK)
- `contact_zip` was added to `leads` table via hotfix May 22 2026 — must be run on prod before Wave 1
- `roofing_estimate_data`: 1:1 with estimates. When returning existing estimate from POST /api/estimates, MUST sync this table with latest lead measurements + address.
- Always strip `, USA` suffix from `property_address` before writing to any table.

### 0.7 Critical File Rules — Never Break
1. `lib/roofing/reportPdf.ts` and `premiumReportPdf.ts` MUST stay `.ts` not `.tsx` — SWC breaks react-pdf
2. All roofing API routes: `export const runtime = 'nodejs'`
3. Auth: `sessionStorage('pg_pro')` — NOT localStorage. Dark mode only uses localStorage('pg_darkmode')
4. `useSearchParams` always wrapped in `Suspense` in Next.js App Router
5. NO Claude/Anthropic API in prod — Gemini only for vision
6. Git push: always full token URL, always separate commands (never &&)
7. Business logic reads `plugin.stageAnchors.won` — NEVER hardcodes `'job_won'`
8. DO NOT BUILD until user says "go"

---

## 1. Current Build State — May 22 2026

### 1.1 What Was Fixed This Session (May 22)

**ProMeasure flow — measurements now actually save:**
- Root cause: `pro_id` missing from ProMeasure PATCH body → 401 silently swallowed
- Root cause 2: PATCH handler empty check fired before `roofingPayload` built → 400 on measurement-only saves
- Both fixed. Measurements now write to `roofing_job_data` correctly.

**Pipeline detail re-fetch after ProMeasure:**
- Returns to pipeline with `?from=promeasure&applied=1` → re-fetches lead → measurement pills populate
- Toast fires once then `router.replace()` strips params → no repeat toasts

**Quick Bid Report button:**
- Now finds-or-creates property inline in button click handler
- Navigates directly to `/dashboard/roofing/property/{id}?lead_id={leadId}`
- Never touches property list page

**Address autocomplete on lead edit form:**
- Google Places autocomplete on property address field
- Selects populate city, state, zip simultaneously

**`contact_zip` field:**
- Added to `leads` table via SQL: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_zip text`
- Added to `POST /api/leads` destructure + insert
- Added to `PATCH /api/leads/[id]` STRING_FIELDS + LeadUpdateFields interface
- Added to roofing `AddLeadModal` POST body
- **MUST run migration on production before Wave 1**

**Estimate data sync:**
- `POST /api/estimates` when returning existing estimate now syncs `roofing_estimate_data` with latest lead measurements + address
- `, USA` suffix stripped from property_address in all estimate write paths

**Toast positioning:**
- Pipeline page toasts now rendered via `createPortal(document.body)` — escapes transform stacking context

### 1.2 What Was Built This Session (May 22)

**Calculator improvements:**
- Linear footage inputs (Ridge LF, Eave LF, Perimeter LF) — appear when squares > 0
- All 7 materials calculate reactively
- Editable unit prices inline
- ⚠ indicators for items needing LF input
- "Create Estimate" CTA sends only items with qty > 0

**ProMeasure flow fix:**
- `mapTypeId: 'hybrid'` (satellite + labels) instead of bare satellite
- Auto-geocodes `initAddress` on map ready when no saved center
- Button label changes: "Apply to Lead →" when `leadId` present, "Push to Calculator" standalone

---

## 2. Complete Workflow — What's Wired (from v99, still valid)

See HANDOVER_v99.md section 2 for full workflow diagram. All flows verified on staging as of May 22.

---

## 3. Key File Paths

```
Trade registry:
  lib/trades/_registry/index.ts          ← getTradeConfig(), type guards, getAllTradeStageKeys()
  lib/trades/_registry/types.ts          ← AnyTradeBase, AnyTradeComponents (OverviewWidget slot commented out — activate for overview build)

Roofing components:
  lib/trades/roofing/components/AddLeadModal.tsx
  lib/trades/roofing/components/EstimatePage.tsx
  lib/trades/roofing/components/EstimatePublicPage.tsx
  lib/trades/roofing/components/InsuranceClaimFields.tsx
  lib/trades/roofing/components/JobPhotoLog.tsx
  lib/trades/roofing/components/WarrantyRecord.tsx
  lib/trades/roofing/components/OverviewWidget.tsx   ← TO BE BUILT (Today's Schedule + Revenue Forecast)

Overview (current — used as _default for misc trades):
  app/dashboard/page.tsx                 ← 782 lines, current overview for ALL trades
                                            Will add OverviewWidget slot + remove Community
                                            Will improve Greeting + add $ to Pipeline strip

Shell pages:
  app/dashboard/estimates/[id]/page.tsx  ← routes to trade EstimatePage via plugin.components
  app/dashboard/pipeline/[id]/page.tsx   ← evalGate, measurement tools, stage gates
  app/dashboard/invoices/[id]/page.tsx   ← routes to trade InvoicePage (NOT YET BUILT)

Roofing tools:
  app/dashboard/roofing/promeasure/page.tsx
  app/dashboard/roofing/property/[id]/page.tsx
  app/dashboard/roofing/calculator/page.tsx

API routes:
  app/api/leads/[id]/route.ts            ← dual-path write (leads + roofing_job_data)
  app/api/estimates/route.ts             ← POST + existing estimate sync
  app/api/estimates/[id]/route.ts        ← GET joins all extension tables
  app/api/invoices/route.ts
  app/api/invoices/[id]/route.ts
```

---

## 4. What Is NOT Built Yet

### 4.1 Overview Dashboard Improvements (Next UI task)
**Approach:** Modify `app/dashboard/page.tsx` in-place. No new pages. No redirects.

Changes needed to `app/dashboard/page.tsx`:
1. Activate `plugin.components.OverviewWidget` slot in `lib/trades/_registry/types.ts`
2. Smart greeting sub-line: "X homeowners waiting. Y estimates expire today. $Z at risk."
3. Pipeline strip: add dollar amounts per stage
4. Remove Community Insights section entirely
5. Add `<plugin.components.OverviewWidget>` where Community was
6. Fix: remove stale `TradeSidebar` + `TradeWidget` imports (dead code)

New files to create:
- `lib/trades/roofing/components/OverviewWidget.tsx` — Today's Schedule + Revenue Forecast
- `lib/trades/_default/components/OverviewWidget.tsx` — returns null

Wire in configs:
- `lib/trades/roofing/config.ts` — add OverviewWidget to components
- `lib/trades/_default/config.ts` — add OverviewWidget to components

### 4.2 Invoice UI (Highest revenue impact after overview)
`lib/trades/roofing/components/InvoicePage.tsx` — does not exist.
DB fully ready. API routes wired. See v99 section 4.1 for full spec.

### 4.3 GBB Template Save Button
### 4.4 Material Prices Settings Page

---

## 5. Pending Infrastructure (Owner Actions Required)

| Action | Priority | Detail |
|---|---|---|
| **Run `contact_zip` migration on PRODUCTION** | 🔴 URGENT | `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_zip text;` |
| Supabase Free → Pro ($25/mo) | 🔴 URGENT | 134k records. Pauses after 7 days inactivity. |
| Twilio 10DLC registration | 🔴 URGENT | 1-2 week govt approval. Blocks all SMS. |
| US LLC registration | 🔴 URGENT | Blocks Stripe payouts + Wave 1. |
| Rotate GitHub token | 🔴 URGENT | ghp_n1w6x... was exposed. Rotate in GitHub settings now. |
| Merge staging → main | 🟡 | 400+ commits behind. After all 5 gates pass. |
| hello@proguild.ai in Resend | 🟡 | All estimate emails use this sender. |

---

## 6. Start Here Next Session

**Read Section 0 (Architecture Constraints) FIRST. Then confirm understanding before building.**

Next task: **Overview Dashboard improvements** (Section 4.1 above).

Build order:
1. Activate `OverviewWidget` slot in `lib/trades/_registry/types.ts`
2. Create `lib/trades/_default/components/OverviewWidget.tsx` (returns null)
3. Create `lib/trades/roofing/components/OverviewWidget.tsx` (Today's Schedule + Revenue Forecast)
4. Wire both into their trade configs
5. Modify `app/dashboard/page.tsx`:
   - Smart greeting sub-line
   - $ amounts on Pipeline strip
   - Remove Community section
   - Add `<OverviewWidget>` slot
   - Remove dead TradeSidebar/TradeWidget imports
