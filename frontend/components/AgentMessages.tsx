'use client'

import { useState, useRef, useEffect } from 'react'
import {
  MessageSquare,
  ChevronDown,
  ArrowRight,
  Globe,
  Filter,
} from 'lucide-react'
import type { TeamMessage } from '@/lib/zustand'

const AGENT_COLORS: Record<string, string> = {
  concept_generator: 'text-purple-400',
  outliner: 'text-blue-400',
  writer: 'text-aurora-teal',
  editor: 'text-amber-400',
  continuity_checker: 'text-pink-400',
  team_lead: 'text-ivory',
  system: 'text-mist/60',
}

const MESSAGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  context_share: { label: 'Context', color: 'bg-blue-500/10 text-blue-300' },
  style_note: { label: 'Style', color: 'bg-purple-500/10 text-purple-300' },
  issue_report: { label: 'Issue', color: 'bg-red-500/10 text-red-300' },
  correction_request: { label: 'Correction', color: 'bg-orange-500/10 text-orange-300' },
  quality_feedback: { label: 'Quality', color: 'bg-gold/10 text-gold' },
  dependency_resolved: { label: 'Resolved', color: 'bg-green-500/10 text-green-300' },
  status_update: { label: 'Status', color: 'bg-slate/20 text-mist' },
}

function formatAgentName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

interface AgentMessagesProps {
  messages: TeamMessage[]
}

export default function AgentMessages({ messages }: AgentMessagesProps) {
  const [filterAgent, setFilterAgent] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const agents = Array.from(new Set(messages.map((m) => m.from_agent)))
  const types = Array.from(new Set(messages.map((m) => m.message_type)))

  const filtered = messages.filter((m) => {
    if (filterAgent && m.from_agent !== filterAgent && m.to_agent !== filterAgent)
      return false
    if (filterType && m.message_type !== filterType) return false
    return true
  })

  return (
    <div className="rounded-lg border border-slate/30 bg-obsidian/50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate/20">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-mist/60" />
          <span className="text-sm font-medium text-ivory">
            Agent Messages
          </span>
          <span className="text-xs text-mist/40">({messages.length})</span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            filterAgent || filterType
              ? 'bg-aurora-teal/20 text-aurora-teal'
              : 'bg-slate/10 text-mist/60 hover:text-mist'
          }`}
        >
          <Filter className="h-3 w-3" />
          Filter
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-2 border-b border-slate/20 flex flex-wrap gap-2">
          <select
            value={filterAgent || ''}
            onChange={(e) => setFilterAgent(e.target.value || null)}
            className="px-2 py-1 rounded text-xs bg-obsidian border border-slate/30 text-ivory focus:outline-none focus:border-aurora-teal/50"
          >
            <option value="">All Agents</option>
            {agents.map((a) => (
              <option key={a} value={a}>
                {formatAgentName(a)}
              </option>
            ))}
          </select>
          <select
            value={filterType || ''}
            onChange={(e) => setFilterType(e.target.value || null)}
            className="px-2 py-1 rounded text-xs bg-obsidian border border-slate/30 text-ivory focus:outline-none focus:border-aurora-teal/50"
          >
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {MESSAGE_TYPE_LABELS[t]?.label || t}
              </option>
            ))}
          </select>
          {(filterAgent || filterType) && (
            <button
              onClick={() => {
                setFilterAgent(null)
                setFilterType(null)
              }}
              className="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-500/10"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Messages timeline */}
      <div className="flex-1 overflow-y-auto max-h-[400px] p-3 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center text-mist/40 text-sm py-8">
            No messages yet
          </div>
        ) : (
          filtered.map((msg) => {
            const typeInfo = MESSAGE_TYPE_LABELS[msg.message_type] || {
              label: msg.message_type,
              color: 'bg-slate/20 text-mist',
            }
            const fromColor = AGENT_COLORS[msg.from_agent] || 'text-mist'
            const toColor = msg.to_agent
              ? AGENT_COLORS[msg.to_agent] || 'text-mist'
              : null

            return (
              <div
                key={msg.id}
                className="group flex gap-2 text-xs hover:bg-slate/5 rounded p-1.5 -mx-1.5"
              >
                {/* Timestamp */}
                <span className="text-mist/30 flex-shrink-0 w-16 text-right pt-0.5 font-mono">
                  {formatTimestamp(msg.created_at)}
                </span>

                <div className="flex-1 min-w-0">
                  {/* From/To line */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-medium ${fromColor}`}>
                      {formatAgentName(msg.from_agent)}
                    </span>
                    {msg.to_agent ? (
                      <>
                        <ArrowRight className="h-3 w-3 text-mist/30" />
                        <span className={`font-medium ${toColor}`}>
                          {formatAgentName(msg.to_agent)}
                        </span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-3 w-3 text-mist/30" />
                        <Globe className="h-3 w-3 text-mist/40" />
                        <span className="text-mist/40">all</span>
                      </>
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${typeInfo.color}`}
                    >
                      {typeInfo.label}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="mt-1 text-mist/70">
                    {renderMessageContent(msg.content)}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function renderMessageContent(content: Record<string, unknown>): React.ReactNode {
  // Try to extract a summary or message field
  const summary =
    (content.summary as string) ||
    (content.message as string) ||
    (content.text as string) ||
    (content.issue as string)

  if (summary) {
    return <p className="line-clamp-2">{summary}</p>
  }

  // Fall back to showing the content keys
  const keys = Object.keys(content)
  if (keys.length === 0) return <span className="text-mist/30">empty</span>

  return (
    <p className="line-clamp-2 text-mist/50">
      {keys.map((k) => `${k}: ${JSON.stringify(content[k])?.slice(0, 50)}`).join(', ')}
    </p>
  )
}
