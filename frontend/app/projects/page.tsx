'use client'

import { useState, useEffect, useCallback } from 'react'
import { useStore } from '@/lib/zustand'
import type { Project, AppState, User } from '@/lib/zustand'
import { MeshGradient } from '@/components/BackgroundEffects'
import {
  BookOpen,
  Plus,
  Loader2,
  LogOut,
  User as UserIcon,
  Grid3X3,
  List,
  Search,
  Clock,
  ChevronRight,
  BookMarked,
  Edit,
  CheckCircle
} from 'lucide-react'

type ViewMode = 'grid' | 'list'

interface ProjectListResponse {
  projects: Project[]
  total: number
  page: number
  page_size: number
}

function getStatusColor(status: Project['status']): string {
  switch (status) {
    case 'draft':
      return 'bg-slate/20 text-mist border border-slate/30'
    case 'in_progress':
      return 'bg-aurora-teal/20 text-aurora-teal border border-aurora-teal/30'
    case 'completed':
      return 'bg-ember/20 text-ember border border-ember/30'
    default:
      return 'bg-slate/20 text-mist border border-slate/30'
  }
}

function getStatusIcon(status: Project['status']) {
  switch (status) {
    case 'draft':
      return <Edit className="h-3 w-3" />
    case 'in_progress':
      return <Clock className="h-3 w-3" />
    case 'completed':
      return <CheckCircle className="h-3 w-3" />
    default:
      return <Edit className="h-3 w-3" />
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export default function ProjectsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProjects, setTotalProjects] = useState(0)

  const user = useStore((state: AppState) => state.user)
  const setUser = useStore((state: AppState) => state.setUser)
  const projects = useStore((state: AppState) => state.projects)
  const setProjects = useStore((state: AppState) => state.setProjects)

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: '12',
      })

      if (statusFilter) {
        params.append('status', statusFilter)
      }

      const response = await fetch(`/api/backend/v1/projects?${params}`, {
        credentials: 'include',
      })

      if (response.ok) {
        const data: ProjectListResponse = await response.json()
        setProjects(data.projects)
        setTotalPages(Math.ceil(data.total / data.page_size) || 1)
        setTotalProjects(data.total)
      } else if (response.status === 401) {
        window.location.href = '/login'
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.detail || 'Failed to load projects')
      }
    } catch (err) {
      setError('Network error. Please try again.')
      console.error('Error fetching projects:', err)
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, statusFilter, setProjects])

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

  useEffect(() => {
    if (user) {
      fetchProjects()
    }
  }, [user, fetchProjects])

  const handleLogout = async () => {
    await fetch('/api/backend/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
    window.location.href = '/login'
  }

  const handleCreateProject = () => {
    window.location.href = '/projects/new'
  }

  const handleProjectClick = (projectId: string) => {
    window.location.href = `/projects/${projectId}`
  }

  const filteredProjects = projects.filter(project => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query) ||
      project.genre?.toLowerCase().includes(query)
    )
  })

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
      <main className="container mx-auto flex-1 px-4 py-8">
        {/* Page Title and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-cream">My Projects</h2>
            <p className="text-mist mt-1">
              {totalProjects} {totalProjects === 1 ? 'project' : 'projects'}
            </p>
          </div>

          <button
            onClick={handleCreateProject}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-primary text-cream rounded-lg font-medium hover:opacity-90 hover:shadow-glow-md transition-all duration-300"
          >
            <Plus className="h-5 w-5" />
            New Project
          </button>
        </div>

        {/* Filters and Search */}
        <div className="glass rounded-xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fog" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-graphite rounded-lg bg-charcoal text-cream placeholder-fog focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue transition-all"
              />
            </div>

            <div className="flex items-center gap-4">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border border-graphite rounded-lg bg-charcoal text-cream focus:ring-2 focus:ring-nebula-blue/50 focus:border-nebula-blue transition-all"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>

              {/* View Toggle */}
              <div className="flex items-center gap-1 bg-charcoal rounded-lg p-1 border border-graphite">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'grid' ? 'bg-nebula-blue text-cream shadow-glow-sm' : 'text-fog hover:text-cream hover:bg-charcoal-light'
                  }`}
                  title="Grid view"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-all ${
                    viewMode === 'list' ? 'bg-nebula-blue text-cream shadow-glow-sm' : 'text-fog hover:text-cream hover:bg-charcoal-light'
                  }`}
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
            <button
              onClick={fetchProjects}
              className="mt-2 text-sm text-red-400 underline hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-aurora-teal" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredProjects.length === 0 && (
          <div className="text-center py-16">
            <BookMarked className="h-16 w-16 text-graphite mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-cream mb-2">
              {searchQuery || statusFilter ? 'No projects found' : 'No projects yet'}
            </h3>
            <p className="text-mist mb-6">
              {searchQuery || statusFilter
                ? 'Try adjusting your filters'
                : 'Create your first project to get started'}
            </p>
            {!searchQuery && !statusFilter && (
              <button
                onClick={handleCreateProject}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-primary text-cream rounded-lg font-medium hover:opacity-90 hover:shadow-glow-md transition-all duration-300"
              >
                <Plus className="h-5 w-5" />
                Create Your First Project
              </button>
            )}
          </div>
        )}

        {/* Grid View */}
        {!isLoading && filteredProjects.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleProjectClick(project.id)}
                className="glass rounded-xl cursor-pointer overflow-hidden group hover:border-nebula-blue/50 hover:shadow-inner-glow transition-all duration-300"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-cream group-hover:text-aurora-teal transition-colors line-clamp-2">
                      {project.name}
                    </h3>
                    <ChevronRight className="h-5 w-5 text-graphite group-hover:text-aurora-teal transition-colors flex-shrink-0" />
                  </div>

                  {project.genre && (
                    <p className="text-sm text-mist mb-2">{project.genre}</p>
                  )}

                  {project.description && (
                    <p className="text-sm text-fog mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-graphite">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                      {getStatusIcon(project.status)}
                      {project.status.replace('_', ' ')}
                    </span>

                    <span className="text-xs text-fog">
                      {project.target_chapters} chapters
                    </span>
                  </div>

                  <p className="text-xs text-fog mt-3">
                    Created {formatDate(project.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List View */}
        {!isLoading && filteredProjects.length > 0 && viewMode === 'list' && (
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-charcoal border-b border-graphite">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-mist">Project</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-mist hidden sm:table-cell">Genre</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-mist hidden md:table-cell">Chapters</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-mist">Status</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-mist hidden lg:table-cell">Created</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite">
                {filteredProjects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => handleProjectClick(project.id)}
                    className="hover:bg-charcoal-light cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-cream">{project.name}</p>
                        {project.description && (
                          <p className="text-sm text-fog line-clamp-1 mt-1">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-mist hidden sm:table-cell">
                      {project.genre || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-mist hidden md:table-cell">
                      {project.target_chapters}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                        {getStatusIcon(project.status)}
                        {project.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-fog hidden lg:table-cell">
                      {formatDate(project.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <ChevronRight className="h-5 w-5 text-graphite" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 rounded-lg border border-graphite text-sm text-cream disabled:opacity-50 disabled:cursor-not-allowed hover:bg-charcoal-light hover:border-nebula-blue/50 transition-all"
            >
              Previous
            </button>

            <span className="px-4 py-2 text-sm text-mist">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 rounded-lg border border-graphite text-sm text-cream disabled:opacity-50 disabled:cursor-not-allowed hover:bg-charcoal-light hover:border-nebula-blue/50 transition-all"
            >
              Next
            </button>
          </div>
        )}
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
