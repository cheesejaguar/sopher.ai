'use client'

import { useState } from 'react'
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Star,
} from 'lucide-react'
import type { TeamTask } from '@/lib/zustand'

const STATUS_CONFIG: Record<
  TeamTask['status'],
  { icon: typeof Clock; color: string; label: string }
> = {
  pending: { icon: Clock, color: 'text-mist/60', label: 'Pending' },
  blocked: { icon: Lock, color: 'text-orange-400', label: 'Blocked' },
  ready: { icon: Unlock, color: 'text-blue-400', label: 'Ready' },
  claimed: { icon: Loader2, color: 'text-teal-400', label: 'Claimed' },
  in_progress: { icon: Loader2, color: 'text-aurora-teal', label: 'In Progress' },
  completed: { icon: CheckCircle, color: 'text-gold', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-400', label: 'Failed' },
}

const TASK_TYPE_LABELS: Record<string, string> = {
  concept: 'Concept',
  outline: 'Outline',
  write_chapter: 'Write',
  edit_chapter: 'Edit',
  continuity_check: 'Continuity',
}

type FilterStatus = 'all' | TeamTask['status']

interface TeamTaskListProps {
  tasks: TeamTask[]
}

export default function TeamTaskList({ tasks }: TeamTaskListProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [expandedTask, setExpandedTask] = useState<string | null>(null)

  const filteredTasks =
    filterStatus === 'all'
      ? tasks
      : tasks.filter((t) => t.status === filterStatus)

  const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="rounded-lg border border-slate/30 bg-obsidian/50">
      {/* Filter bar */}
      <div className="flex items-center gap-2 p-3 border-b border-slate/20 overflow-x-auto">
        <FilterChip
          label="All"
          count={tasks.length}
          active={filterStatus === 'all'}
          onClick={() => setFilterStatus('all')}
        />
        {(
          ['ready', 'in_progress', 'completed', 'failed', 'blocked', 'pending'] as const
        ).map((s) =>
          (statusCounts[s] || 0) > 0 ? (
            <FilterChip
              key={s}
              label={STATUS_CONFIG[s].label}
              count={statusCounts[s] || 0}
              active={filterStatus === s}
              onClick={() => setFilterStatus(s)}
              colorClass={STATUS_CONFIG[s].color}
            />
          ) : null
        )}
      </div>

      {/* Task list */}
      <div className="divide-y divide-slate/10 max-h-[500px] overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="p-6 text-center text-mist/60 text-sm">
            No tasks match this filter
          </div>
        ) : (
          filteredTasks.map((task) => {
            const config = STATUS_CONFIG[task.status]
            const StatusIcon = config.icon
            const isExpanded = expandedTask === task.id

            return (
              <div key={task.id} className="hover:bg-slate/5 transition-colors">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left"
                  onClick={() =>
                    setExpandedTask(isExpanded ? null : task.id)
                  }
                >
                  {/* Expand toggle */}
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-mist/40 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-mist/40 flex-shrink-0" />
                  )}

                  {/* Status icon */}
                  <StatusIcon
                    className={`h-4 w-4 flex-shrink-0 ${config.color} ${
                      task.status === 'in_progress' || task.status === 'claimed'
                        ? 'animate-spin'
                        : ''
                    }`}
                  />

                  {/* Task type badge */}
                  <span className="px-1.5 py-0.5 text-xs rounded bg-slate/20 text-mist/80 flex-shrink-0">
                    {TASK_TYPE_LABELS[task.task_type] || task.task_type}
                  </span>

                  {/* Title */}
                  <span className="text-sm text-ivory truncate flex-1">
                    {task.title}
                  </span>

                  {/* Chapter number */}
                  {task.chapter_number != null && (
                    <span className="text-xs text-mist/50 flex-shrink-0">
                      Ch. {task.chapter_number}
                    </span>
                  )}

                  {/* Quality score */}
                  {task.quality_score != null && (
                    <span className="flex items-center gap-0.5 text-xs text-gold flex-shrink-0">
                      <Star className="h-3 w-3" />
                      {task.quality_score.toFixed(1)}
                    </span>
                  )}

                  {/* Retry count */}
                  {task.retry_count > 0 && (
                    <span className="text-xs text-orange-400 flex-shrink-0">
                      retry {task.retry_count}
                    </span>
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pl-10 space-y-2">
                    {task.description && (
                      <p className="text-xs text-mist/60">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs">
                      {task.assigned_agent && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300">
                          {task.assigned_agent.replace('_', ' ')}
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded ${config.color} bg-slate/10`}>
                        {config.label}
                      </span>
                      {task.dependencies.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate/10 text-mist/50">
                          {task.dependencies.length} dep
                          {task.dependencies.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  colorClass,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  colorClass?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-aurora-teal/20 text-aurora-teal border border-aurora-teal/30'
          : 'bg-slate/10 text-mist/60 border border-slate/20 hover:border-slate/40'
      }`}
    >
      <span className={active ? '' : colorClass}>{label}</span>
      <span
        className={`px-1 py-0 rounded-full text-[10px] ${
          active ? 'bg-aurora-teal/30' : 'bg-slate/20'
        }`}
      >
        {count}
      </span>
    </button>
  )
}
