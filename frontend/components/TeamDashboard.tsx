'use client'

import type { TeamRun, TeamTask, TeamMessage } from '@/lib/zustand'
import AgentStatusCard from './AgentStatusCard'
import TeamTaskList from './TeamTaskList'
import AgentMessages from './AgentMessages'

const AGENT_ROLES = [
  'concept_generator',
  'outliner',
  'writer',
  'editor',
  'continuity_checker',
] as const

interface CostByAgent {
  [agent: string]: { usd: number; prompt_tokens: number; completion_tokens: number }
}

interface TeamDashboardProps {
  run: TeamRun
  tasks: TeamTask[]
  messages: TeamMessage[]
  costByAgent?: CostByAgent
}

export default function TeamDashboard({
  run,
  tasks,
  messages,
  costByAgent,
}: TeamDashboardProps) {
  const overallProgress =
    run.total_tasks > 0 ? run.completed_tasks / run.total_tasks : 0

  // Group tasks/messages by agent
  const tasksByAgent: Record<string, TeamTask[]> = {}
  const messageCountByAgent: Record<string, number> = {}

  for (const role of AGENT_ROLES) {
    tasksByAgent[role] = tasks.filter((t) => t.assigned_agent === role)
    messageCountByAgent[role] = messages.filter(
      (m) => m.from_agent === role || m.to_agent === role
    ).length
  }

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <div className="rounded-lg border border-slate/30 bg-obsidian/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-ivory">Overall Progress</h3>
          <span className="text-sm text-mist/60">
            {run.completed_tasks}/{run.total_tasks} tasks
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-slate/20 overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-aurora-teal to-gold transition-all duration-700"
            style={{ width: `${overallProgress * 100}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4 text-center">
          <StatItem
            label="Completed"
            value={run.completed_tasks}
            color="text-gold"
          />
          <StatItem
            label="Failed"
            value={run.failed_tasks}
            color={run.failed_tasks > 0 ? 'text-red-400' : 'text-mist/40'}
          />
          <StatItem
            label="In Progress"
            value={
              tasks.filter(
                (t) => t.status === 'in_progress' || t.status === 'claimed'
              ).length
            }
            color="text-aurora-teal"
          />
          <StatItem
            label="Pending"
            value={
              tasks.filter(
                (t) =>
                  t.status === 'pending' ||
                  t.status === 'blocked' ||
                  t.status === 'ready'
              ).length
            }
            color="text-mist/60"
          />
        </div>
      </div>

      {/* Agent cards */}
      <div>
        <h3 className="text-sm font-medium text-ivory mb-3">Agent Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {AGENT_ROLES.map((role) => (
            <AgentStatusCard
              key={role}
              agentRole={role}
              tasks={tasksByAgent[role] || []}
              messageCount={messageCountByAgent[role] || 0}
              costUsd={costByAgent?.[role]?.usd}
            />
          ))}
        </div>
      </div>

      {/* Task list and Messages side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium text-ivory mb-3">Task List</h3>
          <TeamTaskList tasks={tasks} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-ivory mb-3">
            Inter-Agent Communication
          </h3>
          <AgentMessages messages={messages} />
        </div>
      </div>
    </div>
  )
}

function StatItem({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-mist/50">{label}</p>
    </div>
  )
}
