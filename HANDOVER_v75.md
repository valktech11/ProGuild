# ProGuild.ai — Development Handover Document
## Session: v74c → v75 UI Sprint
**Date:** May 2026  
**Branch:** `dev` (auto-deploys to staging after CI green)  
**Staging:** https://staging.proguild.ai (password: `proguild2026`)  
**Repo:** https://github.com/valktech11/ProGuild  

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
git add . && git commit -m "feat: ..."
git push origin dev          # triggers CI → auto deploys to staging

# Push to staging manually (skip CI)
git push origin dev:staging

# NEVER use && for commit+push — TS exit code 1 silently skips push
# Always push in a separate command
```

---

## Test Accounts (Staging)

| Role | Email | Password | ID |
|---|---|---|---|
| Test Pro | test@proguild.ai | (use staging login) | `58b897e2-5723-4178-93d5-8bd29420b52f` |
| Admin | admin@proguild.ai | — | — |

---

## Key Files & Architecture

### Pages
```
app/dashboard/page.tsx              — Overview dashboard (fully redesigned)
app/dashboard/pipeline/page.tsx     — Pipeline kanban board
app/dashboard/pipeline/[id]/page.tsx — Lead detail page (dedicated, not modal)
app/dashboard/clients/page.tsx      — Clients list
app/login/page.tsx                  — Login
app/onboarding/page.tsx             — Pro onboarding
```

### Core UI Components
```
components/layout/DashboardShell.tsx  — Sidebar + TopHeader (Available/Location/Bell/User menu)
components/ui/LeadPipeline.tsx        — Kanban pipeline with 6 columns
components/ui/AddLeadModal.tsx        — Add lead modal (redesigned to match reference)
```

### API Routes
```
/api/auth          — Login (POST)
/api/leads         — CRUD leads
/api/leads/[id]    — Single lead GET/PATCH
/api/reviews       — Reviews
/api/clients       — Clients
```

---

## Features Built This Session

### ✅ Dashboard Overview (app/dashboard/page.tsx)
- **Action Center**: 5 cards (New Leads, Awaiting Response, Waiting on Customer, Jobs Scheduled, Draft Estimates v75 placeholder) — each with Lucide icon in colored circle, count, CTA button with teal outline
- **Pipeline mini**: 5 stages with colored circle icons + SVG arrows that stretch to fill width, Total Pipeline Value
- **Reviews & Growth**: 4.x rating + gamification card (green tinted) + AI Insight card (purple tinted) + 4 review cards + Request reviews panel + AI Review Assistant (red/amber tinted cards)
- **Community Insights**: 3 cards with colored circle icons, trending badge, View Community + Ask a Question buttons
- **Dark mode**: Full coverage — every card, inner panel, text color responds to toggle
- **Mobile responsive**: Single column Action Center, stacked Reviews row, scrollable pipeline, full-width review cards

### ✅ TopHeader (DashboardShell.tsx)
- "Available for jobs" dropdown with 5 status options (green/amber/blue/red/purple dots)
- Location pill (from session.city + state)
- Bell icon with badge
- User avatar + name → dropdown: Dark Mode toggle (animated switch), Profile link, Logout (clears session, redirects /login)
- "Add New Lead" teal button

### ✅ Sidebar (DashboardShell.tsx)
- "Add New Lead" CTA (was "Quick Add")
- Active item: teal filled pill
- Section labels readable at 30% opacity
- "v75" tags on coming-soon items
- Bottom user card shows: avatar, name, trade · city, plan

### ✅ Pipeline Page (app/dashboard/pipeline/page.tsx)
- Header: "Pipeline" + subtitle
- Stats bar: Total Leads | Total Pipeline Value with vertical divider
- Filter button → "Filter coming in v75" toast (auto-dismisses 3s)
- 6-column kanban: New/Contacted/Quoted/Scheduled/Completed/Paid
- Each column: colored tinted header with 3px top border accent, stage name + count badge, sub-label, column value sum
- **Paid column**: muted forest green `#4A7B4A` solid header, white text
- **Completed column**: gray `#F9FAFB` header, dark text

### ✅ Lead Cards (LeadPipeline.tsx)
- Avatar initials + name + amount (or age badge)
- Message text (2-line clamp)
- **Next action pill** per stage: Next: Call / Follow Up / Send Estimate / Job Day / Generate Invoice / ✓ Paid
- Bottom icons: phone + chat + stage-aware 3rd icon (calendar for Scheduled/Paid, doc for others)
- Card click → routes to `/dashboard/pipeline/[id]` (not modal)

