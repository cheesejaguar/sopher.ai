'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/zustand'
import type { AppState, Chapter, ChapterGenerationJob } from '@/lib/zustand'
import {
  BookOpen,
  ChevronLeft,
  Play,
  Pause,
  Square,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  RefreshCw,
  ChevronRight,
  Sparkles,
} from 'lucide-react'

interface ChapterOutline {
  chapter_number: number
  title: string
  summary: string
  word_count_target?: number
}

interface GenerationProgress {
  total_chapters: number
  completed_chapters: number
  failed_chapters: number
  in_progress_chapters: number
  overall_progress: number
  word_count_total: number
}

function getChapterStatusColor(status: Chapter['status']): string {
  switch (status) {
    case 'pending':
      return 'bg-slate/20 text-slate'
    case 'generating':
      return 'bg-teal/20 text-teal'
    case 'completed':
      return 'bg-gold/20 text-gold'
    case 'error':
      return 'bg-red-500/20 text-red-400'
    default:
      return 'bg-slate/20 text-slate'
  }
}

function getChapterStatusIcon(status: Chapter['status']) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4" />
    case 'generating':
      return <Loader2 className="h-4 w-4 animate-spin" />
    case 'completed':
      return <CheckCircle className="h-4 w-4" />
    case 'error':
      return <AlertCircle className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

function formatWordCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return count.toString()
}

