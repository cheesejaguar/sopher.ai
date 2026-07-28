'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  X,
  Menu,
  BookText,
  FileText,
  User,
  Quote,
  Heart,
  Award,
} from 'lucide-react'

// Types
interface ChapterData {
  number: number
  title: string
  content: string
  word_count: number
}

interface ManuscriptData {
  title: string
  author: string | null
  chapters: ChapterData[]
  title_page?: {
    title: string
    subtitle?: string
    author_name?: string
    publisher?: string
    edition?: string
  }
  copyright_page?: {
    author_name: string
    year: number
    rights_statement: string
    isbn?: string
    publisher?: string
  }
  dedication?: {
    text: string
  }
  epigraph?: {
    text: string
    attribution?: string
    source?: string
  }
  acknowledgments?: string
  table_of_contents?: Array<{
    title: string
    chapter_number?: number
    level: number
  }>
  author_bio?: {
    text: string
    website?: string
    social_media?: Record<string, string>
  }
  also_by?: {
    author_name: string
    titles: string[]
    series_info?: Record<string, string[]>
  }
  excerpt?: {
    book_title: string
    text: string
    chapter_title?: string
    coming_soon_date?: string
  }
  total_words: number
}

interface ManuscriptPreviewProps {
  projectId: string
  manuscript: ManuscriptData
  onBack?: () => void
  initialSection?: 'front' | 'chapter' | 'back'
  initialChapter?: number
}

// Constants
const WORDS_PER_MINUTE = 250
const WORDS_PER_PAGE = 250

// Section types for navigation
type SectionType =
  | 'title_page'
  | 'copyright'
  | 'dedication'
  | 'epigraph'
  | 'acknowledgments'
  | 'toc'
  | 'chapter'
  | 'author_bio'
  | 'also_by'
  | 'excerpt'

interface NavigationSection {
  type: SectionType
  title: string
  chapterNumber?: number
  icon: React.ReactNode
}

// Helper functions
function formatReadingTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes === 0) {
    return `${hours} hr`
  }
  return `${hours} hr ${remainingMinutes} min`
}

function calculateReadingTime(wordCount: number): number {
  return Math.ceil(wordCount / WORDS_PER_MINUTE)
}

function calculatePages(wordCount: number): number {
  return Math.ceil(wordCount / WORDS_PER_PAGE)
}

// Render formatted content with basic markdown
function renderContent(content: string): React.ReactNode {
  // Split into paragraphs
  const paragraphs = content.split(/\n\n+/)

  return paragraphs.map((paragraph, index) => {
    // Check for scene breaks
    if (paragraph.trim().match(/^(\* \* \*|# # #|~ ~ ~|---|\*\*\*)$/)) {
      return (
        <div key={index} className="text-center text-fog my-8" data-testid="scene-break">
          * * *
        </div>
      )
    }

    // Process inline formatting (basic italic/bold)
    const processedText = paragraph
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')

    return (
      <p
        key={index}
        className="mb-4 leading-relaxed text-mist indent-8 first:indent-0"
        dangerouslySetInnerHTML={{ __html: processedText }}
      />
    )
  })
}

// Section header component
function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="text-center mb-12" data-testid="section-header">
      {icon && <div className="flex justify-center mb-4">{icon}</div>}
      <h2 className="text-3xl font-bold text-cream mb-2">{title}</h2>
      {subtitle && <p className="text-lg text-mist">{subtitle}</p>}
    </div>
  )
}

// Get initial section type based on available content
function getInitialSection(manuscript: ManuscriptData, initialSection: 'front' | 'chapter' | 'back'): SectionType {
  if (initialSection === 'chapter') {
    return 'chapter'
  }
  // If front, find the first available front matter section
  if (manuscript.title_page) return 'title_page'
  if (manuscript.copyright_page) return 'copyright'
  if (manuscript.dedication) return 'dedication'
  if (manuscript.epigraph) return 'epigraph'
  if (manuscript.acknowledgments) return 'acknowledgments'
  if (manuscript.table_of_contents && manuscript.table_of_contents.length > 0) return 'toc'
  // Default to chapter if no front matter
  return 'chapter'
}

