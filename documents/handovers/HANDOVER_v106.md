# ProGuild — Session Handover v106 (June 7, 2026)

*Purpose: pick up cleanly in a new chat. The Roadmap (V2), Founders Bible (v5_9), Roofing Master Plan, and ROOFING_CRM_current_state.md are the full record; this is "what just happened + what's next + where to look."*

---

## 1. Project snapshot
- **ProGuild.ai** — verified-trades ecosystem: Directory + CRM + Community/marketplace. FL-first, roofing built, HVAC next, going national.
- **Stack:** Next.js + Supabase + Stripe + Resend. Staging: staging.proguild.ai. Repo: valktech11/ProGuild (branch `staging`).
- **Assets:** 124k+ FL DBPR records, ~5,690 emailable warm pros, WY LLC ProGuild LLC, Mercury bank, DUNS, proguild.ai (2-yr Cloudflare).
- **Working style:** simple English, high-signal, concise; small slices; one commit per milestone; Markdown living docs; defer binding legal/financial decisions to professionals.

---

## 2. What THIS session did

### 2.1 Bugs fixed (all committed to staging, pushed to prod where noted)

| Commit | Fix |
|--------|-----|
| `ac25f9d` | PATCH /api/leads/[id] returns full lead+roofing_job_data — Measure Roof Step 1 ticks without refresh |
| `b661f8f` | Estimate send always persists computed total first — DB total never 0 after a send |
| `c884a22` | Estimate tab uses invoice balance_due as amount fallback when estimate total is 0 |
| `e6c9061` | Invoice creation copies payment_milestones from estimate — enables Make a Payment section |
| `0320344` | Estimate auto-saves total on first open when DB total is 0 — eliminates "Open to see total" |
| `67fa451` | step2Running only true when DSM actually running — was falsely spinning after step1 completed |
| `a145505` | Homeowner estimate public page: payment schedule recomputes dynamically on tier switch |
| `a4b47bc` | Status page hides Insurance Approved step for retail (non-insurance) leads |
| `a63ec5c` | Calendar includes inspections in week/day value + count; status page shows Call + Email buttons |
| `599db5d` | Auto-send homeowner status email on inspection_scheduled; Share button → Send Status (email) |
| `592eb37` | Upsert client record at job_won if client_id still null — safety net |
| `0187833` | Privacy: remove Univaro, add SMS section; Terms: fix contact@proguild.ai (also pushed to prod) |

### 2.2 Data fixes run in Supabase (staging)
- INV-0771 payment_milestones set (30/40/30 hardcoded SQL — was null)
- Tim David quoted_amount set to 14515.64
- Tim David + Brian Smith client records backfilled via SQL (client_id was null)

### 2.3 Architecture debt logged
- **roofing_job_data vs roof_reports duplication**: square_count/pitch/waste_pct stored in both tables. Right design: roofing_job_data stores `selected_report_id` FK → reads from roof_reports. Refactor post-Stripe/Twilio (Sprint 4).

### 2.4 Twilio 10DLC — completed registration
- Twilio account created (Pay as you go, $20 funded)
- Account SID: `AC[redacted — see Twilio console]`
- Brand registered: SID `BN3236da3dfb6dc0fab5f03c68ae019f73`, External ID `B1RJVYZ` (Low Volume Standard, Private)
- Campaign submitted: SID `CMe6f79e5cf51d25001b04a0d45ee40312` (Low Volume Mixed, under review — 2-3 weeks)
- Phone number: NOT yet purchased. Buy after campaign approval. Recommend 904 area code (Jacksonville FL).
- SMS architecture decision: **shared ProGuild number for CRM notifications** (not per-contractor). Notifications only — homeowners talk to contractors directly. Per-contractor numbers = Phase 2.
- Pricing decision still in flux — do not build Stripe gating yet. Keep `isPro = true` hardcoded.

### 2.5 Status email feature built
- Auto-sends at inspection_scheduled stage (Resend, fires via stage route trigger)
- Manual resend via "Send Status" button (email icon) on lead detail
- Template: inspection confirmed + status page link + pro contact
- Activity log entry written on every send

---

## 3. Canonical files
- `ProGuild_Founders_Bible_v5_9.docx` — deep reference; §24 = SMS/Twilio architecture (new this session)
- `ProGuild_Ecosystem_Roadmap_V2.docx` — sequencing decisions; Phase 2 CRM updated
- `ProGuild_Roofing_Master_Plan.docx` — roofing-only build plan; statuses updated
- `ROOFING_CRM_current_state.md` — verified repo state; updated with this session's fixes
- `HANDOVER_v106.md` — this file

---

## 4. Immediate next actions

1. **Wait for Twilio campaign approval** (2-3 weeks). When approved: buy 904 number, attach to campaign, add TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER to Vercel env vars.
2. **Supplement Assistant AI** — the moat. Plain-English → FL supplement draft. Build next.
3. **Pricing decision** — talk to 5-10 FL roofers before locking tiers. Lead-count vs feature gating decision needed before Stripe E2E.
4. **Stripe E2E** — hold until pricing decided. Keep `isPro = true` hardcoded.
5. **roofing_job_data refactor** (selected_report_id) — Sprint 4, post-Stripe/Twilio.
6. **IEM storm smoke-test** — verify against known FL hail address on staging.

---

## 5. Standing decisions (stable)
- Ecosystem not just CRM. Win on flywheel + DBPR-verified identity + FL claims intelligence.
- Pricing: undecided — don't lock yet. $49/$99 was placeholder; real tiers need customer input.
- SMS = CRM notifications only (not homeowner ↔ contractor comms). Shared number. Phase 2 = per-contractor.
- Build order: Supplement Assistant → Twilio wiring → Stripe E2E → HVAC CRM expansion.
- roofing_job_data → selected_report_id refactor: deferred to Sprint 4.
- Rotate the GitHub PAT (was pasted in chat this session).

---

## 6. Known bugs / gaps (open)
- Insurance Approved stage not auto-advancing when claim status set to "Approved" in dropdown (design gap, not a bug — intentional separation of claim status and pipeline stage).
- IEM storm data not smoke-tested on staging.
- `isPro = true` hardcoded everywhere — intentional until Stripe is wired.
- Revenue $0 for insurance leads where approved_amount not filled — expected behaviour given data; future fix = auto-populate approved_amount from estimate on claim approval.

---

## 7. Environment / credentials reminder
- Vercel env: TWILIO_* not yet set (add after campaign approval)
- Supabase: two migrations run this session (v99 condition-homeowner, v100 inspection-date)
- GitHub PAT: rotate immediately — was pasted in this session
- Resend from: hello@proguild.ai (verified)
- Twilio campaign: under review, check console in 2-3 weeks
