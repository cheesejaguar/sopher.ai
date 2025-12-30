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
      return <Check className="w-4 h-4 text-teal-500" aria-label="Completed" />
    case 'generating':
      return <Loader className="w-4 h-4 text-amber-500 animate-spin" aria-label="Generating" />
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-500" aria-label="Error" />
    default:
      return <Circle className="w-4 h-4 text-gray-400" aria-label="Pending" />
  }
}

function getStatusBadgeClass(status: ChapterInfo['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400'
    case 'generating':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
    case 'error':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
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
      <div className="flex flex-col items-center py-4 px-2 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full">
        <button
          onClick={() => onToggleCollapse?.(false)}
          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors mb-4"
          aria-label="Expand navigation"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        <div className="flex flex-col items-center gap-2 mb-4">
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label="Go to project home"
            >
              <Home className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          )}
          {onNavigateToOutline && (
            <button
              onClick={onNavigateToOutline}
              className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label="Go to outline"
            >
              <BookOpen className="w-5 h-5 text-gray-600 dark:text-gray-400" />
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
                  ? 'bg-teal-100 dark:bg-teal-900/30'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              }`}
              aria-label={`Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}`}
              aria-current={chapter.number === currentChapter ? 'page' : undefined}
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {chapter.number}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={handlePrevChapter}
            disabled={currentChapter <= 1}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous chapter"
          >
            <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={handleNextChapter}
            disabled={currentChapter >= chapters.length}
            className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Next chapter"
          >
            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <nav
      className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 h-full flex flex-col"
      aria-label="Chapter navigation"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          {projectTitle && (
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {projectTitle}
            </h2>
          )}
          {onToggleCollapse && (
            <button
              onClick={() => onToggleCollapse(true)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label="Collapse navigation"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>

        {/* Quick Links */}
        <div className="flex gap-2 mt-2">
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
            >
              <Home className="w-3 h-3" />
              Project
            </button>
          )}
          {onNavigateToOutline && (
            <button
              onClick={onNavigateToOutline}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
            >
              <BookOpen className="w-3 h-3" />
              Outline
            </button>
          )}
        </div>
      </div>

      {/* Progress Summary */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
          <span>Progress</span>
          <span>{completedCount}/{chapters.length} chapters</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-teal-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progressPercent}% complete`}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500 mt-1">
          <span>{progressPercent}%</span>
          <span>{formatWordCount(totalWords)} words</span>
        </div>
      </div>

      {/* Chapter List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <button
            onClick={() => toggleSection('chapters')}
            className="flex items-center justify-between w-full px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
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
                      ? 'bg-teal-100 dark:bg-teal-900/30 border-l-2 border-teal-500'
                      : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                  aria-current={chapter.number === currentChapter ? 'page' : undefined}
                >
                  <div className="flex-shrink-0">
                    {getStatusIcon(chapter.status, chapter.progress)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {chapter.number}.
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {chapter.title || `Chapter ${chapter.number}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusBadgeClass(chapter.status)}`}>
                        {chapter.status}
                      </span>
                      {chapter.wordCount !== undefined && chapter.wordCount > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-500">
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
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevChapter}
            disabled={currentChapter <= 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Previous chapter"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-500">
            {currentChapter} of {chapters.length}
          </span>
          <button
            onClick={handleNextChapter}
            disabled={currentChapter >= chapters.length}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
