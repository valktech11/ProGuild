# ProGuild.ai — Development Handover Document
## Session: v76 → v77 Sprint
**Date:** May 5, 2026
**Branch:** `dev` (auto-deploys to staging after CI green)
**Staging:** https://staging.proguild.ai (password: `proguild2026`)
**Repo:** https://github.com/valktech11/ProGuild
**Latest commit:** `4961c57`

---

## Stack & Infrastructure

| Item | Value |
|---|---|
| Framework | Next.js 16.2.2 (Turbopack, App Router) |
| Database | Supabase staging: `zttsqqvaakblgbutviai.supabase.co` |
| Deployment | Vercel (staging + prod) |
| CI | GitHub Actions — 58 unit tests + 10 integration tests gate `dev` |
| Auth | `sessionStorage('pg_pro')` — NOT localStorage |
| Dark mode | `localStorage('pg_darkmode')` = '1' or '0' |
| GitHub token | `ghp_REDACTED_see_github_secrets` |

---

## Git Workflow

```bash
# Work on dev
git add .
git commit -m "feat: ..."
git push origin dev          # triggers CI → auto deploys to staging

# Push to staging manually (skip CI)
git push origin dev:staging

# NEVER use && for commit+push — TS exit code 1 silently skips push
# Always push in separate commands
```

---

## Test Accounts (Staging)

| Role | Email | Pro ID |
|---|---|---|
| Wasim (real test) | wasimakram@wasim.com | `7e883161-f9af-4de8-8bc6-71933033100f` |
| Test Pro | test@proguild.ai | `58b897e2-5723-4178-93d5-8bd29420b52f` |

---

## Key Files & Architecture

### Pages
```
app/dashboard/page.tsx                    — Overview dashboard
app/dashboard/pipeline/page.tsx           — Pipeline kanban (mobile tab strip)
app/dashboard/pipeline/[id]/page.tsx      — Lead detail (dedicated page)
app/dashboard/estimates/page.tsx          — Estimates list
app/dashboard/estimates/[id]/page.tsx     — Estimate detail / builder
app/dashboard/invoices/page.tsx           — Invoices list
app/dashboard/invoices/[id]/page.tsx      — Invoice detail
app/dashboard/clients/page.tsx            — Clients list
app/estimate/[id]/page.tsx                — PUBLIC estimate approval page
app/invoice/[id]/page.tsx                 — PUBLIC invoice page
app/login/page.tsx                        — Login
app/onboarding/page.tsx                   — Pro onboarding
```

### Core Components
```
components/layout/DashboardShell.tsx      — Sidebar + TopHeader (desktop) + MobileNav + MoreDrawer (mobile)
components/ui/LeadPipeline.tsx            — Kanban + mobile tab strip + lead cards
components/ui/FilterPanel.tsx             — Lead filter right-drawer
components/ui/ActionAlert.tsx             — "X leads need attention" banner
components/ui/AddLeadModal.tsx            — Add lead modal
components/estimate/EstimateItems.tsx     — Line item editor
components/estimate/EstimateSummary.tsx   — Subtotal/tax/total summary
components/estimate/EstimateProgressBar.tsx — Sent→Viewed→Approved→Invoice→Paid tracker
components/estimate/PaymentPanel.tsx      — Deposit configuration
```

### API Routes
```
/api/leads              — CRUD leads
/api/leads/[id]         — Single lead GET/PATCH
/api/estimates          — CRUD estimates (POST has active-estimate guard)
/api/estimates/[id]     — Single estimate GET/PATCH/DELETE
/api/estimates/public/[id]/approve — Client approval (auto-voids siblings)
/api/invoices           — CRUD invoices
/api/invoices/[id]      — Single invoice
/api/estimate-templates — Templates CRUD
/api/reviews            — Reviews
/api/clients            — Clients
/api/auth               — Login
```

### Lib
```
lib/utils.ts            — capName(), timeAgo(), avatarColor(), planLabel(), initials() etc.
lib/theme.ts            — theme(dk) token system — textMuted, textSubtle, cardBg etc.
```

---

## What Was Built This Session (v77)

### ✅ Data / DB Fixes
- `quoted_amount` resynced from best active estimate (Neha: $1,060 → $1,166)
- `estimates_status_check` constraint updated to include `void`, `declined`, `invoiced`
- Superseded estimate (Vaibhav EST-1018) voided — was double-counting in Active Estimates Value
- Invoice deduplication added (raw fetch was returning duplicates)

