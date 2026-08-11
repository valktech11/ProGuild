# ProGuild.ai — Development Handover Document
## Session: v76 Estimate + Invoice + CRM Sprint
**Date:** May 2026
**Branch:** `dev` → auto-deploys to staging after CI green
**Staging:** https://staging.proguild.ai (password: `proguild2026`)
**Repo:** https://github.com/valktech11/ProGuild
**Latest commit:** `76c2903`

---

## ⚠️ CRITICAL RULES — READ BEFORE TOUCHING ANYTHING

### 1. NEVER push if TypeScript errors exist
Vercel runs a **strict** TypeScript check that is MORE aggressive than local `tsc --noEmit`.
The local filtered check passes pre-existing legacy errors — Vercel does not.

**Before every single push, run this on every file you touched:**
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | \
  grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly" | \
  grep -v "Cannot find module\|TS2503\|TS2591\|TS2345" | \
  grep -v "GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
```
If output is non-empty → **do not push**. Fix first.

Also run the full unfiltered check on your specific changed files:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep "your-changed-file.tsx"
```

### 2. NEVER `&&` commit and push together
TypeScript exit code 1 silently skips the push. Always separate:
```bash
git commit -m "feat: ..."
git push origin dev
git push origin dev:staging
```

### 3. useSearchParams requires Suspense in App Router
Any component that calls `useSearchParams()` must be wrapped in `<Suspense>`.
Move the hook into a tiny child component and wrap it:
```tsx
function MySearchReader({ onData }: { onData: (v: string) => void }) {
  const params = useSearchParams()
  useEffect(() => { ... }, [params])
  return null
}
// In parent:
<Suspense fallback={null}><MySearchReader onData={...} /></Suspense>
```
Failure to do this causes prerender errors on static routes.

### 4. Auth pattern
- `sessionStorage.getItem('pg_pro')` — NOT localStorage
- `localStorage.getItem('pg_darkmode')` — dark mode only
- All API routes use `getSupabaseAdmin()` server-side

---

## Stack & Infrastructure

| Item | Value |
|---|---|
| Framework | Next.js 16.2.2 (Turbopack, App Router) |
| Database | Supabase staging: `zttsqqvaakblgbutviai.supabase.co` |
| Deployment | Vercel — project: `tradesnetwork` |
| CI | GitHub Actions — 58 unit + 10 integration tests gate `dev` |
| Auth | `sessionStorage('pg_pro')` NOT localStorage |
| Dark mode | `localStorage('pg_darkmode')` = '1' or '0' |

---

## Git Workflow & Credentials

```bash
# Clone
git clone https://YOUR_GITHUB_TOKEN@github.com/valktech11/ProGuild.git
cd ProGuild

# Install
npm install

# Start dev server
npm run dev   # http://localhost:3000

# Standard workflow
git add -A
git commit -m "feat: ..."
git push origin dev          # triggers CI → preview deploy
git push origin dev:staging  # deploys to staging.proguild.ai

# NEVER push directly to main — production only via staging:main after QA
```

**GitHub token:** `ghp_xxxx` — get current token from Wasim or GitHub → Settings → Developer settings → Personal access tokens. Token in git remote URL: `git remote get-url origin`

---

## Test Accounts (Staging)

| Role | Email | Password | ID |
|---|---|---|---|
| Test Pro | test@proguild.ai | (use staging login) | `58b897e2-5723-4178-93d5-8bd29420b52f` |
| Admin | admin@proguild.ai | — | — |

---

## Database — Two Environments

| Environment | Project ID | Use |
|---|---|---|
| **Staging** | `zttsqqvaakblgbutviai` | All dev/test work. Full read/write. |
| **Production** | `bzfauzqqxwtqqskjhrgq` | READ ONLY for schema reference. Never write directly. |

Connect to staging:
```bash
psql "postgresql://postgres:PASSWORD@db.zttsqqvaakblgbutviai.supabase.co:5432/postgres"
```

---

## SQL Migrations Status

| File | Staging | Production | Notes |
|---|---|---|---|
| `v74-sql.sql` | ✅ Run | ❌ NOT RUN | clients table — **must run on prod before launch** |
| `v75-estimates-contacts-sql.sql` | ✅ | ✅ | estimates + contacts schema |
| `v75-templates-sql.sql` | ✅ | ✅ | estimate_templates table |
| `v76-invoices-sql.sql` | ✅ | ❌ | invoices table — **must run on prod** |
| `v76-estimates-schema-update.sql` | ✅ | ❌ | declined_at, voided_at, decline_reason, revision_of columns — **must run on prod** |
| `v76-discount-type.sql` | ✅ | ❌ | discount_type column on estimates — **must run on prod** |