### ✅ Pipeline Overflow (LeadPipeline.tsx)
- Shows 3 cards, then "+ N more leads ∨" expand button
- Chevron icon → Slide Panel (right drawer with search, overflow leads only `leads.slice(3)`, View all footer)
- Mobile: tab strip for stage switching

### ✅ Lead Detail Page (app/dashboard/pipeline/[id]/page.tsx)
- **Header**: Back to Pipeline, avatar + name + stage pill, source · time, Call button, Save Changes
- **Stage progress bar**: clickable pills (New→Contacted→Quoted→Scheduled→Completed→Paid), backward move shows confirmation modal
- **Left col (7/12)**: Tabs — Conversation (v76 TBD empty state), Notes (real textarea, saves), Activity (created_at + status), Files (v76 TBD)
- **Middle col (3/12)**: Lead Details — phone/email/source/received + editable quote/scheduled/follow-up + Reminders (v76)
- **Right col (2/12)**: Estimate (v75) + Next Best Action (static rules, real logic) + AI Insights (v85) + Lead Score (v85)
- **Next Best Action rules**:
  - New + >0 days → Call now (urgent if >3 days)
  - Contacted → Send quote
  - Quoted + >3 days → Follow up
  - Scheduled → Confirm job day
  - Completed → Generate invoice + request review
  - Paid → Request review

### ✅ Add Lead Modal (AddLeadModal.tsx)
- Header: teal circle icon + "Add a lead" + divider
- Source grid: 3 columns, 22px brand icons, teal checkmark badge on selected
- "Where did this lead come from?" bold dark label
- "Lead details" section heading
- Name + Phone side-by-side (sm:grid-cols-2)
- Icons inside inputs (person/phone/email/lines)
- Char counter `0/250`, error pill, security note
- "+ Save lead" teal gradient button

### ✅ Mobile Dashboard
- Action Center: `grid-cols-1` single column (not 2-col)
- Reviews top row: stacks vertically on mobile (`md:flex-row`)
- Pipeline mini: horizontal scroll on mobile
- Review cards: `grid-cols-1 md:grid-cols-2` (single col on mobile, date no longer overflows)
- Community Insights: 2-row header on mobile (title+pill / buttons)

---

## Features Pending / TBD

### v75 (Next Sprint)
| Feature | File | Notes |
|---|---|---|
| **Estimates / Quote builder** | TBD | Line items, labor/material split, e-signature |
| **Draft Estimates card** | `app/dashboard/page.tsx` | Placeholder exists, wire to real data |
| **Filter on Pipeline** | `app/dashboard/pipeline/page.tsx` | Toast placeholder exists, build filter UI |
| **Create Estimate button** | `app/dashboard/pipeline/[id]/page.tsx` | Links to v75 estimates feature |

### v76
| Feature | Notes |
|---|---|
| **Messaging (SMS/WhatsApp/Email)** | Conversation tab in lead detail (empty state shown) |
| **File attachments** | Files tab in lead detail (empty state shown) |
| **Reminders** | Middle col in lead detail (placeholder shown) |
| **Full activity log** | Activity tab currently shows basic entries |
| **Auto follow-up** | Gemini 2.5 Flash if quote unsigned after 3 days |

### v85
| Feature | Notes |
|---|---|
| **AI Insights** | Right col in lead detail (placeholder shown) |
| **Lead Score** | Right col in lead detail (placeholder shown) |
| **AI Price Advisor** | Needs data: pro_id, trade, city, service_type, quoted_amount, accepted/declined |

### Pre-Launch Infra (Do Before Going Live)
- [ ] Supabase Free → Pro ($25/mo) — DB pauses on inactivity, 134k records
- [ ] Run `v74-sql.sql` on PRODUCTION (clients table missing)
- [ ] `NEXT_PUBLIC_SITE_URL=https://proguild.ai` in Vercel prod env vars
- [ ] `hello@proguild.ai` verify in Resend
- [ ] Cloudflare DNS orange-cloud for proguild.ai
- [ ] Twilio 10DLC registration (1–2 weeks, needed for v86 SMS)

---

## E2E Testing Status (Playwright)

**Current state:** Partially working but not fully green.

