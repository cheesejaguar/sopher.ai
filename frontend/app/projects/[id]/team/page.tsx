'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/zustand'
import type {
  AppState,
  TeamRun,
  TeamTask,
  TeamMessage,
} from '@/lib/zustand'
import TeamDashboard from '@/components/TeamDashboard'
import {
  BookOpen,
  ChevronLeft,
  Play,
  Pause,
  Square,
  Loader2,
  AlertCircle,
  CheckCircle,
  Settings,
  DollarSign,
  RefreshCw,
} from 'lucide-react'

interface CostByAgent {
  [agent: string]: { usd: number; prompt_tokens: number; completion_tokens: number }
}

const MODELS = [
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
] as const

function getRunStatusDisplay(status: TeamRun['status']) {
  switch (status) {
    case 'pending':
      return { label: 'Pending', color: 'text-mist/60', bgColor: 'bg-slate/20' }
    case 'running':
      return { label: 'Running', color: 'text-aurora-teal', bgColor: 'bg-aurora-teal/20' }
    case 'paused':
      return { label: 'Paused', color: 'text-amber-400', bgColor: 'bg-amber-500/20' }
    case 'completed':
      return { label: 'Completed', color: 'text-gold', bgColor: 'bg-gold/20' }
    case 'failed':
      return { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/20' }
    case 'cancelled':
      return { label: 'Cancelled', color: 'text-mist/40', bgColor: 'bg-slate/20' }
    default:
      return { label: status, color: 'text-mist/60', bgColor: 'bg-slate/20' }
  }
}

export default function TeamGenerationPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // Config state
  const [numChapters, setNumChapters] = useState(10)
  const [maxParallel, setMaxParallel] = useState(3)
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id)
  const [styleGuide, setStyleGuide] = useState('')
  const [skipEditing, setSkipEditing] = useState(false)
  const [skipContinuity, setSkipContinuity] = useState(false)
  const [showConfig, setShowConfig] = useState(true)

  // Page state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [costByAgent, setCostByAgent] = useState<CostByAgent>({})
  const [totalCostUsd, setTotalCostUsd] = useState(0)

  const eventSourceRef = useRef<EventSource | null>(null)

  // Zustand state
  const user = useStore((state: AppState) => state.user)
  const currentProject = useStore((state: AppState) => state.currentProject)
  const currentTeamRun = useStore((state: AppState) => state.currentTeamRun)
  const setCurrentTeamRun = useStore((state: AppState) => state.setCurrentTeamRun)
  const teamTasks = useStore((state: AppState) => state.teamTasks)
  const setTeamTasks = useStore((state: AppState) => state.setTeamTasks)
  const updateTeamTask = useStore((state: AppState) => state.updateTeamTask)
  const teamMessages = useStore((state: AppState) => state.teamMessages)
  const addTeamMessage = useStore((state: AppState) => state.addTeamMessage)
  const setTeamMessages = useStore((state: AppState) => state.setTeamMessages)
  const clearTeamState = useStore((state: AppState) => state.clearTeamState)
  const setCurrentProject = useStore((state: AppState) => state.setCurrentProject)

  // Fetch project details
  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/backend/v1/projects/${projectId}`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setCurrentProject(data)
        if (data.style_guide) setStyleGuide(data.style_guide)
        if (data.target_chapters) setNumChapters(data.target_chapters)
      } else if (response.status === 401) {
        window.location.href = '/login'
      }
    } catch (err) {
      console.error('Error fetching project:', err)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, setCurrentProject])

  useEffect(() => {
    fetchProject()
    return () => {
      // Cleanup SSE on unmount
      eventSourceRef.current?.close()
    }
  }, [fetchProject])

  // Start a team run
  const startTeamRun = async () => {
    setIsStarting(true)
    setError(null)
    clearTeamState()

    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/team/start`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            num_chapters: numChapters,
            style_guide: styleGuide || undefined,
            max_parallel: maxParallel,
            skip_editing: skipEditing,
            skip_continuity: skipContinuity,
            model: selectedModel,
          }),
        }
      )

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || `Failed to start team run: ${response.statusText}`)
      }

      const data = await response.json()
      const run: TeamRun = {
        id: data.team_run_id,
        project_id: projectId,
        status: data.status,
        total_tasks: data.total_tasks,
        completed_tasks: 0,
        failed_tasks: 0,
      }
      setCurrentTeamRun(run)
      setShowConfig(false)

      // Connect to SSE stream
      connectToStream(data.team_run_id)

      // Fetch initial tasks
      await fetchTasks(data.team_run_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start team run')
    } finally {
      setIsStarting(false)
    }
  }

  // Connect to SSE stream for real-time updates
  const connectToStream = (runId: string) => {
    eventSourceRef.current?.close()

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
    const eventSource = new EventSource(
      `${backendUrl}/api/v1/projects/${projectId}/team/${runId}/stream`,
      { withCredentials: true }
    )
    eventSourceRef.current = eventSource

    eventSource.addEventListener('task_claimed', (e) => {
      const data = JSON.parse(e.data)
      updateTeamTask(data.task_id, {
        status: 'claimed',
        assigned_agent: data.agent,
      })
    })

    eventSource.addEventListener('task_in_progress', (e) => {
      const data = JSON.parse(e.data)
      updateTeamTask(data.task_id, { status: 'in_progress' })
    })

    eventSource.addEventListener('task_completed', (e) => {
      const data = JSON.parse(e.data)
      updateTeamTask(data.task_id, {
        status: 'completed',
        quality_score: data.quality_score,
      })
      if (currentTeamRun) {
        setCurrentTeamRun({
          ...currentTeamRun,
          completed_tasks: data.completed_tasks ?? currentTeamRun.completed_tasks + 1,
        })
      }
    })

    eventSource.addEventListener('task_failed', (e) => {
      const data = JSON.parse(e.data)
      updateTeamTask(data.task_id, { status: 'failed' })
      if (currentTeamRun) {
        setCurrentTeamRun({
          ...currentTeamRun,
          failed_tasks: data.failed_tasks ?? currentTeamRun.failed_tasks + 1,
        })
      }
    })

    eventSource.addEventListener('task_retry', (e) => {
      const data = JSON.parse(e.data)
      updateTeamTask(data.task_id, {
        status: 'ready',
        retry_count: (data.retry_count ?? 0) + 1,
      })
    })

    eventSource.addEventListener('task_unblocked', (e) => {
      const data = JSON.parse(e.data)
      updateTeamTask(data.task_id, { status: 'ready' })
    })

    eventSource.addEventListener('progress_update', (e) => {
      const data = JSON.parse(e.data)
      if (currentTeamRun) {
        setCurrentTeamRun({
          ...currentTeamRun,
          completed_tasks: data.completed_tasks ?? currentTeamRun.completed_tasks,
          failed_tasks: data.failed_tasks ?? currentTeamRun.failed_tasks,
        })
      }
    })

    eventSource.addEventListener('message_sent', (e) => {
      const data = JSON.parse(e.data)
      if (data.message) {
        addTeamMessage(data.message)
      }
    })

    eventSource.addEventListener('team_completed', () => {
      if (currentTeamRun) {
        setCurrentTeamRun({ ...currentTeamRun, status: 'completed' })
      }
      eventSource.close()
      // Fetch final costs
      fetchCosts(runId)
    })

    eventSource.addEventListener('team_failed', (e) => {
      const data = JSON.parse(e.data)
      if (currentTeamRun) {
        setCurrentTeamRun({ ...currentTeamRun, status: 'failed' })
      }
      setError(data.error || 'Team run failed')
      eventSource.close()
    })

    eventSource.addEventListener('error', () => {
      // EventSource auto-reconnects, but log the error
      console.warn('SSE connection error, reconnecting...')
    })
  }

  // Fetch tasks for a run
  const fetchTasks = async (runId: string) => {
    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/team/${runId}/tasks`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const data = await response.json()
        setTeamTasks(
          data.tasks.map((t: Record<string, unknown>) => ({
            id: t.id as string,
            task_type: t.task_type as string,
            title: t.title as string,
            description: t.description as string | undefined,
            status: t.status as TeamTask['status'],
            assigned_agent: t.assigned_agent as string | undefined,
            chapter_number: t.chapter_number as number | undefined,
            dependencies: (t.dependencies || []) as string[],
            quality_score: t.quality_score as number | undefined,
            retry_count: (t.retry_count || 0) as number,
          }))
        )
      }
    } catch (err) {
      console.error('Error fetching tasks:', err)
    }
  }

  // Fetch messages for a run
  const fetchMessages = async (runId: string) => {
    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/team/${runId}/messages?limit=200`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const data = await response.json()
        setTeamMessages(
          data.messages.map((m: Record<string, unknown>) => ({
            id: m.id as string,
            from_agent: m.from_agent as string,
            to_agent: m.to_agent as string | undefined,
            message_type: m.message_type as string,
            content: m.content as Record<string, unknown>,
            task_id: m.task_id as string | undefined,
            created_at: m.created_at as string,
          }))
        )
      }
    } catch (err) {
      console.error('Error fetching messages:', err)
    }
  }

  // Fetch costs
  const fetchCosts = async (runId: string) => {
    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/team/${runId}/costs`,
        { credentials: 'include' }
      )
      if (response.ok) {
        const data = await response.json()
        setCostByAgent(data.by_agent || {})
        setTotalCostUsd(data.total_usd || 0)
      }
    } catch (err) {
      console.error('Error fetching costs:', err)
    }
  }

  // Pause/Resume/Cancel actions
  const pauseRun = async () => {
    if (!currentTeamRun) return
    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/team/${currentTeamRun.id}/pause`,
        { method: 'POST', credentials: 'include' }
      )
      if (response.ok) {
        setCurrentTeamRun({ ...currentTeamRun, status: 'paused' })
      }
    } catch (err) {
      console.error('Error pausing run:', err)
    }
  }

  const resumeRun = async () => {
    if (!currentTeamRun) return
    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/team/${currentTeamRun.id}/resume`,
        { method: 'POST', credentials: 'include' }
      )
      if (response.ok) {
        setCurrentTeamRun({ ...currentTeamRun, status: 'running' })
      }
    } catch (err) {
      console.error('Error resuming run:', err)
    }
  }

  const cancelRun = async () => {
    if (!currentTeamRun) return
    try {
      const response = await fetch(
        `/api/backend/v1/projects/${projectId}/team/${currentTeamRun.id}/cancel`,
        { method: 'POST', credentials: 'include' }
      )
      if (response.ok) {
        setCurrentTeamRun({ ...currentTeamRun, status: 'cancelled' })
        eventSourceRef.current?.close()
      }
    } catch (err) {
      console.error('Error cancelling run:', err)
    }
  }

  // Refresh tasks/messages
  const refreshData = async () => {
    if (!currentTeamRun) return
    await Promise.all([
      fetchTasks(currentTeamRun.id),
      fetchMessages(currentTeamRun.id),
      fetchCosts(currentTeamRun.id),
    ])
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-deep-space flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-aurora-teal" />
      </div>
    )
  }

  const statusDisplay = currentTeamRun
    ? getRunStatusDisplay(currentTeamRun.status)
    : null

  return (
    <div className="min-h-screen bg-deep-space">
      {/* Header */}
      <div className="border-b border-slate/20 bg-obsidian/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/projects/${projectId}`)}
                className="p-1.5 rounded-lg hover:bg-slate/20 text-mist/60 hover:text-ivory transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <BookOpen className="h-5 w-5 text-aurora-teal" />
              <div>
                <h1 className="text-lg font-semibold text-ivory">
                  Team Generation
                </h1>
                <p className="text-xs text-mist/60">
                  {currentProject?.name || 'Project'}
                </p>
              </div>
            </div>

            {/* Run status + controls */}
            <div className="flex items-center gap-3">
              {statusDisplay && (
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}
                >
                  {statusDisplay.label}
                </span>
              )}

              {currentTeamRun && (
                <>
                  {currentTeamRun.status === 'running' && (
                    <button
                      onClick={pauseRun}
                      className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-colors"
                      title="Pause"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                  )}
                  {currentTeamRun.status === 'paused' && (
                    <button
                      onClick={resumeRun}
                      className="p-1.5 rounded-lg hover:bg-aurora-teal/20 text-aurora-teal transition-colors"
                      title="Resume"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  {(currentTeamRun.status === 'running' ||
                    currentTeamRun.status === 'paused') && (
                    <button
                      onClick={cancelRun}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                      title="Cancel"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={refreshData}
                    className="p-1.5 rounded-lg hover:bg-slate/20 text-mist/60 hover:text-ivory transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </>
              )}

              {/* Total cost */}
              {totalCostUsd > 0 && (
                <div className="flex items-center gap-1 text-xs text-mist/60">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-ivory">${totalCostUsd.toFixed(4)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Configuration panel (shown before starting) */}
        {!currentTeamRun && showConfig && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="rounded-lg border border-slate/30 bg-obsidian/50 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="h-5 w-5 text-aurora-teal" />
                <h2 className="text-base font-semibold text-ivory">
                  Configuration
                </h2>
              </div>

              <div className="space-y-4">
                {/* Model selection */}
                <div>
                  <label className="block text-sm text-mist/80 mb-1.5">
                    Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-slate/30 text-ivory text-sm focus:outline-none focus:border-aurora-teal/50"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chapters */}
                <div>
                  <label className="block text-sm text-mist/80 mb-1.5">
                    Number of Chapters
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={numChapters}
                    onChange={(e) =>
                      setNumChapters(
                        Math.max(1, Math.min(50, parseInt(e.target.value) || 1))
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-slate/30 text-ivory text-sm focus:outline-none focus:border-aurora-teal/50"
                  />
                </div>

                {/* Max parallel */}
                <div>
                  <label className="block text-sm text-mist/80 mb-1.5">
                    Max Parallel Agents
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={maxParallel}
                    onChange={(e) =>
                      setMaxParallel(
                        Math.max(1, Math.min(5, parseInt(e.target.value) || 1))
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-slate/30 text-ivory text-sm focus:outline-none focus:border-aurora-teal/50"
                  />
                  <p className="text-xs text-mist/40 mt-1">
                    Concurrent writer/editor agents (1-5)
                  </p>
                </div>

                {/* Style guide */}
                <div>
                  <label className="block text-sm text-mist/80 mb-1.5">
                    Style Guide (optional)
                  </label>
                  <textarea
                    value={styleGuide}
                    onChange={(e) => setStyleGuide(e.target.value)}
                    rows={3}
                    placeholder="Writing style instructions for the team..."
                    className="w-full px-3 py-2 rounded-lg bg-obsidian border border-slate/30 text-ivory text-sm focus:outline-none focus:border-aurora-teal/50 placeholder-mist/30 resize-none"
                  />
                </div>

                {/* Skip toggles */}
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-mist/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipEditing}
                      onChange={(e) => setSkipEditing(e.target.checked)}
                      className="rounded border-slate/30 bg-obsidian text-aurora-teal focus:ring-aurora-teal/50"
                    />
                    Skip editing pass
                  </label>
                  <label className="flex items-center gap-2 text-sm text-mist/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipContinuity}
                      onChange={(e) => setSkipContinuity(e.target.checked)}
                      className="rounded border-slate/30 bg-obsidian text-aurora-teal focus:ring-aurora-teal/50"
                    />
                    Skip continuity check
                  </label>
                </div>
              </div>

              {/* Brief preview */}
              {currentProject?.brief && (
                <div className="mt-4 pt-4 border-t border-slate/20">
                  <p className="text-xs text-mist/40 mb-1">Project Brief</p>
                  <p className="text-sm text-mist/70 line-clamp-3">
                    {currentProject.brief}
                  </p>
                </div>
              )}

              {!currentProject?.brief && (
                <div className="mt-4 pt-4 border-t border-slate/20">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm">
                      This project has no brief. Please add a brief before starting
                      team generation.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Start button */}
            <button
              onClick={startTeamRun}
              disabled={isStarting || !currentProject?.brief}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-aurora-teal text-obsidian font-semibold text-sm transition-all hover:bg-aurora-teal/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting Team...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Team Generation
                </>
              )}
            </button>
          </div>
        )}

        {/* Dashboard (shown during/after run) */}
        {currentTeamRun && (
          <TeamDashboard
            run={currentTeamRun}
            tasks={teamTasks}
            messages={teamMessages}
            costByAgent={costByAgent}
          />
        )}

        {/* Completed summary */}
        {currentTeamRun?.status === 'completed' && (
          <div className="mt-6 rounded-lg border border-gold/30 bg-gold/5 p-6 text-center">
            <CheckCircle className="h-8 w-8 text-gold mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-ivory mb-1">
              Generation Complete
            </h3>
            <p className="text-sm text-mist/60 mb-4">
              All {currentTeamRun.total_tasks} tasks finished.
              {totalCostUsd > 0 && ` Total cost: $${totalCostUsd.toFixed(4)}`}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => router.push(`/projects/${projectId}`)}
                className="px-4 py-2 rounded-lg bg-gold/20 text-gold text-sm font-medium hover:bg-gold/30 transition-colors"
              >
                View Project
              </button>
              <button
                onClick={() => {
                  clearTeamState()
                  setShowConfig(true)
                }}
                className="px-4 py-2 rounded-lg bg-slate/20 text-mist text-sm font-medium hover:bg-slate/30 transition-colors"
              >
                Start New Run
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
