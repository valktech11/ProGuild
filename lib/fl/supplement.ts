// FL Supplement Assistant logic. Pure, framework-free, unit-tested.
// Informational only — NOT legal/public-adjuster advice. A supplement is a request
// to the carrier to add scope they omitted or underpaid; final scope is the carrier's call.
//
// The checklist below is the FL-standard set of line items that adjuster scopes on a
// full re-roof routinely OMIT or UNDERPAY. It is the backbone of the AI prompt: Gemini
// is told to scan the pasted scope against these and flag what's missing/short.

export interface FLLineItem {
  key:    string;
  item:   string;          // human label
  code:   string;          // FL code / standard reference
  why:    string;          // one-line justification used in the letter
}

// FL-standard re-roof line items frequently missed/underpaid by carrier scopes.
// Kept conservative and code-anchored — every entry cites a real FL basis.
export const FL_SUPPLEMENT_CHECKLIST: FLLineItem[] = [
  { key: 'drip_edge',    item: 'Drip edge',                            code: 'FBC R905.2.8.5 / §1507.2.9.3', why: 'Required at eaves and rakes (gables) of shingle roofs; must be a separate line item.' },
  { key: 'valley_lining',item: 'Valley lining (metal or approved equivalent)', code: 'FBC R905.2.8.2 / §1507.2.9.2', why: 'Valleys must be lined — open metal, two-ply mineral roll, or D1970 in-lieu; separate LF line, routinely omitted.' },
  { key: 'ice_water',    item: 'Self-adhered underlayment / secondary water barrier', code: 'FBC R905.1.1 / §1507.1.1', why: 'FL adopts no ice barrier (R905.2.7 Reserved); the 8th-edition two-layer self-adhered / secondary water barrier requirement is the recoverable basis, not 15# felt.' },
  { key: 'starter',      item: 'Starter strip (eaves + rakes)',         code: 'Mfr. installation instructions (required per R905.2.4)', why: 'Manufacturer-required material the code mandates be followed; often bundled or omitted.' },
  { key: 'ridge_cap',    item: 'Hip & ridge cap shingles',              code: 'Mfr. spec',              why: 'Distinct material billed per LF; often underpriced or rolled into shingles.' },
  { key: 'underlayment', item: 'Synthetic / second-layer underlayment', code: 'FBC R905.1.1 / §1507.1.1', why: 'FL 8th-edition requires two layers of underlayment for asphalt shingles; low-slope/HVHZ sections require more than standard 15# felt.' },
  { key: 'pipe_boots',   item: 'Pipe boots / vent flashing (replace)',  code: 'FBC R905.2.8 / §1507.2.9', why: 'Full re-roof requires replacement of all flashings, not reuse.' },
  { key: 'step_flashing',item: 'Step / counter flashing',               code: 'FBC R905.2.8 / §1507.2.9', why: 'Must be replaced with the roof system; reuse is non-compliant.' },
  { key: 'permit',       item: 'Roofing permit fee',                    code: 'FL §553.79',             why: 'FL requires a permit for all re-roofs; fee is a recoverable hard cost.' },
  { key: 'disposal',     item: 'Tear-off disposal / dumpster',          code: 'Std. line item',         why: 'Debris removal is a standard separately recoverable line item.' },
  { key: 'oh_profit',    item: 'Overhead & profit (10/10)',             code: 'Industry standard',      why: 'General-contractor O&P is recoverable on complex multi-trade jobs.' },
  { key: 'code_upgrade', item: 'Code-upgrade / law & ordinance',        code: 'FL §627.7011',           why: 'Brings roof to current code; SB 4-D / 25%-rule items belong here.' },
  { key: 'detach_reset', item: 'Detach & reset (solar, satellite, gutters)', code: 'Std. line item',   why: 'Roof-mounted items must be removed and reinstalled; recoverable when present.' },
];

// ── Deterministic LF → supplement-flag grounding ──────────────────────────────
// Maps the lead's HUMAN-traced linear footage (ProMeasure) to the checklist items
// it directly evidences, with the measured quantity attached. Detected-only: a pure
// derivation, no persistence, no autonomous assertion on any carrier-facing surface —
// it surfaces a code-anchored reminder for the ROOFER to confirm against the carrier
// estimate. Eave/rake-driven items (drip edge, starter) are intentionally NOT grounded
// here: the line tool does not yet trace eaves/rakes, so their LF is unknown.

export type SupplementFlagBasis = 'code' | 'standard';

export interface GroundedSupplementFlag {
  key:         string;              // checklist key
  item:        string;              // human label (from checklist)
  code:        string;              // FL citation (from checklist)
  why:         string;              // justification (from checklist)
  measured_lf: number;              // human-traced LF backing this flag
  basis:       SupplementFlagBasis; // 'code' = FBC mandate · 'standard' = mfr/standard supplement
}

