/**
 * Tests for StyleCustomizationPanel component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StyleCustomizationPanel from '../components/StyleCustomizationPanel'

describe('StyleCustomizationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    render(<StyleCustomizationPanel />)
    expect(screen.getByText('Style Customization')).toBeInTheDocument()
  })

  it('shows all three tabs', () => {
    render(<StyleCustomizationPanel />)
    expect(screen.getByText('Voice Profiles')).toBeInTheDocument()
    expect(screen.getByText('Custom Settings')).toBeInTheDocument()
    expect(screen.getByText('Blend')).toBeInTheDocument()
  })

  it('displays voice profiles on initial render', () => {
    render(<StyleCustomizationPanel />)
    expect(screen.getByText('Hemingway-Inspired')).toBeInTheDocument()
    expect(screen.getByText('Austen-Inspired')).toBeInTheDocument()
    expect(screen.getByText('King-Inspired')).toBeInTheDocument()
  })

  it('allows selecting a voice profile', async () => {
    render(<StyleCustomizationPanel />)
    // Find and click the profile card
    const hemingwayText = screen.getByText('Hemingway-Inspired')
    const card = hemingwayText.closest('div[class*="cursor-pointer"]')
    if (card) {
      fireEvent.click(card)
    }
    // Should show Current Style footer
    await waitFor(() => {
      expect(screen.getByText('Current Style:')).toBeInTheDocument()
    })
  })

  it('switches to custom settings tab', () => {
    render(<StyleCustomizationPanel />)
    const customTab = screen.getByText('Custom Settings')
    fireEvent.click(customTab)
    expect(screen.getByText('Sentence Length')).toBeInTheDocument()
    expect(screen.getByText('Vocabulary Complexity')).toBeInTheDocument()
  })

  it('allows changing custom settings', () => {
    render(<StyleCustomizationPanel />)
    const customTab = screen.getByText('Custom Settings')
    fireEvent.click(customTab)

    // Find buttons by their text content
    const buttons = screen.getAllByRole('button')
    const shortButton = buttons.find((btn) => btn.textContent === 'short')
    if (shortButton) {
      fireEvent.click(shortButton)
      expect(shortButton.className).toContain('border-teal')
    }
  })

  it('switches to blend tab', () => {
    render(<StyleCustomizationPanel />)
    const blendTab = screen.getByText('Blend')
    fireEvent.click(blendTab)
    expect(screen.getByText(/Blend up to 3 voice profiles/)).toBeInTheDocument()
  })

  it('allows initial voice profile selection', async () => {
    render(<StyleCustomizationPanel initialVoiceProfile="hemingway" />)
    // Should show the selection in the footer
    await waitFor(() => {
      const footer = screen.getByText('Current Style:')
      expect(footer.parentElement?.textContent).toContain('Hemingway-Inspired')
    })
  })

  it('calls onStyleChange when profile is selected', async () => {
    const onStyleChange = vi.fn()
    render(<StyleCustomizationPanel onStyleChange={onStyleChange} />)

    // Find and click the profile card
    const hemingwayText = screen.getByText('Hemingway-Inspired')
    const card = hemingwayText.closest('div[class*="cursor-pointer"]')
    if (card) {
      fireEvent.click(card)
    }

    await waitFor(() => {
      expect(onStyleChange).toHaveBeenCalled()
    })
  })

  it('shows profile details when expanded', async () => {
    render(<StyleCustomizationPanel />)
    // Find all chevron-down buttons and click the first one
    const expandButtons = screen.getAllByRole('button')
    for (const btn of expandButtons) {
      // Check if this button has a chevron-down icon
      const svgHtml = btn.querySelector('svg')?.outerHTML || ''
      if (svgHtml.includes('lucide-chevron-down')) {
        fireEvent.click(btn)
        break
      }
    }
    // Should show characteristics after expansion
    await waitFor(() => {
      expect(screen.getByText('Characteristics:')).toBeInTheDocument()
    })
  })

  it('displays emotional intensity in profile details', async () => {
    render(<StyleCustomizationPanel />)
    // Expand first profile
    const expandButtons = screen.getAllByRole('button')
    for (const btn of expandButtons) {
      const svgHtml = btn.querySelector('svg')?.outerHTML || ''
      if (svgHtml.includes('lucide-chevron-down')) {
        fireEvent.click(btn)
        break
      }
    }
    await waitFor(() => {
      expect(screen.getByText('Emotion:')).toBeInTheDocument()
    })
  })

  it('shows dialogue ratio slider in custom settings', () => {
    render(<StyleCustomizationPanel />)
    const customTab = screen.getByText('Custom Settings')
    fireEvent.click(customTab)
    expect(screen.getByText('Dialogue vs. Narrative')).toBeInTheDocument()
    expect(screen.getByText('More Narrative')).toBeInTheDocument()
    expect(screen.getByText('More Dialogue')).toBeInTheDocument()
  })

  it('allows resetting custom settings', () => {
    render(<StyleCustomizationPanel />)
    const customTab = screen.getByText('Custom Settings')
    fireEvent.click(customTab)

    // Find and click reset button
    const resetButton = screen.getByText('Reset')
    fireEvent.click(resetButton)

    // Default settings should be restored
    const buttons = screen.getAllByRole('button')
    const variedButton = buttons.find((btn) => btn.textContent === 'varied')
    expect(variedButton?.className).toContain('border-teal')
  })

  it('shows blend info when info button clicked', () => {
    render(<StyleCustomizationPanel />)
    const blendTab = screen.getByText('Blend')
    fireEvent.click(blendTab)

    // Find and click info button
    const infoButtons = screen.getAllByRole('button')
    const infoButton = infoButtons.find((btn) => {
      const svgHtml = btn.querySelector('svg')?.outerHTML || ''
      return svgHtml.includes('lucide-info')
    })
    if (infoButton) {
      fireEvent.click(infoButton)
      expect(screen.getByText(/Blending combines characteristics/)).toBeInTheDocument()
    }
  })
})
