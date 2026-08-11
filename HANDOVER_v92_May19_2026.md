# ProGuild.ai — Dev Handover v92
**Date:** May 19, 2026  
**Last commit:** `5067312` on `dev` + `staging`  
**Session branch:** `dev` → auto-deploys to `staging.proguild.ai`  
**Next session starts here.**

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Use `React.createElement` aliased as `h`. Never rename, never add JSX.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
3. **Git push — always separate commands, full token URL:**
   ```bash
   git config user.email "wasimakram@wasim.com"
   git config user.name "Wasim Akram"
   git add -A
   git commit -m "feat: description"
   git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://GH_TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **TypeScript check before every push:**
   ```bash
   npx tsc --noEmit 2>&1 | grep "error TS" | \
     grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly" | \
     grep -v "Cannot find module\|TS2503\|TS2591\|TS2345" | \
     grep -v "GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]\|trade-system.test\|TS2582\|TS2304"
   ```
5. **DO NOT BUILD until user says "go".**
6. **NO Claude/Anthropic API in prod** — Gemini only for vision.
7. **Business logic ALWAYS reads `plugin.stageAnchors.won` — NEVER hardcodes `'job_won'`.**
8. **Auth:** `sessionStorage('pg_pro')` — NOT localStorage. Dark mode only: `localStorage('pg_darkmode')`.

---

## 1. Project Stack

| Item | Value |
|---|---|
| Repo | github.com/valktech11/ProGuild |
| GH Token | GH_TOKEN_SEE_VERCEL_SECRETS (**exposed in chat — rotate before next session**) |
| Stack | Next.js 16.2.2 (Turbopack, App Router), Supabase, Vercel, Cloudflare R2 |
| Vercel project | `tradesnetwork` |
| Staging | staging.proguild.ai (password: proguild2026) |
| Production | proguild.ai → `main` branch (OUTDATED — 432+ commits behind staging) |
| Supabase staging | zttsqqvaakblgbutviai.supabase.co |
| R2 bucket | proguild-media-staging |
| Test account | wasimakram@wasim.com |
| Build time | ~35s. Ignored Build Step: `bash -c 'exit 1'` (always builds) |

---

## 2. THIS SESSION — What Was Built (All Commits)

### Architecture — Trade Plugin System (MAJOR)
**Commit:** `eecd566`

The old `lib/trade-config.ts` (350 lines) and `lib/trade-resolver.ts` (153 lines) are **permanently deleted**. Replaced by a complete trade plugin system.

**What was deleted:**
- `lib/trade-config.ts` — old trade config with shared boolean flags
- `lib/trade-resolver.ts` — `resolveTradeConfig()`, `hasFeature()`, `tradeTerm()`
- All `hasFeature()` calls replaced with type-guard checks
- All `resolveTradeConfig()` calls replaced with `getTradeConfig()`
- All hardcoded `['roofing-contractor','roofing','roofer'].includes()` arrays replaced with `isRoofing(trade)`

**New system files:**
```
lib/trades/
  _registry/
    index.ts     — getTradeConfig(), type guards, getAllTradeStageKeys(), getStageAnchors(), getTradeLabels()
    types.ts     — AnyTradeConfig, AnyTradeBase, AnyPipelineStage, AnyNavItem, AnyTradeLabels, AnyStageAnchors
  roofing/
    types.ts     — RoofingStage, RoofingFeatures, RoofingConfig, RoofingStageAnchors, RoofingLabels, RoofingLeadSource
    config.ts    — complete roofing config: stages + stageAnchors + nav (4 sections) + features + leadSources
    state-machine.ts
  hvac/          — updated: stageAnchors + invoice/clients labels added
  plumbing/
  electrician/
  general-contractor/
  _default/      — updated: stageAnchors + invoice/clients labels added
  solar/         — placeholder stubs ready for future
