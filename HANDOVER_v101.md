# ProGuild.ai — Dev Handover v101
**Date:** May 23, 2026
**Latest commit:** `06b9739` on `dev` + `staging`
**Branch flow:** dev → staging (auto-deploy on Vercel push) → main (manual, production)
**Staging URL:** staging.proguild.ai (password: proguild2026)
**Test accounts:** samaltman@sam.com (roofer), wasimakram@wasim.com (hvac)
**Repo:** github.com/valktech11/ProGuild
**Stack:** Next.js 16.2.2 (Turbopack), Supabase, Vercel, Cloudflare R2, TypeScript strict

---

## 0. CRITICAL RULES — READ FIRST

1. **`lib/roofing/reportPdf.ts` and `lib/roofing/premiumReportPdf.ts` MUST stay `.ts` not `.tsx`** — SWC JSX transform breaks react-pdf's `renderToBuffer`. Never rename, never add JSX syntax.
2. **All roofing API routes need `export const runtime = 'nodejs'`** — PDF generation requires Node.js runtime.
3. **Git push — always separate commands:**
   ```
   git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:dev
   git push https://TOKEN@github.com/valktech11/ProGuild.git HEAD:staging
   ```
4. **DO NOT BUILD until user says "go".**
5. **NO Claude/Anthropic API in prod** — Gemini only for vision.
6. **TS check before every commit:**
   ```
   npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7006\|TS2307\|TS2875\|..."
   ```
7. **ROTATE GITHUB TOKEN** — token was exposed in chat and in this doc. ROTATE IN GITHUB SETTINGS NOW before reading further. Settings → Developer settings → Personal access tokens.
8. **`useSearchParams` always wrapped in `Suspense`** in Next.js App Router.
9. **PATCH handlers — never spread full estimate object.** Only send fields explicitly needed. Spreading joins (pro, lead, roofing) causes Supabase to null-out existing columns.
10. **Estimates GET uses parallel queries, NOT joins.** Join failures silently return null; parallel queries degrade gracefully.
11. **`fullBleed={true}` required on DashboardShell for estimate page** — without it, `pg-main overflow-y-auto` breaks `position: sticky` on the estimate header.
12. **Build script:** `rm -rf .next && next build` — the `rm -rf .next` is intentional to bust Vercel's cached build artifacts that caused `modifyConfig` crashes.

---

## 1. What Was Built This Session (May 23, 2026)

### 1.1 Overview Dashboard Redesign

**Decision: ONE page at `/dashboard` for ALL trades. No per-trade redirects.**

- `app/dashboard/page.tsx` — full overview page, renders `plugin.components.OverviewWidget` slot
- `lib/trades/roofing/components/OverviewWidget.tsx` — Today's Schedule + Revenue Forecast
- `lib/trades/_default/components/OverviewWidget.tsx` — returns null

**Action Center — 5 urgency-only cards (none duplicate pipeline stage counts):**
1. Uncontacted Leads — entry stage, no contact in 24+ hours
2. Expiring Soon — sent/viewed estimates with valid_until ≤3 days
3. Awaiting Signature — proposals sent/viewed 48+ hrs, not signed
4. Jobs Today — leads with scheduled_date = today
5. Draft Proposals — estimates at draft status

**Removed from overview:** Pipeline/Jobs funnel (redundant with Action Center + Revenue Forecast), Community Insights.

**RULE: Action Center cards must NEVER show the same data as pipeline stage counts.**

### 1.2 Lead Detail Page Visual Polish

- Stage-color accent bar at top of hero card (uses `stgObj.color`)
- Roof size insight card: only shows when `square_count` exists in `roofing_job_data` — shows real value + pitch
- Photos tab count fetched eagerly on lead load (not on tab click)
- Measurement Tools section: teal-tinted card, larger pills, ProMeasure = filled teal, Quick Bid = teal outline
- Info grid cells: more padding (18px), larger icons (36px)
- Stage picker dropdown: hero card uses `position: relative` (NOT `overflow: hidden`) to avoid clipping the dropdown

### 1.3 Complete Lead-to-Payment Flow

