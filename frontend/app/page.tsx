'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { MeshGradient } from '@/components/BackgroundEffects'

export default function Home() {
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      // Check for OAuth callback params
      const urlParams = new URLSearchParams(window.location.search)
      const fromOAuth = urlParams.get('oauth') === 'success'
      const fromOAuthError = urlParams.get('oauth') === 'error'
      const errorMessage = urlParams.get('error')

      // Handle OAuth error - redirect to login with error
      if (fromOAuthError) {
        const errorParam = errorMessage ? `&error=${encodeURIComponent(errorMessage)}` : ''
        window.location.href = `/login?oauth=error${errorParam}`
        return
      }

      // If coming from OAuth success, wait a moment for cookies to propagate
      if (fromOAuth) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      try {
        // Check if user is authenticated
        const response = await fetch('/api/backend/auth/me', {
          credentials: 'include',
        })

        if (response.ok) {
          // User is authenticated, redirect to projects
          window.location.href = '/projects'
        } else {
          // User is not authenticated, redirect to login
          window.location.href = '/login'
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        window.location.href = '/login'
      }
    }

    checkAuthAndRedirect()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-charcoal">
      <MeshGradient />
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-aurora-teal" />
        <p className="text-mist">Loading...</p>
      </div>
    </div>
  )
}
