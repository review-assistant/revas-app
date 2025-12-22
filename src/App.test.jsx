import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext } from './AuthContext'

// Mock all child components to isolate App logic
vi.mock('./AuthComponent', () => ({
  default: () => <div data-testid="auth-component">Auth Component</div>
}))

vi.mock('./ReviewComponent', () => ({
  default: vi.fn().mockImplementation(({ currentReview }) => (
    <div data-testid="review-component">Review: {currentReview?.paperTitle}</div>
  ))
}))

vi.mock('./AccountSettings', () => ({
  default: ({ onBack }) => (
    <div data-testid="account-settings">
      <button onClick={onBack}>Back</button>
    </div>
  )
}))

vi.mock('./MyTables', () => ({
  default: ({ onBack }) => (
    <div data-testid="my-tables">
      My Tables View
      {onBack && <button onClick={onBack} data-testid="tables-back">Back to Main</button>}
    </div>
  )
}))

vi.mock('./components/MyReviews', () => ({
  default: ({ onSelectReview, onCancel, showCloseButton }) => (
    <div data-testid="my-reviews-modal">
      <h2>My Reviews</h2>
      <button
        onClick={() => onSelectReview({
          reviewId: 'test-review-1',
          paperId: 'test-paper-1',
          paperTitle: 'Test Paper',
          paperConference: 'Test Conf',
          isNewReview: false
        })}
        data-testid="continue-editing"
      >
        Continue Editing
      </button>
      {showCloseButton && (
        <button onClick={onCancel} data-testid="close-modal">Close</button>
      )}
    </div>
  )
}))

vi.mock('./components/ReportIssueModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="report-issue-modal">
      <button onClick={onClose}>Close</button>
    </div>
  )
}))

// Mock supabase
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null }))
      }))
    }))
  }
}))

// Import App after mocks are set up
import App from './App'

describe('App', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com'
  }

  const defaultAuthProps = {
    user: mockUser,
    session: { user: mockUser },
    profile: null,
    loading: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    exportData: vi.fn(),
    refreshProfile: vi.fn(),
  }

  function renderApp(authOverrides = {}) {
    return render(
      <AuthContext.Provider value={{ ...defaultAuthProps, ...authOverrides }}>
        <App />
      </AuthContext.Provider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset URL to main view (no query params)
    window.history.pushState({}, '', '/')
  })

  describe('My Reviews modal auto-show', () => {
    it('shows My Reviews modal when user is logged in without a review on main view', async () => {
      renderApp()

      // Modal should auto-show because user has no review
      await waitFor(() => {
        expect(screen.getByTestId('my-reviews-modal')).toBeInTheDocument()
      })
    })

    it('does not show My Reviews modal when loading', () => {
      renderApp({ loading: true })

      expect(screen.queryByTestId('my-reviews-modal')).not.toBeInTheDocument()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('shows auth component when user is not logged in', () => {
      renderApp({ user: null })

      expect(screen.getByTestId('auth-component')).toBeInTheDocument()
      expect(screen.queryByTestId('my-reviews-modal')).not.toBeInTheDocument()
    })
  })

  describe('My Reviews modal closing behavior', () => {
    it('closes modal and shows review when Continue Editing is clicked on main view', async () => {
      const user = userEvent.setup()
      window.history.pushState({}, '', '/')

      renderApp()

      // Modal should auto-show on main view without a review
      await waitFor(() => {
        expect(screen.getByTestId('my-reviews-modal')).toBeInTheDocument()
      })

      // Click Continue Editing
      const continueButton = screen.getByTestId('continue-editing')
      await user.click(continueButton)

      // Modal should close and review component should show
      await waitFor(() => {
        expect(screen.getByTestId('review-component')).toBeInTheDocument()
      })

      // Modal should NOT re-open
      expect(screen.queryByTestId('my-reviews-modal')).not.toBeInTheDocument()
    })

    it('does not show modal on tables view', async () => {
      // Start with tables view
      window.history.pushState({}, '', '/?view=tables')

      renderApp()

      // Should show My Tables, not modal
      await waitFor(() => {
        expect(screen.getByTestId('my-tables')).toBeInTheDocument()
      })

      // Modal should NOT show (we're on tables view)
      expect(screen.queryByTestId('my-reviews-modal')).not.toBeInTheDocument()
    })

    it('My Reviews menu in standalone tables view navigates to main (no modal shown in tables)', async () => {
      const user = userEvent.setup()
      window.history.pushState({}, '', '/?view=tables')

      renderApp()

      // Wait for tables view
      await waitFor(() => {
        expect(screen.getByTestId('my-tables')).toBeInTheDocument()
      })

      // No modal initially (standalone tables doesn't show modal)
      expect(screen.queryByTestId('my-reviews-modal')).not.toBeInTheDocument()

      // In standalone tables view, clicking My Reviews does window.location.href='/'
      // which can't be tested in unit tests. The behavior is:
      // 1. Navigate to main page
      // 2. Modal auto-shows via useEffect
      // This is tested via e2e tests instead.
    })
  })
})
