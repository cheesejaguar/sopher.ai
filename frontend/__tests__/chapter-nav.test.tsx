import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChapterNav from '../components/ChapterNav'

describe('ChapterNav', () => {
  const defaultChapters = [
    { number: 1, title: 'The Beginning', status: 'completed' as const, progress: 1, wordCount: 2500 },
    { number: 2, title: 'Rising Action', status: 'generating' as const, progress: 0.5, wordCount: 1200 },
    { number: 3, title: 'The Climax', status: 'pending' as const, progress: 0, wordCount: 0 },
    { number: 4, title: 'Resolution', status: 'error' as const, progress: 0, wordCount: 0 },
  ]

  const defaultProps = {
    chapters: defaultChapters,
    currentChapter: 1,
    onSelectChapter: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders chapter list', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByText('The Beginning')).toBeInTheDocument()
      expect(screen.getByText('Rising Action')).toBeInTheDocument()
      expect(screen.getByText('The Climax')).toBeInTheDocument()
      expect(screen.getByText('Resolution')).toBeInTheDocument()
    })

    it('renders chapter numbers', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByText('1.')).toBeInTheDocument()
      expect(screen.getByText('2.')).toBeInTheDocument()
      expect(screen.getByText('3.')).toBeInTheDocument()
      expect(screen.getByText('4.')).toBeInTheDocument()
    })

    it('renders status badges', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByText('completed')).toBeInTheDocument()
      expect(screen.getByText('generating')).toBeInTheDocument()
      expect(screen.getByText('pending')).toBeInTheDocument()
      expect(screen.getByText('error')).toBeInTheDocument()
    })

    it('renders word counts for chapters with content', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByText('2.5k words')).toBeInTheDocument()
      expect(screen.getByText('1.2k words')).toBeInTheDocument()
    })

    it('renders project title when provided', () => {
      render(<ChapterNav {...defaultProps} projectTitle="My Novel" />)

      expect(screen.getByText('My Novel')).toBeInTheDocument()
    })

    it('renders navigation aria label', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByRole('navigation', { name: 'Chapter navigation' })).toBeInTheDocument()
    })
  })

  describe('Progress Display', () => {
    it('shows progress summary', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByText('Progress')).toBeInTheDocument()
      expect(screen.getByText('1/4 chapters')).toBeInTheDocument()
    })

    it('shows progress percentage', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByText('25%')).toBeInTheDocument()
    })

    it('shows total word count', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByText('3.7k words')).toBeInTheDocument()
    })

    it('renders progress bar', () => {
      render(<ChapterNav {...defaultProps} />)

      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '25')
      expect(progressBar).toHaveAttribute('aria-valuemin', '0')
      expect(progressBar).toHaveAttribute('aria-valuemax', '100')
    })
  })

  describe('Chapter Selection', () => {
    it('highlights current chapter', () => {
      render(<ChapterNav {...defaultProps} currentChapter={2} />)

      const buttons = screen.getAllByRole('button')
      const chapter2Button = buttons.find(b => b.textContent?.includes('Rising Action'))
      expect(chapter2Button).toHaveAttribute('aria-current', 'page')
    })

    it('calls onSelectChapter when chapter clicked', () => {
      const onSelectChapter = vi.fn()
      render(<ChapterNav {...defaultProps} onSelectChapter={onSelectChapter} />)

      fireEvent.click(screen.getByText('Rising Action'))

      expect(onSelectChapter).toHaveBeenCalledWith(2)
    })

    it('calls onSelectChapter for each chapter', () => {
      const onSelectChapter = vi.fn()
      render(<ChapterNav {...defaultProps} onSelectChapter={onSelectChapter} />)

      fireEvent.click(screen.getByText('The Climax'))
      expect(onSelectChapter).toHaveBeenCalledWith(3)

      fireEvent.click(screen.getByText('Resolution'))
      expect(onSelectChapter).toHaveBeenCalledWith(4)
    })
  })

  describe('Navigation Controls', () => {
    it('renders prev/next buttons', () => {
      render(<ChapterNav {...defaultProps} currentChapter={2} />)

      expect(screen.getByLabelText('Previous chapter')).toBeInTheDocument()
      expect(screen.getByLabelText('Next chapter')).toBeInTheDocument()
    })

    it('disables prev button on first chapter', () => {
      render(<ChapterNav {...defaultProps} currentChapter={1} />)

      expect(screen.getByLabelText('Previous chapter')).toBeDisabled()
    })

    it('disables next button on last chapter', () => {
      render(<ChapterNav {...defaultProps} currentChapter={4} />)

      expect(screen.getByLabelText('Next chapter')).toBeDisabled()
    })

    it('navigates to previous chapter', () => {
      const onSelectChapter = vi.fn()
      render(<ChapterNav {...defaultProps} currentChapter={3} onSelectChapter={onSelectChapter} />)

      fireEvent.click(screen.getByLabelText('Previous chapter'))

      expect(onSelectChapter).toHaveBeenCalledWith(2)
    })

    it('navigates to next chapter', () => {
      const onSelectChapter = vi.fn()
      render(<ChapterNav {...defaultProps} currentChapter={2} onSelectChapter={onSelectChapter} />)

      fireEvent.click(screen.getByLabelText('Next chapter'))

      expect(onSelectChapter).toHaveBeenCalledWith(3)
    })

    it('shows current chapter indicator', () => {
      render(<ChapterNav {...defaultProps} currentChapter={2} />)

      expect(screen.getByText('2 of 4')).toBeInTheDocument()
    })
  })

  describe('Quick Links', () => {
    it('renders home link when onNavigateHome provided', () => {
      const onNavigateHome = vi.fn()
      render(<ChapterNav {...defaultProps} onNavigateHome={onNavigateHome} />)

      expect(screen.getByText('Project')).toBeInTheDocument()
    })

    it('renders outline link when onNavigateToOutline provided', () => {
      const onNavigateToOutline = vi.fn()
      render(<ChapterNav {...defaultProps} onNavigateToOutline={onNavigateToOutline} />)

      expect(screen.getByText('Outline')).toBeInTheDocument()
    })

    it('calls onNavigateHome when clicked', () => {
      const onNavigateHome = vi.fn()
      render(<ChapterNav {...defaultProps} onNavigateHome={onNavigateHome} />)

      fireEvent.click(screen.getByText('Project'))

      expect(onNavigateHome).toHaveBeenCalled()
    })

    it('calls onNavigateToOutline when clicked', () => {
      const onNavigateToOutline = vi.fn()
      render(<ChapterNav {...defaultProps} onNavigateToOutline={onNavigateToOutline} />)

      fireEvent.click(screen.getByText('Outline'))

      expect(onNavigateToOutline).toHaveBeenCalled()
    })
  })

  describe('Collapsed Mode', () => {
    it('renders collapsed view when isCollapsed is true', () => {
      render(<ChapterNav {...defaultProps} isCollapsed={true} />)

      // Should not show full chapter titles
      expect(screen.queryByText('The Beginning')).not.toBeInTheDocument()
      // Should show chapter numbers
      expect(screen.getByLabelText('Chapter 1: The Beginning')).toBeInTheDocument()
    })

    it('renders expand button in collapsed mode', () => {
      render(<ChapterNav {...defaultProps} isCollapsed={true} />)

      expect(screen.getByLabelText('Expand navigation')).toBeInTheDocument()
    })

    it('calls onToggleCollapse when expand clicked', () => {
      const onToggleCollapse = vi.fn()
      render(
        <ChapterNav
          {...defaultProps}
          isCollapsed={true}
          onToggleCollapse={onToggleCollapse}
        />
      )

      fireEvent.click(screen.getByLabelText('Expand navigation'))

      expect(onToggleCollapse).toHaveBeenCalledWith(false)
    })

    it('calls onToggleCollapse when collapse clicked', () => {
      const onToggleCollapse = vi.fn()
      render(
        <ChapterNav
          {...defaultProps}
          isCollapsed={false}
          onToggleCollapse={onToggleCollapse}
        />
      )

      fireEvent.click(screen.getByLabelText('Collapse navigation'))

      expect(onToggleCollapse).toHaveBeenCalledWith(true)
    })

    it('allows chapter selection in collapsed mode', () => {
      const onSelectChapter = vi.fn()
      render(
        <ChapterNav
          {...defaultProps}
          isCollapsed={true}
          onSelectChapter={onSelectChapter}
        />
      )

      fireEvent.click(screen.getByLabelText('Chapter 2: Rising Action'))

      expect(onSelectChapter).toHaveBeenCalledWith(2)
    })

    it('renders home icon button in collapsed mode', () => {
      const onNavigateHome = vi.fn()
      render(
        <ChapterNav
          {...defaultProps}
          isCollapsed={true}
          onNavigateHome={onNavigateHome}
        />
      )

      expect(screen.getByLabelText('Go to project home')).toBeInTheDocument()
    })

    it('renders outline icon button in collapsed mode', () => {
      const onNavigateToOutline = vi.fn()
      render(
        <ChapterNav
          {...defaultProps}
          isCollapsed={true}
          onNavigateToOutline={onNavigateToOutline}
        />
      )

      expect(screen.getByLabelText('Go to outline')).toBeInTheDocument()
    })
  })

  describe('Collapsible Sections', () => {
    it('can collapse chapters section', () => {
      render(<ChapterNav {...defaultProps} />)

      // Chapters should be visible initially
      expect(screen.getByText('The Beginning')).toBeInTheDocument()

      // Click to collapse
      fireEvent.click(screen.getByRole('button', { name: /Chapters/i }))

      // Chapters should be hidden
      expect(screen.queryByText('The Beginning')).not.toBeInTheDocument()
    })

    it('can expand chapters section', () => {
      render(<ChapterNav {...defaultProps} />)

      // Collapse then expand
      fireEvent.click(screen.getByRole('button', { name: /Chapters/i }))
      fireEvent.click(screen.getByRole('button', { name: /Chapters/i }))

      // Chapters should be visible again
      expect(screen.getByText('The Beginning')).toBeInTheDocument()
    })

    it('shows aria-expanded attribute on section toggle', () => {
      render(<ChapterNav {...defaultProps} />)

      const sectionButton = screen.getByRole('button', { name: /Chapters/i })
      expect(sectionButton).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(sectionButton)
      expect(sectionButton).toHaveAttribute('aria-expanded', 'false')
    })
  })

  describe('Status Icons', () => {
    it('renders check icon for completed chapters', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByLabelText('Completed')).toBeInTheDocument()
    })

    it('renders loader icon for generating chapters', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByLabelText('Generating')).toBeInTheDocument()
    })

    it('renders circle icon for pending chapters', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByLabelText('Pending')).toBeInTheDocument()
    })

    it('renders alert icon for error chapters', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByLabelText('Error')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles empty chapters array', () => {
      render(<ChapterNav {...defaultProps} chapters={[]} />)

      expect(screen.getByText('0/0 chapters')).toBeInTheDocument()
      expect(screen.getByText('0 words')).toBeInTheDocument()
    })

    it('handles chapters without titles', () => {
      const chaptersNoTitles = [
        { number: 1, status: 'pending' as const, progress: 0 },
        { number: 2, status: 'pending' as const, progress: 0 },
      ]
      render(<ChapterNav {...defaultProps} chapters={chaptersNoTitles} />)

      expect(screen.getByText('Chapter 1')).toBeInTheDocument()
      expect(screen.getByText('Chapter 2')).toBeInTheDocument()
    })

    it('handles single chapter', () => {
      const singleChapter = [
        { number: 1, title: 'Only Chapter', status: 'completed' as const, progress: 1, wordCount: 5000 },
      ]
      render(<ChapterNav {...defaultProps} chapters={singleChapter} currentChapter={1} />)

      expect(screen.getByText('1 of 1')).toBeInTheDocument()
      expect(screen.getByLabelText('Previous chapter')).toBeDisabled()
      expect(screen.getByLabelText('Next chapter')).toBeDisabled()
    })

    it('formats word counts correctly', () => {
      const chaptersWithVariedCounts = [
        { number: 1, title: 'Ch1', status: 'completed' as const, progress: 1, wordCount: 500 },
        { number: 2, title: 'Ch2', status: 'completed' as const, progress: 1, wordCount: 1000 },
        { number: 3, title: 'Ch3', status: 'completed' as const, progress: 1, wordCount: 10500 },
      ]
      render(<ChapterNav {...defaultProps} chapters={chaptersWithVariedCounts} />)

      expect(screen.getByText('500 words')).toBeInTheDocument()
      expect(screen.getByText('1.0k words')).toBeInTheDocument()
      expect(screen.getByText('10.5k words')).toBeInTheDocument()
    })

    it('calculates 100% progress when all chapters complete', () => {
      const allComplete = [
        { number: 1, title: 'Ch1', status: 'completed' as const, progress: 1, wordCount: 1000 },
        { number: 2, title: 'Ch2', status: 'completed' as const, progress: 1, wordCount: 1000 },
      ]
      render(<ChapterNav {...defaultProps} chapters={allComplete} />)

      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.getByText('2/2 chapters')).toBeInTheDocument()
    })

    it('handles chapters with zero word count', () => {
      const zeroWordCount = [
        { number: 1, title: 'Empty', status: 'pending' as const, progress: 0, wordCount: 0 },
      ]
      render(<ChapterNav {...defaultProps} chapters={zeroWordCount} />)

      // Should not show individual chapter word count badge for chapters with 0 words
      // The chapter section should only show status badge, not word count
      const chapterButtons = screen.getAllByRole('button').filter(b =>
        b.textContent?.includes('Empty')
      )
      expect(chapterButtons.length).toBeGreaterThan(0)
      // The chapter button should not have word count text
      expect(chapterButtons[0].textContent).not.toMatch(/0 words/)
    })
  })

  describe('Accessibility', () => {
    it('has accessible navigation landmark', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })

    it('has aria-current on selected chapter', () => {
      render(<ChapterNav {...defaultProps} currentChapter={2} />)

      const chapter2Button = screen.getByText('Rising Action').closest('button')
      expect(chapter2Button).toHaveAttribute('aria-current', 'page')
    })

    it('has accessible progress bar labels', () => {
      render(<ChapterNav {...defaultProps} />)

      const progressBar = screen.getByRole('progressbar')
      expect(progressBar).toHaveAttribute('aria-label', '25% complete')
    })

    it('has accessible button labels', () => {
      render(<ChapterNav {...defaultProps} />)

      expect(screen.getByLabelText('Previous chapter')).toBeInTheDocument()
      expect(screen.getByLabelText('Next chapter')).toBeInTheDocument()
    })
  })
})