**sign/route.ts — after homeowner signs estimate:**
- Auto-moves lead to `proposal_signed`
- Auto-creates draft invoice from approved estimate (with milestones, deposit %, terms)
- Sends invoice email to homeowner (non-blocking, server-side)

**mark-paid/route.ts — after invoice paid:**
- Sets `lead_status = 'job_won'` (was wrongly set to `'Paid'` string before)
- Queues review request in `review_requests` table (fires when Twilio 10DLC active)
- Uses try/catch for DB ops — never `.catch()` on PostgrestBuilder

**Material Prices Settings page:**
- `app/dashboard/roofing/settings/page.tsx` — 12 price inputs across 5 groups
- Saves to `pros.roofing_material_prices` JSONB
- Live preview: "20 sq roof costs $X / $Y / $Z across Standard/Upgraded/Premium"
- `EstimatePage.tsx` reads pro's prices on load via `materialPrices` prop
- `buildDefaultTiers(materialPrices)` replaces hardcoded DEFAULT_TIERS
- Nav link: "Material Prices" added to ROOFING TOOLS section

**Mock Stripe payment on public invoice:**
- `PayButton` component on `/invoice/[id]` — shows "Pay $X Now"
- Simulates processing → calls `mark-paid` API
- `// TODO: Replace handlePay with real Stripe` comment marks exact location

**Pro signature on proposals:**
- `pro_signature_r2_key` returned from estimates GET
- Displayed in contractor card on public proposal page

### 1.4 Estimates GET — Parallel Queries (No Joins)

**CRITICAL ARCHITECTURE CHANGE:**

```typescript
// OLD (fragile — one join failure kills entire query):
const { data } = await sb.from('estimates').select('*, pro:pros(...), lead:leads(...), roofing:roofing_estimate_data(...)')

// NEW (resilient — each query fails independently):
const [itemsRes, proRes, leadRes, roofingRes] = await Promise.all([
  sb.from('estimate_items').select('*').eq('estimate_id', id),
  sb.from('pros').select('...').eq('id', estimate.pro_id).maybeSingle(),
  sb.from('leads').select('...').eq('id', estimate.lead_id).maybeSingle(),
  sb.from('roofing_estimate_data').select('...').eq('estimate_id', id).maybeSingle(),
])
const pro:     any = proRes.data     ?? {}
const lead:    any = leadRes.data    ?? {}
const roofing: any = roofingRes.data ?? {}
```

If `roofing_estimate_data` row is missing → auto-created on first GET (upsert), then retried inline.

### 1.5 Estimates PATCH — Explicit Field Guards

**CRITICAL BUG FIX:**

```typescript
// OLD (WRONG — undefined fields null-out DB columns):
const updatePayload = { subtotal, discount, total, ... }  // if total=undefined → DB gets null

// NEW (CORRECT — only set fields explicitly in payload):
const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
if (subtotal !== undefined) updatePayload.subtotal = subtotal
if (total    !== undefined) updatePayload.total    = total
// etc.
```

### 1.6 MOCK_ESTIMATE Removed

`MOCK_ESTIMATE` (with `lead_name: 'Surya Yadav'`, `estimate_number: 'EST-1047'`) was silently rendering when the estimate API returned null. Replaced with proper `notFound` state + "Estimate not found" page.

Root cause: `d.estimate ?? MOCK_ESTIMATE` — when API returned `{ error: "..." }` (no `estimate` key), mock rendered. Now: checks `r.ok` before parsing, sets `notFound = true` on failure.

### 1.7 Estimate Builder — Major UX Redesign

**Save paradigm — explicit Save button (financial document pattern):**

The estimate is a financial document. Roofers want control, not silent auto-save. Pattern used by QuickBooks, ServiceTitan, Jobber.

**Save button states:**
- `● Save changes` — teal filled, visible dot → has unsaved changes, action required
- `Saved` — grey outline, quiet → everything persisted

**`isDirty` flag** — single boolean, set `true` on ANY change (tiers, items, scope, terms, milestones, tier selection), set `false` after successful save.

**What triggers isDirty:**
- `updateTierItem`, `addTierItem`, `deleteTierItem`
- `handleSelectTier`
- `setScope` → `onChange={v => { setScope(v); setIsDirty(true) }}`
- `setTerms` → `onChange={v => { setTerms(v); setIsDirty(true) }}`
- `onUpdateMilestone`
- All stdItems changes (add/edit/delete)

