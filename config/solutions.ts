/**
 * ProGuild.ai — For-Pros / SaaS SEO landing pages.
 * Targets contractor software queries ("free roofing CRM", "HVAC CRM Florida").
 * All claims are real: features ProGuild actually ships and the flat pricing /
 * free-trial terms published on /contractors. Competitor numbers are the same
 * publicly-stated price ranges already shown in-product — no fabrication.
 */

export interface SolutionFeature { title: string; desc: string }
export interface SolutionFAQ { q: string; a: string }

export interface Solution {
  slug: string
  trade: string
  title: string          // H1
  metaTitle: string      // <title>
  description: string
  price: string          // monthly, after free trial
  keywords: string[]
  intro: string
  features: SolutionFeature[]
  faqs: SolutionFAQ[]
}

// The stack ProGuild replaces — publicly-stated vendor price ranges, identical
// to the comparison already shown on /contractors. Shown as "typical" costs.
export const TYPICAL_STACK: { tool: string; cost: string }[] = [
  { tool: 'CRM (AccuLynx / JobNimbus)', cost: '$150–200/mo' },
  { tool: 'Satellite measurements (EagleView)', cost: '$40–91/report' },
  { tool: 'Leads (Angi / Thumbtack)', cost: '$50–300/lead' },
]

export const SOLUTIONS: Solution[] = [
  {
    slug: 'roofing-crm',
    trade: 'Roofing',
    title: 'The All-in-One Roofing CRM for Florida Contractors',
    metaTitle: 'Free Roofing CRM for Florida Contractors — CRM + Satellite Measurements | ProGuild',
    description:
      'ProGuild is an all-in-one roofing CRM built for Florida: job pipeline, estimates, invoicing, unlimited satellite roof measurements and a homeowner estimate tool that sends you leads. Free for 90 days, then one flat $49.99/mo.',
    price: '$49.99',
    keywords: ['roofing CRM', 'free roofing CRM', 'roofing CRM Florida', 'roofing software with measurements', 'EagleView alternative', 'roofing contractor software Florida'],
    intro: 'Most roofers stitch together a CRM, a satellite-measurement vendor, a lead service and a supplementing cut — and pay for each one separately. ProGuild is all of it in one flat subscription, built for Florida roofing.',
    features: [
      { title: 'Unlimited satellite roof measurements', desc: 'Rooftop dimensions from satellite imagery in seconds — included, with no per-report fee.' },
      { title: 'Visual job pipeline', desc: 'Track every job from first contact to final payment on one board.' },
      { title: 'Estimates & milestone invoicing', desc: 'Build professional proposals and bill by milestone from the same system.' },
      { title: 'Insurance supplement recovery', desc: 'Catch missed line items on insurance-restoration jobs.' },
      { title: 'Roof visualizer', desc: 'Let homeowners preview shingle colors on their own home to close faster.' },
      { title: 'Free homeowner estimate tool', desc: 'Homeowners get a free satellite-powered estimate and arrive pre-educated — and come to you.' },
      { title: 'Verified directory listing', desc: 'A DBPR-verified public profile that ranks and sends you inbound work.' },
      { title: 'Mobile app + team access', desc: 'Run jobs from the field with multi-user access (Android today, iOS coming).' },
    ],
    faqs: [
      { q: 'Is ProGuild really free to start?', a: 'Yes — ProGuild is free for 90 days with no credit card required. After the trial, roofing is one flat $49.99/mo plan with everything included.' },
      { q: 'Do satellite measurements cost extra?', a: 'No. Satellite roof measurements are included in the flat plan — there is no per-report charge, unlike ordering reports from a measurement vendor.' },
      { q: 'Can I move my existing jobs in?', a: 'Yes. You can bring your book of business in by CSV when you start.' },
      { q: 'Is ProGuild built for Florida?', a: 'Yes. ProGuild is Florida-first: profiles are built from Florida DBPR records and the tools are tuned for Florida roofing and insurance-restoration work.' },
    ],
  },
  {
    slug: 'hvac-crm',
    trade: 'HVAC',
    title: 'HVAC CRM & Field Software for Florida Contractors',
    metaTitle: 'HVAC CRM for Florida Contractors — Jobs, Equipment & Maintenance | ProGuild',
    description:
      'ProGuild is an HVAC CRM for Florida contractors: client and equipment records, maintenance reminders, job pipeline, estimates and invoicing in one app. Free for 90 days, then a flat $29.99/mo.',
    price: '$29.99',
    keywords: ['HVAC CRM', 'HVAC CRM Florida', 'HVAC software Florida', 'HVAC field service software', 'air conditioning contractor software', 'HVAC maintenance tracking'],
    intro: 'ProGuild gives Florida HVAC contractors one place to run the business — clients, installed equipment, maintenance schedules, estimates and invoices — instead of a notebook plus three apps.',
    features: [
      { title: 'Equipment records per client', desc: 'Track every installed unit — make, model, serial and service history — against the client and property.' },
      { title: 'Maintenance reminders', desc: 'Auto-create service reminders from the next service date so recurring maintenance never slips.' },
      { title: 'Visual job pipeline', desc: 'Move jobs from call to completion to payment on one board.' },
      { title: 'Estimates & invoicing', desc: 'Send professional estimates and bill customers from the same system.' },
      { title: 'Client & property records', desc: 'Every customer, site and job searchable in one place.' },
      { title: 'Verified directory listing', desc: 'A DBPR-verified public profile that sends you inbound homeowner work.' },
      { title: 'Mobile app + team access', desc: 'Run calls from the field with multi-user access (Android today, iOS coming).' },
    ],
    faqs: [
      { q: 'How much is ProGuild for HVAC?', a: 'ProGuild is free for 90 days, then a flat $29.99/mo for non-roofing trades including HVAC — everything included, no per-lead or per-report fees.' },
      { q: 'Can I track installed equipment and service history?', a: 'Yes. ProGuild stores equipment per client — make, model, serial — and can auto-create maintenance reminders from the next service date.' },
      { q: 'Do I need a credit card to try it?', a: 'No. The 90-day trial requires no credit card, and you can bring your existing jobs in by CSV.' },
    ],
  },
  {
    slug: 'contractor-crm',
    trade: 'All trades',
    title: 'A Simple CRM for Florida Trade Contractors',
    metaTitle: 'Contractor CRM for Florida Trades — Pipeline, Estimates & Invoicing | ProGuild',
    description:
      'ProGuild is a CRM for Florida trade contractors — electrical, plumbing, pool, solar and more. Job pipeline, estimates, invoicing, client records and a verified directory listing. Free for 90 days, then a flat $29.99/mo.',
    price: '$29.99',
    keywords: ['contractor CRM', 'contractor CRM Florida', 'trade contractor software', 'electrician CRM', 'plumber CRM Florida', 'small contractor CRM'],
    intro: 'ProGuild is a straightforward CRM for licensed Florida trades — electrical, plumbing, pool, solar, painting and more. Everything to run jobs, in one flat plan.',
    features: [
      { title: 'Visual job pipeline', desc: 'Track every job from first contact to final payment on one board.' },
      { title: 'Estimates & invoicing', desc: 'Build and send estimates and invoices in minutes.' },
      { title: 'Client & property records', desc: 'Every customer, property and job — searchable, in one place.' },
      { title: 'Calendar & scheduling', desc: 'Keep jobs and appointments organized.' },
      { title: 'Trade-specific job fields', desc: 'Job data tuned to your trade, not a generic form.' },
      { title: 'Verified directory listing', desc: 'A DBPR-verified public profile that sends you inbound work.' },
      { title: 'Mobile app + team access', desc: 'Run the business from the field with multi-user access (Android today, iOS coming).' },
    ],
    faqs: [
      { q: 'Which trades is this for?', a: 'ProGuild supports licensed Florida trades including electrical, plumbing, pool & spa, solar, painting, drywall, carpentry and general contracting.' },
      { q: 'What does it cost?', a: 'Free for 90 days, then a flat $29.99/mo for non-roofing trades — everything included, no per-lead fees.' },
      { q: 'Can I import my existing customers?', a: 'Yes, you can bring your book of business in by CSV when you start.' },
    ],
  },
]

const SOLUTION_MAP: Record<string, Solution> = {}
SOLUTIONS.forEach(s => { SOLUTION_MAP[s.slug] = s })
export function getSolution(slug: string): Solution | null {
  return SOLUTION_MAP[slug] || null
}
