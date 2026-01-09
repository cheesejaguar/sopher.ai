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
    // Use BACKEND_URL env var if set, otherwise use service name for K8s or localhost for local dev
    const backendUrl = process.env.BACKEND_URL
      || (process.env.NODE_ENV === 'production'
        ? 'http://sopher-api-service:8000'
        : 'http://localhost:8000');
    
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
    // NEXT_PUBLIC_BACKEND_URL is the URL browsers use to reach the backend
    // This should be localhost:8000 (exposed via docker-compose ports)
    // NOT the internal Docker hostname (backend:8000)
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',
  },
}

module.exports = nextConfig