import { PlanTier, PAID_PLANS, ELITE_PLANS } from '@/types'

export function initials(name: string): string {
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

export function greetingText(name: string): string {
  const hour = new Date().getHours()
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${time}, ${name.split(' ')[0]}!`
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

// Default cities for states not in the map (fallback only)
export function getCities(state: string): string[] {
  return CITIES_BY_STATE[state] || []
}

// Fetch cities from free API for any state
// Returns array of city names sorted alphabetically
export async function fetchCitiesForState(stateCode: string): Promise<string[]> {
  // Map state code to full name for the API
  const stateEntry = US_STATES.find(([code]) => code === stateCode)
  if (!stateEntry) return []
  const stateName = stateEntry[1]

  // First try hardcoded list (instant)
  const hardcoded = CITIES_BY_STATE[stateCode]
  if (hardcoded && hardcoded.length > 0) return hardcoded

  // Fall back to free API
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
    return [] // empty → show "Other (type below)" option
  }
}
