import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't require authentication
const publicRoutes = [
  '/login',
  '/_next',
  '/favicon.ico',
  '/api/backend/auth/callback',  // OAuth callback route
]

// Debug mode - controlled by environment variable for production debugging
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true' || process.env.NODE_ENV === 'development'

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Log request details in debug mode
  if (DEBUG) {
    console.log('[Middleware] Request:', {
      pathname,
      cookies: request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })),
      headers: {
        host: request.headers.get('host'),
        referer: request.headers.get('referer'),
        cookie: request.headers.get('cookie') ? 'present' : 'absent',
      },
      timestamp: new Date().toISOString(),
    })
  }

  // Special handling for OAuth callback success
  // When we're redirected from OAuth callback, cookies might be in Set-Cookie headers
  if (pathname === '/' && (
    request.headers.get('referer')?.includes('/api/backend/auth/callback') ||
    searchParams.get('oauth') === 'success'
  )) {
    if (DEBUG) {
      console.log('[Middleware] OAuth callback redirect detected', {
        referer: request.headers.get('referer'),
        oauthParamPresent: !!searchParams.get('oauth'),
        cookiesPresent: request.cookies.getAll().map(c => c.name),
      })
    }
    
    // For OAuth success, redirect to /projects (the new default landing page)
    if (searchParams.get('oauth') === 'success') {
      const projectsUrl = new URL('/projects', request.url)
      projectsUrl.searchParams.set('oauth', 'success')
      return NextResponse.redirect(projectsUrl)
    }
    return NextResponse.next()
  }

  // Check if this is a public route
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  if (isPublicRoute) {
    if (DEBUG) console.log('[Middleware] Public route, allowing access')
    return NextResponse.next()
  }

  // Check for access_token cookie
  const accessToken = request.cookies.get('access_token')
  
  if (DEBUG) {
    console.log('[Middleware] Access token check:', {
      exists: !!accessToken,
      name: accessToken?.name,
      hasValue: !!accessToken?.value,
    })
  }

  // If no token, redirect to login
  if (!accessToken || !accessToken.value) {
    if (DEBUG) {
      console.log('[Middleware] No valid access token, redirecting to login', {
        accessTokenExists: !!accessToken,
        hasValue: !!accessToken?.value,
        pathname,
        allCookies: request.cookies.getAll().map(c => c.name),
      })
    }
    const loginUrl = new URL('/login', request.url)
    // Preserve the original URL as a redirect parameter
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Token exists, check basic structure (UX optimization only)
  // SECURITY NOTE: This is NOT a security check - it's purely for UX to avoid
  // unnecessary API calls with obviously expired tokens. The backend performs
  // full cryptographic signature verification. A malicious actor could forge
  // a token with future expiry, but backend will reject it.
  try {
    const tokenParts = accessToken.value.split('.')
    // Validate JWT structure (must have 3 parts)
    if (tokenParts.length !== 3) {
      if (DEBUG) console.log('[Middleware] Invalid token structure')
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())
    const now = Math.floor(Date.now() / 1000)

    if (payload.exp && payload.exp < now) {
      if (DEBUG) {
        console.log('[Middleware] Token expired, redirecting to login', {
          exp: payload.exp,
          now,
          expired: true,
        })
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  } catch (error) {
    // Log all errors, not just debug mode (this is unexpected)
    console.error('[Middleware] Error parsing token:', error)
    // Invalid token structure - redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (DEBUG) {
    console.log('[Middleware] Valid token found, allowing access', {
      pathname,
      tokenLength: accessToken.value.length,
    })
  }
  
  // Continue with the request
  return NextResponse.next()
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/backend/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/backend/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}