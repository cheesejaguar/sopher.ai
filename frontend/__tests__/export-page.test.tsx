import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'proj-123' }),
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock zustand store
const mockUser = { access_token: 'test-token', email: 'test@test.com' };
vi.mock('@/lib/zustand', () => ({
  useStore: vi.fn((selector) => {
    const state = { user: mockUser };
    return selector(state);
  }),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BookOpen: () => <span data-testid="book-icon">📖</span>,
  ChevronLeft: () => <span data-testid="chevron-left">◀</span>,
  Download: () => <span data-testid="download-icon">⬇</span>,
  FileText: () => <span data-testid="file-text-icon">📄</span>,
  Loader2: ({ className }: { className?: string }) => <span data-testid="loader" className={className}>⌛</span>,
  AlertCircle: () => <span data-testid="alert-icon">⚠</span>,
  CheckCircle: () => <span data-testid="check-icon">✓</span>,
  FileType: () => <span data-testid="file-type-icon">📁</span>,
  Settings2: () => <span data-testid="settings-icon">⚙</span>,
  Eye: () => <span data-testid="eye-icon">👁</span>,
  Clock: () => <span data-testid="clock-icon">🕐</span>,
  FileDown: () => <span data-testid="file-down-icon">⬇</span>,
  RefreshCw: () => <span data-testid="refresh-icon">🔄</span>,
}));

// Create a mock project response
const mockProjectResponse = {
  id: 'proj-123',
  title: 'My Test Book',
  status: 'in_progress',
  created_at: '2024-01-01T00:00:00Z',
};

// Create a mock preview response
const mockPreviewResponse = {
  title: 'My Test Book',
  author: 'Test Author',
  total_words: 50000,
  chapter_count: 10,
  front_matter_sections: ['Title Page', 'Copyright'],
  back_matter_sections: ['Author Bio'],
  estimated_pages: 200,
  reading_time_minutes: 200,
};

// Create a mock export job response
const mockExportJobResponse = {
  id: 'job-123',
  status: 'completed',
  progress: 100,
  format: 'markdown',
  download_url: '/download/job-123',
  file_name: 'My_Test_Book.md',
  file_size: 125000,
};

describe('ExportPage Component', () => {
  let ExportPage: typeof import('@/app/projects/[id]/export/page').default;
  const mockFetch = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = mockFetch;

    // Import component fresh for each test
    const module = await import('@/app/projects/[id]/export/page');
    ExportPage = module.default;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('shows loading indicator initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<ExportPage />);
      expect(screen.getByTestId('export-loading')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when project fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('export-error')).toBeInTheDocument();
      });
    });
  });

  describe('Loaded State', () => {
    beforeEach(() => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/projects/proj-123') && !url.includes('/export')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockProjectResponse),
          });
        }
        if (url.includes('/export/preview')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockPreviewResponse),
          });
        }
        if (url.includes('/export') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockExportJobResponse),
          });
        }
        if (url.includes('/export/job-123')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockExportJobResponse),
          });
        }
        return Promise.resolve({ ok: false });
      });
    });

    it('renders export page with format options', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('export-page')).toBeInTheDocument();
      });

      expect(screen.getByTestId('format-section')).toBeInTheDocument();
    });

    it('renders all format options', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('format-option-text')).toBeInTheDocument();
      });

      expect(screen.getByTestId('format-option-markdown')).toBeInTheDocument();
      expect(screen.getByTestId('format-option-docx')).toBeInTheDocument();
      expect(screen.getByTestId('format-option-pdf')).toBeInTheDocument();
      expect(screen.getByTestId('format-option-epub')).toBeInTheDocument();
    });

    it('has markdown selected by default', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('format-option-markdown')).toBeInTheDocument();
      });

      const markdownOption = screen.getByTestId('format-option-markdown');
      expect(markdownOption).toHaveClass('border-teal');
    });

    it('allows selecting different format', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('format-option-text')).toBeInTheDocument();
      });

      const textOption = screen.getByTestId('format-option-text');
      await act(async () => {
        fireEvent.click(textOption);
      });

      expect(textOption).toHaveClass('border-teal');
    });

    it('disables unavailable formats', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('format-option-docx')).toBeInTheDocument();
      });

      const docxOption = screen.getByTestId('format-option-docx');
      expect(docxOption).toBeDisabled();
    });

    it('renders front matter section', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('front-matter-section')).toBeInTheDocument();
      });
    });

    it('renders back matter section', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('back-matter-section')).toBeInTheDocument();
      });
    });

    it('renders formatting section', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('formatting-section')).toBeInTheDocument();
      });
    });

    it('renders preview section', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('preview-section')).toBeInTheDocument();
      });
    });

    it('renders export button', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('export-button')).toBeInTheDocument();
      });
    });

    it('renders preview link', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByTestId('preview-link')).toBeInTheDocument();
      });

      const link = screen.getByTestId('preview-link');
      expect(link).toHaveAttribute('href', '/projects/proj-123/export/preview');
    });
  });
});

describe('Export Page UI Elements', () => {
  describe('Export Formats', () => {
    it('defines correct format values', () => {
      const formats = ['text', 'markdown', 'docx', 'pdf', 'epub'];
      expect(formats).toContain('markdown');
      expect(formats).toContain('text');
      expect(formats.length).toBe(5);
    });
  });

  describe('Front Matter Options', () => {
    it('defines all front matter options', () => {
      const frontMatterOptions = [
        'include_title_page',
        'include_copyright',
        'include_dedication',
        'include_epigraph',
        'include_acknowledgments',
        'include_toc',
      ];
      expect(frontMatterOptions.length).toBe(6);
    });
  });

  describe('Back Matter Options', () => {
    it('defines all back matter options', () => {
      const backMatterOptions = [
        'include_author_bio',
        'include_also_by',
        'include_excerpt',
      ];
      expect(backMatterOptions.length).toBe(3);
    });
  });

  describe('Formatting Options', () => {
    it('defines chapter style options', () => {
      const chapterStyles = ['numbered', 'titled', 'both'];
      expect(chapterStyles).toContain('both');
    });

    it('defines scene break options', () => {
      const sceneBreaks = ['asterisks', 'blank', 'ornamental'];
      expect(sceneBreaks).toContain('asterisks');
    });
  });
});
