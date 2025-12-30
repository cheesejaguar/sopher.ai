/**
 * Tests for Outline Editor Page
 *
 * Tests cover:
 * - Page rendering and initial state
 * - Chapter card display and interaction
 * - Chapter editing functionality
 * - Chapter reordering (move up/down)
 * - Add/delete chapters
 * - Save functionality
 * - AI revision modal
 * - Error and success messages
 * - Navigation
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock next/navigation
const mockPush = vi.fn()
const mockParams = { id: 'test-project-id' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => mockParams,
}))

// Mock zustand store
const mockUser = { id: 'user-123', name: 'Test User', email: 'test@example.com' }

vi.mock('@/lib/zustand', () => ({
  useStore: vi.fn((selector) => {
    const state = {
      user: mockUser,
      setUser: vi.fn(),
      currentProject: null,
      setCurrentProject: vi.fn(),
    }
    return selector(state)
  }),
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

const sampleOutlineContent = `# My Amazing Book

## Chapter 1: The Beginning

Our story begins in a quiet village where young Sarah discovers a mysterious map.

## Chapter 2: The Journey

Sarah sets out on her adventure, meeting allies along the way.

## Chapter 3: The Challenge

The group faces their first major obstacle at the mountain pass.

## Chapter 4: The Revelation

A shocking truth about Sarah's past comes to light.

## Chapter 5: The Climax

The final confrontation with the antagonist takes place.
`

const mockOutlineResponse = {
  id: 'outline-123',
  content: sampleOutlineContent,
  meta: { chapters: 5, tokens: 500 },
  created_at: '2024-01-15T10:00:00Z',
}

describe('Outline Editor Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Page Rendering', () => {
    it('should show loading state initially', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})) // Never resolves

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      expect(screen.getByText('Loading outline...')).toBeInTheDocument()
    })

    it('should render outline when loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOutlineResponse),
      })

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('outline-title')).toBeInTheDocument()
      })

      expect(screen.getByText('My Amazing Book')).toBeInTheDocument()
      expect(screen.getByTestId('chapter-count')).toHaveTextContent('5 chapters')
    })

    it('should show no outline message when 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('no-outline-message')).toBeInTheDocument()
      })

      expect(screen.getByText('No Outline Yet')).toBeInTheDocument()
    })

    it('should display chapter cards', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOutlineResponse),
      })

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapters-list')).toBeInTheDocument()
      })

      expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      expect(screen.getByTestId('chapter-2-header')).toBeInTheDocument()
    })
  })

  describe('Chapter Interaction', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOutlineResponse),
      })
    })

    it('should expand chapter when clicked', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      })

      // Click to expand
      fireEvent.click(screen.getByTestId('chapter-1-header'))

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-content')).toBeInTheDocument()
      })
    })

    it('should collapse chapter when clicked again', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      })

      // Expand
      fireEvent.click(screen.getByTestId('chapter-1-header'))
      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-content')).toBeInTheDocument()
      })

      // Collapse
      fireEvent.click(screen.getByTestId('chapter-1-header'))
      await waitFor(() => {
        expect(screen.queryByTestId('chapter-1-content')).not.toBeInTheDocument()
      })
    })

    it('should enter edit mode when edit button is clicked', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      })

      // Expand chapter
      fireEvent.click(screen.getByTestId('chapter-1-header'))
      await waitFor(() => {
        expect(screen.getByTestId('edit-chapter-button')).toBeInTheDocument()
      })

      // Click edit
      fireEvent.click(screen.getByTestId('edit-chapter-button'))
      await waitFor(() => {
        expect(screen.getByTestId('edit-title-input')).toBeInTheDocument()
      })
    })

    it('should save chapter edits', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      })

      // Expand and edit
      fireEvent.click(screen.getByTestId('chapter-1-header'))
      await waitFor(() => {
        expect(screen.getByTestId('edit-chapter-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('edit-chapter-button'))
      await waitFor(() => {
        expect(screen.getByTestId('edit-title-input')).toBeInTheDocument()
      })

      // Edit title
      const titleInput = screen.getByTestId('edit-title-input')
      fireEvent.change(titleInput, { target: { value: 'New Title' } })

      // Save
      fireEvent.click(screen.getByTestId('save-edit-button'))

      // Check unsaved indicator appears
      await waitFor(() => {
        expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
      })
    })

    it('should cancel chapter edits', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      })

      // Expand, edit, then cancel
      fireEvent.click(screen.getByTestId('chapter-1-header'))
      await waitFor(() => {
        expect(screen.getByTestId('edit-chapter-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('edit-chapter-button'))
      await waitFor(() => {
        expect(screen.getByTestId('cancel-edit-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('cancel-edit-button'))

      // Edit mode should be closed
      await waitFor(() => {
        expect(screen.queryByTestId('edit-title-input')).not.toBeInTheDocument()
      })
    })
  })

  describe('Chapter Management', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOutlineResponse),
      })
    })

    it('should add new chapter', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('add-chapter-button')).toBeInTheDocument()
      })

      // Initial count
      expect(screen.getByTestId('chapter-count')).toHaveTextContent('5 chapters')

      // Add chapter
      fireEvent.click(screen.getByTestId('add-chapter-button'))

      await waitFor(() => {
        expect(screen.getByTestId('chapter-count')).toHaveTextContent('6 chapters')
      })
    })

    it('should delete chapter when delete is clicked', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      })

      // Expand chapter
      fireEvent.click(screen.getByTestId('chapter-1-header'))
      await waitFor(() => {
        expect(screen.getByTestId('delete-chapter-button')).toBeInTheDocument()
      })

      // Delete
      fireEvent.click(screen.getByTestId('delete-chapter-button'))

      await waitFor(() => {
        expect(screen.getByTestId('chapter-count')).toHaveTextContent('4 chapters')
      })
    })
  })

  describe('Save Functionality', () => {
    it('should save outline when save button is clicked', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockOutlineResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'new-outline-id', message: 'Outline updated successfully' }),
        })

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('chapter-1-header')).toBeInTheDocument()
      })

      // Make a change
      fireEvent.click(screen.getByTestId('add-chapter-button'))

      await waitFor(() => {
        expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
      })

      // Save
      fireEvent.click(screen.getByTestId('save-button'))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/projects/test-project-id/outline',
          expect.objectContaining({
            method: 'PUT',
          })
        )
      })
    })

    it('should show success message after save', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockOutlineResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ message: 'Success' }),
        })

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('add-chapter-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('add-chapter-button'))
      fireEvent.click(screen.getByTestId('save-button'))

      await waitFor(() => {
        expect(screen.getByTestId('success-message')).toBeInTheDocument()
      })
    })
  })

  describe('AI Revision Modal', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOutlineResponse),
      })
    })

    it('should open revision modal when AI Revise is clicked', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('ai-revise-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('ai-revise-button'))

      await waitFor(() => {
        expect(screen.getByTestId('revision-modal')).toBeInTheDocument()
      })
    })

    it('should close revision modal when close is clicked', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('ai-revise-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('ai-revise-button'))
      await waitFor(() => {
        expect(screen.getByTestId('revision-modal')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('close-modal-button'))

      await waitFor(() => {
        expect(screen.queryByTestId('revision-modal')).not.toBeInTheDocument()
      })
    })

    it('should disable submit button when instructions are too short', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('ai-revise-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('ai-revise-button'))
      await waitFor(() => {
        expect(screen.getByTestId('submit-revision-button')).toBeInTheDocument()
      })

      expect(screen.getByTestId('submit-revision-button')).toBeDisabled()
    })

    it('should enable submit button when instructions are valid', async () => {
      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('ai-revise-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('ai-revise-button'))
      await waitFor(() => {
        expect(screen.getByTestId('revision-instructions-input')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByTestId('revision-instructions-input'), {
        target: { value: 'Add more conflict in the middle chapters' },
      })

      expect(screen.getByTestId('submit-revision-button')).not.toBeDisabled()
    })
  })

  describe('Navigation', () => {
    it('should navigate back to project page when back is clicked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOutlineResponse),
      })

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('back-button')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('back-button'))

      expect(mockPush).toHaveBeenCalledWith('/projects/test-project-id')
    })
  })

  describe('Error Handling', () => {
    it('should show error message when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument()
      })
    })

    it('should dismiss error when close is clicked', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument()
      })

      // Find and click close button in error message
      const errorMessage = screen.getByTestId('error-message')
      const closeButton = within(errorMessage).getByRole('button')
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByTestId('error-message')).not.toBeInTheDocument()
      })
    })
  })

  describe('Word Count Calculation', () => {
    it('should calculate total word count from chapters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOutlineResponse),
      })

      const OutlineEditorPage = (await import('@/app/projects/[id]/outline/page')).default
      render(<OutlineEditorPage />)

      await waitFor(() => {
        expect(screen.getByTestId('word-count')).toBeInTheDocument()
      })

      // 5 chapters * 3000 words default = 15,000 words
      expect(screen.getByTestId('word-count')).toHaveTextContent('15,000 words')
    })
  })
})