export interface MeasuredLinearFootage {
  ridge_ft?:  number | null;
  hip_ft?:    number | null;
  valley_ft?: number | null;
}

const checklistByKey = (key: string): FLLineItem | undefined =>
  FL_SUPPLEMENT_CHECKLIST.find(c => c.key === key);

/**
 * Ground supplement flags from human-traced linear footage.
 * @param lf       measured linear footage (ProMeasure manual lines); DSM/area is NOT used here
 * @param floorLF  noise floor — LF below this is treated as a stray trace and ignored (default 3)
 */
export function groundSupplementFlags(
  lf: MeasuredLinearFootage | null | undefined,
  floorLF = 3,
): GroundedSupplementFlag[] {
  if (!lf) return [];
  const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const valley   = num(lf.valley_ft);
  const ridgeHip = num(lf.ridge_ft) + num(lf.hip_ft);

  const flags: GroundedSupplementFlag[] = [];

  if (valley >= floorLF) {
    const c = checklistByKey('valley_lining');
    if (c) flags.push({ key: c.key, item: c.item, code: c.code, why: c.why, measured_lf: Math.round(valley), basis: 'code' });
  }
  if (ridgeHip >= floorLF) {
    const c = checklistByKey('ridge_cap');
    if (c) flags.push({ key: c.key, item: c.item, code: c.code, why: c.why, measured_lf: Math.round(ridgeHip), basis: 'standard' });
  }

  return flags;
}

export interface SupplementInput {
  scopeText:        string;
  // Lead context (all optional — improves the draft but not required)
  adjusterName?:    string | null;
  insuranceCompany?:string | null;
  claimNumber?:     string | null;
  dateOfLoss?:      string | null;   // YYYY-MM-DD
  roofSquares?:     number | null;
  roofPitch?:       string | null;
  roofInstallDate?: string | null;   // YYYY-MM-DD
  approvedAmount?:  number | null;
  propertyAddress?: string | null;
  proCompany?:      string | null;   // roofer's business name (letter signature)
}

export interface SupplementItem {
  item:                  string;
  reason:                string;   // missing | underpaid + short why
  fl_code:               string;
  suggested_quantity:    string;
  suggested_unit_price:  number;
  suggested_total:       number;
}

export interface SupplementResult {
  missing_items:            SupplementItem[];
  underpaid_items:          SupplementItem[];
  total_supplement_estimate:number;
  supplement_letter:        string;
}

export const SUPPLEMENT_DISCLAIMER =
  'Informational only — not legal or public-adjuster advice. Suggested items and prices are AI-generated; verify line items, quantities, and pricing, and review with a licensed public adjuster or attorney before filing. Final scope is the carrier\u2019s determination.';

/** Build the Gemini prompt. The checklist is injected so the model anchors on FL items. */
/** Prompt 1 of 2: find missing/underpaid items only — no letter, keeps output small. */
export function buildItemsPrompt(input: SupplementInput): string {
  const checklist = FL_SUPPLEMENT_CHECKLIST
    .map(c => `- ${c.item} (${c.code}): ${c.why}`)
    .join('\n');

  const ctx: string[] = [];
  if (input.propertyAddress)  ctx.push(`Property: ${input.propertyAddress}`);
  if (input.insuranceCompany) ctx.push(`Carrier: ${input.insuranceCompany}`);
  if (input.claimNumber)      ctx.push(`Claim #: ${input.claimNumber}`);
  if (input.adjusterName)     ctx.push(`Adjuster: ${input.adjusterName}`);
  if (input.dateOfLoss)       ctx.push(`Date of loss: ${input.dateOfLoss}`);
  if (input.roofSquares)      ctx.push(`Roof size: ${input.roofSquares} squares`);
  if (input.roofPitch)        ctx.push(`Pitch: ${input.roofPitch}`);
  if (input.roofInstallDate)  ctx.push(`Roof built: ${input.roofInstallDate}`);
  if (typeof input.approvedAmount === 'number') ctx.push(`Approved: $${input.approvedAmount}`);
  const context = ctx.length ? ctx.join('\n') : '(none)';

  return `FL roofing supplement specialist. Find line items the adjuster OMITTED or UNDERPAID vs FL code.

CONTEXT: ${context}

CHECKLIST (flag only if missing or underpriced in the scope below):
${checklist}

ADJUSTER SCOPE:
${input.scopeText}

Rules: only flag items justifiable from the scope. Do NOT invent damage. Keep reason to 1 sentence. Use realistic FL 2026 unit prices.

Return ONLY this JSON (no markdown, no extra text):
{"missing_items":[{"item":"","reason":"","fl_code":"","suggested_quantity":"","suggested_unit_price":0,"suggested_total":0}],"underpaid_items":[{"item":"","reason":"","fl_code":"","suggested_quantity":"","suggested_unit_price":0,"suggested_total":0}],"total_supplement_estimate":0}`;
}

