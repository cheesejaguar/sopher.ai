'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Project } from '@/lib/zustand'
import { getCookie } from '@/lib/auth'
import {
  BookOpen,
  ChevronLeft,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileType,
  Settings2,
  Eye,
  Clock,
  FileDown,
  RefreshCw,
} from 'lucide-react'

// Types
interface ExportFormat {
  id: string
  name: string
  description: string
  extension: string
  available: boolean
}

interface FrontMatterOptions {
  include_title_page: boolean
  include_copyright: boolean
  include_dedication: boolean
  include_epigraph: boolean
  include_acknowledgments: boolean
  include_toc: boolean
}

interface BackMatterOptions {
  include_author_bio: boolean
  include_also_by: boolean
  include_excerpt: boolean
}

interface FormattingOptions {
  chapter_style: 'numbered' | 'titled' | 'both'
  scene_break_style: 'asterisks' | 'blank' | 'ornamental'
  include_chapter_epigraphs: boolean
}

interface ExportRequest {
  format: string
  front_matter: FrontMatterOptions
  back_matter: BackMatterOptions
  formatting: FormattingOptions
  include_metadata: boolean
}

interface ExportJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  format: string
  download_url?: string
  file_name?: string
  file_size?: number
  error_message?: string
  created_at: string
  completed_at?: string
}

interface ManuscriptPreview {
  title: string
  author: string | null
  total_words: number
  chapter_count: number
  front_matter_sections: string[]
  back_matter_sections: string[]
  estimated_pages: number
  reading_time_minutes: number
}

// Available export formats
const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'text',
    name: 'Plain Text',
    description: 'Simple text format, compatible with any editor',
    extension: '.txt',
    available: true,
  },
  {
    id: 'markdown',
    name: 'Markdown',
    description: 'Formatted markdown for easy editing and conversion',
    extension: '.md',
    available: true,
  },
  {
    id: 'docx',
    name: 'Microsoft Word',
    description: 'Standard document format for word processors',
    extension: '.docx',
    available: false,
  },
  {
    id: 'pdf',
    name: 'PDF',
    description: 'Portable document format for printing and sharing',
    extension: '.pdf',
    available: false,
  },
  {
    id: 'epub',
    name: 'EPUB',
    description: 'E-book format for digital readers',
    extension: '.epub',
    available: false,
  },
]

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Format reading time
function formatReadingTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes === 0) {
    return `${hours} hr`
  }
  return `${hours} hr ${remainingMinutes} min`
}

