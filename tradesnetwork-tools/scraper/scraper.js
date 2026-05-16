/**
 * ProGuild Email Scraper
 * ─────────────────────
 * 1. Pulls unclaimed pros (no email) from Supabase for target trades
 * 2. Searches Bing for their business website
 * 3. Scrapes that website for a contact email
 * 4. Writes website_url + scraped_email back to Supabase
 *
 * Run: node scraper.js
 * Test (10 records only): node scraper.js --test
 *
 * Requirements:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAPIDAPI_KEY in .env
 */

require('dotenv').config()
const axios   = require('axios')
const cheerio = require('cheerio')
const { createClient } = require('@supabase/supabase-js')

// ── Config ────────────────────────────────────────────────────────────────────
const IS_TEST       = process.argv.includes('--test')
const BATCH_SIZE    = 10          // records processed per batch
const DELAY_MS      = 1200        // ms between Bing API calls (avoid rate limits)
const SCRAPE_TIMEOUT = 8000       // ms to wait for website response
const MAX_RECORDS   = IS_TEST ? 10 : 10000

// Target trades — exact category_name values from DB
const TARGET_TRADES = [
  'Roofing',
  'HVAC Technician',
  'Electrician',
  'Plumber',
]

// Domains to skip when scraping (directories, not the pro's own site)
const SKIP_DOMAINS = [
  'yelp.com', 'angi.com', 'angieslist.com', 'homeadvisor.com',
  'thumbtack.com', 'houzz.com', 'bbb.org', 'facebook.com',
  'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
  'yellowpages.com', 'manta.com', 'mapquest.com', 'google.com',
  'buildzoom.com', 'porch.com', 'bark.com', 'nextdoor.com',
  'contractors.com', 'checkbook.org', 'expertise.com',
  'sunbiz.org', 'myfloridalicense.com', 'dbpr.state.fl.us',
  'proguild.ai',
]

// ── Supabase client ───────────────────────────────────────────────────────────
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isSkippedDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    return SKIP_DOMAINS.some(d => hostname.includes(d))
  } catch {
    return true
  }
}

function extractEmails(text) {
  // Match standard emails, avoid false positives like image@2x.png
  const regex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  const found = text.match(regex) || []
  return found.filter(e => {
    const lower = e.toLowerCase()
    // Filter out common non-contact emails
    if (lower.includes('example.com')) return false
    if (lower.includes('sentry.io')) return false
    if (lower.includes('wix.com')) return false
    if (lower.includes('squarespace.com')) return false
    if (lower.includes('@2x')) return false
    if (lower.endsWith('.png') || lower.endsWith('.jpg')) return false
    return true
  })
}

function pickBestEmail(emails) {
  if (!emails.length) return null
  // Prefer contact@, info@, hello@, admin@ over generic names
  const priority = ['contact@', 'info@', 'hello@', 'office@', 'admin@', 'mail@']
  for (const prefix of priority) {
    const match = emails.find(e => e.toLowerCase().startsWith(prefix))
    if (match) return match.toLowerCase()
  }
  // Return first that isn't noreply
  const filtered = emails.filter(e => !e.toLowerCase().includes('noreply'))
  return filtered[0]?.toLowerCase() || null
}

// ── Step 1: Search via RapidAPI Bing Web Search ──────────────────────────────
async function findWebsite(pro) {
  const query = `"${pro.full_name}" ${pro.city || ''} Florida ${pro.trade} contractor`

  try {
    const res = await axios.get('https://bing-search-scraper-api-10x-cheaper.p.rapidapi.com/search', {
      headers: {
        'x-rapidapi-key':  process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'bing-search-scraper-api-10x-cheaper.p.rapidapi.com',
      },
      params: { query, device: 'desktop', count: 10, max_pages: 1, setLang: 'en', cc: 'US' },
      timeout: 10000,
    })

    if (process.env.DEBUG) {
      console.log('  [DEBUG] pages[1]:', JSON.stringify(res.data?.pages?.[1]).slice(0, 400))
    }

    const searchResults = res.data?.pages?.[1]?.search_results || []
    for (const result of searchResults) {
      const url = result.link
      if (url && !isSkippedDomain(url)) return url
    }
    return null
  } catch (err) {
    if (err.response?.status === 429) {
      console.log('  ⚠ Rate limit hit — waiting 10s')
      await sleep(10000)
    } else if (err.response?.status === 403) {
      console.log('  ⚠ API key issue or free plan limit reached')
    } else {
      console.log('  ⚠ Search error:', err.response?.status, err.message)
      if (err.response?.data) console.log('  [DEBUG] Error body:', JSON.stringify(err.response.data).slice(0, 300))
    }
    return null
  }
}

// ── Step 2: Scrape website for email ─────────────────────────────────────────
async function scrapeEmail(websiteUrl) {
  // Pages most likely to have contact email — try in order
  const pagesToTry = [
    websiteUrl,
    websiteUrl.replace(/\/$/, '') + '/contact',
    websiteUrl.replace(/\/$/, '') + '/contact-us',
    websiteUrl.replace(/\/$/, '') + '/about',
  ]

  for (const url of pagesToTry) {
    try {
      const res = await axios.get(url, {
        timeout: SCRAPE_TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ProGuildBot/1.0)',
          'Accept': 'text/html',
        },
        maxRedirects: 3,
      })

      const $ = cheerio.load(res.data)

      // Remove scripts and styles — they pollute email extraction
      $('script, style, noscript').remove()

      // Check for mailto links first — highest confidence
      const mailtoEmails = []
      $('a[href^="mailto:"]').each((_, el) => {
        const href = $(el).attr('href') || ''
        const email = href.replace('mailto:', '').split('?')[0].trim()
        if (email.includes('@')) mailtoEmails.push(email.toLowerCase())
      })

      if (mailtoEmails.length) {
        return pickBestEmail(mailtoEmails) || mailtoEmails[0]
      }

      // Fall back to regex on visible text
      const bodyText = $.text()
      const textEmails = extractEmails(bodyText)
      if (textEmails.length) {
        return pickBestEmail(textEmails)
      }

    } catch {
      // Page not found or timeout — try next page
      continue
    }
  }

  return null
}

