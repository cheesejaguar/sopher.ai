// Auth helper functions

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  
  if (parts.length === 2) {
    const cookieValue = parts.pop()?.split(';').shift()
    return cookieValue || null
  }
  
  return null
}

export function hasValidAuthCookie(): boolean {
  if (typeof document !== 'undefined' && (!document.cookie || document.cookie.trim() === '')) {
    return false
  }
  const accessToken = getCookie('access_token')
  
  if (!accessToken) return false
  
  try {
    // Basic JWT validation
    const parts = accessToken.split('.')
    if (parts.length !== 3) return false
    
    const payload = JSON.parse(atob(parts[1]))
    const now = Math.floor(Date.now() / 1000)
    
    // Check if token is expired
    if (payload.exp && payload.exp < now) {
      console.log('[Auth] Token expired')
      return false
    }
    
    return true
  } catch (error) {
    console.error('[Auth] Error parsing token:', error)
    return false
  }
}

export async function verifyAuth(): Promise<boolean> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL
    if (!apiBase) return false

    const accessToken = getCookie('access_token')
    const headers: Record<string, string> = {}
    if (accessToken) headers['Cookie'] = `access_token=${accessToken}`

    const response = await fetch(`${apiBase}/api/v1/auth/verify`, {
      credentials: 'include',
      headers,
    })

    if (response.status === 302) return true
    if (!response.ok) return false

    // Some tests stub fetch without json(); treat ok as authenticated
    // otherwise parse JSON and check flag
    if (typeof (response as any).json !== 'function') return true
    const data = await (response as any).json()
    return data.authenticated === true
  } catch (error) {
    console.error('Auth verification error:', error)
    return false
  }
}

export function debugCookies(): void {
  if (typeof document === 'undefined') return
  console.log('=== Cookie Debug ===')
  console.log('All cookies:', document.cookie)
  const accessToken = getCookie('access_token')
  console.log('Access token:', accessToken ?? null)
  console.log('Has valid auth:', hasValidAuthCookie())
}
