/**
 * Tests for Zustand store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, Message, User, Usage, BookEstimate, Project } from '@/lib/zustand';

describe('Zustand Store', () => {
  // Reset store before each test
  beforeEach(() => {
    useStore.setState({
      user: null,
      isAuthenticated: false,
      usage: null,
      bookEstimate: null,
      projects: [],
      currentProject: null,
      messages: [],
      isGenerating: false,
      progress: 0,
      totalCost: 0,
    });
  });

  describe('User State', () => {
    it('should initialize with null user', () => {
      const state = useStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should set user and update isAuthenticated', () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/photo.jpg',
        role: 'author',
        monthly_budget_usd: 100,
      };

      useStore.getState().setUser(mockUser);
      const state = useStore.getState();

      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should handle setting user to null', () => {
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'author',
        monthly_budget_usd: 100,
      };

      // Set user first
      useStore.getState().setUser(mockUser);
      expect(useStore.getState().isAuthenticated).toBe(true);

      // Clear user
      useStore.getState().setUser(null);
      const state = useStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('Usage Tracking', () => {
    it('should initialize with null usage', () => {
      const state = useStore.getState();
      expect(state.usage).toBeNull();
    });

    it('should set usage data', () => {
      const mockUsage: Usage = {
        total_usd: 50.00,
        month_usd: 25.00,
        monthly_budget_usd: 100.00,
        remaining_budget_usd: 75.00,
        by_agent: { writer: 15, editor: 10 },
        by_model: { 'gpt-4': 20, 'claude-sonnet': 5 },
      };

      useStore.getState().setUsage(mockUsage);
      const state = useStore.getState();

      expect(state.usage).toEqual(mockUsage);
      expect(state.usage?.remaining_budget_usd).toBe(75.00);
    });

    it('should set book estimate', () => {
      const mockEstimate: BookEstimate = {
        estimated_usd: 15.50,
        total_prompt_tokens: 100000,
        total_completion_tokens: 200000,
        breakdown: { outline: 0.5, chapters: 12.0, editing: 3.0 },
        model: 'gpt-4o',
        chapters: 10,
      };

      useStore.getState().setBookEstimate(mockEstimate);
      const state = useStore.getState();

      expect(state.bookEstimate).toEqual(mockEstimate);
      expect(state.bookEstimate?.chapters).toBe(10);
    });
  });

  describe('Message State', () => {
    it('should initialize with empty messages', () => {
      const state = useStore.getState();
      expect(state.messages).toEqual([]);
    });

    it('should add messages to the list', () => {
      const message1: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Write a book about adventure',
        timestamp: new Date('2024-01-01'),
      };

      const message2: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: 'I will create an outline for your adventure book.',
        timestamp: new Date('2024-01-02'),
      };

      useStore.getState().addMessage(message1);
      useStore.getState().addMessage(message2);

      const state = useStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]).toEqual(message1);
      expect(state.messages[1]).toEqual(message2);
    });

    it('should preserve message order', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'First', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Second', timestamp: new Date() },
        { id: '3', role: 'system', content: 'Third', timestamp: new Date() },
      ];

      messages.forEach(msg => useStore.getState().addMessage(msg));

      const state = useStore.getState();
      expect(state.messages.map(m => m.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('Generation State', () => {
    it('should initialize with isGenerating false', () => {
      const state = useStore.getState();
      expect(state.isGenerating).toBe(false);
    });

    it('should update isGenerating flag', () => {
      useStore.getState().setGenerating(true);
      expect(useStore.getState().isGenerating).toBe(true);

      useStore.getState().setGenerating(false);
      expect(useStore.getState().isGenerating).toBe(false);
    });

    it('should initialize progress at 0', () => {
      const state = useStore.getState();
      expect(state.progress).toBe(0);
    });

    it('should update progress value', () => {
      useStore.getState().setProgress(0.5);
      expect(useStore.getState().progress).toBe(0.5);

      useStore.getState().setProgress(1.0);
      expect(useStore.getState().progress).toBe(1.0);
    });
  });

  describe('Cost Tracking', () => {
    it('should initialize totalCost at 0', () => {
      const state = useStore.getState();
      expect(state.totalCost).toBe(0);
    });

    it('should increment cost correctly', () => {
      useStore.getState().incrementCost(0.001);
      expect(useStore.getState().totalCost).toBe(0.001);

      useStore.getState().incrementCost(0.002);
      expect(useStore.getState().totalCost).toBe(0.003);
    });

    it('should handle multiple increments', () => {
      for (let i = 0; i < 10; i++) {
        useStore.getState().incrementCost(0.01);
      }
      // Note: floating point precision
      expect(useStore.getState().totalCost).toBeCloseTo(0.1, 10);
    });
  });

  describe('Project State', () => {
    const mockProject: Project = {
      id: 'proj-123',
      user_id: 'user-123',
      name: 'My Fantasy Novel',
      description: 'An epic fantasy adventure',
      genre: 'Fantasy',
      target_chapters: 20,
      settings: {},
      status: 'draft',
      created_at: '2024-01-01T00:00:00Z',
    };

    it('should initialize with empty projects list', () => {
      const state = useStore.getState();
      expect(state.projects).toEqual([]);
      expect(state.currentProject).toBeNull();
    });

    it('should set projects list', () => {
      const projects: Project[] = [
        mockProject,
        { ...mockProject, id: 'proj-456', name: 'Sci-Fi Story', genre: 'Science Fiction' },
      ];

      useStore.getState().setProjects(projects);
      const state = useStore.getState();

      expect(state.projects).toHaveLength(2);
      expect(state.projects[0].name).toBe('My Fantasy Novel');
      expect(state.projects[1].name).toBe('Sci-Fi Story');
    });

    it('should set current project', () => {
      useStore.getState().setCurrentProject(mockProject);
      const state = useStore.getState();

      expect(state.currentProject).toEqual(mockProject);
      expect(state.currentProject?.id).toBe('proj-123');
    });

    it('should clear current project', () => {
      useStore.getState().setCurrentProject(mockProject);
      useStore.getState().setCurrentProject(null);
      const state = useStore.getState();

      expect(state.currentProject).toBeNull();
    });

    it('should add project to list', () => {
      useStore.getState().addProject(mockProject);
      const state = useStore.getState();

      expect(state.projects).toHaveLength(1);
      expect(state.projects[0]).toEqual(mockProject);
    });

    it('should add multiple projects', () => {
      useStore.getState().addProject(mockProject);
      useStore.getState().addProject({
        ...mockProject,
        id: 'proj-456',
        name: 'Second Project',
      });

      const state = useStore.getState();
      expect(state.projects).toHaveLength(2);
    });

    it('should update project in list', () => {
      useStore.getState().setProjects([mockProject]);
      useStore.getState().updateProject('proj-123', {
        name: 'Updated Name',
        status: 'in_progress',
      });

      const state = useStore.getState();
      expect(state.projects[0].name).toBe('Updated Name');
      expect(state.projects[0].status).toBe('in_progress');
      expect(state.projects[0].genre).toBe('Fantasy'); // Unchanged
    });

    it('should update current project when it matches', () => {
      useStore.getState().setProjects([mockProject]);
      useStore.getState().setCurrentProject(mockProject);
      useStore.getState().updateProject('proj-123', {
        name: 'Updated Name',
      });

      const state = useStore.getState();
      expect(state.currentProject?.name).toBe('Updated Name');
    });

    it('should not update current project when it does not match', () => {
      useStore.getState().setProjects([mockProject]);
      useStore.getState().setCurrentProject({
        ...mockProject,
        id: 'other-project',
        name: 'Other Project',
      });

      useStore.getState().updateProject('proj-123', {
        name: 'Updated Name',
      });

      const state = useStore.getState();
      expect(state.currentProject?.name).toBe('Other Project');
    });

    it('should remove project from list', () => {
      useStore.getState().setProjects([
        mockProject,
        { ...mockProject, id: 'proj-456', name: 'Second' },
      ]);

      useStore.getState().removeProject('proj-123');
      const state = useStore.getState();

      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].name).toBe('Second');
    });

    it('should clear current project when removing it', () => {
      useStore.getState().setProjects([mockProject]);
      useStore.getState().setCurrentProject(mockProject);
      useStore.getState().removeProject('proj-123');

      const state = useStore.getState();
      expect(state.projects).toHaveLength(0);
      expect(state.currentProject).toBeNull();
    });

    it('should not clear current project when removing different project', () => {
      const otherProject = { ...mockProject, id: 'proj-456', name: 'Other' };
      useStore.getState().setProjects([mockProject, otherProject]);
      useStore.getState().setCurrentProject(mockProject);
      useStore.getState().removeProject('proj-456');

      const state = useStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.currentProject?.id).toBe('proj-123');
    });
  });

  describe('Store Integration', () => {
    it('should handle full workflow state changes', () => {
      const store = useStore.getState();

      // 1. User logs in
      store.setUser({
        id: 'user-1',
        email: 'author@example.com',
        role: 'author',
        monthly_budget_usd: 100,
      });

      // 2. Fetch usage
      store.setUsage({
        total_usd: 10,
        month_usd: 5,
        monthly_budget_usd: 100,
        remaining_budget_usd: 95,
        by_agent: {},
        by_model: {},
      });

      // 3. Get estimate
      store.setBookEstimate({
        estimated_usd: 8.50,
        total_prompt_tokens: 50000,
        total_completion_tokens: 100000,
        breakdown: { outline: 0.5, chapters: 8.0 },
        model: 'gpt-4o',
        chapters: 10,
      });

      // 4. Start generation
      store.addMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Write my book',
        timestamp: new Date(),
      });
      store.setGenerating(true);

      // 5. Track progress
      store.setProgress(0.25);
      store.incrementCost(0.01);

      // Verify final state
      const finalState = useStore.getState();
      expect(finalState.isAuthenticated).toBe(true);
      expect(finalState.usage?.remaining_budget_usd).toBe(95);
      expect(finalState.bookEstimate?.estimated_usd).toBe(8.50);
      expect(finalState.messages).toHaveLength(1);
      expect(finalState.isGenerating).toBe(true);
      expect(finalState.progress).toBe(0.25);
      expect(finalState.totalCost).toBe(0.01);
    });
  });
});
