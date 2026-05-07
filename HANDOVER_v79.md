# ProGuild.ai — Handover Document
## Session: Calendar Complete Rebuild + Design System
**Date:** May 2026
**Latest commit:** `0fe72f2` (dev + staging)
**Branch:** `dev` → auto-deploys to staging after CI green
**Staging:** https://staging.proguild.ai (password: `proguild2026`)
**Repo:** https://github.com/valktech11/ProGuild

---

## Git Push Pattern (CRITICAL — use this exact pattern)
```bash
# Never use git push origin — use full URL with token
git push https://ghp_REDACTED_see_github_secrets@github.com/valktech11/ProGuild.git HEAD:dev
git push https://ghp_REDACTED_see_github_secrets@github.com/valktech11/ProGuild.git HEAD:staging

# Never && commit+push together — TS exit code 1 silently skips push
git commit -m "feat: ..."
git push ...dev
git push ...staging
```

---

## TypeScript Check (run before EVERY push)
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | \
  grep -v "TS7006\|TS2307\|TS2875\|TS7026\|jsx-runtime\|implicitly" | \
  grep -v "Cannot find module\|TS2503\|TS2591\|TS2345" | \
  grep -v "GroupLandingPage\|TradeLandingClient\|CitySearch\|\[state\]"
```
**CRITICAL:** Vercel TypeScript is stricter than local. Always run unfiltered check on YOUR changed files too:
```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep "your-file.tsx"
```

---

## Stack
| Item | Value |
|---|---|
| Framework | Next.js 16.2.2 (Turbopack, App Router) |
| Database | Supabase staging: `zttsqqvaakblgbutviai.supabase.co` |
| Deployment | Vercel — project: `tradesnetwork` |
| Auth | `sessionStorage('pg_pro')` NOT localStorage |
| Dark mode | `localStorage('pg_darkmode')` = '1' or '0' |

---

## What Was Built This Session

### Design System Consolidation
**`lib/design.ts`** (NEW) — single color source for entire app:
- `eventStyle(opts, dk)` — 4-color urgency system for calendar: teal (job), amber (followup), red (overdue), gray (done)
- `stageStyle(status)` — lead pipeline stage colors, replaces PIPELINE_STAGES color fields
- `invoiceStatusStyle(status)` — replaces STATUS_STYLES in invoice files
- `estimateStatusStyle(status)` — estimate status colors
- `ICON_PATH` — SVG path strings: wrench, phone, warning, check, chevronL/R, mapPin, plus

**`lib/theme.ts`** — `statusColors()` deleted. Redundant cal chip tokens removed.

**`components/ui/LeadPipeline.tsx`** — PIPELINE_STAGES stripped of color fields (key/label/subLabel/nextLabel only). All 34+ color usages migrated to `stageStyle()`.

**`app/dashboard/invoices/[id]/page.tsx`** + **`invoices/page.tsx`** — STATUS_STYLES deleted, import `invoiceStatusStyle` from design.ts.

### EventChip Component
**`components/ui/EventChip.tsx`** (NEW) — single event renderer in 3 sizes:
- `micro` — month grid cell (icon + name, 9px)
- `compact` — week grid / desktop agenda (icon + time + name + amount)
- `full` — mobile agenda card (full card, always-visible Call/Done buttons)
- Nav button removed (message text ≠ address)

### Calendar Complete Rebuild
**`app/dashboard/calendar/page.tsx`** — full rewrite fixing all issues:

**Desktop:**
- Day / Week / Month views (Day is default — operational mode)
- Elastic time grid — only renders hours with events ±1hr buffer
- Week view: clicking any empty cell navigates to day view for that column
- Month view: nav arrows correctly step by month (not week)
- Value pill uses unfiltered job data (financial metric, not display filter)
- Escape key closes right detail panel
- Sidebar: overdue alert, filters, today stats, unscheduled leads

**Mobile:**
- Day (agenda) / Week / Month view toggle — Day/Week/Month segmented control in header
- `MobileWeekGrid` — coloured dots per day (teal=job, amber=followup, red=overdue)
- `MobileMonthGrid` — compact dot grid, tap to select day, agenda updates below
- Filter button (funnel icon) in header → `FilterSheet` bottom sheet with Job/Followup toggles
- "← Today" chip appears when browsing away from today
- Swipe gesture fixed — only fires if clearly horizontal (|dx| > |dy| × 1.5)
- Header height: 2 rows + week/month strip (not 3-4 rows)
- `minHeight: 100%` instead of `calc(100vh - 60px)` — no double-subtraction

**Both:**
- `isOverdueEvent()` fixed — only followups trigger red, not past-dated scheduled jobs
- Refetch when navigating outside ±60 day window
- `groupByDay()` dead code removed

### Other Fixes
**`components/layout/DashboardShell.tsx`** — Calendar is direct bottom nav tab (Home/Pipeline/+/Calendar/More). Clients moved to More.

**`app/dashboard/pipeline/[id]/page.tsx`** — Back button reads `?from=calendar` → shows "Back to Calendar". Wrapped in Suspense for useSearchParams.

**`app/api/calendar/route.ts`** — Dedup by `id:type` key so a lead with both scheduled_date AND follow_up_date appears once as job (on scheduled_date) and once as followup (on follow_up_date), not twice on same day.

**`app/dashboard/pipeline/[id]/page.tsx`** + **`app/api/leads/[id]/route.ts`** — `scheduled_time` field (text, HH:MM format). SQL migration: `v78-scheduled-time.sql` (run on staging + prod).

---

## Key Files
```
lib/design.ts                              — NEW: single color source
lib/theme.ts                               — base tokens (statusColors DELETED)
components/ui/EventChip.tsx               — NEW: single event renderer
components/ui/LeadPipeline.tsx            — stage colors now via stageStyle()
app/dashboard/calendar/page.tsx           — full calendar (desktop + mobile)
app/api/calendar/route.ts                 — calendar data API
components/layout/DashboardShell.tsx      — mobile nav: Calendar direct tab
app/dashboard/pipeline/[id]/page.tsx      — back button + from=calendar
app/dashboard/invoices/[id]/page.tsx      — invoiceStatusStyle from design.ts
app/dashboard/invoices/page.tsx           — same
```

---

## Isoverdue Rule (IMPORTANT)
Only `_type === 'followup'` events are "overdue" (red).
Scheduled jobs with past dates are NOT overdue — they happened, just need marking complete.
Rule: `ev._type !== 'followup' → never overdue`

---

## Pending / Next Sprint

### Calendar remaining (known, not built)
- Dark mode: mobile header background should be dark-mode aware (currently hardcoded white)
- Loading skeletons for subsequent date navigations (only initial load has skeletons)
- Detail panel: estimate/invoice status visible (currently only basic lead info)

### v75 (Estimates — from previous sessions)
| Feature | File |
|---|---|
| Estimates / Quote builder | TBD |
| Draft Estimates card | `app/dashboard/page.tsx` |
| Filter on Pipeline | `app/dashboard/pipeline/page.tsx` |

### Pre-Launch Infrastructure
- [ ] Run `v74-sql.sql` on PRODUCTION (clients table missing)
- [ ] Run `v76-invoices-sql.sql` on PRODUCTION
- [ ] Run `v76-estimates-schema-update.sql` on PRODUCTION
- [ ] Run `v76-discount-type.sql` on PRODUCTION
- [ ] Run `v78-scheduled-time.sql` on PRODUCTION (scheduled_time column)
- [ ] Supabase Free → Pro ($25/mo)
- [ ] `NEXT_PUBLIC_SITE_URL=https://proguild.ai` in Vercel prod env vars
- [ ] `hello@proguild.ai` verify in Resend
- [ ] Cloudflare DNS orange-cloud
- [ ] Twilio 10DLC registration (1–2 weeks, for v86 SMS)

