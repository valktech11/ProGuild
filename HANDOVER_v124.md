# HANDOVER v124 — Roof Visualizer Build
**Session:** July 17–18, 2026
**Staging HEAD:** `ba33a09` · client marker `verify-v28`
**Docs:** Founders Bible v7.11 (§40 added) · Ecosystem Roadmap V5.15 (§25 added)
**Prod:** untouched. Cutover GO gate still held.

---

## 1. What this session produced

A working, staging-deployed Roof Visualizer at `/roof-visualizer`. Public, no signup, 3 free renders. Upload a house photo → confirm the roof by tapping → compare up to 3 real shingle colours side by side → download or share with a homeowner.

Built from nothing to validated in one session: **35 commits**, 4 DB migrations, ~$0.60 of API spend, 15/15 catalogue SKUs verified, 3/5 battery photos passed.

The architecture is **not** what was planned in Bible §39. Two major reversals happened during the build and both are now settled:

1. **Generative AI rendering was rejected.** It cannot preserve the house.
2. **Automatic roof detection was deleted.** It cannot be made reliable with heuristics.

What ships is classical image compositing over a human-confirmed mask, with AI as an optional enhancement that must pass a quality gate to be served.

---

## 2. Architecture (as built)

```
Upload → preview → "Analyze My Roof"
  → SAM2 (Replicate) → ~150 masks
  → decode ALL → candidate index grids (full-res to R2, ~768px to client)
  → CONFIRM SCREEN: nothing preselected; user taps/sweeps roof planes
     (tap-to-trace flood fill where SAM2 has no candidate)
  → confirm-mask: union + vegetation/sky veto + morphological closing
  → RENDER:
       classical recolour (always, guaranteed floor)
       ∥ AI attempt (chromatic chips only, 55s cap)
       → two-sided arbitration gate
       → pixel-guarantee composite
  → R2 → results (lightbox, download, share)
```

### Layer detail

| Layer | Implementation | Key constraint |
|---|---|---|
| Segmentation | `meta/sam-2` on Replicate, `points_per_side=32`, `pred_iou_thresh=0.7`, `stability_score_thresh=0.85` | Photo normalised to ≤2000px JPEG first (SAM2 rejects AVIF/WEBP/HEIC); sent as base64 data URI, **not** a URL |
| Candidates | Decode **all** masks (128 ceiling, batches of 16) at ~768px; keep 0.08%–60% area, cap 60 | SAM2 orders by **stability, not size** — never cap blindly |
| Index grids | Smallest-mask-wins per pixel; full-res → R2, grid-res → inline base64 | Smallest-wins means a tap selects a *plane*, never a super-mask |
| Selection | **Nothing preselected.** Tap, or press-and-drag to sweep. `Uint8Array` hit-test + 8px radial snap. Undo (20 steps) | Sweep only **adds** (toggling mid-drag is unpredictable) |
| Trace fallback | Client flood fill, colour distance 45, running average, 0.3%–30% guards, morphological close ×2 | Only spreads into **unowned** pixels — hence the low area floor |
| Confirm | Union → veg/sky pixel veto → dilate ~2px → erode ~1px → 0.8px feather | Destroy-guard: revert if morphology drops >50% of mask |
| Classical render | `out = chip + (lum − roofMean) × 0.55` + granule jitter (±9 lum, ±4 hue, 2×2 cells) | Mid-tone roof = **exactly** the chip hex, by construction |
| Blend SKUs | 2–3 granule tones mixed per cell | A single hex cannot represent a granule blend |
| AI attempt | `gemini-3.1-flash-image`, temp 0.35, **chromatic chips only** | Neutral chips (chroma ≤12) skip AI entirely — classical is exact |
| Arbitration | Serve AI iff `nonRoofMAE ≤ 18` **AND** `roofMAE ≥ floor` (12 / 16 blends / 20 pale) | One-sided gate rewarded lazy photocopies |
| Pixel guarantee | Original photo outside the mask, byte-for-byte, always | Enforced in code, not by prompt |

### Tuning constants (single reference)

```
SAM2:        points_per_side 32 · pred_iou 0.7 · stability 0.85 · max 128 masks
Candidates:  min area 0.0008 (0.08%) · max area 0.6 · cap 60
Grid:        max dim 768 · photo max dim 2000
Trace:       colour distance 45 · min 0.3% · max 30% · close ×2
Veto:        ExG (2G−R−B) > 40 · ExB (2B−R−G) > 50
Morphology:  dilate blur 1.2 / thr 10 · erode blur 0.8 / thr 235 · feather 0.8
Classical:   shading K 0.55 · lum jitter ±9 · hue jitter ±4 · cell 2×2
Neutral:     chroma (max−min RGB) ≤ 12 → classical only
Gate:        nonRoofMAE ≤ 18 · roofMAE ≥ 12 (16 blend, 20 if chipLum > 160)
Palette:     granule luminance spread 2–14 · brown-family B/R ≥ 0.52
```

