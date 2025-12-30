'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/zustand'

// Types for editing data
interface QualityMetrics {
  flesch_reading_ease: number
  flesch_kincaid_grade: number
  average_grade_level: number
  reading_level: string
}

interface SentenceVariety {
  total_sentences: number
  average_length: number
  variety_score: number
  simple_sentences: number
  compound_sentences: number
  complex_sentences: number
}

interface VoiceAnalysis {
  passive_percentage: number
  passive_sentences: number
  total_sentences: number
}

interface AdverbAnalysis {
  adverb_percentage: number
  adverb_count: number
  ly_adverbs: number
  sentence_starting_adverbs: number
}

interface DialogueRatio {
  dialogue_percentage: number
  dialogue_words: number
  narrative_words: number
}

interface ProseQuality {
  word_count: number
  overall_score: number
  readability: QualityMetrics
  sentence_variety: SentenceVariety
  voice_analysis: VoiceAnalysis
  adverb_analysis: AdverbAnalysis
  dialogue_ratio: DialogueRatio
}

interface EditSuggestion {
  id: string
  chapter_number: number
  pass_type: string
  suggestion_type: string
  severity: 'info' | 'warning' | 'error'
  original_text: string
  suggested_text: string
  explanation: string
  confidence: number
  status: 'pending' | 'applied' | 'rejected'
}

interface PacingData {
  overall_pacing_score: number
  tension_curve: {
    curve_type: string
    has_build: boolean
    has_climax: boolean
    average_tension: number
  }
  action_balance: {
    dialogue_percentage: number
    action_percentage: number
    balance_score: number
  }
  ending_analysis: {
    ending_strength: string
    hook_score: number
  }
}

// Quality score badge component
function QualityBadge({ score, label }: { score: number; label: string }) {
  const getColor = () => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-200'
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-red-100 text-red-800 border-red-200'
  }

  return (
    <div className={`px-3 py-2 rounded-lg border ${getColor()}`}>
      <div className="text-2xl font-bold">{Math.round(score)}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </div>
  )
}

// Progress bar component
function ProgressBar({ value, max = 100, label, color = 'blue' }: {
  value: number
  max?: number
  label: string
  color?: 'blue' | 'green' | 'yellow' | 'red'
}) {
  const percentage = (value / max) * 100
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  )
}

// Suggestion card component
function SuggestionCard({
  suggestion,
  onApply,
  onReject,
}: {
  suggestion: EditSuggestion
  onApply: () => void
  onReject: () => void
}) {
  const severityColors = {
    info: 'border-blue-200 bg-blue-50',
    warning: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50',
  }

  const severityIcons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
  }

  return (
    <div className={`p-4 rounded-lg border ${severityColors[suggestion.severity]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span>{severityIcons[suggestion.severity]}</span>
            <span className="font-medium capitalize">{suggestion.suggestion_type.replace(/_/g, ' ')}</span>
            <span className="text-xs text-gray-500 uppercase">{suggestion.pass_type}</span>
          </div>
          <p className="text-sm text-gray-700 mb-3">{suggestion.explanation}</p>
          {suggestion.original_text && (
            <div className="text-sm space-y-1">
              <div className="flex gap-2">
                <span className="text-red-600 line-through">{suggestion.original_text}</span>
                <span className="text-gray-400">→</span>
                <span className="text-green-600">{suggestion.suggested_text}</span>
              </div>
            </div>
          )}
        </div>
        {suggestion.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={onApply}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              Apply
            </button>
            <button
              onClick={onReject}
              className="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Reject
            </button>
          </div>
        )}
        {suggestion.status !== 'pending' && (
          <span className={`px-2 py-1 text-xs rounded ${
            suggestion.status === 'applied' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {suggestion.status}
          </span>
        )}
      </div>
    </div>
  )
}

