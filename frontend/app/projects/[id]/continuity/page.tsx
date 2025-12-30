'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useStore } from '@/lib/zustand'

// Types for continuity data
export interface ContinuityIssue {
  id: string
  issue_type: 'character' | 'timeline' | 'world' | 'location' | 'knowledge'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  chapter_references: number[]
  character_name?: string
  status: 'open' | 'resolved' | 'ignored'
  created_at: string
}

export interface CharacterProfile {
  id: string
  name: string
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor' | 'mentioned'
  first_appearance: number
  chapter_appearances: number[]
  physical_attributes: Record<string, string>
  personality_traits: string[]
  relationships: Array<{ character: string; relationship_type: string }>
  knowledge_items: string[]
  contradictions: string[]
}

export interface TimelineEvent {
  id: string
  event_type: string
  description: string
  chapter_number: number
  time_marker?: string
  characters_involved: string[]
  sequence_order: number
}

export interface WorldRule {
  id: string
  category: string
  rule_text: string
  source_chapter: number
  violations: string[]
}

// Severity badge component
function SeverityBadge({ severity }: { severity: ContinuityIssue['severity'] }) {
  const colors = {
    low: 'bg-blue-100 text-blue-800 border-blue-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    critical: 'bg-red-100 text-red-800 border-red-200',
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded border ${colors[severity]}`}>
      {severity.toUpperCase()}
    </span>
  )
}

// Issue type badge component
function IssueTypeBadge({ type }: { type: ContinuityIssue['issue_type'] }) {
  const colors = {
    character: 'bg-purple-100 text-purple-800',
    timeline: 'bg-green-100 text-green-800',
    world: 'bg-teal-100 text-teal-800',
    location: 'bg-indigo-100 text-indigo-800',
    knowledge: 'bg-pink-100 text-pink-800',
  }

  const icons = {
    character: '👤',
    timeline: '🕐',
    world: '🌍',
    location: '📍',
    knowledge: '💡',
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${colors[type]}`}>
      <span>{icons[type]}</span>
      {type}
    </span>
  )
}

