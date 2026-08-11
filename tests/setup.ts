import { vi } from 'vitest'

// Stub Next.js server-only module so unit tests can import API routes
vi.mock('server-only', () => ({}))

// Stub env vars for unit tests — integration tests override these
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.STAGING_SUPABASE_URL || 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.STAGING_SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'
