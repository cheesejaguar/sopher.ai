'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/zustand'
import type { AppState, User, Project } from '@/lib/zustand'
import { MeshGradient } from '@/components/BackgroundEffects'
import {
  BookOpen,
  LogOut,
  User as UserIcon,
  ChevronLeft,
  AlertCircle,
  Loader2,
  Sparkles,
  Cpu,
  Check,
} from 'lucide-react'

interface FormData {
  name: string
  brief: string
  genre: string
  target_chapters: number
  model: string
}

interface FormErrors {
  [key: string]: string
}

const GENRES = [
  'Fantasy',
  'Science Fiction',
  'Mystery',
  'Thriller',
  'Romance',
  'Historical Fiction',
  'Literary Fiction',
  'Horror',
  'Young Adult',
  'Non-Fiction',
  'Biography',
  'Self-Help',
  'Other',
]

const MODELS = [
  {
    id: 'openrouter/openai/chatgpt-5.2',
    name: 'ChatGPT 5.2',
    provider: 'OpenAI',
    description: 'Most capable, best for complex narratives',
    tier: 'premium',
  },
  {
    id: 'openrouter/anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    description: 'Excellent writing quality, nuanced prose',
    tier: 'premium',
  },
  {
    id: 'openrouter/google/gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'Google',
    description: 'Fast and cost-effective',
    tier: 'standard',
  },
  {
    id: 'openrouter/x-ai/grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    provider: 'xAI',
    description: 'Quick generation, good quality',
    tier: 'standard',
  },
  {
    id: 'openrouter/deepseek/deepseek-v3.2',
    name: 'DeepSeek V3.2',
    provider: 'DeepSeek',
    description: 'Most affordable option',
    tier: 'economy',
  },
]

const initialFormData: FormData = {
  name: '',
  brief: '',
  genre: '',
  target_chapters: 12,
  model: 'openrouter/openai/chatgpt-5.2',
}

