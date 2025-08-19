/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
  async rewrites() {
    // Use service name for Kubernetes deployment, localhost for local dev
    const backendUrl = process.env.NODE_ENV === 'production' 
      ? 'http://sopher-api-service:8000'
      : 'http://localhost:8000';
    
    return [
      // Auth endpoints (no /api prefix on backend)
      {
        source: '/api/backend/auth/:path*',
        destination: `${backendUrl}/auth/:path*`,
      },
      // API v1 endpoints
      {
        source: '/api/backend/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },
      // All other API endpoints (with /api prefix on backend)
      {
        source: '/api/backend/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8000',
  },
}

module.exports = nextConfig