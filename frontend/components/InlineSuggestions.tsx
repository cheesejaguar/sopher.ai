'use client'

import { useState, useMemo, useCallback } from 'react'

// Types
export interface Suggestion {
  id: string
  start_position: number
  end_position: number
  original_text: string
  suggested_text: string
  explanation: string
  suggestion_type: string
  severity: 'info' | 'warning' | 'error'
  status: 'pending' | 'applied' | 'rejected'
}

interface InlineSuggestionsProps {
  content: string
  suggestions: Suggestion[]
  onApply: (id: string) => void
  onReject: (id: string) => void
  onApplyAll: () => void
  onRejectAll: () => void
  readOnly?: boolean
}

interface TextSegment {
  type: 'text' | 'suggestion'
  content: string
  suggestion?: Suggestion
}

// Tooltip component for suggestion details
function SuggestionTooltip({
  suggestion,
  onApply,
  onReject,
  readOnly,
  position,
}: {
  suggestion: Suggestion
  onApply: () => void
  onReject: () => void
  readOnly?: boolean
  position: { top: number; left: number }
}) {
  const severityColors = {
    info: 'border-blue-300 bg-blue-50',
    warning: 'border-yellow-300 bg-yellow-50',
    error: 'border-red-300 bg-red-50',
  }

  return (
    <div
      className={`absolute z-50 w-80 p-3 rounded-lg border shadow-lg ${severityColors[suggestion.severity]}`}
      style={{ top: position.top + 24, left: position.left }}
      role="tooltip"
      aria-label={`Suggestion: ${suggestion.suggestion_type}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium uppercase text-gray-600">
          {suggestion.suggestion_type.replace(/_/g, ' ')}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            suggestion.severity === 'error'
              ? 'bg-red-200 text-red-700'
              : suggestion.severity === 'warning'
              ? 'bg-yellow-200 text-yellow-700'
              : 'bg-blue-200 text-blue-700'
          }`}
        >
          {suggestion.severity}
        </span>
      </div>

      <p className="text-sm text-gray-700 mb-3">{suggestion.explanation}</p>

      <div className="text-sm mb-3 space-y-1">
        <div className="flex items-start gap-2">
          <span className="text-gray-500 flex-shrink-0">Current:</span>
          <span className="text-red-600 line-through">{suggestion.original_text}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-gray-500 flex-shrink-0">Suggested:</span>
          <span className="text-green-600">{suggestion.suggested_text}</span>
        </div>
      </div>

      {!readOnly && suggestion.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={onApply}
            className="flex-1 px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            aria-label="Apply suggestion"
          >
            Apply
          </button>
          <button
            onClick={onReject}
            className="flex-1 px-3 py-1.5 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
            aria-label="Reject suggestion"
          >
            Reject
          </button>
        </div>
      )}

      {suggestion.status !== 'pending' && (
        <div
          className={`text-center text-sm font-medium ${
            suggestion.status === 'applied' ? 'text-green-600' : 'text-gray-500'
          }`}
        >
          {suggestion.status === 'applied' ? 'Applied' : 'Rejected'}
        </div>
      )}
    </div>
  )
}

// Highlighted text span component
function HighlightedSpan({
  suggestion,
  onApply,
  onReject,
  readOnly,
}: {
  suggestion: Suggestion
  onApply: () => void
  onReject: () => void
  readOnly?: boolean
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })

  const handleShow = (e: React.MouseEvent | React.FocusEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      top: rect.top - rect.height,
      left: Math.min(rect.left, window.innerWidth - 340),
    })
    setShowTooltip(true)
  }

  const handleHide = () => {
    setShowTooltip(false)
  }

  const severityStyles = {
    info: 'bg-blue-100 border-b-2 border-blue-400',
    warning: 'bg-yellow-100 border-b-2 border-yellow-400',
    error: 'bg-red-100 border-b-2 border-red-400',
  }

  const statusStyles = {
    pending: '',
    applied: 'opacity-50 line-through',
    rejected: 'opacity-30',
  }

  return (
    <span
      className={`relative cursor-pointer inline ${severityStyles[suggestion.severity]} ${statusStyles[suggestion.status]}`}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocus={handleShow}
      onBlur={handleHide}
      tabIndex={0}
      role="button"
      aria-label={`Edit suggestion: ${suggestion.suggestion_type}`}
      aria-expanded={showTooltip}
    >
      {suggestion.original_text}
      {showTooltip && (
        <SuggestionTooltip
          suggestion={suggestion}
          onApply={onApply}
          onReject={onReject}
          readOnly={readOnly}
          position={tooltipPosition}
        />
      )}
    </span>
  )
}