---

## 3. Files

**Routes**
- `app/api/roof-visualizer/segment/route.ts` — SAM2, candidate decode, index grids
- `app/api/roof-visualizer/confirm-mask/route.ts` — union, veto, morphology, final mask
- `app/api/roof-visualizer/render/route.ts` — classical + AI + arbitration + guarantee
- `app/api/roof-visualizer/session/route.ts` — gate linkage, share token, homeowner pick
- `app/api/roof-visualizer/download/route.ts` — CORS-free download proxy

**Pages**
- `app/roof-visualizer/page.tsx` — SEO metadata, SKU catalogue load
- `app/roof-visualizer/client.tsx` — the whole UX (~940 lines)
- `app/r/[token]/page.tsx` — homeowner share page

**Test**
- `scripts/visualizer-regression.mjs` — `npm run test:visualizer`, 54 invariants

---

## 4. Database (staging only — prod untouched)

| Migration | Contents |
|---|---|
| v118 | `viz_manufacturers` (5), `viz_product_lines` (5), `viz_skus` (15), `visualizer_sessions`, `visualizer_renders`, `visualizer_shares` |
| v119 | `visualizer_sessions.selection_meta` jsonb — candidates, selection, corrections, timing |
| v120 | `viz_skus.hex_granule_2` / `hex_granule_3` (nullable) |
| v121 | Granule palette calibration; Barkwood base corrected out of olive |

`selection_meta` is deliberate: every correction a user makes is labelled training data toward eventually restoring automatic preselection with a model trained on real usage.

---

## 5. Environment

```
REPLICATE_API_TOKEN     Replicate (SAM2) — prepaid credit, hard stop at zero
GEMINI_API_KEY          Gemini image + text
R2_PUBLIC_BUCKET_URL    note: lib/r2.ts accepts R2_PUBLIC_URL or R2_PUBLIC_BUCKET_URL
R2_BUCKET_NAME, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
```

Vercel: these must be scoped to **Preview** for staging, not only Production. Env var changes require a redeploy.

---

## 6. Testing status

### Catalogue — 15/15 verified
All SKUs rendered and visually reviewed on at least one house. Solid greys/blacks are the strongest results (IKO Cambridge is the best render of the build). Blends required v120/v121 before they were correct.

### Photo battery — 3/5 passed

| # | Photo | Result |
|---|---|---|
| 1 | AI test house (bright, straight-on, mid-grey roof) | ✅ pass |
| 2 | Dark charcoal roof, cream siding, daylight | ✅ pass — light-on-dark shading verified |
| 3 | Heavy tree occlusion, red brick, grey roof | ✅ pass — no bleed onto brick or foliage |
| 4 | **Three-quarter angled shot** | ❌ **not run** |
| 5 | **Low roof/wall contrast (monochrome house)** | ❌ **not run** |

**Pass criteria:** correct house · roof fully selectable in ≤4 taps · nothing non-roof painted · colour visibly and correctly applied · download works.

### Remaining test work (next session)

1. **Battery photo 4 — angled/three-quarter view.** Tests geometry the pipeline has never seen. Generate with: *"photorealistic single-story American ranch house photographed from a three-quarter angle so both the front facade and one side are visible in perspective, weathered brown asphalt shingle roof with a visible ridge line, light tan stucco, bright afternoon sun, real estate listing photography, 4:3 landscape."*
2. **Battery photo 5 — low roof/wall contrast.** The hardest case; SAM2 is expected to merge walls and roof into one mask, forcing tap-to-trace. Generate with: *"photorealistic two-story house, straight-on, where the roof shingles and wall siding are very similar medium warm grey-beige with only a subtle shadow line under the eaves separating them, simple gable roof, minimal trim, bright daylight, 4:3 landscape."*
3. **Share flow end to end** — `/r/[token]` has never been tested: create link → open as homeowner → pick a colour → verify `visualizer_shares.chosen_sku_id` is written.
4. **Gate behaviour** — the 3-free-render limit and email capture path are untested.
5. **Mobile** — the entire confirm UX (tap, sweep, undo) has only been tested with a mouse. Sweep uses pointer events and should work, but touch behaviour and the overlay's readability on a phone are unverified.
6. **Sweep gesture** — press-and-drag multi-plane selection was implemented but never confirmed working by a user test.