**`handleSave` saves everything in one PATCH:**
```typescript
await onSave({
  estimate_type, tiered_data, items, scope_of_work, terms,
  payment_milestones, subtotal, tax_amount, total
})
setIsDirty(false)
setSaveMsg('Saved ✓')
```

**`fullBleed={true}` on DashboardShell** — fixes sticky header. Without this, `pg-main overflow-y-auto` breaks sticky positioning and the Save button scrolls out of view.

**Proposal type switch — requires confirmation:**
- Clicking Standard ↔ GBB shows amber confirmation banner
- "Switch & Save" commits the type change + saves immediately
- "Cancel" reverts to current type
- Auto-save does NOT fire on type switch

**Delete confirmation — both Standard and GBB items:**
- Click × → red inline banner: "Remove [item name]? [Cancel] [Remove]"
- No modal — inline in the item list

**+ Add Item — auto-focus:**
- Clicking "+ Add Item" generates a UUID, creates item, sets `newItemId`
- Name input has `ref callback`: `ref={el => { if (el && item.id === newItemId) { el.focus(); setNewItemId(null) } }}`
- Cursor lands in name field immediately

**Load saved template — REMOVED** — was a dead button. Will be re-added when template feature is built.

**Scope of work placeholder fixed:**
- Was showing a full roofing description as placeholder (misleading — looked like real content)
- Now: `"Describe the scope of work — materials, removal, cleanup, any special conditions..."`

**T&C collapsed by default** — `showTerms = useState(false)`, shows "Edit ▼", expands on click.

### 1.8 Vercel Build Fixes

**Root cause of `modifyConfig` crash:** `output: 'standalone'` in `next.config.ts` conflicted with Vercel's `modifyConfig` plugin which tries to resolve paths from the output config. Removed.

**Persistent cache issue:** Vercel kept restoring corrupt cache `C4VMt2tsCh8mm2ySA2S9kiHshTgP`. Fixed by changing build script to `rm -rf .next && next build` which wipes the restored cache before Next.js initializes.

**`next.config.ts` current state:**
```typescript
const config: NextConfig = {
  experimental: {},
  images: { remotePatterns: [] },
}
```

---

## 2. Architecture Decisions — Locked

| Decision | Rule |
|---|---|
| Overview dashboard | ONE page `/dashboard` for ALL trades. OverviewWidget plugin slot. NO redirects. |
| Estimates GET | Parallel queries, not joins. Missing rows = graceful null. |
| Estimates PATCH | Explicit field guards only. Never spread full estimate object. |
| Estimate page shell | `fullBleed={true}` on DashboardShell. Required for sticky header. |
| Save paradigm | Explicit Save button. isDirty flag. Financial document pattern. |
| MOCK_ESTIMATE | Removed permanently. notFound state replaces it. |
| `.catch()` on Supabase | Never. Always use try/catch. PostgrestBuilder has no `.catch()`. |
| Build script | `rm -rf .next && next build` — keeps it in package.json. |
| Proposal type switch | Requires amber confirmation banner. Not auto-saved silently. |

---

## 3. Key File Paths (Updated)

```
Overview:
  app/dashboard/page.tsx                          ← ONE overview for all trades
  lib/trades/roofing/components/OverviewWidget.tsx ← Today's Schedule + Revenue Forecast
  lib/trades/_default/components/OverviewWidget.tsx ← returns null

Estimate builder:
  lib/trades/roofing/components/EstimatePage.tsx   ← isDirty, Save button, delete confirm, type switch confirm
  app/dashboard/estimates/[id]/page.tsx            ← fullBleed={true}, passes materialPrices + onDirty
  app/api/estimates/[id]/route.ts                  ← parallel queries GET, explicit guards PATCH

Payment flow:
  app/api/estimates/public/[id]/sign/route.ts      ← auto-stage + auto-invoice + send invoice email
  app/api/invoices/mark-paid/route.ts              ← job_won stage key + review queue
  app/api/estimates/send/route.ts                  ← Resend email with proposal link (NEW)
  app/invoice/[id]/page.tsx                        ← PayButton mock Stripe

Settings:
  app/dashboard/roofing/settings/page.tsx          ← Material Prices (NEW)
  app/api/roofing/settings/route.ts                ← GET/PATCH material_prices

Build:
  next.config.ts                                   ← no output:standalone
  package.json                                     ← build: "rm -rf .next && next build"
```