```

**Key new functions in `_registry/index.ts`:**
```typescript
getTradeConfig(slug)         // never throws, unknown → defaultConfig
isRoofing(c), isHVAC(c)...  // type guards — TypeScript narrows features after guard
getAllTradeStageKeys()        // derived from all registered trades — stage API uses this
getStageAnchors(slug)        // business logic reads anchors, never hardcodes 'job_won'
getTradeLabels(slug)         // replaces tradeTerm() — returns pipeline/estimate/client labels
getIsValidTransition(slug)   // returns correct validator for trade
```

**Stage anchors (roofing):**
```typescript
stageAnchors: {
  entry:           'lead_in',
  won:             'job_won',        // warranty trigger, review request
  lost:            'lost',
  depositTrigger:  'proposal_signed', // Stripe deposit fires here
  insuranceStage:  'insurance_approved',
  warrantyTrigger: 'job_won',
}
```

**Files migrated from old system:**
- `components/layout/DashboardShell.tsx` — `buildNav()` now reads `plugin.nav` directly
- `app/dashboard/pipeline/page.tsx`
- `app/dashboard/estimates/page.tsx`
- `app/dashboard/page.tsx` — `isHVACTrade` now at component scope
- `app/dashboard/clients/[id]/page.tsx`
- `components/ui/LeadPipeline.tsx` — `isRoofingTrade` removed, reads `stage.subLabel`/`stage.nextLabel` from config
- `app/api/leads/[id]/stage/route.ts` — `KNOWN_STATUSES` now derived from `getAllTradeStageKeys()`
- `app/dashboard/pipeline/[id]/page.tsx` — imports registry, uses `tradePlugin.stageAnchors.warrantyTrigger`

---

### Roofing Nav — Correct 4-Section Structure
**Commits:** `f2d2494`, `eecd566`

Roofing sidebar now shows exactly:
```
JOBS:          Overview, Jobs, Calendar, Messages
MONEY:         Proposals, Invoices, Revenue (soon)
ROOFING TOOLS: Properties, ProMeasure, Calculator, Quick Bid PDF (pro), Warranties (soon)
REPORTS:       Performance (pro), Storm Alerts (elite, soon)
```

`RoofingNavSection` title enum updated to include `'MONEY'`.

---

### Kanban Board — Complete Redesign (Multiple Iterations)
**Commits:** `9bdf71a` through `917fdd9`

Final state of `components/ui/LeadPipeline.tsx`:

| Feature | State |
|---|---|
| Card style | Pure tile — click to open. No CTA buttons. |
| Hover action | Phone icon fades in at bottom-right of card |
| Column width | 280px fixed, `flex-shrink: 0` |
| Scroll | `overflow-x: auto`, `scrollbar-width: none`, grab-drag with `cursor: grab` |
| Scroll indicator | Always-visible thin pill at bottom center, draggable to seek |
| Text selection | Prevented during drag: `document.body.userSelect = 'none'` |
| Card mousedown | `stopPropagation` — board drag cannot start from card |
| Card shadow | `0 1px 4px rgba(0,0,0,0.07)` resting, deeper on hover |
| Stale leads (≥7d) | Amber `1.5px solid #FCD34D` border + amber shadow |
| WARM badge | Amber `#FEF3C7/#92400E` (was green) |
| Column headers | Stage name `font-weight:700`, count bubble colored, meta line `12px/500` |
| KPI bar | 30px bold numbers, icons, top accent border, `< 1d` formatting |
| Empty columns | No text, no "+ Add Lead" footer — just clean empty state |

---

### Stage Colors — Final Palette
**Commit:** `a6982ee` (and several iterations before)

Source of truth: `lib/trades/roofing/config.ts` AND `lib/design.ts` (must stay in sync — future: derive automatically)

| Stage | Color | Hex | Rationale |
|---|---|---|---|
| Lead In | Steel Blue | `#0369A1` | Calm, new/incoming |
| Inspection Scheduled | Sky Blue | `#0284C7` | Outdoor visit, calendar |
| Proposal Sent | Amber | `#D97706` | Waiting — ball in homeowner's court |
| Proposal Signed | Emerald | `#059669` | Money committed |
| Insurance Approved | Cyan | `#0891B2` | Carrier said yes — positive |
| Scheduled | Blue | `#2563EB` | On the calendar |
| In Progress | Orange | `#EA580C` | Active physical work |
| Job Won | Dark Emerald | `#047857` | Universal success |

---

### Address / Client Sync System
**Commits:** `130ef2b`, `2a91453`, `5067312`

**Problem solved:** Leads had address data, but clients had no address fields. They were disconnected silos.

**Three fixes:**

**1. Add Lead Modal** (`components/roofing/AddLeadModal.tsx`):
- Replaced single `property_address` field with 4 structured fields: Street, City, State (US dropdown), Zip
- Google Places autocomplete on Street field — parses result into all 4 fields
- Modal widened to 640px, centered overlay (not bottom sheet)
- Source buttons: 4-column grid, compact vertical icon+label layout
- Form fits without scrolling

