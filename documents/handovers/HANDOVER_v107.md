# ProGuild — Session Handover v107 (June 7, 2026)

*Continuation of v106. Pick up with this file + Bible v6.0 + Roofing Master Plan.*

---

## 1. What This Session Did (continuation of v106)

### IEM Storm Flag — Now Fully Working ✅

The storm flag feature (hail/wind event detected near property → amber banner on property page + red box in PDF) is now end-to-end verified on staging.

**Root causes fixed:**

| Issue | Fix | Commit |
|---|---|---|
| IEM returned 422 | `fmt=geojson` removed from IEM API — only accepts `csv/kml/excel/shp` now | `6a2ef1b` |
| `isoZ` truncated at seconds | `.slice(0,16)` → `.slice(0,19)` — IEM requires full `YYYY-MM-DDTHH:MM:SSZ` | `b6d19f8` |
| CSV column mismatch | Header is `LAT/LON/MAG/STATE/VALID` not `legacy_lat` etc. `VALID` format is `202406192100` not ISO | `39f587e` |
| Threshold too high for FL | 1.0" (severe/tornado alley standard) → 0.75" (penny size, FL insurance standard) | `7f91f16` |
| PDF copy wrong | Said "exceeds 1.0" threshold" after lowering to 0.75". Updated to carrier-verify language. | `1f0366d` |

**Verified working:**
- Property page: amber banner "Hail 0.75" · 2026-05-02 · 5.8 mi away — may pre-qualify a claim" ✓
- PDF: red HAIL EVENT DETECTED box with date, size, distance ✓
- Test address: 1325 Newport Ridge Ln, Brandon FL 33511 (WFO TBW, Hillsborough County)

**Debug routes:** Added and removed cleanly (`debug-storm` route). No debug code in production.

### gemini-poly JSON parse warning (non-fatal, understood)
`[gemini-poly] JSON parse failed` appears in every report log. This is expected — Gemini truncates the polygon JSON mid-response when there are many facets. The SVG roof diagram feature (`lib/roofing/roofDiagramSvg.ts`) is built but not wired into the PDF anyway (Sprint 4). Safe to ignore.

---

## 2. Full Commit List This Session (v106 + v107)

| Commit | Description |
|---|---|
| `ac25f9d` | fix(leads PATCH): return full lead+roofing_job_data — Step 1 ticks without refresh |
| `b661f8f` | fix(estimate): always persist computed total before sending |
| `c884a22` | fix(estimate tab): use invoice balance_due as fallback when total is 0 |
| `e6c9061` | fix(invoice): copy payment_milestones from estimate on creation |
| `0320344` | fix(estimate): auto-save total on first open when DB total is 0 |
| `67fa451` | fix(measurement): step2Running only true when DSM actually running |
| `a145505` | fix(estimate public): payment schedule recomputes dynamically on tier switch |
| `a4b47bc` | fix(status page): hide Insurance Approved for retail leads |
| `a63ec5c` | fix(calendar): inspections in value+count; status page Call+Email buttons |
| `599db5d` | feat(status email): auto-send at inspection_scheduled; Share→Send Status |
| `592eb37` | feat(clients): upsert client at job_won safety net |
| `0187833` | fix(legal): privacy SMS section, Univaro removed; terms contact email |
| `6a2ef1b` | fix(storm): IEM csv-only — geojson removed from API |
| `b6d19f8` | fix(storm): isoZ include seconds |
| `39f587e` | fix(storm): CSV column names, VALID date format, mag=None guard |
| `7f91f16` | fix(storm): lower threshold 1.0"→0.75" for FL |
| `1f0366d` | fix(pdf): update storm copy, remove 1.0" reference |

---

## 3. Current State — What Is Verified Working

- Full roofing CRM pipeline: Lead → Inspection → Proposal → Sign → Invoice → Job Won
- Measurement chain: Satellite (step 1 auto-tick) → DSM (step 2 explicit) → Calculator → Estimate
- Estimate flow: auto-save total on open, save before send, correct total in DB always
- Invoice: payment milestones copied from estimate, Make a Payment section works
- IEM storm flag: working, verified, 0.75" threshold, amber banner + PDF red box
- Homeowner status page: tokenized, live-updating, Call+Email buttons, Insurance Approved hidden for retail
- Status email: auto at inspection_scheduled, manual Send Status button
- Calendar: inspections included in value+count
- Clients: auto-upsert at job_won
- Privacy/Terms: live at proguild.ai/privacy and proguild.ai/terms

---

## 4. Immediate Next Actions

1. **Supplement Assistant AI** — the moat. Plain-English → FL supplement draft. This is next.
2. **Twilio campaign approval** — check console in 2-3 weeks. When approved: buy 904 number, add TWILIO_* to Vercel env, wire SMS send route.
3. **Pricing decision** — talk to 5-10 FL roofers before locking tiers.
4. **roofing_job_data → selected_report_id refactor** — Sprint 4 debt.
5. **GitHub PAT** — rotate it. Was used in this session.

---

## 5. Architecture Debt (unchanged from v106)

| Item | Issue | Fix |
|---|---|---|
| roofing_job_data vs roof_reports | square_count/pitch/waste_pct duplicated in both | selected_report_id FK, Sprint 4 |
| gemini-poly truncation | Gemini hits output limit mid-polygon JSON | Increase max_tokens or simplify polygon request, Sprint 4 |

---

## 6. Twilio Status

- Campaign SID: `CMe6f79e5cf51d25001b04a0d45ee40312` — under review, 2-3 weeks
- Brand: `B1RJVYZ` — approved
- Phone number: NOT purchased. Buy 904 area code after campaign approved.
- isPro = true hardcoded everywhere until Stripe pricing decided.
