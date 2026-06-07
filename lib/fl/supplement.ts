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
  { key: 'drip_edge',        item: 'Drip edge',                  code: 'FBC §1507.2.8.3',   why: 'Drip edge is required at eaves and rakes on asphalt-shingle roofs by the 2020 Florida Building Code; full re-roofs must include it as a separate line item.' },
  { key: 'ice_water',        item: 'Ice & water shield / underlayment upgrade', code: 'FBC §1507.1.1 / §R905', why: 'FL high-wind underlayment and secondary water barrier requirements often exceed the felt the adjuster scoped; the code-compliant underlayment is a recoverable upgrade.' },
  { key: 'starter',          item: 'Starter strip (eaves + rakes)', code: 'Mfr. spec / FBC §1507.2.7', why: 'Manufacturer-required starter course is a separate material from field shingles and is commonly bundled into shingle cost or omitted.' },
  { key: 'ridge_cap',        item: 'Hip & ridge cap shingles',   code: 'Mfr. spec',          why: 'Ridge/hip cap is a distinct material billed per linear foot and is frequently underpriced or scoped as field shingles.' },
  { key: 'underlayment',     item: 'Synthetic / second-layer underlayment', code: 'FBC §1507.1.1', why: 'Low-slope sections and FL HVHZ areas require specific underlayment that the scoped 15# felt does not satisfy.' },
  { key: 'pipe_boots',       item: 'Pipe boots / vent flashing (replace)', code: 'FBC §1507.2.9', why: 'On a full re-roof, flashings must be replaced, not reused; replacement boots and vents are recoverable.' },
  { key: 'step_flashing',    item: 'Step / counter flashing',    code: 'FBC §1507.2.9',     why: 'Wall and chimney flashing must be replaced with the roof system; reuse is not code-compliant.' },
  { key: 'permit',           item: 'Roofing permit fee',         code: 'FL §553.79 / local', why: 'FL requires a permit for re-roofs; the permit fee is a hard cost the carrier owes on the approved scope.' },
  { key: 'disposal',         item: 'Tear-off disposal / dumpster', code: 'Std. line item',   why: 'Debris removal and dumpster haul-off is a standard, separately recoverable line on a tear-off.' },
  { key: 'oh_profit',        item: 'Overhead & profit (10/10)',  code: 'Industry standard',  why: 'When the job involves three or more trades or is reasonably complex, general-contractor O&P (10% + 10%) is recoverable in FL.' },
  { key: 'code_upgrade',     item: 'Code-upgrade / law & ordinance', code: 'FL §627.7011',   why: 'FL law-and-ordinance coverage funds bringing the roof to current code; SB 4-D / 25%-rule items belong here.' },
  { key: 'detach_reset',     item: 'Detach & reset (solar, satellite, gutters)', code: 'Std. line item', why: 'Roof-mounted items must be removed and reinstalled; detach-and-reset labor is recoverable when present.' },
];

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
export function buildSupplementPrompt(input: SupplementInput): string {
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
  if (input.roofInstallDate)  ctx.push(`Roof built / last reroof: ${input.roofInstallDate}`);
  if (typeof input.approvedAmount === 'number') ctx.push(`Adjuster approved amount: $${input.approvedAmount}`);
  const context = ctx.length ? ctx.join('\n') : '(no additional claim context provided)';

  const salutation = input.adjusterName ? `Dear ${input.adjusterName}` : 'Dear Insurance Adjuster';
  const signature  = input.proCompany || 'the contractor';

  return `You are a Florida roofing insurance-supplement specialist. A contractor has pasted an insurance adjuster's SCOPE OF LOSS for a full residential re-roof. Your job is to find line items the adjuster OMITTED or UNDERPAID versus Florida code and standard re-roof practice, then draft a professional supplement request letter.

CLAIM CONTEXT:
${context}

FLORIDA STANDARD RE-ROOF LINE ITEMS commonly missed or underpaid (use as your checklist — only flag an item if the scope actually lacks it or prices it below FL norms):
${checklist}

ADJUSTER SCOPE OF LOSS (verbatim, pasted by the contractor):
"""
${input.scopeText}
"""

INSTRUCTIONS:
1. Read the scope. For each checklist item, decide: present & fairly priced (ignore), MISSING (not in scope at all), or UNDERPAID (present but priced below FL norms or wrong quantity).
2. Only include items you can justify from the scope + context. Do NOT invent damage. If the scope is thorough, return few or no items — that is a valid, honest answer.
3. For quantities, use the provided roof size/pitch when relevant; otherwise give a clearly-estimated placeholder and note it. Use realistic FL 2026 unit prices.
4. Write a concise, professional supplement letter addressed "${salutation}", referencing the claim number if provided, listing the requested additions with their FL-code basis, and signed by "${signature}". Keep it factual and non-adversarial.

Return ONLY a JSON object (no markdown, no preamble) with exactly these keys:
{
  "missing_items": [ { "item": string, "reason": string, "fl_code": string, "suggested_quantity": string, "suggested_unit_price": number, "suggested_total": number } ],
  "underpaid_items": [ { "item": string, "reason": string, "fl_code": string, "suggested_quantity": string, "suggested_unit_price": number, "suggested_total": number } ],
  "total_supplement_estimate": number,
  "supplement_letter": string
}`;
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