**2. API auto-link** (`app/api/leads/route.ts` POST):
- After inserting lead: match existing client by phone → email → create new
- Every lead with contact info automatically has `client_id` set
- No manual linking needed

**3. Lead detail** (`app/dashboard/pipeline/[id]/page.tsx`):
- Address cell shows `+ Save as Property` when `client_id` is null
- Address cell shows `View Property →` when `client_id` is set
- `client_id` added to `LeadExt` interface

**4. Add Client form** (`app/dashboard/clients/page.tsx`):
- Street / City / State (dropdown) / Zip added
- Address shown under name on client list card

---

### Warranty Modal Fix
**Commit:** `a5272cb`

`WarrantyRecord` was rendering inline in the page flow, appearing to "pop on top" weirdly. Now wrapped in `position:fixed inset-0 z-50` overlay with dark backdrop. Click outside to dismiss.

---

### Quick Bid PDF Nav Fix + Linear Footage Display
**Commit:** `bf27be3`

- Nav href was `/dashboard/roofing/report` (404) → fixed to `/dashboard/roofing/property`
- Property detail report row now shows linear footage breakdown when DSM has run:
  `Ridge 47ft  Hip 23ft  Valley 12ft  Rake 31ft  Eave 68ft  · 181ft total`
- If DSM not run: shows `· Tap Material Order for linear footage` hint

---

### Founders Bible v5.2
**File:** `ProGuild_Founders_Bible_v5_2.docx` (output)

Complete merged document combining v5.1 + all new architecture decisions. 19 sections. Single source of truth going forward.

---

## 3. Current State — Complete Architecture

### Trade Plugin System

```
lib/trades/_registry/index.ts    ← SINGLE ENTRY POINT for all dashboard code
lib/trades/_registry/types.ts    ← AnyTradeConfig union, shared interfaces only
lib/trades/roofing/types.ts      ← isolated — zero imports from other trades
lib/trades/roofing/config.ts     ← stages, nav, labels, stageAnchors, features, leadSources
lib/trades/roofing/state-machine.ts
lib/trades/hvac/                 ← same pattern
lib/trades/_default/             ← fallback for misc trades
lib/trades/solar/                ← future stub (types/config/state-machine placeholders)
```

**The rule:** Dashboard code imports from `_registry/index.ts` only. Never from individual trade folders.

**Adding a new trade:**
1. Create `lib/trades/solar/` with `types.ts`, `config.ts`, `state-machine.ts`
2. Add to `REGISTRY` in `_registry/index.ts` (1-2 lines)
3. Add `isSolar()` type guard (1 line)
4. Add to `AnyTradeConfig` union (1 line)
5. **Zero changes to dashboard, pipeline, shell, estimates, invoices, or any existing trade**

### Key Files Changed This Session

| File | What changed |
|---|---|
| `lib/trades/_registry/index.ts` | Complete rewrite — added stageAnchors, getAllTradeStageKeys, getTradeLabels |
| `lib/trades/_registry/types.ts` | Added AnyTradeBase, AnyStageAnchors, AnyTradeLabels |
| `lib/trades/roofing/config.ts` | Added stageAnchors, subLabel/nextLabel per stage, leadSources, 4-section nav |
| `lib/trades/roofing/types.ts` | Added RoofingStageAnchors, RoofingLeadSource, updated labels |
| `lib/trade-config.ts` | **DELETED** |
| `lib/trade-resolver.ts` | **DELETED** |
| `components/layout/DashboardShell.tsx` | buildNav() reads plugin.nav directly |
| `components/ui/LeadPipeline.tsx` | Full kanban redesign — tile cards, grab scroll, pill |
| `app/dashboard/pipeline/[id]/page.tsx` | Registry imports, stageAnchors, Save as Property |
| `app/dashboard/page.tsx` | isHVACTrade at component scope, uses isHVAC() type guard |
| `app/api/leads/route.ts` | address fields saved, auto-link to client |
| `app/api/leads/[id]/stage/route.ts` | KNOWN_STATUSES derived from getAllTradeStageKeys() |
| `app/dashboard/clients/page.tsx` | Address fields in form, address on card |
| `components/roofing/AddLeadModal.tsx` | Structured address fields, autocomplete parsing |
| `lib/trades/roofing/config.ts` | Nav 4-section structure, colors, stageAnchors |

---

## 4. Database — Migration Status