### ✅ Estimates / Flow
- **Active Estimates Value** now uses best-per-lead (DISTINCT ON lead_id) — was double-counting
- **Draft Estimates card** on dashboard wired to real data (was hardcoded 0)
- **Auto-void siblings on approve** — when client approves EST-X, all other sent/viewed/draft estimates for same lead are automatically voided
- **Active estimate guard** — creating new estimate when one already exists shows modal: "Active estimate exists — void it first or create revision"
- **Send Reminder button** changed from blue → teal (brand consistent)
- **Context menu (···)** changed from `position: absolute right:0` (clips on mobile) → `position: fixed centered` (never clips)
- **Progress bar** replaced Lucide icons with inline SVGs (Lucide was bleeding blue color at small sizes)
- **Estimates mobile layout** — responsive table rows, button `whitespace-nowrap`, scrollable filter pills
- **Public estimate table** — mobile grid `2fr 40px 80px 80px` (item column gets 2x space, numbers tighter)
- **Terms → isDirty** — "Save Terms" now triggers dirty bar
- **Styled delete modal** — replaced `window.confirm()` on estimates list and template delete

### ✅ Pipeline / CRM
- **Job Won rename** — "Paid" column → "Job Won" everywhere (DB enum stays `'paid'`)
- **Filter panel** — "Paid" → "Job Won", DB filter maps `Job Won → 'Paid'`, stage dots show colored at 50% opacity when inactive
- **Filter Done button** — sticky at bottom, full-width teal gradient button (was floating off-screen on small phones)
- **Contact grid** — 3-col → 2-col on mobile (phone number no longer wraps)
- **Lead UUID** — hidden on mobile (`hidden md:inline`)
- **Header info** — source as pill, amount in teal bold, UUID muted
- **Action buttons priority** — "Add Note" gets `flex:2` + green border (more prominent than Send SMS / Log Call)
- **Edit lead drawer** — full-viewport backdrop, proper blur, form labels 13px, Cancel button visible
- **capName() global** — `neha patel` → `Neha Patel` everywhere contact_name displays
- **Orphan dot** — `· 3 days ago` → `3 days ago` (removed leading dot)
- **Stage bar scroll hint** — right-edge fade gradient on both pipeline tabs and lead detail stage bar
- **P2 Workflow Warnings** (3 guards, no API changes):
  - Moving to **Scheduled** without approved estimate → modal with "Create Estimate First" / "Schedule Anyway"
  - Moving to **Completed** without invoice → modal with "Create Invoice First" / "Mark Complete Anyway"
  - Creating estimate for **New** lead → modal with "Contact First" / "Send Anyway"

### ✅ Dashboard
- **Hero strip** (mobile only) — Pipeline Value + Active Leads shown above Action Center
- **Action Center** — 5 stacked full-width cards → 2-col compact tile grid on mobile; whole tile is tappable
- **Pipeline mini** — hidden on mobile (hero strip replaces it)
- **Review cards** — stars `13px` → `16px`, names `13px semibold` → `15px bold`, card bg `#FAFAF8`, darker border
- **Review timestamps** — `"1w ago"` → `"Apr 26"` actual dates
- **Community icons** — `40px` → `32px` (gives text more horizontal space)
- **All typography** — global floor raised: 10px→11px, 11px→12px, 12px→13px throughout

### ✅ Mobile Navigation
- **Bottom nav** — icons 22px, labels 11.5px, inactive contrast `#7C756E`, elevation shadow
- **Bottom nav label** — "Today" → "Home"
- **More Drawer** — complete redesign:
  - Avatar with teal gradient ring
  - Name 18px bold, trade·city as subtitle
  - "Free Plan" plain text (not a pill)
  - "Upgrade to Pro ↗" — full-width amber gradient button (solid `#D97706`)
  - Section labels in **teal** with gradient rule lines
  - Nav items 17px bold, 0.92 opacity inactive
  - SOON items with indigo pills (intentional, not broken-looking)
  - Smooth slide-up open / slide-down close animation with backdrop fade

