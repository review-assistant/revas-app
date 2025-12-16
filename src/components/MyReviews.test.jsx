import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithAuth } from '../test/test-utils'
import MyReviews from './MyReviews'
import { supabase } from '../supabaseClient'

// Mock supabase
vi.mock('../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  }
}))

describe('MyReviews', () => {
  const mockOnSelectReview = vi.fn()
  const mockOnCancel = vi.fn()

  const mockReviews = [
    {
      review_id: 'review-1',
      paper_id: 'paper-1',
      paper_title: 'Test Paper 1',
      paper_conference: 'NeurIPS 2025',
      last_updated: '2025-12-15T10:00:00Z',
      paragraph_count: 5,
      word_count: 150,
      is_locked: false
    },
    {
      review_id: 'review-2',
      paper_id: 'paper-2',
      paper_title: 'Test Paper 2',
      paper_conference: 'ICML 2025',
      last_updated: '2025-12-14T15:30:00Z',
      paragraph_count: 3,
      word_count: 75,
      is_locked: false
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock: successful reviews fetch
    supabase.rpc.mockResolvedValue({ data: mockReviews, error: null })
  })

  describe('Loading and Display', () => {
    it('shows loading state initially', () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      expect(screen.getByText('Loading reviews...')).toBeInTheDocument()
    })

    it('displays list of reviews after loading', async () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Test Paper 1')).toBeInTheDocument()
        expect(screen.getByText('Test Paper 2')).toBeInTheDocument()
      })

      expect(screen.getByText('NeurIPS 2025')).toBeInTheDocument()
      expect(screen.getByText('ICML 2025')).toBeInTheDocument()
      expect(screen.getByText('5 items')).toBeInTheDocument()
      expect(screen.getByText('150 words')).toBeInTheDocument()
    })

    it('pre-selects most recent review', async () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        const firstReviewButton = screen.getByText('Test Paper 1').closest('button')
        expect(firstReviewButton).toHaveClass('border-blue-500')
      })
    })

    it('calls supabase.rpc with get_my_reviews', async () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalledWith('get_my_reviews')
      })
    })
  })

  describe('Review Selection', () => {
    it('allows selecting a review', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Test Paper 2')).toBeInTheDocument()
      })

      const review2Button = screen.getByText('Test Paper 2').closest('button')
      await user.click(review2Button)

      expect(review2Button).toHaveClass('border-blue-500')
    })

    it('button shows "Continue Editing" with selected review name', async () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText(/Continue Editing Test Paper 1/)).toBeInTheDocument()
      })
    })

    it('calls onSelectReview with correct data when continuing', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Test Paper 1')).toBeInTheDocument()
      })

      const continueButton = screen.getByText(/Continue Editing/)
      await user.click(continueButton)

      expect(mockOnSelectReview).toHaveBeenCalledWith({
        reviewId: 'review-1',
        paperId: 'paper-1',
        paperTitle: 'Test Paper 1',
        paperConference: 'NeurIPS 2025',
        isNewReview: false
      })
    })
  })

  describe('Create New Review', () => {
    it('shows create form with placeholder values', async () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Review-3')).toBeInTheDocument()
      })

      const today = new Date().toISOString().split('T')[0]
      expect(screen.getByPlaceholderText(today)).toBeInTheDocument()
    })

    it('updates button text when typing new title', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Review-3')).toBeInTheDocument()
      })

      const titleInput = screen.getByPlaceholderText('Review-3')
      await user.click(titleInput)
      await user.type(titleInput, 'My New Review')

      expect(screen.getByText('Create My New Review')).toBeInTheDocument()
    })

    it('deselects existing review when focusing on create form', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Test Paper 1')).toBeInTheDocument()
      })

      const titleInput = screen.getByPlaceholderText('Review-3')
      await user.click(titleInput)

      const review1Button = screen.getByText('Test Paper 1').closest('button')
      expect(review1Button).not.toHaveClass('border-blue-500')
    })

    it('calls onSelectReview with new review data', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Review-3')).toBeInTheDocument()
      })

      const titleInput = screen.getByPlaceholderText('Review-3')
      await user.click(titleInput)
      await user.type(titleInput, 'New Paper')

      const today = new Date().toISOString().split('T')[0]
      const conferenceInput = screen.getByPlaceholderText(today)
      await user.type(conferenceInput, 'CVPR 2025')

      const createButton = screen.getByText('Create New Paper')
      await user.click(createButton)

      expect(mockOnSelectReview).toHaveBeenCalledWith({
        reviewId: null,
        paperId: null,
        paperTitle: 'New Paper',
        paperConference: 'CVPR 2025',
        isNewReview: true
      })
    })
  })

  describe('Duplicate Title Detection', () => {
    it('shows error for duplicate title (case-insensitive)', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Review-3')).toBeInTheDocument()
      })

      const titleInput = screen.getByPlaceholderText('Review-3')
      await user.click(titleInput)
      await user.type(titleInput, 'test paper 1') // lowercase version of existing

      const createButton = screen.getByText('Create test paper 1')
      await user.click(createButton)

      expect(screen.getByText(/You already have a review titled/)).toBeInTheDocument()
      expect(mockOnSelectReview).not.toHaveBeenCalled()
    })

    it('clears error when user starts typing again', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Review-3')).toBeInTheDocument()
      })

      const titleInput = screen.getByPlaceholderText('Review-3')
      await user.click(titleInput)
      await user.type(titleInput, 'Test Paper 1')

      const createButton = screen.getByText('Create Test Paper 1')
      await user.click(createButton)

      expect(screen.getByText(/You already have a review titled/)).toBeInTheDocument()

      // Start typing again
      await user.type(titleInput, ' Updated')

      await waitFor(() => {
        expect(screen.queryByText(/You already have a review titled/)).not.toBeInTheDocument()
      })
    })

    it('allows same title if it is different from all existing reviews', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Review-3')).toBeInTheDocument()
      })

      const titleInput = screen.getByPlaceholderText('Review-3')
      await user.click(titleInput)
      await user.type(titleInput, 'Completely New Title')

      const createButton = screen.getByText('Create Completely New Title')
      await user.click(createButton)

      expect(screen.queryByText(/You already have a review titled/)).not.toBeInTheDocument()
      expect(mockOnSelectReview).toHaveBeenCalled()
    })
  })

  describe('Close Button and Escape Key', () => {
    it('shows close button when showCloseButton is true', async () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
          showCloseButton={true}
        />
      )

      await waitFor(() => {
        const closeButton = screen.getByTitle('Close (Esc)')
        expect(closeButton).toBeInTheDocument()
      })
    })

    it('does not show close button when showCloseButton is false', () => {
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
          showCloseButton={false}
        />
      )

      expect(screen.queryByTitle('Close (Esc)')).not.toBeInTheDocument()
    })

    it('calls onCancel when close button is clicked', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
          showCloseButton={true}
        />
      )

      await waitFor(() => {
        expect(screen.getByTitle('Close (Esc)')).toBeInTheDocument()
      })

      const closeButton = screen.getByTitle('Close (Esc)')
      await user.click(closeButton)

      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('calls onCancel when Escape key is pressed (if showCloseButton=true)', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
          showCloseButton={true}
        />
      )

      await user.keyboard('{Escape}')

      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('does not call onCancel when Escape key is pressed (if showCloseButton=false)', async () => {
      const user = userEvent.setup()
      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
          showCloseButton={false}
        />
      )

      await user.keyboard('{Escape}')

      expect(mockOnCancel).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('shows error message when loading fails', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      })

      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Database connection failed')).toBeInTheDocument()
      })
    })

    it('shows empty state when no reviews exist', async () => {
      supabase.rpc.mockResolvedValue({ data: [], error: null })

      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Create Review-1')).toBeInTheDocument()
      })

      // No review list should be shown
      expect(screen.queryByText('Test Paper 1')).not.toBeInTheDocument()
    })
  })

  describe('Date Formatting', () => {
    it('formats recent dates as relative time', async () => {
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

      supabase.rpc.mockResolvedValue({
        data: [{
          review_id: 'recent-review',
          paper_id: 'paper-1',
          paper_title: 'Recent Paper',
          paper_conference: 'Test',
          last_updated: twoHoursAgo,
          paragraph_count: 1,
          word_count: 10,
          is_locked: false
        }],
        error: null
      })

      renderWithAuth(
        <MyReviews
          onSelectReview={mockOnSelectReview}
          onCancel={mockOnCancel}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('2 hours ago')).toBeInTheDocument()
      })
    })
  })
})