export default function ChapterGenerationPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [outlineChapters, setOutlineChapters] = useState<ChapterOutline[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)

  const user = useStore((state: AppState) => state.user)
  const currentProject = useStore((state: AppState) => state.currentProject)
  const chapters = useStore((state: AppState) => state.chapters)
  const setChapters = useStore((state: AppState) => state.setChapters)
  const updateChapter = useStore((state: AppState) => state.updateChapter)
  const addChapter = useStore((state: AppState) => state.addChapter)
  const generationJobs = useStore((state: AppState) => state.generationJobs)
  const setGenerationJobs = useStore((state: AppState) => state.setGenerationJobs)
  const updateGenerationJob = useStore((state: AppState) => state.updateGenerationJob)

  // Fetch outline to get chapter structure
  const fetchOutline = useCallback(async () => {
    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}/outline`, {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 404) {
          // No outline yet
          setOutlineChapters([])
          return
        }
        throw new Error('Failed to fetch outline')
      }

      const data = await response.json()
      if (data.chapters) {
        setOutlineChapters(data.chapters)
      }
    } catch (err) {
      console.error('Error fetching outline:', err)
      setError('Failed to load chapter outline')
    }
  }, [projectId])

  // Fetch existing chapters
  const fetchChapters = useCallback(async () => {
    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}/chapters`, {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 404) {
          setChapters([])
          return
        }
        throw new Error('Failed to fetch chapters')
      }

      const data = await response.json()
      setChapters(data.chapters || [])
    } catch (err) {
      console.error('Error fetching chapters:', err)
    }
  }, [projectId, setChapters])

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await Promise.all([fetchOutline(), fetchChapters()])
      setIsLoading(false)
    }
    loadData()
  }, [fetchOutline, fetchChapters])

  // Initialize generation jobs from outline
  useEffect(() => {
    if (outlineChapters.length > 0 && generationJobs.length === 0) {
      const jobs: ChapterGenerationJob[] = outlineChapters.map((ch) => {
        const existingChapter = chapters.find(
          (c) => c.chapter_number === ch.chapter_number
        )
        return {
          chapter_number: ch.chapter_number,
          status: existingChapter?.status === 'completed' ? 'completed' : 'pending',
          progress: existingChapter?.status === 'completed' ? 1 : 0,
        }
      })
      setGenerationJobs(jobs)
    }
  }, [outlineChapters, chapters, generationJobs.length, setGenerationJobs])

  // Generate a single chapter
  const generateChapter = useCallback(
    async (chapterNumber: number, signal?: AbortSignal): Promise<boolean> => {
      updateGenerationJob(chapterNumber, { status: 'running', progress: 0 })

      try {
        // Call backend directly for SSE streaming (Next.js rewrites buffer SSE responses)
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
        const response = await fetch(
          `${backendUrl}/api/v1/projects/${projectId}/chapters/${chapterNumber}/generate/stream`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            signal,
          }
        )

        if (!response.ok) {
          throw new Error(`Generation failed: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let content = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.event === 'token') {
                  content += data.data
                } else if (data.event === 'checkpoint') {
                  const checkpoint = JSON.parse(data.data)
                  updateGenerationJob(chapterNumber, {
                    progress: checkpoint.progress || 0,
                  })
                } else if (data.event === 'complete') {
                  const complete = JSON.parse(data.data)
                  updateGenerationJob(chapterNumber, {
                    status: 'completed',
                    progress: 1,
                  })
                  addChapter({
                    id: `ch-${chapterNumber}`,
                    project_id: projectId,
                    chapter_number: chapterNumber,
                    content,
                    word_count: complete.word_count || content.split(/\s+/).length,
                    status: 'completed',
                    progress: 1,
                  })
                  return true
                } else if (data.event === 'error') {
                  throw new Error(data.data)
                }
              } catch (parseErr) {
                // Not JSON, might be raw content
                content += line
              }
            }
          }
        }

        return true
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          updateGenerationJob(chapterNumber, { status: 'cancelled' })
          return false
        }
        updateGenerationJob(chapterNumber, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
        return false
      }
    },
    [projectId, updateGenerationJob, addChapter]
  )

  // Start generation of all pending chapters
  const startGeneration = useCallback(async () => {
    if (outlineChapters.length === 0) {
      setError('No outline available. Please create an outline first.')
      return
    }

    setIsGenerating(true)
    setIsPaused(false)
    setError(null)

    abortControllerRef.current = new AbortController()

    // Get pending chapters
    const pendingChapters = generationJobs
      .filter((j) => j.status === 'pending' || j.status === 'failed')
      .map((j) => j.chapter_number)
      .sort((a, b) => a - b)

    for (const chapterNum of pendingChapters) {
      if (abortControllerRef.current?.signal.aborted) {
        break
      }

      // Check if paused
      if (isPaused) {
        break
      }

      await generateChapter(chapterNum, abortControllerRef.current.signal)

      // Update progress
      const completed = generationJobs.filter(
        (j) => j.status === 'completed'
      ).length
      setProgress({
        total_chapters: outlineChapters.length,
        completed_chapters: completed + 1,
        failed_chapters: generationJobs.filter((j) => j.status === 'failed')
          .length,
        in_progress_chapters: 1,
        overall_progress: (completed + 1) / outlineChapters.length,
        word_count_total: chapters.reduce((acc, c) => acc + c.word_count, 0),
      })
    }

    setIsGenerating(false)
  }, [
    outlineChapters,
    generationJobs,
    chapters,
    isPaused,
    generateChapter,
  ])

  // Pause generation
  const pauseGeneration = useCallback(() => {
    setIsPaused(true)
    abortControllerRef.current?.abort()
  }, [])

  // Resume generation
  const resumeGeneration = useCallback(() => {
    setIsPaused(false)
    startGeneration()
  }, [startGeneration])

  // Stop generation completely
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsGenerating(false)
    setIsPaused(false)
  }, [])

  // Regenerate a single chapter
  const regenerateChapter = useCallback(
    async (chapterNumber: number) => {
      updateGenerationJob(chapterNumber, { status: 'pending', progress: 0 })
      await generateChapter(chapterNumber)
    },
    [generateChapter, updateGenerationJob]
  )

  // Calculate overall progress
  const overallProgress = generationJobs.length > 0
    ? generationJobs.filter((j) => j.status === 'completed').length /
      generationJobs.length
    : 0

  const totalWordCount = chapters.reduce((acc, c) => acc + c.word_count, 0)
  const completedCount = generationJobs.filter(
    (j) => j.status === 'completed'
  ).length
  const failedCount = generationJobs.filter((j) => j.status === 'failed').length

  if (isLoading) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-charcoal">
      {/* Header */}
      <header className="border-b border-slate/20 bg-charcoal/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/projects/${projectId}`)}
                className="p-2 text-slate hover:text-cream transition-colors"
                aria-label="Back to project"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-3">
                <BookOpen className="h-6 w-6 text-teal" />
                <div>
                  <h1 className="text-lg font-semibold text-cream">
                    Chapter Generation
                  </h1>
                  <p className="text-sm text-slate">
                    {currentProject?.name || 'Project'}
                  </p>
                </div>
              </div>
            </div>

            {/* Generation controls */}
            <div className="flex items-center gap-3">
              {!isGenerating && (
                <button
                  onClick={startGeneration}
                  disabled={outlineChapters.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-teal text-charcoal rounded-lg hover:bg-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="h-4 w-4" />
                  <span>
                    {completedCount > 0 ? 'Continue' : 'Start'} Generation
                  </span>
                </button>
              )}

              {isGenerating && !isPaused && (
                <>
                  <button
                    onClick={pauseGeneration}
                    className="flex items-center gap-2 px-4 py-2 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors"
                  >
                    <Pause className="h-4 w-4" />
                    <span>Pause</span>
                  </button>
                  <button
                    onClick={stopGeneration}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    <Square className="h-4 w-4" />
                    <span>Stop</span>
                  </button>
                </>
              )}

              {isPaused && (
                <button
                  onClick={resumeGeneration}
                  className="flex items-center gap-2 px-4 py-2 bg-teal text-charcoal rounded-lg hover:bg-teal/90 transition-colors"
                >
                  <Play className="h-4 w-4" />
                  <span>Resume</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* No outline message */}
        {outlineChapters.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <FileText className="h-16 w-16 text-slate/40 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-cream mb-2">
              No Outline Available
            </h2>
            <p className="text-slate mb-6">
              Create an outline first to generate chapters.
            </p>
            <button
              onClick={() => router.push(`/projects/${projectId}/outline`)}
              className="px-4 py-2 bg-teal text-charcoal rounded-lg hover:bg-teal/90 transition-colors"
            >
              Go to Outline
            </button>
          </div>
        )}

        {/* Progress overview */}
        {outlineChapters.length > 0 && (
          <>
            <div className="mb-8 p-6 bg-charcoal-light border border-slate/20 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-cream">
                  Generation Progress
                </h2>
                <div className="flex items-center gap-4 text-sm text-slate">
                  <span>
                    {completedCount} of {outlineChapters.length} chapters
                  </span>
                  <span>|</span>
                  <span>{formatWordCount(totalWordCount)} words</span>
                  {failedCount > 0 && (
                    <>
                      <span>|</span>
                      <span className="text-red-400">{failedCount} failed</span>
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 bg-slate/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal transition-all duration-300"
                  style={{ width: `${overallProgress * 100}%` }}
                />
              </div>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-cream">
                    {outlineChapters.length}
                  </p>
                  <p className="text-sm text-slate">Total Chapters</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gold">{completedCount}</p>
                  <p className="text-sm text-slate">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-teal">
                    {generationJobs.filter((j) => j.status === 'running').length}
                  </p>
                  <p className="text-sm text-slate">In Progress</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-cream">
                    {formatWordCount(totalWordCount)}
                  </p>
                  <p className="text-sm text-slate">Words Written</p>
                </div>
              </div>
            </div>

            {/* Chapter list */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-cream mb-4">Chapters</h2>
              {outlineChapters.map((outline) => {
                const job = generationJobs.find(
                  (j) => j.chapter_number === outline.chapter_number
                )
                const chapter = chapters.find(
                  (c) => c.chapter_number === outline.chapter_number
                )
                const status = job?.status || 'pending'

                return (
                  <div
                    key={outline.chapter_number}
                    className={`p-4 bg-charcoal-light border rounded-lg transition-colors ${
                      selectedChapter === outline.chapter_number
                        ? 'border-teal'
                        : 'border-slate/20 hover:border-slate/40'
                    }`}
                    onClick={() => setSelectedChapter(outline.chapter_number)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate/20 flex items-center justify-center text-cream font-medium">
                          {outline.chapter_number}
                        </div>
                        <div>
                          <h3 className="font-medium text-cream">
                            {outline.title || `Chapter ${outline.chapter_number}`}
                          </h3>
                          <p className="text-sm text-slate line-clamp-1">
                            {outline.summary}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Progress indicator */}
                        {status === 'running' && (
                          <div className="w-24">
                            <div className="h-2 bg-slate/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal transition-all duration-300"
                                style={{
                                  width: `${(job?.progress || 0) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Word count */}
                        {chapter?.word_count && (
                          <span className="text-sm text-slate">
                            {formatWordCount(chapter.word_count)} words
                          </span>
                        )}

                        {/* Status badge */}
                        <div
                          className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${getChapterStatusColor(
                            status as Chapter['status']
                          )}`}
                        >
                          {getChapterStatusIcon(status as Chapter['status'])}
                          <span className="capitalize">{status}</span>
                        </div>

                        {/* Actions */}
                        {(status === 'completed' || status === 'failed') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              regenerateChapter(outline.chapter_number)
                            }}
                            className="p-2 text-slate hover:text-cream transition-colors"
                            title="Regenerate chapter"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}

                        {status === 'completed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(
                                `/projects/${projectId}/chapters/${outline.chapter_number}`
                              )
                            }}
                            className="p-2 text-slate hover:text-cream transition-colors"
                            title="View chapter"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Error message */}
                    {job?.error && (
                      <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-300">
                        Error: {job.error}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