| Migration | Staging | Production |
|---|---|---|
| v93-master-migration.sql (combines v91+v92+property_address fix) | ✅ Run | ❌ NOT RUN |
| v91 (identity, event sourcing, community, API layer) | ✅ Run | ❌ NOT RUN |
| v80-hvac-equipment.sql | ✅ Run | ❌ NOT RUN |

**Before prod launch:** Run all three in order. Verify `SELECT count(*) FROM fl_tax_rates;` = 20 rows.

**⚠️  Supabase Free → Pro** — still not done. Free tier pauses after 7 days inactivity. 134k records at risk. Do this now.

---

## 5. Roofing CRM — What's Left to Build

### P1 — Fix broken pipeline flow (30 min each)
- [ ] **Auto-stage on estimate events** — `app/api/estimates/[id]/route.ts`: estimate sent → `proposal_sent`, estimate approved → `proposal_signed`, invoice paid → `job_won`. Three one-line additions. Uses `stageAnchors` — already clean architecture.

### P2 — Close the estimate loop (1.5 days)
- [ ] **Canvas e-sign on public estimate** (`app/estimate/[id]/page.tsx`) — HTML5 canvas signature field, touch-friendly. On submit: PNG → R2, record in `signatures` table, regenerate PDF with signature appended. Replaces Leap $99/mo.
- [ ] **Signed PDF** — After signature captured, rebuild estimate PDF with signature image on final page.

### P3 — Close the money loop (1 day)
- [ ] **Stripe payment link on invoice** (`app/invoices/[id]/page.tsx`) — "Pay online" button → Stripe Checkout. On success: webhook → mark invoice paid → cascade to Job Won.
- [ ] **Deposit at estimate approval** — Stripe charge for deposit amount when homeowner approves.

### P4 — Roofing-specific estimates (3 days)
- [ ] **Good/Better/Best wired into estimate builder** — `GoodBetterBest.tsx` component exists in `components/estimate/` but never wired into estimate builder. Needs an "Options" tab.
- [ ] **Roofing estimate header** — Address, squares, pitch, satellite photo thumbnail at top of estimate. Pull from `roof_reports` if exists for this property.
- [ ] **Scope of work text block** — Prose textarea above line items. Shows as paragraph in PDF.
- [ ] **Payment schedule** — Replace simple deposit toggle with 30/40/30 / 50-50 / Full upfront presets. Shows as milestone table in estimate PDF and invoice.

### P5 — Agentic features (per trade)
- [ ] **Morning digest** — 8am email/SMS: "3 things need attention today." Cron job + Resend/Twilio. Blocks on Twilio 10DLC.
- [ ] **One-tap follow-up SMS** — Template per stage on lead detail. Single button. Blocks on Twilio 10DLC.
- [ ] **Auto review request** — 3 days after Job Won, Resend email to homeowner with Google review link.
- [ ] **Stale lead re-engagement** — 14-day no-movement → auto re-engagement text.

### P6 — Operational completeness
- [ ] **Fix DSM hip/valley = 0ft** — `classifyEdge()` in `lib/roofing/dsmAnalysis.ts`. Threshold logic wrong for shallow hip angles.
- [ ] **Insights panel — real ProMeasure data** — Replace static "28-34 squares" placeholder with actual measurement from `roof_reports` for this property.
- [ ] **SOURCE_OPTIONS in pipeline/[id]/page.tsx** — Still hardcoded array. Should read from `plugin.leadSources`.
- [ ] **STAGE_ORDER in pipeline/[id]/page.tsx** — Still hardcoded. Should derive from `getActiveStages(tradeSlug).map((s,i) => [s.key, i])`.
- [ ] **`lib/design.ts` STAGE_BASE** — Stage colors hardcoded separately from `roofing/config.ts`. Must be kept in sync manually until derived automatically. Future: replace `stageStyle(status, tradeSlug)` to read from registry.
- [ ] **Move `lib/roofing/` → `lib/trades/roofing/business-logic/`** — Cosmetic cleanup. `dsmAnalysis.ts`, `reportPdf.ts`, etc. currently outside trade module.
- [ ] **Move `components/roofing/` → `lib/trades/roofing/components/`** — Cosmetic cleanup. Trade-specific UI should live in trade folder.

### P7 — Phase 6 (post-launch)
- [ ] Lien waivers (4 FL types)
- [ ] FL roofing contract template
- [ ] Permit tracking UI (nav stub exists, page not built)
- [ ] Good/Better/Best: Add roofing line item presets from calculator measurements