---

## 4. DB — Pending Owner Actions

| Action | SQL | Risk if skipped |
|---|---|---|
| `contact_zip` on leads | `ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_zip text;` | Silent failure on lead creation — Bible §8.1 Rule 11 calls this critical |
| `review_requests` table | `CREATE TABLE IF NOT EXISTS review_requests (id uuid DEFAULT gen_random_uuid(), pro_id uuid, lead_id uuid, invoice_id uuid, status text, send_after timestamptz, created_at timestamptz DEFAULT now());` | mark-paid/route.ts writes to this — try/catch swallows the error silently. Verify DDL run before E2E test |

**⚠ Verify both DDL statements have been run on staging before the E2E flow test in §8.**

---


---

## 10. The Money Loop — Launch Blocker Analysis

**The single most important thing before launch: close the money loop end-to-end.**

A roofer doesn't need templates, material prices, or a polished UI if the core transaction doesn't work. The core transaction is:

```
Lead → Estimate → Send → Homeowner approves → Invoice created → Homeowner pays → Job Won
```

Every feature built so far is irrelevant if this chain has a broken link.

### 10.1 Homeowner Proposal Approval (`/estimate/{id}`)

**Status: Built but NOT verified end-to-end on staging.**

This is the most critical path. Without it, "Send to Homeowner" sends an email but the homeowner can't do anything with it.

**What should happen:**
1. Roofer clicks "Send to Homeowner" → Resend email sent with proposal link
2. Homeowner opens `/estimate/{id}` — sees the GBB tiers, scope, payment schedule
3. Homeowner selects a tier (Standard / Upgraded / Premium)
4. Homeowner draws signature on canvas → clicks "Approve & Sign"
5. POST `/api/estimates/public/{id}/sign` fires:
   - `estimates.status` → `approved`
   - `estimates.approved_at` → timestamp
   - `leads.lead_status` → `proposal_signed`
   - Draft invoice auto-created in `invoices` table
   - Sibling estimates voided
   - Invoice email sent to homeowner

**What could be broken:**
- Resend email delivery (if `hello@proguild.ai` not verified as sender)
- Canvas e-sign on mobile (touch events — not tested)
- `sign/route.ts` crashing silently if `roofing_estimate_data` row missing for estimate
- The public page URL being wrong (verify the email contains the correct `/estimate/{id}` link, not a dashboard link)
- Homeowner sees wrong estimate (MOCK_ESTIMATE was a persistent bug — now fixed but verify)

**How to test:**
1. Go to staging, open EST-1030
2. Click "Send to Homeowner" — check inbox for email, verify the link in the email
3. Open the link in a private/incognito window (no auth)
4. Verify: address, measurements, 3 tiers with correct prices shown
5. Select Upgraded, draw signature, click Approve
6. Check Supabase: `estimates.status = 'approved'`, `leads.lead_status = 'proposal_signed'`
7. Check Supabase: new row in `invoices` table linked to this estimate

### 10.2 Invoice Flow

**Status: Auto-creation built, public page built, InvoicePage (pro side) NOT built.**

**What should happen after homeowner signs:**
1. Invoice auto-created as `draft` in `invoices` table (done in `sign/route.ts`)
2. Invoice email sent to homeowner with link to `/invoice/{id}` (done, best-effort)
3. Homeowner opens `/invoice/{id}` — sees invoice total, payment schedule, Pay button
4. Homeowner clicks "Pay Now" → mock Stripe → `mark-paid` API called
5. `leads.lead_status` → `job_won`
6. `review_requests` row created (queued for Twilio when 10DLC active)

