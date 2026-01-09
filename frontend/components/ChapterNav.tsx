'use client'

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, Circle, Loader, AlertCircle, FileText, BookOpen, Home } from 'lucide-react'

interface ChapterInfo {
  number: number
  title?: string
  status: 'pending' | 'generating' | 'completed' | 'error'
  progress: number
  wordCount?: number
}

interface ChapterNavProps {
  chapters: ChapterInfo[]
  currentChapter: number
  onSelectChapter: (chapterNumber: number) => void
  onNavigateHome?: () => void
  onNavigateToOutline?: () => void
  isCollapsed?: boolean
  onToggleCollapse?: (collapsed: boolean) => void
  projectTitle?: string
}

function formatWordCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return count.toString()
}

function getStatusIcon(status: ChapterInfo['status'], progress: number) {
  switch (status) {
    case 'completed':
      return <Check className="w-4 h-4 text-aurora-teal" aria-label="Completed" />
    case 'generating':
      return <Loader className="w-4 h-4 text-ember animate-spin" aria-label="Generating" />
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-400" aria-label="Error" />
    default:
      return <Circle className="w-4 h-4 text-fog" aria-label="Pending" />
  }
}

function getStatusBadgeClass(status: ChapterInfo['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-aurora-teal/20 text-aurora-teal'
    case 'generating':
      return 'bg-ember/20 text-ember'
    case 'error':
      return 'bg-red-500/20 text-red-400'
    default:
      return 'bg-slate/30 text-fog'
  }
}

