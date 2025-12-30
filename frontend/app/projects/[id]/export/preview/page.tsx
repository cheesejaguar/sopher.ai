'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/zustand'
import type { AppState } from '@/lib/zustand'
import { Loader2, AlertCircle } from 'lucide-react'
import ManuscriptPreview from '@/components/ManuscriptPreview'
import Link from 'next/link'

// Types matching the ManuscriptPreview component
interface ChapterData {
  number: number
  title: string
  content: string
  word_count: number
}

interface ManuscriptData {
  title: string
  author: string | null
  chapters: ChapterData[]
  title_page?: {
    title: string
    subtitle?: string
    author_name?: string
    publisher?: string
    edition?: string
  }
  copyright_page?: {
    author_name: string
    year: number
    rights_statement: string
    isbn?: string
    publisher?: string
  }
  dedication?: {
    text: string
  }
  epigraph?: {
    text: string
    attribution?: string
    source?: string
  }
  acknowledgments?: string
  table_of_contents?: Array<{
    title: string
    chapter_number?: number
    level: number
  }>
  author_bio?: {
    text: string
    website?: string
    social_media?: Record<string, string>
  }
  also_by?: {
    author_name: string
    titles: string[]
    series_info?: Record<string, string[]>
  }
  excerpt?: {
    book_title: string
    text: string
    chapter_title?: string
    coming_soon_date?: string
  }
  total_words: number
}

export default function ManuscriptPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [manuscript, setManuscript] = useState<ManuscriptData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const user = useStore((state: AppState) => state.user)

  // Fetch manuscript data
  useEffect(() => {
    const fetchManuscript = async () => {
      if (!user?.access_token) return

      try {
        setIsLoading(true)
        setError(null)

        // Fetch full manuscript for preview
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/export/manuscript`,
          {
            headers: {
              Authorization: `Bearer ${user.access_token}`,
            },
          }
        )

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Manuscript not found. Please generate chapters first.')
          }
          throw new Error('Failed to load manuscript')
        }

        const data = await response.json()
        setManuscript(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchManuscript()
  }, [projectId, user])

  // Handle back navigation
  const handleBack = () => {
    router.push(`/projects/${projectId}/export`)
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-cream flex items-center justify-center"
        data-testid="preview-loading"
      >
        <div className="flex items-center gap-3 text-charcoal">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Loading manuscript...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !manuscript) {
    return (
      <div
        className="min-h-screen bg-cream flex items-center justify-center"
        data-testid="preview-error"
      >
        <div className="text-center max-w-md px-4">
          <AlertCircle className="h-12 w-12 text-coral mx-auto mb-4" />
          <p className="text-charcoal text-lg mb-4">{error || 'Manuscript not found'}</p>
          <Link
            href={`/projects/${projectId}/export`}
            className="text-teal hover:underline"
          >
            Return to export options
          </Link>
        </div>
      </div>
    )
  }

  return <ManuscriptPreview projectId={projectId} manuscript={manuscript} onBack={handleBack} />
}