**Run on production before going live (in order):**
```sql
-- 1. v74-sql.sql
-- 2. v76-invoices-sql.sql
-- 3. v76-estimates-schema-update.sql
-- 4. v76-discount-type.sql
```

---

## Key Files & Architecture

### Pages
```
app/dashboard/page.tsx                    — Overview dashboard
app/dashboard/pipeline/page.tsx           — Pipeline kanban
app/dashboard/pipeline/[id]/page.tsx      — Lead detail
app/dashboard/estimates/page.tsx          — Estimates list
app/dashboard/estimates/[id]/page.tsx     — Estimate detail (full builder)
app/dashboard/invoices/page.tsx           — Invoices list
app/dashboard/invoices/[id]/page.tsx      — Invoice detail
app/dashboard/clients/page.tsx            — Clients list
app/estimate/[id]/page.tsx                — Public client estimate page
app/invoice/[id]/page.tsx                 — Public client invoice page
```

### Core Components
```
components/layout/DashboardShell.tsx      — Sidebar + TopHeader
components/ui/LeadPipeline.tsx            — Kanban board + lead cards
components/ui/FilterPanel.tsx             — Pipeline filter drawer
components/estimate/EstimateItems.tsx     — Line items table (locked/unlocked)
components/estimate/EstimatePDF.tsx       — Estimate PDF component
components/estimate/EstimateSummary.tsx   — Right sidebar summary
components/estimate/PaymentPanel.tsx      — Deposit panel
components/estimate/EstimateProgressBar.tsx — 5-step progress bar
components/estimate/SmartNudges.tsx       — Context-aware nudge banner
components/invoice/InvoicePDF.tsx         — Invoice PDF component
lib/theme.ts                              — Central dark mode token system
```

### API Routes — CRM
```
/api/leads                               — GET list, POST create
/api/leads/[id]                          — GET, PATCH (requires ?pro_id for auth)
/api/estimates                           — GET list, POST create/find-existing
/api/estimates/[id]                      — GET, PATCH, DELETE
/api/estimates/send                      — POST: initial send email to client
/api/estimates/send-reminder             — POST: follow-up reminder email
/api/estimates/pdf                       — GET: generate PDF (?id=&pro_id=)
/api/estimates/duplicate                 — POST: copy estimate as new draft
/api/estimates/public/[id]               — GET: client-facing (404 for draft/void)
/api/estimates/public/[id]/approve       — POST: client approves (guards status+expiry)
/api/estimates/public/[id]/decline       — POST: client declines
/api/estimates/public/[id]/view          — POST: view tracking (session dedup)
/api/estimate-templates                  — GET list, POST create, DELETE
/api/invoices                            — GET list, POST create
/api/invoices/[id]                       — GET, PATCH, DELETE(void)
/api/invoices/[id]/view                  — POST: view tracking
/api/invoices/mark-paid                  — POST: record payment (accumulates)
/api/invoices/pdf                        — GET: generate PDF
/api/invoices/send                       — POST: send invoice email
```

---

## Design System

```
TEAL      #0F766E  — primary action, buttons, CTAs
TEAL_L    #14B8A6  — lighter accents
NAVY      #0A1628  — primary text dark mode
CREAM     #F5F4F0  — page background light
BORDER    #E8E2D9  — card borders
MUTED     #9CA3AF  — timestamps, secondary labels
BODY      #6B7280  — descriptive sub-text

Stage colors:
New        #D97706 amber    bg #FFFBEB
Contacted  #2563EB blue     bg #EFF6FF
Quoted     #7C3AED purple   bg #F5F3FF
Scheduled  #0F766E teal     bg #F0FDFA
Completed  #374151 gray     bg #F9FAFB
Paid       white   on #4A7B4A muted forest green solid
```

---

## Estimate Lifecycle — Full Status Map

```
DRAFT → SENT → VIEWED → APPROVED → INVOICED → PAID
                      ↘ DECLINED
At any point: VOID
```

