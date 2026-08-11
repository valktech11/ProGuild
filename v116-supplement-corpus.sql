-- v116 — FL Supplement Corpus (Phase A/B reference tables)
-- Human-curated line-item library validated by:
--   Muaz Khan (contractor-side Xactimate estimator)
--   Elias Franco, FL PA Lic. W913762 (PA validation, June 2026)
-- Carrier patterns: is_provisional=true (carrier-side validation incomplete)
-- Xactimate codes: is_verified=false (FL8X price list verification pending)
-- Idempotent. Staging only until codes verified.

-- ── 1. Line items ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplement_line_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text NOT NULL UNIQUE,           -- stable slug (e.g. 'drip_edge')
  name             text NOT NULL,
  category         text NOT NULL CHECK (category IN ('code_based','condition_based')),
  is_deterministic boolean NOT NULL DEFAULT false, -- true = safe to encode as authoritative
  is_condition_based boolean NOT NULL DEFAULT false, -- drives photo-upload UI flow
  phase            smallint NOT NULL DEFAULT 1,    -- 1 = current corpus, 2 = future items
  sort_order       smallint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Arguments (5-layer hierarchy per item) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS supplement_arguments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id   uuid NOT NULL REFERENCES supplement_line_items(id) ON DELETE CASCADE,
  layer          text NOT NULL CHECK (layer IN (
                   'policy','manufacturer','code','field_doc','oneclickcode'
                 )),
  layer_order    smallint NOT NULL DEFAULT 0,      -- 1=policy,2=mfr,3=code,4=field,5=oneclickcode
  argument_text  text NOT NULL,
  sub_type       text,                             -- e.g. 'irc_standard','fbc_swb' for underlayment split
  source         text NOT NULL DEFAULT 'muaz',     -- muaz | elias_validated
  is_provisional boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Carrier patterns ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplement_carrier_patterns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id     uuid NOT NULL REFERENCES supplement_line_items(id) ON DELETE CASCADE,
  carrier_name     text NOT NULL,
  denial_pattern   text NOT NULL,
  rebuttal_strategy text NOT NULL,
  escalation_round smallint,                       -- null=round1, 2=second denial, 3=supervisor
  source           text NOT NULL DEFAULT 'muaz',
  is_provisional   boolean NOT NULL DEFAULT true,  -- ALL provisional — carrier-side validation incomplete
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Xactimate codes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplement_xactimate_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id     uuid NOT NULL REFERENCES supplement_line_items(id) ON DELETE CASCADE,
  code             text NOT NULL,
  description      text NOT NULL,
  unit             text NOT NULL,                  -- 'lf','sf','sq','pct_adder','ea'
  regional_prefixes jsonb NOT NULL DEFAULT '[]',   -- [{region,state,prefix}]
  is_verified      boolean NOT NULL DEFAULT false, -- false until FL8X price list confirmed
  verification_notes text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── 5. Evidence requirements ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplement_evidence_requirements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_id   uuid NOT NULL REFERENCES supplement_line_items(id) ON DELETE CASCADE,
  evidence_type  text NOT NULL CHECK (evidence_type IN (
                   'photo','video','oneclickcode','manufacturer_doc',
                   'aerial_report','policy_doc','permit','scope_note'
                 )),
  description    text NOT NULL,
  is_required    boolean NOT NULL DEFAULT true,
  sort_order     smallint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_supp_args_item       ON supplement_arguments (line_item_id, layer_order);
CREATE INDEX IF NOT EXISTS idx_supp_carrier_item    ON supplement_carrier_patterns (line_item_id);
CREATE INDEX IF NOT EXISTS idx_supp_codes_item      ON supplement_xactimate_codes (line_item_id);
CREATE INDEX IF NOT EXISTS idx_supp_evidence_item   ON supplement_evidence_requirements (line_item_id, sort_order);

