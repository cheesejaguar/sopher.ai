/**
 * Tests for New Project (Creation Wizard) Page
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
        expect(screen.getByText('Create New Project')).toBeInTheDocument();
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

    it('should render step indicators', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Basic Info')).toBeInTheDocument();
        expect(screen.getByText('Style')).toBeInTheDocument();
        expect(screen.getByText('Structure')).toBeInTheDocument();
        expect(screen.getByText('Advanced')).toBeInTheDocument();
      });
    });
  });

  describe('Step 1: Basic Info', () => {
    it('should render basic info form fields', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
        expect(screen.getByText('Genre')).toBeInTheDocument();
        expect(screen.getByText('Target Audience')).toBeInTheDocument();
      });
    });

    it('should show validation error for empty name', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Next'));

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
      fireEvent.click(screen.getByText('Next'));

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
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByText('Please select a genre')).toBeInTheDocument();
      });
    });

    it('should clear validation error when field is modified', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByText('Project name is required')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Book' } });

      await waitFor(() => {
        expect(screen.queryByText('Project name is required')).not.toBeInTheDocument();
      });
    });

    it('should proceed to next step when valid', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      // Fill in required fields
      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      fireEvent.click(screen.getByText('Next'));

      // Should now be on Style step
      await waitFor(() => {
        expect(screen.getByText('Tone')).toBeInTheDocument();
        expect(screen.getByText('Point of View')).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Style Settings', () => {
    beforeEach(async () => {
      render(<NewProjectPage />);

      // Navigate to step 2
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      fireEvent.click(screen.getByText('Next'));
    });

    it('should render tone options', async () => {
      await waitFor(() => {
        expect(screen.getByText('Humorous')).toBeInTheDocument();
        expect(screen.getByText('Serious')).toBeInTheDocument();
        expect(screen.getByText('Dramatic')).toBeInTheDocument();
      });
    });

    it('should render POV options', async () => {
      await waitFor(() => {
        expect(screen.getByText('First Person')).toBeInTheDocument();
        expect(screen.getByText('Third Person Limited')).toBeInTheDocument();
        expect(screen.getByText('Third Person Omniscient')).toBeInTheDocument();
      });
    });

    it('should render tense options', async () => {
      await waitFor(() => {
        expect(screen.getByText('Past Tense')).toBeInTheDocument();
        expect(screen.getByText('Present Tense')).toBeInTheDocument();
      });
    });

    it('should allow selecting tone', async () => {
      await waitFor(() => {
        expect(screen.getByText('Humorous')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Humorous'));

      // Button should be styled as selected
      const button = screen.getByText('Humorous');
      expect(button.className).toContain('border-teal');
    });
  });

  describe('Step 3: Structure', () => {
    beforeEach(async () => {
      render(<NewProjectPage />);

      // Navigate to step 3
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      fireEvent.click(screen.getByText('Next')); // Go to Style
      await waitFor(() => expect(screen.getByText('Tone')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next')); // Go to Structure
    });

    it('should render chapter count input', async () => {
      await waitFor(() => {
        expect(screen.getByText('Number of Chapters')).toBeInTheDocument();
      });
    });

    it('should render chapter length input', async () => {
      await waitFor(() => {
        expect(screen.getByText('Target Chapter Length (words)')).toBeInTheDocument();
      });
    });

    it('should calculate estimated book length', async () => {
      await waitFor(() => {
        // Default is 12 chapters x 3000 words = 36,000 words
        expect(screen.getByText('36,000 words')).toBeInTheDocument();
      });
    });

    it('should update estimated length when chapters change', async () => {
      await waitFor(() => {
        expect(screen.getByText('Number of Chapters')).toBeInTheDocument();
      });

      const chaptersInput = screen.getByDisplayValue('12');
      fireEvent.change(chaptersInput, { target: { value: '20' } });

      await waitFor(() => {
        // 20 chapters x 3000 words = 60,000 words
        expect(screen.getByText('60,000 words')).toBeInTheDocument();
      });
    });

    it('should show validation error for too few chapters', async () => {
      await waitFor(() => {
        expect(screen.getByDisplayValue('12')).toBeInTheDocument();
      });

      const chaptersInput = screen.getByDisplayValue('12');
      fireEvent.change(chaptersInput, { target: { value: '0' } });
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByText('Must have at least 1 chapter')).toBeInTheDocument();
      });
    });

    it('should show validation error for chapter length too short', async () => {
      await waitFor(() => {
        expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
      });

      const lengthInput = screen.getByDisplayValue('3000');
      fireEvent.change(lengthInput, { target: { value: '100' } });
      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByText('Chapter length must be at least 500 words')).toBeInTheDocument();
      });
    });
  });

  describe('Step 4: Advanced', () => {
    beforeEach(async () => {
      render(<NewProjectPage />);

      // Navigate through all steps
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      fireEvent.click(screen.getByText('Next')); // To Style
      await waitFor(() => expect(screen.getByText('Tone')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next')); // To Structure
      await waitFor(() => expect(screen.getByText('Number of Chapters')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next')); // To Advanced
    });

    it('should render character bible field', async () => {
      await waitFor(() => {
        expect(screen.getByText('Character Bible')).toBeInTheDocument();
      });
    });

    it('should render world building field', async () => {
      await waitFor(() => {
        expect(screen.getByText('World Building')).toBeInTheDocument();
      });
    });

    it('should render style guide field', async () => {
      await waitFor(() => {
        expect(screen.getByText('Style Guide')).toBeInTheDocument();
      });
    });

    it('should show Create Project button on last step', async () => {
      await waitFor(() => {
        expect(screen.getByText('Create Project')).toBeInTheDocument();
      });
    });

    it('should show optional fields notice', async () => {
      await waitFor(() => {
        expect(screen.getByText(/These fields are optional/)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should disable Previous button on first step', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        const prevButton = screen.getByText('Previous');
        expect(prevButton).toBeDisabled();
      });
    });

    it('should enable Previous button on subsequent steps', async () => {
      render(<NewProjectPage />);

      // Navigate to step 2
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        const prevButton = screen.getByText('Previous');
        expect(prevButton).not.toBeDisabled();
      });
    });

    it('should navigate back to previous step', async () => {
      render(<NewProjectPage />);

      // Navigate to step 2
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      fireEvent.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(screen.getByText('Tone')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Previous'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });
    });

    it('should navigate to projects list when back link clicked', async () => {
      render(<NewProjectPage />);

      await waitFor(() => {
        expect(screen.getByText('Back to Projects')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Back to Projects'));

      expect(mockLocationHref).toHaveBeenCalledWith('/projects');
    });
  });

  describe('Form Submission', () => {
    beforeEach(async () => {
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
              id: 'new-project-123',
              user_id: 'user-123',
              name: 'My Fantasy Novel',
              genre: 'Fantasy',
              target_chapters: 12,
              settings: {},
              status: 'draft',
              created_at: '2024-01-01T00:00:00Z',
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
    });

    it('should submit project creation request', async () => {
      render(<NewProjectPage />);

      // Fill in all required fields
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      // Navigate through all steps
      fireEvent.click(screen.getByText('Next')); // Style
      await waitFor(() => expect(screen.getByText('Tone')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next')); // Structure
      await waitFor(() => expect(screen.getByText('Number of Chapters')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next')); // Advanced
      await waitFor(() => expect(screen.getByText('Create Project')).toBeInTheDocument());

      // Submit
      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/backend/v1/projects',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          })
        );
      });
    });

    it('should redirect to project page on success', async () => {
      render(<NewProjectPage />);

      // Fill in required fields
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      // Navigate to submit
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Tone')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Number of Chapters')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Create Project')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith('/projects/new-project-123');
      });
    });

    it('should show error on submission failure', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects') && options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ detail: 'Server error' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<NewProjectPage />);

      // Fill and submit
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      // Navigate to submit
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Tone')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Number of Chapters')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Create Project')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('should show loading state during submission', async () => {
      // Make fetch hang to test loading state
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects') && options?.method === 'POST') {
          return new Promise(() => {}); // Never resolves
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<NewProjectPage />);

      // Fill and submit
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      // Navigate to submit
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Tone')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Number of Chapters')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Create Project')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
      });
    });

    it('should redirect to login on 401 during submission', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects') && options?.method === 'POST') {
          return Promise.resolve({ ok: false, status: 401 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<NewProjectPage />);

      // Fill and submit
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your book title')).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText('Enter your book title');
      fireEvent.change(nameInput, { target: { value: 'My Fantasy Novel' } });

      const genreSelect = screen.getByRole('combobox');
      fireEvent.change(genreSelect, { target: { value: 'Fantasy' } });

      // Navigate to submit
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Tone')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Number of Chapters')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Next'));
      await waitFor(() => expect(screen.getByText('Create Project')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Create Project'));

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith('/login');
      });
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

    it('should redirect to login on 401', async () => {
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
});