**Status rules:**
- `draft` — not yet sent. Items fully editable. PDF downloadable but marked Draft.
- `sent` — email sent to client. Items still editable (with intent to resend).
- `viewed` — client opened public link. Transitions from `sent` automatically.
- `approved` — client clicked Approve. **Items locked.** Cannot edit without voiding. Create Invoice is the only next action.
- `declined` — client declined. Shows red banner. "Revise & Resend" duplicates as new draft.
- `invoiced` — invoice created from estimate. Fully locked. Navigate to invoice.
- `paid` — invoice fully paid. Read-only archive.
- `void` — pro cancelled. Can duplicate to start fresh.

**Public page guards:**
- `draft` and `void` → return 404 (client cannot see)
- Approve route: only works from `sent`/`viewed` + server-side expiry check
- Decline route: only works from `sent`/`viewed`

**`quoted_amount` sync rules (CRITICAL):**
Only synced to `lead.quoted_amount` when estimate status is `approved`, `invoiced`, or `paid`.
Draft saves NEVER overwrite. This was a major data integrity fix.

---

## Invoice Lifecycle

```
DRAFT → SENT → VIEWED → PARTIAL_PAYMENT → PAID
                                         ↘ VOID (soft delete)
```

**Partial payment math (fixed):**
`balance_due = current_balance_due - payment_amount` (NOT recalculated from total).
`amount_paid` accumulates — never overwritten.

**Deposit:**
`deposit_paid` defaults to 0 on invoice creation — NOT assumed from `require_deposit` flag.
Pro must manually record what was actually collected.

---

## What Was Built This Session (v76)

### ✅ Estimate System — Complete
- Full estimate CRUD with line items, discount (`$`/`%` both persisted to DB), tax, deposit
- `discount_type` column added to estimates table — restores correctly on reload
- Dirty-state save bar (amber, conditional, auto-save before template)
- Lock items on approved/invoiced/paid/void — desktop AND mobile
- Send Estimate: validates items > 0, total > 0, email exists → sends proper email
- Send Reminder: calls actual API (not stub)
- Decline button on public estimate page with optional reason
- Void with reason modal
- Duplicate estimate (uses `next_estimate_number()` RPC, no collision)
- Delete estimate (draft only) from `···` menu
- Copy estimate link from `···` menu
- `···` menu closes on backdrop click (not just onMouseLeave)
- Context-aware back button: `?from=pipeline&lead_id=xxx` → "Back to Pipeline"
- After void: navigates to list with `?voided=EST-1009` → shows toast
- Notes tab actually saves to DB (was local-state-only before)
- `onFocus select()` on all 8 numeric inputs (qty, price, discount, tax)
- Template save/load/delete. Save disabled when 0 items.
- Template save in dirty bar auto-saves items first

### ✅ Estimates List
- Sort by column header (↑↓ arrows on Client, Status, Total, Date)
- Status filter pills: All / Draft / Sent / Viewed / Approved / Invoiced / Paid
- Archive toggle: void/declined hidden by default, "Show archived (N)" at bottom
- Empty state distinguishes: truly empty vs filter returns 0 results
- Labels: "Active Estimates Value" (not "Pipeline Value")

### ✅ Invoice System — Complete
- Invoice creation from approved estimate (auto-fills all line items)
- Invoice detail: partial payments, record payment modal, payment terms
- Invoice PDF: Balance Due hero, deposit credit row, terms
- Invoice send email: proper template with Balance Due
- Invoice view tracking: public page with session dedup
- Invoice due date from `issue_date` not `new Date()`
- Mark Paid cascades: lead → Paid, estimate → paid

### ✅ Pipeline & Lead Detail
- Pipeline value excludes Paid/Completed leads
- Revenue = Paid only (not Completed)
- Estimate priority selection: invoiced > approved > paid > sent > viewed > draft
- "Add contact" button when no phone (opens drawer) instead of disabled "Call"
- Dead "Filter" button removed from Conversation tab
- Drawer title: "Edit Lead" + lead name
- "Lead Pipeline Value" label (was "Pipeline Value" — same as estimates list, confusing)
- `dQuote` conflict fixed: drawer doesn't overwrite estimate-synced amount

### ✅ Bug Fixes (Critical)
- Invoice partial payment accumulates correctly (was recalculating from total — wrong)
- `quoted_amount` sync only from approved/invoiced/paid (drafts never overwrite)
- Items delete with empty array now clears DB (was silently skipping)
- Approve route: status guard + expiry check server-side
- Public estimate: 404 for draft/void
- View tracking: skips draft, session dedup
- Floating point: all monetary calculations rounded to 2 decimal places
- PDF deposit formula corrected
- Notes save to DB (was local state only — showed "✓ Saved" but nothing persisted)
- Send Estimate was a stub (just changed status) — now calls email API
- Send Reminder was a stub — now calls email API
- Estimate number in duplicate uses RPC (was count-based, caused collisions)