-- ══════════════════════════════════════════════════════════════════════════════
-- SEED DATA — 7 validated line items
-- Source: ProGuild_FL_Supplement_Corpus_v1.docx (Muaz + Elias validated)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Line items ────────────────────────────────────────────────────────────────
INSERT INTO supplement_line_items (key, name, category, is_deterministic, is_condition_based, phase, sort_order) VALUES
  ('drip_edge',       'Drip Edge',                              'code_based',      false, false, 1, 1),
  ('starter_strip',   'Starter Strip',                          'code_based',      true,  false, 1, 2),
  ('underlayment',    'Underlayment / Secondary Water Barrier', 'code_based',      false, false, 1, 3),
  ('op',              'Overhead and Profit (O&P)',              'code_based',      false, false, 1, 4),
  ('steep_high',      'Steep Roof / High Roof Charges',         'code_based',      true,  false, 1, 5),
  ('valley_metal',    'Valley Metal / Valley Liner',            'code_based',      false, false, 1, 6),
  ('rotted_decking',  'Replaced Rotted Decking',                'condition_based', true,  true,  1, 7)
ON CONFLICT (key) DO NOTHING;

-- ── Helper to get line item id by key ─────────────────────────────────────────
-- Used inline below via subquery

-- ══════════════════════════════════════════════════════════════════════════════
-- ARGUMENTS
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. DRIP EDGE
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'policy',       1, 'The carrier approved a full tear-off scope. That scope is what makes drip edge replacement necessary. The policy obligates the carrier to fund a complete, code-compliant reinstallation of the scope they approved.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'manufacturer', 2, 'Manufacturer installation instructions require drip edge as a warranted installation component. A roof installed without compliant drip edge voids the manufacturer warranty from day one.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'code',         3, 'Per IRC R905.2.8.5, underlayment must be installed OVER drip edge at eaves and UNDER it at rakes. That sequence is physically impossible without first removing existing drip edge. Once removed during tear-off, drip edge is generally deformed and cannot be reinstalled consistent with manufacturer specifications. Replacement is generally required following a full tear-off because removal typically damages the component and prevents reinstallation to code. This is not a code upgrade — drip edge existed on this structure before the loss. The tear-off scope is what makes replacement necessary.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'field_doc',    4, 'Photo documentation showing existing drip edge and the approved tear-off scope.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'oneclickcode', 5, 'OneClick Code report confirming IRC R905.2.8.5 enforcement by the local jurisdiction, cited by report number and verification date. Reinforces the argument; does not replace policy language.', 'elias_validated', false);

-- 2. STARTER STRIP
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'policy',       1, 'The policy obligates restoration to pre-loss condition using proper materials. A starter strip is a distinct, separately manufactured product required for a warranted installation.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'manufacturer', 2, 'Every major manufacturer — GAF, Owens Corning, CertainTeed, IKO, Atlas — requires a dedicated starter course as a condition of their product warranty. A starter strip has a full-width self-sealing adhesive bead positioned at the eave edge, which field shingles do not have in the correct location. A roof without a proper starter course is out of manufacturer warranty from day one.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'code',         3, 'IRC R904.1 requires roofing assemblies to be installed per manufacturer specifications. The Xactimate price list contains a separate line item (RFG STRT) because starter strip is a separate product. Waste percentage in Xactimate applies to field shingle overage only and does not generate starter material. No Xactware documentation supports including starter in auto waste.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'field_doc',    4, 'Manufacturer installation instructions showing starter course as a warranty condition.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'oneclickcode', 5, 'OneClick Code report confirming IRC R904.1 manufacturer specification compliance is enforced locally.', 'elias_validated', false);

-- 3. UNDERLAYMENT — IRC standard sub-argument
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, sub_type, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'policy',       1, 'The policy obligates restoration of the roofing system to pre-loss condition with all required components.', 'irc_standard', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'manufacturer', 2, 'Manufacturer warranty conditions require new underlayment on any full replacement. A signed warranty cannot be provided over old, disturbed underlayment.', 'irc_standard', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'code',         3, 'IRC R905.1.1 requires underlayment conforming to ASTM standards on all asphalt shingle installations. Underlayment cannot survive a full tear-off intact — it is mechanically fastened and the tear-off process punctures, tears, and shreds it. A roof without new underlayment will fail inspection. For roofs below 4:12, IRC Table R905.1.1(2) requires two layers in a specific offset pattern: a 19-inch starter strip followed by overlapping 36-inch sheets offset 19 inches. Approving single-layer felt on a low-slope roof funds a code-deficient installation. Use DC suffix code (RFG FELT15DC) for double coverage.', 'irc_standard', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'field_doc',    4, 'Pitch meter photograph showing roof pitch reading clearly in frame for low-slope arguments.', 'irc_standard', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'oneclickcode', 5, 'OneClick Code report confirming underlayment requirement and applicable ASTM standard.', 'irc_standard', 'elias_validated', false);

