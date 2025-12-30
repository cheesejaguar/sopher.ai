/**
 * Tests for Projects List Page
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectsPage from '@/app/projects/page';
import { useStore, Project, User } from '@/lib/zustand';

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

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    user_id: 'user-123',
    name: 'Fantasy Novel',
    description: 'An epic fantasy adventure',
    genre: 'Fantasy',
    target_chapters: 20,
    settings: {},
    status: 'draft',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 'proj-2',
    user_id: 'user-123',
    name: 'Sci-Fi Story',
    description: 'Space exploration tale',
    genre: 'Science Fiction',
    target_chapters: 15,
    settings: {},
    status: 'in_progress',
    created_at: '2024-01-10T00:00:00Z',
  },
  {
    id: 'proj-3',
    user_id: 'user-123',
    name: 'Mystery Thriller',
    description: 'A detective story',
    genre: 'Mystery',
    target_chapters: 12,
    settings: {},
    status: 'completed',
    created_at: '2024-01-05T00:00:00Z',
  },
];

describe('ProjectsPage', () => {
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
      if (url.includes('/v1/projects')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            items: mockProjects,
            total: 3,
            page: 1,
            page_size: 12,
            total_pages: 1,
          }),
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
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('My Projects')).toBeInTheDocument();
      });
    });

    it('should render header with logo', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('sopher.ai')).toBeInTheDocument();
      });
    });

    it('should render new project button', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('New Project')).toBeInTheDocument();
      });
    });

    it('should render search input', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
      });
    });

    it('should render status filter', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('All Status')).toBeInTheDocument();
      });
    });

    it('should render view toggle buttons', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByTitle('Grid view')).toBeInTheDocument();
        expect(screen.getByTitle('List view')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ProjectsPage />);

      // Loading spinner should be present (via Loader2 component)
      const loadingElements = document.querySelectorAll('.animate-spin');
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe('User Authentication', () => {
    it('should fetch user data on mount', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/backend/auth/me',
          expect.objectContaining({ credentials: 'include' })
        );
      });
    });

    it('should display user info when authenticated', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });
    });

    it('should redirect to login on 401 from auth/me', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith('/login');
      });
    });

    it('should handle logout click', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByTitle('Logout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Logout'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/backend/auth/logout',
          expect.objectContaining({ method: 'POST', credentials: 'include' })
        );
        expect(mockLocationHref).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Project List', () => {
    it('should fetch projects after user is loaded', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/v1/projects'),
          expect.objectContaining({ credentials: 'include' })
        );
      });
    });

    it('should display project count', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('3 projects')).toBeInTheDocument();
      });
    });

    it('should render project cards in grid view', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
        expect(screen.getByText('Sci-Fi Story')).toBeInTheDocument();
        expect(screen.getByText('Mystery Thriller')).toBeInTheDocument();
      });
    });

    it('should display project descriptions', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('An epic fantasy adventure')).toBeInTheDocument();
        expect(screen.getByText('Space exploration tale')).toBeInTheDocument();
      });
    });

    it('should display project genres', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy')).toBeInTheDocument();
        expect(screen.getByText('Science Fiction')).toBeInTheDocument();
        expect(screen.getByText('Mystery')).toBeInTheDocument();
      });
    });

    it('should display status badges', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('draft')).toBeInTheDocument();
        expect(screen.getByText('in progress')).toBeInTheDocument();
        expect(screen.getByText('completed')).toBeInTheDocument();
      });
    });

    it('should display chapter counts', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('20 chapters')).toBeInTheDocument();
        expect(screen.getByText('15 chapters')).toBeInTheDocument();
        expect(screen.getByText('12 chapters')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no projects', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              items: [],
              total: 0,
              page: 1,
              page_size: 12,
              total_pages: 0,
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('No projects yet')).toBeInTheDocument();
        expect(screen.getByText('Create your first project to get started')).toBeInTheDocument();
      });
    });

    it('should show "no projects found" when filtered results are empty', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              items: mockProjects,
              total: 3,
              page: 1,
              page_size: 12,
              total_pages: 1,
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      // Search for something that doesn't exist
      const searchInput = screen.getByPlaceholderText('Search projects...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('No projects found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter projects by name', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search projects...');
      fireEvent.change(searchInput, { target: { value: 'Fantasy' } });

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
        expect(screen.queryByText('Sci-Fi Story')).not.toBeInTheDocument();
        expect(screen.queryByText('Mystery Thriller')).not.toBeInTheDocument();
      });
    });

    it('should filter projects by description', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search projects...');
      fireEvent.change(searchInput, { target: { value: 'space' } });

      await waitFor(() => {
        expect(screen.queryByText('Fantasy Novel')).not.toBeInTheDocument();
        expect(screen.getByText('Sci-Fi Story')).toBeInTheDocument();
      });
    });

    it('should filter projects by genre', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search projects...');
      fireEvent.change(searchInput, { target: { value: 'mystery' } });

      await waitFor(() => {
        expect(screen.queryByText('Fantasy Novel')).not.toBeInTheDocument();
        expect(screen.getByText('Mystery Thriller')).toBeInTheDocument();
      });
    });

    it('should be case insensitive', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search projects...');
      fireEvent.change(searchInput, { target: { value: 'FANTASY' } });

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });
    });
  });

  describe('View Toggle', () => {
    it('should default to grid view', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      // Grid view should be active (checking button style)
      const gridButton = screen.getByTitle('Grid view');
      expect(gridButton.className).toContain('bg-indigo');
    });

    it('should switch to list view', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('List view'));

      // List view should now be active
      const listButton = screen.getByTitle('List view');
      expect(listButton.className).toContain('bg-indigo');

      // Table should be present
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should display projects in table format in list view', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('List view'));

      // Check table headers
      expect(screen.getByText('Project')).toBeInTheDocument();
      expect(screen.getByText('Genre')).toBeInTheDocument();
      expect(screen.getByText('Chapters')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to new project page on button click', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('New Project')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('New Project'));

      expect(mockLocationHref).toHaveBeenCalledWith('/projects/new');
    });

    it('should navigate to project detail on card click', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Fantasy Novel'));

      expect(mockLocationHref).toHaveBeenCalledWith('/projects/proj-1');
    });
  });

  describe('Error Handling', () => {
    it('should display error message on fetch failure', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ detail: 'Server error' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('should show try again button on error', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ detail: 'Server error' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Try again')).toBeInTheDocument();
      });
    });

    it('should redirect to login on 401 from projects endpoint', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Status Filter', () => {
    it('should refetch projects when status filter changes', async () => {
      render(<ProjectsPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy Novel')).toBeInTheDocument();
      });

      // Clear previous calls
      mockFetch.mockClear();

      // Change status filter
      const statusSelect = screen.getByRole('combobox');
      fireEvent.change(statusSelect, { target: { value: 'draft' } });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('status=draft'),
          expect.anything()
        );
      });
    });
  });
});

describe('Helper Functions', () => {
  describe('getStatusColor', () => {
    it('should return correct colors for each status', async () => {
      // Render to access the status colors in the DOM
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              items: mockProjects,
              total: 3,
              page: 1,
              page_size: 12,
              total_pages: 1,
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        // Check that status badges have appropriate styling
        const draftBadge = screen.getByText('draft').closest('span');
        expect(draftBadge?.className).toContain('slate');

        const inProgressBadge = screen.getByText('in progress').closest('span');
        expect(inProgressBadge?.className).toContain('teal');

        const completedBadge = screen.getByText('completed').closest('span');
        expect(completedBadge?.className).toContain('gold');
      });
    });
  });

  describe('formatDate', () => {
    it('should format dates correctly', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              items: mockProjects,
              total: 3,
              page: 1,
              page_size: 12,
              total_pages: 1,
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectsPage />);

      await waitFor(() => {
        // Dates should be formatted - check for the date pattern (locale-aware)
        // The format will be "Created Jan 15, 2024" displayed together
        const dateElements = screen.getAllByText(/Created/i);
        expect(dateElements.length).toBeGreaterThan(0);
        // Verify at least one date element exists with year 2024
        const dateText = dateElements[0].textContent || '';
        expect(dateText).toContain('2024');
      });
    });
  });
});