---

## 7. Known limitations (documented, not defects)

- **SAM2 cannot split same-coloured surfaces.** A uniformly painted house may return walls+roof as one mask. Fallback: tap-to-trace. No parameter fixes this — the edge isn't in the image.
- **Overhanging foliage can merge tree and roof into one candidate.** Selection becomes all-or-nothing; correct action is to exclude that plane. Observed cost in renders: none (the foliage hides the gap).
- **Vegetation veto (ExG) is unreliable on shaded, backlit or autumn foliage.** Works well in direct sun. It's a backstop; the human confirm step is the real defence.
- **Teal overlay is hard to read on very dark roofs in low light** (dusk photography). Daylight dark roofs are fine.
- **Analysis takes 30–60s.** Reviewer target is <10s. Highest-value performance work remaining.
- **Catalogue colours are calibrated approximations.** No manufacturer publishes hex values; GAF explicitly disclaims digital colour reproduction. The UI says so. True calibration = photograph physical sample boards under neutral light.
- **Catalogue redundancy:** Georgetown Gray vs Estate Gray differ by 3 luminance points. Real product similarity, not a defect — but default SKU picks should span the colour space.

---

## 8. Standing engineering rules learned here

1. **`sharp` `blur()` on a 1-channel raw buffer silently returns 3 channels.** Always `extractChannel(0)` after blur on mask work. This shipped all-black masks; the tell was `roofMAE=0.0` across every SKU.
2. **`sharp` `greyscale().tint()` silently outputs 1 channel** — the tint is discarded. Build recolour layers by explicit raw RGBA construction.
3. **Never place size-blind caps on an unordered upstream source.** SAM2 orders by stability, not size. This bug recurred four times (24 → 48 → 128 → offered-set 12) before all masks were decoded.
4. **Verify every AI-emitted model name, endpoint, code or figure against a live source.** Gemini recommended a Vertex Imagen endpoint that had been shut down for weeks, with the wrong `editMode` constant.
5. **Verify the deployed bundle before judging a UI test.** `CLIENT_BUILD` console marker + hard refresh. Stale bundles caused multiple phantom "tap not working" cycles.
6. **Never edit large source files with Python string slicing.** A slice whose anchors don't match returns `""`, and `str.replace("")` inserts at every character offset — this exploded `client.tsx` to 1,034,205 lines and broke a Vercel deploy. Use anchored replacements with `assert count == 1` plus a line-count sanity check.
7. **Run `next build` before pushing changes to a large client component.** `tsc` did not catch the file explosion; the build did.
8. **A silent `catch` on a user-facing action is a defect.** The Save button failed for days because a cross-origin `fetch` threw into an empty catch.
9. **Elimination-based classification always regresses.** Computing "this is NOT X" means removing a candidate promotes the next-worst. If a filter chain needs a fourth patch, the design is wrong.

---

## 9. Pre-push gates (visualizer changes)

```bash
npx tsc --noEmit                  # clean on visualizer files
npm run test:visualizer           # 54 invariants
npx next build                    # catches what tsc doesn't
```
Plus: bump `CLIENT_BUILD` in `client.tsx` so the next test can verify the deployed bundle.

---

## 10. Next work, prioritised

| # | Item | Why |
|---|---|---|
| 1 | **Share notification** (`session/route.ts` TODO) | Page is built; wiring Resend closes the loop and creates the viral mechanic. Half a day. |
| 2 | **Finish battery** (photos 4 & 5) | Last unknown in selection generalisation. |
| 3 | **PDF export** | The artifact a roofer leaves with a homeowner. PDF generation already exists for estimates. |
| 4 | **Speed** (30–60s → <10s) | Changes how the tool feels in a driveway. Bottleneck is SAM2 density + mask decode. |
| 5 | **Mobile test pass** | Confirm UX is desktop-verified only. |
| 6 | **Proposal integration** | Visualisation → estimate → proposal → signature. The moat; competitors can't copy it. |
| 7 | ~~More manufacturers~~ | **Deferred deliberately** — every added SKU is another approximated colour. Physical calibration first. |

---

## 11. Unchanged from v123

- **Prod cutover** (phases B–E) still pending, GO gate held. Visualizer tables v118–v121 are additive and join the deferred migration list for the single consolidated run.
- **GitHub PAT rotation** — still overdue, pasted in plain text again this session. Treat as compromised.
- Supplement corpus Phase 2, carrier-side validation gap (Heath McDermott), mobile v23 build — all unchanged.
