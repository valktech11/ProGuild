# Roofing CRM — Verified Current State
*Source of truth: repo `valktech11/ProGuild`, branch `staging`, June 7 2026. Verified against actual files/routes, not doc flags. Replaces the stale Phase 2 status in the Founders Bible.*

## Built (confirmed in repo)

| Feature | Status | Evidence (file / route) |
|---|---|---|
| Roofing pipeline (8-stage, config-driven) | ✅ Built | `lib/trades/roofing/config.ts` |
| Property profile (property-centric record) | ✅ Built | `app/dashboard/roofing/property/page.tsx` + `/property/[id]` + `app/api/properties` |
| ProMeasure (polygon area/perimeter) | ✅ Built | `app/dashboard/roofing/promeasure/page.tsx` |
| Satellite + Premium roof reports | ✅ Built | `app/api/roofing/report`, `premium-report`, `dsm` routes |
| Roofing calculator (squares + pitch + waste → line items) | ✅ Built | `app/dashboard/roofing/calculator/page.tsx` |
| Report → Calculator → Estimate pre-fill | ✅ Built | sessionStorage chain across roofing pages |
| Good / Better / Best tiered estimates | ✅ Built | `EstimatePage.tsx` |
| Job photo log (phase labels, ZIP) | ✅ Built | `lib/trades/roofing/components/JobPhotoLog.tsx` |
| Insurance claim fields | ✅ Built | `InsuranceClaimFields.tsx` |
| FL SB 2-A deadlines + 25%-rule eligibility (FL-gated) | ✅ Built | `lib/fl/sb2a.ts`, `lib/fl/roofAge.ts` |
| Warranty record (auto-created on Job Won) | ✅ Built | `WarrantyRecord.tsx`, stage trigger |
| Estimate e-sign (signature capture + sign route) | ✅ Built | `app/api/estimates/public/[id]/sign/route.ts` |
| QuickBid | ✅ Built | `app/dashboard/roofing/quickbid/page.tsx` |
| Estimates / Invoices / Calendar / Clients | ✅ Built | dashboard + API routes |
| Homeowner job-status public page (tokenized) | ✅ Built | `app/status/[token]/page.tsx` + `app/api/public/status/[token]/route.ts` |
| Roof condition store + surface on Property page | ✅ Built | condition_assessment, nearest_supplier, storm_event stored in roof_reports |
| IEM storm flag (replaces NOAA SWDI) | ✅ Built | FL-WFO mapping by lat/lng; fail-safe on error |
| Inspection date (popup + calendar + lead detail) | ✅ Built | leads.inspection_date (migration v100); calendar indigo events |
| Status email auto-send at Inspection Scheduled | ✅ Built | `app/api/leads/send-status-email/route.ts` + stage trigger |
| Send Status button on lead detail | ✅ Built | replaces Share/Copy button; emails homeowner on demand |
| Payment schedule dynamic on homeowner estimate page | ✅ Built | recalculates 30/40/30 when tier switched |
| Insurance Approved hidden for retail leads on status page | ✅ Built | checks insurance_claim flag via roofing_job_data |
| Calendar includes inspections in value + count | ✅ Built | week/day/month calculations include _type==='inspection' |
| Client upsert at job_won | ✅ Built | safety net in stage route — creates client if client_id null |
| Auto-save estimate total on first open | ✅ Built | useEffect in EstimatePage; fires once if DB total is 0 |
| Send persists total before sending | ✅ Built | send button calls onSave before onSend |
| Invoice copies payment_milestones from estimate | ✅ Built | invoice creation POST includes payment_milestones |

## Built but dormant (code exists, blocked or unwired)

| Feature | Status | Note |
|---|---|---|
| Auto-review request on Job Won | ⏸ Built, dormant | Queues `review_requests`; sends once Twilio 10DLC campaign is approved (under review, 2-3 weeks). |
| "Did you win it?" 5-day SMS loop | ⏸ Built, dormant | Blocked on Twilio 10DLC approval. Cron infra exists. |
| SVG roof diagram in Premium PDF | ⏸ Code exists, unwired | `lib/roofing/roofDiagramSvg.ts` present but not wired into PDF. |
| Stripe plan gating | ⏸ Hardcoded `isPro = true` | Pricing tiers undecided. Wire after pricing + Stripe E2E decision. |

## Architecture debt (logged, deferred)

| Item | Issue | Planned fix |
|---|---|---|
| roofing_job_data vs roof_reports duplication | square_count/pitch/waste_pct stored in both tables. Delete one = orphan data. | roofing_job_data gets `selected_report_id` FK → reads from roof_reports. Sprint 4, post-Stripe/Twilio. |

## Remaining (not in repo)

| Feature | Status | Note |
|---|---|---|
| Supplement Assistant (AI) | ❌ Not built | THE moat. Plain-English → FL supplement draft. Build next. |
| Property smart reminders (12-mo inspection, warranty expiry) | ❌ Not built | Config scaffolding only. |
| Auto-trigger report on lead creation | ❌ Not built | Sprint 4 extra. |
| Insurance field pre-fill from storm flag | ❌ Not built | Requires 2A enrichments. |
| Elevation-API ridge accuracy | ❌ Not built | Optional ~$0.02/property. |
| RentCast enrichment (year built, stories, sq ft) | ❌ Not built | 50 free calls/mo. Sprint 2B. |
| Per-contractor Twilio numbers | ❌ Not built | Phase 2 SMS. Shared number first. |

## Net
Roofing CRM is ~90% of Phase 2. Supplement Assistant is the only unblocked, high-value remaining item. Twilio SMS features unlock when 10DLC campaign is approved (~2-3 weeks).
