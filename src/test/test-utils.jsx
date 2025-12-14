import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { AuthContext } from '../AuthContext'

/**
 * Custom render function that wraps components with necessary providers
 */
export function renderWithAuth(ui, { providerProps = {}, ...renderOptions } = {}) {
  const defaultProviderProps = {
    user: null,
    session: null,
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

  function Wrapper({ children }) {
    return (
      <AuthContext.Provider value={{ ...defaultProviderProps, ...providerProps }}>
        {children}
      </AuthContext.Provider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Create mock user for testing
 */
export function createMockUser(overrides = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Create mock profile for testing
 */
export function createMockProfile(overrides = {}) {
  return {
    id: 'test-user-id',
    first_name: 'Test',
    last_name: 'User',
    last_sign_in_at: '2024-01-01T00:00:00Z',
    terms_accepted_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Wait for async operations (alternative to waitFor with custom logic)
 */
export async function waitForAsync(callback, timeout = 1000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const result = await callback()
      if (result) return result
    } catch (e) {
      // Continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Timeout waiting for condition')
}

// Re-export everything from React Testing Library
export * from '@testing-library/react'
