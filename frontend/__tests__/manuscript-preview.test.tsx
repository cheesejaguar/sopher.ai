import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ManuscriptPreview from '@/components/ManuscriptPreview';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BookOpen: () => <span data-testid="book-open">📖</span>,
  ChevronLeft: () => <span data-testid="chevron-left">◀</span>,
  ChevronRight: () => <span data-testid="chevron-right">▶</span>,
  Clock: () => <span data-testid="clock">🕐</span>,
  List: () => <span data-testid="list">📋</span>,
  X: () => <span data-testid="x">✕</span>,
  Menu: () => <span data-testid="menu">☰</span>,
  Loader2: () => <span data-testid="loader">⌛</span>,
  AlertCircle: () => <span data-testid="alert">⚠</span>,
  BookText: () => <span data-testid="book-text">📖</span>,
  FileText: () => <span data-testid="file-text">📄</span>,
  User: () => <span data-testid="user">👤</span>,
  Quote: () => <span data-testid="quote">💬</span>,
  Heart: () => <span data-testid="heart">❤</span>,
  Award: () => <span data-testid="award">🏆</span>,
}));

// Sample manuscript data
const sampleManuscript = {
  title: 'Test Novel',
  author: 'Test Author',
  chapters: [
    {
      number: 1,
      title: 'The Beginning',
      content: 'It was a dark and stormy night.\n\nThe wind howled outside.\n\n* * *\n\nA new scene begins.',
      word_count: 1000,
    },
    {
      number: 2,
      title: 'The Middle',
      content: 'The journey continues.\n\nMany things happened.',
      word_count: 1500,
    },
    {
      number: 3,
      title: 'The End',
      content: 'Everything was resolved.',
      word_count: 800,
    },
  ],
  title_page: {
    title: 'Test Novel',
    subtitle: 'A Tale of Testing',
    author_name: 'Test Author',
    publisher: 'Test Press',
  },
  copyright_page: {
    author_name: 'Test Author',
    year: 2024,
    rights_statement: 'All rights reserved.',
    isbn: '978-1234567890',
  },
  dedication: {
    text: 'For all the testers',
  },
  epigraph: {
    text: 'To test is to doubt',
    attribution: 'Unknown Tester',
    source: 'The Book of Tests',
  },
  acknowledgments: 'Thanks to everyone who helped test this.',
  table_of_contents: [
    { title: 'The Beginning', chapter_number: 1, level: 1 },
    { title: 'The Middle', chapter_number: 2, level: 1 },
    { title: 'The End', chapter_number: 3, level: 1 },
  ],
  author_bio: {
    text: 'Test Author writes tests.',
    website: 'https://testauthor.com',
    social_media: { twitter: '@testauthor' },
  },
  also_by: {
    author_name: 'Test Author',
    titles: ['Previous Test', 'Another Test'],
    series_info: { 'Test Series': ['Test 1', 'Test 2'] },
  },
  excerpt: {
    book_title: 'Next Test',
    text: 'Preview of the next test...',
    chapter_title: 'Chapter 1',
    coming_soon_date: 'Fall 2025',
  },
  total_words: 3300,
};

