'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore } from '@/lib/zustand'
import type { AppState } from '@/lib/zustand'
import {
  BookOpen,
  ChevronLeft,
  Save,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  GripVertical,
  Plus,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Wand2,
  X,
} from 'lucide-react'

interface ChapterOutline {
  number: number
  title: string
  summary: string
  key_events: string[]
  characters_involved: string[]
  emotional_arc: string
  pov_character?: string
  setting: string
  estimated_word_count: number
  notes?: string
}

interface Outline {
  id: string
  content: string
  meta: {
    chapters?: number
    tokens?: number
  }
  created_at: string
}

interface ParsedOutline {
  title?: string
  logline?: string
  synopsis?: string
  chapters: ChapterOutline[]
  raw: string
}

const EMOTIONAL_ARCS = [
  'exposition',
  'rising_action',
  'tension_building',
  'climax',
  'falling_action',
  'resolution',
  'denouement',
  'transition',
]

function parseOutlineContent(content: string): ParsedOutline {
  // Simple markdown parser for outline content
  const lines = content.split('\n')
  const chapters: ChapterOutline[] = []
  let currentChapter: Partial<ChapterOutline> | null = null
  let title = ''
  let logline = ''
  let synopsis = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Extract title (first h1)
    if (line.startsWith('# ') && !title) {
      title = line.replace('# ', '')
      continue
    }

    // Look for chapter headers
    const chapterMatch = line.match(/^##\s*Chapter\s*(\d+)[:\s]*(.*)$/i)
    if (chapterMatch) {
      if (currentChapter && currentChapter.number) {
        chapters.push(currentChapter as ChapterOutline)
      }
      currentChapter = {
        number: parseInt(chapterMatch[1]),
        title: chapterMatch[2] || `Chapter ${chapterMatch[1]}`,
        summary: '',
        key_events: [],
        characters_involved: [],
        emotional_arc: 'rising_action',
        setting: '',
        estimated_word_count: 3000,
      }
      continue
    }

    // Add content to current chapter summary
    if (currentChapter && line && !line.startsWith('#')) {
      currentChapter.summary = (currentChapter.summary || '') + line + ' '
    }
  }

  // Add last chapter
  if (currentChapter && currentChapter.number) {
    chapters.push(currentChapter as ChapterOutline)
  }

  return {
    title,
    logline,
    synopsis,
    chapters,
    raw: content,
  }
}

