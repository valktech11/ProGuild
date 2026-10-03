/**
 * ProGuild.ai — Content hub (guides)
 * Server-rendered informational → commercial articles. Content is real: DBPR
 * facts, general industry guidance, and ProGuild product facts only. No invented
 * statistics, prices, review counts or ratings.
 */

export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; text: string }
  | { type: 'cta'; text: string; href: string; label: string }

export interface Guide {
  slug: string
  category: string
  title: string          // H1
  metaTitle: string      // <title>
  description: string
  datePublished: string
  dateModified: string
  readMins: number
  keywords: string[]
  blocks: GuideBlock[]
}

export const GUIDES: Guide[] = [
  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'how-to-check-florida-contractor-license',
    category: 'Hiring',
    title: 'How to Check if a Florida Contractor Is Licensed',
    metaTitle: 'How to Check if a Florida Contractor Is Licensed (2026 Guide) | ProGuild',
    description:
      'Step-by-step: verify any Florida contractor’s license through the state DBPR database, read the license number, and confirm it’s active before you hire.',
    datePublished: '2026-10-03',
    dateModified: '2026-10-03',
    readMins: 4,
    keywords: ['check Florida contractor license', 'verify DBPR license', 'is my contractor licensed Florida', 'Florida contractor license lookup'],
    blocks: [
      { type: 'p', text: 'In Florida, most construction trades require a license issued by the Department of Business and Professional Regulation (DBPR). Checking a contractor’s license before you hire protects you: a licensed contractor has met education, experience and insurance requirements, can legally pull permits, and gives you recourse through the state if something goes wrong.' },
      { type: 'h2', text: 'The fastest way to verify' },
      { type: 'ol', items: [
        'Search the contractor by name or license number on ProGuild’s license verifier.',
        'Open their profile to see the DBPR license number and trade.',
        'Click through to the official state record on myfloridalicense.com to confirm the license is Active and not expired.',
      ]},
      { type: 'cta', text: 'Look up a contractor now', href: '/verify-license', label: 'Verify a license →' },
      { type: 'h2', text: 'How to read a Florida license number' },
      { type: 'p', text: 'Every Florida license number starts with a letter prefix that identifies the trade and license class, followed by digits. The prefix tells you exactly what work the contractor is allowed to perform:' },
      { type: 'ul', items: [
        'CCC / RCC — roofing contractor',
        'CAC / RAC — air conditioning (HVAC) contractor',
        'EC / ER — electrical contractor',
        'CFC / RF — plumbing contractor',
        'CGC / RG — general contractor',
        'CPC / RP — pool & spa contractor',
      ]},
      { type: 'p', text: 'A certified (C-prefix) license is valid statewide; a registered (R-prefix) license is limited to specific local jurisdictions. Make sure the license class covers the work you’re hiring for.' },
      { type: 'h2', text: 'What to confirm on the state record' },
      { type: 'ul', items: [
        'Status is Active (not Expired, Null & Void, or Suspended).',
        'The trade matches your job — a CGC is not a roofing license.',
        'The name or company matches who you’re actually dealing with.',
        'The license has not lapsed near its expiry date.',
      ]},
      { type: 'callout', text: 'If you can’t find a match on ProGuild, that doesn’t automatically mean the contractor is unlicensed — they may operate under a company license or not be in our directory yet. Always confirm on the DBPR portal before hiring.' },
      { type: 'h2', text: 'Next steps' },
      { type: 'p', text: 'Once a license checks out, ask for proof of liability and workers’ compensation insurance, and get the scope and price in writing. For roofing specifically, estimate your roof size first so you can sanity-check any quote.' },
      { type: 'cta', text: 'Estimate your roof size free', href: '/roof-size-calculator', label: 'Open the roof calculator →' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'florida-contractor-license-codes-explained',
    category: 'Reference',
    title: 'Florida Contractor License Codes Explained (CCC, CAC, EC, CGC and more)',
    metaTitle: 'Florida Contractor License Codes Explained: CCC, CAC, EC, CGC | ProGuild',
    description:
      'What each Florida DBPR license prefix means — roofing (CCC), HVAC (CAC), electrical (EC), plumbing (CFC), general (CGC) — and the difference between certified and registered licenses.',
    datePublished: '2026-10-03',
    dateModified: '2026-10-03',
    readMins: 5,
    keywords: ['Florida license codes', 'CCC license', 'CAC license Florida', 'certified vs registered contractor Florida', 'DBPR license prefix'],
    blocks: [
      { type: 'p', text: 'Florida contractor license numbers aren’t random. The letter prefix encodes two things: the trade, and whether the license is certified (statewide) or registered (local). Knowing how to read them tells you at a glance what a contractor is legally allowed to do.' },
      { type: 'h2', text: 'Certified vs. registered' },
      { type: 'ul', items: [
        'Certified (prefix begins with C, e.g. CCC, CAC, CGC) — issued by the state and valid anywhere in Florida.',
        'Registered (prefix begins with R, e.g. RCC, RAC, RG) — valid only in the specific local jurisdiction that approved the contractor.',
      ]},
      { type: 'p', text: 'Both are legitimate. The practical difference is geographic reach: a registered contractor must be locally licensed wherever they work.' },
      { type: 'h2', text: 'The main trade prefixes' },
      { type: 'ul', items: [
        'CCC / RCC — Roofing contractor',
        'CAC / RAC — Air conditioning (HVAC) contractor, Class A/B',
        'EC / ER — Electrical contractor',
        'CFC / RF — Plumbing contractor',
        'CGC / RG — General contractor',
        'CVC / RV — Solar contractor',
        'CPC / RP — Pool & spa contractor',
        'CC-P — Painting contractor',
        'CC-G — Glass & glazing (impact windows & shutters)',
      ]},
      { type: 'callout', text: 'The license class matters. A certified general contractor (CGC) can run many project types but is not a substitute for a roofing (CCC) or HVAC (CAC) license when the work specifically requires one.' },
      { type: 'h2', text: 'Why it matters for homeowners' },
      { type: 'p', text: 'Matching the license to the job is the single most important check. Permits are issued against the correct license class, and insurance claims can be denied if unlicensed or wrongly licensed work is involved. When you browse contractors on ProGuild, each profile shows the DBPR license number so you can confirm the prefix matches your project.' },
      { type: 'cta', text: 'Browse licensed trades in Florida', href: '/fl', label: 'See Florida trades →' },
      { type: 'h2', text: 'Verify before you hire' },
      { type: 'p', text: 'Reading the prefix is step one. Step two is confirming the license is active on the official record.' },
      { type: 'cta', text: 'Check a specific contractor', href: '/verify-license', label: 'Verify a license →' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'how-to-hire-a-roofing-contractor-in-florida',
    category: 'Hiring',
    title: 'How to Hire a Roofing Contractor in Florida: A Homeowner’s Checklist',
    metaTitle: 'How to Hire a Roofing Contractor in Florida: Homeowner Checklist | ProGuild',
    description:
      'A practical checklist for hiring a roofer in Florida: verify the CCC license, confirm insurance, understand the estimate, and avoid storm-chaser red flags.',
    datePublished: '2026-10-03',
    dateModified: '2026-10-03',
    readMins: 6,
    keywords: ['hire roofing contractor Florida', 'how to choose a roofer Florida', 'roofing contractor checklist', 'Florida roofer red flags'],
    blocks: [
      { type: 'p', text: 'Florida’s climate is hard on roofs, and roofing is one of the most permit- and insurance-sensitive trades in the state. A disciplined hiring process protects your home and your insurance coverage. Use this checklist.' },
      { type: 'h2', text: '1. Confirm the roofing license' },
      { type: 'p', text: 'A Florida roofing contractor holds a CCC (certified) or RCC (registered) license. A general contractor license is not the same thing. Look up the contractor and confirm the license is active for roofing specifically.' },
      { type: 'cta', text: 'Verify a roofer’s license', href: '/verify-license', label: 'Verify a license →' },
      { type: 'h2', text: '2. Check insurance' },
      { type: 'ul', items: [
        'General liability insurance covering property damage.',
        'Workers’ compensation for anyone on your roof — this protects you from liability if a worker is injured.',
        'Ask for certificates and confirm they are current.',
      ]},
      { type: 'h2', text: '3. Understand the estimate' },
      { type: 'p', text: 'A good roofing estimate is itemized: roof size (in squares), tear-off and disposal, underlayment, the specific shingle or material, flashing, permits, and warranty terms. If one quote is far lower than the others, find out what’s missing. Knowing your roof size up front makes quotes easy to compare.' },
      { type: 'cta', text: 'Estimate your roof size free', href: '/roof-size-calculator', label: 'Open the roof calculator →' },
      { type: 'h2', text: '4. Watch for storm-chaser red flags' },
      { type: 'ul', items: [
        'Door-knocking right after a storm with pressure to sign immediately.',
        'Asking for large cash deposits up front.',
        'No physical Florida address or verifiable license.',
        'Offering to “waive your deductible” — this is illegal in Florida.',
      ]},
      { type: 'callout', text: 'In Florida it is illegal for a contractor to pay, waive or rebate your insurance deductible. An offer to do so is a clear signal to walk away.' },
      { type: 'h2', text: '5. Get it in writing' },
      { type: 'p', text: 'Put the full scope, materials, price, timeline, payment schedule and warranty in a written contract before work starts. Reputable contractors expect this.' },
      { type: 'cta', text: 'Browse licensed roofers near you', href: '/fl/roofing', label: 'Find Florida roofers →' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'what-drives-roof-replacement-cost-florida',
    category: 'Roofing',
    title: 'What Drives Roof Replacement Cost in Florida (and How to Estimate Yours)',
    metaTitle: 'What Drives Roof Replacement Cost in Florida | ProGuild',
    description:
      'The real factors behind a Florida roof replacement quote — roof size and pitch, material, tear-off, permits and code upgrades — and how to estimate your roof size before you get bids.',
    datePublished: '2026-10-03',
    dateModified: '2026-10-03',
    readMins: 5,
    keywords: ['roof replacement cost Florida', 'what affects roof cost', 'roof cost factors', 'roofing squares cost', 'Florida roof pricing'],
    blocks: [
      { type: 'p', text: 'Roofing quotes vary widely because roofs vary widely. Rather than chase a single “average” number that won’t match your home, it’s more useful to understand the factors that actually move the price — then estimate your own roof so you can compare bids on equal footing.' },
      { type: 'h2', text: 'The main cost drivers' },
      { type: 'ul', items: [
        'Roof size — priced in “squares” (one square = 100 sq ft). More area means more material and labor.',
        'Pitch and complexity — steep or cut-up roofs with many valleys, hips and penetrations take longer and cost more.',
        'Material — asphalt shingle, metal, tile and flat-roof systems sit at very different price points.',
        'Tear-off and disposal — removing old layers and hauling debris adds labor and dump fees.',
        'Permits and code upgrades — Florida’s building code may require upgrades (e.g. secondary water barrier, improved fastening) that add cost.',
        'Access and height — multi-story or hard-to-access roofs raise labor.',
      ]},
      { type: 'callout', text: 'Because these factors compound, two homes on the same street can get very different quotes. That’s normal — focus on comparing like-for-like scopes, not just the bottom line.' },
      { type: 'h2', text: 'Start with your roof size' },
      { type: 'p', text: 'Roof size is the single biggest variable, and it’s the one you can pin down yourself in seconds. ProGuild’s free calculator estimates your roof area from your address using satellite imagery — no ladder, no drawing. Knowing your square footage lets you check whether each quote is in a sensible range and spot a bid that’s missing work.' },
      { type: 'cta', text: 'Estimate your roof size free', href: '/roof-size-calculator', label: 'Open the roof calculator →' },
      { type: 'h2', text: 'Then get itemized bids' },
      { type: 'p', text: 'Ask each contractor to break the quote into size, tear-off, material, flashing, permits and warranty. An itemized estimate is easy to compare and hard to pad. Always confirm the roofer holds an active CCC/RCC license first.' },
      { type: 'cta', text: 'Find licensed roofers in Florida', href: '/fl/roofing', label: 'Browse roofers →' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────
  {
    slug: 'licensed-vs-unlicensed-contractors-florida',
    category: 'Hiring',
    title: 'Licensed vs. Unlicensed Contractors in Florida: Why It Matters',
    metaTitle: 'Licensed vs. Unlicensed Contractors in Florida: Why It Matters | ProGuild',
    description:
      'The real risks of hiring an unlicensed contractor in Florida — permits, insurance claims, liability and recourse — and how to make sure you’re hiring a licensed pro.',
    datePublished: '2026-10-03',
    dateModified: '2026-10-03',
    readMins: 4,
    keywords: ['licensed vs unlicensed contractor Florida', 'risks of unlicensed contractor', 'why hire a licensed contractor', 'Florida unlicensed contracting'],
    blocks: [
      { type: 'p', text: 'Hiring an unlicensed contractor in Florida can look cheaper up front and cost far more later. Here’s what a state license actually buys you, and what you give up without one.' },
      { type: 'h2', text: 'What a licensed contractor gives you' },
      { type: 'ul', items: [
        'Verified competence — licensed contractors have met state education, experience and exam requirements.',
        'The ability to pull permits — permitted work is inspected and on record, which matters when you sell.',
        'Insurance and bonding — recourse if work is defective or property is damaged.',
        'State oversight — you can file a complaint with DBPR and, in some cases, recover through the state.',
      ]},
      { type: 'h2', text: 'The risks of going unlicensed' },
      { type: 'ul', items: [
        'Insurance claims can be denied if unpermitted or unlicensed work is involved.',
        'You may be liable for on-site injuries without workers’ comp coverage.',
        'Unpermitted work can block a future home sale or require costly retroactive permitting.',
        'Little recourse if the contractor disappears or does defective work.',
      ]},
      { type: 'callout', text: 'In Florida, unlicensed contracting is a crime, and penalties increase during a declared state of emergency — a common situation after hurricanes, exactly when storm-chasers appear.' },
      { type: 'h2', text: 'How to make sure you’re hiring licensed' },
      { type: 'p', text: 'Every contractor profile on ProGuild is built from official Florida DBPR records and shows the license number so you can confirm the trade and status. Look the contractor up, check the license is active, and match the license class to your job.' },
      { type: 'cta', text: 'Verify a contractor’s license', href: '/verify-license', label: 'Verify a license →' },
      { type: 'p', text: 'Not sure what the license prefix means? Our reference guide breaks down every Florida license code.' },
      { type: 'cta', text: 'Read: Florida license codes explained', href: '/guides/florida-contractor-license-codes-explained', label: 'License codes guide →' },
    ],
  },
]

const GUIDE_MAP: Record<string, Guide> = {}
GUIDES.forEach(g => { GUIDE_MAP[g.slug] = g })
export function getGuide(slug: string): Guide | null {
  return GUIDE_MAP[slug] || null
}
