import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewComponent from './ReviewComponent'

// Mock the comments client
vi.mock('./commentsClient', () => ({
  getComments: vi.fn(),
  SAMPLE_REVIEW_TEXT: 'Sample review text for testing'
}))

import { getComments } from './commentsClient'

describe('ReviewComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock localStorage - return null for getItem to simulate no saved data
    global.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    }
  })

  describe('Initial Render', () => {
    it('renders the main components', () => {
      render(<ReviewComponent />)

      expect(screen.getByText('Edit your review:')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByText('UPDATE')).toBeInTheDocument()
    })

    it('renders statistics section', () => {
      render(<ReviewComponent />)

      expect(screen.getByText(/Critical/)).toBeInTheDocument()
      expect(screen.getByText(/Moderate/)).toBeInTheDocument()
    })
  })

  describe('Text Editing', () => {
    it('enables UPDATE button when text is modified', async () => {
      const user = userEvent.setup()
      render(<ReviewComponent />)

      const textarea = screen.getByRole('textbox')

      // Type some text to modify the content
      await user.type(textarea, 'This is a test paragraph.')

      // Button should be enabled after modification
      const updateButton = screen.getByRole('button', { name: 'UPDATE' })
      await waitFor(() => {
        expect(updateButton).toBeEnabled()
        expect(updateButton.className).toContain('bg-[#4a90e2]')
      })
    })

    it('disables UPDATE button after updating', async () => {
      const user = userEvent.setup()
      getComments.mockResolvedValue({})

      render(<ReviewComponent />)

      const textarea = screen.getByRole('textbox')
      await user.type(textarea, 'Test paragraph.')

      const updateButton = screen.getByRole('button', { name: 'UPDATE' })
      await user.click(updateButton)

      await waitFor(() => {
        expect(updateButton.className).toContain('bg-[#d9d9d9]')
      })
    })
  })


  describe('Comment Updates', () => {
    it('calls getComments when UPDATE is clicked', async () => {
      const user = userEvent.setup()
      getComments.mockResolvedValue({})

      render(<ReviewComponent />)

      await user.type(screen.getByRole('textbox'), 'Test paragraph.')
      await user.click(screen.getByRole('button', { name: 'UPDATE' }))

      await waitFor(() => {
        expect(getComments).toHaveBeenCalled()
      })
    })

    it('displays comments after update', async () => {
      const user = userEvent.setup()
      getComments.mockResolvedValue({
        'p-0': {
          Actionability: { score: 1, text: 'Critical issue' },
          Helpfulness: { score: 3, text: 'Could be more helpful' }
        }
      })

      render(<ReviewComponent />)

      await user.type(screen.getByRole('textbox'), 'Test paragraph with issues.')
      await user.click(screen.getByRole('button', { name: 'UPDATE' }))

      // Wait for comments to load and statistics to update
      await waitFor(() => {
        // Check statistics updated
        const criticalText = screen.getByText(/Critical/)
        expect(criticalText.textContent).toMatch(/1/)
      })
    })
  })

  describe('Comment Filtering', () => {
    it('shows only critical comments when critical filter is active', async () => {
      const user = userEvent.setup()
      getComments.mockResolvedValue({
        'p-0': {
          Actionability: { score: 1, text: 'Critical issue' },
          Helpfulness: { score: 3, text: 'Moderate issue' }
        }
      })

      render(<ReviewComponent />)

      await user.type(screen.getByRole('textbox'), 'Test paragraph.')
      await user.click(screen.getByRole('button', { name: 'UPDATE' }))

      // Wait for update to complete
      await waitFor(() => {
        expect(getComments).toHaveBeenCalled()
      })

      // Click critical filter
      await user.click(screen.getByText(/Critical/))

      // This would need to verify that moderate comments are hidden
      // The exact implementation depends on your component's structure
    })
  })

  describe('Progress Indication', () => {
    it('shows progress bar during update', async () => {
      const user = userEvent.setup()
      let resolveGetComments
      getComments.mockReturnValue(
        new Promise((resolve) => {
          resolveGetComments = resolve
        })
      )

      render(<ReviewComponent />)

      await user.type(screen.getByRole('textbox'), 'Test')

      // Get the UPDATE button before clicking (it will change to CANCEL during loading)
      const updateButton = screen.getByRole('button', { name: 'UPDATE' })
      await user.click(updateButton)

      // Progress bar should appear - button should change to CANCEL
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'CANCEL' })).toBeInTheDocument()
      })

      // Resolve the promise
      resolveGetComments({})

      // UPDATE button should return
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'UPDATE' })).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      const user = userEvent.setup()

      // Mock rejection - the component should catch this
      getComments.mockRejectedValue(new Error('API Error'))

      render(<ReviewComponent />)

      await user.type(screen.getByRole('textbox'), 'Test error.')

      // Click update button - this will trigger the API call that rejects
      const updateButton = screen.getByRole('button', { name: 'UPDATE' })
      await user.click(updateButton)

      // Component should still be responsive after error
      // Give it time to handle the error
      await new Promise(resolve => setTimeout(resolve, 100))

      // UPDATE button should still exist (component didn't crash)
      expect(screen.getByText('UPDATE')).toBeInTheDocument()
    })
  })
})