// Main component
export default function ManuscriptPreview({
  projectId,
  manuscript,
  onBack,
  initialSection = 'front',
  initialChapter = 1,
}: ManuscriptPreviewProps) {
  const [currentSection, setCurrentSection] = useState<SectionType>(() =>
    getInitialSection(manuscript, initialSection)
  )
  const [currentChapterIndex, setCurrentChapterIndex] = useState(
    initialSection === 'chapter' ? initialChapter - 1 : 0
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Build navigation sections
  const navigationSections = useMemo<NavigationSection[]>(() => {
    const sections: NavigationSection[] = []

    // Front matter
    if (manuscript.title_page) {
      sections.push({
        type: 'title_page',
        title: 'Title Page',
        icon: <BookOpen className="h-4 w-4" />,
      })
    }
    if (manuscript.copyright_page) {
      sections.push({
        type: 'copyright',
        title: 'Copyright',
        icon: <FileText className="h-4 w-4" />,
      })
    }
    if (manuscript.dedication) {
      sections.push({
        type: 'dedication',
        title: 'Dedication',
        icon: <Heart className="h-4 w-4" />,
      })
    }
    if (manuscript.epigraph) {
      sections.push({
        type: 'epigraph',
        title: 'Epigraph',
        icon: <Quote className="h-4 w-4" />,
      })
    }
    if (manuscript.acknowledgments) {
      sections.push({
        type: 'acknowledgments',
        title: 'Acknowledgments',
        icon: <Award className="h-4 w-4" />,
      })
    }
    if (manuscript.table_of_contents && manuscript.table_of_contents.length > 0) {
      sections.push({
        type: 'toc',
        title: 'Table of Contents',
        icon: <List className="h-4 w-4" />,
      })
    }

    // Chapters
    manuscript.chapters.forEach((chapter) => {
      sections.push({
        type: 'chapter',
        title: `Chapter ${chapter.number}: ${chapter.title}`,
        chapterNumber: chapter.number,
        icon: <BookText className="h-4 w-4" />,
      })
    })

    // Back matter
    if (manuscript.author_bio) {
      sections.push({
        type: 'author_bio',
        title: 'About the Author',
        icon: <User className="h-4 w-4" />,
      })
    }
    if (manuscript.also_by) {
      sections.push({
        type: 'also_by',
        title: `Also by ${manuscript.also_by.author_name}`,
        icon: <BookOpen className="h-4 w-4" />,
      })
    }
    if (manuscript.excerpt) {
      sections.push({
        type: 'excerpt',
        title: `Preview: ${manuscript.excerpt.book_title}`,
        icon: <FileText className="h-4 w-4" />,
      })
    }

    return sections
  }, [manuscript])

  // Get current section index
  const currentSectionIndex = useMemo(() => {
    if (currentSection === 'chapter') {
      return navigationSections.findIndex(
        (s) => s.type === 'chapter' && s.chapterNumber === currentChapterIndex + 1
      )
    }
    return navigationSections.findIndex((s) => s.type === currentSection)
  }, [currentSection, currentChapterIndex, navigationSections])

  // Navigate to previous section
  const goToPrevious = useCallback(() => {
    if (currentSectionIndex > 0) {
      const prevSection = navigationSections[currentSectionIndex - 1]
      setCurrentSection(prevSection.type)
      if (prevSection.type === 'chapter' && prevSection.chapterNumber) {
        setCurrentChapterIndex(prevSection.chapterNumber - 1)
      }
    }
  }, [currentSectionIndex, navigationSections])

  // Navigate to next section
  const goToNext = useCallback(() => {
    if (currentSectionIndex < navigationSections.length - 1) {
      const nextSection = navigationSections[currentSectionIndex + 1]
      setCurrentSection(nextSection.type)
      if (nextSection.type === 'chapter' && nextSection.chapterNumber) {
        setCurrentChapterIndex(nextSection.chapterNumber - 1)
      }
    }
  }, [currentSectionIndex, navigationSections])

  // Navigate to specific section
  const goToSection = useCallback((section: NavigationSection) => {
    setCurrentSection(section.type)
    if (section.type === 'chapter' && section.chapterNumber) {
      setCurrentChapterIndex(section.chapterNumber - 1)
    }
    setSidebarOpen(false)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goToPrevious()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        goToNext()
      } else if (e.key === 'Escape') {
        setSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrevious, goToNext])

  // Current chapter data
  const currentChapter = manuscript.chapters[currentChapterIndex]

  // Reading progress
  const readingProgress = useMemo(() => {
    const totalSections = navigationSections.length
    const progress = ((currentSectionIndex + 1) / totalSections) * 100
    return Math.round(progress)
  }, [currentSectionIndex, navigationSections.length])

  // Render section content
  const renderSectionContent = () => {
    switch (currentSection) {
      case 'title_page':
        return manuscript.title_page ? (
          <div className="text-center" data-testid="title-page-content">
            <h1 className="text-5xl font-bold text-cream mb-4">
              {manuscript.title_page.title}
            </h1>
            {manuscript.title_page.subtitle && (
              <h2 className="text-2xl text-mist mb-8">{manuscript.title_page.subtitle}</h2>
            )}
            {manuscript.title_page.author_name && (
              <p className="text-xl text-cream mb-12">by {manuscript.title_page.author_name}</p>
            )}
            {manuscript.title_page.publisher && (
              <p className="text-fog mt-16">{manuscript.title_page.publisher}</p>
            )}
            {manuscript.title_page.edition && (
              <p className="text-sm text-fog">{manuscript.title_page.edition}</p>
            )}
          </div>
        ) : null

      case 'copyright':
        return manuscript.copyright_page ? (
          <div className="text-center text-sm text-fog space-y-4" data-testid="copyright-content">
            <p>
              Copyright {manuscript.copyright_page.year} {manuscript.copyright_page.author_name}
            </p>
            <p className="italic">{manuscript.copyright_page.rights_statement}</p>
            {manuscript.copyright_page.publisher && (
              <p>Published by {manuscript.copyright_page.publisher}</p>
            )}
            {manuscript.copyright_page.isbn && <p>ISBN: {manuscript.copyright_page.isbn}</p>}
            <p className="mt-8 italic">
              This is a work of fiction. Names, characters, places, and incidents either are the
              product of the author&apos;s imagination or are used fictitiously.
            </p>
          </div>
        ) : null

      case 'dedication':
        return manuscript.dedication ? (
          <div className="text-center" data-testid="dedication-content">
            <p className="text-xl italic text-cream">{manuscript.dedication.text}</p>
          </div>
        ) : null

      case 'epigraph':
        return manuscript.epigraph ? (
          <div className="text-center max-w-xl mx-auto" data-testid="epigraph-content">
            <blockquote className="text-lg italic text-cream border-l-4 border-aurora-teal pl-6 text-left">
              {manuscript.epigraph.text}
            </blockquote>
            {(manuscript.epigraph.attribution || manuscript.epigraph.source) && (
              <p className="text-fog mt-4 text-right">
                {manuscript.epigraph.attribution && <span>— {manuscript.epigraph.attribution}</span>}
                {manuscript.epigraph.source && (
                  <span className="italic">, {manuscript.epigraph.source}</span>
                )}
              </p>
            )}
          </div>
        ) : null

      case 'acknowledgments':
        return manuscript.acknowledgments ? (
          <div data-testid="acknowledgments-content">
            <SectionHeader title="Acknowledgments" />
            <div className="prose prose-invert max-w-none">
              {renderContent(manuscript.acknowledgments)}
            </div>
          </div>
        ) : null

      case 'toc':
        return manuscript.table_of_contents ? (
          <div data-testid="toc-content">
            <SectionHeader title="Table of Contents" />
            <ul className="space-y-2">
              {manuscript.table_of_contents.map((entry, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-graphite last:border-0"
                  style={{ paddingLeft: `${(entry.level - 1) * 1.5}rem` }}
                >
                  <span className="text-cream">
                    {entry.chapter_number !== undefined && entry.chapter_number !== null
                      ? `Chapter ${entry.chapter_number}: `
                      : ''}
                    {entry.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null

      case 'chapter':
        return currentChapter ? (
          <div data-testid="chapter-content">
            <SectionHeader
              title={`Chapter ${currentChapter.number}`}
              subtitle={currentChapter.title}
            />
            <div className="prose prose-invert max-w-none">
              {renderContent(currentChapter.content)}
            </div>
            <div className="mt-8 pt-4 border-t border-graphite flex justify-between text-sm text-fog">
              <span>{currentChapter.word_count.toLocaleString()} words</span>
              <span>{formatReadingTime(calculateReadingTime(currentChapter.word_count))} read</span>
            </div>
          </div>
        ) : null

      case 'author_bio':
        return manuscript.author_bio ? (
          <div data-testid="author-bio-content">
            <SectionHeader
              title="About the Author"
              icon={<User className="h-8 w-8 text-aurora-teal" />}
            />
            <div className="prose prose-invert max-w-none">
              {renderContent(manuscript.author_bio.text)}
            </div>
            {manuscript.author_bio.website && (
              <p className="mt-6 text-center">
                <a
                  href={manuscript.author_bio.website}
                  className="text-aurora-teal hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {manuscript.author_bio.website}
                </a>
              </p>
            )}
            {manuscript.author_bio.social_media && (
              <div className="mt-4 flex justify-center gap-4">
                {Object.entries(manuscript.author_bio.social_media).map(([platform, handle]) => (
                  <span key={platform} className="text-fog">
                    {platform}: {handle}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null

      case 'also_by':
        return manuscript.also_by ? (
          <div data-testid="also-by-content">
            <SectionHeader title={`Also by ${manuscript.also_by.author_name}`} />
            {manuscript.also_by.series_info &&
              Object.entries(manuscript.also_by.series_info).map(([series, titles]) => (
                <div key={series} className="mb-6">
                  <h3 className="text-lg font-semibold text-cream mb-2">{series} Series</h3>
                  <ul className="list-disc list-inside text-mist">
                    {titles.map((title) => (
                      <li key={title} className="italic">
                        {title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            {manuscript.also_by.titles.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-cream mb-2">Standalone Novels</h3>
                <ul className="list-disc list-inside text-mist">
                  {manuscript.also_by.titles.map((title) => (
                    <li key={title} className="italic">
                      {title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null

      case 'excerpt':
        return manuscript.excerpt ? (
          <div data-testid="excerpt-content">
            {manuscript.excerpt.coming_soon_date && (
              <p className="text-center text-ember mb-4">
                Coming {manuscript.excerpt.coming_soon_date}
              </p>
            )}
            <SectionHeader
              title={manuscript.excerpt.book_title}
              subtitle={manuscript.excerpt.chapter_title}
            />
            <div className="prose prose-invert max-w-none">
              {renderContent(manuscript.excerpt.text)}
            </div>
          </div>
        ) : null

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-charcoal" data-testid="manuscript-preview">
      {/* Header */}
      <header className="bg-charcoal-light border-b border-graphite sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Back & Menu */}
            <div className="flex items-center gap-4">
              {onBack ? (
                <button
                  onClick={onBack}
                  className="p-2 hover:bg-charcoal rounded-lg transition-colors"
                  data-testid="back-button"
                >
                  <ChevronLeft className="h-5 w-5 text-cream" />
                </button>
              ) : (
                <Link
                  href={`/projects/${projectId}/export`}
                  className="p-2 hover:bg-charcoal rounded-lg transition-colors"
                  data-testid="back-link"
                >
                  <ChevronLeft className="h-5 w-5 text-cream" />
                </Link>
              )}
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-charcoal rounded-lg transition-colors lg:hidden"
                data-testid="menu-button"
              >
                <Menu className="h-5 w-5 text-cream" />
              </button>
            </div>

            {/* Center: Title & Progress */}
            <div className="text-center">
              <h1 className="text-sm font-medium text-cream truncate max-w-[200px] sm:max-w-none">
                {manuscript.title}
              </h1>
              <div className="flex items-center justify-center gap-2 text-xs text-fog">
                <span>{readingProgress}% complete</span>
                <span>|</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatReadingTime(calculateReadingTime(manuscript.total_words))} total
                </span>
              </div>
            </div>

            {/* Right: Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevious}
                disabled={currentSectionIndex === 0}
                className="p-2 hover:bg-charcoal rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="prev-button"
              >
                <ChevronLeft className="h-5 w-5 text-cream" />
              </button>
              <button
                onClick={goToNext}
                disabled={currentSectionIndex === navigationSections.length - 1}
                className="p-2 hover:bg-charcoal rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="next-button"
              >
                <ChevronRight className="h-5 w-5 text-cream" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-0.5 bg-graphite mt-3 -mx-4">
            <div
              className="h-full bg-aurora-teal transition-all duration-300"
              style={{ width: `${readingProgress}%` }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className="hidden lg:block w-72 bg-charcoal-light border-r border-graphite h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-fog uppercase tracking-wide mb-4">
              Contents
            </h2>
            <nav className="space-y-1">
              {navigationSections.map((section, index) => (
                <button
                  key={`${section.type}-${section.chapterNumber || index}`}
                  onClick={() => goToSection(section)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    index === currentSectionIndex
                      ? 'bg-aurora-teal/10 text-aurora-teal'
                      : 'text-mist hover:bg-charcoal'
                  }`}
                  data-testid={`nav-item-${section.type}-${section.chapterNumber || ''}`}
                >
                  {section.icon}
                  <span className="truncate">{section.title}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-void/80 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <aside
              className="fixed left-0 top-0 bottom-0 w-80 bg-charcoal-light z-50 overflow-y-auto lg:hidden"
              data-testid="mobile-sidebar"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-cream">Contents</h2>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 hover:bg-charcoal rounded-lg"
                    data-testid="close-sidebar"
                  >
                    <X className="h-5 w-5 text-cream" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {navigationSections.map((section, index) => (
                    <button
                      key={`mobile-${section.type}-${section.chapterNumber || index}`}
                      onClick={() => goToSection(section)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        index === currentSectionIndex
                          ? 'bg-aurora-teal/10 text-aurora-teal'
                          : 'text-mist hover:bg-charcoal'
                      }`}
                    >
                      {section.icon}
                      <span className="truncate">{section.title}</span>
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
          </>
        )}

        {/* Content Area */}
        <main className="flex-1 min-h-[calc(100vh-4rem)]">
          <article className="max-w-3xl mx-auto px-6 py-12" data-testid="content-area">
            {renderSectionContent()}
          </article>
        </main>
      </div>

      {/* Footer Navigation - Mobile */}
      <footer className="fixed bottom-0 left-0 right-0 bg-charcoal-light border-t border-graphite p-3 lg:hidden">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevious}
            disabled={currentSectionIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-cream disabled:opacity-30"
            data-testid="footer-prev"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">Previous</span>
          </button>
          <span className="text-sm text-fog">{readingProgress}%</span>
          <button
            onClick={goToNext}
            disabled={currentSectionIndex === navigationSections.length - 1}
            className="flex items-center gap-2 px-4 py-2 text-cream disabled:opacity-30"
            data-testid="footer-next"
          >
            <span className="text-sm">Next</span>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  )
}