// ── Step 3: Write results to Supabase ─────────────────────────────────────────
async function saveResult(proId, websiteUrl, scrapedEmail) {
  const update = {
    website_url:    websiteUrl   || null,
    scraped_email:  scrapedEmail || null,
    scrape_status:  scrapedEmail ? 'found' : (websiteUrl ? 'no_email' : 'no_website'),
    scrape_date:    new Date().toISOString(),
  }

  const { error } = await sb
    .from('pros')
    .update(update)
    .eq('id', proId)

  if (error) {
    console.error(`  ✗ DB write failed for ${proId}:`, error.message)
    return false
  }
  return true
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 ProGuild Email Scraper`)
  console.log(`   Mode: ${IS_TEST ? 'TEST (10 records)' : 'PRODUCTION'}`)
  console.log(`   Target trades: ${TARGET_TRADES.join(', ')}`)
  console.log(`   Max records: ${MAX_RECORDS.toLocaleString()}`)
  console.log(`   Bing API key: ${process.env.RAPIDAPI_KEY ? '✓ found' : '✗ MISSING'}`)
  console.log(`   Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL ? '✓ found' : '✗ MISSING'}`)
  console.log('')

  if (!process.env.RAPIDAPI_KEY) {
    console.error('✗ RAPIDAPI_KEY missing from .env — cannot proceed')
    process.exit(1)
  }

  // ── Fetch target pros from Supabase ──────────────────────────────────────
  console.log('📋 Fetching pros from Supabase...')

  const { data: pros, error } = await sb
    .from('pros')
    .select(`
      id,
      full_name,
      city,
      state,
      license_number,
      scrape_status,
      trade_category:trade_categories(category_name, slug)
    `)
    .eq('is_claimed', false)
    .eq('profile_status', 'Active')
    .is('scraped_email', null)
    .is('scrape_status', null)
    .limit(MAX_RECORDS * 3)  // fetch more, filter in JS since join filter unreliable

  if (error) {
    console.error('✗ Supabase fetch failed:', error.message)
    process.exit(1)
  }

  // Filter to target trades in JS (Supabase join filter unreliable)
  const filtered = (pros || []).filter(p => {
    const cat = Array.isArray(p.trade_category) ? p.trade_category[0] : p.trade_category
    return cat && TARGET_TRADES.includes(cat.category_name)
  }).slice(0, MAX_RECORDS).map(p => {
    const cat = Array.isArray(p.trade_category) ? p.trade_category[0] : p.trade_category
    return { ...p, trade: cat?.category_name }
  })

  console.log(`✓ ${filtered.length} pros to process\n`)

  if (!filtered.length) {
    console.log('No pros to process. Check trade filter or scrape_status column exists.')
    return
  }

  // ── Process in batches ───────────────────────────────────────────────────
  let found    = 0
  let noSite   = 0
  let noEmail  = 0
  let errors   = 0

  for (let i = 0; i < filtered.length; i++) {
    const pro = filtered[i]
    const progress = `[${i + 1}/${filtered.length}]`

    console.log(`${progress} ${pro.full_name} — ${pro.trade}, ${pro.city || 'FL'}`)

    // Search for website
    const websiteUrl = await findWebsite(pro)
    await sleep(DELAY_MS)

    if (!websiteUrl) {
      console.log(`  → No website found`)
      await saveResult(pro.id, null, null)
      noSite++
      continue
    }

    console.log(`  → Website: ${websiteUrl}`)

    // Scrape for email
    const email = await scrapeEmail(websiteUrl)

    if (email) {
      console.log(`  → ✓ Email: ${email}`)
      await saveResult(pro.id, websiteUrl, email)
      found++
    } else {
      console.log(`  → No email on site`)
      await saveResult(pro.id, websiteUrl, null)
      noEmail++
    }

    // Progress summary every 50 records
    if ((i + 1) % 50 === 0) {
      const pct = (((found) / (i + 1)) * 100).toFixed(1)
      console.log(`\n📊 Progress: ${i + 1} processed | ${found} emails found (${pct}%) | ${noSite} no site | ${noEmail} site/no email\n`)
    }
  }

  // ── Final summary ────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log('📊 FINAL RESULTS')
  console.log('─'.repeat(50))
  console.log(`Total processed : ${filtered.length}`)
  console.log(`Emails found    : ${found} (${((found / filtered.length) * 100).toFixed(1)}%)`)
  console.log(`Website, no email: ${noEmail}`)
  console.log(`No website found: ${noSite}`)
  console.log(`Errors          : ${errors}`)
  console.log('─'.repeat(50))
  console.log('\n✓ Done. Results written to Supabase pros table.')
  console.log('  Columns updated: website_url, scraped_email, scrape_status, scrape_date\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
