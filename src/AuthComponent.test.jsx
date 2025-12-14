import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithAuth, createMockUser } from './test/test-utils'
import AuthComponent from './AuthComponent'
import { supabase } from './supabaseClient'

describe('AuthComponent', () => {
  const mockSignUp = vi.fn()
  const mockSignIn = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Login Form', () => {
    it('renders login form by default', () => {
      renderWithAuth(<AuthComponent />, {
        providerProps: { signIn: mockSignIn }
      })

      expect(screen.getByText('Sign in to your account')).toBeInTheDocument()
      expect(screen.getByLabelText('Email address')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('validates email format', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signIn: mockSignIn }
      })

      // Use email with @ but missing TLD (passes HTML5, fails custom validation)
      await user.type(screen.getByLabelText('Email address'), 'test@example')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument()
      })
      expect(mockSignIn).not.toHaveBeenCalled()
    })

    it('validates password length', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signIn: mockSignIn }
      })

      await user.type(screen.getByLabelText('Email address'), 'test@example.com')
      await user.type(screen.getByLabelText('Password'), '12345')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument()
      })
      expect(mockSignIn).not.toHaveBeenCalled()
    })

    it('calls signIn with correct credentials', async () => {
      const user = userEvent.setup()
      mockSignIn.mockResolvedValue({ data: createMockUser(), error: null })

      renderWithAuth(<AuthComponent />, {
        providerProps: { signIn: mockSignIn }
      })

      await user.type(screen.getByLabelText('Email address'), 'test@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123')
      })
    })

    it('displays error on failed login', async () => {
      const user = userEvent.setup()
      mockSignIn.mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials' }
      })

      renderWithAuth(<AuthComponent />, {
        providerProps: { signIn: mockSignIn }
      })

      await user.type(screen.getByLabelText('Email address'), 'test@example.com')
      await user.type(screen.getByLabelText('Password'), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
      })
    })

    it('toggles password visibility', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signIn: mockSignIn }
      })

      const passwordInput = screen.getByLabelText('Password')
      expect(passwordInput).toHaveAttribute('type', 'password')

      const showButton = screen.getByText('Show')
      await user.click(showButton)

      expect(passwordInput).toHaveAttribute('type', 'text')
      expect(screen.getByText('Hide')).toBeInTheDocument()
    })
  })

  describe('Signup Form', () => {
    it('switches to signup form', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signUp: mockSignUp }
      })

      await user.click(screen.getByText("Don't have an account? Sign up"))

      expect(screen.getByText('Create a new account')).toBeInTheDocument()
      expect(screen.getByLabelText('First Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Last Name')).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: /terms/i })).toBeInTheDocument()
    })

    it('validates required fields in signup', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signUp: mockSignUp }
      })

      await user.click(screen.getByText("Don't have an account? Sign up"))

      // Fill first/last name to bypass that validation, but leave email/password empty
      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')

      // Try to submit - should fail on empty email/password
      const submitButton = screen.getByRole('button', { name: /sign up/i })

      // In jsdom, clicking a button doesn't always trigger HTML5 validation
      // We need to trigger form submission directly
      const form = submitButton.closest('form')
      if (form) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
        form.dispatchEvent(submitEvent)
      }

      await waitFor(() => {
        expect(screen.getByText('Please fill in all fields')).toBeInTheDocument()
      })
      expect(mockSignUp).not.toHaveBeenCalled()
    })

    it('validates first and last name', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signUp: mockSignUp }
      })

      await user.click(screen.getByText("Don't have an account? Sign up"))
      await user.type(screen.getByLabelText('Email address'), 'test@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')

      // Dispatch submit event directly to bypass HTML5 validation
      const submitButton = screen.getByRole('button', { name: /sign up/i })
      const form = submitButton.closest('form')
      if (form) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
        form.dispatchEvent(submitEvent)
      }

      await waitFor(() => {
        expect(screen.getByText('Please enter your first and last name')).toBeInTheDocument()
      })
      expect(mockSignUp).not.toHaveBeenCalled()
    })

    it('validates terms acceptance', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signUp: mockSignUp }
      })

      await user.click(screen.getByText("Don't have an account? Sign up"))
      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Email address'), 'john@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      await waitFor(() => {
        expect(screen.getByText('You must accept the terms and privacy policy')).toBeInTheDocument()
      })
      expect(mockSignUp).not.toHaveBeenCalled()
    })

    it('calls signUp with correct data and updates profile', async () => {
      const user = userEvent.setup()
      const mockUser = createMockUser({ email: 'john@example.com' })
      mockSignUp.mockResolvedValue({
        data: { user: mockUser },
        error: null
      })

      // Mock the profile update
      supabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      })

      renderWithAuth(<AuthComponent />, {
        providerProps: {
          signUp: mockSignUp,
          refreshProfile: vi.fn()
        }
      })

      await user.click(screen.getByText("Don't have an account? Sign up"))
      await user.type(screen.getByLabelText('First Name'), 'John')
      await user.type(screen.getByLabelText('Last Name'), 'Doe')
      await user.type(screen.getByLabelText('Email address'), 'john@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('checkbox', { name: /terms/i }))
      await user.click(screen.getByRole('button', { name: /sign up/i }))

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith('john@example.com', 'password123')
      })

      // Verify profile update was called
      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('profiles')
      })
    })
  })

  describe('Form Switching', () => {
    it('clears errors when switching between forms', async () => {
      const user = userEvent.setup()
      renderWithAuth(<AuthComponent />, {
        providerProps: { signIn: mockSignIn }
      })

      // Trigger an error in login by dispatching submit event directly
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      const form = submitButton.closest('form')
      if (form) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
        form.dispatchEvent(submitEvent)
      }

      await waitFor(() => {
        expect(screen.getByText('Please fill in all fields')).toBeInTheDocument()
      })

      // Switch to signup
      await user.click(screen.getByText("Don't have an account? Sign up"))

      // Error should be cleared
      expect(screen.queryByText('Please fill in all fields')).not.toBeInTheDocument()
    })
  })
})