// Stats bar component
function SuggestionStats({
  suggestions,
  onApplyAll,
  onRejectAll,
  readOnly,
}: {
  suggestions: Suggestion[]
  onApplyAll: () => void
  onRejectAll: () => void
  readOnly?: boolean
}) {
  const stats = useMemo(() => {
    const pending = suggestions.filter((s) => s.status === 'pending').length
    const applied = suggestions.filter((s) => s.status === 'applied').length
    const rejected = suggestions.filter((s) => s.status === 'rejected').length

    const byType = suggestions.reduce((acc, s) => {
      acc[s.suggestion_type] = (acc[s.suggestion_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const bySeverity = {
      info: suggestions.filter((s) => s.severity === 'info').length,
      warning: suggestions.filter((s) => s.severity === 'warning').length,
      error: suggestions.filter((s) => s.severity === 'error').length,
    }

    return { pending, applied, rejected, byType, bySeverity }
  }, [suggestions])

  if (suggestions.length === 0) {
    return null
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div className="text-sm">
            <span className="font-medium">{suggestions.length}</span>
            <span className="text-gray-500"> suggestions</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <span className="text-gray-600">{stats.pending} pending</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-gray-600">{stats.applied} applied</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-gray-600">{stats.rejected} rejected</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            {stats.bySeverity.error > 0 && (
              <span className="px-2 py-1 rounded bg-red-100 text-red-700">
                {stats.bySeverity.error} errors
              </span>
            )}
            {stats.bySeverity.warning > 0 && (
              <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">
                {stats.bySeverity.warning} warnings
              </span>
            )}
            {stats.bySeverity.info > 0 && (
              <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">
                {stats.bySeverity.info} info
              </span>
            )}
          </div>

          {!readOnly && stats.pending > 0 && (
            <div className="flex gap-2">
              <button
                onClick={onApplyAll}
                className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                aria-label="Apply all pending suggestions"
              >
                Apply All
              </button>
              <button
                onClick={onRejectAll}
                className="px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                aria-label="Reject all pending suggestions"
              >
                Reject All
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Main component
export default function InlineSuggestions({
  content,
  suggestions,
  onApply,
  onReject,
  onApplyAll,
  onRejectAll,
  readOnly = false,
}: InlineSuggestionsProps) {
  // Sort suggestions by position (descending) for safe replacement
  const sortedSuggestions = useMemo(
    () => [...suggestions].sort((a, b) => a.start_position - b.start_position),
    [suggestions]
  )

  // Split content into segments (text and suggestions)
  const segments = useMemo(() => {
    if (sortedSuggestions.length === 0) {
      return [{ type: 'text' as const, content }]
    }

    const result: TextSegment[] = []
    let lastEnd = 0

    for (const suggestion of sortedSuggestions) {
      // Add text before this suggestion
      if (suggestion.start_position > lastEnd) {
        result.push({
          type: 'text',
          content: content.slice(lastEnd, suggestion.start_position),
        })
      }

      // Add the suggestion
      result.push({
        type: 'suggestion',
        content: content.slice(suggestion.start_position, suggestion.end_position),
        suggestion,
      })

      lastEnd = suggestion.end_position
    }

    // Add remaining text
    if (lastEnd < content.length) {
      result.push({
        type: 'text',
        content: content.slice(lastEnd),
      })
    }

    return result
  }, [content, sortedSuggestions])

  const handleApply = useCallback(
    (id: string) => {
      onApply(id)
    },
    [onApply]
  )

  const handleReject = useCallback(
    (id: string) => {
      onReject(id)
    },
    [onReject]
  )

  return (
    <div className="inline-suggestions" data-testid="inline-suggestions">
      <SuggestionStats
        suggestions={suggestions}
        onApplyAll={onApplyAll}
        onRejectAll={onRejectAll}
        readOnly={readOnly}
      />

      <div
        className="prose max-w-none p-4 bg-white border border-gray-200 rounded-lg leading-relaxed"
        data-testid="content-with-suggestions"
      >
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            return <span key={index}>{segment.content}</span>
          }

          if (segment.type === 'suggestion' && segment.suggestion) {
            return (
              <HighlightedSpan
                key={segment.suggestion.id}
                suggestion={segment.suggestion}
                onApply={() => handleApply(segment.suggestion!.id)}
                onReject={() => handleReject(segment.suggestion!.id)}
                readOnly={readOnly}
              />
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
