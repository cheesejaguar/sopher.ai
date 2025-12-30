import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

export interface User {
  id: string
  email: string
  name?: string
  picture?: string
  role: string
  monthly_budget_usd: number
}

export interface Usage {
  total_usd: number
  month_usd: number
  monthly_budget_usd: number
  remaining_budget_usd: number
  by_agent: Record<string, number>
  by_model: Record<string, number>
}

export interface BookEstimate {
  estimated_usd: number
  total_prompt_tokens: number
  total_completion_tokens: number
  breakdown: Record<string, number>
  model: string
  chapters: number
}

export interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  brief?: string
  genre?: string
  target_chapters: number
  style_guide?: string
  settings: Record<string, unknown>
  status: 'draft' | 'in_progress' | 'completed'
  created_at: string
  updated_at?: string
}

export interface Chapter {
  id: string
  project_id: string
  chapter_number: number
  title?: string
  content: string
  word_count: number
  status: 'pending' | 'generating' | 'completed' | 'error'
  progress: number
  error?: string
  created_at?: string
  updated_at?: string
}

export interface ChapterGenerationJob {
  chapter_number: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  error?: string
}

export interface AppState {
  // User state
  user: User | null
  setUser: (user: User | null) => void
  isAuthenticated: boolean

  // Usage tracking
  usage: Usage | null
  setUsage: (usage: Usage | null) => void
  bookEstimate: BookEstimate | null
  setBookEstimate: (estimate: BookEstimate | null) => void

  // Project state
  projects: Project[]
  setProjects: (projects: Project[]) => void
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  removeProject: (id: string) => void

  // Chapter state
  chapters: Chapter[]
  setChapters: (chapters: Chapter[]) => void
  addChapter: (chapter: Chapter) => void
  updateChapter: (chapterNumber: number, updates: Partial<Chapter>) => void
  removeChapter: (chapterNumber: number) => void
  generationJobs: ChapterGenerationJob[]
  setGenerationJobs: (jobs: ChapterGenerationJob[]) => void
  updateGenerationJob: (chapterNumber: number, updates: Partial<ChapterGenerationJob>) => void

  // Message state
  messages: Message[]
  addMessage: (message: Message) => void

  // Generation state
  isGenerating: boolean
  setGenerating: (value: boolean) => void
  progress: number
  setProgress: (value: number) => void

  // Cost tracking
  totalCost: number
  incrementCost: (amount: number) => void
}

export const useStore = create<AppState>((set) => ({
  // User state
  user: null,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  isAuthenticated: false,

  // Usage tracking
  usage: null,
  setUsage: (usage) => set({ usage }),
  bookEstimate: null,
  setBookEstimate: (estimate) => set({ bookEstimate: estimate }),

  // Project state
  projects: [],
  setProjects: (projects) => set({ projects }),
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  updateProject: (id, updates) => set((state) => ({
    projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    currentProject: state.currentProject?.id === id
      ? { ...state.currentProject, ...updates }
      : state.currentProject,
  })),
  removeProject: (id) => set((state) => ({
    projects: state.projects.filter((p) => p.id !== id),
    currentProject: state.currentProject?.id === id ? null : state.currentProject,
  })),

  // Chapter state
  chapters: [],
  setChapters: (chapters) => set({ chapters }),
  addChapter: (chapter) => set((state) => ({ chapters: [...state.chapters, chapter] })),
  updateChapter: (chapterNumber, updates) => set((state) => ({
    chapters: state.chapters.map((c) =>
      c.chapter_number === chapterNumber ? { ...c, ...updates } : c
    ),
  })),
  removeChapter: (chapterNumber) => set((state) => ({
    chapters: state.chapters.filter((c) => c.chapter_number !== chapterNumber),
  })),
  generationJobs: [],
  setGenerationJobs: (jobs) => set({ generationJobs: jobs }),
  updateGenerationJob: (chapterNumber, updates) => set((state) => ({
    generationJobs: state.generationJobs.map((j) =>
      j.chapter_number === chapterNumber ? { ...j, ...updates } : j
    ),
  })),

  // Message state
  messages: [],
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  // Generation state
  isGenerating: false,
  setGenerating: (value) => set({ isGenerating: value }),
  progress: 0,
  setProgress: (value) => set({ progress: value }),

  // Cost tracking
  totalCost: 0,
  incrementCost: (amount) => set((state) => ({ totalCost: state.totalCost + amount })),
}))

