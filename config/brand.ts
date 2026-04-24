/**
 * ProGuild.ai — Brand Configuration
 * ─────────────────────────────────────────────────────────────────────
 * Single source of truth for all brand text, URLs, and contact info.
 * To rebrand: change values here. Nothing else needs touching.
 * ─────────────────────────────────────────────────────────────────────
 */

export const BRAND = {
  // Core identity
  name:        'ProGuild.ai',
  nameShort:   'ProGuild',
  tagline:     'Your Craft. Your Guild.',
  description: "Florida's verified trades community — licensed pros, zero per-lead fees.",

  // URLs
  url:         'https://proguild.ai',
  urlFallback: 'https://tradesnetwork.vercel.app',  // keep as fallback until DNS points

  // Email addresses
  emailHello:   'hello@proguild.ai',
  emailAlerts:  'alerts@proguild.ai',
  emailPrivacy: 'privacy@proguild.ai',
  emailSupport: 'support@proguild.ai',

  // Session storage key (don't change — breaks existing sessions)
  sessionKey: 'tn_pro',

  // Social / legal
  company:    'Univaro Technologies Pvt Ltd',
  year:       '2026',
} as const

// Convenience helpers
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || BRAND.url
export const SITE_NAME = BRAND.name