export default function ChapterNav({
  chapters,
  currentChapter,
  onSelectChapter,
  onNavigateHome,
  onNavigateToOutline,
  isCollapsed = false,
  onToggleCollapse,
  projectTitle,
}: ChapterNavProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['chapters']))

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }, [])

  const handlePrevChapter = useCallback(() => {
    if (currentChapter > 1) {
      onSelectChapter(currentChapter - 1)
    }
  }, [currentChapter, onSelectChapter])

  const handleNextChapter = useCallback(() => {
    if (currentChapter < chapters.length) {
      onSelectChapter(currentChapter + 1)
    }
  }, [currentChapter, chapters.length, onSelectChapter])

  const completedCount = chapters.filter(c => c.status === 'completed').length
  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
  const progressPercent = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-4 px-2 bg-charcoal-light border-r border-graphite h-full">
        <button
          onClick={() => onToggleCollapse?.(false)}
          className="p-2 rounded-lg hover:bg-charcoal transition-colors mb-4"
          aria-label="Expand navigation"
        >
          <ChevronRight className="w-5 h-5 text-mist" />
        </button>

        <div className="flex flex-col items-center gap-2 mb-4">
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="p-2 rounded-lg hover:bg-charcoal transition-colors"
              aria-label="Go to project home"
            >
              <Home className="w-5 h-5 text-mist" />
            </button>
          )}
          {onNavigateToOutline && (
            <button
              onClick={onNavigateToOutline}
              className="p-2 rounded-lg hover:bg-charcoal transition-colors"
              aria-label="Go to outline"
            >
              <BookOpen className="w-5 h-5 text-mist" />
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 flex-1">
          {chapters.map(chapter => (
            <button
              key={chapter.number}
              onClick={() => onSelectChapter(chapter.number)}
              className={`p-2 rounded-lg transition-colors ${
                chapter.number === currentChapter
                  ? 'bg-aurora-teal/20'
                  : 'hover:bg-charcoal'
              }`}
              aria-label={`Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}`}
              aria-current={chapter.number === currentChapter ? 'page' : undefined}
            >
              <span className="text-sm font-medium text-cream">
                {chapter.number}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={handlePrevChapter}
            disabled={currentChapter <= 1}
            className="p-2 rounded-lg hover:bg-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous chapter"
          >
            <ChevronUp className="w-5 h-5 text-mist" />
          </button>
          <button
            onClick={handleNextChapter}
            disabled={currentChapter >= chapters.length}
            className="p-2 rounded-lg hover:bg-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next chapter"
          >
            <ChevronDown className="w-5 h-5 text-mist" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <nav
      className="w-64 bg-charcoal-light border-r border-graphite h-full flex flex-col"
      aria-label="Chapter navigation"
    >
      {/* Header */}
      <div className="p-4 border-b border-graphite">
        <div className="flex items-center justify-between mb-2">
          {projectTitle && (
            <h2 className="text-sm font-semibold text-cream truncate">
              {projectTitle}
            </h2>
          )}
          {onToggleCollapse && (
            <button
              onClick={() => onToggleCollapse(true)}
              className="p-1 rounded hover:bg-charcoal transition-colors"
              aria-label="Collapse navigation"
            >
              <ChevronLeft className="w-4 h-4 text-mist" />
            </button>
          )}
        </div>

        {/* Quick Links */}
        <div className="flex gap-2 mt-2">
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="flex items-center gap-1 px-2 py-1 text-xs text-mist hover:text-cream hover:bg-charcoal rounded transition-colors"
            >
              <Home className="w-3 h-3" />
              Project
            </button>
          )}
          {onNavigateToOutline && (
            <button
              onClick={onNavigateToOutline}
              className="flex items-center gap-1 px-2 py-1 text-xs text-mist hover:text-cream hover:bg-charcoal rounded transition-colors"
            >
              <BookOpen className="w-3 h-3" />
              Outline
            </button>
          )}
        </div>
      </div>

      {/* Progress Summary */}
      <div className="p-4 border-b border-graphite">
        <div className="flex justify-between text-xs text-mist mb-1">
          <span>Progress</span>
          <span>{completedCount}/{chapters.length} chapters</span>
        </div>
        <div className="w-full bg-graphite rounded-full h-2">
          <div
            className="bg-aurora-teal h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progressPercent}% complete`}
          />
        </div>
        <div className="flex justify-between text-xs text-fog mt-1">
          <span>{progressPercent}%</span>
          <span>{formatWordCount(totalWords)} words</span>
        </div>
      </div>

      {/* Chapter List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <button
            onClick={() => toggleSection('chapters')}
            className="flex items-center justify-between w-full px-2 py-1 text-sm font-medium text-cream hover:bg-charcoal rounded transition-colors"
            aria-expanded={expandedSections.has('chapters')}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Chapters
            </span>
            {expandedSections.has('chapters') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {expandedSections.has('chapters') && (
            <div className="mt-1 space-y-1">
              {chapters.map(chapter => (
                <button
                  key={chapter.number}
                  onClick={() => onSelectChapter(chapter.number)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                    chapter.number === currentChapter
                      ? 'bg-aurora-teal/10 border-l-2 border-aurora-teal'
                      : 'hover:bg-charcoal'
                  }`}
                  aria-current={chapter.number === currentChapter ? 'page' : undefined}
                >
                  <div className="flex-shrink-0">
                    {getStatusIcon(chapter.status, chapter.progress)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-cream">
                        {chapter.number}.
                      </span>
                      <span className="text-sm text-mist truncate">
                        {chapter.title || `Chapter ${chapter.number}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusBadgeClass(chapter.status)}`}>
                        {chapter.status}
                      </span>
                      {chapter.wordCount !== undefined && chapter.wordCount > 0 && (
                        <span className="text-xs text-fog">
                          {formatWordCount(chapter.wordCount)} words
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="p-4 border-t border-graphite">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevChapter}
            disabled={currentChapter <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-mist hover:bg-charcoal rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous chapter"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <span className="text-sm text-fog">
            {currentChapter} of {chapters.length}
          </span>
          <button
            onClick={handleNextChapter}
            disabled={currentChapter >= chapters.length}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-mist hover:bg-charcoal rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next chapter"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  )
}
