'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/zustand'
import type { AppState, User, Project } from '@/lib/zustand'
import {
  BookOpen,
  LogOut,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  Palette,
  Layout,
  Settings,
} from 'lucide-react'

// Wizard step types
type WizardStep = 'basic' | 'style' | 'structure' | 'advanced'

interface FormData {
  // Step 1: Basic Info
  name: string
  description: string
  genre: string
  target_audience: string
  // Step 2: Style Settings
  tone: string
  pov: string
  tense: string
  dialogue_style: string
  prose_style: string
  // Step 3: Structure
  target_chapters: number
  chapter_length_target: number
  // Step 4: Advanced (optional)
  character_bible: string
  world_building: string
  style_guide: string
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
  'Middle Grade',
  'Non-Fiction',
  'Biography',
  'Self-Help',
  'Other',
]

const TONES = [
  { value: 'humorous', label: 'Humorous' },
  { value: 'serious', label: 'Serious' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'lighthearted', label: 'Lighthearted' },
  { value: 'dark', label: 'Dark' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'suspenseful', label: 'Suspenseful' },
  { value: 'romantic', label: 'Romantic' },
]

const POV_OPTIONS = [
  { value: 'first_person', label: 'First Person' },
  { value: 'third_person_limited', label: 'Third Person Limited' },
  { value: 'third_person_omniscient', label: 'Third Person Omniscient' },
  { value: 'second_person', label: 'Second Person' },
]

const TENSE_OPTIONS = [
  { value: 'past', label: 'Past Tense' },
  { value: 'present', label: 'Present Tense' },
]

const DIALOGUE_STYLES = [
  { value: 'sparse', label: 'Sparse - Minimal dialogue' },
  { value: 'moderate', label: 'Moderate - Balanced dialogue' },
  { value: 'heavy', label: 'Heavy - Dialogue-driven' },
]

const PROSE_STYLES = [
  { value: 'minimal', label: 'Minimal - Clean, direct prose' },
  { value: 'descriptive', label: 'Descriptive - Rich descriptions' },
  { value: 'literary', label: 'Literary - Stylized, artistic' },
]

const STEPS: { id: WizardStep; title: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'basic',
    title: 'Basic Info',
    description: 'Title, genre, and audience',
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    id: 'style',
    title: 'Style',
    description: 'Tone, POV, and voice',
    icon: <Palette className="h-5 w-5" />,
  },
  {
    id: 'structure',
    title: 'Structure',
    description: 'Chapters and length',
    icon: <Layout className="h-5 w-5" />,
  },
  {
    id: 'advanced',
    title: 'Advanced',
    description: 'Optional extras',
    icon: <Settings className="h-5 w-5" />,
  },
]

const initialFormData: FormData = {
  name: '',
  description: '',
  genre: '',
  target_audience: 'general adult',
  tone: 'serious',
  pov: 'third_person_limited',
  tense: 'past',
  dialogue_style: 'moderate',
  prose_style: 'descriptive',
  target_chapters: 12,
  chapter_length_target: 3000,
  character_bible: '',
  world_building: '',
  style_guide: '',
}

