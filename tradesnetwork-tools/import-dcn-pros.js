#!/usr/bin/env node
/**
 * TradesNetwork — DCN Pro Importer
 * Imports pros from DCN Online CSV/XLSX exports into Supabase
 *
 * Usage:
 *   node import-dcn-pros.js --dry-run              # Preview, no DB writes
 *   node import-dcn-pros.js                        # Import all files in ./dcn-data/
 *   node import-dcn-pros.js --file carpenter.xlsx  # Single file
 *   node import-dcn-pros.js --fl-only              # Skip out-of-state records
 *   node import-dcn-pros.js --dry-run --fl-only --file Roofing.xlsx
 *
 * Setup:
 *   1. Place all DCN xlsx files in ./dcn-data/ folder
 *   2. npm install xlsx @supabase/supabase-js
 *   3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE in env or edit below
 */

const XLSX       = require('xlsx')
const { createClient } = require('@supabase/supabase-js')
const fs         = require('fs')
const path       = require('path')

// ── CONFIG ────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://bzfauzqqxwtqqskjhrgq.supabase.co'
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6ZmF1enFxeHd0cXFza2pocmdxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQxNDAxOSwiZXhwIjoyMDkwOTkwMDE5fQ.AeEg6EJcEOQl85j2-pLZjxFaiBsjtokNQtHE8Yz81fo'
const DATA_DIR      = path.join(__dirname, 'dcn-data')

// ── DCN TRADE → TradesNetwork category slug mapping ──────────────────────────
// Keys match DCN Services field text (case-insensitive prefix match)
const TRADE_MAP = {
  'air conditioning':              'hvac-technician',
  'alarm contractor':              'handyman',
  'building demolition':           'general-contractor',
  'building':                      'general-contractor',
  'carpentry':                     'carpenter',
  'doors/windows':                 'handyman',
  'drywall (non-structural)':      'handyman',
  'drywall':                       'handyman',
  'electrical contractor':         'electrician',
  'flooring':                      'flooring',
  'gas line':                      'plumber',
  'general':                       'general-contractor',
  'glass and glazing':             'handyman',
  'gutters':                       'roofer',
  'gypsum drywall':                'handyman',
  'industrial facility':           'general-contractor',
  'irrigation':                    'landscaper',
  'marine':                        'handyman',
  'mechanical':                    'hvac-technician',
  'painting':                      'painter',
  'plumbing':                      'plumber',
  'pollutant storage system':      'general-contractor',
  'residential pool/spa servicing':'handyman',
  'residential solar water heating':'solar-installer',
  'residential':                   'general-contractor',
  'roofing':                       'roofer',
  'screening':                     'handyman',
  'shutters':                      'handyman',
  'solar':                         'solar-installer',
  'specialty':                     'general-contractor',
  'structure contractor':          'general-contractor',
  'tower':                         'general-contractor',
  'underground utility and excavation': 'general-contractor',
}

// ── ARGS ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FL_ONLY = args.includes('--fl-only')
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null

console.log(`\n🔧 DCN Pro Importer`)
console.log(`   Dry run:  ${DRY_RUN}`)
console.log(`   FL only:  ${FL_ONLY}`)
console.log(`   File:     ${fileArg || 'all files in ./dcn-data/'}`)
console.log(`   DB:       ${SUPABASE_URL}\n`)

// ── HELPERS ───────────────────────────────────────────────────────────────────

/** Parse "MELBOURNE FL  32935" → { city, state, zip } */
function parseCityStateZip(raw) {
  if (!raw) return { city: null, state: null, zip_code: null }
  const str = raw.trim()
  // Match: anything + 2-letter state + 5-digit zip, with variable spacing
  const m = str.match(/^(.*?)\s{1,}([A-Z]{2})\s{1,}(\d{5})\s*$/)
  if (!m) return { city: str, state: null, zip_code: null }
  return {
    city:     m[1].trim().replace(/\s+/g, ' '),
    state:    m[2],
    zip_code: m[3],
  }
}

/** Parse "Direct Line - 3212422455" → "3212422455" */
function parsePhone(raw) {
  if (!raw) return null
  const str = String(raw).trim()
  const parts = str.split(' - ')
  const digits = parts.length > 1 ? parts[1].trim() : str
  // Keep only digits, format as needed
  const clean = digits.replace(/\D/g, '')
  if (clean.length === 10) return clean
  if (clean.length === 11 && clean.startsWith('1')) return clean.slice(1)
  return clean || null
}

/** Parse "Air conditioning (CAC1817585)" → { tradeName, licenseNumber } */
function parseServices(raw) {
  if (!raw) return { tradeName: null, licenseNumber: null }
  const str = String(raw).trim()
  const licenseMatch = str.match(/\(([^)]+)\)/)
  const licenseNumber = licenseMatch ? licenseMatch[1].trim() : null
  const tradeName = str.replace(/\s*\([^)]+\)/, '').trim().toLowerCase()
  return { tradeName, licenseNumber }
}

/** Map DCN trade name → TradesNetwork slug */
function mapTrade(tradeName) {
  if (!tradeName) return null
  const lower = tradeName.toLowerCase()
  // Exact match first
  if (TRADE_MAP[lower]) return TRADE_MAP[lower]
  // Prefix match
  for (const [key, slug] of Object.entries(TRADE_MAP)) {
    if (lower.startsWith(key) || key.startsWith(lower)) return slug
  }
  return 'general-contractor' // fallback
}

