# ProGuild Design Tokens — Reference & Law

**Source of truth:** `lib/tokens.ts`. It already exists and already encodes the
system. This doc is the human-readable map + the enforcement rule. The job of the
2026-06 design pass is **not** to author a new system — it is to (a) route raw
inline hex through these tokens, and (b) close the 2 gaps named at the bottom.

## The one rule
No hardcoded px font sizes, colours, radii, or shadows in screen code. Everything
flows from `T` (geometry/type), `theme(dk)` (surfaces/text), `BRAND` (semantic
colour). Raw hex in a screen is a bug to be migrated, not a style choice.

## Type scale (`T.font*`) — 9 slots, nothing between
| Token | px | Use |
|---|---|---|
| fontBadge | 11 | status chips, timestamps, uppercase micro-labels |
| fontSub | 12 | secondary descriptions, hints, metadata |
| fontBody | 14 | primary body, card content, list items |
| fontEmphasis | 15 | input text, button labels |
| fontLabel | 16 | section labels, card titles, form labels |
| fontHeading | 18 | section headers |
| fontTitle | 24 | page h1 |
| fontStat | 32 | big numbers in stat cards |
| fontStatLg | 40 | hero numbers (the ONE dominant number per screen) |

Mobile: use the `*Mobile` variants (−1 to −2px). Eliminate sub-12px body text —
it is the #1 "dull/tiring" signal flagged in review.

## Radii (`T.rad*`) — 5 values, nothing between
radXs 6 (inline badges) · radSm 8 (buttons, inputs) · radMd 12 (cards, modals,
inner panels) · radLg 16 (large/section cards) · radXl 20 (page hero containers).
The current screens use 8–10 distinct radii — that inconsistency is the #1
"looks broken" signal. Snap every value to one of these 5.

## Spacing (`T.sp*`) — 8-point grid
sp1 4 · sp2 8 · sp3 12 · sp4 16 · sp5 20 · sp6 24 · sp8 32 · sp10 40.
No 17/21/27px. Section separation = sp6/sp8; card padding = sp5/sp6.

## Colour
Brand: `BRAND.teal` #0F766E (primary, dominant). Semantic ONLY beyond that:
`BRAND.success` #15803D, `BRAND.warning` #B45309, `BRAND.danger` #DC2626,
`BRAND.info` #2563EB. Surfaces/text via `theme(dk)`: cardBg, cardBgAlt,
cardBorder, textPri/textBody/textMuted/textSubtle. **Remove the stray indigo
`#4F46E5`** (Insights accent) and collapse the three greens to `BRAND.success`.

## Icons (`T.icon*`)
iconXs 14 (inline) · iconSm 16 · iconMd 18 (card headers) · iconLg 22 ·
iconXl 28 (hero metrics). 1.5–2px stroke, rounded, no fills except success/error
badges. One icon language.

## v3 mockup → token mapping (build target)
- Hero number `43.4 SQ` → `T.fontStatLg` (40), `BRAND.teal`/`textPri`.
- Card titles ("YOUR ROOF", "Insurance Claim") → `T.fontLabel` uppercase.
- Card containers → `T.radLg`, resting shadow (gap #2), `T.sp6` padding.
- LF / financial-summary rows → embedded cards, `T.radMd`, `cardBgAlt`, no shadow.
- Proposal Summary (dark card) → `BRAND.teal` bg, total `T.fontStatLg`, white text.
- Gap number → `BRAND.warning`, `T.fontStat`. Copy unchanged (compliance).

## Card hierarchy (from review — make explicit)
- **Hero** (Roof Measurements, Proposal Summary, Insurance Claim): `T.sp6`
  padding, raised shadow, dominant number.
- **Standard** (Contact, Activity, Photos, Supplement): `T.sp5` padding, resting
  shadow.
- **Embedded** (measurement rows, financial summaries, payment schedule): no
  shadow, `cardBgAlt` soft background, `T.radMd`.

## Gaps to close (NOT yet in lib/tokens.ts — add when we hit them)
1. **Fixed control height.** Buttons/inputs currently use ad-hoc padding
   (`7px 14px`, `9px 11px`) → varied heights. Add `T.ctrlH = 44` (+ `ctrlHSm = 36`)
   and migrate inputs/buttons to it. One height everywhere.
2. **Shadow tokens.** Shadows are inline (`0 2px 8px rgba(...)`). Add exactly two:
   `T.shadowCard` (resting) and `T.shadowRaised` (hero/hover). Nothing else.

Patterns to standardise as we build (document here as they land): hero-metric
block, verb workflow checklist, intentional empty states (every card gets one —
"No photos yet → Add Photos", "Insurance not started → Create Claim", etc.).