function ChapterCard({
  chapter,
  index,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  chapter: ChapterOutline
  index: number
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (chapter: ChapterOutline) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedChapter, setEditedChapter] = useState(chapter)

  const handleSave = () => {
    onUpdate(editedChapter)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedChapter(chapter)
    setIsEditing(false)
  }

  return (
    <div className="border border-charcoal/40 rounded-lg bg-charcoal/20 overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-charcoal/30 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
        aria-expanded={isExpanded}
        data-testid={`chapter-${chapter.number}-header`}
      >
        <div className="flex flex-col gap-1 text-slate/60">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMoveUp()
            }}
            disabled={isFirst}
            className="p-0.5 hover:text-teal disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move chapter up"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <GripVertical className="h-4 w-4" />
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMoveDown()
            }}
            disabled={isLast}
            className="p-0.5 hover:text-teal disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move chapter down"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-slate/60">
              {String(chapter.number).padStart(2, '0')}
            </span>
            <h3 className="font-semibold text-ivory">{chapter.title}</h3>
          </div>
          <p className="text-sm text-slate/70 line-clamp-1 mt-1">
            {chapter.summary.substring(0, 100)}...
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate/50 bg-charcoal/50 px-2 py-1 rounded">
            {chapter.emotional_arc.replace('_', ' ')}
          </span>
          <span className="text-xs text-slate/50">
            ~{chapter.estimated_word_count.toLocaleString()} words
          </span>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-slate/50" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate/50" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-charcoal/40 p-4 space-y-4" data-testid={`chapter-${chapter.number}-content`}>
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ivory mb-1">Title</label>
                <input
                  type="text"
                  value={editedChapter.title}
                  onChange={(e) => setEditedChapter({ ...editedChapter, title: e.target.value })}
                  className="w-full bg-charcoal/50 border border-charcoal/60 rounded-lg px-3 py-2 text-ivory"
                  data-testid="edit-title-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ivory mb-1">Summary</label>
                <textarea
                  value={editedChapter.summary}
                  onChange={(e) => setEditedChapter({ ...editedChapter, summary: e.target.value })}
                  rows={4}
                  className="w-full bg-charcoal/50 border border-charcoal/60 rounded-lg px-3 py-2 text-ivory"
                  data-testid="edit-summary-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ivory mb-1">Setting</label>
                  <input
                    type="text"
                    value={editedChapter.setting}
                    onChange={(e) => setEditedChapter({ ...editedChapter, setting: e.target.value })}
                    className="w-full bg-charcoal/50 border border-charcoal/60 rounded-lg px-3 py-2 text-ivory"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ivory mb-1">POV Character</label>
                  <input
                    type="text"
                    value={editedChapter.pov_character || ''}
                    onChange={(e) => setEditedChapter({ ...editedChapter, pov_character: e.target.value })}
                    className="w-full bg-charcoal/50 border border-charcoal/60 rounded-lg px-3 py-2 text-ivory"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ivory mb-1">Emotional Arc</label>
                  <select
                    value={editedChapter.emotional_arc}
                    onChange={(e) => setEditedChapter({ ...editedChapter, emotional_arc: e.target.value })}
                    className="w-full bg-charcoal/50 border border-charcoal/60 rounded-lg px-3 py-2 text-ivory"
                  >
                    {EMOTIONAL_ARCS.map((arc) => (
                      <option key={arc} value={arc}>
                        {arc.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ivory mb-1">Word Count</label>
                  <input
                    type="number"
                    value={editedChapter.estimated_word_count}
                    onChange={(e) => setEditedChapter({ ...editedChapter, estimated_word_count: parseInt(e.target.value) || 3000 })}
                    min={500}
                    max={15000}
                    className="w-full bg-charcoal/50 border border-charcoal/60 rounded-lg px-3 py-2 text-ivory"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ivory mb-1">Notes</label>
                <textarea
                  value={editedChapter.notes || ''}
                  onChange={(e) => setEditedChapter({ ...editedChapter, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-charcoal/50 border border-charcoal/60 rounded-lg px-3 py-2 text-ivory"
                  placeholder="Additional notes for this chapter..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 text-slate hover:text-ivory transition-colors"
                  data-testid="cancel-edit-button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-teal text-ebony rounded-lg hover:bg-teal/90 transition-colors flex items-center gap-2"
                  data-testid="save-edit-button"
                >
                  <Save className="h-4 w-4" />
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="prose prose-invert max-w-none">
                <p className="text-slate/80">{chapter.summary}</p>
              </div>

              {chapter.key_events.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-ivory mb-2">Key Events</h4>
                  <ul className="list-disc list-inside text-sm text-slate/70 space-y-1">
                    {chapter.key_events.map((event, i) => (
                      <li key={i}>{event}</li>
                    ))}
                  </ul>
                </div>
              )}

              {chapter.characters_involved.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-ivory mb-2">Characters</h4>
                  <div className="flex flex-wrap gap-2">
                    {chapter.characters_involved.map((char, i) => (
                      <span key={i} className="text-xs bg-charcoal/50 text-slate/80 px-2 py-1 rounded">
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate/50">Setting:</span>{' '}
                  <span className="text-slate/80">{chapter.setting || 'Not specified'}</span>
                </div>
                <div>
                  <span className="text-slate/50">POV:</span>{' '}
                  <span className="text-slate/80">{chapter.pov_character || 'Not specified'}</span>
                </div>
              </div>

              {chapter.notes && (
                <div className="bg-charcoal/30 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-ivory mb-1">Notes</h4>
                  <p className="text-sm text-slate/70">{chapter.notes}</p>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-charcoal/40">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 text-sm text-teal hover:text-teal/80 transition-colors"
                  data-testid="edit-chapter-button"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit Chapter
                </button>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                  data-testid="delete-chapter-button"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function OutlineEditorPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [outline, setOutline] = useState<ParsedOutline | null>(null)
  const [rawOutline, setRawOutline] = useState<Outline | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set())
  const [hasChanges, setHasChanges] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [revisionInstructions, setRevisionInstructions] = useState('')
  const [isRevising, setIsRevising] = useState(false)

  const user = useStore((state: AppState) => state.user)

  const fetchOutline = useCallback(async () => {
    if (!projectId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/outline`, {
        credentials: 'include',
      })

      if (response.status === 404) {
        setError('No outline found. Generate one first from the project page.')
        return
      }

      if (!response.ok) {
        throw new Error('Failed to fetch outline')
      }

      const data = await response.json()
      setRawOutline(data)
      setOutline(parseOutlineContent(data.content || ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outline')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchOutline()
  }, [fetchOutline])

  const handleSaveOutline = async () => {
    if (!outline || !projectId) return

    setIsSaving(true)
    setError(null)

    try {
      // Convert chapters back to markdown
      let content = outline.raw
      if (outline.title) {
        content = `# ${outline.title}\n\n`
      }
      for (const chapter of outline.chapters) {
        content += `## Chapter ${chapter.number}: ${chapter.title}\n\n`
        content += `${chapter.summary}\n\n`
        if (chapter.setting) {
          content += `**Setting:** ${chapter.setting}\n\n`
        }
        if (chapter.notes) {
          content += `**Notes:** ${chapter.notes}\n\n`
        }
      }

      const response = await fetch(`/api/v1/projects/${projectId}/outline`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })

      if (!response.ok) {
        throw new Error('Failed to save outline')
      }

      setHasChanges(false)
      setSuccessMessage('Outline saved successfully!')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save outline')
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateChapter = (index: number, updatedChapter: ChapterOutline) => {
    if (!outline) return

    const newChapters = [...outline.chapters]
    newChapters[index] = updatedChapter
    setOutline({ ...outline, chapters: newChapters })
    setHasChanges(true)
  }

  const handleDeleteChapter = (index: number) => {
    if (!outline) return

    const newChapters = outline.chapters.filter((_, i) => i !== index)
    // Renumber chapters
    const renumberedChapters = newChapters.map((ch, i) => ({
      ...ch,
      number: i + 1,
    }))
    setOutline({ ...outline, chapters: renumberedChapters })
    setHasChanges(true)
  }

  const handleMoveChapter = (fromIndex: number, direction: 'up' | 'down') => {
    if (!outline) return

    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= outline.chapters.length) return

    const newChapters = [...outline.chapters]
    const temp = newChapters[fromIndex]
    newChapters[fromIndex] = newChapters[toIndex]
    newChapters[toIndex] = temp

    // Renumber chapters
    const renumberedChapters = newChapters.map((ch, i) => ({
      ...ch,
      number: i + 1,
    }))
    setOutline({ ...outline, chapters: renumberedChapters })
    setHasChanges(true)
  }

  const handleAddChapter = () => {
    if (!outline) return

    const newChapter: ChapterOutline = {
      number: outline.chapters.length + 1,
      title: 'New Chapter',
      summary: 'Enter chapter summary...',
      key_events: [],
      characters_involved: [],
      emotional_arc: 'rising_action',
      setting: '',
      estimated_word_count: 3000,
    }

    setOutline({ ...outline, chapters: [...outline.chapters, newChapter] })
    setExpandedChapters(new Set([...expandedChapters, newChapter.number]))
    setHasChanges(true)
  }

  const handleRevise = async () => {
    if (!revisionInstructions || revisionInstructions.length < 10) {
      setError('Please provide more detailed revision instructions (at least 10 characters)')
      return
    }

    setIsRevising(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/outline/revise/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          revision_instructions: revisionInstructions,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start revision')
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let revisedContent = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data.startsWith('{')) {
                const parsed = JSON.parse(data)
                if (parsed.outline_id) {
                  // Complete - refresh the outline
                  await fetchOutline()
                  setShowRevisionModal(false)
                  setRevisionInstructions('')
                  setSuccessMessage('Outline revised successfully!')
                  setTimeout(() => setSuccessMessage(null), 3000)
                }
              } else {
                revisedContent += data
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revise outline')
    } finally {
      setIsRevising(false)
    }
  }

  const toggleChapter = (chapterNumber: number) => {
    const newExpanded = new Set(expandedChapters)
    if (newExpanded.has(chapterNumber)) {
      newExpanded.delete(chapterNumber)
    } else {
      newExpanded.add(chapterNumber)
    }
    setExpandedChapters(newExpanded)
  }

  const totalWordCount = useMemo(() => {
    if (!outline) return 0
    return outline.chapters.reduce((sum, ch) => sum + ch.estimated_word_count, 0)
  }, [outline])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ebony flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading outline...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ebony text-ivory">
      {/* Header */}
      <header className="border-b border-charcoal/40 bg-ebony/95 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/projects/${projectId}`)}
                className="flex items-center gap-2 text-slate hover:text-ivory transition-colors"
                data-testid="back-button"
              >
                <ChevronLeft className="h-5 w-5" />
                Back to Project
              </button>
            </div>

            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-sm text-gold" data-testid="unsaved-indicator">
                  Unsaved changes
                </span>
              )}
              <button
                onClick={() => setShowRevisionModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-charcoal/60 text-ivory rounded-lg hover:bg-charcoal/30 transition-colors"
                data-testid="ai-revise-button"
              >
                <Wand2 className="h-4 w-4" />
                AI Revise
              </button>
              <button
                onClick={handleSaveOutline}
                disabled={isSaving || !hasChanges}
                className="flex items-center gap-2 px-4 py-2 bg-teal text-ebony rounded-lg hover:bg-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="save-button"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Outline
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3" data-testid="error-message">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-teal/10 border border-teal/30 rounded-lg flex items-center gap-3" data-testid="success-message">
            <CheckCircle className="h-5 w-5 text-teal flex-shrink-0" />
            <p className="text-teal">{successMessage}</p>
          </div>
        )}

        {outline ? (
          <>
            {/* Outline Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-ivory mb-2" data-testid="outline-title">
                {outline.title || 'Book Outline'}
              </h1>
              <div className="flex items-center gap-6 text-sm text-slate/60">
                <span data-testid="chapter-count">{outline.chapters.length} chapters</span>
                <span data-testid="word-count">~{totalWordCount.toLocaleString()} words</span>
                {rawOutline && (
                  <span>Last updated: {new Date(rawOutline.created_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            {/* Chapters */}
            <div className="space-y-4" data-testid="chapters-list">
              {outline.chapters.map((chapter, index) => (
                <ChapterCard
                  key={chapter.number}
                  chapter={chapter}
                  index={index}
                  isExpanded={expandedChapters.has(chapter.number)}
                  onToggle={() => toggleChapter(chapter.number)}
                  onUpdate={(updated) => handleUpdateChapter(index, updated)}
                  onDelete={() => handleDeleteChapter(index)}
                  onMoveUp={() => handleMoveChapter(index, 'up')}
                  onMoveDown={() => handleMoveChapter(index, 'down')}
                  isFirst={index === 0}
                  isLast={index === outline.chapters.length - 1}
                />
              ))}

              {/* Add Chapter Button */}
              <button
                onClick={handleAddChapter}
                className="w-full p-4 border-2 border-dashed border-charcoal/40 rounded-lg text-slate/60 hover:text-teal hover:border-teal/40 transition-colors flex items-center justify-center gap-2"
                data-testid="add-chapter-button"
              >
                <Plus className="h-5 w-5" />
                Add Chapter
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-12" data-testid="no-outline-message">
            <BookOpen className="h-16 w-16 text-charcoal/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-ivory mb-2">No Outline Yet</h2>
            <p className="text-slate/60 mb-6">
              Generate an outline from the project page to get started.
            </p>
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-teal text-ebony rounded-lg hover:bg-teal/90 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Go to Project
            </button>
          </div>
        )}
      </main>

      {/* AI Revision Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-ebony/80 flex items-center justify-center z-50" data-testid="revision-modal">
          <div className="bg-charcoal rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-ivory flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-teal" />
                AI Outline Revision
              </h2>
              <button
                onClick={() => setShowRevisionModal(false)}
                className="text-slate hover:text-ivory transition-colors"
                data-testid="close-modal-button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-slate/70 mb-4">
              Describe the changes you want to make to your outline. Be specific about what you want to add, remove, or modify.
            </p>

            <textarea
              value={revisionInstructions}
              onChange={(e) => setRevisionInstructions(e.target.value)}
              placeholder="E.g., Add more conflict in the middle chapters, develop the antagonist's motivation, create a stronger cliffhanger at chapter 5..."
              rows={5}
              className="w-full bg-ebony border border-charcoal/60 rounded-lg px-4 py-3 text-ivory placeholder:text-slate/40 focus:outline-none focus:ring-2 focus:ring-teal/50"
              data-testid="revision-instructions-input"
            />

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRevisionModal(false)}
                className="px-4 py-2 text-slate hover:text-ivory transition-colors"
                disabled={isRevising}
              >
                Cancel
              </button>
              <button
                onClick={handleRevise}
                disabled={isRevising || revisionInstructions.length < 10}
                className="flex items-center gap-2 px-6 py-2 bg-teal text-ebony rounded-lg hover:bg-teal/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="submit-revision-button"
              >
                {isRevising ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Revising...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Revise Outline
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
