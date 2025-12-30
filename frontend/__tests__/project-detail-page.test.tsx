/**
 * Tests for Project Detail Page
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProjectDetailPage from '@/app/projects/[id]/page';
import { useStore, User, Project } from '@/lib/zustand';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'proj-123' }),
}));

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

const mockProject: Project = {
  id: 'proj-123',
  user_id: 'user-123',
  name: 'My Fantasy Novel',
  description: 'An epic fantasy adventure',
  genre: 'Fantasy',
  target_chapters: 20,
  style_guide: 'Write with vivid descriptions',
  settings: {
    target_audience: 'Young Adults',
    tone: 'dramatic',
    pov: 'third_person_limited',
    tense: 'past',
    dialogue_style: 'moderate',
    prose_style: 'descriptive',
    chapter_length_target: 3500,
    character_bible_text: 'Main character: Hero',
    world_building_text: 'Fantasy realm',
  },
  status: 'in_progress',
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-20T15:45:00Z',
};

const mockStats = {
  project_id: 'proj-123',
  session_count: 5,
  artifact_count: 12,
  total_cost_usd: 8.75,
  status: 'in_progress',
};

describe('ProjectDetailPage', () => {
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
      if (url.includes('/v1/projects/proj-123/stats')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockStats),
        });
      }
      if (url.includes('/v1/projects/proj-123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProject),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render project name', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('My Fantasy Novel')).toBeInTheDocument();
      });
    });

    it('should render project description', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('An epic fantasy adventure')).toBeInTheDocument();
      });
    });

    it('should render project genre', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Fantasy')).toBeInTheDocument();
      });
    });

    it('should render status badge', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('in progress')).toBeInTheDocument();
      });
    });

    it('should render header with logo', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('sopher.ai')).toBeInTheDocument();
      });
    });

    it('should render back to projects link', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Back to Projects')).toBeInTheDocument();
      });
    });

    it('should render generate button', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Generate')).toBeInTheDocument();
      });
    });
  });

  describe('Stats Display', () => {
    it('should display chapter count', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('20')).toBeInTheDocument();
        expect(screen.getByText('Chapters')).toBeInTheDocument();
      });
    });

    it('should display artifact count', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('Artifacts')).toBeInTheDocument();
      });
    });

    it('should display session count', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('Sessions')).toBeInTheDocument();
      });
    });

    it('should display total cost', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('$8.75')).toBeInTheDocument();
        expect(screen.getByText('Total Cost')).toBeInTheDocument();
      });
    });
  });

  describe('Settings Display', () => {
    it('should display target audience', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Target Audience')).toBeInTheDocument();
        expect(screen.getByText('Young Adults')).toBeInTheDocument();
      });
    });

    it('should display tone', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Tone')).toBeInTheDocument();
        expect(screen.getByText('dramatic')).toBeInTheDocument();
      });
    });

    it('should display point of view', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Point of View')).toBeInTheDocument();
        expect(screen.getByText('Third Person Limited')).toBeInTheDocument();
      });
    });

    it('should display tense', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Tense')).toBeInTheDocument();
        expect(screen.getByText('past')).toBeInTheDocument();
      });
    });

    it('should display chapter length', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Chapter Length')).toBeInTheDocument();
        expect(screen.getByText('3,500 words')).toBeInTheDocument();
      });
    });

    it('should display style guide', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Style Guide')).toBeInTheDocument();
        expect(screen.getByText('Write with vivid descriptions')).toBeInTheDocument();
      });
    });
  });

  describe('Character Bible & World Building', () => {
    it('should display character bible', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Character Bible')).toBeInTheDocument();
        expect(screen.getByText('Main character: Hero')).toBeInTheDocument();
      });
    });

    it('should display world building', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('World Building')).toBeInTheDocument();
        expect(screen.getByText('Fantasy realm')).toBeInTheDocument();
      });
    });
  });

  describe('Project Info', () => {
    it('should display created date', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Created')).toBeInTheDocument();
        // The date format is locale-dependent, so check for 2024
        const createdText = screen.getAllByText(/2024/).find((el) =>
          el.textContent?.includes('January')
        );
        expect(createdText).toBeTruthy();
      });
    });

    it('should display project ID', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Project ID')).toBeInTheDocument();
        expect(screen.getByText('proj-123')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<ProjectDetailPage />);

      const loadingElements = document.querySelectorAll('.animate-spin');
      expect(loadingElements.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should display error on project not found', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects/proj-123')) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Project not found')).toBeInTheDocument();
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
        if (url.includes('/v1/projects/proj-123')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ detail: 'Server error' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Try again')).toBeInTheDocument();
      });
    });

    it('should redirect to login on 401', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects/proj-123')) {
          return Promise.resolve({ ok: false, status: 401 });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to projects list when back link clicked', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Back to Projects')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Back to Projects'));

      expect(mockLocationHref).toHaveBeenCalledWith('/projects');
    });

    it('should navigate to generation page when generate clicked', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Generate')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Generate'));

      expect(mockLocationHref).toHaveBeenCalledWith('/?project=proj-123');
    });
  });

  describe('Delete Functionality', () => {
    it('should show delete confirmation modal', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete Project')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete Project'));

      await waitFor(() => {
        expect(screen.getByText('Delete Project?')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
      });
    });

    it('should close modal when cancel clicked', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete Project')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete Project'));

      await waitFor(() => {
        expect(screen.getByText('Delete Project?')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Delete Project?')).not.toBeInTheDocument();
      });
    });

    it('should delete project and redirect', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects/proj-123/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockStats),
          });
        }
        if (url.includes('/v1/projects/proj-123') && options?.method === 'DELETE') {
          return Promise.resolve({ ok: true });
        }
        if (url.includes('/v1/projects/proj-123')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockProject),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete Project')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete Project'));

      await waitFor(() => {
        expect(screen.getByText('Delete Project?')).toBeInTheDocument();
      });

      // Find the delete button in the modal (not the icon button)
      const deleteButtons = screen.getAllByText('Delete Project');
      const modalDeleteButton = deleteButtons.find(
        (btn) => btn.closest('button')?.className.includes('bg-red')
      );
      fireEvent.click(modalDeleteButton!);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/backend/v1/projects/proj-123',
          expect.objectContaining({
            method: 'DELETE',
            credentials: 'include',
          })
        );
        expect(mockLocationHref).toHaveBeenCalledWith('/projects');
      });
    });

    it('should show error on delete failure', async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects/proj-123/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockStats),
          });
        }
        if (url.includes('/v1/projects/proj-123') && options?.method === 'DELETE') {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ detail: 'Failed to delete' }),
          });
        }
        if (url.includes('/v1/projects/proj-123')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockProject),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete Project')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete Project'));

      await waitFor(() => {
        expect(screen.getByText('Delete Project?')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText('Delete Project');
      const modalDeleteButton = deleteButtons.find(
        (btn) => btn.closest('button')?.className.includes('bg-red')
      );
      fireEvent.click(modalDeleteButton!);

      await waitFor(() => {
        expect(screen.getByText('Failed to delete')).toBeInTheDocument();
      });
    });
  });

  describe('User Authentication', () => {
    it('should fetch user on mount', async () => {
      render(<ProjectDetailPage />);

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

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(mockLocationHref).toHaveBeenCalledWith('/login');
      });
    });

    it('should display user info when authenticated', async () => {
      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });
    });

    it('should handle logout', async () => {
      render(<ProjectDetailPage />);

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

  describe('Different Status States', () => {
    it('should display draft status correctly', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects/proj-123/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ...mockStats, status: 'draft' }),
          });
        }
        if (url.includes('/v1/projects/proj-123')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ...mockProject, status: 'draft' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('draft')).toBeInTheDocument();
      });
    });

    it('should display completed status correctly', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockUser),
          });
        }
        if (url.includes('/v1/projects/proj-123/stats')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ...mockStats, status: 'completed' }),
          });
        }
        if (url.includes('/v1/projects/proj-123')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ...mockProject, status: 'completed' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      render(<ProjectDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('completed')).toBeInTheDocument();
      });
    });
  });
});