### ✅ P0+P1 UX Fixes (Latest)
- Void disappears silently → now shows toast on return to list
- "No estimates yet" on filter → shows "No [X] estimates" + "Clear filters"
- Dead Filter button in Conversation tab → removed
- "Update lead information" → "Edit Lead — [Name]"
- Sort `<select>` → column header arrow sort
- Disabled Call button → "Add contact" CTA that opens drawer

---

## What Remains — Build Backlog

### 🔴 P2 — Next Build (Workflow Warnings)
**All in `pipeline/[id]/page.tsx` + `LeadPipeline.tsx`. No API changes.**

| # | Fix | Trigger | Buttons |
|---|---|---|---|
| P2-1 | Warn when moving to **Scheduled** with no approved estimate | `handleStageClick('Scheduled')` when `leadEstimate?.status` not in `['approved','invoiced','paid']` | "Schedule Anyway" / "Create Estimate First" |
| P2-2 | Warn when moving to **Completed** with no invoice | `handleStageClick('Completed')` when `leadInvoice` is null | "Mark Complete Anyway" / "Create Invoice First" |
| P2-3 | Warn when creating estimate for a **New** lead | `openEstimate()` in kanban when `lead.lead_status === 'New'` | "Send Anyway" / "Contact First" |

### 🟡 P3 — Quick Wins (1 build each)

| # | Fix | Effort | File |
|---|---|---|---|
| P3-1 | **Lost leads — click to manage** | Small | `LeadPipeline.tsx` — expand lost leads section, allow move back to New/Contacted |
| P3-2 | **E6 Deposit tracking — Option A** | Small | Add `deposit_collected` checkbox to invoice creation. If unchecked, `deposit_paid = 0`. One field. |
| P3-3 | **E7 Terms in Save Changes bar** | Small | Wire Terms edit to `setIsDirty(true)`. Currently Terms has its own Save button separate from the dirty bar. |
| P3-4 | **E9 Template picker preview** | Small | Show item list on hover/expand in template picker modal |
| P3-5 | **Delete confirmation modal** | Small | Estimates list delete uses browser `confirm()`. Replace with styled modal matching void modal pattern. |
| P3-6 | **Discount % stale when items added** | Medium | When `discount_type='%'`, adding a new item should recalculate the flat discount: `newDiscount = subtotal * (discountPercent/100)`. Currently the flat amount stays fixed. `discountInput` state holds the % number — use it in `recalc`. |

### 🔵 P3 — Deferred (architectural or v85+)

| Item | Reason |
|---|---|
| Multiple estimates per lead — history view | New page/drawer needed. Low urgency. |
| Pipeline card amount confidence indicator | Requires joining estimates into leads API — data model refactor |
| Pipeline value hover breakdown (per-stage tooltip) | Nice-to-have. Can add in 1 hour when there's appetite |
| Estimate activity log | v85 — AI features scope |
| E4 Multiple estimates history view | v77 |
| Stripe integration (public approve+pay) | v86+ |
| Twilio SMS | Requires 10DLC registration (1–2 weeks), v86 |
| AI Insights / Lead Score on estimate/lead | v85 |

---

## Known Data Issues in Staging DB

1. **Dirty `quoted_amount` values** — leads that had draft estimates saved BEFORE the sync fix may show wrong amounts on pipeline cards. SQL cleanup provided:
```sql
-- Clear quoted_amount where only draft/declined/void estimates exist
UPDATE leads l SET quoted_amount = NULL
WHERE EXISTS (
  SELECT 1 FROM estimates e
  WHERE e.lead_id = l.id AND e.status IN ('draft','declined','void')
)
AND NOT EXISTS (
  SELECT 1 FROM estimates e
  WHERE e.lead_id = l.id AND e.status IN ('sent','viewed','approved','invoiced','paid')
);

-- Resync from best active estimate
UPDATE leads l SET quoted_amount = e.total
FROM estimates e
WHERE e.lead_id = l.id AND e.status IN ('approved','invoiced','paid')
AND e.id = (
  SELECT id FROM estimates WHERE lead_id = l.id AND status IN ('approved','invoiced','paid')
  ORDER BY CASE status WHEN 'paid' THEN 1 WHEN 'invoiced' THEN 2 WHEN 'approved' THEN 3 END
  LIMIT 1
);
```

