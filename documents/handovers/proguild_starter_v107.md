# ProGuild — New Chat Starter (v107, June 7 2026)

You are working with Raj (solo founder) on **ProGuild.ai** — a verified-trades ecosystem for blue-collar pros (Directory + CRM + Community). FL-first, roofing CRM built, HVAC next, going national.

## Stack
Next.js + Supabase + Stripe + Resend. Repo: `valktech11/ProGuild`, branch `staging`. Staging: staging.proguild.ai. Prod: proguild.ai.

## Working style
Simple English, high-signal, concise. Small slices. One commit per milestone. Typecheck before every push. No build without GO from Raj. Defer binding legal/financial decisions to professionals.

## Where we are
The roofing CRM is ~90% complete and verified working end-to-end:
- Full 8-stage pipeline (Lead In → Job Won)
- Measurement chain: Satellite → DSM → Calculator → Estimate → Invoice
- IEM storm flag working (hail events surface on property page + PDF)
- Homeowner status page, status email, payment milestones, estimate totals all fixed
- Twilio 10DLC campaign submitted (under review ~2-3 weeks)
- Pricing tiers undecided — isPro = true hardcoded, do NOT build Stripe gating

## Canonical docs (in Project files)
- `HANDOVER_v107.md` — what just happened, all commits, next actions
- `ProGuild_Founders_Bible_v6_0.docx` — full strategy + architecture reference
- `ProGuild_Roofing_Master_Plan.docx` — roofing build plan with current statuses
- `ROOFING_CRM_current_state.md` — verified repo state

## Next priority: Supplement Assistant AI
The #1 remaining item. This is the moat — no competitor has it.

**What it is:** A roofer pastes the insurance adjuster's scope of work → AI finds missing line items → drafts a FL-compliant supplement letter in plain English → roofer sends to adjuster.

**Why it matters:** Supplements recover 20-40% additional revenue on insurance jobs. FL roofers do this manually today, taking hours. ProGuild does it in seconds.

**Build approach:**
- Input: adjuster scope text (paste or upload)
- Gemini processes against FL SB 2-A rules + standard roofing line items
- Output: structured list of missing items + draft supplement letter
- Start simple: text in → text out. No Xactimate codes yet.

## Key open items
1. Supplement Assistant AI (build now)
2. Twilio wiring (after campaign approved)
3. Stripe E2E (after pricing decided)
4. roofing_job_data → selected_report_id refactor (Sprint 4)
5. Rotate GitHub PAT

## Do NOT
- Build Stripe plan gating (pricing undecided)
- Cold-SMS any list (TCPA)
- Treat AI reassurance as cleared trademark verdict
- Buy Twilio phone number before campaign approved
