'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useStore } from '@/lib/zustand'
import type { AppState, User, Project } from '@/lib/zustand'
import { MeshGradient } from '@/components/BackgroundEffects'
import ReactMarkdown from 'react-markdown'
import {
  BookOpen,
  LogOut,
  User as UserIcon,
  ChevronLeft,
  Settings,
  Trash2,
  Edit,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  DollarSign,
  Calendar,
  Target,
  BookText,
  Save,
  Users,
  Pen,
  Cpu,
  X,
  ChevronDown,
  FileEdit,
  ListTree,
  PenTool,
  Sparkles,
  Eye,
  Send,
  Check,
  BookCheck,
} from 'lucide-react'

const PROJECT_PHASES = [
  { id: 'description', label: 'Description', icon: FileEdit },
  { id: 'outline', label: 'Outline', icon: ListTree },
  { id: 'writing', label: 'Writing', icon: PenTool },
  { id: 'editing', label: 'Editing', icon: Sparkles },
  { id: 'reviewing', label: 'Reviewing', icon: Eye },
  { id: 'publish', label: 'Publish', icon: Send },
] as const

type PhaseId = typeof PROJECT_PHASES[number]['id']

function getCurrentPhase(
  project: Project,
  hasOutline: boolean,
  hasChapters: boolean = false,
  allChaptersComplete: boolean = false,
  reviewComplete: boolean = false
): PhaseId {
  // Check if we have a brief/description
  if (!project.brief && !project.description) {
    return 'description'
  }

  // Check project status for later phases
  if (project.status === 'completed') {
    return 'publish'
  }

  // If review is complete or project is in reviewing status
  if (project.status === 'reviewing' || reviewComplete) {
    return 'reviewing'
  }

  // If all chapters are complete, advance to editing phase
  if (allChaptersComplete) {
    return 'editing'
  }

  // If we have chapters being written
  if (hasChapters || project.status === 'in_progress') {
    return 'writing'
  }

  // If we have an outline, we're ready for writing
  if (hasOutline) {
    return 'writing'
  }

  // Default to outline phase if we have description but no outline yet
  return 'outline'
}

function getPhaseIndex(phaseId: PhaseId): number {
  return PROJECT_PHASES.findIndex(p => p.id === phaseId)
}

const MODELS = [
  { id: 'openrouter/anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', tier: 'premium' },
  { id: 'openrouter/openai/gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI', tier: 'premium' },
  { id: 'openrouter/x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', provider: 'xAI', tier: 'standard' },
  { id: 'openrouter/google/gemini-3-pro-preview', name: 'Gemini 3 Pro', provider: 'Google', tier: 'standard' },
  { id: 'openrouter/deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', provider: 'DeepSeek', tier: 'economy' },
] as const

function getModelInfo(modelId: string | undefined) {
  if (!modelId) return null
  return MODELS.find(m => m.id === modelId) || null
}

function getTierColor(tier: string) {
  switch (tier) {
    case 'premium':
      return 'text-amber-400'
    case 'standard':
      return 'text-aurora-teal'
    case 'economy':
      return 'text-nebula-blue'
    default:
      return 'text-mist'
  }
}

interface ProjectStats {
  project_id: string
  session_count: number
  artifact_count: number
  total_cost_usd: number
  status: string
}

interface ChapterContent {
  number: number
  title: string
  content: string
  wordCount: number
  status: 'pending' | 'generating' | 'complete' | 'error'
}

interface ProjectSettings {
  target_audience?: string
  tone?: string
  pov?: string
  tense?: string
  dialogue_style?: string
  prose_style?: string
  chapter_length_target?: number
  character_bible_text?: string
  world_building_text?: string
  model?: string
}

function getStatusColor(status: Project['status']): string {
  switch (status) {
    case 'draft':
      return 'bg-slate/20 text-mist border border-slate/30'
    case 'in_progress':
      return 'bg-aurora-teal/20 text-aurora-teal border border-aurora-teal/30'
    case 'completed':
      return 'bg-ember/20 text-ember border border-ember/30'
    default:
      return 'bg-slate/20 text-mist border border-slate/30'
  }
}

