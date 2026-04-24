import { Metadata } from 'next'
import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase'
import { timeAgo } from '@/lib/utils'

interface Props { params: Promise<{ slug: string }> }

const US_STATE_NAMES: Record<string, string> = {
  al:'Alabama',ak:'Alaska',az:'Arizona',ar:'Arkansas',ca:'California',
  co:'Colorado',ct:'Connecticut',de:'Delaware',fl:'Florida',ga:'Georgia',
  hi:'Hawaii',id:'Idaho',il:'Illinois',in:'Indiana',ia:'Iowa',ks:'Kansas',
  ky:'Kentucky',la:'Louisiana',me:'Maine',md:'Maryland',ma:'Massachusetts',
  mi:'Michigan',mn:'Minnesota',ms:'Mississippi',mo:'Missouri',mt:'Montana',
  ne:'Nebraska',nv:'Nevada',nh:'New Hampshire',nj:'New Jersey',nm:'New Mexico',
  ny:'New York',nc:'North Carolina',nd:'North Dakota',oh:'Ohio',ok:'Oklahoma',
  or:'Oregon',pa:'Pennsylvania',ri:'Rhode Island',sc:'South Carolina',
  sd:'South Dakota',tn:'Tennessee',tx:'Texas',ut:'Utah',vt:'Vermont',
  va:'Virginia',wa:'Washington',wv:'West Virginia',wi:'Wisconsin',wy:'Wyoming',
}

async function getJobs(slug: string) {
  const sb = getSupabaseAdmin()
  const cleanSlug = slug.toLowerCase()

  // Check if slug is a US state code or name
  const isState = US_STATE_NAMES[cleanSlug] || Object.values(US_STATE_NAMES).some(n => n.toLowerCase() === cleanSlug)

  if (isState) {
    const stateCode = US_STATE_NAMES[cleanSlug]
      ? cleanSlug.toUpperCase()
      : Object.entries(US_STATE_NAMES).find(([,n]) => n.toLowerCase() === cleanSlug)?.[0]?.toUpperCase()

    const { data } = await sb.from('b2b_jobs')
      .select(`*, company:companies(name,city,state), trade_category:trade_categories(category_name)`)
      .eq('is_active', true).ilike('state', stateCode || slug).order('posted_at', { ascending: false }).limit(30)
    return { jobs: data || [], filterType: 'state', filterLabel: US_STATE_NAMES[cleanSlug] || slug, stateCode }
  }

  // Otherwise treat as trade slug
  const tradeName = cleanSlug.replace(/-/g, ' ')
  const { data: cat } = await sb.from('trade_categories').select('id,category_name').ilike('category_name', tradeName).single()

  if (cat) {
    const { data } = await sb.from('b2b_jobs')
      .select(`*, company:companies(name,city,state), trade_category:trade_categories(category_name)`)
      .eq('is_active', true).eq('trade_category_id', cat.id).order('posted_at', { ascending: false }).limit(30)
    return { jobs: data || [], filterType: 'trade', filterLabel: cat.category_name, categoryId: cat.id }
  }

  return { jobs: [], filterType: 'unknown', filterLabel: slug }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { filterLabel, filterType } = await getJobs(slug)
  const title = filterType === 'state'
    ? `Trade Jobs in ${filterLabel} | ProGuild.ai`
    : `${filterLabel} Jobs | ProGuild.ai`
  return {
    title,
    description: `Browse verified trade job postings${filterType === 'trade' ? ` for ${filterLabel}s` : ` in ${filterLabel}`}. Apply with your verified ProGuild.ai profile — zero per-application fees.`,
  }
}

export default async function JobsSlugPage({ params }: Props) {
  const { slug } = await params
  const { jobs, filterType, filterLabel } = await getJobs(slug)

  const heading = filterType === 'state'
    ? `Trade jobs in ${filterLabel}`
    : `${filterLabel} jobs`

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="bg-white border-b border-gray-100 px-6 h-[60px] flex items-center justify-between sticky top-0 z-40">
        <Link href="/" className="font-serif text-xl text-gray-900">Trades<span className="text-teal-600">Network</span></Link>
        <div className="flex items-center gap-4">
          <Link href="/jobs" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← All jobs</Link>
          <Link href="/hire/post" className="text-sm font-semibold px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">Post a job</Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-6">
          <Link href="/jobs" className="hover:text-teal-600 transition-colors">Jobs</Link>
          <span>→</span>
          <span className="text-gray-700">{filterLabel}</span>
        </div>

        <h1 className="font-serif text-3xl text-gray-900 mb-2">{heading}</h1>
        <p className="text-gray-400 mb-8">
          {jobs.length} active position{jobs.length !== 1 ? 's' : ''}
          {filterType === 'trade' ? ` for ${filterLabel}s` : ` in ${filterLabel}`} on ProGuild.ai
        </p>

        {jobs.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl py-16 text-center">
            <div className="text-4xl mb-3 opacity-20">🏗</div>
            <h2 className="font-serif text-xl text-gray-700 mb-2">No jobs yet</h2>
            <p className="text-sm text-gray-400 mb-6">Be the first to post a job here.</p>
            <Link href="/hire/post" className="inline-block px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors">Post a job →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job: any) => (
              <Link key={job.id} href={`/hire/${job.id}`}
                className="block bg-white border border-gray-100 rounded-2xl p-6 hover:border-teal-200 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">{job.company?.name} · {[job.city, job.state].filter(Boolean).join(', ')}</div>
                    <h2 className="font-semibold text-gray-900 mb-2">{job.title}</h2>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="text-xs font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{job.job_type}</span>
                      {job.trade_category && <span className="text-xs text-gray-500">{job.trade_category.category_name}</span>}
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2">{job.description}</p>
                    <div className="text-xs text-gray-400 mt-2">{timeAgo(job.posted_at)} · {job.applications_count} applicants</div>
                  </div>
                  <span className="text-sm font-semibold text-teal-600 flex-shrink-0">View →</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* SEO text */}
        <div className="mt-10 bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-2">
            {filterType === 'trade' ? `About ${filterLabel} jobs` : `Trade jobs in ${filterLabel}`}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            All trade professionals on ProGuild.ai are verified against state licensing databases.
            Apply with your profile — no resume needed. Zero per-application fees.
          </p>
          <div className="flex gap-4 mt-4 flex-wrap text-sm">
            <Link href="/hire" className="text-teal-600 font-medium hover:underline">All B2B jobs →</Link>
            <Link href="/" className="text-teal-600 font-medium hover:underline">Find a pro →</Link>
            <Link href="/hire/post" className="text-teal-600 font-medium hover:underline">Post a job →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
