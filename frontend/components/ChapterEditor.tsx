'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Save,
  Undo,
  Redo,
  Bold,
  Italic,
  Quote,
  List,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Eye,
  EyeOff,
  FileText,
  MessageSquare,
  Loader2,
  Check,
  X,
} from 'lucide-react'

export interface ChapterEditorProps {
  content: string
  onChange: (content: string) => void
  onSave?: () => Promise<void>
  title?: string
  onTitleChange?: (title: string) => void
  wordCountTarget?: number
  isReadOnly?: boolean
  showTrackChanges?: boolean
}

interface Comment {
  id: string
  text: string
  selection: { start: number; end: number }
  author: string
  timestamp: Date
  resolved: boolean
}

export default function ChapterEditor({
  content,
  onChange,
  onSave,
  title = '',
  onTitleChange,
  wordCountTarget = 2500,
  isReadOnly = false,
  showTrackChanges = false,
}: ChapterEditorProps) {
  const [localContent, setLocalContent] = useState(content)
  const [localTitle, setLocalTitle] = useState(title)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'error'>(
    'saved'
  )
  const [showPreview, setShowPreview] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [showComments, setShowComments] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const [history, setHistory] = useState<string[]>([content])
  const [historyIndex, setHistoryIndex] = useState(0)

  const editorRef = useRef<HTMLTextAreaElement>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate word count
  const wordCount = localContent.trim()
    ? localContent.trim().split(/\s+/).length
    : 0
  const wordCountProgress = Math.min(100, (wordCount / wordCountTarget) * 100)

  // Update local content when prop changes
  useEffect(() => {
    if (content !== localContent) {
      setLocalContent(content)
    }
  }, [content])

  useEffect(() => {
    if (title !== localTitle) {
      setLocalTitle(title)
    }
  }, [title])

  // Auto-save functionality
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (onSave && !isReadOnly) {
        try {
          setIsSaving(true)
          await onSave()
          setSaveStatus('saved')
        } catch {
          setSaveStatus('error')
        } finally {
          setIsSaving(false)
        }
      }
    }, 2000) // Auto-save after 2 seconds of inactivity
  }, [onSave, isReadOnly])

  // Handle content change
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value
      setLocalContent(newContent)
      onChange(newContent)
      setSaveStatus('unsaved')

      // Add to history
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), newContent])
      setHistoryIndex((prev) => prev + 1)

      scheduleAutoSave()
    },
    [onChange, historyIndex, scheduleAutoSave]
  )

  // Handle title change
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value
      setLocalTitle(newTitle)
      onTitleChange?.(newTitle)
      setSaveStatus('unsaved')
      scheduleAutoSave()
    },
    [onTitleChange, scheduleAutoSave]
  )

  // Handle manual save
  const handleSave = useCallback(async () => {
    if (!onSave || isReadOnly) return

    try {
      setIsSaving(true)
      await onSave()
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }, [onSave, isReadOnly])

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      const newContent = history[newIndex]
      setLocalContent(newContent)
      onChange(newContent)
    }
  }, [history, historyIndex, onChange])

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      const newContent = history[newIndex]
      setLocalContent(newContent)
      onChange(newContent)
    }
  }, [history, historyIndex, onChange])

  // Text formatting helpers
  const insertFormatting = useCallback(
    (prefix: string, suffix: string = prefix) => {
      const editor = editorRef.current
      if (!editor) return

      const start = editor.selectionStart
      const end = editor.selectionEnd
      const selectedText = localContent.substring(start, end)

      const newContent =
        localContent.substring(0, start) +
        prefix +
        selectedText +
        suffix +
        localContent.substring(end)

      setLocalContent(newContent)
      onChange(newContent)
      setSaveStatus('unsaved')

      // Restore cursor position
      setTimeout(() => {
        editor.focus()
        editor.setSelectionRange(
          start + prefix.length,
          end + prefix.length
        )
      }, 0)
    },
    [localContent, onChange]
  )

  // Handle text selection for comments
  const handleTextSelect = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const start = editor.selectionStart
    const end = editor.selectionEnd

    if (start !== end) {
      setSelectedText(localContent.substring(start, end))
    } else {
      setSelectedText('')
    }
  }, [localContent])

  // Add comment
  const addComment = useCallback(
    (text: string) => {
      const editor = editorRef.current
      if (!editor || !selectedText) return

      const start = editor.selectionStart
      const end = editor.selectionEnd

      const newComment: Comment = {
        id: `comment-${Date.now()}`,
        text,
        selection: { start, end },
        author: 'User',
        timestamp: new Date(),
        resolved: false,
      }

      setComments((prev) => [...prev, newComment])
      setSelectedText('')
    },
    [selectedText]
  )

  // Resolve comment
  const resolveComment = useCallback((commentId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
    )
  }, [])

  // Delete comment
  const deleteComment = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 's':
            e.preventDefault()
            handleSave()
            break
          case 'z':
            if (e.shiftKey) {
              e.preventDefault()
              handleRedo()
            } else {
              e.preventDefault()
              handleUndo()
            }
            break
          case 'b':
            e.preventDefault()
            insertFormatting('**')
            break
          case 'i':
            e.preventDefault()
            insertFormatting('*')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleUndo, handleRedo, insertFormatting])

  return (
    <div className="flex flex-col h-full bg-charcoal-light rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate/20">
        <div className="flex items-center gap-1">
          {/* Undo/Redo */}
          <button
            onClick={handleUndo}
            disabled={historyIndex === 0 || isReadOnly}
            className="p-2 text-slate hover:text-cream disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Undo (Cmd+Z)"
            aria-label="Undo"
          >
            <Undo className="h-4 w-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1 || isReadOnly}
            className="p-2 text-slate hover:text-cream disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Redo (Cmd+Shift+Z)"
            aria-label="Redo"
          >
            <Redo className="h-4 w-4" />
          </button>

          <div className="w-px h-6 bg-slate/20 mx-1" />

          {/* Formatting */}
          <button
            onClick={() => insertFormatting('**')}
            disabled={isReadOnly}
            className="p-2 text-slate hover:text-cream disabled:opacity-50 transition-colors"
            title="Bold (Cmd+B)"
            aria-label="Bold"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            onClick={() => insertFormatting('*')}
            disabled={isReadOnly}
            className="p-2 text-slate hover:text-cream disabled:opacity-50 transition-colors"
            title="Italic (Cmd+I)"
            aria-label="Italic"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            onClick={() => insertFormatting('> ', '')}
            disabled={isReadOnly}
            className="p-2 text-slate hover:text-cream disabled:opacity-50 transition-colors"
            title="Quote"
            aria-label="Quote"
          >
            <Quote className="h-4 w-4" />
          </button>
          <button
            onClick={() => insertFormatting('- ', '')}
            disabled={isReadOnly}
            className="p-2 text-slate hover:text-cream disabled:opacity-50 transition-colors"
            title="List"
            aria-label="List"
          >
            <List className="h-4 w-4" />
          </button>

          <div className="w-px h-6 bg-slate/20 mx-1" />

          {/* View toggles */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`p-2 transition-colors ${
              showPreview ? 'text-teal' : 'text-slate hover:text-cream'
            }`}
            title={showPreview ? 'Hide Preview' : 'Show Preview'}
            aria-label={showPreview ? 'Hide Preview' : 'Show Preview'}
          >
            {showPreview ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className={`p-2 transition-colors ${
              showComments ? 'text-teal' : 'text-slate hover:text-cream'
            }`}
            title={showComments ? 'Hide Comments' : 'Show Comments'}
            aria-label={showComments ? 'Hide Comments' : 'Show Comments'}
          >
            <MessageSquare className="h-4 w-4" />
            {comments.filter((c) => !c.resolved).length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-teal text-charcoal text-xs rounded-full flex items-center justify-center">
                {comments.filter((c) => !c.resolved).length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Word count */}
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-slate" />
            <span className="text-slate">
              {wordCount.toLocaleString()} / {wordCountTarget.toLocaleString()}{' '}
              words
            </span>
            <div className="w-20 h-2 bg-slate/20 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  wordCountProgress >= 100 ? 'bg-gold' : 'bg-teal'
                }`}
                style={{ width: `${wordCountProgress}%` }}
              />
            </div>
          </div>

          {/* Save status */}
          <div className="flex items-center gap-2">
            {isSaving && (
              <Loader2 className="h-4 w-4 animate-spin text-teal" />
            )}
            {!isSaving && saveStatus === 'saved' && (
              <Check className="h-4 w-4 text-gold" />
            )}
            {!isSaving && saveStatus === 'error' && (
              <X className="h-4 w-4 text-red-400" />
            )}
            <span
              className={`text-sm ${
                saveStatus === 'saved'
                  ? 'text-slate'
                  : saveStatus === 'error'
                  ? 'text-red-400'
                  : 'text-gold'
              }`}
            >
              {isSaving
                ? 'Saving...'
                : saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'error'
                ? 'Save failed'
                : 'Unsaved changes'}
            </span>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={isSaving || isReadOnly || saveStatus === 'saved'}
            className="flex items-center gap-2 px-3 py-1.5 bg-teal text-charcoal rounded-lg hover:bg-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="h-4 w-4" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className={`flex-1 flex flex-col ${showPreview ? 'w-1/2' : 'w-full'}`}>
          {/* Title input */}
          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            placeholder="Chapter Title"
            disabled={isReadOnly}
            className="px-4 py-3 bg-transparent border-b border-slate/20 text-xl font-semibold text-cream placeholder-slate/50 focus:outline-none focus:border-teal disabled:cursor-not-allowed"
          />

          {/* Content editor */}
          <textarea
            ref={editorRef}
            value={localContent}
            onChange={handleContentChange}
            onSelect={handleTextSelect}
            placeholder="Start writing your chapter..."
            disabled={isReadOnly}
            className="flex-1 px-4 py-4 bg-transparent text-cream placeholder-slate/50 resize-none focus:outline-none font-mono text-sm leading-relaxed disabled:cursor-not-allowed"
          />
        </div>

        {/* Preview panel */}
        {showPreview && (
          <div className="w-1/2 border-l border-slate/20 overflow-auto">
            <div className="p-4">
              <h2 className="text-xl font-semibold text-cream mb-4">
                {localTitle || 'Untitled Chapter'}
              </h2>
              <div className="prose prose-invert prose-sm max-w-none">
                {/* Simple markdown-like rendering */}
                {localContent.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="text-cream/90 mb-4 leading-relaxed">
                    {paragraph
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .split(/(<\/?(?:strong|em)>)/g)
                      .map((part, j) => {
                        if (part === '<strong>' || part === '</strong>') return null
                        if (part === '<em>' || part === '</em>') return null
                        return <span key={j}>{part}</span>
                      })}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Comments panel */}
        {showComments && (
          <div className="w-64 border-l border-slate/20 overflow-auto">
            <div className="p-4">
              <h3 className="font-semibold text-cream mb-4">Comments</h3>

              {/* Add comment form */}
              {selectedText && (
                <div className="mb-4 p-3 bg-charcoal rounded-lg">
                  <p className="text-sm text-slate mb-2">
                    Selected: &quot;{selectedText.substring(0, 50)}
                    {selectedText.length > 50 ? '...' : ''}&quot;
                  </p>
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    className="w-full px-2 py-1 bg-slate/20 text-cream rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value) {
                        addComment(e.currentTarget.value)
                        e.currentTarget.value = ''
                      }
                    }}
                  />
                </div>
              )}

              {/* Comment list */}
              {comments.filter((c) => !c.resolved).length === 0 ? (
                <p className="text-sm text-slate">No comments yet.</p>
              ) : (
                <div className="space-y-3">
                  {comments
                    .filter((c) => !c.resolved)
                    .map((comment) => (
                      <div
                        key={comment.id}
                        className="p-3 bg-charcoal rounded-lg"
                      >
                        <p className="text-sm text-cream mb-2">{comment.text}</p>
                        <p className="text-xs text-slate mb-2">
                          {comment.author} •{' '}
                          {comment.timestamp.toLocaleDateString()}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => resolveComment(comment.id)}
                            className="text-xs text-teal hover:text-teal/80"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => deleteComment(comment.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