function getStatusIcon(status: Project['status']) {
  switch (status) {
    case 'draft':
      return <Edit className="h-4 w-4" />
    case 'in_progress':
      return <Clock className="h-4 w-4" />
    case 'completed':
      return <CheckCircle className="h-4 w-4" />
    default:
      return <Edit className="h-4 w-4" />
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Editable fields
  const [characterBios, setCharacterBios] = useState('')
  const [writingStyle, setWritingStyle] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Model selection popover
  const [showModelPopover, setShowModelPopover] = useState(false)
  const [isUpdatingModel, setIsUpdatingModel] = useState(false)

  // Outline generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationStage, setGenerationStage] = useState('')
  const [outlineContent, setOutlineContent] = useState('')
  const [outlineError, setOutlineError] = useState<string | null>(null)

  // Token statistics
  const [tokenCount, setTokenCount] = useState(0)
  const [estimatedCost, setEstimatedCost] = useState(0)
  const [generationDuration, setGenerationDuration] = useState(0)
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null)

  // Content tabs
  const [activeTab, setActiveTab] = useState<'brief' | 'outline' | 'manuscript'>('brief')

  // Chapter generation
  const [chapters, setChapters] = useState<ChapterContent[]>([])
  const [generatingChapter, setGeneratingChapter] = useState<number | null>(null)
  const [chapterError, setChapterError] = useState<string | null>(null)
  const [viewingChapter, setViewingChapter] = useState<number | null>(null)

  // Chapter deletion
  const [deletingChapter, setDeletingChapter] = useState<number | null>(null)
  const [showDeleteChapterConfirm, setShowDeleteChapterConfirm] = useState<number | null>(null)

  // Suggest edits
  const [suggestEditsChapter, setSuggestEditsChapter] = useState<number | null>(null)
  const [suggestEditsPrompt, setSuggestEditsPrompt] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Literary review - comprehensive review data based on NYT guidelines
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewProgress, setReviewProgress] = useState(0)
  const [reviewPhase, setReviewPhase] = useState('')
  const [reviewPhaseDetail, setReviewPhaseDetail] = useState('')
  const [reviewComplete, setReviewComplete] = useState(false)
  const [reviewScore, setReviewScore] = useState<number | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewPhaseScores, setReviewPhaseScores] = useState<Record<string, number>>({})
  const [reviewPhaseSummaries, setReviewPhaseSummaries] = useState<Record<string, string>>({})
  const [reviewRecommendation, setReviewRecommendation] = useState('')
  const [reviewIssues, setReviewIssues] = useState<Array<{ phase: string; type: string; chapter?: number; issue?: string; error?: string }>>([])
  const [reviewChapterCount, setReviewChapterCount] = useState(0)
  const [reviewWordCount, setReviewWordCount] = useState(0)

  // Publish modal
  const [showPublishModal, setShowPublishModal] = useState(false)

  const user = useStore((state: AppState) => state.user)
  const setUser = useStore((state: AppState) => state.setUser)
  const setCurrentProject = useStore((state: AppState) => state.setCurrentProject)
  const removeProject = useStore((state: AppState) => state.removeProject)

  const fetchProject = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data: Project = await response.json()
        setProject(data)
        setCurrentProject(data)
        // Initialize editable fields from project data
        const settings = data.settings as ProjectSettings | undefined
        setCharacterBios(settings?.character_bible_text || '')
        setWritingStyle(data.style_guide || '')
      } else if (response.status === 401) {
        window.location.href = '/login'
      } else if (response.status === 404) {
        setError('Project not found')
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.detail || 'Failed to load project')
      }
    } catch (err) {
      setError('Network error. Please try again.')
      console.error('Error fetching project:', err)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, setCurrentProject])

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}/stats`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data: ProjectStats = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }, [projectId])

  const fetchOutline = useCallback(async () => {
    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}/outline`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.content) {
          setOutlineContent(data.content)
          // Extract token count from metadata if available
          if (data.meta?.tokens) {
            setTokenCount(data.meta.tokens)
          }
        }
      }
      // 404 is expected if no outline exists yet - don't log as error
    } catch (err) {
      console.error('Error fetching outline:', err)
    }
  }, [projectId])

  const fetchChapters = useCallback(async () => {
    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}/chapters`, {
        credentials: 'include',
      })

      console.log('[fetchChapters] Response status:', response.status)

      if (response.ok) {
        const data = await response.json()
        console.log('[fetchChapters] Data:', data)
        if (data.chapters && data.chapters.length > 0) {
          // Fetch content for each chapter
          const fetchedChapters: ChapterContent[] = await Promise.all(
            data.chapters.map(async (ch: { chapter_number: number; word_count?: number; meta?: { tokens?: number } }) => {
              try {
                const chapterResponse = await fetch(
                  `/api/backend/v1/projects/${projectId}/chapters/${ch.chapter_number}`,
                  { credentials: 'include' }
                )
                if (chapterResponse.ok) {
                  const chapterData = await chapterResponse.json()
                  return {
                    number: ch.chapter_number,
                    title: `Chapter ${ch.chapter_number}`,
                    content: chapterData.content || '',
                    wordCount: ch.word_count || chapterData.content?.split(/\s+/).length || 0,
                    status: 'complete' as const,
                  }
                }
              } catch (e) {
                console.error(`Error fetching chapter ${ch.chapter_number}:`, e)
              }
              return {
                number: ch.chapter_number,
                title: `Chapter ${ch.chapter_number}`,
                content: '',
                wordCount: ch.word_count || 0,
                status: 'complete' as const,
              }
            })
          )
          // Merge fetched chapters with existing (preserving pending chapters and titles from outline)
          setChapters(prev => {
            const fetchedByNumber = new Map(fetchedChapters.map(ch => [ch.number, ch]))

            // Update existing chapters with fetched data, but keep title from outline if it exists
            const merged = prev.map(ch => {
              const fetched = fetchedByNumber.get(ch.number)
              if (fetched) {
                // Keep the title from outline (prev) if it's not generic
                const title = ch.title && !ch.title.match(/^Chapter \d+$/) ? ch.title : fetched.title
                return { ...fetched, title }
              }
              return ch
            })

            // Add any fetched chapters that weren't in prev
            const existingNumbers = new Set(prev.map(ch => ch.number))
            const newChapters = fetchedChapters.filter(ch => !existingNumbers.has(ch.number))
            return [...merged, ...newChapters].sort((a, b) => a.number - b.number)
          })
        }
      }
      // 404 is expected if no chapters exist yet
    } catch (err) {
      console.error('Error fetching chapters:', err)
    }
  }, [projectId])

  const fetchLiteraryReview = useCallback(async () => {
    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}/continuity/literary-review`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.has_review) {
          setReviewScore(data.overall_score || 0)
          setReviewRecommendation(data.recommendation || '')
          setReviewPhaseScores(data.phase_scores || {})
          setReviewPhaseSummaries(data.phase_summaries || {})
          setReviewIssues(data.issues || [])
          setReviewChapterCount(data.chapter_count || 0)
          setReviewWordCount(data.word_count || 0)
          setReviewComplete(true)
        }
      }
    } catch (err) {
      console.error('Error fetching literary review:', err)
    }
  }, [projectId])

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userResponse = await fetch('/api/backend/auth/me', {
          credentials: 'include',
        })

        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData as User)
        } else if (userResponse.status === 401) {
          window.location.href = '/login'
        }
      } catch (error) {
        console.error('Failed to fetch user:', error)
      }
    }

    fetchUserData()
  }, [setUser])

  useEffect(() => {
    if (user && projectId) {
      fetchProject()
      fetchStats()
      fetchOutline()
      fetchChapters()
      fetchLiteraryReview()
    }
  }, [user, projectId, fetchProject, fetchStats, fetchOutline, fetchChapters, fetchLiteraryReview])

  const handleLogout = async () => {
    await fetch('/api/backend/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    window.location.href = '/login'
  }

  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        removeProject(projectId)
        setCurrentProject(null)
        window.location.href = '/projects'
      } else if (response.status === 401) {
        window.location.href = '/login'
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.detail || 'Failed to delete project')
      }
    } catch (err) {
      setError('Network error. Please try again.')
      console.error('Error deleting project:', err)
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleStartGeneration = async () => {
    if (!project || isGenerating) return

    // Need a brief to generate outline
    if (!project.brief && !project.description) {
      setOutlineError('Please add a book description/brief before generating an outline.')
      setActiveTab('outline')
      return
    }

    // Switch to outline tab immediately
    setActiveTab('outline')
    setIsGenerating(true)
    setGenerationProgress(0)
    setGenerationStage('Connecting...')
    setOutlineContent('')
    setOutlineError(null)
    setTokenCount(0)
    setEstimatedCost(0)
    setGenerationDuration(0)
    const startTime = Date.now()
    setGenerationStartTime(startTime)

    // Update duration every second while generating
    const durationInterval = setInterval(() => {
      setGenerationDuration(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    try {
      // Get selected model from project settings
      const projectSettings = project.settings as ProjectSettings | undefined
      const selectedModel = projectSettings?.model || 'openrouter/anthropic/claude-sonnet-4.5'

      const params = new URLSearchParams({
        brief: project.brief || project.description || '',
        target_chapters: String(project.target_chapters || 10),
        model: selectedModel,
      })
      if (project.style_guide) params.append('style_guide', project.style_guide)
      if (project.genre) params.append('genre', project.genre)

      setGenerationStage(`Starting with ${selectedModel.split('/').pop()}...`)

      // Call backend directly for SSE streaming (Next.js rewrites buffer SSE responses)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(
        `${backendUrl}/api/v1/projects/${projectId}/outline/stream?${params}`,
        {
          credentials: 'include',
          headers: { Accept: 'text/event-stream' },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = 'Failed to start outline generation'
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.detail || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let content = ''
      let tokens = 0
      let currentEvent = ''

      setGenerationStage('Streaming response...')

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          setGenerationStage('Complete!')
          setGenerationProgress(100)
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // Track event type
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
            continue
          }

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            if (!data) continue

            // Handle based on event type or content
            if (currentEvent === 'token' || (!data.startsWith('{') && !data.startsWith('['))) {
              // Plain text token
              tokens++
              content += data
              setOutlineContent(content)
              setTokenCount(tokens)
              // Estimate cost: ~$0.003 per 1K tokens for Claude Sonnet
              setEstimatedCost(tokens * 0.000003)

              // Update progress based on token count (estimate 2000-4000 tokens for outline)
              const estimatedProgress = Math.min((tokens / 3000) * 100, 95)
              setGenerationProgress(estimatedProgress)
            } else if (data.startsWith('{')) {
              try {
                const parsed = JSON.parse(data)

                // Handle checkpoint events
                if (parsed.progress !== undefined) {
                  setGenerationProgress(parsed.progress * 100)
                }
                if (parsed.stage) {
                  const stageLabels: Record<string, string> = {
                    generating_concepts: 'Generating concepts...',
                    concepts_complete: 'Creating outline structure...',
                  }
                  setGenerationStage(stageLabels[parsed.stage] || parsed.stage)
                }
                if (typeof parsed.tokens === 'number') {
                  tokens = parsed.tokens
                  setTokenCount(tokens)
                  // Estimate cost based on tokens (combined input/output estimate)
                  // Claude Sonnet: ~$3/M input, ~$15/M output - use average ~$9/M
                  setEstimatedCost(tokens * 0.000009)
                }
                if (parsed.checkpoint) {
                  setGenerationStage(`Streaming... (${tokens} tokens)`)
                }

                // Handle error events
                if (parsed.error) {
                  throw new Error(parsed.error)
                }

                // Handle complete events
                if (parsed.outline_id || parsed.cached !== undefined) {
                  setGenerationProgress(100)
                  setGenerationStage('Complete!')
                  if (typeof parsed.tokens === 'number') {
                    tokens = parsed.tokens
                    setTokenCount(tokens)
                    setEstimatedCost(tokens * 0.000009)
                  }
                  if (typeof parsed.duration === 'number') {
                    setGenerationDuration(Math.floor(parsed.duration))
                  }
                }

                // Handle cached content
                if (parsed.source === 'cache' && parsed.content) {
                  content = parsed.content
                  setOutlineContent(content)
                  setGenerationStage('Loaded from cache')
                  // Count tokens in cached content (rough estimate: 1 token ≈ 4 chars)
                  tokens = Math.ceil(content.length / 4)
                  setTokenCount(tokens)
                }

                // Handle preview in checkpoint
                if (parsed.preview && !content) {
                  content = parsed.preview
                  setOutlineContent(content)
                }
              } catch (e) {
                // JSON parse failed, treat as content
                if (e instanceof SyntaxError) {
                  tokens++
                  content += data
                  setOutlineContent(content)
                  setTokenCount(tokens)
                } else {
                  throw e
                }
              }
            }

            // Reset event type after processing
            currentEvent = ''
          }
        }
      }
    } catch (err) {
      console.error('Outline generation error:', err)
      setOutlineError(err instanceof Error ? err.message : 'Generation failed')
      setGenerationStage('Failed')
    } finally {
      clearInterval(durationInterval)
      setGenerationDuration(Math.floor((Date.now() - startTime) / 1000))
      setIsGenerating(false)
      setGenerationStartTime(null)
    }
  }

  // Initialize/merge chapters from outline when outline is loaded
  // This preserves any existing (fetched) chapters and adds pending ones from outline
  const initializeChaptersFromOutline = useCallback(() => {
    if (!outlineContent) return

    // Parse outline to extract chapter information
    // Look for patterns like "Chapter 1:", "## Chapter 1", "### 1.", etc.
    const chapterMatches = outlineContent.match(/(?:^|\n)(?:#{1,3}\s*)?(?:Chapter\s+)?(\d+)[.:]\s*([^\n]+)/gi)

    let outlineChapters: { number: number; title: string }[] = []

    if (chapterMatches && chapterMatches.length > 0) {
      outlineChapters = chapterMatches.map((match, index) => {
        const titleMatch = match.match(/(?:Chapter\s+)?(\d+)[.:]\s*(.+)/i)
        return {
          number: titleMatch ? parseInt(titleMatch[1]) : index + 1,
          title: titleMatch ? titleMatch[2].trim() : `Chapter ${index + 1}`,
        }
      })
    } else {
      // Fallback: create chapters based on target_chapters
      const targetCount = project?.target_chapters || 10
      outlineChapters = Array.from({ length: targetCount }, (_, i) => ({
        number: i + 1,
        title: `Chapter ${i + 1}`,
      }))
    }

    // Merge with existing chapters - keep completed chapters, add pending for missing
    setChapters(prev => {
      const existingByNumber = new Map(prev.map(ch => [ch.number, ch]))

      return outlineChapters.map(outlineCh => {
        const existing = existingByNumber.get(outlineCh.number)
        if (existing && (existing.status === 'complete' || existing.content)) {
          // Keep existing chapter with its content, but update title from outline
          return { ...existing, title: outlineCh.title }
        }
        // Create pending chapter from outline
        return {
          number: outlineCh.number,
          title: outlineCh.title,
          content: '',
          wordCount: 0,
          status: 'pending' as const,
        }
      })
    })
  }, [outlineContent, project?.target_chapters])

  // Initialize chapters when outline content changes
  useEffect(() => {
    if (outlineContent) {
      initializeChaptersFromOutline()
    }
  }, [outlineContent, initializeChaptersFromOutline])

  const handleGenerateChapter = async (chapterNumber: number) => {
    if (!project || generatingChapter !== null) return

    setGeneratingChapter(chapterNumber)
    setChapterError(null)
    setActiveTab('manuscript')

    // Update chapter status to generating
    setChapters(prev => prev.map(ch =>
      ch.number === chapterNumber ? { ...ch, status: 'generating' as const } : ch
    ))

    try {
      console.log('[ChapterGen] Starting generation for chapter', chapterNumber)
      const projectSettings = project.settings as ProjectSettings | undefined
      const selectedModel = projectSettings?.model || 'openrouter/anthropic/claude-sonnet-4.5'

      // Get previous chapters for context
      const previousChapters = chapters
        .filter(ch => ch.number < chapterNumber && ch.status === 'complete')
        .map(ch => ch.content)

      console.log('[ChapterGen] Outline length:', outlineContent?.length || 0)

      // Call backend directly for SSE streaming (Next.js rewrites buffer SSE responses)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const streamUrl = `${backendUrl}/api/v1/projects/${projectId}/chapters/${chapterNumber}/generate/stream`
      console.log('[ChapterGen] Fetching from:', streamUrl)

      const response = await fetch(
        streamUrl,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            outline: outlineContent,
            chapter_number: chapterNumber,
            style_guide: project.style_guide,
            previous_chapters: previousChapters.length > 0 ? previousChapters : undefined,
          }),
        }
      )

      console.log('[ChapterGen] Response received, status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.log('[ChapterGen] Error response:', errorText)
        let errorMessage = 'Failed to start chapter generation'
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.detail || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      console.log('[ChapterGen] Getting reader from response body')
      const reader = response.body?.getReader()
      if (!reader) {
        console.log('[ChapterGen] No reader available!')
        throw new Error('No response body')
      }
      console.log('[ChapterGen] Reader obtained successfully')

      const decoder = new TextDecoder()
      let buffer = ''
      let chapterContent = ''
      let currentEvent = ''

      console.log('[ChapterGen] Starting to read stream')
      let chunkCount = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[ChapterGen] Stream done after', chunkCount, 'chunks')
          break
        }
        chunkCount++

        const decoded = decoder.decode(value, { stream: true })
        if (chunkCount <= 3) {
          console.log('[ChapterGen] Chunk', chunkCount, 'raw:', JSON.stringify(decoded.substring(0, 300)))
        }
        buffer += decoded
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
            continue
          }

          if (line.startsWith('data:')) {
            // SSE format: "data: content" - skip "data:" and the space after it
            // For token events, preserve the exact content (spaces are significant)
            const rawData = line.slice(5) // After "data:"
            const dataAfterSpace = rawData.startsWith(' ') ? rawData.slice(1) : rawData
            const trimmedData = dataAfterSpace.trim()

            // Skip empty non-token data
            if (!trimmedData && currentEvent !== 'token') continue

            if (currentEvent === 'token') {
              // Tokens are JSON-encoded to preserve whitespace exactly
              try {
                const tokenContent = JSON.parse(dataAfterSpace)
                if (chapterContent.length < 200) {
                  console.log('[Token]', JSON.stringify(tokenContent))
                }
                chapterContent += tokenContent
                setChapters(prev => prev.map(ch =>
                  ch.number === chapterNumber
                    ? { ...ch, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
                    : ch
                ))
              } catch {
                // Fallback for non-JSON tokens
                chapterContent += dataAfterSpace
              }
            } else if (trimmedData.startsWith('{')) {
              try {
                const parsed = JSON.parse(trimmedData)
                if (parsed.error) {
                  throw new Error(parsed.error)
                }
                // Handle cached content from backend
                if (parsed.source === 'cache' && parsed.content) {
                  chapterContent = parsed.content
                  setChapters(prev => prev.map(ch =>
                    ch.number === chapterNumber
                      ? { ...ch, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
                      : ch
                  ))
                }
              } catch (e) {
                if (!(e instanceof SyntaxError)) throw e
                // If JSON parsing fails and it's not a token event, add as content
                chapterContent += dataAfterSpace
              }
            } else if (trimmedData) {
              // Non-JSON, non-token data - treat as content
              chapterContent += dataAfterSpace
              setChapters(prev => prev.map(ch =>
                ch.number === chapterNumber
                  ? { ...ch, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
                  : ch
              ))
            }
            currentEvent = ''
          }
        }
      }

      // Mark chapter as complete
      setChapters(prev => prev.map(ch =>
        ch.number === chapterNumber
          ? { ...ch, status: 'complete' as const, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
          : ch
      ))

    } catch (err) {
      console.error('Chapter generation error:', err)
      setChapterError(err instanceof Error ? err.message : 'Chapter generation failed')
      setChapters(prev => prev.map(ch =>
        ch.number === chapterNumber ? { ...ch, status: 'error' as const } : ch
      ))
    } finally {
      setGeneratingChapter(null)
    }
  }

  const handleDeleteChapter = async (chapterNumber: number) => {
    setDeletingChapter(chapterNumber)
    setChapterError(null)

    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/chapters/${chapterNumber}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      )

      if (response.ok) {
        // Reset the chapter to pending state
        setChapters(prev => prev.map(ch =>
          ch.number === chapterNumber
            ? { ...ch, status: 'pending' as const, content: '', wordCount: 0 }
            : ch
        ))
        setShowDeleteChapterConfirm(null)
      } else if (response.status === 401) {
        window.location.href = '/login'
      } else {
        const errorData = await response.json().catch(() => ({}))
        setChapterError(errorData.detail || errorData.message || 'Failed to delete chapter')
      }
    } catch (err) {
      console.error('Error deleting chapter:', err)
      setChapterError('Network error. Please try again.')
    } finally {
      setDeletingChapter(null)
    }
  }

  const handleSuggestEdits = async (chapterNumber: number) => {
    if (!suggestEditsPrompt.trim() || isRegenerating) return

    setIsRegenerating(true)
    setChapterError(null)

    // Update chapter status to generating
    setChapters(prev => prev.map(ch =>
      ch.number === chapterNumber ? { ...ch, status: 'generating' as const } : ch
    ))

    try {
      // Call backend directly for SSE streaming
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(
        `${backendUrl}/api/v1/projects/${projectId}/chapters/${chapterNumber}/regenerate/stream`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            instructions: suggestEditsPrompt,
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = 'Failed to regenerate chapter'
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.message || errorData.detail || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let chapterContent = ''
      let currentEvent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim()
            continue
          }

          if (line.startsWith('data:')) {
            const rawData = line.slice(5)
            const dataAfterSpace = rawData.startsWith(' ') ? rawData.slice(1) : rawData
            const trimmedData = dataAfterSpace.trim()

            if (!trimmedData && currentEvent !== 'token') continue

            if (currentEvent === 'token') {
              // Tokens are JSON-encoded to preserve whitespace exactly
              try {
                const tokenContent = JSON.parse(dataAfterSpace)
                chapterContent += tokenContent
                setChapters(prev => prev.map(ch =>
                  ch.number === chapterNumber
                    ? { ...ch, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
                    : ch
                ))
              } catch {
                // Fallback for non-JSON tokens
                chapterContent += dataAfterSpace
              }
            } else if (trimmedData.startsWith('{')) {
              try {
                const parsed = JSON.parse(trimmedData)
                if (parsed.error) {
                  throw new Error(parsed.error)
                }
                if (parsed.source === 'cache' && parsed.content) {
                  chapterContent = parsed.content
                  setChapters(prev => prev.map(ch =>
                    ch.number === chapterNumber
                      ? { ...ch, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
                      : ch
                  ))
                }
              } catch (e) {
                if (!(e instanceof SyntaxError)) throw e
                chapterContent += dataAfterSpace
              }
            } else if (trimmedData) {
              chapterContent += dataAfterSpace
              setChapters(prev => prev.map(ch =>
                ch.number === chapterNumber
                  ? { ...ch, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
                  : ch
              ))
            }
            currentEvent = ''
          }
        }
      }

      // Mark chapter as complete
      setChapters(prev => prev.map(ch =>
        ch.number === chapterNumber
          ? { ...ch, status: 'complete' as const, content: chapterContent, wordCount: chapterContent.split(/\s+/).length }
          : ch
      ))

      // Close the suggest edits popover
      setSuggestEditsChapter(null)
      setSuggestEditsPrompt('')

    } catch (err) {
      console.error('Chapter regeneration error:', err)
      setChapterError(err instanceof Error ? err.message : 'Chapter regeneration failed')
      setChapters(prev => prev.map(ch =>
        ch.number === chapterNumber ? { ...ch, status: 'error' as const } : ch
      ))
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleAcceptManuscript = async () => {
    if (!project || isReviewing) return

    setIsReviewing(true)
    setReviewProgress(0)
    setReviewPhase('Starting literary review...')
    setReviewPhaseDetail('')
    setReviewError(null)
    setReviewComplete(false)
    setReviewScore(null)
    setReviewPhaseScores({})
    setReviewPhaseSummaries({})
    setReviewRecommendation('')
    setReviewIssues([])
    setReviewChapterCount(0)
    setReviewWordCount(0)

    try {
      // First, update project status to mark editing as complete
      await fetch(`/api/backend/v1/projects/${projectId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewing' }),
      })

      // Trigger the comprehensive literary review
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const response = await fetch(
        `${backendUrl}/api/v1/projects/${projectId}/continuity/check`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            check_types: ['character', 'timeline', 'world'],
            include_suggestions: true,
          }),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to start literary review')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      const phaseScores: Record<string, number> = {}
      const phaseSummaries: Record<string, string> = {}

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const rawData = line.slice(5)
            const dataStr = rawData.startsWith(' ') ? rawData.slice(1) : rawData
            if (!dataStr.trim()) continue

            try {
              const data = JSON.parse(dataStr)

              if (data.event === 'start') {
                // Review started - update with chapter count
                setReviewChapterCount(data.chapter_count || 0)
                setReviewPhase('Preparing manuscript...')
              } else if (data.event === 'progress') {
                // Progress update with phase info
                setReviewProgress(data.progress * 100)
                setReviewPhase(data.phase || 'Analyzing...')
                setReviewPhaseDetail(data.detail || '')
              } else if (data.event === 'phase_complete') {
                // Individual phase completed - store results
                phaseScores[data.phase_id] = data.score || 0
                phaseSummaries[data.phase_id] = data.summary || ''
                setReviewPhaseScores({ ...phaseScores })
                setReviewPhaseSummaries({ ...phaseSummaries })
                setReviewPhase(`Completed: ${data.phase}`)
              } else if (data.event === 'complete') {
                // Full review complete
                setReviewProgress(100)
                setReviewPhase('Review complete!')
                setReviewComplete(true)
                setReviewScore(data.overall_score)
                setReviewRecommendation(data.recommendation || '')
                setReviewIssues(data.all_issues || [])
                setReviewWordCount(data.total_words || 0)
                setReviewChapterCount(data.chapter_count || 0)

                // Update phase scores and summaries from final data
                if (data.phase_scores) {
                  setReviewPhaseScores(data.phase_scores)
                }
                if (data.phase_summaries) {
                  setReviewPhaseSummaries(data.phase_summaries)
                }

                // Update project status to completed
                await fetch(`/api/backend/v1/projects/${projectId}`, {
                  method: 'PATCH',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'completed' }),
                })

                // Refresh project
                fetchProject()
              } else if (data.event === 'error') {
                throw new Error(data.message)
              }
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e
            }
          }
        }
      }
    } catch (err) {
      console.error('Review error:', err)
      setReviewError(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setIsReviewing(false)
    }
  }

  const handlePhaseClick = (phaseId: string) => {
    switch (phaseId) {
      case 'description':
        setActiveTab('brief')
        break
      case 'outline':
        setActiveTab('outline')
        break
      case 'writing':
      case 'editing':
        setActiveTab('manuscript')
        break
      case 'reviewing':
        // Show review modal if we have review results, otherwise do nothing
        if (reviewComplete || project?.status === 'reviewing' || project?.status === 'completed') {
          setReviewComplete(true)
        }
        break
      case 'publish':
        setShowPublishModal(true)
        break
    }
  }

  const handleDownloadManuscript = () => {
    if (!project || chapters.length === 0) return

    // Build the markdown content
    let markdown = `# ${project.name}\n\n`

    if (project.description) {
      markdown += `*${project.description}*\n\n---\n\n`
    }

    // Sort chapters by number and add them
    const sortedChapters = [...chapters].sort((a, b) => a.number - b.number)

    for (const chapter of sortedChapters) {
      if (chapter.content) {
        markdown += `## Chapter ${chapter.number}: ${chapter.title || `Chapter ${chapter.number}`}\n\n`
        markdown += chapter.content
        markdown += '\n\n---\n\n'
      }
    }

    // Create and download the file
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleSaveFields = async () => {
    if (!project) return

    setIsSaving(true)
    setSaveStatus('saving')

    try {
      const currentSettings = (project.settings as ProjectSettings) || {}
      const response = await fetch(`/api/backend/v1/projects/${projectId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          style_guide: writingStyle,
          settings: {
            ...currentSettings,
            character_bible_text: characterBios,
          },
        }),
      })

      if (response.ok) {
        const updatedProject = await response.json()
        setProject(updatedProject)
        setCurrentProject(updatedProject)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else if (response.status === 401) {
        window.location.href = '/login'
      } else {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (err) {
      console.error('Error saving project:', err)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateModel = async (modelId: string) => {
    if (!project) return

    setIsUpdatingModel(true)

    try {
      const currentSettings = (project.settings as ProjectSettings) || {}
      const response = await fetch(`/api/backend/v1/projects/${projectId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          settings: {
            ...currentSettings,
            model: modelId,
          },
        }),
      })

      if (response.ok) {
        const updatedProject = await response.json()
        setProject(updatedProject)
        setCurrentProject(updatedProject)
        setShowModelPopover(false)
      } else if (response.status === 401) {
        window.location.href = '/login'
      }
    } catch (err) {
      console.error('Error updating model:', err)
    } finally {
      setIsUpdatingModel(false)
    }
  }

  const settings = project?.settings as ProjectSettings | undefined
  const currentModel = getModelInfo(settings?.model)

  return (
    <div className="flex min-h-screen flex-col bg-charcoal">
      <MeshGradient />

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-graphite bg-charcoal/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-aurora-teal" />
            <h1 className="text-2xl font-bold gradient-text">sopher.ai</h1>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || user.email}
                      className="h-8 w-8 rounded-full border border-aurora-teal/50"
                    />
                  ) : (
                    <UserIcon className="h-5 w-5 text-aurora-teal" />
                  )}
                  <span className="hidden sm:inline text-cream">{user.name || user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-charcoal-light rounded-lg transition-colors text-mist hover:text-cream"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto flex-1 px-4 py-8">
        {/* Back to Projects Link */}
        <button
          onClick={() => (window.location.href = '/projects')}
          className="flex items-center gap-1 text-mist hover:text-aurora-teal mb-6 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-aurora-teal" />
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-300 mb-2">{error}</h3>
            <button
              onClick={fetchProject}
              className="text-sm text-red-400 underline hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}

        {/* Project Content */}
        {project && !isLoading && (
          <div className="space-y-6 animate-fade-in">
            {/* Phase Progress Indicator */}
            <div className="glass rounded-xl p-6">
              <div className="flex items-center justify-center max-w-4xl mx-auto">
                {PROJECT_PHASES.map((phase, index) => {
                  const hasOutline = Boolean(outlineContent)
                  const hasChapters = chapters.length > 0
                  const allChaptersComplete = hasChapters && chapters.length > 0 && chapters.every(ch => ch.status === 'complete')
                  const currentPhaseIndex = getPhaseIndex(getCurrentPhase(project, hasOutline, hasChapters, allChaptersComplete, reviewComplete))
                  const isCompleted = index < currentPhaseIndex
                  const isCurrent = index === currentPhaseIndex
                  const Icon = phase.icon

                  return (
                    <div key={phase.id} className="flex items-center flex-1">
                      {/* Phase Node */}
                      <button
                        onClick={() => handlePhaseClick(phase.id)}
                        className="flex flex-col items-center group cursor-pointer"
                      >
                        <div
                          className={`
                            relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300
                            group-hover:scale-110
                            ${isCompleted
                              ? 'bg-aurora-teal/20 border-aurora-teal text-aurora-teal group-hover:shadow-glow-teal'
                              : isCurrent
                                ? 'bg-nebula-blue/20 border-nebula-blue text-nebula-blue shadow-glow-sm group-hover:shadow-glow-md'
                                : 'bg-charcoal border-graphite text-fog group-hover:border-mist group-hover:text-mist'
                            }
                          `}
                        >
                          {isCompleted ? (
                            <Check className="h-5 w-5" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                          {isCurrent && (
                            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-nebula-blue rounded-full animate-pulse" />
                          )}
                        </div>
                        <span
                          className={`
                            mt-2 text-xs font-medium text-center whitespace-nowrap transition-colors
                            ${isCompleted
                              ? 'text-aurora-teal'
                              : isCurrent
                                ? 'text-cream'
                                : 'text-fog group-hover:text-mist'
                            }
                          `}
                        >
                          {phase.label}
                        </span>
                      </button>

                      {/* Connector Line */}
                      {index < PROJECT_PHASES.length - 1 && (
                        <div className="flex-1 mx-2 mb-6">
                          <div
                            className={`
                              h-0.5 w-full transition-all duration-300
                              ${index < currentPhaseIndex
                                ? 'bg-aurora-teal'
                                : 'bg-graphite'
                              }
                            `}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Project Header */}
            <div className="glass rounded-xl p-6">
              {/* Title row */}
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-bold text-cream">
                  {project.name}
                </h2>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(project.status)}`}>
                  {getStatusIcon(project.status)}
                  {project.status.replace('_', ' ')}
                </span>
              </div>

              {project.genre && (
                <p className="text-mist mb-4">{project.genre}</p>
              )}

              {project.description && (
                <p className="text-fog mb-4">{project.description}</p>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={handleStartGeneration}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-primary text-cream rounded-xl font-semibold text-lg hover:opacity-90 hover:shadow-glow-lg hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-6 w-6" />
                      Generate Outline
                    </>
                  )}
                </button>
                <button
                  onClick={() => window.location.href = `/projects/${projectId}/edit`}
                  className="p-3 border border-graphite rounded-xl hover:bg-charcoal-light hover:border-nebula-blue/50 transition-all"
                  title="Edit Project"
                >
                  <Settings className="h-5 w-5 text-mist" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-3 border border-red-500/30 rounded-xl hover:bg-red-500/10 transition-all"
                  title="Delete Project"
                >
                  <Trash2 className="h-5 w-5 text-red-400" />
                </button>
              </div>

            </div>

            {/* Tabbed Content Section */}
            <div className="glass rounded-xl overflow-hidden">
              {/* Tab Headers */}
              <div className="flex border-b border-graphite">
                <button
                  onClick={() => setActiveTab('brief')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-all ${
                    activeTab === 'brief'
                      ? 'text-aurora-teal border-b-2 border-aurora-teal bg-charcoal/30'
                      : 'text-mist hover:text-cream hover:bg-charcoal/20'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <FileEdit className="h-4 w-4" />
                    Book Brief
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('outline')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-all ${
                    activeTab === 'outline'
                      ? 'text-aurora-teal border-b-2 border-aurora-teal bg-charcoal/30'
                      : 'text-mist hover:text-cream hover:bg-charcoal/20'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <ListTree className="h-4 w-4" />
                    Outline
                    {isGenerating && <Loader2 className="h-3 w-3 animate-spin" />}
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('manuscript')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-all ${
                    activeTab === 'manuscript'
                      ? 'text-aurora-teal border-b-2 border-aurora-teal bg-charcoal/30'
                      : 'text-mist hover:text-cream hover:bg-charcoal/20'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Manuscript
                  </div>
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-6">
                {/* Book Brief Tab */}
                {activeTab === 'brief' && (
                  <div className="animate-fade-in">
                    {project.brief ? (
                      <p className="text-cream whitespace-pre-wrap leading-relaxed">{project.brief}</p>
                    ) : (
                      <div className="text-center py-12">
                        <FileEdit className="h-12 w-12 text-fog mx-auto mb-4" />
                        <p className="text-mist mb-2">No book brief yet</p>
                        <p className="text-fog text-sm">Add a description when creating your project</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Outline Tab */}
                {activeTab === 'outline' && (
                  <div className="animate-fade-in">
                    {/* Statistics bar - show when generating or has content */}
                    {(isGenerating || outlineContent || tokenCount > 0) && (
                      <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-charcoal/50 rounded-lg border border-graphite">
                        {/* Status */}
                        <div className="flex items-center gap-2">
                          {isGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-aurora-teal" />
                          ) : outlineError ? (
                            <AlertCircle className="h-4 w-4 text-red-400" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-aurora-teal" />
                          )}
                          <span className="text-sm text-mist">{generationStage || 'Ready'}</span>
                        </div>

                        <div className="flex-1" />

                        {/* Token count */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-charcoal rounded border border-graphite">
                          <span className="text-xs text-fog">Tokens:</span>
                          <span className="text-sm font-mono text-aurora-teal">{tokenCount.toLocaleString()}</span>
                        </div>

                        {/* Estimated cost */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-charcoal rounded border border-graphite">
                          <span className="text-xs text-fog">Cost:</span>
                          <span className="text-sm font-mono text-ember">${estimatedCost.toFixed(4)}</span>
                        </div>

                        {/* Duration */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-charcoal rounded border border-graphite">
                          <Clock className="h-3 w-3 text-fog" />
                          <span className="text-sm font-mono text-mist">{generationDuration}s</span>
                        </div>

                        {/* Progress bar */}
                        {isGenerating && (
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-charcoal rounded-full overflow-hidden border border-graphite">
                              <div
                                className="h-full bg-gradient-primary transition-all duration-300"
                                style={{ width: `${generationProgress}%` }}
                              />
                            </div>
                            <span className="text-xs text-aurora-teal font-medium w-8">
                              {Math.round(generationProgress)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error display */}
                    {outlineError && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                        <div className="flex items-center gap-2 text-red-400">
                          <AlertCircle className="h-5 w-5 flex-shrink-0" />
                          <span className="text-sm">{outlineError}</span>
                        </div>
                      </div>
                    )}

                    {/* Outline content - streaming display */}
                    {(outlineContent || isGenerating) && (
                      <div className="bg-charcoal rounded-lg border border-graphite overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-graphite bg-charcoal-light/50">
                          <span className="text-xs text-fog font-medium uppercase tracking-wide">Output Stream</span>
                          {isGenerating && (
                            <span className="flex items-center gap-1 text-xs text-aurora-teal">
                              <span className="w-1.5 h-1.5 bg-aurora-teal rounded-full animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="p-4 max-h-[500px] overflow-y-auto">
                          {outlineContent ? (
                            <div className="prose prose-invert prose-sm max-w-none
                              prose-headings:text-cream prose-headings:font-semibold
                              prose-h1:text-xl prose-h1:border-b prose-h1:border-graphite prose-h1:pb-2
                              prose-h2:text-lg prose-h2:text-aurora-teal
                              prose-h3:text-base prose-h3:text-mist
                              prose-p:text-cream prose-p:leading-relaxed
                              prose-strong:text-aurora-cyan prose-strong:font-semibold
                              prose-em:text-mist prose-em:italic
                              prose-ul:text-cream prose-ol:text-cream
                              prose-li:marker:text-aurora-teal
                              prose-code:text-nebula-blue prose-code:bg-charcoal prose-code:px-1 prose-code:rounded
                              prose-blockquote:border-l-aurora-teal prose-blockquote:text-mist
                            ">
                              <ReactMarkdown>{outlineContent}</ReactMarkdown>
                              {isGenerating && <span className="inline-block w-2 h-4 bg-aurora-teal animate-pulse ml-0.5" />}
                            </div>
                          ) : (
                            <div className="text-fog italic">Waiting for response...</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {!isGenerating && !outlineContent && !outlineError && (
                      <div className="text-center py-12">
                        <ListTree className="h-12 w-12 text-fog mx-auto mb-4" />
                        <p className="text-mist mb-2">No outline generated yet</p>
                        <p className="text-fog text-sm mb-6">Click &quot;Generate Outline&quot; to create your book structure</p>
                        <button
                          onClick={handleStartGeneration}
                          disabled={isGenerating}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-cream rounded-lg font-medium hover:opacity-90 hover:shadow-glow-md transition-all"
                        >
                          <Sparkles className="h-5 w-5" />
                          Generate Outline
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Manuscript Tab */}
                {activeTab === 'manuscript' && (
                  <div className="animate-fade-in">
                    {!outlineContent ? (
                      /* No outline yet */
                      <div className="text-center py-12">
                        <BookOpen className="h-12 w-12 text-fog mx-auto mb-4" />
                        <p className="text-mist mb-2">No manuscript content yet</p>
                        <p className="text-fog text-sm mb-4">Generate an outline first, then start writing chapters</p>
                        <button
                          onClick={() => setActiveTab('outline')}
                          className="px-4 py-2 bg-nebula-blue/20 text-nebula-blue rounded-lg hover:bg-nebula-blue/30 transition-colors"
                        >
                          Go to Outline
                        </button>
                      </div>
                    ) : (
                      /* Chapter list */
                      <div className="space-y-4">
                        {/* Chapter error */}
                        {chapterError && (
                          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-red-400">
                              <AlertCircle className="h-5 w-5 flex-shrink-0" />
                              <span className="text-sm">{chapterError}</span>
                            </div>
                          </div>
                        )}

                        {/* Chapter cards */}
                        <div className="grid gap-3">
                          {chapters.map((chapter) => (
                            <div
                              key={chapter.number}
                              className={`
                                glass rounded-lg p-4 transition-all duration-300
                                ${chapter.status === 'generating' ? 'border border-aurora-teal/50 shadow-glow-teal' : ''}
                                ${chapter.status === 'complete' ? 'border border-aurora-teal/30' : ''}
                                ${chapter.status === 'error' ? 'border border-red-500/30' : ''}
                              `}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {/* Status indicator */}
                                  <div className={`
                                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                                    ${chapter.status === 'complete' ? 'bg-aurora-teal/20 text-aurora-teal' : ''}
                                    ${chapter.status === 'generating' ? 'bg-nebula-blue/20 text-nebula-blue' : ''}
                                    ${chapter.status === 'pending' ? 'bg-charcoal text-fog' : ''}
                                    ${chapter.status === 'error' ? 'bg-red-500/20 text-red-400' : ''}
                                  `}>
                                    {chapter.status === 'complete' && <Check className="h-4 w-4" />}
                                    {chapter.status === 'generating' && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {chapter.status === 'pending' && chapter.number}
                                    {chapter.status === 'error' && <AlertCircle className="h-4 w-4" />}
                                  </div>

                                  <div>
                                    <h4 className="text-cream font-medium">
                                      Chapter {chapter.number}: {chapter.title}
                                    </h4>
                                    {chapter.status === 'complete' && (
                                      <p className="text-xs text-mist">{chapter.wordCount.toLocaleString()} words</p>
                                    )}
                                    {chapter.status === 'generating' && (
                                      <p className="text-xs text-aurora-teal">Generating... {chapter.wordCount.toLocaleString()} words</p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {chapter.status === 'pending' && (
                                    <button
                                      onClick={() => handleGenerateChapter(chapter.number)}
                                      disabled={generatingChapter !== null}
                                      className={`
                                        px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                                        ${generatingChapter !== null
                                          ? 'bg-charcoal text-fog cursor-not-allowed'
                                          : 'bg-gradient-primary text-cream hover:opacity-90 hover:shadow-glow-sm'
                                        }
                                      `}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <Play className="h-3.5 w-3.5" />
                                        Generate
                                      </div>
                                    </button>
                                  )}
                                  {chapter.status === 'error' && (
                                    <button
                                      onClick={() => handleGenerateChapter(chapter.number)}
                                      disabled={generatingChapter !== null}
                                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                                    >
                                      Retry
                                    </button>
                                  )}
                                  {chapter.status === 'complete' && (
                                    <>
                                      <button
                                        onClick={() => setViewingChapter(chapter.number)}
                                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-charcoal-light text-mist hover:text-cream transition-all"
                                      >
                                        View
                                      </button>
                                      <div className="relative">
                                        <button
                                          onClick={() => setSuggestEditsChapter(suggestEditsChapter === chapter.number ? null : chapter.number)}
                                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-nebula-blue/20 text-nebula-blue hover:bg-nebula-blue/30 transition-all"
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <Edit className="h-3.5 w-3.5" />
                                            Edit
                                          </div>
                                        </button>
                                        {/* Suggest Edits Popover */}
                                        {suggestEditsChapter === chapter.number && (
                                          <div className="absolute right-0 top-full mt-2 w-80 bg-charcoal-light border border-graphite rounded-xl shadow-glow-lg z-50 animate-fade-in">
                                            <div className="p-4">
                                              <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-sm font-medium text-cream">Suggest Edits</h4>
                                                <button
                                                  onClick={() => {
                                                    setSuggestEditsChapter(null)
                                                    setSuggestEditsPrompt('')
                                                  }}
                                                  className="p-1 hover:bg-charcoal rounded transition-colors"
                                                >
                                                  <X className="h-4 w-4 text-mist" />
                                                </button>
                                              </div>
                                              <textarea
                                                value={suggestEditsPrompt}
                                                onChange={(e) => setSuggestEditsPrompt(e.target.value)}
                                                placeholder="Describe the changes you'd like to make to this chapter..."
                                                rows={4}
                                                className="w-full bg-charcoal border border-graphite rounded-lg px-3 py-2 text-sm text-cream placeholder-fog focus:outline-none focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue/50 transition-all resize-none"
                                              />
                                              <button
                                                onClick={() => handleSuggestEdits(chapter.number)}
                                                disabled={!suggestEditsPrompt.trim() || isRegenerating}
                                                className="mt-3 w-full px-4 py-2 bg-gradient-primary text-cream rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                              >
                                                {isRegenerating ? (
                                                  <div className="flex items-center justify-center gap-2">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Regenerating...
                                                  </div>
                                                ) : (
                                                  <div className="flex items-center justify-center gap-2">
                                                    <Sparkles className="h-4 w-4" />
                                                    Apply Changes
                                                  </div>
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => setShowDeleteChapterConfirm(chapter.number)}
                                        disabled={deletingChapter === chapter.number}
                                        className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                        title="Delete Chapter"
                                      >
                                        {deletingChapter === chapter.number ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-4 w-4" />
                                        )}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Chapter content preview when generating or complete */}
                              {(chapter.status === 'generating' || chapter.status === 'complete') && chapter.content && (
                                <div className="mt-3 pt-3 border-t border-graphite overflow-hidden">
                                  <div className={`
                                    prose prose-invert prose-sm max-w-none overflow-hidden relative
                                    [&>*]:break-words [&>*]:overflow-wrap-anywhere
                                    ${chapter.status === 'generating' ? 'max-h-64 overflow-y-auto' : 'max-h-32'}
                                  `}
                                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                                  >
                                    <ReactMarkdown>{
                                      chapter.status === 'generating'
                                        ? chapter.content
                                        : `${chapter.content.slice(0, 500)}...`
                                    }</ReactMarkdown>
                                    {chapter.status === 'complete' && (
                                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-charcoal-light to-transparent" />
                                    )}
                                  </div>
                                  {chapter.status === 'generating' && (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-aurora-teal">
                                      <div className="w-2 h-2 bg-aurora-teal rounded-full animate-pulse" />
                                      <span>Streaming content...</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Generate all button */}
                        {chapters.some(ch => ch.status === 'pending') && (
                          <div className="flex justify-center pt-4">
                            <button
                              onClick={() => {
                                const firstPending = chapters.find(ch => ch.status === 'pending')
                                if (firstPending) handleGenerateChapter(firstPending.number)
                              }}
                              disabled={generatingChapter !== null}
                              className={`
                                px-6 py-3 rounded-xl font-medium transition-all
                                ${generatingChapter !== null
                                  ? 'bg-charcoal text-fog cursor-not-allowed'
                                  : 'bg-gradient-primary text-cream hover:opacity-90 hover:shadow-glow-md'
                                }
                              `}
                            >
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5" />
                                Generate Next Chapter
                              </div>
                            </button>
                          </div>
                        )}

                        {/* All complete message */}
                        {chapters.length > 0 && chapters.every(ch => ch.status === 'complete') && (
                          <div className="text-center py-6">
                            <CheckCircle className="h-12 w-12 text-aurora-teal mx-auto mb-3" />
                            <p className="text-cream font-medium">All chapters generated!</p>
                            <p className="text-mist text-sm mb-4">
                              Total: {chapters.reduce((sum, ch) => sum + ch.wordCount, 0).toLocaleString()} words
                            </p>

                            {/* Review Progress */}
                            {isReviewing && (
                              <div className="bg-charcoal rounded-xl p-4 mb-4 max-w-sm mx-auto">
                                <div className="flex items-center gap-3 mb-2">
                                  <Loader2 className="h-5 w-5 animate-spin text-nebula-blue" />
                                  <span className="text-sm text-cream">{reviewPhase}</span>
                                </div>
                                <div className="w-full bg-graphite rounded-full h-2">
                                  <div
                                    className="bg-gradient-primary h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${reviewProgress}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Review Error */}
                            {reviewError && (
                              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 max-w-sm mx-auto">
                                <div className="flex items-center gap-2 text-red-400 text-sm">
                                  <AlertCircle className="h-4 w-4" />
                                  {reviewError}
                                </div>
                              </div>
                            )}

                            {/* Review Complete */}
                            {reviewComplete && !isReviewing && (
                              <div className="bg-aurora-teal/10 border border-aurora-teal/30 rounded-xl p-4 mb-4 max-w-sm mx-auto">
                                <div className="flex items-center justify-center gap-2 text-aurora-teal mb-2">
                                  <CheckCircle className="h-5 w-5" />
                                  <span className="font-medium">Literary Review Complete</span>
                                </div>
                                {reviewScore !== null && (
                                  <p className="text-mist text-sm">
                                    Quality Score: {Math.round(reviewScore * 100)}%
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Accept Manuscript Button */}
                            {!reviewComplete && !isReviewing && (
                              <button
                                onClick={handleAcceptManuscript}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-cream rounded-xl font-medium hover:opacity-90 hover:shadow-glow-md transition-all duration-300"
                              >
                                <BookCheck className="h-5 w-5" />
                                Accept Manuscript
                              </button>
                            )}

                            {/* View Report Button after review */}
                            {reviewComplete && (
                              <p className="text-fog text-xs mt-2">
                                Your manuscript is ready for export!
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass rounded-xl p-4 hover:shadow-inner-glow transition-all duration-300">
                <div className="flex items-center gap-2 text-mist mb-2">
                  <Target className="h-4 w-4 text-nebula-blue" />
                  <span className="text-sm">Chapters</span>
                </div>
                <p className="text-2xl font-bold text-cream">{project.target_chapters}</p>
              </div>

              <div className="glass rounded-xl p-4 hover:shadow-inner-glow transition-all duration-300">
                <div className="flex items-center gap-2 text-mist mb-2">
                  <FileText className="h-4 w-4 text-nebula-purple" />
                  <span className="text-sm">Artifacts</span>
                </div>
                <p className="text-2xl font-bold text-cream">{stats?.artifact_count ?? 0}</p>
              </div>

              <div className="glass rounded-xl p-4 hover:shadow-inner-glow transition-all duration-300">
                <div className="flex items-center gap-2 text-mist mb-2">
                  <BookText className="h-4 w-4 text-aurora-teal" />
                  <span className="text-sm">Sessions</span>
                </div>
                <p className="text-2xl font-bold text-cream">{stats?.session_count ?? 0}</p>
              </div>

              <div className="glass rounded-xl p-4 hover:shadow-inner-glow transition-all duration-300">
                <div className="flex items-center gap-2 text-mist mb-2">
                  <DollarSign className="h-4 w-4 text-ember" />
                  <span className="text-sm">Total Cost</span>
                </div>
                <p className="text-2xl font-bold text-cream">
                  ${(stats?.total_cost_usd ?? 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Project Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Settings Panel */}
              <div className="glass rounded-xl p-6 relative z-30">
                <h3 className="text-lg font-semibold text-cream mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-aurora-teal" />
                  Project Settings
                </h3>

                {/* Model Selection */}
                <div className="relative mb-4 pb-4 border-b border-graphite">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-nebula-blue" />
                      <span className="text-mist">AI Model</span>
                    </div>
                    <button
                      onClick={() => setShowModelPopover(!showModelPopover)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-charcoal border border-graphite rounded-lg hover:border-nebula-blue/50 transition-all"
                    >
                      {currentModel ? (
                        <>
                          <span className="text-cream font-medium">{currentModel.name}</span>
                          <span className={`text-xs ${getTierColor(currentModel.tier)}`}>
                            {currentModel.provider}
                          </span>
                        </>
                      ) : (
                        <span className="text-fog">Select model</span>
                      )}
                      <ChevronDown className={`h-4 w-4 text-mist transition-transform ${showModelPopover ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Model Popover */}
                  {showModelPopover && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-charcoal-light border border-graphite rounded-xl shadow-glow-lg z-50 overflow-hidden animate-fade-in">
                      <div className="flex items-center justify-between p-3 border-b border-graphite">
                        <span className="text-sm font-medium text-cream">Select AI Model</span>
                        <button
                          onClick={() => setShowModelPopover(false)}
                          className="p-1 hover:bg-charcoal rounded transition-colors"
                        >
                          <X className="h-4 w-4 text-mist" />
                        </button>
                      </div>
                      <div className="p-2 max-h-64 overflow-y-auto">
                        {MODELS.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleUpdateModel(model.id)}
                            disabled={isUpdatingModel}
                            className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                              settings?.model === model.id
                                ? 'bg-nebula-blue/20 border border-nebula-blue/50'
                                : 'hover:bg-charcoal border border-transparent'
                            } ${isUpdatingModel ? 'opacity-50' : ''}`}
                          >
                            <div className="text-left">
                              <p className="text-cream font-medium">{model.name}</p>
                              <p className="text-xs text-fog">{model.provider}</p>
                            </div>
                            <span className={`text-xs font-medium capitalize ${getTierColor(model.tier)}`}>
                              {model.tier}
                            </span>
                          </button>
                        ))}
                      </div>
                      {isUpdatingModel && (
                        <div className="flex items-center justify-center gap-2 p-3 border-t border-graphite">
                          <Loader2 className="h-4 w-4 animate-spin text-aurora-teal" />
                          <span className="text-sm text-mist">Updating...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <dl className="space-y-3">
                  {settings?.target_audience && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Target Audience</dt>
                      <dd className="text-cream font-medium">{settings.target_audience}</dd>
                    </div>
                  )}

                  {settings?.tone && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Tone</dt>
                      <dd className="text-cream font-medium capitalize">{settings.tone}</dd>
                    </div>
                  )}

                  {settings?.pov && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Point of View</dt>
                      <dd className="text-cream font-medium">{formatLabel(settings.pov)}</dd>
                    </div>
                  )}

                  {settings?.tense && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Tense</dt>
                      <dd className="text-cream font-medium capitalize">{settings.tense}</dd>
                    </div>
                  )}

                  {settings?.dialogue_style && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Dialogue Style</dt>
                      <dd className="text-cream font-medium capitalize">{settings.dialogue_style}</dd>
                    </div>
                  )}

                  {settings?.prose_style && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Prose Style</dt>
                      <dd className="text-cream font-medium capitalize">{settings.prose_style}</dd>
                    </div>
                  )}

                  {settings?.chapter_length_target && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Chapter Length</dt>
                      <dd className="text-cream font-medium">
                        {settings.chapter_length_target.toLocaleString()} words
                      </dd>
                    </div>
                  )}

                  {!settings?.tone && !settings?.pov && !settings?.tense && (
                    <p className="text-fog italic">No custom settings configured</p>
                  )}
                </dl>
              </div>

              {/* Metadata Panel */}
              <div className="glass rounded-xl p-6">
                <h3 className="text-lg font-semibold text-cream mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-aurora-teal" />
                  Project Info
                </h3>

                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-graphite">
                    <dt className="text-mist">Created</dt>
                    <dd className="text-cream font-medium">{formatDate(project.created_at)}</dd>
                  </div>

                  {project.updated_at && (
                    <div className="flex justify-between py-2 border-b border-graphite">
                      <dt className="text-mist">Last Updated</dt>
                      <dd className="text-cream font-medium">{formatDate(project.updated_at)}</dd>
                    </div>
                  )}

                  <div className="flex justify-between py-2 border-b border-graphite">
                    <dt className="text-mist">Project ID</dt>
                    <dd className="text-cream font-mono text-sm">{project.id}</dd>
                  </div>
                </dl>

              </div>
            </div>

            {/* Editable Character Bios & Writing Style */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-5 w-5 text-aurora-teal" />
                  <h3 className="text-lg font-semibold text-cream">Character Bios</h3>
                </div>
                <textarea
                  value={characterBios}
                  onChange={(e) => setCharacterBios(e.target.value)}
                  placeholder="Describe your main characters, their backgrounds, motivations, and relationships..."
                  rows={8}
                  className="w-full bg-charcoal border border-graphite rounded-lg px-4 py-3 text-cream placeholder-fog focus:outline-none focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue/50 transition-all resize-none"
                />
              </div>

              <div className="glass rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Pen className="h-5 w-5 text-aurora-teal" />
                  <h3 className="text-lg font-semibold text-cream">Writing Style</h3>
                </div>
                <textarea
                  value={writingStyle}
                  onChange={(e) => setWritingStyle(e.target.value)}
                  placeholder="Describe the writing style, tone, narrative voice, and any specific stylistic preferences..."
                  rows={8}
                  className="w-full bg-charcoal border border-graphite rounded-lg px-4 py-3 text-cream placeholder-fog focus:outline-none focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue/50 transition-all resize-none"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveFields}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-cream rounded-lg font-medium hover:opacity-90 hover:shadow-glow-md transition-all duration-300 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : saveStatus === 'saved' ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Saved
                  </>
                ) : saveStatus === 'error' ? (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    Error Saving
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass rounded-xl shadow-glow-lg max-w-md w-full p-6 animate-scale-in">
              <h3 className="text-lg font-semibold text-cream mb-2">Delete Project?</h3>
              <p className="text-mist mb-6">
                Are you sure you want to delete &quot;{project?.name}&quot;? This action cannot be undone.
                All associated content, sessions, and artifacts will be permanently deleted.
              </p>

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-mist hover:bg-charcoal-light rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete Project
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Chapter Confirmation Modal */}
        {showDeleteChapterConfirm !== null && (
          <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass rounded-xl shadow-glow-lg max-w-md w-full p-6 animate-scale-in">
              <h3 className="text-lg font-semibold text-cream mb-2">Delete Chapter?</h3>
              <p className="text-mist mb-6">
                Are you sure you want to delete Chapter {showDeleteChapterConfirm}?
                The chapter will be reset to pending state and can be regenerated.
              </p>

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteChapterConfirm(null)}
                  disabled={deletingChapter !== null}
                  className="px-4 py-2 text-mist hover:bg-charcoal-light rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteChapter(showDeleteChapterConfirm)}
                  disabled={deletingChapter !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deletingChapter !== null ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete Chapter
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Literary Review Modal - Comprehensive NYT-style review */}
        {(isReviewing || reviewComplete) && (
          <div className="fixed inset-0 bg-void/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="glass rounded-2xl shadow-glow-lg max-w-2xl w-full p-8 animate-scale-in my-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${reviewComplete ? 'bg-aurora-teal/20' : 'bg-nebula-blue/20'}`}>
                    {reviewComplete ? (
                      <CheckCircle className="h-6 w-6 text-aurora-teal" />
                    ) : (
                      <Eye className="h-6 w-6 text-nebula-blue" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-cream">
                      {reviewComplete ? 'Literary Review Complete' : 'Literary Review'}
                    </h3>
                    <p className="text-sm text-mist">
                      {reviewComplete
                        ? `${reviewChapterCount} chapters • ${reviewWordCount.toLocaleString()} words`
                        : 'Analyzing your manuscript...'}
                    </p>
                  </div>
                </div>
                {reviewComplete && (
                  <button
                    onClick={() => setReviewComplete(false)}
                    className="p-2 hover:bg-charcoal rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-mist" />
                  </button>
                )}
              </div>

              {/* Progress Section */}
              {isReviewing && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-nebula-blue" />
                    <div>
                      <span className="text-cream font-medium">{reviewPhase}</span>
                      {reviewPhaseDetail && (
                        <p className="text-sm text-fog">{reviewPhaseDetail}</p>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-charcoal rounded-full h-3">
                    <div
                      className="bg-gradient-primary h-3 rounded-full transition-all duration-500"
                      style={{ width: `${reviewProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-fog text-center">
                    Evaluating narrative structure, character development, writing quality, and more...
                  </p>

                  {/* Show phase scores as they complete */}
                  {Object.keys(reviewPhaseScores).length > 0 && (
                    <div className="mt-4 space-y-2">
                      {Object.entries(reviewPhaseScores).map(([phaseId, score]) => (
                        <div key={phaseId} className="flex items-center gap-3 p-2 bg-charcoal rounded-lg">
                          <CheckCircle className="h-4 w-4 text-aurora-teal" />
                          <span className="text-sm text-mist capitalize">{phaseId.replace(/_/g, ' ')}</span>
                          <span className="ml-auto text-sm font-medium text-cream">{Math.round(score * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Error Section */}
              {reviewError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="h-5 w-5" />
                    <span>{reviewError}</span>
                  </div>
                </div>
              )}

              {/* Results Section */}
              {reviewComplete && !isReviewing && (
                <div className="space-y-6">
                  {/* Overall Score and Recommendation */}
                  {reviewScore !== null && (
                    <div className="text-center py-6 bg-charcoal rounded-xl">
                      <div className={`text-5xl font-bold mb-2 ${
                        reviewScore >= 0.85 ? 'text-aurora-teal' :
                        reviewScore >= 0.70 ? 'text-nebula-blue' :
                        reviewScore >= 0.55 ? 'text-ember' : 'text-red-400'
                      }`}>
                        {Math.round(reviewScore * 100)}%
                      </div>
                      <p className="text-mist mb-3">Overall Quality Score</p>
                      {reviewRecommendation && (
                        <p className="text-sm text-cream px-4">{reviewRecommendation}</p>
                      )}
                    </div>
                  )}

                  {/* Phase-by-Phase Scores */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-mist uppercase tracking-wider">Detailed Analysis</h4>
                    {[
                      { id: 'narrative_structure', name: 'Narrative & Structure', icon: '📖' },
                      { id: 'character_development', name: 'Character Development', icon: '👥' },
                      { id: 'writing_quality', name: 'Writing Quality', icon: '✍️' },
                      { id: 'thematic_elements', name: 'Thematic Elements', icon: '💡' },
                      { id: 'technical_consistency', name: 'Technical Consistency', icon: '⚙️' },
                      { id: 'reader_experience', name: 'Reader Experience', icon: '📚' },
                    ].map(phase => {
                      const score = reviewPhaseScores[phase.id] || 0
                      const summary = reviewPhaseSummaries[phase.id] || ''
                      return (
                        <div key={phase.id} className="p-4 bg-charcoal rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{phase.icon}</span>
                              <span className="text-cream font-medium">{phase.name}</span>
                            </div>
                            <span className={`text-lg font-bold ${
                              score >= 0.8 ? 'text-aurora-teal' :
                              score >= 0.6 ? 'text-nebula-blue' :
                              score >= 0.4 ? 'text-ember' : 'text-red-400'
                            }`}>
                              {Math.round(score * 100)}%
                            </span>
                          </div>
                          {summary && (
                            <p className="text-sm text-mist">{summary}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Issues Found */}
                  {reviewIssues.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-mist uppercase tracking-wider">
                        Issues Found ({reviewIssues.length})
                      </h4>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {reviewIssues.slice(0, 10).map((issue, idx) => (
                          <div key={idx} className="p-3 bg-charcoal rounded-lg text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertCircle className="h-4 w-4 text-ember" />
                              <span className="text-ember capitalize">{issue.type}</span>
                              {issue.chapter && (
                                <span className="text-fog">• Chapter {issue.chapter}</span>
                              )}
                            </div>
                            <p className="text-mist">{issue.issue || issue.error}</p>
                          </div>
                        ))}
                        {reviewIssues.length > 10 && (
                          <p className="text-center text-fog text-sm">
                            +{reviewIssues.length - 10} more issues
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setReviewComplete(false)}
                      className="flex-1 px-4 py-3 bg-charcoal text-mist rounded-xl hover:bg-charcoal-light transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setReviewComplete(false)
                        handleAcceptManuscript()
                      }}
                      className="flex-1 px-4 py-3 border border-nebula-blue/50 text-nebula-blue rounded-xl font-medium hover:bg-nebula-blue/10 transition-all"
                    >
                      Re-run Review
                    </button>
                    <button
                      onClick={() => {
                        setReviewComplete(false)
                        setShowPublishModal(true)
                      }}
                      className="flex-1 px-4 py-3 bg-gradient-primary text-cream rounded-xl font-medium hover:opacity-90 transition-all"
                    >
                      Export Manuscript
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Publish Modal */}
        {showPublishModal && (
          <div className="fixed inset-0 bg-void/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass rounded-2xl shadow-glow-lg max-w-lg w-full p-8 animate-scale-in">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-aurora-teal/20">
                    <Send className="h-6 w-6 text-aurora-teal" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-cream">Publish Manuscript</h3>
                    <p className="text-sm text-mist">Export your completed book</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPublishModal(false)}
                  className="p-2 hover:bg-charcoal rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-mist" />
                </button>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-charcoal rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-cream mb-1">
                    {chapters.filter(ch => ch.status === 'complete').length}
                  </div>
                  <p className="text-sm text-mist">Chapters</p>
                </div>
                <div className="bg-charcoal rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-cream mb-1">
                    {chapters.reduce((sum, ch) => sum + ch.wordCount, 0).toLocaleString()}
                  </div>
                  <p className="text-sm text-mist">Total Words</p>
                </div>
              </div>

              {/* Export Options */}
              <div className="space-y-3 mb-6">
                <button
                  onClick={handleDownloadManuscript}
                  className="w-full flex items-center gap-4 p-4 bg-charcoal hover:bg-charcoal-light rounded-xl transition-colors group"
                >
                  <div className="p-2 bg-nebula-blue/20 rounded-lg group-hover:bg-nebula-blue/30 transition-colors">
                    <FileText className="h-5 w-5 text-nebula-blue" />
                  </div>
                  <div className="text-left flex-1">
                    <h4 className="text-cream font-medium">Markdown (.md)</h4>
                    <p className="text-sm text-fog">Universal format, perfect for editing</p>
                  </div>
                  <ChevronDown className="h-5 w-5 text-mist -rotate-90" />
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setShowPublishModal(false)}
                className="w-full px-4 py-3 bg-charcoal text-mist rounded-xl hover:bg-charcoal-light transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-void border-t border-graphite text-center text-sm py-4">
        <span className="text-fog">
          © 2025 sopher.ai •{' '}
          <a
            href="https://github.com/cheesejaguar/sopher.ai/blob/main/LICENSE"
            className="text-mist hover:text-aurora-teal transition-colors"
          >
            MIT License
          </a>{' '}
          •{' '}
          <a
            href="https://github.com/cheesejaguar/sopher.ai"
            className="text-mist hover:text-aurora-teal transition-colors"
          >
            GitHub Repository
          </a>
        </span>
      </footer>

      {/* Chapter Viewer Modal */}
      {viewingChapter !== null && (
        <div className="fixed inset-0 bg-void/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-charcoal border border-graphite rounded-2xl shadow-glow-lg w-full max-w-4xl max-h-[90vh] flex flex-col animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-graphite">
              <h2 className="text-xl font-semibold text-cream">
                Chapter {viewingChapter}: {chapters.find(c => c.number === viewingChapter)?.title}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-mist">
                  {chapters.find(c => c.number === viewingChapter)?.wordCount.toLocaleString()} words
                </span>
                <button
                  onClick={() => setViewingChapter(null)}
                  className="p-2 hover:bg-charcoal-light rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-mist hover:text-cream" />
                </button>
              </div>
            </div>
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="prose prose-invert prose-lg max-w-none">
                <ReactMarkdown>
                  {chapters.find(c => c.number === viewingChapter)?.content || ''}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