### ✅ Global / Theme
- **`capName()` utility** in `lib/utils.ts` — call everywhere `contact_name` renders
- **`lib/theme.ts`** — `textMuted: #4B5563` (was `#6B7280`), `textSubtle: #6B7280` (was `#9CA3AF`)
- **Background unified** — mobile shell `#ECEAE5` → `#F5F4F0` (matches all page backgrounds)
- **Loading state bg** — `#ECEAE5` → `#F5F4F0`

### ✅ Tier 3 Polish
- Lost leads expandable with Reopen button
- Estimates stat cards tighter on mobile (`p-3 md:p-4`, `text-xl md:text-2xl`)
- Sort select in clients — custom SVG chevron, `appearance: none`
- QuickSheet invoice item — unlocked (`soon: false`), links to `/dashboard/invoices`
- Client row mobile tap feedback (`active:opacity-70 active:scale-[.99]`)
- Attention banner — red/rose (was amber, same as New column)
- Filter — instant apply, "Done" replaces "Apply Filters"
- `Phone_Call` → `Phone Call` everywhere (`.replace(/_/g,' ')`)
- Invoice row nowrap on lead name

---

## Production SQL — MUST RUN BEFORE LAUNCH

**File:** `v77-prod-migration.sql` (in repo root — 501 lines)

**Run order on prod:**
```bash
psql "postgresql://postgres:PASSWORD@db.<PROD_PROJECT>.supabase.co:5432/postgres" \
  -f v77-prod-migration.sql
```

Or paste into Supabase prod SQL Editor.

**What it covers (in order):**
1. `clients` table + indexes (v74 — slipped 3 handovers)
2. `invoices`, `invoice_items`, `invoice_payments` tables (v76)
3. `estimates` new columns: `declined_at`, `voided_at`, `void_reason`, `revision_of`, `invoiced_at`, `invoice_id`, `decline_reason` (v76)
4. `estimates.discount_type` column + backfill `'$'` (v76)
5. `estimates_status_check` constraint fix — adds `void`, `declined`, `invoiced` (v77 — was causing ERROR 23514)
6. `leads` missing columns: `quoted_amount`, `scheduled_date`, `follow_up_date`, `contact_city`, `contact_state`, `job_id` (staging_leads_fix)
7. `next_estimate_number()` RPC function
8. `next_invoice_number()` RPC function
9. `updated_at` triggers for new tables
10. RLS policies for clients/invoices/invoice_items/invoice_payments
11. Service role bypass policies (for `getSupabaseAdmin()`)
12. Data integrity — dirty `quoted_amount` cleanup + superseded estimate void

**Verification queries included at bottom of file** — run them after migration to confirm everything applied.

**Also run these pre-launch infra tasks:**
- [ ] Supabase Free → Pro ($25/mo) — DB pauses on inactivity
- [ ] `NEXT_PUBLIC_SITE_URL=https://proguild.ai` in Vercel prod env vars
- [ ] `hello@proguild.ai` verify in Resend (estimate/invoice email links break without this)
- [ ] Cloudflare DNS orange-cloud for proguild.ai
- [ ] Twilio 10DLC registration (start now — 1–2 week approval, needed for SMS)

---

## Design System

### Colors
```
TEAL      #0F766E  — primary action, buttons, links
TEAL_L    #14B8A6  — lighter teal accents
NAVY      #0A1628  — primary text dark mode
CREAM     #F5F4F0  — page background (unified across all pages)
BORDER    #E8E2D9  — card borders
MUTED     #4B5563  — labels, secondary info (raised from #6B7280 this session)
SUBTLE    #6B7280  — timestamps, hints (raised from #9CA3AF this session)
BODY      #374151  — descriptive sub-text
```

### Stage Colors (Pipeline)
```
New        #D97706 amber    bg #FFFBEB   subLabel "Not yet contacted"
Contacted  #2563EB blue     bg #EFF6FF
Quoted     #7C3AED purple   bg #F5F3FF
Scheduled  #0F766E teal     bg #F0FDFA
Completed  #374151 gray     bg #F9FAFB
Job Won    white on #4A7B4A muted forest green  (DB enum: 'paid')
```

### Drawer Colors
```
Background gradient: linear-gradient(180deg, #0F2847 0%, #091525 60%, #060D18 100%)
Section labels: rgba(45,212,191,0.8) — teal, tracking [.15em] uppercase
Rule lines: linear-gradient(90deg, rgba(45,212,191,0.4), rgba(45,212,191,0.08))
Nav items inactive: rgba(255,255,255,0.92) labels, rgba(255,255,255,0.70) icons
Nav items active: rgba(20,184,166,0.26) bg + 1.5px teal border + 4px left accent bar
```