export default function NewProjectPage() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('basic')
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
      [name]: name === 'target_chapters' || name === 'chapter_length_target'
        ? parseInt(value) || 0
        : value,
    }))
    // Clear error when field is modified
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const validateStep = (step: WizardStep): boolean => {
    const newErrors: FormErrors = {}

    switch (step) {
      case 'basic':
        if (!formData.name.trim()) {
          newErrors.name = 'Project name is required'
        } else if (formData.name.length < 3) {
          newErrors.name = 'Project name must be at least 3 characters'
        } else if (formData.name.length > 100) {
          newErrors.name = 'Project name must be less than 100 characters'
        }
        if (!formData.genre) {
          newErrors.genre = 'Please select a genre'
        }
        break
      case 'structure':
        if (formData.target_chapters < 1) {
          newErrors.target_chapters = 'Must have at least 1 chapter'
        } else if (formData.target_chapters > 100) {
          newErrors.target_chapters = 'Maximum 100 chapters allowed'
        }
        if (formData.chapter_length_target < 500) {
          newErrors.chapter_length_target = 'Chapter length must be at least 500 words'
        } else if (formData.chapter_length_target > 10000) {
          newErrors.chapter_length_target = 'Chapter length must be less than 10,000 words'
        }
        break
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const getCurrentStepIndex = (): number => {
    return STEPS.findIndex((s) => s.id === currentStep)
  }

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return

    const currentIndex = getCurrentStepIndex()
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id)
    }
  }

  const goToPreviousStep = () => {
    const currentIndex = getCurrentStepIndex()
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id)
    }
  }

  const handleSubmit = async () => {
    // Validate all required steps
    if (!validateStep('basic') || !validateStep('structure')) {
      setSubmitError('Please fix the errors before submitting')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Build settings object
      const settings: Record<string, unknown> = {
        target_audience: formData.target_audience,
        tone: formData.tone,
        pov: formData.pov,
        tense: formData.tense,
        dialogue_style: formData.dialogue_style,
        prose_style: formData.prose_style,
        chapter_length_target: formData.chapter_length_target,
      }

      // Add optional fields if provided
      if (formData.character_bible.trim()) {
        settings.character_bible_text = formData.character_bible
      }
      if (formData.world_building.trim()) {
        settings.world_building_text = formData.world_building
      }

      const projectPayload = {
        name: formData.name,
        description: formData.description || undefined,
        genre: formData.genre,
        target_chapters: formData.target_chapters,
        style_guide: formData.style_guide || undefined,
        settings,
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

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, index) => {
        const isActive = step.id === currentStep
        const isCompleted = getCurrentStepIndex() > index
        const isPast = index < getCurrentStepIndex()

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => isPast && setCurrentStep(step.id)}
              disabled={!isPast}
              className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-indigo to-teal text-snow'
                  : isCompleted
                  ? 'bg-teal text-snow'
                  : 'bg-slate/20 text-slate'
              } ${isPast ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
            >
              {isCompleted ? <Check className="h-5 w-5" /> : step.icon}
            </button>
            <div className="hidden sm:block ml-2 mr-4">
              <p className={`text-sm font-medium ${isActive ? 'text-ink' : 'text-slate'}`}>
                {step.title}
              </p>
              <p className="text-xs text-slate/70">{step.description}</p>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`w-8 sm:w-12 h-1 mx-2 rounded ${
                  isPast ? 'bg-teal' : 'bg-slate/20'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )

  const renderBasicStep = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Project Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          className={`w-full px-4 py-3 border rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent ${
            errors.name ? 'border-red-500' : 'border-slate/30'
          }`}
          placeholder="Enter your book title"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.name}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Description
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={3}
          className="w-full px-4 py-3 border border-slate/30 rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
          placeholder="A brief description of your book (optional)"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Genre <span className="text-red-500">*</span>
        </label>
        <select
          name="genre"
          value={formData.genre}
          onChange={handleInputChange}
          className={`w-full px-4 py-3 border rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent ${
            errors.genre ? 'border-red-500' : 'border-slate/30'
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
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.genre}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Target Audience
        </label>
        <input
          type="text"
          name="target_audience"
          value={formData.target_audience}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-slate/30 rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent"
          placeholder="e.g., Young adults, General adult, Children 8-12"
        />
      </div>
    </div>
  )

  const renderStyleStep = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2 text-slate">Tone</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TONES.map((tone) => (
            <button
              key={tone.value}
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, tone: tone.value }))}
              className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                formData.tone === tone.value
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-slate/30 hover:border-slate/50'
              }`}
            >
              {tone.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Point of View
        </label>
        <div className="grid grid-cols-2 gap-3">
          {POV_OPTIONS.map((pov) => (
            <button
              key={pov.value}
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, pov: pov.value }))}
              className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                formData.pov === pov.value
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-slate/30 hover:border-slate/50'
              }`}
            >
              {pov.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">Tense</label>
        <div className="grid grid-cols-2 gap-3">
          {TENSE_OPTIONS.map((tense) => (
            <button
              key={tense.value}
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, tense: tense.value }))}
              className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                formData.tense === tense.value
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-slate/30 hover:border-slate/50'
              }`}
            >
              {tense.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Dialogue Style
        </label>
        <select
          name="dialogue_style"
          value={formData.dialogue_style}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-slate/30 rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent"
        >
          {DIALOGUE_STYLES.map((style) => (
            <option key={style.value} value={style.value}>
              {style.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Prose Style
        </label>
        <select
          name="prose_style"
          value={formData.prose_style}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-slate/30 rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent"
        >
          {PROSE_STYLES.map((style) => (
            <option key={style.value} value={style.value}>
              {style.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderStructureStep = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Number of Chapters <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="target_chapters"
          value={formData.target_chapters}
          onChange={handleInputChange}
          min={1}
          max={100}
          className={`w-full px-4 py-3 border rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent ${
            errors.target_chapters ? 'border-red-500' : 'border-slate/30'
          }`}
        />
        {errors.target_chapters && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.target_chapters}
          </p>
        )}
        <p className="mt-1 text-xs text-slate/70">
          Recommended: 10-20 chapters for a standard novel
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Target Chapter Length (words) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="chapter_length_target"
          value={formData.chapter_length_target}
          onChange={handleInputChange}
          min={500}
          max={10000}
          step={100}
          className={`w-full px-4 py-3 border rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent ${
            errors.chapter_length_target ? 'border-red-500' : 'border-slate/30'
          }`}
        />
        {errors.chapter_length_target && (
          <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {errors.chapter_length_target}
          </p>
        )}
        <p className="mt-1 text-xs text-slate/70">
          Recommended: 2,000-4,000 words per chapter
        </p>
      </div>

      <div className="bg-parchment rounded-lg p-4 border border-slate/20">
        <h4 className="font-medium text-ink mb-2">Estimated Book Length</h4>
        <p className="text-2xl font-bold text-teal">
          {(formData.target_chapters * formData.chapter_length_target).toLocaleString()} words
        </p>
        <p className="text-sm text-slate/70 mt-1">
          Approximately {Math.ceil((formData.target_chapters * formData.chapter_length_target) / 250)} pages
        </p>
      </div>
    </div>
  )

  const renderAdvancedStep = () => (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-amber-800">
          These fields are optional but can help the AI create more consistent and detailed content.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Character Bible
        </label>
        <textarea
          name="character_bible"
          value={formData.character_bible}
          onChange={handleInputChange}
          rows={5}
          className="w-full px-4 py-3 border border-slate/30 rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
          placeholder="Describe your main characters: names, appearances, personalities, backgrounds, relationships..."
        />
        <p className="mt-1 text-xs text-slate/70">
          Include details about protagonists, antagonists, and supporting characters
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          World Building
        </label>
        <textarea
          name="world_building"
          value={formData.world_building}
          onChange={handleInputChange}
          rows={5}
          className="w-full px-4 py-3 border border-slate/30 rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
          placeholder="Describe your story's setting: locations, time period, cultures, magic systems, technology..."
        />
        <p className="mt-1 text-xs text-slate/70">
          Especially useful for fantasy, sci-fi, and historical fiction
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-slate">
          Style Guide
        </label>
        <textarea
          name="style_guide"
          value={formData.style_guide}
          onChange={handleInputChange}
          rows={4}
          className="w-full px-4 py-3 border border-slate/30 rounded-lg bg-parchment focus:ring-2 focus:ring-teal focus:border-transparent resize-none"
          placeholder="Any specific writing rules, vocabulary preferences, or stylistic guidelines..."
        />
        <p className="mt-1 text-xs text-slate/70">
          E.g., &quot;Avoid passive voice&quot;, &quot;Use British English spelling&quot;, &quot;Short, punchy sentences&quot;
        </p>
      </div>
    </div>
  )

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'basic':
        return renderBasicStep()
      case 'style':
        return renderStyleStep()
      case 'structure':
        return renderStructureStep()
      case 'advanced':
        return renderAdvancedStep()
    }
  }

  const isLastStep = getCurrentStepIndex() === STEPS.length - 1
  const isFirstStep = getCurrentStepIndex() === 0

  return (
    <div className="flex min-h-screen flex-col bg-parchment dark:bg-indigo">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate bg-indigo text-snow">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-gold" />
            <h1 className="text-2xl font-serif font-bold">sopher.ai</h1>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name || user.email}
                      className="h-8 w-8 rounded-full border border-gold"
                    />
                  ) : (
                    <UserIcon className="h-5 w-5 text-gold" />
                  )}
                  <span className="hidden sm:inline">{user.name || user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 hover:bg-indigo-700 rounded-lg transition-colors"
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
          className="flex items-center gap-1 text-slate hover:text-ink mb-6 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Projects
        </button>

        {/* Page Title */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif font-bold text-ink">Create New Project</h2>
          <p className="text-slate mt-2">Set up your book&apos;s foundation</p>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Form Card */}
        <div className="bg-snow rounded-xl shadow-sm p-6 sm:p-8">
          {/* Error Message */}
          {submitError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{submitError}</p>
            </div>
          )}

          {/* Step Content */}
          {renderCurrentStep()}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate/10">
            <button
              onClick={goToPreviousStep}
              disabled={isFirstStep}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isFirstStep
                  ? 'opacity-50 cursor-not-allowed text-slate'
                  : 'text-slate hover:bg-slate/10'
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>

            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-indigo to-teal text-snow rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Project
                    <Check className="h-4 w-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={goToNextStep}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-indigo to-teal text-snow rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-indigo text-snow text-center text-sm py-4">
        © 2025 sopher.ai •{' '}
        <a
          href="https://github.com/cheesejaguar/sopher.ai/blob/main/LICENSE"
          className="underline"
        >
          MIT License
        </a>{' '}
        •{' '}
        <a
          href="https://github.com/cheesejaguar/sopher.ai"
          className="underline"
        >
          GitHub Repository
        </a>
      </footer>
    </div>
  )
}
