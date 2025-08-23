import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't require authentication
const publicRoutes = [
  '/login',
  '/_next',
  '/favicon.ico',
  '/api/backend/auth/callback',  // OAuth callback route (legacy path)
  '/api/v1/auth/callback',       // OAuth callback route (current tests)
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
    
    // For OAuth success, always allow through and let client-side handle verification
    if (searchParams.get('oauth') === 'success') {
      // Don't remove the parameter yet - let the client handle it
      return NextResponse.next()
    }
    return NextResponse.next()
  }

  // Check if this is a public route
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
  if (isPublicRoute) {
    if (DEBUG) console.log('[Middleware] Public route, allowing access')
    return
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
    // Redirect to login; ensure header matches test expectation
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.headers.set('location', '/login')
    return res
  }

  // Token exists, check if it's not expired (basic check)
  try {
    // Parse JWT to check expiry (basic validation without verification)
    const tokenParts = accessToken.value.split('.')
    if (tokenParts.length === 3) {
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
        const res = NextResponse.redirect(new URL('/login', request.url))
        res.headers.set('location', '/login')
        return res
      }
    }
  } catch (error) {
    if (DEBUG) console.log('[Middleware] Error parsing token:', error)
    // If we can't parse the token, let it through and let the backend validate
  }

  if (DEBUG) {
    console.log('[Middleware] Valid token found, allowing access', {
      pathname,
      tokenLength: accessToken.value.length,
    })
  }
  
  // Continue with the request
  return
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
    '/((?!api/|_next/static|_next/image|favicon.ico).*)',
  ],
}
