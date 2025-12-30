'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useStore } from '@/lib/zustand'
import type { AppState, User, Project } from '@/lib/zustand'
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
} from 'lucide-react'

interface ProjectStats {
  project_id: string
  session_count: number
  artifact_count: number
  total_cost_usd: number
  status: string
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
}

function getStatusColor(status: Project['status']): string {
  switch (status) {
    case 'draft':
      return 'bg-slate/20 text-slate'
    case 'in_progress':
      return 'bg-teal/20 text-teal'
    case 'completed':
      return 'bg-gold/20 text-gold'
    default:
      return 'bg-slate/20 text-slate'
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
    }
  }, [user, projectId, fetchProject, fetchStats])

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

  const handleStartGeneration = () => {
    // Navigate to home page with project context for outline generation
    window.location.href = `/?project=${projectId}`
  }

  const settings = project?.settings as ProjectSettings | undefined

  return (
    <div className="flex min-h-screen flex-col bg-parchment dark:bg-indigo">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate bg-indigo text-snow">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-gold" />
            <h1 className="text-2xl font-serif font-bold">sopher.ai</h1>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || user.email}
                      className="h-8 w-8 rounded-full border border-gold"
                    />
                  ) : (
                    <UserIcon className="h-5 w-5 text-gold" />
                  )}
                  <span className="hidden sm:inline">{user.name || user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-indigo-700 rounded-lg transition-colors"
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
          className="flex items-center gap-1 text-slate hover:text-ink mb-6 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-teal" />
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-800 mb-2">{error}</h3>
            <button
              onClick={fetchProject}
              className="text-sm text-red-600 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Project Content */}
        {project && !isLoading && (
          <div className="space-y-6">
            {/* Project Header */}
            <div className="bg-snow rounded-xl shadow-sm p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-serif font-bold text-ink">
                      {project.name}
                    </h2>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(project.status)}`}>
                      {getStatusIcon(project.status)}
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>

                  {project.genre && (
                    <p className="text-slate mb-2">{project.genre}</p>
                  )}

                  {project.description && (
                    <p className="text-slate/80">{project.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStartGeneration}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo to-teal text-snow rounded-lg font-medium hover:opacity-90 transition-opacity"
                  >
                    <Play className="h-4 w-4" />
                    Generate
                  </button>
                  <button
                    onClick={() => window.location.href = `/projects/${projectId}/edit`}
                    className="p-2 border border-slate/30 rounded-lg hover:bg-parchment transition-colors"
                    title="Edit Project"
                  >
                    <Settings className="h-5 w-5 text-slate" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete Project"
                  >
                    <Trash2 className="h-5 w-5 text-red-500" />
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-snow rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 text-slate mb-2">
                  <Target className="h-4 w-4" />
                  <span className="text-sm">Chapters</span>
                </div>
                <p className="text-2xl font-bold text-ink">{project.target_chapters}</p>
              </div>

              <div className="bg-snow rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 text-slate mb-2">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">Artifacts</span>
                </div>
                <p className="text-2xl font-bold text-ink">{stats?.artifact_count ?? 0}</p>
              </div>

              <div className="bg-snow rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 text-slate mb-2">
                  <BookText className="h-4 w-4" />
                  <span className="text-sm">Sessions</span>
                </div>
                <p className="text-2xl font-bold text-ink">{stats?.session_count ?? 0}</p>
              </div>

              <div className="bg-snow rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-2 text-slate mb-2">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm">Total Cost</span>
                </div>
                <p className="text-2xl font-bold text-ink">
                  ${(stats?.total_cost_usd ?? 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Project Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Settings Panel */}
              <div className="bg-snow rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-teal" />
                  Project Settings
                </h3>

                <dl className="space-y-3">
                  {settings?.target_audience && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Target Audience</dt>
                      <dd className="text-ink font-medium">{settings.target_audience}</dd>
                    </div>
                  )}

                  {settings?.tone && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Tone</dt>
                      <dd className="text-ink font-medium capitalize">{settings.tone}</dd>
                    </div>
                  )}

                  {settings?.pov && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Point of View</dt>
                      <dd className="text-ink font-medium">{formatLabel(settings.pov)}</dd>
                    </div>
                  )}

                  {settings?.tense && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Tense</dt>
                      <dd className="text-ink font-medium capitalize">{settings.tense}</dd>
                    </div>
                  )}

                  {settings?.dialogue_style && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Dialogue Style</dt>
                      <dd className="text-ink font-medium capitalize">{settings.dialogue_style}</dd>
                    </div>
                  )}

                  {settings?.prose_style && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Prose Style</dt>
                      <dd className="text-ink font-medium capitalize">{settings.prose_style}</dd>
                    </div>
                  )}

                  {settings?.chapter_length_target && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Chapter Length</dt>
                      <dd className="text-ink font-medium">
                        {settings.chapter_length_target.toLocaleString()} words
                      </dd>
                    </div>
                  )}

                  {!settings?.tone && !settings?.pov && !settings?.tense && (
                    <p className="text-slate/70 italic">No custom settings configured</p>
                  )}
                </dl>
              </div>

              {/* Metadata Panel */}
              <div className="bg-snow rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-teal" />
                  Project Info
                </h3>

                <dl className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-slate/10">
                    <dt className="text-slate">Created</dt>
                    <dd className="text-ink font-medium">{formatDate(project.created_at)}</dd>
                  </div>

                  {project.updated_at && (
                    <div className="flex justify-between py-2 border-b border-slate/10">
                      <dt className="text-slate">Last Updated</dt>
                      <dd className="text-ink font-medium">{formatDate(project.updated_at)}</dd>
                    </div>
                  )}

                  <div className="flex justify-between py-2 border-b border-slate/10">
                    <dt className="text-slate">Project ID</dt>
                    <dd className="text-ink font-mono text-sm">{project.id}</dd>
                  </div>
                </dl>

                {/* Style Guide */}
                {project.style_guide && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-slate mb-2">Style Guide</h4>
                    <p className="text-ink text-sm bg-parchment rounded-lg p-3">
                      {project.style_guide}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Character Bible & World Building */}
            {(settings?.character_bible_text || settings?.world_building_text) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {settings?.character_bible_text && (
                  <div className="bg-snow rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-ink mb-4">Character Bible</h3>
                    <p className="text-slate/80 text-sm whitespace-pre-wrap">
                      {settings.character_bible_text}
                    </p>
                  </div>
                )}

                {settings?.world_building_text && (
                  <div className="bg-snow rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-ink mb-4">World Building</h3>
                    <p className="text-slate/80 text-sm whitespace-pre-wrap">
                      {settings.world_building_text}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-snow rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-ink mb-2">Delete Project?</h3>
              <p className="text-slate mb-6">
                Are you sure you want to delete &quot;{project?.name}&quot;? This action cannot be undone.
                All associated content, sessions, and artifacts will be permanently deleted.
              </p>

              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 text-slate hover:bg-parchment rounded-lg transition-colors"
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
      </main>

      {/* Footer */}
      <footer className="bg-indigo text-snow text-center text-sm py-4">
        © 2025 sopher.ai •{' '}
        <a
          href="https://github.com/cheesejaguar/sopher.ai/blob/main/LICENSE"
          className="underline"
        >
          MIT License
        </a>{' '}
        •{' '}
        <a
          href="https://github.com/cheesejaguar/sopher.ai"
          className="underline"
        >
          GitHub Repository
        </a>
      </footer>
    </div>
  )
}
