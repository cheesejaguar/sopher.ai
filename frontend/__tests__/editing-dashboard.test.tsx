import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-project-id' }),
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}))

// Mock zustand store
const mockStore = {
  currentProject: {
    id: 'test-project-id',
    name: 'Test Project',
    status: 'in_progress' as const,
  },
  chapters: [
    { chapter_number: 1, title: 'Chapter 1', word_count: 3500, status: 'completed' as const },
    { chapter_number: 2, title: 'Chapter 2', word_count: 3200, status: 'completed' as const },
    { chapter_number: 3, title: 'Chapter 3', word_count: 2800, status: 'generating' as const },
  ],
}

vi.mock('@/lib/zustand', () => ({
  useStore: () => mockStore,
}))

import EditingDashboard from '@/app/projects/[id]/edit/page'

describe('EditingDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders loading state initially', () => {
      render(<EditingDashboard />)
      expect(screen.getByText('Loading editing dashboard...')).toBeInTheDocument()
    })

    it('renders header with back link', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Editing Dashboard')).toBeInTheDocument()
      })
      expect(screen.getByText('← Back to Project')).toBeInTheDocument()
    })

    it('renders quality scores section', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Quality Scores')).toBeInTheDocument()
      })
    })

    it('renders quality badges', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Overall')).toBeInTheDocument()
        expect(screen.getByText('Readability')).toBeInTheDocument()
        expect(screen.getByText('Variety')).toBeInTheDocument()
        expect(screen.getByText('Pacing')).toBeInTheDocument()
      })
    })

    it('renders prose quality card', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Prose Quality')).toBeInTheDocument()
        expect(screen.getByText('Word Count')).toBeInTheDocument()
        expect(screen.getByText('Reading Level')).toBeInTheDocument()
        expect(screen.getByText('Grade Level')).toBeInTheDocument()
      })
    })

    it('renders pacing analysis card', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Pacing Analysis')).toBeInTheDocument()
        expect(screen.getByText('Tension Curve')).toBeInTheDocument()
        expect(screen.getByText('Has Build-up')).toBeInTheDocument()
        expect(screen.getByText('Has Climax')).toBeInTheDocument()
        expect(screen.getByText('Ending Strength')).toBeInTheDocument()
      })
    })

    it('renders edit suggestions section', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Edit Suggestions')).toBeInTheDocument()
      })
    })

    it('renders chapter selector', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Chapter 1')).toBeInTheDocument()
      })
    })
  })

  describe('Quality Metrics Display', () => {
    it('displays word count', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('3,500')).toBeInTheDocument()
      })
    })

    it('displays reading level', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('high school')).toBeInTheDocument()
      })
    })

    it('displays grade level', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('8.5')).toBeInTheDocument()
      })
    })

    it('displays passive voice progress bar', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Passive Voice')).toBeInTheDocument()
        expect(screen.getByText('8.5%')).toBeInTheDocument()
      })
    })

    it('displays adverb usage progress bar', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Adverb Usage')).toBeInTheDocument()
        expect(screen.getByText('2.1%')).toBeInTheDocument()
      })
    })

    it('displays dialogue progress bar', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Dialogue')).toBeInTheDocument()
        expect(screen.getByText('35.5%')).toBeInTheDocument()
      })
    })
  })

  describe('Pacing Metrics Display', () => {
    it('displays tension curve type', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('arc')).toBeInTheDocument()
      })
    })

    it('displays build-up status', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        const yesElements = screen.getAllByText('Yes')
        expect(yesElements.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('displays ending strength', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('strong')).toBeInTheDocument()
      })
    })
  })

  describe('Edit Controls', () => {
    it('renders edit pass selector', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Edit Pass:')).toBeInTheDocument()
      })
    })

    it('renders run edit pass button', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Run Edit Pass')).toBeInTheDocument()
      })
    })

    it('shows pending and applied counts', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/pending/)).toBeInTheDocument()
        expect(screen.getByText(/applied/)).toBeInTheDocument()
      })
    })

    it('changes button text when running', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Run Edit Pass')).toBeInTheDocument()
      })

      const button = screen.getByText('Run Edit Pass')
      fireEvent.click(button)

      expect(screen.getByText('Running...')).toBeInTheDocument()
    })

    it('allows changing edit pass type', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Edit Pass:')).toBeInTheDocument()
      })

      const selects = screen.getAllByRole('combobox')
      const editPassSelect = selects.find(s =>
        s.querySelector('option[value="structural"]')
      )

      if (editPassSelect) {
        fireEvent.change(editPassSelect, { target: { value: 'structural' } })
        expect(editPassSelect).toHaveValue('structural')
      }
    })
  })

  describe('Suggestions', () => {
    it('renders suggestion cards', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('weak verb')).toBeInTheDocument()
        expect(screen.getByText('passive voice')).toBeInTheDocument()
        expect(screen.getByText('repeated word')).toBeInTheDocument()
      })
    })

    it('renders suggestion explanations', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/evocative verb/)).toBeInTheDocument()
        expect(screen.getByText(/Active voice/)).toBeInTheDocument()
        expect(screen.getByText(/Remove duplicate/)).toBeInTheDocument()
      })
    })

    it('renders apply and reject buttons for pending suggestions', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        const applyButtons = screen.getAllByText('Apply')
        const rejectButtons = screen.getAllByText('Reject')
        expect(applyButtons.length).toBeGreaterThanOrEqual(1)
        expect(rejectButtons.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('handles applying a suggestion', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Apply').length).toBeGreaterThan(0)
      })

      const applyButtons = screen.getAllByText('Apply')
      fireEvent.click(applyButtons[0])

      await waitFor(() => {
        expect(screen.getByText('applied')).toBeInTheDocument()
      })
    })

    it('handles rejecting a suggestion', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Reject').length).toBeGreaterThan(0)
      })

      const rejectButtons = screen.getAllByText('Reject')
      fireEvent.click(rejectButtons[0])

      await waitFor(() => {
        expect(screen.getByText('rejected')).toBeInTheDocument()
      })
    })

    it('shows original and suggested text', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('walked slowly')).toBeInTheDocument()
        expect(screen.getByText('ambled')).toBeInTheDocument()
      })
    })
  })

  describe('Filters', () => {
    it('renders severity filter', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('All Severity')).toBeInTheDocument()
      })
    })

    it('renders status filter', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        const options = screen.getAllByRole('option')
        expect(options.some(o => o.textContent === 'All Status')).toBe(true)
      })
    })

    it('filters by severity', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Edit Suggestions')).toBeInTheDocument()
      })

      const selects = screen.getAllByRole('combobox')
      const severitySelect = selects.find(s =>
        s.querySelector('option[value="warning"]')
      )

      if (severitySelect) {
        fireEvent.change(severitySelect, { target: { value: 'error' } })
        await waitFor(() => {
          expect(screen.getByText('repeated word')).toBeInTheDocument()
        })
      }
    })

    it('shows empty message when no suggestions match filter', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Edit Suggestions')).toBeInTheDocument()
      })

      // Apply all suggestions first
      const applyButtons = screen.getAllByText('Apply')
      applyButtons.forEach(btn => fireEvent.click(btn))

      // Then filter for pending
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox')
        const statusSelect = selects.find(s =>
          s.querySelector('option[value="pending"]')
        )
        if (statusSelect) {
          fireEvent.change(statusSelect, { target: { value: 'pending' } })
        }
      })

      await waitFor(() => {
        expect(screen.getByText('No suggestions match the current filters.')).toBeInTheDocument()
      })
    })
  })

  describe('Chapter Selection', () => {
    it('displays chapter options', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Chapter 1')).toBeInTheDocument()
      })
    })

    it('allows changing chapter', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Edit Suggestions')).toBeInTheDocument()
      })

      const selects = screen.getAllByRole('combobox')
      const chapterSelect = selects.find(s =>
        s.querySelector('option[value="2"]')
      )

      if (chapterSelect) {
        fireEvent.change(chapterSelect, { target: { value: '2' } })
        expect(chapterSelect).toHaveValue('2')
      }
    })
  })

  describe('Navigation', () => {
    it('has link to view chapters', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        expect(screen.getByText('View Chapters')).toBeInTheDocument()
      })
    })

    it('back link points to project page', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        const backLink = screen.getByText('← Back to Project')
        expect(backLink.closest('a')).toHaveAttribute('href', '/projects/test-project-id')
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        const h1 = screen.getByRole('heading', { level: 1 })
        expect(h1).toHaveTextContent('Editing Dashboard')
      })
    })

    it('buttons are keyboard accessible', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        const buttons = screen.getAllByRole('button')
        buttons.forEach(button => {
          expect(button).not.toHaveAttribute('tabindex', '-1')
        })
      })
    })

    it('select elements have options', async () => {
      render(<EditingDashboard />)
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox')
        selects.forEach(select => {
          expect(select.querySelectorAll('option').length).toBeGreaterThan(0)
        })
      })
    })
  })
})