-- 3b. UNDERLAYMENT — FBC secondary water barrier sub-argument (legally distinct)
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, sub_type, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'policy',       1, 'FL policies covering roof replacement must account for FBC-required components as part of a code-compliant restoration.', 'fbc_swb', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'code',         3, 'Florida Building Code R905.1.1 requires a secondary water barrier as an additional protection layer. This is a state-level requirement separate from and in addition to the IRC underlayment requirement. It cannot be waived. Always cite FBC R905.1.1 separately from the IRC underlayment argument — conflating them weakens both.', 'fbc_swb', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'oneclickcode', 5, 'OneClick Code report confirming FBC R905.1.1 secondary water barrier enforcement — cite separately from IRC underlayment OneClick citation.', 'fbc_swb', 'elias_validated', false);

-- 4. O&P
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'policy',       1, 'The policy obligates the carrier to restore the property to pre-loss condition. O&P is a standard component of the cost of that restoration when contractor coordination is involved. Ask the carrier to identify the specific policy provision that excludes O&P on this scope.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'manufacturer', 2, 'Document all trades required on the project — gutter installers, painters, electricians, satellite technicians, permit coordinators. The presence of multiple trades confirms a general contractor role exists. O&P covers licensing, insurance, bonding, office staff, vehicles, and administrative burden. Withholding it produces an estimate no licensed contractor can complete at the stated price.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'code',         3, 'Xactware has published a whitepaper stating that general overhead and profit are intentionally excluded from individual Xactimate unit prices and are designed to be added as a separate markup. The carrier used Xactimate to generate their own estimate. They are applying that platform contrary to its publisher''s guidance. (Note: lead with policy and trade coordination — use the whitepaper as secondary support.)', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'field_doc',    4, 'Permit application and permit number confirming licensed contractor involvement. Documentation of all trades required on the project.', 'elias_validated', false);

-- 5. STEEP/HIGH
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'policy',       1, 'The policy obligates payment for the actual cost of the approved scope. Steep and high surcharges reflect the actual labor cost increase on this property.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'code',         3, 'Steep and high surcharges are labor adjustment items reflecting the real cost increase of working on slopes above 6:12 or structures above one story. They apply to both removal and installation. A carrier that approves a steep removal surcharge but not a steep installation surcharge is asserting that pitch affects labor on the way up but not on the way down. Xactimate tiers: RFG STEP1 (7:12–9:12), RFG STEP2 (10:12–12:12), RFG STEP3 (over 12:12), RFG HIGH (two stories or more).', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'field_doc',    4, 'Pitch meter photograph taken on the specific slope by a licensed professional: instrument flat on slope, reading clearly visible, slope context in frame. GPS-stamped, date-stamped. Wide-angle photograph of full slope for context. EagleView, Hover, CoreLogic, or Verisk aerial report confirming pitch breakdown by slope. When field measurement and aerial report agree and the carrier''s remote estimate diverges, cite both.', 'elias_validated', false);

-- 6. VALLEY METAL
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'policy',       1, 'The policy obligates a code-compliant restoration. The carrier''s obligation is to restore the property in compliance with applicable building codes — not to reproduce a code-deficient original installation.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'code',         3, 'IRC R905.2.8.2 requires open valleys to be lined with one of three approved methods: corrosion-resistant metal not less than 24 inches wide, two plies of mineral-surfaced roll roofing, or ice and water shield meeting ASTM D1970. The roof valley must comply with one of these approved code-compliant installation methods. Valley liner, valley metal, IWS used as valley liner, and roll roofing used as valley liner are interchangeable under this section. The argument that the original installation lacked valley liner is not legally supportable — the code requirement applies to the new installation regardless of what the original installer did. Existing valley liner cannot be reused — it is installed beneath shingles on both sides; once torn off the liner is disturbed and fasteners exposed.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'field_doc',    4, 'Aerial measurement report confirming valley linear footage. Photo documentation showing valley length and condition.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'oneclickcode', 5, 'OneClick Code report confirming IRC R905.2.8.2 enforcement by the local jurisdiction.', 'elias_validated', false);

