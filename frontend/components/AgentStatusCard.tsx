'use client'

import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Pause,
  Cpu,
} from 'lucide-react'
import type { TeamTask } from '@/lib/zustand'

const AGENT_DISPLAY: Record<string, { label: string; color: string }> = {
  concept_generator: { label: 'Concept Generator', color: 'text-purple-400' },
  outliner: { label: 'Outliner', color: 'text-blue-400' },
  writer: { label: 'Writer', color: 'text-aurora-teal' },
  editor: { label: 'Editor', color: 'text-amber-400' },
  continuity_checker: { label: 'Continuity Checker', color: 'text-pink-400' },
}

function getAgentDisplay(role: string) {
  return AGENT_DISPLAY[role] || { label: role, color: 'text-mist' }
}

interface AgentStatusCardProps {
  agentRole: string
  tasks: TeamTask[]
  messageCount: number
  costUsd?: number
}

export default function AgentStatusCard({
  agentRole,
  tasks,
  messageCount,
  costUsd,
}: AgentStatusCardProps) {
  const display = getAgentDisplay(agentRole)
  const activeTasks = tasks.filter(
    (t) => t.status === 'in_progress' || t.status === 'claimed'
  )
  const completedTasks = tasks.filter((t) => t.status === 'completed')
  const failedTasks = tasks.filter((t) => t.status === 'failed')
  const pendingTasks = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'blocked' || t.status === 'ready'
  )

  const isActive = activeTasks.length > 0
  const allDone = pendingTasks.length === 0 && activeTasks.length === 0

  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        isActive
          ? 'border-aurora-teal/40 bg-aurora-teal/5'
          : allDone && completedTasks.length > 0
          ? 'border-gold/30 bg-gold/5'
          : 'border-slate/30 bg-obsidian/50'
      }`}
    >
      {/* Agent header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className={`h-4 w-4 ${display.color}`} />
          <span className={`font-medium text-sm ${display.color}`}>
            {display.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isActive ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-aurora-teal" />
          ) : allDone && completedTasks.length > 0 ? (
            <CheckCircle className="h-3.5 w-3.5 text-gold" />
          ) : failedTasks.length > 0 ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-mist/60" />
          )}
        </div>
      </div>

      {/* Current task */}
      {activeTasks.length > 0 && (
        <div className="mb-3 rounded bg-aurora-teal/10 px-2.5 py-1.5">
          <p className="text-xs text-aurora-teal truncate">
            {activeTasks[0].title}
          </p>
          {activeTasks[0].chapter_number != null && (
            <p className="text-xs text-mist/60 mt-0.5">
              Chapter {activeTasks[0].chapter_number}
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-semibold text-ivory">
            {completedTasks.length}
          </p>
          <p className="text-xs text-mist/60">Done</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-ivory">
            {failedTasks.length}
          </p>
          <p className="text-xs text-mist/60">Failed</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-ivory">{messageCount}</p>
          <p className="text-xs text-mist/60">Msgs</p>
        </div>
      </div>

      {/* Cost */}
      {costUsd != null && costUsd > 0 && (
        <div className="mt-2 pt-2 border-t border-slate/20 text-center">
          <p className="text-xs text-mist/60">
            Cost: <span className="text-ivory">${costUsd.toFixed(4)}</span>
          </p>
        </div>
      )}

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="mt-2">
          <div className="h-1 w-full rounded-full bg-slate/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-aurora-teal transition-all duration-500"
              style={{
                width: `${(completedTasks.length / tasks.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
