import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import InlineSuggestions, { Suggestion } from '@/components/InlineSuggestions'

describe('InlineSuggestions', () => {
  const mockSuggestions: Suggestion[] = [
    {
      id: '1',
      start_position: 10,
      end_position: 20,
      original_text: 'walked slowly',
      suggested_text: 'ambled',
      explanation: 'Use a more evocative verb',
      suggestion_type: 'weak_verb',
      severity: 'info',
      status: 'pending',
    },
    {
      id: '2',
      start_position: 50,
      end_position: 80,
      original_text: 'The door was opened by Sarah',
      suggested_text: 'Sarah opened the door',
      explanation: 'Use active voice',
      suggestion_type: 'passive_voice',
      severity: 'warning',
      status: 'pending',
    },
    {
      id: '3',
      start_position: 100,
      end_position: 107,
      original_text: 'the the',
      suggested_text: 'the',
      explanation: 'Remove duplicate word',
      suggestion_type: 'repeated_word',
      severity: 'error',
      status: 'pending',
    },
  ]

  const mockContent =
    'The hero walked slowly down the path. The door was opened by Sarah. She looked at the the mirror.'

  const defaultProps = {
    content: mockContent,
    suggestions: mockSuggestions,
    onApply: vi.fn(),
    onReject: vi.fn(),
    onApplyAll: vi.fn(),
    onRejectAll: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders the component', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByTestId('inline-suggestions')).toBeInTheDocument()
    })

    it('renders content with suggestions container', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByTestId('content-with-suggestions')).toBeInTheDocument()
    })

    it('renders suggestion count', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText(/suggestions/)).toBeInTheDocument()
    })

    it('renders pending count', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByText('3 pending')).toBeInTheDocument()
    })

    it('renders severity badges', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByText('1 errors')).toBeInTheDocument()
      expect(screen.getByText('1 warnings')).toBeInTheDocument()
      expect(screen.getByText('1 info')).toBeInTheDocument()
    })

    it('renders Apply All button', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByText('Apply All')).toBeInTheDocument()
    })

    it('renders Reject All button', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByText('Reject All')).toBeInTheDocument()
    })

    it('does not render stats bar when no suggestions', () => {
      render(<InlineSuggestions {...defaultProps} suggestions={[]} />)
      expect(screen.queryByText('suggestions')).not.toBeInTheDocument()
    })
  })

  describe('Highlighted Text', () => {
    it('renders highlighted spans for suggestions', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const buttons = screen.getAllByRole('button', { name: /Edit suggestion/ })
      expect(buttons.length).toBe(3)
    })

    it('applies different styles for different severities', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const contentArea = screen.getByTestId('content-with-suggestions')

      // Info severity should have blue styling
      const infoSpans = contentArea.querySelectorAll('.bg-blue-100')
      expect(infoSpans.length).toBeGreaterThanOrEqual(1)

      // Warning severity should have yellow styling
      const warningSpans = contentArea.querySelectorAll('.bg-yellow-100')
      expect(warningSpans.length).toBeGreaterThanOrEqual(1)

      // Error severity should have red styling
      const errorSpans = contentArea.querySelectorAll('.bg-red-100')
      expect(errorSpans.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Tooltip Interaction', () => {
    it('shows tooltip on hover', async () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      expect(screen.getByRole('tooltip')).toBeInTheDocument()
    })

    it('hides tooltip on mouse leave', async () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)
      expect(screen.getByRole('tooltip')).toBeInTheDocument()

      fireEvent.mouseLeave(highlightedSpan)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('shows tooltip on focus', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.focus(highlightedSpan)

      expect(screen.getByRole('tooltip')).toBeInTheDocument()
    })

    it('displays suggestion explanation in tooltip', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      expect(screen.getByText('Use a more evocative verb')).toBeInTheDocument()
    })

    it('displays original and suggested text in tooltip', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      expect(screen.getByText('Current:')).toBeInTheDocument()
      expect(screen.getByText('Suggested:')).toBeInTheDocument()
    })

    it('shows Apply and Reject buttons in tooltip', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      const tooltip = screen.getByRole('tooltip')
      expect(within(tooltip).getByText('Apply')).toBeInTheDocument()
      expect(within(tooltip).getByText('Reject')).toBeInTheDocument()
    })
  })

  describe('Apply/Reject Actions', () => {
    it('calls onApply when Apply button is clicked in tooltip', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      const tooltip = screen.getByRole('tooltip')
      const applyButton = within(tooltip).getByText('Apply')
      fireEvent.click(applyButton)

      expect(defaultProps.onApply).toHaveBeenCalledWith('1')
    })

    it('calls onReject when Reject button is clicked in tooltip', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      const tooltip = screen.getByRole('tooltip')
      const rejectButton = within(tooltip).getByText('Reject')
      fireEvent.click(rejectButton)

      expect(defaultProps.onReject).toHaveBeenCalledWith('1')
    })

    it('calls onApplyAll when Apply All button is clicked', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const applyAllButton = screen.getByText('Apply All')
      fireEvent.click(applyAllButton)

      expect(defaultProps.onApplyAll).toHaveBeenCalled()
    })

    it('calls onRejectAll when Reject All button is clicked', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const rejectAllButton = screen.getByText('Reject All')
      fireEvent.click(rejectAllButton)

      expect(defaultProps.onRejectAll).toHaveBeenCalled()
    })
  })

  describe('Read-Only Mode', () => {
    it('does not show Apply/Reject buttons in tooltip when readOnly', () => {
      render(<InlineSuggestions {...defaultProps} readOnly />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      const tooltip = screen.getByRole('tooltip')
      expect(within(tooltip).queryByText('Apply')).not.toBeInTheDocument()
      expect(within(tooltip).queryByText('Reject')).not.toBeInTheDocument()
    })

    it('does not show Apply All button when readOnly', () => {
      render(<InlineSuggestions {...defaultProps} readOnly />)
      expect(screen.queryByText('Apply All')).not.toBeInTheDocument()
    })

    it('does not show Reject All button when readOnly', () => {
      render(<InlineSuggestions {...defaultProps} readOnly />)
      expect(screen.queryByText('Reject All')).not.toBeInTheDocument()
    })
  })

  describe('Applied/Rejected Suggestions', () => {
    it('displays Applied status in tooltip for applied suggestions', () => {
      const appliedSuggestions = mockSuggestions.map((s, i) =>
        i === 0 ? { ...s, status: 'applied' as const } : s
      )
      render(<InlineSuggestions {...defaultProps} suggestions={appliedSuggestions} />)

      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]
      fireEvent.mouseEnter(highlightedSpan)

      const tooltip = screen.getByRole('tooltip')
      expect(within(tooltip).getByText('Applied')).toBeInTheDocument()
    })

    it('displays Rejected status in tooltip for rejected suggestions', () => {
      const rejectedSuggestions = mockSuggestions.map((s, i) =>
        i === 0 ? { ...s, status: 'rejected' as const } : s
      )
      render(<InlineSuggestions {...defaultProps} suggestions={rejectedSuggestions} />)

      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]
      fireEvent.mouseEnter(highlightedSpan)

      const tooltip = screen.getByRole('tooltip')
      expect(within(tooltip).getByText('Rejected')).toBeInTheDocument()
    })

    it('applies line-through style to applied suggestions', () => {
      const appliedSuggestions = mockSuggestions.map((s, i) =>
        i === 0 ? { ...s, status: 'applied' as const } : s
      )
      render(<InlineSuggestions {...defaultProps} suggestions={appliedSuggestions} />)

      const contentArea = screen.getByTestId('content-with-suggestions')
      const appliedSpans = contentArea.querySelectorAll('.line-through')
      expect(appliedSpans.length).toBeGreaterThanOrEqual(1)
    })

    it('updates stats when suggestions are applied', () => {
      const mixedSuggestions = [
        { ...mockSuggestions[0], status: 'applied' as const },
        { ...mockSuggestions[1], status: 'rejected' as const },
        mockSuggestions[2],
      ]
      render(<InlineSuggestions {...defaultProps} suggestions={mixedSuggestions} />)

      expect(screen.getByText('1 pending')).toBeInTheDocument()
      expect(screen.getByText('1 applied')).toBeInTheDocument()
      expect(screen.getByText('1 rejected')).toBeInTheDocument()
    })
  })

  describe('Content Segmentation', () => {
    it('correctly splits content around suggestions', () => {
      const simpleContent = 'Hello world goodbye'
      const simpleSuggestions: Suggestion[] = [
        {
          id: '1',
          start_position: 6,
          end_position: 11,
          original_text: 'world',
          suggested_text: 'universe',
          explanation: 'Be more expansive',
          suggestion_type: 'word_choice',
          severity: 'info',
          status: 'pending',
        },
      ]

      render(
        <InlineSuggestions
          {...defaultProps}
          content={simpleContent}
          suggestions={simpleSuggestions}
        />
      )

      const contentArea = screen.getByTestId('content-with-suggestions')
      expect(contentArea.textContent).toContain('Hello')
      expect(contentArea.textContent).toContain('world')
      expect(contentArea.textContent).toContain('goodbye')
    })

    it('renders plain text when no suggestions', () => {
      render(<InlineSuggestions {...defaultProps} suggestions={[]} />)
      const contentArea = screen.getByTestId('content-with-suggestions')
      expect(contentArea.textContent).toBe(mockContent)
    })
  })

  describe('Accessibility', () => {
    it('highlighted spans are keyboard accessible', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpans = screen.getAllByRole('button', { name: /Edit suggestion/ })

      highlightedSpans.forEach((span) => {
        expect(span).toHaveAttribute('tabindex', '0')
      })
    })

    it('tooltip has proper role', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      fireEvent.mouseEnter(highlightedSpan)

      expect(screen.getByRole('tooltip')).toBeInTheDocument()
    })

    it('buttons have aria-labels', () => {
      render(<InlineSuggestions {...defaultProps} />)
      expect(screen.getByLabelText('Apply all pending suggestions')).toBeInTheDocument()
      expect(screen.getByLabelText('Reject all pending suggestions')).toBeInTheDocument()
    })

    it('highlighted spans have aria-expanded', () => {
      render(<InlineSuggestions {...defaultProps} />)
      const highlightedSpan = screen.getAllByRole('button', { name: /Edit suggestion/ })[0]

      expect(highlightedSpan).toHaveAttribute('aria-expanded', 'false')

      fireEvent.mouseEnter(highlightedSpan)

      expect(highlightedSpan).toHaveAttribute('aria-expanded', 'true')
    })
  })

  describe('Edge Cases', () => {
    it('handles empty content', () => {
      render(<InlineSuggestions {...defaultProps} content="" suggestions={[]} />)
      expect(screen.getByTestId('content-with-suggestions')).toBeInTheDocument()
    })

    it('handles overlapping suggestions gracefully', () => {
      // This shouldn't happen in practice but component should not crash
      const overlappingSuggestions: Suggestion[] = [
        {
          id: '1',
          start_position: 0,
          end_position: 10,
          original_text: 'The hero w',
          suggested_text: 'A hero w',
          explanation: 'Test',
          suggestion_type: 'test',
          severity: 'info',
          status: 'pending',
        },
        {
          id: '2',
          start_position: 5,
          end_position: 15,
          original_text: 'ro walked',
          suggested_text: 'ro ran',
          explanation: 'Test',
          suggestion_type: 'test',
          severity: 'info',
          status: 'pending',
        },
      ]

      // Should not throw
      expect(() =>
        render(
          <InlineSuggestions
            {...defaultProps}
            suggestions={overlappingSuggestions}
          />
        )
      ).not.toThrow()
    })

    it('handles suggestions at content boundaries', () => {
      const content = 'Hello'
      const suggestions: Suggestion[] = [
        {
          id: '1',
          start_position: 0,
          end_position: 5,
          original_text: 'Hello',
          suggested_text: 'Hi',
          explanation: 'Shorter greeting',
          suggestion_type: 'word_choice',
          severity: 'info',
          status: 'pending',
        },
      ]

      render(<InlineSuggestions {...defaultProps} content={content} suggestions={suggestions} />)
      const contentArea = screen.getByTestId('content-with-suggestions')
      expect(contentArea.textContent).toBe('Hello')
    })
  })
})