/** Read an xlsx file and return array of row objects */
function readXlsx(filePath) {
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Load trade categories from DB
  console.log('📋 Loading trade categories from DB...')
  const { data: cats, error: catErr } = await supabase
    .from('trade_categories').select('id, slug')
  if (catErr) { console.error('❌ Could not load trade_categories:', catErr.message); process.exit(1) }
  const catBySlug = Object.fromEntries((cats || []).map(c => [c.slug, c.id]))
  console.log(`   Found ${cats?.length || 0} categories: ${Object.keys(catBySlug).join(', ')}\n`)

  // Load existing emails to detect duplicates
  console.log('📋 Loading existing pro emails from DB...')
  const { data: existingPros } = await supabase
    .from('pros').select('email, id')
  const existingEmails = new Set((existingPros || []).map(p => p.email.toLowerCase()))
  console.log(`   ${existingEmails.size} existing pros in DB\n`)

  // Determine files to process
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Data directory not found: ${DATA_DIR}`)
    console.error(`   Create ./dcn-data/ and place your XLSX files there.`)
    process.exit(1)
  }

  let files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'))
    .sort()

  if (fileArg) {
    files = files.filter(f => f.toLowerCase() === fileArg.toLowerCase())
    if (!files.length) {
      console.error(`❌ File not found in ${DATA_DIR}: ${fileArg}`)
      process.exit(1)
    }
  }

  console.log(`📁 Processing ${files.length} file(s)...\n`)

  // Track emails seen THIS run to dedup across files
  const seenThisRun = new Set()

  let totalProcessed = 0
  let totalInserted  = 0
  let totalSkipped   = 0
  let totalOutOfState = 0

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file)
    console.log(`\n📄 ${file}`)

    let rows
    try {
      rows = readXlsx(filePath)
    } catch (e) {
      console.error(`   ❌ Could not read file: ${e.message}`)
      continue
    }

    let fileInserted = 0
    let fileSkipped  = 0

    for (const row of rows) {
      totalProcessed++

      const email = row['Email'] ? String(row['Email']).trim().toLowerCase() : null
      if (!email) { fileSkipped++; totalSkipped++; continue }

      // Parse fields
      const { city, state, zip_code } = parseCityStateZip(row['City State Zip'])

      // FL-only filter
      if (FL_ONLY && state !== 'FL') {
        totalOutOfState++
        fileSkipped++
        continue
      }

      // Dedup by email — skip if already in DB or seen this run
      if (existingEmails.has(email) || seenThisRun.has(email)) {
        fileSkipped++
        totalSkipped++
        continue
      }

      const phone = parsePhone(row['Telephone'])
      const { tradeName, licenseNumber } = parseServices(row['Services'])
      const tradeSlug = mapTrade(tradeName)
      const tradeCategoryId = tradeSlug ? catBySlug[tradeSlug] : null

      const businessName = row['Business Name'] ? String(row['Business Name']).trim() : null
      const fullName     = businessName || 'Unclaimed Pro'

      const proData = {
        full_name:          fullName,
        email:              `unclaimed_dcn_${email.replace('@','_at_')}@placeholder.tradesnetwork`,
        // Store real email separately in phone field temporarily? No —
        // Real email goes into a separate column. For now use placeholder pattern
        // so they can't log in, but real email stored for outreach.
        // We store real email in a way that lets claim emails reach them:
        // Actually, store real email directly — unclaimed pros have placeholder login
        // but the claim email system needs their real email.
        // Override: store real email directly for claimed outreach
        phone:              phone,
        city:               city,
        state:              state,
        zip_code:           zip_code,
        trade_category_id:  tradeCategoryId,
        license_number:     licenseNumber,
        is_verified:        licenseNumber ? true : false,
        license_status:     licenseNumber ? 'active' : 'unknown',
        is_claimed:         false,
        email_sent:         false,
        plan_tier:          'Free',
        profile_status:     'Active',
        review_count:       0,
        lead_count:         0,
        available_for_work: false,
        bio:                businessName ? `${businessName} — licensed trade professional in ${city || 'Florida'}, FL.` : null,
      }

      seenThisRun.add(email)

      if (DRY_RUN) {
        console.log(`   [DRY] ${fullName} | ${email} | ${city}, ${state} | ${tradeSlug} | lic:${licenseNumber || 'none'}`)
        fileInserted++
        totalInserted++
        continue
      }

      // Use real email directly — unclaimed pros need real email for claim campaigns
      // Override email field with real email, mark is_claimed=false so they can't log in
      // The auth route checks is_claimed before allowing login
      proData.email = email

      const { error } = await supabase.from('pros').insert(proData)
      if (error) {
        // Unique constraint on email — skip silently
        if (error.code === '23505') {
          fileSkipped++
          totalSkipped++
        } else {
          console.error(`   ❌ Insert error for ${email}: ${error.message}`)
          fileSkipped++
          totalSkipped++
        }
        continue
      }

      existingEmails.add(email)
      fileInserted++
      totalInserted++
    }

    console.log(`   ✓ Inserted: ${fileInserted} | Skipped: ${fileSkipped}`)
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`✅ DONE`)
  console.log(`   Total processed: ${totalProcessed}`)
  console.log(`   Inserted:        ${totalInserted}`)
  console.log(`   Skipped (dupe):  ${totalSkipped}`)
  console.log(`   Out-of-state:    ${totalOutOfState}`)
  console.log(DRY_RUN ? '\n   ⚠️  DRY RUN — nothing written to DB' : '\n   ✅  Written to DB')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
