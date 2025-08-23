/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,
  compress: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  async rewrites() {
    // Use env-provided backend URL for Vercel/other envs, fallback to localhost in dev
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || (
      process.env.NODE_ENV === 'production' ? 'https://api.sopher.ai' : 'http://localhost:8000'
    );
    
    return [
      // Demo token endpoint (no /api prefix on backend)
      {
        source: '/api/backend/auth/:path*',
        destination: `${backendUrl}/auth/:path*`,
      },
      // All other API endpoints (with /api prefix on backend)
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'http://localhost:8000',
  },
}

module.exports = nextConfig