export default function EditingDashboard() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const { currentProject, chapters } = useStore()

  const [selectedChapter, setSelectedChapter] = useState<number>(1)
  const [proseQuality, setProseQuality] = useState<ProseQuality | null>(null)
  const [pacing, setPacing] = useState<PacingData | null>(null)
  const [suggestions, setSuggestions] = useState<EditSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editPassType, setEditPassType] = useState<string>('line')
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Mock data for demonstration
  useEffect(() => {
    setIsLoading(true)
    // Simulate loading
    const timer = setTimeout(() => {
      setProseQuality({
        word_count: 3500,
        overall_score: 78,
        readability: {
          flesch_reading_ease: 65.5,
          flesch_kincaid_grade: 8.2,
          average_grade_level: 8.5,
          reading_level: 'high_school',
        },
        sentence_variety: {
          total_sentences: 145,
          average_length: 18.5,
          variety_score: 0.65,
          simple_sentences: 45,
          compound_sentences: 50,
          complex_sentences: 50,
        },
        voice_analysis: {
          passive_percentage: 8.5,
          passive_sentences: 12,
          total_sentences: 145,
        },
        adverb_analysis: {
          adverb_percentage: 2.1,
          adverb_count: 74,
          ly_adverbs: 35,
          sentence_starting_adverbs: 5,
        },
        dialogue_ratio: {
          dialogue_percentage: 35.5,
          dialogue_words: 1242,
          narrative_words: 2258,
        },
      })

      setPacing({
        overall_pacing_score: 82,
        tension_curve: {
          curve_type: 'arc',
          has_build: true,
          has_climax: true,
          average_tension: 3.2,
        },
        action_balance: {
          dialogue_percentage: 35.5,
          action_percentage: 15.2,
          balance_score: 0.78,
        },
        ending_analysis: {
          ending_strength: 'strong',
          hook_score: 0.85,
        },
      })

      setSuggestions([
        {
          id: '1',
          chapter_number: selectedChapter,
          pass_type: 'line',
          suggestion_type: 'weak_verb',
          severity: 'info',
          original_text: 'walked slowly',
          suggested_text: 'ambled',
          explanation: 'Consider using a more evocative verb instead of adverb modification.',
          confidence: 0.85,
          status: 'pending',
        },
        {
          id: '2',
          chapter_number: selectedChapter,
          pass_type: 'copy',
          suggestion_type: 'passive_voice',
          severity: 'warning',
          original_text: 'The door was opened by Sarah',
          suggested_text: 'Sarah opened the door',
          explanation: 'Active voice creates more immediate, engaging prose.',
          confidence: 0.92,
          status: 'pending',
        },
        {
          id: '3',
          chapter_number: selectedChapter,
          pass_type: 'proofread',
          suggestion_type: 'repeated_word',
          severity: 'error',
          original_text: 'the the',
          suggested_text: 'the',
          explanation: 'Remove duplicate word.',
          confidence: 0.99,
          status: 'pending',
        },
      ])

      setIsLoading(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [selectedChapter])

  const handleApplySuggestion = (id: string) => {
    setSuggestions(prev =>
      prev.map(s => s.id === id ? { ...s, status: 'applied' as const } : s)
    )
  }

  const handleRejectSuggestion = (id: string) => {
    setSuggestions(prev =>
      prev.map(s => s.id === id ? { ...s, status: 'rejected' as const } : s)
    )
  }

  const runEditPass = () => {
    setIsEditing(true)
    // Simulate editing pass
    setTimeout(() => {
      setIsEditing(false)
    }, 2000)
  }

  const filteredSuggestions = suggestions.filter(s => {
    if (filterSeverity !== 'all' && s.severity !== filterSeverity) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  const pendingCount = suggestions.filter(s => s.status === 'pending').length
  const appliedCount = suggestions.filter(s => s.status === 'applied').length

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading editing dashboard...</p>
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
              ← Back to Project
            </Link>
            <h1 className="text-xl font-semibold">Editing Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              {(chapters.length > 0 ? chapters : [{ chapter_number: 1 }, { chapter_number: 2 }, { chapter_number: 3 }]).map((ch) => (
                <option key={ch.chapter_number} value={ch.chapter_number}>
                  Chapter {ch.chapter_number}
                </option>
              ))}
            </select>
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
        {/* Quality Scores Overview */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Quality Scores</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <QualityBadge
              score={proseQuality?.overall_score || 0}
              label="Overall"
            />
            <QualityBadge
              score={proseQuality?.readability.flesch_reading_ease || 0}
              label="Readability"
            />
            <QualityBadge
              score={(proseQuality?.sentence_variety.variety_score || 0) * 100}
              label="Variety"
            />
            <QualityBadge
              score={pacing?.overall_pacing_score || 0}
              label="Pacing"
            />
          </div>
        </section>

        {/* Detailed Metrics */}
        <section className="mb-8 grid md:grid-cols-2 gap-6">
          {/* Prose Quality Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Prose Quality</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Word Count</span>
                <span className="font-medium">{proseQuality?.word_count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Reading Level</span>
                <span className="font-medium capitalize">
                  {proseQuality?.readability.reading_level.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Grade Level</span>
                <span className="font-medium">
                  {proseQuality?.readability.average_grade_level.toFixed(1)}
                </span>
              </div>
              <hr className="my-2" />
              <ProgressBar
                value={proseQuality?.voice_analysis.passive_percentage || 0}
                label="Passive Voice"
                color={proseQuality && proseQuality.voice_analysis.passive_percentage > 15 ? 'red' : 'green'}
              />
              <ProgressBar
                value={proseQuality?.adverb_analysis.adverb_percentage || 0}
                label="Adverb Usage"
                color={proseQuality && proseQuality.adverb_analysis.adverb_percentage > 3 ? 'yellow' : 'green'}
              />
              <ProgressBar
                value={proseQuality?.dialogue_ratio.dialogue_percentage || 0}
                label="Dialogue"
                color="blue"
              />
            </div>
          </div>

          {/* Pacing Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold mb-4">Pacing Analysis</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span>Tension Curve</span>
                <span className="font-medium capitalize">{pacing?.tension_curve.curve_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Has Build-up</span>
                <span className={`font-medium ${pacing?.tension_curve.has_build ? 'text-green-600' : 'text-red-600'}`}>
                  {pacing?.tension_curve.has_build ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Has Climax</span>
                <span className={`font-medium ${pacing?.tension_curve.has_climax ? 'text-green-600' : 'text-red-600'}`}>
                  {pacing?.tension_curve.has_climax ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Ending Strength</span>
                <span className="font-medium capitalize">{pacing?.ending_analysis.ending_strength}</span>
              </div>
              <hr className="my-2" />
              <ProgressBar
                value={(pacing?.action_balance.balance_score || 0) * 100}
                label="Action/Dialogue Balance"
                color="blue"
              />
              <ProgressBar
                value={(pacing?.ending_analysis.hook_score || 0) * 100}
                label="Hook Score"
                color={pacing && pacing.ending_analysis.hook_score > 0.6 ? 'green' : 'yellow'}
              />
            </div>
          </div>
        </section>

        {/* Edit Controls */}
        <section className="mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Edit Pass:</label>
                <select
                  value={editPassType}
                  onChange={(e) => setEditPassType(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="structural">Structural</option>
                  <option value="line">Line Editing</option>
                  <option value="copy">Copy Editing</option>
                  <option value="proofread">Proofreading</option>
                </select>
              </div>
              <button
                onClick={runEditPass}
                disabled={isEditing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isEditing ? 'Running...' : 'Run Edit Pass'}
              </button>
              <div className="flex-1" />
              <div className="text-sm text-gray-600">
                <span className="font-medium">{pendingCount}</span> pending
                {' • '}
                <span className="font-medium">{appliedCount}</span> applied
              </div>
            </div>
          </div>
        </section>

        {/* Suggestions List */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Edit Suggestions</h2>
            <div className="flex items-center gap-3">
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="all">All Severity</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="applied">Applied</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredSuggestions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No suggestions match the current filters.
              </div>
            ) : (
              filteredSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApply={() => handleApplySuggestion(suggestion.id)}
                  onReject={() => handleRejectSuggestion(suggestion.id)}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
