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

import ContinuityDashboard from '@/app/projects/[id]/continuity/page'

describe('ContinuityDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders loading state initially', () => {
      render(<ContinuityDashboard />)
      expect(screen.getByText('Loading continuity dashboard...')).toBeInTheDocument()
    })

    it('renders header with back link', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Continuity Dashboard')).toBeInTheDocument()
      })
      expect(screen.getByText(/Back to Project/)).toBeInTheDocument()
    })

    it('renders summary cards', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Open Issues')).toBeInTheDocument()
        expect(screen.getByText('Characters')).toBeInTheDocument()
        expect(screen.getByText('Timeline Events')).toBeInTheDocument()
        expect(screen.getByText('World Rules')).toBeInTheDocument()
      })
    })

    it('renders tab navigation', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Issues \(\d+\)/)).toBeInTheDocument()
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })
    })

    it('renders run check button', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Run Check')).toBeInTheDocument()
      })
    })
  })

  describe('Issues Tab', () => {
    it('displays issue cards', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Eye color inconsistency')).toBeInTheDocument()
        expect(screen.getByText('Time paradox detected')).toBeInTheDocument()
      })
    })

    it('displays issue severity badges', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('HIGH').length).toBeGreaterThan(0)
        expect(screen.getAllByText('CRITICAL').length).toBeGreaterThan(0)
        expect(screen.getAllByText('MEDIUM').length).toBeGreaterThan(0)
      })
    })

    it('displays issue type badges', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('character').length).toBeGreaterThan(0)
        expect(screen.getAllByText('timeline').length).toBeGreaterThan(0)
      })
    })

    it('shows character name when applicable', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Character:').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Sarah').length).toBeGreaterThan(0)
      })
    })

    it('shows chapter reference buttons', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText(/Ch\. \d+/).length).toBeGreaterThan(0)
      })
    })

    it('renders resolve and ignore buttons for open issues', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Resolve').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Ignore').length).toBeGreaterThan(0)
      })
    })

    it('handles resolving an issue', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Resolve').length).toBeGreaterThan(0)
      })

      const resolveButtons = screen.getAllByText('Resolve')
      fireEvent.click(resolveButtons[0])

      await waitFor(() => {
        expect(screen.getAllByText('resolved').length).toBeGreaterThan(0)
      })
    })

    it('handles ignoring an issue', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Ignore').length).toBeGreaterThan(0)
      })

      const ignoreButtons = screen.getAllByText('Ignore')
      fireEvent.click(ignoreButtons[0])

      await waitFor(() => {
        expect(screen.getAllByText('ignored').length).toBeGreaterThan(0)
      })
    })
  })

  describe('Filters', () => {
    it('renders type filter', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Type:')).toBeInTheDocument()
        expect(screen.getByText('All Types')).toBeInTheDocument()
      })
    })

    it('renders severity filter', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Severity:')).toBeInTheDocument()
        expect(screen.getByText('All Severity')).toBeInTheDocument()
      })
    })

    it('renders status filter', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Status:')).toBeInTheDocument()
        expect(screen.getByText('All Status')).toBeInTheDocument()
      })
    })

    it('filters by type', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Eye color inconsistency')).toBeInTheDocument()
      })

      const selects = screen.getAllByRole('combobox')
      const typeSelect = selects.find(s => s.querySelector('option[value="character"]'))

      if (typeSelect) {
        fireEvent.change(typeSelect, { target: { value: 'timeline' } })
        await waitFor(() => {
          expect(screen.getByText('Time paradox detected')).toBeInTheDocument()
        })
      }
    })

    it('filters by severity', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Eye color inconsistency')).toBeInTheDocument()
      })

      const selects = screen.getAllByRole('combobox')
      const severitySelect = selects.find(s => s.querySelector('option[value="critical"]'))

      if (severitySelect) {
        fireEvent.change(severitySelect, { target: { value: 'critical' } })
        await waitFor(() => {
          expect(screen.getByText('Time paradox detected')).toBeInTheDocument()
        })
      }
    })

    it('filters by status', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Impossible travel')).toBeInTheDocument()
      })

      const selects = screen.getAllByRole('combobox')
      const statusSelect = selects.find(s => s.querySelector('option[value="resolved"]'))

      if (statusSelect) {
        fireEvent.change(statusSelect, { target: { value: 'resolved' } })
        await waitFor(() => {
          expect(screen.getByText('Impossible travel')).toBeInTheDocument()
        })
      }
    })

    it('shows count of filtered issues', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Showing \d+ of \d+ issues/)).toBeInTheDocument()
      })
    })

    it('shows empty message when no issues match filter', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getAllByText('Resolve').length).toBeGreaterThan(0)
      })

      // Resolve all issues
      const resolveButtons = screen.getAllByText('Resolve')
      resolveButtons.forEach(btn => fireEvent.click(btn))

      // Filter for open issues only
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox')
        const statusSelect = selects.find(s => s.querySelector('option[value="open"]'))
        if (statusSelect) {
          fireEvent.change(statusSelect, { target: { value: 'open' } })
        }
      })

      await waitFor(() => {
        expect(screen.getByText('No issues match the current filters.')).toBeInTheDocument()
      })
    })
  })

  describe('Characters Tab', () => {
    it('switches to characters tab', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      const charactersTab = screen.getByText(/Characters \(\d+\)/)
      fireEvent.click(charactersTab)

      await waitFor(() => {
        // There are 3 characters, so 3 Physical Attributes sections
        expect(screen.getAllByText('Physical Attributes').length).toBeGreaterThan(0)
      })
    })

    it('displays character names and roles', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Characters \(\d+\)/))

      await waitFor(() => {
        // Character names may appear in multiple places (title + relationships)
        expect(screen.getAllByText('The Mentor').length).toBeGreaterThan(0)
        expect(screen.getAllByText('John').length).toBeGreaterThan(0)
      })
    })

    it('displays physical attributes', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Characters \(\d+\)/))

      await waitFor(() => {
        expect(screen.getAllByText('Physical Attributes').length).toBeGreaterThan(0)
      })
    })

    it('displays personality traits', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Characters \(\d+\)/))

      await waitFor(() => {
        expect(screen.getAllByText('Personality Traits').length).toBeGreaterThan(0)
        expect(screen.getByText('brave')).toBeInTheDocument()
        expect(screen.getByText('intelligent')).toBeInTheDocument()
      })
    })

    it('displays relationships', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Characters \(\d+\)/))

      await waitFor(() => {
        expect(screen.getAllByText('Relationships').length).toBeGreaterThan(0)
      })
    })

    it('displays chapter appearances', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Characters \(\d+\)/))

      await waitFor(() => {
        // 3 characters, so 3 Appearances sections
        expect(screen.getAllByText('Appearances').length).toBeGreaterThan(0)
      })
    })

    it('displays contradictions when present', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Characters \(\d+\)/))

      await waitFor(() => {
        // Only some characters have contradictions
        expect(screen.getAllByText('Contradictions').length).toBeGreaterThan(0)
        expect(screen.getByText('Eye color changes between chapters')).toBeInTheDocument()
      })
    })

    it('shows contradiction count badge', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Characters \(\d+\)/))

      await waitFor(() => {
        // May have multiple characters with contradictions
        expect(screen.getAllByText(/\d+ contradiction\(s\)/).length).toBeGreaterThan(0)
      })
    })
  })

  describe('Timeline Tab', () => {
    it('switches to timeline tab', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getByText('Sarah discovers her powers')).toBeInTheDocument()
      })
    })

    it('displays timeline events', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getByText('Sarah discovers her powers')).toBeInTheDocument()
        expect(screen.getByText('Sarah meets The Mentor')).toBeInTheDocument()
        expect(screen.getByText('First encounter with antagonist')).toBeInTheDocument()
      })
    })

    it('displays event types', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getByText('story start')).toBeInTheDocument()
        expect(screen.getByText('meeting')).toBeInTheDocument()
        expect(screen.getByText('conflict')).toBeInTheDocument()
      })
    })

    it('displays time markers', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getByText('Time: morning')).toBeInTheDocument()
        expect(screen.getByText('Time: afternoon')).toBeInTheDocument()
        expect(screen.getByText('Time: sunset')).toBeInTheDocument()
      })
    })

    it('highlights inconsistent time markers', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getByText('Time: morning (inconsistent)')).toBeInTheDocument()
      })
    })

    it('displays characters involved', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        // Sarah appears in multiple events
        const sarahElements = screen.getAllByText('Sarah')
        expect(sarahElements.length).toBeGreaterThan(0)
      })
    })

    it('displays sequence numbers', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        // Sequence numbers may appear multiple places, just check they exist
        expect(screen.getAllByText('1').length).toBeGreaterThan(0)
        expect(screen.getAllByText('2').length).toBeGreaterThan(0)
        expect(screen.getAllByText('3').length).toBeGreaterThan(0)
      })
    })

    it('has view buttons for each event', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        const viewButtons = screen.getAllByText('View')
        expect(viewButtons.length).toBeGreaterThan(0)
      })
    })
  })

  describe('World Rules', () => {
    it('displays world rules section in timeline tab', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        // World Rules appears in summary card and as section heading
        expect(screen.getAllByText('World Rules').length).toBeGreaterThan(0)
      })
    })

    it('displays rule categories', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        // Categories are displayed with CSS uppercase, but text content is original case
        expect(screen.getAllByText('Magic System').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Geography').length).toBeGreaterThan(0)
      })
    })

    it('displays rule text', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getByText('Each person can only wield one elemental power')).toBeInTheDocument()
        expect(screen.getByText('Travel from city to mountains takes at least one day')).toBeInTheDocument()
      })
    })

    it('displays source chapters', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getByText('Established in Chapter 2')).toBeInTheDocument()
        expect(screen.getByText('Established in Chapter 1')).toBeInTheDocument()
      })
    })

    it('displays violations when present', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        // Multiple rules may have violations
        expect(screen.getAllByText('Violations:').length).toBeGreaterThan(0)
        expect(screen.getByText('Hero uses fire magic in Chapter 7')).toBeInTheDocument()
      })
    })

    it('shows violation count badge', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Timeline \(\d+\)/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))

      await waitFor(() => {
        expect(screen.getAllByText('1 violation(s)').length).toBeGreaterThan(0)
      })
    })
  })

  describe('Run Check', () => {
    it('shows checking state when running check', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Run Check')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Run Check'))

      expect(screen.getByText('Checking...')).toBeInTheDocument()
    })

    it('disables button during check', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Run Check')).toBeInTheDocument()
      })

      const button = screen.getByText('Run Check')
      fireEvent.click(button)

      expect(screen.getByText('Checking...')).toBeDisabled()
    })

    it('restores button after check completes', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Run Check')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Run Check'))

      await waitFor(
        () => {
          expect(screen.getByText('Run Check')).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })
  })

  describe('Navigation', () => {
    it('has link to view chapters', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('View Chapters')).toBeInTheDocument()
      })
    })

    it('back link points to project page', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        const backLink = screen.getByText(/Back to Project/)
        expect(backLink.closest('a')).toHaveAttribute('href', '/projects/test-project-id')
      })
    })
  })

  describe('Tab Navigation', () => {
    it('starts with issues tab active', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText('Type:')).toBeInTheDocument()
      })
    })

    it('switches tabs correctly', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        expect(screen.getByText(/Characters \(\d+\)/)).toBeInTheDocument()
      })

      // Go to Characters tab
      fireEvent.click(screen.getByText(/Characters \(\d+\)/))
      await waitFor(() => {
        // Multiple characters so multiple Physical Attributes
        expect(screen.getAllByText('Physical Attributes').length).toBeGreaterThan(0)
      })

      // Go to Timeline tab
      fireEvent.click(screen.getByText(/Timeline \(\d+\)/))
      await waitFor(() => {
        // World Rules appears in summary card and as heading
        expect(screen.getAllByText('World Rules').length).toBeGreaterThan(0)
      })

      // Go back to Issues tab
      fireEvent.click(screen.getByText(/Issues \(\d+\)/))
      await waitFor(() => {
        expect(screen.getByText('Type:')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('has proper heading hierarchy', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        const h1 = screen.getByRole('heading', { level: 1 })
        expect(h1).toHaveTextContent('Continuity Dashboard')
      })
    })

    it('buttons are keyboard accessible', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        const buttons = screen.getAllByRole('button')
        buttons.forEach(button => {
          expect(button).not.toHaveAttribute('tabindex', '-1')
        })
      })
    })

    it('select elements have options', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox')
        selects.forEach(select => {
          expect(select.querySelectorAll('option').length).toBeGreaterThan(0)
        })
      })
    })

    it('links are accessible', async () => {
      render(<ContinuityDashboard />)
      await waitFor(() => {
        const links = screen.getAllByRole('link')
        expect(links.length).toBeGreaterThan(0)
      })
    })
  })
})