2. **`discount_type` column** — run `v76-discount-type.sql` on production before launch.

---

## Pre-Launch Infrastructure Checklist

```
[ ] Run v74-sql.sql on PRODUCTION (clients table missing)
[ ] Run v76-invoices-sql.sql on PRODUCTION
[ ] Run v76-estimates-schema-update.sql on PRODUCTION
[ ] Run v76-discount-type.sql on PRODUCTION
[ ] Supabase Free → Pro ($25/mo) — 134k records, DB pauses on inactivity
[ ] NEXT_PUBLIC_SITE_URL=https://proguild.ai in Vercel prod env vars
[ ] hello@proguild.ai verified in Resend dashboard
[ ] Cloudflare DNS — flip proguild.ai to orange cloud (DDoS protection)
[ ] Twilio 10DLC registration (1–2 week approval, needed for v86 SMS)
[ ] MODERATION_MODE=off in Vercel Preview env vars
```

---

## New Developer Setup

```bash
# 1. Clone
git clone https://YOUR_GITHUB_TOKEN@github.com/valktech11/ProGuild.git
cd ProGuild

# 2. Install
npm install  # ~153 packages, ignore peer warnings

# 3. Environment — get .env.local from Wasim
# Required keys:
# NEXT_PUBLIC_SUPABASE_URL=https://zttsqqvaakblgbutviai.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# NEXT_PUBLIC_ENV=staging
# MODERATION_MODE=off
# RESEND_API_KEY=...
# GEMINI_API_KEY=...

# 4. Run
npm run dev   # http://localhost:3000

# 5. Login at /login with test@proguild.ai (staging password)
```

---

## How to Add a New CRM Page

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Session } from '@/types'
import DashboardShell from '@/components/layout/DashboardShell'

export default function MyPage() {
  const router = useRouter()
  const [session] = useState<Session | null>(() => {
    if (typeof window === 'undefined') return null
    const s = sessionStorage.getItem('pg_pro')  // NOT localStorage
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState(false)

  useEffect(() => {
    if (!session) { router.push('/login'); return }
    setDk(localStorage.getItem('pg_darkmode') === '1')
  }, [session, router])

  if (!session) return null

  return (
    <DashboardShell
      session={session}
      newLeads={0}
      onAddLead={() => {}}
      darkMode={dk}
      onToggleDark={() => {
        const next = !dk
        localStorage.setItem('pg_darkmode', next ? '1' : '0')
        setDk(next)
      }}
    >
      {/* page content */}
    </DashboardShell>
  )
}
```

---

## Common Traps

| Problem | Fix |
|---|---|
| Vercel build fails but local passes | Run full unfiltered `tsc` on your changed files. Fix ALL errors. |
| `useSearchParams` prerender error | Wrap in Suspense boundary — see rule #3 above |
| Stage change doesn't save | Always separate `git commit` and `git push` |
| Lead `quoted_amount` wrong | Draft saves no longer sync it. Check if DB has dirty legacy data (see cleanup SQL above) |
| Estimate items come back after delete all | Fixed — empty array now deletes all items from DB |
| Invoice balance wrong on second payment | Fixed — now subtracts from `balance_due`, not recalculated from total |
| `avatarColor` type error | Returns `[string, string]` tuple — destructure: `const [bg, fg] = avatarColor(name)` |
| Build skipping / not triggering | Ignored Build Step must be: `bash -c 'exit 1'` |
| Edit Profile 404 | Link is `/edit-profile` not `/dashboard/edit-profile` |
| Dashboard flicker | Session must be in `useState` initializer (sync), not `useEffect` |

---

## Vercel Configuration

| Setting | Value |
|---|---|
| Project | `tradesnetwork` |
| Production branch | `main` → proguild.ai |
| Staging domain | `staging.proguild.ai` → staging branch |
| Node.js | 24.x |
| Build command | `npm run build` |
| Ignored Build Step | `bash -c 'exit 1'` — ALWAYS BUILD |

If build stuck on old version: Vercel → Deployments → three dots → Redeploy → **uncheck** "Use existing build cache"

---

## Full Transcript

Full session transcript (1.27MB) available at:
`/mnt/transcripts/2026-05-04-16-23-56-proguild-crm-development.txt`

Read with bash_tool for any decision context needed.