---

## 6. Known Bugs / Loose Ends

| Issue | File | Notes |
|---|---|---|
| DSM hip/valley = 0ft | `lib/roofing/dsmAnalysis.ts` `classifyEdge()` | Ridge shows ~981ft (should be ~30ft), hip/valley both 0. Threshold logic wrong. |
| `lib/design.ts` STAGE_BASE out of sync | `lib/design.ts` | Must manually keep in sync with `roofing/config.ts`. Detail page pills/dropdown use `stageStyle()` from `design.ts` not from config. |
| SOURCE_OPTIONS hardcoded in pipeline/[id] | `pipeline/[id]/page.tsx` line ~22 | Should read from `getTradeConfig(slug).leadSources` |
| STAGE_ORDER hardcoded in LeadPipeline | `components/ui/LeadPipeline.tsx` | Should derive from `getActiveStages()` |
| GH token exposed | Chat history | `GH_TOKEN_SEE_VERCEL_SECRETS` — rotate at github.com/settings/tokens |
| `lib/roofing/` outside trade module | `lib/roofing/` | Business logic should be in `lib/trades/roofing/business-logic/` |
| `components/roofing/` outside trade module | `components/roofing/` | UI components should be in `lib/trades/roofing/components/` |
| NOAA hail badge blocked | `app/api/roofing/report/route.ts` | Dataset deprecated. Returns empty. Parked indefinitely. |
| Supabase Free tier | Supabase dashboard | Still on free tier — will pause after 7 days inactivity. Upgrade now. |

---

## 7. ProMeasure → Calculator Flow (Verified Working)

```
ProMeasure → draws polygon → writes pg_promeasure to sessionStorage
  → router.push('/dashboard/roofing/calculator?from=promeasure')
  → Calculator reads pg_promeasure → pre-fills squares/pitch/waste
  → calculateMaterials() → shingles/underlayment/ridge cap/starter strip
  → "Create Estimate" button → POST /api/estimates

Properties page → Generate Report → POST /api/roofing/report (Quick Bid PDF)
  → Material Order button → POST /api/roofing/dsm (DSM+RANSAC ~60s)
  → POST /api/roofing/premium-report (Material Order PDF ~10s)
  → linear_footage stored in roof_reports.linear_footage JSONB
  → NOW DISPLAYED in report row: Ridge Xft  Hip Xft  Valley Xft  Rake Xft  Eave Xft
```

**Critical:** `lib/roofing/reportPdf.ts` MUST stay `.ts`. `export const runtime = 'nodejs'` on all roofing API routes.

---

## 8. Next Session — Recommended Start Order

1. **Rotate GH token** — `GH_TOKEN_SEE_VERCEL_SECRETS` is exposed. Get new token before first push.
2. **Upgrade Supabase Free → Pro** ($25/mo) — 134k records at risk of pause.
3. **Fix SOURCE_OPTIONS + STAGE_ORDER** (2 small items, 30 min) — removes last hardcoded values from the shell
4. **P1: Auto-stage on estimate events** (30 min) — highest ROI, unblocks the full CRM flow
5. **P2: Canvas e-sign on public estimate** (1.5 days) — eliminates Leap $99/mo dependency
6. **P3: Stripe payment link on invoice** (1 day) — closes the money loop

---

## 9. Env Vars (Vercel Staging)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase staging URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Server API routes |
| `GOOGLE_SOLAR_API_KEY` | Solar API + Maps Static + Geocoding (server-side, no referrer restriction) |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Browser Maps JS + Places autocomplete (HTTP referrer restricted) |
| `GEMINI_API_KEY` | Gemini 2.0-flash Vision — AI Studio prepay ($10 loaded May 11) |
| `R2_ACCOUNT_ID` | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `R2_BUCKET_NAME` | `proguild-media-staging` |
| `RESEND_API_KEY` | Email — hello@proguild.ai must be verified |
| `STRIPE_SECRET_KEY` | Test mode |
| `NEXT_PUBLIC_SITE_URL` | `https://staging.proguild.ai` |

---

## 10. Test Accounts

| Email | Trade | Purpose |
|---|---|---|
| wasimakram@wasim.com | HVAC Technician | Primary dev/test |
| test@proguild.ai | General | E2E fixture data only |
| Sam Altman account | Roofing Contractor | Used for staging QA this session (Jacksonville FL) |

---

*ProGuild.ai — Handover v92 — May 19, 2026 — Confidential*