export default function ExportPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // State
  const [project, setProject] = useState<Project | null>(null)
  const [preview, setPreview] = useState<ManuscriptPreview | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<string>('markdown')
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Front matter options
  const [frontMatter, setFrontMatter] = useState<FrontMatterOptions>({
    include_title_page: true,
    include_copyright: true,
    include_dedication: true,
    include_epigraph: true,
    include_acknowledgments: true,
    include_toc: true,
  })

  // Back matter options
  const [backMatter, setBackMatter] = useState<BackMatterOptions>({
    include_author_bio: true,
    include_also_by: true,
    include_excerpt: false,
  })

  // Formatting options
  const [formatting, setFormatting] = useState<FormattingOptions>({
    chapter_style: 'both',
    scene_break_style: 'asterisks',
    include_chapter_epigraphs: true,
  })

  // Fetch project data
  useEffect(() => {
    const fetchData = async () => {
      const accessToken = getCookie('access_token')
      if (!accessToken) return

      try {
        setIsLoading(true)
        setError(null)

        // Fetch project
        const projectResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        if (!projectResponse.ok) {
          throw new Error('Failed to fetch project')
        }

        const projectData = await projectResponse.json()
        setProject(projectData)

        // Fetch manuscript preview
        const previewResponse = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/export/preview`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        if (previewResponse.ok) {
          const previewData = await previewResponse.json()
          setPreview(previewData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [projectId])

  // Start export
  const handleExport = useCallback(async () => {
    const accessToken = getCookie('access_token')
    if (!accessToken) return

    try {
      setIsExporting(true)
      setError(null)
      setExportJob(null)

      const request: ExportRequest = {
        format: selectedFormat,
        front_matter: frontMatter,
        back_matter: backMatter,
        formatting,
        include_metadata: true,
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/export`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Export failed')
      }

      const job: ExportJob = await response.json()
      setExportJob(job)

      // Poll for job completion
      pollExportJob(job.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
      setIsExporting(false)
    }
  }, [projectId, selectedFormat, frontMatter, backMatter, formatting])

  // Poll for export job status
  const pollExportJob = useCallback(
    async (jobId: string) => {
      const accessToken = getCookie('access_token')
      if (!accessToken) return

      const poll = async () => {
        const token = getCookie('access_token')
        if (!token) {
          setIsExporting(false)
          return
        }

        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/export/${jobId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )

          if (!response.ok) {
            throw new Error('Failed to check export status')
          }

          const job: ExportJob = await response.json()
          setExportJob(job)

          if (job.status === 'pending' || job.status === 'processing') {
            // Continue polling
            setTimeout(poll, 1000)
          } else {
            setIsExporting(false)
          }
        } catch {
          setIsExporting(false)
        }
      }

      poll()
    },
    [projectId]
  )

  // Download exported file
  const handleDownload = useCallback(async () => {
    const accessToken = getCookie('access_token')
    if (!accessToken || !exportJob?.download_url) return

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/projects/${projectId}/export/${exportJob.id}/download`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Download failed')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportJob.file_name || `manuscript.${selectedFormat}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }, [projectId, exportJob, selectedFormat])

  // Render loading state
  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-cream flex items-center justify-center"
        data-testid="export-loading"
      >
        <div className="flex items-center gap-3 text-charcoal">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Loading export options...</span>
        </div>
      </div>
    )
  }

  // Render error state
  if (error && !project) {
    return (
      <div
        className="min-h-screen bg-cream flex items-center justify-center"
        data-testid="export-error"
      >
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-coral mx-auto mb-4" />
          <p className="text-charcoal text-lg mb-4">{error}</p>
          <Link
            href={`/projects/${projectId}`}
            className="text-teal hover:underline"
          >
            Return to project
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream" data-testid="export-page">
      {/* Header */}
      <header className="bg-white border-b border-slate/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/projects/${projectId}`}
                className="p-2 hover:bg-slate/10 rounded-lg transition-colors"
                data-testid="back-button"
              >
                <ChevronLeft className="h-5 w-5 text-charcoal" />
              </Link>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-teal" />
                <span className="text-charcoal font-semibold">
                  {project?.name || 'Export'}
                </span>
              </div>
            </div>
            <h1 className="text-xl font-bold text-charcoal">Export Manuscript</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Options */}
          <div className="lg:col-span-2 space-y-6">
            {/* Format Selection */}
            <section className="bg-white rounded-xl shadow-sm p-6" data-testid="format-section">
              <h2 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-2">
                <FileType className="h-5 w-5 text-teal" />
                Export Format
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {EXPORT_FORMATS.map((format) => (
                  <button
                    key={format.id}
                    onClick={() => format.available && setSelectedFormat(format.id)}
                    disabled={!format.available}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      selectedFormat === format.id
                        ? 'border-teal bg-teal/5'
                        : format.available
                          ? 'border-slate/20 hover:border-slate/40'
                          : 'border-slate/10 bg-slate/5 opacity-60 cursor-not-allowed'
                    }`}
                    data-testid={`format-option-${format.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-charcoal">{format.name}</span>
                      <span className="text-sm text-slate">{format.extension}</span>
                    </div>
                    <p className="text-sm text-slate">{format.description}</p>
                    {!format.available && (
                      <span className="text-xs text-coral mt-2 block">Coming soon</span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Front Matter Options */}
            <section className="bg-white rounded-xl shadow-sm p-6" data-testid="front-matter-section">
              <h2 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal" />
                Front Matter
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { key: 'include_title_page', label: 'Title Page' },
                  { key: 'include_copyright', label: 'Copyright' },
                  { key: 'include_dedication', label: 'Dedication' },
                  { key: 'include_epigraph', label: 'Epigraph' },
                  { key: 'include_acknowledgments', label: 'Acknowledgments' },
                  { key: 'include_toc', label: 'Table of Contents' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer"
                    data-testid={`front-matter-${key}`}
                  >
                    <input
                      type="checkbox"
                      checked={frontMatter[key as keyof FrontMatterOptions]}
                      onChange={(e) =>
                        setFrontMatter((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 text-teal border-slate/30 rounded focus:ring-teal"
                    />
                    <span className="text-charcoal">{label}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Back Matter Options */}
            <section className="bg-white rounded-xl shadow-sm p-6" data-testid="back-matter-section">
              <h2 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal" />
                Back Matter
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { key: 'include_author_bio', label: 'Author Bio' },
                  { key: 'include_also_by', label: 'Also By Author' },
                  { key: 'include_excerpt', label: 'Book Excerpt' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 cursor-pointer"
                    data-testid={`back-matter-${key}`}
                  >
                    <input
                      type="checkbox"
                      checked={backMatter[key as keyof BackMatterOptions]}
                      onChange={(e) =>
                        setBackMatter((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 text-teal border-slate/30 rounded focus:ring-teal"
                    />
                    <span className="text-charcoal">{label}</span>
                  </label>
                ))}
              </div>
            </section>

            {/* Formatting Options */}
            <section className="bg-white rounded-xl shadow-sm p-6" data-testid="formatting-section">
              <h2 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-teal" />
                Formatting
              </h2>
              <div className="space-y-4">
                {/* Chapter Style */}
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">
                    Chapter Style
                  </label>
                  <select
                    value={formatting.chapter_style}
                    onChange={(e) =>
                      setFormatting((prev) => ({
                        ...prev,
                        chapter_style: e.target.value as FormattingOptions['chapter_style'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate/30 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                    data-testid="chapter-style-select"
                  >
                    <option value="numbered">Numbered (Chapter 1, Chapter 2...)</option>
                    <option value="titled">Titled (Chapter Title only)</option>
                    <option value="both">Both (Chapter 1: Title)</option>
                  </select>
                </div>

                {/* Scene Break Style */}
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">
                    Scene Break Style
                  </label>
                  <select
                    value={formatting.scene_break_style}
                    onChange={(e) =>
                      setFormatting((prev) => ({
                        ...prev,
                        scene_break_style: e.target.value as FormattingOptions['scene_break_style'],
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate/30 rounded-lg focus:ring-2 focus:ring-teal focus:border-teal"
                    data-testid="scene-break-select"
                  >
                    <option value="asterisks">Asterisks (* * *)</option>
                    <option value="blank">Blank Line</option>
                    <option value="ornamental">Ornamental (~ * ~ * ~)</option>
                  </select>
                </div>

                {/* Chapter Epigraphs */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formatting.include_chapter_epigraphs}
                    onChange={(e) =>
                      setFormatting((prev) => ({
                        ...prev,
                        include_chapter_epigraphs: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 text-teal border-slate/30 rounded focus:ring-teal"
                    data-testid="chapter-epigraphs-checkbox"
                  />
                  <span className="text-charcoal">Include chapter epigraphs</span>
                </label>
              </div>
            </section>
          </div>

          {/* Right Column - Preview & Export */}
          <div className="space-y-6">
            {/* Manuscript Preview */}
            {preview && (
              <section className="bg-white rounded-xl shadow-sm p-6" data-testid="preview-section">
                <h2 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-2">
                  <Eye className="h-5 w-5 text-teal" />
                  Manuscript Preview
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate">Title</span>
                    <span className="text-charcoal font-medium">{preview.title}</span>
                  </div>
                  {preview.author && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate">Author</span>
                      <span className="text-charcoal">{preview.author}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate">Chapters</span>
                    <span className="text-charcoal">{preview.chapter_count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate">Word Count</span>
                    <span className="text-charcoal">
                      {preview.total_words.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate">Est. Pages</span>
                    <span className="text-charcoal">{preview.estimated_pages}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate">Reading Time</span>
                    <span className="text-charcoal flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {formatReadingTime(preview.reading_time_minutes)}
                    </span>
                  </div>

                  {preview.front_matter_sections.length > 0 && (
                    <div className="pt-2 border-t border-slate/10">
                      <span className="text-xs text-slate uppercase tracking-wide">
                        Front Matter
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {preview.front_matter_sections.map((section) => (
                          <span
                            key={section}
                            className="px-2 py-0.5 bg-teal/10 text-teal text-xs rounded"
                          >
                            {section}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {preview.back_matter_sections.length > 0 && (
                    <div className="pt-2 border-t border-slate/10">
                      <span className="text-xs text-slate uppercase tracking-wide">
                        Back Matter
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {preview.back_matter_sections.map((section) => (
                          <span
                            key={section}
                            className="px-2 py-0.5 bg-gold/10 text-gold text-xs rounded"
                          >
                            {section}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Export Button & Status */}
            <section className="bg-white rounded-xl shadow-sm p-6" data-testid="export-action-section">
              {/* Error Message */}
              {error && (
                <div
                  className="mb-4 p-3 bg-coral/10 text-coral rounded-lg flex items-center gap-2"
                  data-testid="export-error-message"
                >
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {/* Export Progress */}
              {exportJob && exportJob.status !== 'completed' && (
                <div className="mb-4" data-testid="export-progress">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-charcoal">
                      {exportJob.status === 'pending' && 'Preparing export...'}
                      {exportJob.status === 'processing' && 'Generating manuscript...'}
                      {exportJob.status === 'failed' && 'Export failed'}
                    </span>
                    <span className="text-sm text-slate">{exportJob.progress}%</span>
                  </div>
                  <div className="h-2 bg-slate/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        exportJob.status === 'failed' ? 'bg-coral' : 'bg-teal'
                      }`}
                      style={{ width: `${exportJob.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Export Complete */}
              {exportJob?.status === 'completed' && (
                <div
                  className="mb-4 p-4 bg-teal/10 rounded-lg"
                  data-testid="export-complete"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-teal" />
                    <span className="font-medium text-charcoal">Export Complete!</span>
                  </div>
                  <div className="text-sm text-slate space-y-1">
                    <p>File: {exportJob.file_name}</p>
                    {exportJob.file_size && (
                      <p>Size: {formatFileSize(exportJob.file_size)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                {exportJob?.status === 'completed' ? (
                  <>
                    <button
                      onClick={handleDownload}
                      className="w-full py-3 bg-teal text-white rounded-lg font-medium hover:bg-teal/90 transition-colors flex items-center justify-center gap-2"
                      data-testid="download-button"
                    >
                      <FileDown className="h-5 w-5" />
                      Download {exportJob.file_name}
                    </button>
                    <button
                      onClick={() => {
                        setExportJob(null)
                        setError(null)
                      }}
                      className="w-full py-3 bg-slate/10 text-charcoal rounded-lg font-medium hover:bg-slate/20 transition-colors flex items-center justify-center gap-2"
                      data-testid="export-another-button"
                    >
                      <RefreshCw className="h-5 w-5" />
                      Export Another Format
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                      isExporting
                        ? 'bg-slate/20 text-slate cursor-not-allowed'
                        : 'bg-teal text-white hover:bg-teal/90'
                    }`}
                    data-testid="export-button"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        Export as {EXPORT_FORMATS.find((f) => f.id === selectedFormat)?.name}
                      </>
                    )}
                  </button>
                )}
              </div>
            </section>

            {/* Preview Manuscript Link */}
            <Link
              href={`/projects/${projectId}/export/preview`}
              className="block bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
              data-testid="preview-link"
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gold/10 rounded-lg">
                  <Eye className="h-6 w-6 text-gold" />
                </div>
                <div>
                  <h3 className="font-medium text-charcoal">Preview Full Manuscript</h3>
                  <p className="text-sm text-slate">
                    Read your complete book before exporting
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