**What works:**
- Playwright installs ✓
- Dev server starts ✓
- Auth page tests (3 passing) ✓
- `test@proguild.ai` exists in staging Supabase ✓

**Root cause of failures:**
The `SUPABASE_URL` env var in the CI webServer context is not correctly hitting staging. The app may be using prod Supabase URL during E2E tests, causing `/api/auth` to return 404 for `test@proguild.ai` (which only exists in staging).

**Files:**
```
playwright.config.ts
tests/e2e/global-setup.ts   — reads test pro ID from staging DB (SELECT by email)
tests/e2e/global-teardown.ts — cleans leads/clients for test pro
tests/e2e/transactions.spec.ts — transactional E2E tests
tests/e2e/.e2e-pro-id       — written by global-setup, read by tests (gitignored)
```

**Fix attempted:** `global-setup.ts` now does a SELECT to find `test@proguild.ai` ID (was trying to INSERT which failed on schema constraints). Still needs verification.

**CI job:** E2E is non-blocking — unit + integration tests gate merges, E2E is informational.

---

## Design System

### Colors
```
TEAL      #0F766E  — primary action, buttons, links
TEAL_L    #14B8A6  — lighter teal accents
NAVY      #0A1628  — primary text dark mode
CREAM     #F5F4F0  — page background light
BORDER    #E8E2D9  — card borders
MUTED     #9CA3AF  — timestamps, secondary labels
BODY      #6B7280  — descriptive sub-text (use over MUTED for readability)
```

### Stage Colors
```
New        #D97706 amber    bg #FFFBEB
Contacted  #2563EB blue     bg #EFF6FF  
Quoted     #7C3AED purple   bg #F5F3FF
Scheduled  #0F766E teal     bg #F0FDFA
Completed  #374151 gray     bg #F9FAFB
Paid       white   on #4A7B4A muted forest green solid
```

### Dark Mode Inner Cards
In dark mode, colored inner cards use `#1E293B` bg + 3px colored left border accent:
- Gamification: `border-left: 3px solid #22C55E`
- AI Insight: `border-left: 3px solid #8B5CF6`
- Negative Review: `border-left: 3px solid #EF4444`
- Positive Booster: `border-left: 3px solid #F59E0B`

---

## Dev Rules (Important)

1. **Always `npx tsc --noEmit`** before committing — filter pre-existing errors:
   ```
   grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly\|Cannot find module\|TS2503\|TS2591\|TS2345\|GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
   ```

2. **Never `&&` commit + push** — TS exit code 1 silently skips push. Always separate:
   ```bash
   git commit -m "..."
   git push origin dev
   git push origin dev:staging
   ```

3. **sessionStorage not localStorage** — `sessionStorage.getItem('pg_pro')` for auth

4. **All API routes** use `getSupabaseAdmin()` server-side

5. **New dashboard pages**: wrap in `DashboardShell`, pass `dk` state

6. **New files must be `git add`ed** — learned hard way with `[id]/page.tsx`

7. **Review mobile on every UI change** — test at 360px width

---

## Seeded Data (Staging)

Reviews seeded for `test@proguild.ai`:
```sql
-- Run on staging Supabase if reviews missing:
INSERT INTO reviews (pro_id, reviewer_name, rating, comment, is_approved, reviewed_at) VALUES
('58b897e2-5723-4178-93d5-8bd29420b52f', 'Emily Johnson',   5, 'Very professional and finished on time.', true, NOW() - INTERVAL '5 days'),
('58b897e2-5723-4178-93d5-8bd29420b52f', 'Michael Brown',   4, 'Great communication and quality.', true, NOW() - INTERVAL '1 week'),
('58b897e2-5723-4178-93d5-8bd29420b52f', 'Jessica Lee',     3, 'Took too long to respond. Work was good though.', true, NOW() - INTERVAL '2 weeks'),
('58b897e2-5723-4178-93d5-8bd29420b52f', 'David Wilson',    4, 'Work quality was great but response time was slow.', true, NOW() - INTERVAL '2 weeks'),
('58b897e2-5723-4178-93d5-8bd29420b52f', 'Sarah Martinez',  5, 'Excellent work, very clean and detail oriented.', true, NOW() - INTERVAL '3 weeks');
```

---

## Transcript

Full conversation transcript available at:
`/mnt/transcripts/` — read with `bash_tool` to get full context of any decision made this session.