/** Prompt 2 of 2: draft the supplement letter given the items already found. */
export function buildLetterPrompt(input: SupplementInput, items: Array<{item:string;reason:string;fl_code:string;suggested_quantity:string;suggested_total:number}>): string {
  const adjuster  = input.adjusterName || null;
  const company   = input.proCompany || null;
  const carrier   = input.insuranceCompany || null;
  const claimNo   = input.claimNumber || null;
  const property  = input.propertyAddress || null;
  const today     = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const itemList  = items.map(i => `- ${i.item} (${i.fl_code}): ${i.suggested_quantity}, $${i.suggested_total} — ${i.reason}`).join('\n');

  // Build the known facts; the prompt forbids inventing placeholders for anything missing.
  const facts: string[] = [`Date: ${today}`];
  if (adjuster) facts.push(`Adjuster name: ${adjuster}`);
  if (carrier)  facts.push(`Insurance carrier: ${carrier}`);
  if (claimNo)  facts.push(`Claim number: ${claimNo}`);
  if (property) facts.push(`Property address: ${property}`);
  if (company)  facts.push(`Contractor (signs the letter): ${company}`);

  return `Write a professional roofing insurance supplement request letter as plain text.

KNOWN FACTS (use these exact values — do NOT invent or bracket-placeholder any of them):
${facts.join('\n')}

ITEMS to request (omitted or underpaid vs FL code / standard re-roof practice):
${itemList}

STRICT RULES:
- Do NOT use ANY bracketed placeholders like [Date], [Your Company], [Adjuster's Title], [Address], etc. If a detail is not in the KNOWN FACTS above, simply omit that line entirely — never write a blank or a placeholder.
- Use the date, carrier, claim number, property, and contractor name from KNOWN FACTS directly.
- Open the date line with the date provided. Address it to the adjuster${adjuster ? '' : ' generically as "Dear Insurance Adjuster"'}.
- Reference the claim number and property in the subject/opening.
- Body: 3-4 short paragraphs — (1) introduce the supplement request, (2) the itemized list with FL code basis, (3) request prompt review and offer documentation, (4) brief closing.
- Sign off with "Sincerely," then the contractor name${company ? '' : ' (or "The Contractor" if none)'} on the next line. Do not add title/phone/email placeholder lines.
- Factual, non-adversarial tone. Plain text only — no markdown, no letterhead block, no bracketed fields.`;
}

// Keep buildSupplementPrompt as an alias so existing tests still pass
/** @deprecated Use buildItemsPrompt + buildLetterPrompt instead */
export function buildSupplementPrompt(input: SupplementInput): string {
  return buildItemsPrompt(input);
}

/** Coerce a raw value to a finite number, else 0. */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function coerceItem(raw: any): SupplementItem {
  return {
    item:                 String(raw?.item ?? '').trim(),
    reason:               String(raw?.reason ?? '').trim(),
    fl_code:              String(raw?.fl_code ?? '').trim(),
    suggested_quantity:   String(raw?.suggested_quantity ?? '').trim(),
    suggested_unit_price: num(raw?.suggested_unit_price),
    suggested_total:      num(raw?.suggested_total),
  };
}

/**
 * Parse + validate Gemini's JSON response into a SupplementResult.
 * Tolerant of markdown fences and missing keys. Recomputes the total from items
 * so a model arithmetic slip can't show a wrong headline number.
 * @throws if no JSON object can be recovered at all.
 */
export function parseSupplementResponse(raw: string): SupplementResult {
  if (!raw || !raw.trim()) throw new Error('Empty supplement response');
  // Strip ```json fences if present, then grab the outermost {...}.
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in supplement response');
  const obj = JSON.parse(cleaned.slice(start, end + 1));

  const missing   = Array.isArray(obj.missing_items)   ? obj.missing_items.map(coerceItem).filter((i: SupplementItem) => i.item)   : [];
  const underpaid = Array.isArray(obj.underpaid_items) ? obj.underpaid_items.map(coerceItem).filter((i: SupplementItem) => i.item) : [];

  // Authoritative total = sum of item totals (don't trust the model's arithmetic).
  const computed = [...missing, ...underpaid].reduce((s, i) => s + i.suggested_total, 0);
  const total = computed > 0 ? computed : num(obj.total_supplement_estimate);

  return {
    missing_items:             missing,
    underpaid_items:           underpaid,
    total_supplement_estimate: Math.round(total * 100) / 100,
    supplement_letter:         String(obj.supplement_letter ?? '').trim(),
  };
}