-- 7. ROTTED DECKING
INSERT INTO supplement_arguments (line_item_id, layer, layer_order, argument_text, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'policy',    1, 'The carrier approved a full tear-off and reinstallation. During tear-off, decking was discovered that does not meet the minimum structural requirements to support a new roofing assembly. The carrier''s obligation is to restore the property to a condition where the approved roofing system can be installed and warranted. That obligation is not conditional on whether the deterioration predates the storm. This is NOT a code upgrade item — do not frame it as one or it will be denied on policy coverage grounds. It is a condition-based scope item documented through field evidence.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'code',      3, 'IRC R905.1 requires roofing materials to be applied to a solid, even surface. A contractor who installs new shingles over soft, spongy, or delaminated decking installs the assembly on a structurally compromised substrate. The new roof will fail prematurely and the warranty is void.', 'elias_validated', false),
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'field_doc', 4, 'Same-day GPS-stamped photographs and video taken during tear-off showing specific boards with visible rot, soft spots, delamination, or deterioration. Contractor physically demonstrates soft spot on video. Submit to carrier the same day boards are discovered, before removal. Quantity in square feet or board count confirmed in photo log. Contractor scope note identifying location by slope and distance from reference point. WARNING: pre-tear-off photos of sagging shingles are insufficient — documentation must show the condition directly, not suggest it through inference.', 'elias_validated', false);

-- ══════════════════════════════════════════════════════════════════════════════
-- CARRIER PATTERNS (all is_provisional=true)
-- ══════════════════════════════════════════════════════════════════════════════

-- Drip Edge
INSERT INTO supplement_carrier_patterns (line_item_id, carrier_name, denial_pattern, rebuttal_strategy, escalation_round, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'State Farm',      'Cites code upgrade; claims code upgrade coverage was not triggered.',                                          'OneClick Code report documents requirement was in place before the loss — not a code upgrade. Ask for specific policy provision in writing.',                                                                                           1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'State Farm',      'Second denial: coordination and complexity does not meet requirements, or reiterates code upgrade position.', 'Written response: request the specific policy provision that permits funding a tear-off while excluding components code-compliant reinstallation physically requires. Ten business day deadline. Copy supervising adjuster.',                2, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'Allstate',        'Approves partial quantities — eaves only, denies rakes.',                                                      'Cite IRC R905.2.8.5 explicitly: drip edge required at both eaves AND rakes. OneClick report confirms both.',                                                                                                                             1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'American Family', 'Generally approves once code documentation is presented.',                                                     'Submit OneClick report and manufacturer instructions upfront.',                                                                                                                                                                          1, 'muaz', true);

-- Starter Strip
INSERT INTO supplement_carrier_patterns (line_item_id, carrier_name, denial_pattern, rebuttal_strategy, escalation_round, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'State Farm', 'States starter is included in the shingle price.',                                                             'Request in writing the specific Xactimate line item that includes starter material. No such item exists. Xactimate prices them separately as RFG STRT.',                                                                                 1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'State Farm', 'Approves on dwelling but denies on detached structure under same storm.',                                      'Cite the approval on the dwelling directly. Ask for written explanation of why same item is appropriate on one structure but not another under the same storm, same price list, same replacement scope.',                                 2, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'USAA',       'Consistent denier — argues starter bundled in waste or shingle price.',                                        'Manufacturer installation instructions + separate Xactimate line item. No Xactware documentation supports starter in auto waste.',                                                                                                      1, 'muaz', true);

-- Underlayment
INSERT INTO supplement_carrier_patterns (line_item_id, carrier_name, denial_pattern, rebuttal_strategy, escalation_round, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'Citizens Property Insurance', 'Most aggressive FL denier of secondary water barriers.',                                        'FBC R905.1.1 mandate is state law and cannot be waived. OneClick report confirming FBC enforcement.',                                                                                                                                    1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'State Farm',                  'Approves standard felt but pushes back on synthetic, arguing 15 lb. felt is sufficient.',     'Counter with IRC ASTM standard and manufacturer specification requiring synthetic.',                                                                                                                                                     1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'State Farm',                  'Requires tear-off documentation before approving double-coverage low-slope felt.',             'Requiring uncompensated work before approving a code-mandated item is not a reasonable or defensible standard.',                                                                                                                         2, 'muaz', true);

