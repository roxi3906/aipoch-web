import type { NextConfig } from 'next'

// E2E can opt into an isolated distDir so it does not contend with a local next dev lock.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  images: {
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'statics.aipoch.com'
      }
    ]
  },
  async rewrites() {
    return [
      {
        source: '/open-science/overview',
        destination: '/open-science/overview.html'
      },
      {
        source: '/open-science/overview-corporate',
        destination: '/open-science/overview-corporate.html'
      }
    ]
  },
  async headers() {
    return [
      {
        source: '/open-science/:page(overview|overview-corporate)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://statics.aipoch.com; font-src 'self' data:; connect-src 'none'; frame-src 'self' about: data: blob:; child-src 'self' about: data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ]
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.aipoch.com' }],
        destination: 'https://aipoch.com/:path*',
        statusCode: 301
      },
      {
        source: '/benchmark',
        destination: '/medskillaudit',
        permanent: true
      }
    ]
  }
}

export default nextConfig