---

## Design System Rules
- **4 urgency colors:** teal (active job), amber (followup/attention), red (overdue/critical), gray (done)
- **Icons differentiate type:** wrench=job, phone=followup, warning=overdue
- **Dark mode events:** cardBg (#1E293B) + colored border + colored text. NO dark-tinted status backgrounds.
- **statusColors() is DELETED** — use `eventStyle()` from design.ts
- **PIPELINE_STAGES color fields are DELETED** — use `stageStyle()` from design.ts

## Stage Colors (from design.ts stageStyle())
```
New:       #D97706 amber
Contacted: #2563EB blue
Quoted:    #7C3AED purple
Scheduled: #0F766E teal
Completed: #374151 gray
Paid:      #15803D green (label: "Job Won")
```

## Test Accounts (Staging)
| Role | Email | ID |
|---|---|---|
| Test Pro | test@proguild.ai | `58b897e2-5723-4178-93d5-8bd29420b52f` |
| Test Pro | wasimakram@wasim.com | — |

---

## useSearchParams Pattern (App Router)
Any component using `useSearchParams()` MUST be wrapped in Suspense:
```tsx
function Inner() {
  const params = useSearchParams()
  // ... component body
}
export default function Page() {
  return <Suspense fallback={null}><Inner/></Suspense>
}
```

## New Page Pattern
```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardShell from '@/components/layout/DashboardShell'
import { Session } from '@/types'
import { theme } from '@/lib/theme'

export default function MyPage() {
  const router = useRouter()
  const [session] = useState<Session|null>(() => {
    if (typeof window==='undefined') return null
    const s = sessionStorage.getItem('pg_pro')  // NOT localStorage
    return s ? JSON.parse(s) : null
  })
  const [dk, setDk] = useState<boolean>(() => {
    if (typeof window==='undefined') return false
    return localStorage.getItem('pg_darkmode')==='1'
  })

  useEffect(() => {
    if (!session) router.push('/login')
  }, [session, router])

  if (!session) return null
  const t = theme(dk)

  return (
    <DashboardShell session={session} newLeads={0} onAddLead={() => {}}
      darkMode={dk} onToggleDark={() => { const n=!dk; localStorage.setItem('pg_darkmode',n?'1':'0'); setDk(n) }}>
      {/* page content */}
    </DashboardShell>
  )
}
```
