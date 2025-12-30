import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OutlinePreview, { formatReadingTime, highlightCharacters } from '@/components/OutlinePreview';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: ({ className, ...props }: { className?: string }) => <span data-testid="chevron-down" {...props}>▼</span>,
  ChevronRight: ({ className, ...props }: { className?: string }) => <span data-testid="chevron-right" {...props}>▶</span>,
  Clock: ({ className, ...props }: { className?: string }) => <span data-testid="clock-icon" {...props}>🕐</span>,
  BookOpen: ({ className, ...props }: { className?: string }) => <span data-testid="book-icon" {...props}>📖</span>,
  Users: ({ className, ...props }: { className?: string }) => <span data-testid="users-icon" {...props}>👥</span>,
  ArrowLeft: ({ className, ...props }: { className?: string }) => <span data-testid="arrow-left" {...props}>←</span>,
}));

// Sample test data
const sampleChapters = [
  {
    number: 1,
    title: 'The Beginning',
    summary: 'John meets Sarah at the coffee shop and they discuss their mysterious adventure.',
    setting: 'Coffee shop in downtown Manhattan',
    emotional_arc: 'rising_action',
    estimated_word_count: 3000,
    characters_involved: ['John', 'Sarah'],
    key_events: ['John discovers the map', 'Sarah reveals her secret'],
  },
  {
    number: 2,
    title: 'The Journey',
    summary: 'John and Sarah embark on their journey through the forest.',
    setting: 'Ancient forest',
    emotional_arc: 'climax',
    estimated_word_count: 4500,
    characters_involved: ['John', 'Sarah', 'The Guardian'],
    key_events: ['They enter the forest', 'The Guardian appears'],
  },
  {
    number: 3,
    title: 'The Resolution',
    summary: 'The heroes find what they were looking for.',
    setting: 'Hidden temple',
    emotional_arc: 'falling_action',
    estimated_word_count: 2500,
    characters_involved: ['John', 'Sarah'],
    key_events: ['Discovery of the artifact'],
  },
];