export default function NewProjectPage() {
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const user = useStore((state: AppState) => state.user)
  const setUser = useStore((state: AppState) => state.setUser)
  const addProject = useStore((state: AppState) => state.addProject)

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userResponse = await fetch('/api/backend/auth/me', {
          credentials: 'include',
        })

        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData as User)
        } else if (userResponse.status === 401) {
          window.location.href = '/login'
        }
      } catch (error) {
        console.error('Failed to fetch user:', error)
      }
    }

    fetchUserData()
  }, [setUser])

  const handleLogout = async () => {
    await fetch('/api/backend/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    window.location.href = '/login'
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'target_chapters' ? parseInt(value) || 0 : value,
    }))
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required'
    } else if (formData.name.length < 3) {
      newErrors.name = 'Project name must be at least 3 characters'
    }

    if (!formData.brief.trim()) {
      newErrors.brief = 'Please describe your book idea'
    } else if (formData.brief.length < 50) {
      newErrors.brief = 'Please provide more detail (at least 50 characters)'
    }

    if (!formData.genre) {
      newErrors.genre = 'Please select a genre'
    }

    if (formData.target_chapters < 1 || formData.target_chapters > 50) {
      newErrors.target_chapters = 'Chapters must be between 1 and 50'
    }

    if (!formData.model) {
      newErrors.model = 'Please select a model'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const projectPayload = {
        name: formData.name,
        brief: formData.brief,
        genre: formData.genre,
        target_chapters: formData.target_chapters,
        settings: {
          model: formData.model,
        },
      }

      const response = await fetch('/api/backend/v1/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(projectPayload),
      })

      if (response.ok) {
        const newProject: Project = await response.json()
        addProject(newProject)
        window.location.href = `/projects/${newProject.id}`
      } else if (response.status === 401) {
        window.location.href = '/login'
      } else {
        const errorData = await response.json().catch(() => ({}))
        setSubmitError(errorData.detail || 'Failed to create project')
      }
    } catch (error) {
      console.error('Error creating project:', error)
      setSubmitError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-charcoal">
      <MeshGradient />

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-graphite bg-charcoal/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-aurora-teal" />
            <h1 className="text-2xl font-bold gradient-text">sopher.ai</h1>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || user.email}
                      className="h-8 w-8 rounded-full border border-aurora-teal/50"
                    />
                  ) : (
                    <UserIcon className="h-5 w-5 text-aurora-teal" />
                  )}
                  <span className="hidden sm:inline text-cream">{user.name || user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-charcoal-light rounded-lg transition-colors text-mist hover:text-cream"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto flex-1 px-4 py-8 max-w-3xl">
        {/* Back to Projects Link */}
        <button
          onClick={() => (window.location.href = '/projects')}
          className="flex items-center gap-1 text-mist hover:text-cream mb-6 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>

        {/* Page Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-nebula-blue/10 glow-sm">
              <Sparkles className="h-8 w-8 text-aurora-teal" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-cream">Start a New Book</h2>
          <p className="text-mist mt-2">Describe your book idea and select an AI model</p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="glass rounded-xl p-6 sm:p-8">
          {/* Error Message */}
          {submitError && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{submitError}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium mb-2 text-mist">
                Book Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg bg-charcoal text-cream placeholder-fog focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue transition-all ${
                  errors.name ? 'border-red-500' : 'border-graphite'
                }`}
                placeholder="Enter your book title"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.name}
                </p>
              )}
            </div>

            {/* Book Brief */}
            <div>
              <label className="block text-sm font-medium mb-2 text-mist">
                Describe Your Book <span className="text-red-400">*</span>
              </label>
              <textarea
                name="brief"
                value={formData.brief}
                onChange={handleInputChange}
                rows={6}
                className={`w-full px-4 py-3 border rounded-lg bg-charcoal text-cream placeholder-fog focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue transition-all resize-none ${
                  errors.brief ? 'border-red-500' : 'border-graphite'
                }`}
                placeholder="Describe your book idea in detail. Include the main plot, characters, setting, themes, and any specific elements you want. The more detail you provide, the better the AI can help you write your book."
              />
              {errors.brief && (
                <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.brief}
                </p>
              )}
              <p className="mt-1 text-xs text-fog">
                {formData.brief.length} characters
              </p>
            </div>

            {/* Genre and Chapters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-mist">
                  Genre <span className="text-red-400">*</span>
                </label>
                <select
                  name="genre"
                  value={formData.genre}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border rounded-lg bg-charcoal text-cream focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue transition-all ${
                    errors.genre ? 'border-red-500' : 'border-graphite'
                  }`}
                >
                  <option value="">Select a genre</option>
                  {GENRES.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
                {errors.genre && (
                  <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {errors.genre}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-mist">
                  Target Chapters
                </label>
                <input
                  type="number"
                  name="target_chapters"
                  value={formData.target_chapters}
                  onChange={handleInputChange}
                  min={1}
                  max={50}
                  className={`w-full px-4 py-3 border rounded-lg bg-charcoal text-cream focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue transition-all ${
                    errors.target_chapters ? 'border-red-500' : 'border-graphite'
                  }`}
                />
                {errors.target_chapters && (
                  <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {errors.target_chapters}
                  </p>
                )}
              </div>
            </div>

            {/* Model Selection */}
            <div>
              <label className="block text-sm font-medium mb-3 text-mist">
                <Cpu className="h-4 w-4 inline mr-1" />
                Select AI Model <span className="text-red-400">*</span>
              </label>
              <div className="grid gap-3">
                {MODELS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, model: model.id }))}
                    className={`w-full p-4 rounded-lg border text-left transition-all ${
                      formData.model === model.id
                        ? 'border-aurora-teal bg-aurora-teal/10 shadow-inner-glow'
                        : 'border-graphite hover:border-nebula-blue/50 hover:bg-charcoal-light'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-cream">{model.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            model.tier === 'premium'
                              ? 'bg-nebula-purple/20 text-nebula-purple border border-nebula-purple/30'
                              : model.tier === 'economy'
                              ? 'bg-aurora-teal/20 text-aurora-teal border border-aurora-teal/30'
                              : 'bg-slate/20 text-mist border border-slate/30'
                          }`}>
                            {model.tier}
                          </span>
                        </div>
                        <p className="text-xs text-fog mt-1">{model.provider}</p>
                        <p className="text-sm text-mist mt-1">{model.description}</p>
                      </div>
                      {formData.model === model.id && (
                        <Check className="h-5 w-5 text-aurora-teal flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {errors.model && (
                <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {errors.model}
                </p>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-8 pt-6 border-t border-graphite">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 text-cream rounded-lg font-medium bg-gradient-to-r from-nebula-blue via-nebula-purple to-aurora-teal hover:shadow-glow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-300 hover:scale-[1.02]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating Project...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  Create Project
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="bg-void border-t border-graphite text-center text-sm py-4">
        <span className="text-fog">
          © 2025 sopher.ai •{' '}
          <a
            href="https://github.com/cheesejaguar/sopher.ai/blob/main/LICENSE"
            className="text-mist hover:text-aurora-teal transition-colors"
          >
            MIT License
          </a>{' '}
          •{' '}
          <a
            href="https://github.com/cheesejaguar/sopher.ai"
            className="text-mist hover:text-aurora-teal transition-colors"
          >
            GitHub Repository
          </a>
        </span>
      </footer>
    </div>
  )
}