**What could be broken:**
- Invoice email link pointing to wrong URL (check `NEXT_PUBLIC_SITE_URL` env var on Vercel)
- `/invoice/{id}` public page: does it load? Does it show the right total and milestones?
- PayButton: does the mock Stripe flow complete? Does it hit `mark-paid`?
- `mark-paid` silently fails if `review_requests` table doesn't exist (DDL not run)
- After payment, does the lead show as `job_won` in the pipeline?

**The pro-side invoice builder (`InvoicePage.tsx`) is missing** — the pro can't view/manage the invoice from their dashboard. This is P1 to build next.

**How to test:**
1. After homeowner signs (10.1 above), check email for invoice
2. Open invoice link in incognito — verify total matches estimate
3. Click "Pay Now" — verify processing animation, then "Payment received"
4. Check Supabase: `invoices.status = 'paid'`, `leads.lead_status = 'job_won'`
5. Check pipeline: Steve Smith should now show as "Job Won"

### 10.3 Proposal PDF

**Status: Route exists at `/api/estimates/pdf` — functionality UNKNOWN.**

Roofers routinely need to print or email a PDF version of the proposal. The route exists but:
- Was it ever tested with the new GBB tiered estimate format?
- Does it render the 3-tier layout correctly?
- Does it include the scope, terms, payment schedule?
- Does it include the pro's contact info and logo?

**This is not a launch blocker** — "Send to Homeowner" with the digital approval link is the primary flow. PDF is secondary. But it should work before Wave 1.

**How to check:**
```
GET /api/estimates/pdf?id=34e16e84-284b-4eb9-9b65-ccfcda65b261
```
Open this URL in the browser while logged in. Does it return a PDF? Does the PDF look correct?

### 10.4 The Complete Launch-Blocker Test

**Run this sequence on staging before any other feature work:**

| Step | Action | Pass condition |
|---|---|---|
| 1 | Open EST-1030, click "Send to Homeowner" | Email arrives in inbox with correct proposal link |
| 2 | Open proposal link in incognito | Correct address, measurements, 3 tiers with real prices |
| 3 | Select Upgraded tier, draw signature, approve | Redirect to confirmation screen |
| 4 | Check Supabase `estimates` | `status = 'approved'`, `approved_at` timestamp set |
| 5 | Check Supabase `leads` | `lead_status = 'proposal_signed'` |
| 6 | Check Supabase `invoices` | New draft invoice row linked to estimate |
| 7 | Check email inbox | Invoice email received with `/invoice/{id}` link |
| 8 | Open invoice link in incognito | Correct total, payment schedule visible |
| 9 | Click "Pay Now" | Processing animation → "Payment received" |
| 10 | Check Supabase `leads` | `lead_status = 'job_won'` |
| 11 | Check Supabase `review_requests` | New row queued for 3 days out |
| 12 | Check pipeline in dashboard | Steve Smith shows as "Job Won" |

**If any step fails — fix it before building anything else.**

The money loop is the product. Everything else is decoration.


---

## 9. Estimate Screen — What's Left (Current State as of May 23)

### 9.1 What Works
- GBB 3-tier layout with inline item editing ✅
- Tier selection + auto-calculation from measurements ✅
- Property card + measurement pills ✅
- Proposal type toggle (Standard ↔ GBB) with confirmation banner ✅
- Payment schedule milestones (editable amounts) ✅
- Right panel sticky summary ✅
- Progress timeline (Sent/Viewed/Approved/Invoice/Payment received) ✅
- Send to Homeowner button + Resend email ✅
- isDirty flag → `● Save changes` / `Saved` button states ✅
- Sticky header (fixed via fullBleed) ✅
- Delete confirmation on items (Standard + GBB) ✅
- Auto-focus on + Add Item ✅
- Scope of work — text saves on Save button click ✅
- Terms & Conditions — collapses by default, saves on Save button click ✅
- Material Prices from `pros.roofing_material_prices` via `buildDefaultTiers(materialPrices)` ✅

### 9.2 What's Missing / Broken

**A. Homeowner public proposal page (`/estimate/[id]`) — NOT TESTED E2E**
- Canvas e-sign exists but not verified working on staging with real estimate
- After sign: auto-stage to `proposal_signed` and auto-invoice creation need E2E verification
- Pro signature display: `pro_signature_r2_key` returned in GET but no UI for pro to upload their signature
  - Currently: pro must manually set `pros.signature_r2_key` via Supabase
  - Missing: signature draw/upload UI in profile or estimate settings