---

## Dev Rules (Critical)

### 1. TypeScript check BEFORE every commit
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
```
**Vercel runs full strict TS — no filters. If the filtered check shows any errors, Vercel WILL fail.**
Also run a file-specific unfiltered check on any file you edited:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep "your-file.tsx"
```

### 2. Never `&&` commit + push
```bash
# WRONG — TS exit code 1 silently skips push
git commit -m "..." && git push origin dev

# CORRECT — always separate
git commit -m "..."
git push origin dev
git push origin dev:staging
```

### 3. Auth
- `sessionStorage.getItem('pg_pro')` — auth token
- NOT localStorage
- Dark mode: `localStorage('pg_darkmode')` = '1' or '0'

### 4. API routes
- All use `getSupabaseAdmin()` server-side
- Never use client Supabase in API routes

### 5. New dashboard pages
- Wrap in `<DashboardShell>`, pass `dk` state
- Use `theme(dk)` tokens not hardcoded colors

### 6. Contact names
- Always use `capName(contact_name)` for display — DB stores lowercase
- Import from `@/lib/utils`
- Example: `capName(lead.contact_name)` → "Neha Patel"

### 7. New files must be `git add`ed
- Learned hard way with `[id]/page.tsx` in v76

### 8. Review mobile on every UI change
- Test at 360px width
- Desktop changes: `hidden md:flex` blocks only
- Mobile changes: `md:hidden` blocks only
- Shared components (lead cards etc): size increases are safe for both

### 9. Job Won / Paid naming
- Display: "Job Won" everywhere
- DB enum: `'paid'` — do NOT migrate data
- Filter: maps `'Job Won'` → `'Paid'` for DB queries (in FilterPanel.tsx)

---

## Known Issues / Deferred

### v78 Next Sprint
| Feature | Notes |
|---|---|
| Messaging (SMS/WhatsApp/Email) | Conversation tab in lead detail (empty state shown) — blocked on Twilio 10DLC |
| File attachments | Files tab in lead detail (empty state shown) |
| Reminders | Middle col in lead detail (placeholder shown) |
| Full activity log | Activity tab currently shows basic entries |
| Auto follow-up | Gemini 2.5 Flash if quote unsigned after 3 days |

### v85 AI Layer
| Feature | Notes |
|---|---|
| AI Insights | Right col in lead detail (placeholder shown) |
| Lead Score | Right col in lead detail (placeholder shown) |
| AI Price Advisor | Needs: pro_id, trade, city, service_type, quoted_amount, accepted/declined |

### Known Data
- Wasim's staging data is clean — quoted_amount synced, no duplicate estimates
- `test@proguild.ai` account only has E2E test data (E2E-Reload, E2E-Move leads)
- Surya Yadav is in Completed stage with no invoice (manually moved — pre-P2 warnings)

---

## Seeded Data (Staging — Wasim's account)

| Lead | Status | Estimate | Amount |
|---|---|---|---|
| neha patel | Quoted | EST-1021 sent | $1,166 |
| Vaibhav S | Quoted | EST-1009 approved | $1,325 |
| Virat K | Scheduled | EST-1007 approved | $550 |
| Rajesh Kumar | Scheduled | EST-1017 draft | $1,001.70 |
| priya | Scheduled | none (manual) | $300 |
| rohit sharma | Paid/Job Won | none (manual) | $100 |

Pipeline Value: **$3,341** (excludes Job Won + Completed)
Active Estimates Value: **$3,041** (best-per-lead: neha $1,166 + Vaibhav $1,325 + Virat $550)

---

## E2E Testing Status

**Current state:** Non-blocking. Unit + integration gate merges. E2E is informational.

**Root cause of E2E failures:**
`SUPABASE_URL` env var in CI webServer context hits prod not staging. `test@proguild.ai` only exists in staging so `/api/auth` returns 404 during E2E.

**Files:**
```
playwright.config.ts
tests/e2e/global-setup.ts
tests/e2e/global-teardown.ts
tests/e2e/transactions.spec.ts
tests/e2e/.e2e-pro-id   (gitignored)
```

---

## Transcript
Full conversation transcript available at:
`/mnt/transcripts/` — read with `bash_tool` to get full context of decisions made this session.