-- O&P
INSERT INTO supplement_carrier_patterns (line_item_id, carrier_name, denial_pattern, rebuttal_strategy, escalation_round, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'State Farm',      'Coordination and complexity does not meet requirements — no definition provided in writing.',                     'Request the document, policy provision, or published standard that defines the O&P threshold in writing. Ask how Xactware whitepaper does not govern given carrier used Xactimate.',                                                     1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'State Farm',      'Second denial: non-substantive response or repeat of coordination/complexity language.',                           'Round 2 written response: request supervising adjuster be copied. State that desk adjuster has not provided written policy citation after request. Ten business day deadline.',                                                          2, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'State Farm',      'Holdback / paid receipt: withholds O&P pending proof of completed paid work.',                                     'Requiring proof of uncompensated completed work before releasing funds that make completing the work financially viable is not a reasonable or defensible claim-handling standard under FL insurance regulations.',                       1, 'elias_validated', true),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'American Family', 'Approves O&P more readily than most major carriers.',                                                               'Submit with full trade list and policy language citation upfront.',                                                                                                                                                                      1, 'muaz', true);

-- Steep/High
INSERT INTO supplement_carrier_patterns (line_item_id, carrier_name, denial_pattern, rebuttal_strategy, escalation_round, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'State Farm', 'Adjusts steep charges to own third-party remote measurement, frequently landing in lower tier.',              'Provide pitch meter photograph. Ask carrier to identify methodology, margin of error, and specific slope their vendor measured. Field measurement from licensed professional with calibrated instrument cannot be overridden without written technical explanation.',    1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'Allstate',   'Caps at first tier even on 10:12–12:12 pitches.',                                                               'Pitch meter photograph + aerial report (EagleView/Hover/CoreLogic/Verisk) both confirming pitch in correct tier.',                                                                                                                      1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'Citizens',   'Denies high-roof charges on two-story structures.',                                                              'Document structure height. RFG HIGH applies to all two-story or greater structures regardless of carrier preference.',                                                                                                                   1, 'muaz', true);

-- Valley Metal
INSERT INTO supplement_carrier_patterns (line_item_id, carrier_name, denial_pattern, rebuttal_strategy, escalation_round, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'American Family', 'Omits valley metal from initial estimate without explanation.',                                           'Written OneClick Code citation with IRC R905.2.8.2 section number. Both respond quickly to this.',                                                                                                                                       1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'Farmers',        'Omits valley metal from initial estimate without explanation.',                                            'Written OneClick Code citation with IRC R905.2.8.2 section number.',                                                                                                                                                                    1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'Various',        'Argues existing liner can be reused.',                                                                    'Ask in writing how a contractor completes a full tear-off without disturbing the valley liner, and identify a licensed contractor who will provide manufacturer warranty on new shingles over existing disturbed liner.',                  2, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'Various',        'Argues original roof had no valley liner so new installation does not need it.',                          'Carrier obligation is code-compliant restoration, not reproduction of a code-deficient original installation. The code requirement applies to the new installation regardless of what the original installer did.',                      1, 'muaz', true);

-- Rotted Decking
INSERT INTO supplement_carrier_patterns (line_item_id, carrier_name, denial_pattern, rebuttal_strategy, escalation_round, source, is_provisional) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'Progressive', 'Pre-existing condition blanket denial.',                                                                    'Carrier approved the tear-off. Tear-off exposed the condition. Obligation to restore to warrantable condition is not conditional on whether deterioration predates the storm.',                                                          1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'State Farm',  'Approves more readily when photo documentation is dated during tear-off and submitted immediately.',       'Submit same-day tear-off photos and video before boards are removed.',                                                                                                                                                                   1, 'muaz', true),
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'Allstate',    'Requires re-inspection before approving — delay tactic.',                                                   'Counter by having contractor video discovery in real time and sending to carrier same day. Re-inspection request is a delay tactic when documentation already shows condition.',                                                         1, 'muaz', true);

