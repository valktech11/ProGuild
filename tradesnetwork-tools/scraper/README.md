# ProGuild Email Scraper

Finds business websites and contact emails for unclaimed FL contractor pros.

## What it does

1. Pulls unclaimed pros (Roofer, HVAC, Electrician, Plumber) from Supabase with no scraped email
2. Searches Bing for their business website using name + city + trade
3. Scrapes that website (homepage, /contact, /about) for email addresses
4. Writes `website_url`, `scraped_email`, `scrape_status` back to the `pros` table

## Setup

### 1. Run the SQL migration in Supabase
Go to Supabase → SQL Editor → paste and run `migration-add-scraper-columns.sql`

### 2. Get a Bing Search API key
- Go to portal.azure.com
- Create Resource → search "Bing Search v7"
- Create → get your API key from Keys and Endpoint
- New Azure accounts get $200 free credit (~66k searches free)

### 3. Configure .env
```
cp .env.template .env
```
Fill in your Supabase URL, service role key, and Bing API key.

### 4. Install dependencies
```
npm install
```

### 5. Test run (10 records only)
```
node scraper.js --test
```
Check the output — verify email quality before full run.

### 6. Full run (10,000 records)
```
node scraper.js
```
Takes ~4-5 hours. Safe to stop and restart — already-scraped records are skipped.

## Monitor progress

Run this in Supabase SQL editor anytime:
```sql
SELECT * FROM scraper_progress;
```

## Output columns on pros table

| Column | Values |
|---|---|
| `website_url` | URL of their business website, or null |
| `scraped_email` | Email found on site, or null |
| `scrape_status` | `found` / `no_email` / `no_website` |
| `scrape_date` | When this record was processed |

## Expected results

Based on flcontractordata.com benchmarks for FL contractors:
- ~60-70% will have a findable website
- ~50-60% of those will have a scrapeable email
- Net email hit rate: ~35-45% of records processed

For 10,000 records that's ~3,500-4,500 new emails.
