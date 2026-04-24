/**
 * ProGuild.ai — DBPR License Type Mapping
 * Maps trade slugs to official Florida DBPR license codes and labels.
 * Used for: pro card badges, SEO copy, schema markup, trade page content.
 */

export interface DBPRTrade {
  slug:           string
  label:          string          // User-friendly trade name
  dbprCategory:   string          // Official DBPR category name
  licenseCodes:   string[]        // e.g. ['EC', 'ER']
  licenseLabel:   string          // Full label for display
  seoKeywords:    string[]        // High-intent FL search terms
  floridaStatute?: string         // Relevant FL statute reference
}

export const DBPR_TRADES: DBPRTrade[] = [
  {
    slug:          'hvac-technician',
    label:         'HVAC Technician',
    dbprCategory:  'Air Conditioning',
    licenseCodes:  ['CA', 'RA'],
    licenseLabel:  'Class A/B Air Conditioning Contractor',
    seoKeywords:   ['HVAC contractor Florida', 'air conditioning repair Florida', 'AC technician Florida', 'HVAC license Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'electrician',
    label:         'Electrician',
    dbprCategory:  'Electrical',
    licenseCodes:  ['EC', 'ER'],
    licenseLabel:  'Certified Electrical Contractor',
    seoKeywords:   ['licensed electrician Florida', 'electrical contractor Florida', 'DBPR electrician Florida'],
    floridaStatute: 'F.S. 489.505',
  },
  {
    slug:          'plumber',
    label:         'Plumber',
    dbprCategory:  'Plumbing',
    licenseCodes:  ['CFC', 'RF'],
    licenseLabel:  'Certified Plumbing Contractor',
    seoKeywords:   ['licensed plumber Florida', 'plumbing contractor Florida', 'DBPR plumber Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'roofer',
    label:         'Roofing Contractor',
    dbprCategory:  'Roofing',
    licenseCodes:  ['CCC', 'RCC'],
    licenseLabel:  'Certified Roofing Contractor',
    seoKeywords:   ['licensed roofer Florida', 'roofing contractor Florida', 'DBPR roofing Florida', 'CCC license Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'general-contractor',
    label:         'General Contractor',
    dbprCategory:  'General',
    licenseCodes:  ['CGC', 'RG'],
    licenseLabel:  'Certified General Contractor',
    seoKeywords:   ['licensed general contractor Florida', 'CGC license Florida', 'DBPR contractor Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'solar-installer',
    label:         'Solar Contractor',
    dbprCategory:  'Solar',
    licenseCodes:  ['CVC', 'RV'],
    licenseLabel:  'Certified Solar Contractor',
    seoKeywords:   ['solar installer Florida', 'solar contractor Florida', 'DBPR solar Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'pool-spa',
    label:         'Pool & Spa Contractor',
    dbprCategory:  'Pool',
    licenseCodes:  ['CPC', 'RP'],
    licenseLabel:  'Certified Pool Contractor',
    seoKeywords:   ['pool contractor Florida', 'pool builder Florida', 'DBPR pool license Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'painter',
    label:         'Painting Contractor',
    dbprCategory:  'Painting',
    licenseCodes:  ['CC-P'],
    licenseLabel:  'Certified Painting Contractor',
    seoKeywords:   ['painting contractor Florida', 'licensed painter Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'drywall',
    label:         'Drywall Contractor',
    dbprCategory:  'Drywall',
    licenseCodes:  ['CC-C'],
    licenseLabel:  'Certified Drywall Contractor',
    seoKeywords:   ['drywall contractor Florida', 'licensed drywall Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'impact-window-shutter',
    label:         'Impact Window & Shutter Contractor',
    dbprCategory:  'Glass & Glazing',
    licenseCodes:  ['CC-G'],
    licenseLabel:  'Certified Glass & Glazing Contractor',
    seoKeywords:   ['impact windows Florida', 'hurricane windows Florida', 'impact window contractor Florida'],
    floridaStatute: 'F.S. 489.105',
  },
  {
    slug:          'carpenter',
    label:         'Carpentry Contractor',
    dbprCategory:  'Carpentry',
    licenseCodes:  ['CC-CB'],
    licenseLabel:  'Certified Carpentry Contractor',
    seoKeywords:   ['carpenter Florida', 'carpentry contractor Florida'],
    floridaStatute: 'F.S. 489.105',
  },
]

// Quick lookup by slug
const DBPR_MAP: Record<string, DBPRTrade> = {}
DBPR_TRADES.forEach(t => { DBPR_MAP[t.slug] = t })
export function getDBPRTrade(slug: string): DBPRTrade | null {
  return DBPR_MAP[slug] || null
}

// Top 15 FL cities for city page generation — ordered by DB density
export const FL_SEO_CITIES = [
  'Tampa', 'Miami', 'Orlando', 'Jacksonville', 'Sarasota',
  'Fort Lauderdale', 'Fort Myers', 'Naples', 'Cape Coral',
  'Clearwater', 'St. Petersburg', 'West Palm Beach',
  'Gainesville', 'Bradenton', 'Pensacola',
]

// City slug → display name
export function cityToSlug(city: string): string {
  return city.toLowerCase().replace(/\./g, '').replace(/\s+/g, '-')
}
export function slugToCity(slug: string): string {
  return FL_SEO_CITIES.find(c => cityToSlug(c) === slug) || slug
}