**B. Invoice builder (`/dashboard/invoices/[id]`) — NOT BUILT**
- `lib/trades/roofing/components/InvoicePage.tsx` does not exist
- The shell `app/dashboard/invoices/[id]/page.tsx` exists but renders generic non-roofing invoice UI
- DB + API fully ready: `invoices`, `roofing_invoice_data`, `payment_schedules` tables + GET/PATCH API
- Public invoice `/invoice/[id]` exists with mock Stripe PayButton ✅
- Key build work: milestone-level mark-paid (not just line items — those are frozen from estimate)

**C. Estimate status tracker (top bar) — timestamps missing**
- Shows 5 stages: Sent / Viewed / Approved / Invoice / Payment received
- Currently shows "Not yet" for all — should show actual dates once events fire
- `sent_at`, `viewed_at`, `approved_at` exist on estimates table
- Fix: fetch these timestamps in estimates GET and display inline in the tracker

**D. Right panel sticky breaks on very long pages**
- When scope + terms + milestones push left column very tall, right panel stops sticking
- `position: sticky, top: 80` on RightPanel — works for medium pages, breaks for long ones
- Fix: give right panel its own scroll container or use CSS `height: calc(100vh - 80px); overflow-y: auto`

**E. Scope of work — character counter shows 0 when scope is empty**
- Counter reads `scope.length` — correct
- But on first load if `scope_of_work` is null in DB, shows "0 characters" even if placeholder is visible
- Not a bug per se but looks wrong. Fix: hide counter when scope is empty OR show word count instead

**F. Standard mode — items not saved to `estimate_items` table**
- `handleSave` sends `items: stdItems` in the PATCH body
- PATCH handler upserts to `estimate_items` with `onConflict: 'id'`
- Item IDs are now proper UUIDs (fixed `newId()` → `crypto.randomUUID()`)
- **Verify on staging:** after Save in Standard mode, check that `estimate_items` rows exist in Supabase

**G. Pro material prices — new estimates only**
- `buildDefaultTiers(materialPrices)` only runs when `estimate.tiered_data` is null (new estimate)
- Existing estimates that already have `tiered_data` saved use their saved prices, not the pro's settings
- This is correct behavior — saved estimates should not auto-update
- But: if pro updates their prices, existing draft estimates don't reflect the new prices
- Missing: "Recalculate from my prices" button (post-Wave 1 feature)

### 9.3 Estimate Screen Remaining Build Priority

| # | Item | Effort | Blocker |
|---|---|---|---|
| 1 | E2E test: send → sign → auto-invoice | 1h test | hello@proguild.ai in Resend |
| 2 | Invoice builder (`InvoicePage.tsx`) | 1-2 days | None — DB/API ready |
| 3 | Estimate tracker timestamps | 30min | None |
| 4 | Pro signature upload UI | 2h | R2 upload working |
| 5 | Right panel sticky fix for long pages | 30min | None |
| 6 | Verify stdItems save to estimate_items | 15min test | None |

---

## 5. What Is NOT Built (Next Priorities)

### 5.1 Invoice UI — P1
`lib/trades/roofing/components/InvoicePage.tsx` — DOES NOT EXIST.
DB + API fully ready. Public invoice page exists at `/invoice/[id]` with mock Stripe PayButton.
Invoice builder needs: line items (frozen from estimate), payment milestones, send to homeowner, mark-paid per milestone.

### 5.2 Material Prices — Partial
Settings page built. `buildDefaultTiers(materialPrices)` wired. But if pro hasn't set prices, defaults are FL market rates (hardcoded). Good enough for Wave 1.

### 5.3 Pro Signature Upload UI
`pros.signature_r2_key` column exists. Signature displayed on public proposals if key exists. But no UI for pro to draw/upload their signature. Currently manual via Supabase.

### 5.4 Real Stripe
`PayButton` on public invoice has `// TODO: Replace handlePay with real Stripe`. Not signed up yet. Mock simulates processing → calls mark-paid.

