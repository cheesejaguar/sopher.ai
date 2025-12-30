/**
 * Tests for GenreTemplateSelector component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GenreTemplateSelector from '../components/GenreTemplateSelector'

describe('GenreTemplateSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    render(<GenreTemplateSelector />)
    expect(screen.getByText('Genre Template')).toBeInTheDocument()
  })

  it('shows all genres', () => {
    render(<GenreTemplateSelector />)
    expect(screen.getByText('Romance')).toBeInTheDocument()
    expect(screen.getByText('Mystery')).toBeInTheDocument()
    expect(screen.getByText('Fantasy')).toBeInTheDocument()
    expect(screen.getByText('Thriller')).toBeInTheDocument()
    expect(screen.getByText('Literary Fiction')).toBeInTheDocument()
    expect(screen.getByText('Science Fiction')).toBeInTheDocument()
    expect(screen.getByText('Horror')).toBeInTheDocument()
  })

  it('allows selecting a genre', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }
    // Should show genre in the footer
    await waitFor(() => {
      expect(screen.getByText(/Genre:/)).toBeInTheDocument()
    })
  })

  it('shows subgenres after selecting genre', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Expand subgenres section
    await waitFor(() => {
      const subgenresButton = screen.getByText('Subgenre (Optional)')
      fireEvent.click(subgenresButton)
    })

    // Check for romance subgenres
    await waitFor(() => {
      expect(screen.getByText('Contemporary Romance')).toBeInTheDocument()
      expect(screen.getByText('Historical Romance')).toBeInTheDocument()
    })
  })

  it('shows common tropes after selecting genre', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Click to expand tropes
    await waitFor(() => {
      const tropesButton = screen.getByText(/Common Tropes/)
      fireEvent.click(tropesButton)
    })

    // Check for romance tropes
    await waitFor(() => {
      expect(screen.getByText('Enemies to lovers')).toBeInTheDocument()
      expect(screen.getByText('Fake relationship')).toBeInTheDocument()
    })
  })

  it('allows selecting multiple tropes', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Click to expand tropes
    await waitFor(() => {
      const tropesButton = screen.getByText(/Common Tropes/)
      fireEvent.click(tropesButton)
    })

    // Wait for tropes to be visible
    await waitFor(() => {
      expect(screen.getByText('Enemies to lovers')).toBeInTheDocument()
    })

    // Select tropes
    const enemiesButton = screen.getByText('Enemies to lovers')
    fireEvent.click(enemiesButton)
    const fakeButton = screen.getByText('Fake relationship')
    fireEvent.click(fakeButton)

    // Check that tropes shows selected count
    await waitFor(() => {
      expect(screen.getByText(/2 selected/)).toBeInTheDocument()
    })
  })

  it('shows core elements section', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Click to expand elements
    await waitFor(() => {
      const elementsButton = screen.getByText('Core Elements')
      fireEvent.click(elementsButton)
    })

    // Check for romance elements
    await waitFor(() => {
      expect(screen.getByText('Required Elements')).toBeInTheDocument()
      expect(screen.getByText('Meet-Cute')).toBeInTheDocument()
    })
  })

  it('shows writing guidance section', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Click to expand guidance
    await waitFor(() => {
      const guidanceButton = screen.getByText('Writing Guidance')
      fireEvent.click(guidanceButton)
    })

    // Check for guidance content
    await waitFor(() => {
      expect(screen.getByText('Reader Expectations')).toBeInTheDocument()
      expect(screen.getByText('Things to Avoid')).toBeInTheDocument()
      expect(screen.getByText('Pacing Notes')).toBeInTheDocument()
    })
  })

  it('calls onGenreSelect callback', async () => {
    const onGenreSelect = vi.fn()
    render(<GenreTemplateSelector onGenreSelect={onGenreSelect} />)

    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    await waitFor(() => {
      expect(onGenreSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'romance', name: 'Romance' })
      )
    })
  })

  it('calls onSubgenreSelect callback', async () => {
    const onSubgenreSelect = vi.fn()
    render(<GenreTemplateSelector onSubgenreSelect={onSubgenreSelect} />)

    // Select romance genre first
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Expand subgenres section
    await waitFor(() => {
      const subgenresButton = screen.getByText('Subgenre (Optional)')
      fireEvent.click(subgenresButton)
    })

    // Wait and select a subgenre
    await waitFor(() => {
      expect(screen.getByText('Historical Romance')).toBeInTheDocument()
    })

    const historicalButton = screen.getByText('Historical Romance')
    fireEvent.click(historicalButton)

    await waitFor(() => {
      expect(onSubgenreSelect).toHaveBeenCalledWith('Historical Romance')
    })
  })

  it('calls onTropeSelect callback', async () => {
    const onTropeSelect = vi.fn()
    render(<GenreTemplateSelector onTropeSelect={onTropeSelect} />)

    // Select romance genre first
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Expand tropes section
    await waitFor(() => {
      const tropesButton = screen.getByText(/Common Tropes/)
      fireEvent.click(tropesButton)
    })

    // Wait and select a trope
    await waitFor(() => {
      expect(screen.getByText('Enemies to lovers')).toBeInTheDocument()
    })

    const enemiesButton = screen.getByText('Enemies to lovers')
    fireEvent.click(enemiesButton)

    await waitFor(() => {
      expect(onTropeSelect).toHaveBeenCalledWith(['Enemies to lovers'])
    })
  })

  it('allows deselecting a genre', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      // Select
      fireEvent.click(romanceButton)
      await waitFor(() => {
        expect(screen.getByText(/Genre:/)).toBeInTheDocument()
      })
      // Deselect
      fireEvent.click(romanceButton)
    }
    // Footer should not show genre info
    await waitFor(() => {
      expect(screen.queryByText(/Genre:/)).not.toBeInTheDocument()
    })
  })

  it('accepts initial values', () => {
    render(
      <GenreTemplateSelector
        initialGenre="mystery"
        initialSubgenre="Cozy Mystery"
        initialTropes={['Amateur sleuth']}
      />
    )
    // Should show genre in footer
    expect(screen.getByText('Genre:')).toBeInTheDocument()
    // Should show subgenre in footer
    expect(screen.getByText('Subgenre:')).toBeInTheDocument()
  })

  it('shows detailed tips when checkbox is enabled', async () => {
    render(<GenreTemplateSelector />)
    const romanceButton = screen.getByText('Romance').closest('button')
    if (romanceButton) {
      fireEvent.click(romanceButton)
    }

    // Click to expand elements
    await waitFor(() => {
      const elementsButton = screen.getByText('Core Elements')
      fireEvent.click(elementsButton)
    })

    // Enable detailed tips
    await waitFor(() => {
      const checkbox = screen.getByRole('checkbox')
      fireEvent.click(checkbox)
    })

    // Tips should now be visible
    await waitFor(() => {
      expect(screen.getByText(/Make it memorable/)).toBeInTheDocument()
    })
  })

  it('displays genre description in card', () => {
    render(<GenreTemplateSelector />)
    // Check for truncated descriptions
    expect(
      screen.getByText(/Stories centered on a romantic relationship/)
    ).toBeInTheDocument()
  })

  it('shows mystery subgenres correctly', async () => {
    render(<GenreTemplateSelector />)
    const mysteryButton = screen.getByText('Mystery').closest('button')
    if (mysteryButton) {
      fireEvent.click(mysteryButton)
    }

    // Expand subgenres section
    await waitFor(() => {
      const subgenresButton = screen.getByText('Subgenre (Optional)')
      fireEvent.click(subgenresButton)
    })

    // Check for mystery subgenres
    await waitFor(() => {
      expect(screen.getByText('Cozy Mystery')).toBeInTheDocument()
      expect(screen.getByText('Police Procedural')).toBeInTheDocument()
    })
  })

  it('shows fantasy tropes correctly', async () => {
    render(<GenreTemplateSelector />)
    const fantasyButton = screen.getByText('Fantasy').closest('button')
    if (fantasyButton) {
      fireEvent.click(fantasyButton)
    }

    // Expand tropes section
    await waitFor(() => {
      const tropesButton = screen.getByText(/Common Tropes/)
      fireEvent.click(tropesButton)
    })

    // Check for fantasy tropes
    await waitFor(() => {
      expect(screen.getByText('Chosen One')).toBeInTheDocument()
      expect(screen.getByText('Epic quest')).toBeInTheDocument()
    })
  })
})
