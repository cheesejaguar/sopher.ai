/**
 * Tests for New Project Page
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewProjectPage from '@/app/projects/new/page';
import { useStore, User } from '@/lib/zustand';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocationHref = vi.fn();
const locationDescriptor = {
  value: {
    _href: '',
    get href() {
      return this._href || '';
    },
    set href(value: string) {
      mockLocationHref(value);
      this._href = value;
    },
  },
  writable: true,
};
Object.defineProperty(window, 'location', locationDescriptor);

const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/photo.jpg',
  role: 'author',
  monthly_budget_usd: 100,
};

describe('NewProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationHref.mockClear();

    // Reset store state
    useStore.setState({
      user: null,
      isAuthenticated: false,
      projects: [],
      currentProject: null,
      usage: null,
      bookEstimate: null,
      messages: [],
      isGenerating: false,
      progress: 0,
      totalCost: 0,
    });

    // Default mock fetch responses
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUser),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render page title', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Start a New Book')).toBeInTheDocument();
      });
    });

    it('should render header with logo', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('sopher.ai')).toBeInTheDocument();
      });
    });

    it('should render back to projects link', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Back to Projects')).toBeInTheDocument();
      });
    });

    it('should render form fields', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
        expect(screen.getByText('Genre')).toBeInTheDocument();
        expect(screen.getByText('Target Chapters')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should show validation error for empty name', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Create Project')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });
    });

    it('should show validation error for short name', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'AB' } });
      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(screen.getByText('Project name must be at least 3 characters')).toBeInTheDocument();
      });
    });

    it('should show validation error for missing genre', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Book Title' } });

      // Fill in brief
      const briefTextarea = screen.getByPlaceholderText(/Describe your book idea/);
      fireEvent.change(briefTextarea, { target: { value: 'A fantasy book about heroes and dragons.' } });

      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(screen.getByText('Please select a genre')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate back to projects on link click', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Back to Projects')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Back to Projects'));

      expect(mockLocationHref).toHaveBeenCalledWith('/projects');
    });
  });

  describe('User Authentication', () => {
    it('should fetch user on mount', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/backend/auth/me',
          expect.objectContaining({ credentials: 'include' })
        );
      });
    });

    it('should redirect to login on auth failure', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<NewProjectPage />);

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith('/login');
      });
    });

    it('should display user info when authenticated', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('should submit form with valid data', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects') && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              id: 'proj-new',
              name: 'My Fantasy Book',
              genre: 'Fantasy',
              target_chapters: 10,
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      // Fill in form
      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Book' } });

      const briefTextarea = screen.getByPlaceholderText(/Describe your book idea/);
      fireEvent.change(briefTextarea, { target: { value: 'A fantasy book about heroes and dragons and magical lands.' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/backend/v1/projects',
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
          })
        );
      });
    });
  });

  describe('Model Selection', () => {
    it('should render model options', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Select AI Model')).toBeInTheDocument();
        expect(screen.getByText('ChatGPT 5.2')).toBeInTheDocument();
      });
    });

    it('should allow selecting a model', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('ChatGPT 5.2')).toBeInTheDocument();
      });

      // Click on a model option
      const modelButton = screen.getByText('ChatGPT 5.2').closest('button');
      if (modelButton) {
        fireEvent.click(modelButton);
      }

      // Model should be selected (has aurora-teal border)
      await waitFor(() => {
        expect(modelButton?.className).toContain('border-aurora-teal');
      });
    });
  });
});