### 5.5 Load Saved Template
Removed dead button. `pros.gbb_templates` JSONB exists. `/api/estimate-templates` exists. Feature not built.

### 5.6 Work Orders, PDF Signer
Post-launch.

---

## 6. Pending Infrastructure (Owner Actions)

| Action | Priority |
|---|---|
| Supabase Free → Pro ($25/mo) | 🔴 URGENT — pauses after 7 days |
| Twilio 10DLC registration | 🔴 URGENT — 1-2 week approval |
| US LLC registration | 🔴 URGENT — blocks Stripe + Wave 1 |
| Rotate GitHub token | 🔴 URGENT — ghp_n1w6xR6... exposed |
| hello@proguild.ai in Resend | 🟡 — all estimate emails use this |
| Merge staging → main | 🟡 — before production deploy |

---

## 7. Session Commits (May 23, newest first)

```
06b9739  fix: fullBleed on estimate shell so sticky header works; isDirty flag
357af64  refactor: replace all auto-saves with single Save button
b37a492  fix: scope+terms auto-save in all modes; fix misleading scope placeholder; remove dead Load saved template
348b2a4  fix: smart dirty check on delete — add+remove = clean state; teal Save Changes, grey Discard
d36b1c8  feat: auto-focus name field when adding new item
a609ed1  fix: remove duplicate save props from GBBSection
93d00fa  fix: save bar moved inside line items card below subtotal
85e34db  fix: sticky save bar lives inside EstimatePage
5f25810  fix: sticky save bar right edge stops at right panel
e0b3f3b  fix: sticky bottom save bar for standard mode; delete confirmation on all items
5dafe81  fix: proposal type switch requires explicit confirm
0e7ef76  debug: add detailed error logging to estimates GET and client fetch
7e5ddce  fix: type pro/lead/roofing as any in estimates GET
5354b7f  fix: estimates GET — parallel queries, auto-create missing roofing_estimate_data
37dc8ac  fix: remove MOCK_ESTIMATE (Surya Yadav / EST-1047)
128a61b  fix: move invoice email send to server-side sign route
7fb8ca7  fix: pro_id in PublicRoofingEstimate interface
f73b2b6  fix: remove invalid !left join syntax; PATCH explicit field guards
4680436  feat: complete lead-to-payment flow — auto-stage, auto-invoice, mock Stripe, material prices, pro signature
dc04fa5  chore: update next.config — remove output:standalone
6bddc68  fix: build script clears .next before building
1662ac5  fix: sticky save bar triggers via onDirty callback; delete confirmation
d625de6  feat: sticky bottom save bar for standard mode
5dafe81  fix: proposal type switch requires explicit confirm; auto-save excludes type changes
dce2491  feat: remove Jobs funnel from overview — redundant
ff5b458  fix: roof size insight — real square_count from roofing_job_data; hide when no measurements
881d2dc  fix: eagerly fetch photo count on lead load
336ca54  fix+feat: overview rehaul — urgency-only Action Center, OverviewWidget before Pipeline
```

---

## 8. Start Here Next Session

**Priority 1: Test the full lead-to-payment flow end-to-end on staging:**
**Before running the E2E test — verify these or the test will give false results:**
- [ ] `contact_zip` column added to `leads` table on staging
- [ ] `review_requests` table created on staging
- [ ] `hello@proguild.ai` verified as sender in Resend dashboard (send/route.ts will return 200 even if unverified — the email just silently drops)
- [ ] GitHub token rotated

**E2E flow:**
1. Create lead → ProMeasure → estimate → Send to Homeowner
2. Open homeowner link → select tier → sign → approve
3. Verify in Supabase: `estimates.status = 'approved'`, `leads.lead_status = 'proposal_signed'`, invoice row created
4. Check email inbox: invoice email delivered (confirms Resend sender verified)
5. Open `/invoice/{id}` → click "Pay Now" → verify `leads.lead_status = 'job_won'`, `review_requests` row created

**Priority 2: Build Invoice UI** (`lib/trades/roofing/components/InvoicePage.tsx`)

Read before building:
- `app/api/invoices/route.ts`
- `app/api/invoices/[id]/route.ts`
- `app/invoice/[id]/page.tsx` (public page already exists with mock Stripe)
