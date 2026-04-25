export type PlanTier =
  | 'Free'
  | 'Pro'
  | 'Elite'
  | 'Pro_Founding'
  | 'Elite_Founding'
  | 'Pro_Annual'
  | 'Elite_Annual'
  | 'Pro_Founding_Annual'
  | 'Elite_Founding_Annual'

export type ProfileStatus = 'Active' | 'Suspended' | 'Pending_Review'
export type JobStatus = 'Open' | 'In_Progress' | 'Filled' | 'Expired' | 'Cancelled'
export type LeadStatus = 'New' | 'Contacted' | 'Quoted' | 'Scheduled' | 'Completed' | 'Paid' | 'Lost' | 'Archived' | 'Queued_Manual' | 'Converted'
export type LeadSource = 'Profile_Page' | 'Job_Post' | 'Search_Result' | 'Direct' | 'Registry_Card'
export type ApplicationStatus = 'Submitted' | 'Viewed' | 'Shortlisted' | 'Rejected' | 'Hired'
export type BudgetRange = 'Under $500' | '$500–$2K' | '$2K–$10K' | '$10K+' | 'Negotiable'
export type SubStatus = 'Active' | 'Cancelled' | 'Past_Due' | 'Trialing'

export interface TradeCategory {
  id: string
  category_name: string
  slug: string
  is_active: boolean
  created_at: string
}

export interface Pro {
  id: string
  full_name: string
  email: string
  phone: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  bio: string | null
  years_experience: number | null
  profile_photo_url: string | null
  license_number: string | null
  is_verified: boolean
  plan_tier: PlanTier
  stripe_customer_id: string | null
  profile_status: ProfileStatus
  avg_rating: number | null
  review_count: number
  lead_count: number
  trade_category_id: string | null
  created_at: string
  updated_at: string
  // LinkedIn-style fields
  available_for_work: boolean
  available_note: string | null
  is_claimed: boolean
  email_sent: boolean
  claimed_at: string | null
  business_name: string | null
  phone_cell: string | null
  phone_work: string | null
  phone_cell2: string | null
  counties_served: string[] | null
  address_line1: string | null
  // joined
  trade_category?: TradeCategory
}

export interface Job {
  id: string
  title: string
  homeowner_name: string
  homeowner_email: string
  homeowner_phone: string | null
  trade_category_id: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  description: string
  budget_range: BudgetRange | null
  job_status: JobStatus
  is_boosted: boolean
  expires_at: string | null
  posted_at: string
  // joined
  trade_category?: TradeCategory
  application_count?: number
}

export interface Lead {
  id: string
  pro_id: string
  job_id: string | null
  contact_name: string
  contact_email: string | null
  contact_phone: string | null
  message: string
  lead_status: LeadStatus
  lead_source: LeadSource
  created_at: string
  // CRM fields
  quoted_amount: number | null
  scheduled_date: string | null
  notes: string | null
  follow_up_date: string | null
  // joined
  pro?: Pro
  job?: Job
}

export interface Review {
  id: string
  pro_id: string
  job_id: string | null
  reviewer_name: string
  reviewer_email: string
  rating: number
  comment: string | null
  is_approved: boolean
  reviewed_at: string
  // joined
  pro?: Pro
  job?: Job
}

export interface Application {
  id: string
  pro_id: string
  job_id: string
  cover_note: string | null
  status: ApplicationStatus
  applied_at: string
  pro?: Pro
  job?: Job
}

export interface Subscription {
  id: string
  pro_id: string
  stripe_sub_id: string | null
  plan_name: string
  sub_status: SubStatus
  start_date: string | null
  renewal_date: string | null
  amount_usd: number | null
  created_at: string
}

export interface Session {
  id: string
  name: string
  email: string
  plan: PlanTier
  trade: string | null
  city: string | null
  state: string | null
}

export const PAID_PLANS: PlanTier[] = [
  'Pro', 'Elite',
  'Pro_Founding', 'Elite_Founding',
  'Pro_Annual', 'Elite_Annual',
  'Pro_Founding_Annual', 'Elite_Founding_Annual',
]

export const ELITE_PLANS: PlanTier[] = [
  'Elite', 'Elite_Founding', 'Elite_Annual', 'Elite_Founding_Annual',
]

export function isPaidPlan(plan: PlanTier): boolean {
  return PAID_PLANS.includes(plan)
}

export function isElitePlan(plan: PlanTier): boolean {
  return ELITE_PLANS.includes(plan)
}

export function planLabel(plan: PlanTier): string {
  if (isElitePlan(plan)) return plan.includes('Founding') ? 'Elite★' : 'Elite'
  if (isPaidPlan(plan)) return plan.includes('Founding') ? 'Pro★' : 'Pro'
  return 'Free'
}

// ── TRADECOMMUNITY TYPES ────────────────────────────────────

export type PostType = 'update' | 'work' | 'tip' | 'milestone'

export interface PortfolioItem {
  id: string
  pro_id: string
  photo_url: string
  title: string
  description: string | null
  trade: string | null
  created_at: string
  pro?: Pro
}

export interface Post {
  id: string
  pro_id: string
  content: string
  photo_url: string | null
  before_photo_url: string | null
  is_before_after: boolean
  post_type: PostType
  like_count: number
  comment_count: number
  created_at: string
  pro?: Pro
  liked_by_me?: boolean
}

export interface PostComment {
  id: string
  post_id: string
  pro_id: string
  content: string
  created_at: string
  pro?: Pro
}

export interface Follow {
  id: string
  follower_id: string
  following_id: string
  created_at: string
}

export type LicenseStatus = 'active' | 'expiring_soon' | 'expired' | 'unknown'

export interface ProLicense {
  id: string
  pro_id: string
  trade_name: string
  license_number: string
  license_expiry_date: string | null
  license_status: LicenseStatus
  is_primary: boolean
  created_at: string
}

export interface ProMembership {
  id: string
  pro_id: string
  name: string
  url: string | null
  created_at: string
}