describe('ManuscriptPreview Component', () => {
  const defaultProps = {
    projectId: 'proj-123',
    manuscript: sampleManuscript,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the manuscript preview', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      expect(screen.getByTestId('manuscript-preview')).toBeInTheDocument();
    });

    it('displays the manuscript title', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      // Title appears in header and content, just verify it's present
      expect(screen.getAllByText('Test Novel').length).toBeGreaterThan(0);
    });

    it('displays reading progress', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      // Should show some percentage
      expect(screen.getByText(/\d+% complete/)).toBeInTheDocument();
    });

    it('displays reading time', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      expect(screen.getByText(/\d+ min total/)).toBeInTheDocument();
    });
  });

  describe('Title Page', () => {
    it('renders title page content by default', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      expect(screen.getByTestId('title-page-content')).toBeInTheDocument();
    });

    it('displays title and subtitle', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      // Title appears in multiple places, check for the main heading
      const titleContent = screen.getByTestId('title-page-content');
      expect(titleContent).toHaveTextContent('Test Novel');
      expect(titleContent).toHaveTextContent('A Tale of Testing');
    });

    it('displays author name', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      expect(screen.getByText('by Test Author')).toBeInTheDocument();
    });

    it('displays publisher', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      expect(screen.getByText('Test Press')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('renders navigation buttons', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      expect(screen.getByTestId('prev-button')).toBeInTheDocument();
      expect(screen.getByTestId('next-button')).toBeInTheDocument();
    });

    it('disables previous button on first section', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      const prevButton = screen.getByTestId('prev-button');
      expect(prevButton).toBeDisabled();
    });

    it('navigates to next section on next button click', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      const nextButton = screen.getByTestId('next-button');
      await act(async () => {
        fireEvent.click(nextButton);
      });

      // Should now show copyright page
      expect(screen.getByTestId('copyright-content')).toBeInTheDocument();
    });

    it('navigates back on previous button click', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Go forward
      const nextButton = screen.getByTestId('next-button');
      await act(async () => {
        fireEvent.click(nextButton);
      });

      // Go back
      const prevButton = screen.getByTestId('prev-button');
      await act(async () => {
        fireEvent.click(prevButton);
      });

      // Should be back at title page
      expect(screen.getByTestId('title-page-content')).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Press right arrow
      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowRight' });
      });
      expect(screen.getByTestId('copyright-content')).toBeInTheDocument();

      // Press left arrow
      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
      });
      expect(screen.getByTestId('title-page-content')).toBeInTheDocument();
    });
  });

  describe('Content Sections', () => {
    it('renders copyright page', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to copyright
      await act(async () => {
        fireEvent.click(screen.getByTestId('next-button'));
      });

      expect(screen.getByTestId('copyright-content')).toBeInTheDocument();
      expect(screen.getByText(/Copyright 2024/)).toBeInTheDocument();
    });

    it('renders dedication', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate past copyright to dedication
      await act(async () => {
        fireEvent.click(screen.getByTestId('next-button'));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('next-button'));
      });

      expect(screen.getByTestId('dedication-content')).toBeInTheDocument();
      expect(screen.getByText('For all the testers')).toBeInTheDocument();
    });

    it('renders epigraph', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to epigraph (4th section)
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          fireEvent.click(screen.getByTestId('next-button'));
        });
      }

      expect(screen.getByTestId('epigraph-content')).toBeInTheDocument();
      expect(screen.getByText('To test is to doubt')).toBeInTheDocument();
    });

    it('renders chapters', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to first chapter (past front matter)
      // Title, Copyright, Dedication, Epigraph, Acknowledgments, TOC = 6 sections
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.click(screen.getByTestId('next-button'));
        });
      }

      expect(screen.getByTestId('chapter-content')).toBeInTheDocument();
      expect(screen.getByText('Chapter 1')).toBeInTheDocument();
      expect(screen.getByText('The Beginning')).toBeInTheDocument();
    });

    it('renders author bio', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to author bio (after all chapters)
      // 6 front matter + 3 chapters = 9
      for (let i = 0; i < 9; i++) {
        await act(async () => {
          fireEvent.click(screen.getByTestId('next-button'));
        });
      }

      expect(screen.getByTestId('author-bio-content')).toBeInTheDocument();
      expect(screen.getByText('Test Author writes tests.')).toBeInTheDocument();
    });
  });

  describe('Sidebar Navigation', () => {
    it('renders desktop sidebar with navigation items', () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Check for navigation items
      expect(screen.getByTestId('nav-item-title_page-')).toBeInTheDocument();
      expect(screen.getByTestId('nav-item-chapter-1')).toBeInTheDocument();
    });

    it('allows clicking sidebar items to navigate', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Click on chapter 2
      const chapter2Nav = screen.getByTestId('nav-item-chapter-2');
      await act(async () => {
        fireEvent.click(chapter2Nav);
      });

      expect(screen.getByTestId('chapter-content')).toBeInTheDocument();
      expect(screen.getByText('The Middle')).toBeInTheDocument();
    });

    it('highlights current section in sidebar', () => {
      render(<ManuscriptPreview {...defaultProps} />);

      const titlePageNav = screen.getByTestId('nav-item-title_page-');
      expect(titlePageNav).toHaveClass('bg-teal/10');
    });
  });

  describe('Mobile Menu', () => {
    it('renders menu button', () => {
      render(<ManuscriptPreview {...defaultProps} />);
      expect(screen.getByTestId('menu-button')).toBeInTheDocument();
    });

    it('opens mobile sidebar when clicking menu button', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('menu-button'));
      });

      expect(screen.getByTestId('mobile-sidebar')).toBeInTheDocument();
    });

    it('closes mobile sidebar when clicking close button', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('menu-button'));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('close-sidebar'));
      });

      expect(screen.queryByTestId('mobile-sidebar')).not.toBeInTheDocument();
    });

    it('closes mobile sidebar on escape key', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('menu-button'));
      });
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      expect(screen.queryByTestId('mobile-sidebar')).not.toBeInTheDocument();
    });
  });

  describe('Back Navigation', () => {
    it('renders back button when onBack is provided', () => {
      const onBack = vi.fn();
      render(<ManuscriptPreview {...defaultProps} onBack={onBack} />);

      expect(screen.getByTestId('back-button')).toBeInTheDocument();
    });

    it('calls onBack when back button is clicked', async () => {
      const onBack = vi.fn();
      render(<ManuscriptPreview {...defaultProps} onBack={onBack} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('back-button'));
      });
      expect(onBack).toHaveBeenCalled();
    });

    it('renders back link when onBack is not provided', () => {
      render(<ManuscriptPreview {...defaultProps} />);

      const backLink = screen.getByTestId('back-link');
      expect(backLink).toHaveAttribute('href', '/projects/proj-123/export');
    });
  });

  describe('Scene Breaks', () => {
    it('renders scene breaks correctly', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to first chapter
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.click(screen.getByTestId('next-button'));
        });
      }

      // Chapter 1 has a scene break
      expect(screen.getByTestId('scene-break')).toBeInTheDocument();
    });
  });

  describe('Content Formatting', () => {
    it('splits content into paragraphs', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to first chapter
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.click(screen.getByTestId('next-button'));
        });
      }

      // Should have multiple paragraphs
      expect(screen.getByText('It was a dark and stormy night.')).toBeInTheDocument();
      expect(screen.getByText('The wind howled outside.')).toBeInTheDocument();
    });
  });

  describe('Chapter Stats', () => {
    it('displays word count for chapters', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to first chapter
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.click(screen.getByTestId('next-button'));
        });
      }

      expect(screen.getByText('1,000 words')).toBeInTheDocument();
    });

    it('displays reading time for chapters', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Navigate to first chapter
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          fireEvent.click(screen.getByTestId('next-button'));
        });
      }

      expect(screen.getByText(/\d+ min read/)).toBeInTheDocument();
    });
  });

  describe('Initial Section', () => {
    it('starts at chapter when initialSection is chapter', () => {
      render(
        <ManuscriptPreview
          {...defaultProps}
          initialSection="chapter"
          initialChapter={2}
        />
      );

      expect(screen.getByTestId('chapter-content')).toBeInTheDocument();
      expect(screen.getByText('The Middle')).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('shows progress percentage', () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Progress bar should be visible
      expect(screen.getByText(/\d+% complete/)).toBeInTheDocument();
    });

    it('updates progress as navigation changes', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      // Initially at first section
      const initialProgress = screen.getByText(/\d+% complete/).textContent;

      // Navigate forward
      await act(async () => {
        fireEvent.click(screen.getByTestId('next-button'));
      });

      const newProgress = screen.getByText(/\d+% complete/).textContent;
      expect(newProgress).not.toBe(initialProgress);
    });
  });

  describe('Manuscript Without Optional Sections', () => {
    it('handles manuscript without title page', () => {
      const minimalManuscript = {
        title: 'Minimal Book',
        author: 'Test Author',
        chapters: [
          { number: 1, title: 'Chapter 1', content: 'Content.', word_count: 100 },
        ],
        total_words: 100,
      };

      render(
        <ManuscriptPreview
          projectId="proj-123"
          manuscript={minimalManuscript}
        />
      );

      // Should start at chapter since no front matter
      expect(screen.getByTestId('chapter-content')).toBeInTheDocument();
    });
  });

  describe('Footer Navigation (Mobile)', () => {
    it('renders footer navigation', () => {
      render(<ManuscriptPreview {...defaultProps} />);

      expect(screen.getByTestId('footer-prev')).toBeInTheDocument();
      expect(screen.getByTestId('footer-next')).toBeInTheDocument();
    });

    it('footer navigation works correctly', async () => {
      render(<ManuscriptPreview {...defaultProps} />);

      const footerNext = screen.getByTestId('footer-next');
      await act(async () => {
        fireEvent.click(footerNext);
      });

      expect(screen.getByTestId('copyright-content')).toBeInTheDocument();
    });
  });
});
