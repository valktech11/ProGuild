import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  experimental: {
    // Allow build without env vars
  },
}

export default config