-- ══════════════════════════════════════════════════════════════════════════════
-- XACTIMATE CODES (all is_verified=false pending FL8X price list confirmation)
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO supplement_xactimate_codes (line_item_id, code, description, unit, regional_prefixes, is_verified, verification_notes) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'),
   'RFG DRIP', 'R and R Drip Edge / Gutter Apron', 'lf',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Original delivery had RFG DRIP> — trailing > is notation artifact, cleaned to RFG DRIP. Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'),
   'RFG STRT', 'Asphalt Starter / Universal Starter Course', 'lf',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Measured in linear feet of eave and rake perimeter. Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='underlayment'),
   'RFG FELT15', '15 lb. Felt Underlayment', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='underlayment'),
   'RFG FELT30', '30 lb. Felt Underlayment', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='underlayment'),
   'RFG SYNTH', 'Synthetic Underlayment', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='underlayment'),
   'RFG FELT15DC', '15 lb. Felt Double Coverage (low-slope, below 4:12)', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'DC suffix for double coverage — critical for low-slope roofs. Verify this variant exists in FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='op'),
   'OVH', 'Overhead (10% percentage adder)', 'pct_adder',
   '[{"region":"All Florida","state":"FL","prefix":"All FL8X lists"}]',
   true, 'O&P are percentage adders not unit-priced items. OVH/PRF structure is confirmed Xactimate mechanics — not a fabricated code.'),

  ((SELECT id FROM supplement_line_items WHERE key='op'),
   'PRF', 'Profit (10% percentage adder)', 'pct_adder',
   '[{"region":"All Florida","state":"FL","prefix":"All FL8X lists"}]',
   true, 'O&P are percentage adders not unit-priced items. OVH/PRF structure is confirmed Xactimate mechanics.'),

  ((SELECT id FROM supplement_line_items WHERE key='steep_high'),
   'RFG STEP1', 'Steep Charge 7:12 to 9:12', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list. Removal-only variant also exists.'),

  ((SELECT id FROM supplement_line_items WHERE key='steep_high'),
   'RFG STEP2', 'Steep Charge 10:12 to 12:12', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='steep_high'),
   'RFG STEP3', 'Steep Charge Over 12:12', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='steep_high'),
   'RFG HIGH', 'High Roof Surcharge (two stories or more)', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'),
   'RFG VALM', 'Valley Metal (interchangeable with RFG IWS / RFG RFR under IRC R905.2.8.2)', 'lf',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify against FL8X price list. All three valley codes are interchangeable under IRC R905.2.8.2.'),

  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'),
   'RFG IWS', 'Ice and Water Shield used as valley liner (sf at 24-inch minimum width)', 'sf',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Quantity = 24-inch minimum width x valley LF. Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'),
   'RFG RFR', 'Roll Roofing used as valley liner', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Less commonly cited — verify this variant exists in FL8X price list as a valley application.'),

  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'),
   'RFG DKBD', 'Replace Roof Decking Board', 'sf',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Always submit with photo documentation as named exhibit. Verify against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'),
   'RFG DK7', 'Replace 7/16 OSB Decking', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify OSB thickness designation against FL8X price list.'),

  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'),
   'RFG DK5', 'Replace 1/2 inch OSB Decking', 'sq',
   '[{"region":"Southwest Florida","state":"FL","prefix":"FLSW8X"},{"region":"South Florida","state":"FL","prefix":"FLMI8X"},{"region":"North Florida","state":"FL","prefix":"FLJA8X"}]',
   false, 'Verify OSB thickness designation against FL8X price list.');

-- ══════════════════════════════════════════════════════════════════════════════
-- EVIDENCE REQUIREMENTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Drip Edge
INSERT INTO supplement_evidence_requirements (line_item_id, evidence_type, description, is_required, sort_order) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'oneclickcode',    'OneClick Code report confirming IRC R905.2.8.5 enforcement — cited by report number, date, and jurisdiction.', true, 1),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'manufacturer_doc','Manufacturer installation instructions requiring drip edge as a warranted installation component.', true, 2),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'photo',           'Photo documentation showing existing drip edge and the approved tear-off scope.', true, 3),
  ((SELECT id FROM supplement_line_items WHERE key='drip_edge'), 'policy_doc',      'Policy declarations page confirming replacement cost coverage.', true, 4);

