import { PlanTier, PAID_PLANS, ELITE_PLANS } from '@/types'

// Suffixes that indicate a business name rather than a person's name
const BUSINESS_SUFFIXES = /\b(LLC|Inc\.?|Corp\.?|Co\.|Company|Services|Group|Solutions|Contractors?|Builders?|Construction|Enterprises?|Associates?|Partners?|Industries|Systems|Technologies|Management|Properties|Realty|Restoration|Renovations?|Roofing|Electric|Plumbing|HVAC|Painting|Flooring|Landscaping|Pools?)\b/i

export function isBusinessName(name: string): boolean {
  return BUSINESS_SUFFIXES.test(name)
}

export function proFirstName(name: string): string {
  if (!name) return 'the team'
  if (isBusinessName(name)) return 'the team'
  return name.split(' ')[0]
}

export function initials(name: string): string {
  if (!name) return '?'
  if (isBusinessName(name)) {
    const stripped = name.replace(BUSINESS_SUFFIXES, '').replace(/[&,\.]/g, ' ').trim()
    const words = stripped.split(/\s+/).filter(w => w.length > 1)
    if (words.length === 0) return name.slice(0, 2).toUpperCase()
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return (words[0][0] + words[1][0]).toUpperCase()
  }
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export function starsHtml(rating: number): string {
  const n = Math.round(rating)
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const ts = new Date(dateStr).getTime()
  if (isNaN(ts)) return ''
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function formatReviewDate(dateStr: string): string {
  if (!dateStr) return ''
  const ts = new Date(dateStr).getTime()
  if (isNaN(ts)) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function isPaid(plan: PlanTier): boolean {
  return PAID_PLANS.includes(plan)
}

export function isElite(plan: PlanTier): boolean {
  return ELITE_PLANS.includes(plan)
}

export function planLabel(plan: PlanTier): string {
  if (isElite(plan)) return plan.includes('Founding') ? 'Elite★' : 'Elite'
  if (isPaid(plan)) return plan.includes('Founding') ? 'Pro★' : 'Pro'
  return 'Free'
}

export function capName(name: string): string {
  if (!name) return ''
  return name.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function greetingText(name: string): string {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${time}, ${name.split(' ')[0]}!`
}

/** Format a currency value: fmtCurrency(1234.5) → "$1,234.50" */
export function fmtCurrency(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n == null || isNaN(n)) return '—'
  if (opts?.compact && n >= 1000) {
    return '$' + (n / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k'
  }
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Format a short date: "May 7" */
export function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Format a long date: "May 7, 2026" */
export function fmtDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/** Format a phone number: "1234567890" → "(123) 456-7890" */
export function fmtPhone(p: string | null | undefined): string {
  if (!p) return '—'
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  return p
}

export const AVATAR_COLORS: [string, string][] = [
  ['#E1F5EE', '#085041'],
  ['#FFF3CD', '#633806'],
  ['#E6F1FB', '#0C447C'],
  ['#FAECE7', '#712B13'],
  ['#EAF3DE', '#27500A'],
  ['#EEEDFE', '#3C3489'],
]

export function avatarColor(name: string): [string, string] {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

export const US_STATES: [string, string][] = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],
  ['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],
  ['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],
  ['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
  ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
  ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
  ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
  ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
  ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],
  ['WI','Wisconsin'],['WY','Wyoming'],['DC','District of Columbia'],
]

export const CITIES_BY_STATE: Record<string, string[]> = {
  FL: ['Jacksonville','Miami','Tampa','Orlando','St. Petersburg','Hialeah','Tallahassee','Fort Lauderdale','Port St. Lucie','Cape Coral','Pembroke Pines','Hollywood','Gainesville','Miramar','Coral Springs','Clearwater','Palm Bay','Lakeland','West Palm Beach','Pompano Beach'],
  CA: ['Los Angeles','San Diego','San Jose','San Francisco','Fresno','Sacramento','Long Beach','Oakland','Bakersfield','Anaheim','Santa Ana','Riverside','Stockton','Irvine','Chula Vista'],
  TX: ['Houston','San Antonio','Dallas','Austin','Fort Worth','El Paso','Arlington','Corpus Christi','Plano','Laredo','Lubbock','Garland','Irving','Amarillo','Grand Prairie','Brownsville','McKinney','Frisco'],
  NY: ['New York City','Buffalo','Rochester','Yonkers','Syracuse','Albany','New Rochelle','Mount Vernon','Schenectady','Utica'],
  PA: ['Philadelphia','Pittsburgh','Allentown','Erie','Reading','Scranton','Bethlehem','Lancaster','Harrisburg','York'],
  IL: ['Chicago','Aurora','Rockford','Joliet','Naperville','Springfield','Peoria','Elgin','Waukegan','Champaign'],
  OH: ['Columbus','Cleveland','Cincinnati','Toledo','Akron','Dayton','Parma','Canton','Youngstown','Lorain'],
  GA: ['Atlanta','Augusta','Columbus','Macon','Savannah','Athens','Sandy Springs','Roswell','Albany','Johns Creek'],
  NC: ['Charlotte','Raleigh','Greensboro','Durham','Winston-Salem','Fayetteville','Cary','Wilmington','High Point','Concord'],
  MI: ['Detroit','Grand Rapids','Warren','Sterling Heights','Ann Arbor','Lansing','Flint','Dearborn','Livonia','Westland'],
  NJ: ['Newark','Jersey City','Paterson','Elizabeth','Edison','Woodbridge','Lakewood','Toms River','Hamilton','Trenton'],
  VA: ['Virginia Beach','Norfolk','Chesapeake','Richmond','Newport News','Alexandria','Hampton','Roanoke','Portsmouth','Suffolk'],
  WA: ['Seattle','Spokane','Tacoma','Vancouver','Bellevue','Kent','Everett','Renton','Kirkland','Bellingham'],
  AZ: ['Phoenix','Tucson','Mesa','Chandler','Scottsdale','Glendale','Gilbert','Tempe'],
  MA: ['Boston','Worcester','Springfield','Cambridge','Lowell','Brockton','New Bedford','Lynn','Quincy','Fall River'],
  TN: ['Nashville','Memphis','Knoxville','Chattanooga','Clarksville','Murfreesboro','Franklin','Jackson','Johnson City'],
  IN: ['Indianapolis','Fort Wayne','Evansville','South Bend','Carmel','Fishers','Bloomington','Hammond','Gary','Lafayette'],
  MO: ['Kansas City','Saint Louis','Springfield','Columbia','Independence','Lee\'s Summit','O\'Fallon','St. Joseph','St. Charles'],
  MD: ['Baltimore','Columbia','Germantown','Silver Spring','Frederick','Rockville','Gaithersburg','Bowie','Hagerstown'],
  CO: ['Denver','Colorado Springs','Aurora','Fort Collins','Lakewood','Thornton','Arvada','Westminster','Pueblo','Boulder'],
}

export function getCities(state: string): string[] {
  return CITIES_BY_STATE[state] || []
}

export async function fetchCitiesForState(stateCode: string): Promise<string[]> {
  const stateEntry = US_STATES.find(([code]) => code === stateCode)
  if (!stateEntry) return []
  const stateName = stateEntry[1]
  const hardcoded = CITIES_BY_STATE[stateCode]
  if (hardcoded && hardcoded.length > 0) return hardcoded
  try {
    const r = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'United States', state: stateName }),
    })
    if (!r.ok) throw new Error('API error')
    const d = await r.json()
    if (d.error || !d.data) return []
    return (d.data as string[]).sort()
  } catch {
    return []
  }
}
