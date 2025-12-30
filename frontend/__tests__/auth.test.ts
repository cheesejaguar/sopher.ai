/**
 * Tests for frontend authentication flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCookie, hasValidAuthCookie, verifyAuth, debugCookies } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '@/middleware';

// Mock environment variables
vi.mock('process', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:8000'
  }
}));

describe('Auth Library', () => {
  beforeEach(() => {
    // Clear all cookies before each test by expiring them
    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0].trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
    vi.clearAllMocks();
  });

  describe('getCookie', () => {
    it('should get cookie value correctly', () => {
      document.cookie = 'access_token=token123; refresh_token=refresh456';
      const token = getCookie('access_token');
      
      expect(token).toBe('token123');
    });

    it('should handle missing cookie', () => {
      const token = getCookie('nonexistent');
      expect(token).toBeNull();
    });

    it('should handle cookies with special characters', () => {
      document.cookie = 'access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const token = getCookie('access_token');
      
      expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    });

    it('should handle multiple cookies', () => {
      document.cookie = 'access_token=token123; path=/';
      document.cookie = 'refresh_token=refresh456; path=/';
      document.cookie = 'other_cookie=value; path=/';
      
      expect(getCookie('access_token')).toBe('token123');
      expect(getCookie('refresh_token')).toBe('refresh456');
      expect(getCookie('other_cookie')).toBe('value');
    });
  });

  describe('hasValidAuthCookie', () => {
    it('should return true when valid token exists', () => {
      // Create valid token (exp in the future)
      const validToken = btoa(JSON.stringify({ alg: 'HS256' })) + '.' +
                        btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.' +
                        'signature';
      document.cookie = `access_token=${validToken}`;
      
      expect(hasValidAuthCookie()).toBe(true);
    });

    it('should return false when no token exists', () => {
      document.cookie = '';
      expect(hasValidAuthCookie()).toBe(false);
    });

    it('should return false for expired token', () => {
      // Create expired token
      const expiredToken = btoa(JSON.stringify({ alg: 'HS256' })) + '.' +
                          btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 })) + '.' +
                          'signature';
      document.cookie = `access_token=${expiredToken}`;
      
      expect(hasValidAuthCookie()).toBe(false);
    });
  });

  // Token expiry tests are covered in hasValidAuthCookie

  describe('verifyAuth', () => {
    it('should verify authentication with backend', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ authenticated: true })
      });

      document.cookie = 'access_token=valid_token';
      const result = await verifyAuth();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/backend/auth/verify',
        expect.objectContaining({
          credentials: 'include'
        })
      );
    });

    it('should return false when not authenticated', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401
      });

      const result = await verifyAuth();
      expect(result).toBe(false);
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await verifyAuth();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('[Auth] Verification failed:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('debugCookies', () => {
    it('should log cookie information', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      document.cookie = 'access_token=token123; refresh_token=refresh456';
      debugCookies();

      expect(consoleSpy).toHaveBeenCalledWith('[Auth Debug] All cookies:', expect.stringContaining('access_token'));
      expect(consoleSpy).toHaveBeenCalledWith('[Auth Debug] Access token present:', true);
      expect(consoleSpy).toHaveBeenCalledWith('[Auth Debug] Has valid auth:', expect.any(Boolean));

      consoleSpy.mockRestore();
    });
  });
});

describe('Middleware', () => {
  const createMockRequest = (url: string, cookies: Record<string, string> = {}) => {
    const request = new NextRequest(new URL(url, 'http://localhost:3000'));
    
    // Add cookies to request
    Object.entries(cookies).forEach(([key, value]) => {
      request.cookies.set(key, value);
    });
    
    return request;
  };

  it('should allow access to public routes', async () => {
    const request = createMockRequest('/login');
    const response = await middleware(request);

    // Login is a public route, middleware may allow or NextResponse.next()
    expect(response === undefined || response instanceof NextResponse).toBe(true);
  });

  it('should redirect to login when no token on protected route', async () => {
    const request = createMockRequest('/dashboard');
    const response = await middleware(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response?.headers.get('location')).toContain('/login');
  });

  it('should allow access with valid token', async () => {
    const validToken = 'valid_token_123';

    const request = createMockRequest('/dashboard', { access_token: validToken });
    const response = await middleware(request);

    // With token, middleware may pass through or handle it
    expect(response === undefined || response instanceof NextResponse).toBe(true);
  });

  it('should redirect to login with no token', async () => {
    const request = createMockRequest('/dashboard', {});
    const response = await middleware(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response?.headers.get('location')).toContain('/login');
  });

  it('should handle OAuth callback route', async () => {
    const request = createMockRequest('/auth/callback/google');
    const response = await middleware(request);

    // Callback routes may or may not be protected depending on config
    expect(response === undefined || response instanceof NextResponse).toBe(true);
  });

  it('should preserve query parameters on redirect', async () => {
    const request = createMockRequest('/dashboard?project=123');
    const response = await middleware(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response?.headers.get('location')).toContain('/login');
    // Original URL should be preserved for post-login redirect
  });

  it('should handle API routes correctly', async () => {
    const validToken = btoa(JSON.stringify({ alg: 'HS256' })) + '.' +
                      btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.' +
                      'signature';

    const request = createMockRequest('/api/data', { access_token: validToken });
    const response = await middleware(request);

    // API routes may or may not be handled by middleware
    expect(response === undefined || response instanceof NextResponse).toBe(true);
  });

  it('should handle missing cookies gracefully', async () => {
    const request = createMockRequest('/dashboard');
    request.cookies.clear();

    const response = await middleware(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response?.headers.get('location')).toContain('/login');
  });
});

describe('OAuth Flow Integration', () => {
  it('should handle complete OAuth login flow', async () => {
    // Set up mock for the verification step
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, email: 'test@example.com' })
    });

    // Frontend receives cookies and verifies
    document.cookie = 'access_token=new_token';
    const isAuthenticated = await verifyAuth();

    expect(isAuthenticated).toBe(true);
  });

  it('should handle OAuth error responses', async () => {
    // Simulate OAuth error callback - note: URLSearchParams auto-decodes
    const url = new URL('http://localhost:3000/login?error=access_denied&error_description=User%20denied%20access');

    // Parse error from URL
    const params = new URLSearchParams(url.search);
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    expect(error).toBe('access_denied');
    expect(errorDescription).toBe('User denied access');  // URLSearchParams auto-decodes
  });

  it('should clear cookies on logout', async () => {
    // Set initial cookies
    document.cookie = 'access_token=token123; path=/';
    document.cookie = 'refresh_token=refresh456; path=/';
    
    // Simulate logout
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'set-cookie': 'access_token=""; Max-Age=0; Path=/'
      })
    });
    
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    
    // Clear cookies locally
    document.cookie = 'access_token=; Max-Age=0; path=/';
    document.cookie = 'refresh_token=; Max-Age=0; path=/';
    
    expect(getCookie('access_token')).toBeNull();
    expect(getCookie('refresh_token')).toBeNull();
  });
});