-- Starter Strip
INSERT INTO supplement_evidence_requirements (line_item_id, evidence_type, description, is_required, sort_order) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'manufacturer_doc','Manufacturer installation instructions showing starter course as a warranty condition (GAF, Owens Corning, CertainTeed, IKO, or Atlas).', true, 1),
  ((SELECT id FROM supplement_line_items WHERE key='starter_strip'), 'oneclickcode',   'OneClick Code report confirming IRC R904.1 manufacturer specification compliance is enforced locally.', true, 2);

-- Underlayment
INSERT INTO supplement_evidence_requirements (line_item_id, evidence_type, description, is_required, sort_order) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'oneclickcode',    'OneClick Code report confirming underlayment requirement and applicable ASTM standard (IRC R905.1.1).', true, 1),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'oneclickcode',    'Separate OneClick Code report confirming FBC R905.1.1 secondary water barrier enforcement (FL properties only — legally distinct from IRC underlayment citation).', true, 2),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'photo',           'Pitch meter photograph showing roof pitch reading clearly in frame — required for low-slope (below 4:12) double-coverage arguments.', false, 3),
  ((SELECT id FROM supplement_line_items WHERE key='underlayment'), 'manufacturer_doc','Manufacturer installation requirements for underlayment.', true, 4);

-- O&P
INSERT INTO supplement_evidence_requirements (line_item_id, evidence_type, description, is_required, sort_order) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'policy_doc',      'Policy declarations page — identify applicable coverage and any exclusions.', true, 1),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'permit',          'Permit application and permit number confirming licensed contractor involvement.', true, 2),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'scope_note',      'Documentation of all trades required on the project confirming GC coordination (gutter, paint, electrical, satellite, etc).', true, 3),
  ((SELECT id FROM supplement_line_items WHERE key='op'), 'manufacturer_doc','Xactware Overhead and Profit Whitepaper, 2020 edition (secondary support).', false, 4);

-- Steep/High
INSERT INTO supplement_evidence_requirements (line_item_id, evidence_type, description, is_required, sort_order) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'photo',         'Pitch meter photograph: instrument flat on slope, reading clearly visible, slope context in frame. GPS-stamped, date-stamped.', true, 1),
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'photo',         'Wide-angle photograph of the full slope for context.', true, 2),
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'aerial_report', 'Aerial measurement report (EagleView, Hover, CoreLogic, or Verisk) confirming pitch breakdown by slope.', true, 3),
  ((SELECT id FROM supplement_line_items WHERE key='steep_high'), 'oneclickcode',  'OneClick Code report or permit records as secondary pitch confirmation.', false, 4);

-- Valley Metal
INSERT INTO supplement_evidence_requirements (line_item_id, evidence_type, description, is_required, sort_order) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'oneclickcode',  'OneClick Code report confirming IRC R905.2.8.2 enforcement by the local jurisdiction.', true, 1),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'aerial_report', 'Aerial measurement report confirming valley linear footage.', true, 2),
  ((SELECT id FROM supplement_line_items WHERE key='valley_metal'), 'photo',         'Photo documentation showing valley length and condition.', true, 3);

-- Rotted Decking
INSERT INTO supplement_evidence_requirements (line_item_id, evidence_type, description, is_required, sort_order) VALUES
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'photo',      'Dated GPS-stamped photographs taken during tear-off showing specific boards with visible rot, soft spots, delamination, or deterioration. Must show the board in context on the deck with damage directly visible.', true, 1),
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'video',      'Video of contractor pressing on the soft board and narrating the condition — the strongest single piece of documentation. Submit to carrier same day before boards are removed.', true, 2),
  ((SELECT id FROM supplement_line_items WHERE key='rotted_decking'), 'scope_note', 'Contractor scope note identifying the specific location by slope and distance from a reference point. Quantity in square feet or board count confirmed in photo log.', true, 3);

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS — read access for authenticated pros; no direct writes (app layer only)
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE supplement_line_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_arguments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_carrier_patterns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_xactimate_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_evidence_requirements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'supplement_line_items','supplement_arguments','supplement_carrier_patterns',
    'supplement_xactimate_codes','supplement_evidence_requirements'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated read" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "Authenticated read" ON %I FOR SELECT TO authenticated USING (true)', t
    );
  END LOOP;
END $$;