// Status badge component
function StatusBadge({ status }: { status: ContinuityIssue['status'] }) {
  const colors = {
    open: 'bg-gray-100 text-gray-800',
    resolved: 'bg-green-100 text-green-800',
    ignored: 'bg-gray-100 text-gray-500',
  }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status]}`}>
      {status}
    </span>
  )
}

// Issue card component
function IssueCard({
  issue,
  onResolve,
  onIgnore,
  onNavigate,
}: {
  issue: ContinuityIssue
  onResolve: () => void
  onIgnore: () => void
  onNavigate: (chapter: number) => void
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <IssueTypeBadge type={issue.issue_type} />
            <SeverityBadge severity={issue.severity} />
            <StatusBadge status={issue.status} />
          </div>
          <h3 className="font-medium text-gray-900 mb-1">{issue.title}</h3>
          <p className="text-sm text-gray-600 mb-3">{issue.description}</p>
          {issue.character_name && (
            <p className="text-sm text-gray-500 mb-2">
              Character: <span className="font-medium">{issue.character_name}</span>
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Chapters:</span>
            {issue.chapter_references.map((ch) => (
              <button
                key={ch}
                onClick={() => onNavigate(ch)}
                className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                Ch. {ch}
              </button>
            ))}
          </div>
        </div>
        {issue.status === 'open' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={onResolve}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
            >
              Resolve
            </button>
            <button
              onClick={onIgnore}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Ignore
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Summary card component
function SummaryCard({
  title,
  value,
  subtitle,
  color = 'blue',
}: {
  title: string
  value: number | string
  subtitle?: string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
}) {
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    red: 'border-red-200 bg-red-50',
    purple: 'border-purple-200 bg-purple-50',
  }

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium">{title}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  )
}

// Tab button component
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

export default function ContinuityDashboard() {
  const params = useParams()
  const projectId = params.id as string

  const { currentProject, chapters } = useStore()

  const [activeTab, setActiveTab] = useState<'issues' | 'characters' | 'timeline'>('issues')
  const [issues, setIssues] = useState<ContinuityIssue[]>([])
  const [characters, setCharacters] = useState<CharacterProfile[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [worldRules, setWorldRules] = useState<WorldRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRunningCheck, setIsRunningCheck] = useState(false)

  // Filter states
  const [filterType, setFilterType] = useState<string>('all')
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Mock data for demonstration
  useEffect(() => {
    setIsLoading(true)
    const timer = setTimeout(() => {
      setIssues([
        {
          id: '1',
          issue_type: 'character',
          severity: 'high',
          title: 'Eye color inconsistency',
          description: 'Sarah is described as having blue eyes in Chapter 1, but green eyes in Chapter 5.',
          chapter_references: [1, 5],
          character_name: 'Sarah',
          status: 'open',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          issue_type: 'timeline',
          severity: 'critical',
          title: 'Time paradox detected',
          description: 'Chapter 3 occurs at sunset, but Chapter 4 references events from Chapter 3 happening in the morning.',
          chapter_references: [3, 4],
          status: 'open',
          created_at: new Date().toISOString(),
        },
        {
          id: '3',
          issue_type: 'knowledge',
          severity: 'medium',
          title: 'Premature knowledge',
          description: 'John mentions the secret hideout in Chapter 2, but he only learns about it in Chapter 6.',
          chapter_references: [2, 6],
          character_name: 'John',
          status: 'open',
          created_at: new Date().toISOString(),
        },
        {
          id: '4',
          issue_type: 'location',
          severity: 'low',
          title: 'Impossible travel',
          description: 'Characters travel from the city to the mountains in less than an hour without explanation.',
          chapter_references: [4],
          status: 'resolved',
          created_at: new Date().toISOString(),
        },
        {
          id: '5',
          issue_type: 'world',
          severity: 'medium',
          title: 'Magic system violation',
          description: 'The protagonist uses fire magic despite being established as only having water powers.',
          chapter_references: [7],
          character_name: 'The Hero',
          status: 'open',
          created_at: new Date().toISOString(),
        },
      ])

      setCharacters([
        {
          id: '1',
          name: 'Sarah',
          role: 'protagonist',
          first_appearance: 1,
          chapter_appearances: [1, 2, 3, 5, 6, 7, 8],
          physical_attributes: { eyes: 'blue/green (inconsistent)', hair: 'dark brown', height: 'tall' },
          personality_traits: ['brave', 'intelligent', 'stubborn'],
          relationships: [
            { character: 'John', relationship_type: 'partner' },
            { character: 'The Mentor', relationship_type: 'student' },
          ],
          knowledge_items: ['secret location', 'ancient prophecy'],
          contradictions: ['Eye color changes between chapters'],
        },
        {
          id: '2',
          name: 'John',
          role: 'supporting',
          first_appearance: 1,
          chapter_appearances: [1, 2, 4, 6, 8],
          physical_attributes: { eyes: 'brown', hair: 'blonde', build: 'athletic' },
          personality_traits: ['loyal', 'impulsive', 'humorous'],
          relationships: [
            { character: 'Sarah', relationship_type: 'partner' },
          ],
          knowledge_items: ['combat training', 'local geography'],
          contradictions: ['Knows about hideout before discovery'],
        },
        {
          id: '3',
          name: 'The Mentor',
          role: 'supporting',
          first_appearance: 2,
          chapter_appearances: [2, 3, 5, 7],
          physical_attributes: { age: 'elderly', eyes: 'grey', distinguishing: 'long beard' },
          personality_traits: ['wise', 'mysterious', 'patient'],
          relationships: [
            { character: 'Sarah', relationship_type: 'mentor' },
          ],
          knowledge_items: ['ancient magic', 'prophecy details'],
          contradictions: [],
        },
      ])

      setTimeline([
        {
          id: '1',
          event_type: 'story_start',
          description: 'Sarah discovers her powers',
          chapter_number: 1,
          time_marker: 'morning',
          characters_involved: ['Sarah'],
          sequence_order: 1,
        },
        {
          id: '2',
          event_type: 'meeting',
          description: 'Sarah meets The Mentor',
          chapter_number: 2,
          time_marker: 'afternoon',
          characters_involved: ['Sarah', 'The Mentor'],
          sequence_order: 2,
        },
        {
          id: '3',
          event_type: 'conflict',
          description: 'First encounter with antagonist',
          chapter_number: 3,
          time_marker: 'sunset',
          characters_involved: ['Sarah', 'The Mentor'],
          sequence_order: 3,
        },
        {
          id: '4',
          event_type: 'travel',
          description: 'Journey to the mountains',
          chapter_number: 4,
          time_marker: 'morning (inconsistent)',
          characters_involved: ['Sarah', 'John'],
          sequence_order: 4,
        },
        {
          id: '5',
          event_type: 'revelation',
          description: 'Secret hideout discovered',
          chapter_number: 6,
          time_marker: 'night',
          characters_involved: ['Sarah', 'John'],
          sequence_order: 5,
        },
      ])

      setWorldRules([
        {
          id: '1',
          category: 'Magic System',
          rule_text: 'Each person can only wield one elemental power',
          source_chapter: 2,
          violations: ['Hero uses fire magic in Chapter 7'],
        },
        {
          id: '2',
          category: 'Geography',
          rule_text: 'Travel from city to mountains takes at least one day',
          source_chapter: 1,
          violations: ['One hour travel in Chapter 4'],
        },
      ])

      setIsLoading(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  const handleResolveIssue = (id: string) => {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === id ? { ...issue, status: 'resolved' as const } : issue
      )
    )
  }

  const handleIgnoreIssue = (id: string) => {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === id ? { ...issue, status: 'ignored' as const } : issue
      )
    )
  }

  const handleNavigateToChapter = (chapter: number) => {
    window.location.href = `/projects/${projectId}/chapters/${chapter}`
  }

  const runContinuityCheck = () => {
    setIsRunningCheck(true)
    setTimeout(() => {
      setIsRunningCheck(false)
    }, 2000)
  }

  // Filter issues
  const filteredIssues = issues.filter((issue) => {
    if (filterType !== 'all' && issue.issue_type !== filterType) return false
    if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false
    if (filterStatus !== 'all' && issue.status !== filterStatus) return false
    return true
  })

  // Calculate summary stats
  const openIssues = issues.filter((i) => i.status === 'open').length
  const criticalIssues = issues.filter((i) => i.severity === 'critical' && i.status === 'open').length
  const characterCount = characters.length
  const timelineEvents = timeline.length

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading continuity dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/projects/${projectId}`}
              className="text-gray-600 hover:text-gray-900"
            >
              &larr; Back to Project
            </Link>
            <h1 className="text-xl font-semibold">Continuity Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={runContinuityCheck}
              disabled={isRunningCheck}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRunningCheck ? 'Checking...' : 'Run Check'}
            </button>
            <Link
              href={`/projects/${projectId}/chapters`}
              className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              View Chapters
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <section className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              title="Open Issues"
              value={openIssues}
              subtitle={`${criticalIssues} critical`}
              color={criticalIssues > 0 ? 'red' : openIssues > 0 ? 'yellow' : 'green'}
            />
            <SummaryCard
              title="Characters"
              value={characterCount}
              subtitle="tracked"
              color="purple"
            />
            <SummaryCard
              title="Timeline Events"
              value={timelineEvents}
              subtitle="recorded"
              color="blue"
            />
            <SummaryCard
              title="World Rules"
              value={worldRules.length}
              subtitle={`${worldRules.filter((r) => r.violations.length > 0).length} with violations`}
              color="green"
            />
          </div>
        </section>

        {/* Tab Navigation */}
        <section className="mb-6">
          <div className="flex items-center gap-2">
            <TabButton
              active={activeTab === 'issues'}
              onClick={() => setActiveTab('issues')}
            >
              Issues ({issues.length})
            </TabButton>
            <TabButton
              active={activeTab === 'characters'}
              onClick={() => setActiveTab('characters')}
            >
              Characters ({characters.length})
            </TabButton>
            <TabButton
              active={activeTab === 'timeline'}
              onClick={() => setActiveTab('timeline')}
            >
              Timeline ({timeline.length})
            </TabButton>
          </div>
        </section>

        {/* Issues Tab */}
        {activeTab === 'issues' && (
          <section>
            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Type:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Types</option>
                    <option value="character">Character</option>
                    <option value="timeline">Timeline</option>
                    <option value="world">World</option>
                    <option value="location">Location</option>
                    <option value="knowledge">Knowledge</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Severity:</label>
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Severity</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Status:</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </div>
                <div className="flex-1 text-right text-sm text-gray-600">
                  Showing {filteredIssues.length} of {issues.length} issues
                </div>
              </div>
            </div>

            {/* Issues List */}
            <div className="space-y-4">
              {filteredIssues.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <p className="text-gray-500">No issues match the current filters.</p>
                </div>
              ) : (
                filteredIssues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onResolve={() => handleResolveIssue(issue.id)}
                    onIgnore={() => handleIgnoreIssue(issue.id)}
                    onNavigate={handleNavigateToChapter}
                  />
                ))
              )}
            </div>
          </section>
        )}

        {/* Characters Tab */}
        {activeTab === 'characters' && (
          <section className="space-y-4">
            {characters.map((character) => (
              <div
                key={character.id}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{character.name}</h3>
                    <span className="text-sm text-gray-500 capitalize">
                      {character.role} | First appears: Chapter {character.first_appearance}
                    </span>
                  </div>
                  {character.contradictions.length > 0 && (
                    <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                      {character.contradictions.length} contradiction(s)
                    </span>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Physical Attributes */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Physical Attributes</h4>
                    <dl className="space-y-1">
                      {Object.entries(character.physical_attributes).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <dt className="text-gray-500 capitalize">{key}</dt>
                          <dd className={value.includes('inconsistent') ? 'text-red-600' : 'text-gray-900'}>
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* Personality & Relationships */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Personality Traits</h4>
                    <div className="flex flex-wrap gap-1 mb-4">
                      {character.personality_traits.map((trait) => (
                        <span
                          key={trait}
                          className="px-2 py-0.5 text-xs bg-gray-100 rounded"
                        >
                          {trait}
                        </span>
                      ))}
                    </div>

                    <h4 className="text-sm font-medium text-gray-700 mb-2">Relationships</h4>
                    <ul className="space-y-1">
                      {character.relationships.map((rel, idx) => (
                        <li key={idx} className="text-sm text-gray-600">
                          <span className="font-medium">{rel.character}</span>{' '}
                          <span className="text-gray-400">({rel.relationship_type})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Chapter Appearances */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Appearances</h4>
                  <div className="flex flex-wrap gap-1">
                    {character.chapter_appearances.map((ch) => (
                      <button
                        key={ch}
                        onClick={() => handleNavigateToChapter(ch)}
                        className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 rounded transition-colors"
                      >
                        Ch. {ch}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Contradictions */}
                {character.contradictions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-red-700 mb-2">Contradictions</h4>
                    <ul className="space-y-1">
                      {character.contradictions.map((contradiction, idx) => (
                        <li key={idx} className="text-sm text-red-600">
                          {contradiction}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <section>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="relative">
                {timeline.map((event, idx) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-4 p-4 border-b border-gray-100 last:border-b-0"
                  >
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-medium">
                        {event.sequence_order}
                      </div>
                      {idx < timeline.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-200 mt-2" />
                      )}
                    </div>

                    {/* Event details */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{event.description}</span>
                        <span className="px-2 py-0.5 text-xs bg-gray-100 rounded capitalize">
                          {event.event_type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>
                          Chapter {event.chapter_number}
                        </span>
                        {event.time_marker && (
                          <span className={event.time_marker.includes('inconsistent') ? 'text-red-600' : ''}>
                            Time: {event.time_marker}
                          </span>
                        )}
                      </div>
                      {event.characters_involved.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {event.characters_involved.map((char) => (
                            <span
                              key={char}
                              className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded"
                            >
                              {char}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Navigate button */}
                    <button
                      onClick={() => handleNavigateToChapter(event.chapter_number)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* World Rules Section */}
            {worldRules.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">World Rules</h2>
                <div className="space-y-4">
                  {worldRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="bg-white rounded-lg border border-gray-200 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs text-gray-500 uppercase">{rule.category}</span>
                          <p className="text-gray-900">{rule.rule_text}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Established in Chapter {rule.source_chapter}
                          </p>
                        </div>
                        {rule.violations.length > 0 && (
                          <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">
                            {rule.violations.length} violation(s)
                          </span>
                        )}
                      </div>
                      {rule.violations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <h4 className="text-sm font-medium text-red-700 mb-1">Violations:</h4>
                          <ul className="space-y-1">
                            {rule.violations.map((violation, idx) => (
                              <li key={idx} className="text-sm text-red-600">
                                {violation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