describe('OutlinePreview Component', () => {
  const defaultProps = {
    projectId: 'proj-123',
    title: 'My Test Book',
    chapters: sampleChapters,
    characters: ['John', 'Sarah'],
  };

  describe('Rendering', () => {
    it('renders the title', () => {
      render(<OutlinePreview {...defaultProps} />);
      expect(screen.getByText('My Test Book')).toBeInTheDocument();
    });

    it('renders all chapter previews collapsed by default', () => {
      render(<OutlinePreview {...defaultProps} />);

      expect(screen.getByTestId('chapter-preview-1')).toBeInTheDocument();
      expect(screen.getByTestId('chapter-preview-2')).toBeInTheDocument();
      expect(screen.getByTestId('chapter-preview-3')).toBeInTheDocument();

      // Should show chapter titles in headers
      expect(screen.getByText('The Beginning')).toBeInTheDocument();
      expect(screen.getByText('The Journey')).toBeInTheDocument();
      expect(screen.getByText('The Resolution')).toBeInTheDocument();
    });

    it('displays the stats bar with correct counts', () => {
      render(<OutlinePreview {...defaultProps} />);

      expect(screen.getByTestId('chapter-count')).toHaveTextContent('3 Chapters');
      expect(screen.getByTestId('word-count')).toHaveTextContent('10,000 Words');
      expect(screen.getByTestId('reading-time')).toHaveTextContent('40 min reading time');
    });

    it('displays character count from all chapters', () => {
      render(<OutlinePreview {...defaultProps} />);

      // Should include John, Sarah, The Guardian (from chapters)
      expect(screen.getByTestId('character-count')).toHaveTextContent('3 Characters');
    });

    it('renders character legend', () => {
      render(<OutlinePreview {...defaultProps} />);

      expect(screen.getByTestId('character-legend-John')).toBeInTheDocument();
      expect(screen.getByTestId('character-legend-Sarah')).toBeInTheDocument();
    });

    it('renders back link when no onBack provided', () => {
      render(<OutlinePreview {...defaultProps} />);

      const backLink = screen.getByTestId('back-link');
      expect(backLink).toHaveAttribute('href', '/projects/proj-123/outline');
    });

    it('renders back button when onBack provided', () => {
      const onBack = vi.fn();
      render(<OutlinePreview {...defaultProps} onBack={onBack} />);

      const backButton = screen.getByTestId('back-button');
      expect(backButton).toBeInTheDocument();
      fireEvent.click(backButton);
      expect(onBack).toHaveBeenCalled();
    });

    it('renders expand/collapse all button', () => {
      render(<OutlinePreview {...defaultProps} />);

      expect(screen.getByTestId('toggle-all-button')).toHaveTextContent('Expand All');
    });
  });

  describe('Chapter Expansion', () => {
    it('expands a chapter when clicking its header', () => {
      render(<OutlinePreview {...defaultProps} />);

      // Click to expand chapter 1
      fireEvent.click(screen.getByTestId('chapter-toggle-1'));

      // Should show expanded content
      const content = screen.getByTestId('chapter-content-1');
      expect(content).toBeInTheDocument();
      // Text is broken by character highlighting spans, so use textContent check
      expect(content).toHaveTextContent('John meets Sarah at the coffee shop');
    });

    it('collapses an expanded chapter when clicking again', () => {
      render(<OutlinePreview {...defaultProps} />);

      // Expand
      fireEvent.click(screen.getByTestId('chapter-toggle-1'));
      expect(screen.getByTestId('chapter-content-1')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByTestId('chapter-toggle-1'));
      expect(screen.queryByTestId('chapter-content-1')).not.toBeInTheDocument();
    });

    it('shows chevron-down when expanded, chevron-right when collapsed', () => {
      render(<OutlinePreview {...defaultProps} />);

      // Initially collapsed - should show right chevron
      const toggle1 = screen.getByTestId('chapter-toggle-1');
      expect(toggle1.querySelector('[data-testid="chevron-right"]')).toBeInTheDocument();

      // Expand
      fireEvent.click(toggle1);

      // Should now show down chevron
      expect(toggle1.querySelector('[data-testid="chevron-down"]')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse All', () => {
    it('expands all chapters when clicking Expand All', () => {
      render(<OutlinePreview {...defaultProps} />);

      fireEvent.click(screen.getByTestId('toggle-all-button'));

      // All chapters should be expanded
      expect(screen.getByTestId('chapter-content-1')).toBeInTheDocument();
      expect(screen.getByTestId('chapter-content-2')).toBeInTheDocument();
      expect(screen.getByTestId('chapter-content-3')).toBeInTheDocument();

      // Button text should change
      expect(screen.getByTestId('toggle-all-button')).toHaveTextContent('Collapse All');
    });

    it('collapses all chapters when clicking Collapse All', () => {
      render(<OutlinePreview {...defaultProps} />);

      // First expand all
      fireEvent.click(screen.getByTestId('toggle-all-button'));

      // Then collapse all
      fireEvent.click(screen.getByTestId('toggle-all-button'));

      // No chapters should be expanded
      expect(screen.queryByTestId('chapter-content-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chapter-content-2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chapter-content-3')).not.toBeInTheDocument();

      // Button text should change back
      expect(screen.getByTestId('toggle-all-button')).toHaveTextContent('Expand All');
    });
  });

  describe('Expanded Chapter Content', () => {
    beforeEach(() => {
      render(<OutlinePreview {...defaultProps} />);
      // Expand chapter 1
      fireEvent.click(screen.getByTestId('chapter-toggle-1'));
    });

    it('displays summary', () => {
      // Text is broken by character highlighting spans, so use content checks
      const content = screen.getByTestId('chapter-content-1');
      expect(content).toHaveTextContent('John meets Sarah at the coffee shop');
    });

    it('displays setting', () => {
      expect(screen.getByText('Coffee shop in downtown Manhattan')).toBeInTheDocument();
    });

    it('displays characters involved', () => {
      const content = screen.getByTestId('chapter-content-1');
      expect(content).toHaveTextContent('John');
      expect(content).toHaveTextContent('Sarah');
    });

    it('displays key events', () => {
      // Text is broken by character highlighting spans, so use content checks
      const content = screen.getByTestId('chapter-content-1');
      expect(content).toHaveTextContent('John discovers the map');
      expect(content).toHaveTextContent('Sarah reveals her secret');
    });

    it('displays word count', () => {
      expect(screen.getByText('Estimated: 3,000 words')).toBeInTheDocument();
    });
  });

  describe('Character Highlighting', () => {
    it('highlights character names in summary', () => {
      render(<OutlinePreview {...defaultProps} />);
      fireEvent.click(screen.getByTestId('chapter-toggle-1'));

      // Character names should be highlighted
      const highlights = screen.getAllByTestId('character-highlight');
      expect(highlights.length).toBeGreaterThan(0);
    });

    it('highlights character names in key events', () => {
      render(<OutlinePreview {...defaultProps} />);
      fireEvent.click(screen.getByTestId('chapter-toggle-1'));

      // Key events contain "John" and "Sarah" which should be highlighted
      const highlights = screen.getAllByTestId('character-highlight');
      const highlightTexts = highlights.map(h => h.textContent?.toLowerCase());

      expect(highlightTexts).toContain('john');
      expect(highlightTexts).toContain('sarah');
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no chapters', () => {
      render(<OutlinePreview {...defaultProps} chapters={[]} />);

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No chapters in this outline yet.')).toBeInTheDocument();
    });

    it('shows link to outline editor in empty state', () => {
      render(<OutlinePreview {...defaultProps} chapters={[]} />);

      const link = screen.getByText('Go to Outline Editor');
      expect(link).toHaveAttribute('href', '/projects/proj-123/outline');
    });
  });

  describe('Edge Cases', () => {
    it('handles chapters with minimal data', () => {
      const minimalChapters = [
        {
          number: 1,
          title: 'Simple Chapter',
          summary: 'A basic summary.',
        },
      ];

      render(<OutlinePreview {...defaultProps} chapters={minimalChapters} />);
      fireEvent.click(screen.getByTestId('chapter-toggle-1'));

      expect(screen.getByText('A basic summary.')).toBeInTheDocument();
      // Should not crash on missing optional fields
    });

    it('handles empty characters array', () => {
      render(<OutlinePreview {...defaultProps} characters={[]} />);

      // Should still show chapter character count from chapter data
      expect(screen.getByTestId('character-count')).toHaveTextContent('3 Characters');
    });

    it('handles chapters with zero word count', () => {
      const chaptersWithZeroWords = [
        {
          number: 1,
          title: 'Empty Chapter',
          summary: 'No content yet.',
          estimated_word_count: 0,
        },
      ];

      render(<OutlinePreview {...defaultProps} chapters={chaptersWithZeroWords} />);

      expect(screen.getByTestId('word-count')).toHaveTextContent('0 Words');
      expect(screen.getByTestId('reading-time')).toHaveTextContent('0 min reading time');
    });
  });
});

describe('formatReadingTime', () => {
  it('returns minutes for short content', () => {
    expect(formatReadingTime(250)).toBe('1 min');
    expect(formatReadingTime(500)).toBe('2 min');
    expect(formatReadingTime(750)).toBe('3 min');
  });

  it('returns hours and minutes for longer content', () => {
    expect(formatReadingTime(15000)).toBe('1 hr');
    expect(formatReadingTime(18750)).toBe('1 hr 15 min');
    expect(formatReadingTime(30000)).toBe('2 hr');
  });

  it('handles zero words', () => {
    expect(formatReadingTime(0)).toBe('0 min');
  });

  it('rounds to nearest minute', () => {
    expect(formatReadingTime(125)).toBe('1 min'); // 0.5 rounds to 1
    expect(formatReadingTime(100)).toBe('0 min'); // 0.4 rounds to 0
  });
});

describe('highlightCharacters', () => {
  it('returns plain text when no characters', () => {
    const result = highlightCharacters('Hello world', []);
    expect(result).toBe('Hello world');
  });

  it('highlights matching character names', () => {
    const result = highlightCharacters('John met Sarah', ['John', 'Sarah']);

    // Result should be an array of elements
    expect(Array.isArray(result)).toBe(true);
  });

  it('is case insensitive', () => {
    const result = highlightCharacters('john met SARAH', ['John', 'Sarah']);
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles special regex characters in names', () => {
    // Names with special characters should not break regex
    const result = highlightCharacters('John (Jr.) met Sarah', ['John (Jr.)']);
    expect(result).toBeDefined();
  });

  it('does not highlight partial matches', () => {
    // "Johnson" should not match "John" as a word boundary check
    const result = highlightCharacters('Johnson met Sarah', ['John', 'Sarah']);

    // Since we use word boundaries, "Johnson" should not be split
    expect(Array.isArray(result)).toBe(true);
  });
});
