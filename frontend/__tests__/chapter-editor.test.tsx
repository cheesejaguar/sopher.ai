import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChapterEditor from '../components/ChapterEditor'

describe('ChapterEditor', () => {
  const defaultProps = {
    content: 'Initial chapter content.',
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders editor with initial content', () => {
      render(<ChapterEditor {...defaultProps} />)

      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      expect(editor).toHaveValue('Initial chapter content.')
    })

    it('renders title input', () => {
      render(<ChapterEditor {...defaultProps} title="Chapter One" />)

      const titleInput = screen.getByPlaceholderText('Chapter Title')
      expect(titleInput).toHaveValue('Chapter One')
    })

    it('displays word count', () => {
      render(<ChapterEditor {...defaultProps} content="one two three four five" />)

      expect(screen.getByText(/5.*words/)).toBeInTheDocument()
    })

    it('shows word count progress', () => {
      const content = 'word '.repeat(1250).trim()
      render(
        <ChapterEditor
          {...defaultProps}
          content={content}
          wordCountTarget={2500}
        />
      )

      // 1250 words out of 2500 = 50% progress
      expect(screen.getByText(/1,250.*words/)).toBeInTheDocument()
    })

    it('renders toolbar buttons', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Undo')).toBeInTheDocument()
      expect(screen.getByLabelText('Redo')).toBeInTheDocument()
      expect(screen.getByLabelText('Bold')).toBeInTheDocument()
      expect(screen.getByLabelText('Italic')).toBeInTheDocument()
      expect(screen.getByLabelText('Quote')).toBeInTheDocument()
      expect(screen.getByLabelText('List')).toBeInTheDocument()
    })
  })

  describe('Content Editing', () => {
    it('calls onChange when content is edited', () => {
      const onChange = vi.fn()
      render(<ChapterEditor {...defaultProps} onChange={onChange} />)

      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      fireEvent.change(editor, { target: { value: 'New content' } })

      expect(onChange).toHaveBeenCalled()
    })

    it('updates local content when typing', () => {
      render(<ChapterEditor {...defaultProps} />)

      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      fireEvent.change(editor, { target: { value: 'Updated content' } })

      expect(editor).toHaveValue('Updated content')
    })

    it('calls onTitleChange when title is edited', () => {
      const onTitleChange = vi.fn()
      render(
        <ChapterEditor {...defaultProps} title="" onTitleChange={onTitleChange} />
      )

      const titleInput = screen.getByPlaceholderText('Chapter Title')
      fireEvent.change(titleInput, { target: { value: 'New Title' } })

      expect(onTitleChange).toHaveBeenCalled()
    })
  })

  describe('Save Functionality', () => {
    it('shows Saved status initially', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

    it('shows Unsaved changes after editing', () => {
      render(<ChapterEditor {...defaultProps} />)

      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      fireEvent.change(editor, { target: { value: 'more text' } })

      expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    })

    it('calls onSave when save button clicked', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)
      render(<ChapterEditor {...defaultProps} onSave={onSave} />)

      // Edit to enable save button
      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      fireEvent.change(editor, { target: { value: 'new content' } })

      // Click save
      const saveButton = screen.getByRole('button', { name: /Save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled()
      })
    })

    it('shows Saving status during save', () => {
      const onSave = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )
      render(<ChapterEditor {...defaultProps} onSave={onSave} />)

      // Edit and save
      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      fireEvent.change(editor, { target: { value: 'new content' } })

      const saveButton = screen.getByRole('button', { name: /Save/i })
      fireEvent.click(saveButton)

      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    it('shows Save failed on error', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('Save failed'))
      render(<ChapterEditor {...defaultProps} onSave={onSave} />)

      // Edit and save
      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      fireEvent.change(editor, { target: { value: 'new content' } })

      const saveButton = screen.getByRole('button', { name: /Save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Save failed')).toBeInTheDocument()
      })
    })
  })

  describe('Undo/Redo', () => {
    it('undo button is disabled initially', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Undo')).toBeDisabled()
    })

    it('undo button is enabled after editing', () => {
      render(<ChapterEditor {...defaultProps} />)

      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      fireEvent.change(editor, { target: { value: 'Initial chapter content. more' } })

      expect(screen.getByLabelText('Undo')).not.toBeDisabled()
    })

    it('redo button is disabled when at latest state', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Redo')).toBeDisabled()
    })
  })

  describe('Formatting', () => {
    it('bold button is present', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Bold')).toBeInTheDocument()
    })

    it('italic button is present', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Italic')).toBeInTheDocument()
    })

    it('quote button is present', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Quote')).toBeInTheDocument()
    })

    it('list button is present', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('List')).toBeInTheDocument()
    })
  })

  describe('Preview', () => {
    it('shows preview toggle button', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Show Preview')).toBeInTheDocument()
    })

    it('toggles preview panel when button clicked', () => {
      render(<ChapterEditor {...defaultProps} title="Test Chapter" />)

      // Initially no preview
      expect(screen.queryByText('Test Chapter')).not.toBeInTheDocument()

      // Click to show preview
      fireEvent.click(screen.getByLabelText('Show Preview'))

      // Preview should now be visible
      expect(screen.getByLabelText('Hide Preview')).toBeInTheDocument()
    })
  })

  describe('Comments', () => {
    it('shows comments toggle button', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Show Comments')).toBeInTheDocument()
    })

    it('shows comments panel when button clicked', () => {
      render(<ChapterEditor {...defaultProps} />)

      fireEvent.click(screen.getByLabelText('Show Comments'))

      expect(screen.getByText('Comments')).toBeInTheDocument()
      expect(screen.getByText('No comments yet.')).toBeInTheDocument()
    })
  })

  describe('Read Only Mode', () => {
    it('disables editor when isReadOnly is true', () => {
      render(<ChapterEditor {...defaultProps} isReadOnly={true} />)

      const editor = screen.getByPlaceholderText('Start writing your chapter...')
      expect(editor).toBeDisabled()
    })

    it('disables title input when isReadOnly is true', () => {
      render(<ChapterEditor {...defaultProps} isReadOnly={true} />)

      const titleInput = screen.getByPlaceholderText('Chapter Title')
      expect(titleInput).toBeDisabled()
    })

    it('disables formatting buttons when isReadOnly is true', () => {
      render(<ChapterEditor {...defaultProps} isReadOnly={true} />)

      expect(screen.getByLabelText('Bold')).toBeDisabled()
      expect(screen.getByLabelText('Italic')).toBeDisabled()
    })

    it('disables save button when isReadOnly is true', () => {
      render(<ChapterEditor {...defaultProps} isReadOnly={true} onSave={vi.fn()} />)

      const saveButton = screen.getByRole('button', { name: /Save/i })
      expect(saveButton).toBeDisabled()
    })
  })

  describe('Word Count', () => {
    it('shows zero words for empty content', () => {
      render(<ChapterEditor {...defaultProps} content="" />)

      expect(screen.getByText(/0.*words/)).toBeInTheDocument()
    })

    it('counts words correctly', () => {
      render(<ChapterEditor {...defaultProps} content="one two three" />)

      expect(screen.getByText(/3.*words/)).toBeInTheDocument()
    })

    it('handles multiple spaces correctly', () => {
      render(<ChapterEditor {...defaultProps} content="one   two   three" />)

      expect(screen.getByText(/3.*words/)).toBeInTheDocument()
    })

    it('shows progress relative to target', () => {
      const content = 'word '.repeat(500).trim()
      render(
        <ChapterEditor
          {...defaultProps}
          content={content}
          wordCountTarget={1000}
        />
      )

      // 500 out of 1000 = 50%
      expect(screen.getByText(/500.*words/)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has accessible button labels', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(screen.getByLabelText('Undo')).toBeInTheDocument()
      expect(screen.getByLabelText('Redo')).toBeInTheDocument()
      expect(screen.getByLabelText('Bold')).toBeInTheDocument()
      expect(screen.getByLabelText('Italic')).toBeInTheDocument()
    })

    it('has placeholder text for inputs', () => {
      render(<ChapterEditor {...defaultProps} />)

      expect(
        screen.getByPlaceholderText('Start writing your chapter...')
      ).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Chapter Title')).toBeInTheDocument()
    })
  })
})
