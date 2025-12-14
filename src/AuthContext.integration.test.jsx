import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// Unmock supabaseClient for integration tests (global mock is in setup.js for unit tests)
vi.unmock('./supabaseClient')
import { supabase } from './supabaseClient'

/**
 * Integration Tests for AuthContext
 *
 * These tests interact with a real Supabase instance (local test database)
 * To run: ensure local Supabase is running with `supabase start`
 *
 * NOTE: These tests will be skipped if SKIP_INTEGRATION_TESTS=true
 */

const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true'

describe.skipIf(SKIP_INTEGRATION).sequential('AuthContext Integration Tests', () => {
  const testEmail = `integration-test-${Date.now()}@example.com`
  const testPassword = 'testpass123'
  let testUserId = null

  // Cleanup: Delete test user after all tests
  afterAll(async () => {
    if (testUserId) {
      try {
        // Sign out first
        await supabase.auth.signOut()

        // Delete user using RPC function
        await supabase.rpc('delete_user', { user_id: testUserId })
      } catch (error) {
        console.error('Cleanup error:', error)
      }
    }
  })

  // Sign out before each test
  beforeEach(async () => {
    await supabase.auth.signOut()
  })

  it('signs up a new user and creates profile', async () => {
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>
    const { result } = renderHook(() => useAuth(), { wrapper })

    // Initial state
    expect(result.current.user).toBeNull()

    // Sign up
    let signUpResult
    await act(async () => {
      signUpResult = await result.current.signUp(testEmail, testPassword)
    })

    expect(signUpResult.error).toBeNull()
    expect(signUpResult.data.user).toBeDefined()
    expect(signUpResult.data.user.email).toBe(testEmail)

    testUserId = signUpResult.data.user.id

    // Wait for auth state to update
    await waitFor(() => {
      expect(result.current.user).not.toBeNull()
    }, { timeout: 5000 })

    expect(result.current.user.email).toBe(testEmail)

    // Verify profile was created by trigger
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUserId)
      .single()

    expect(profile).toBeDefined()
    expect(profile.id).toBe(testUserId)
  })

  it('signs in with existing credentials', async () => {
    // Use the user created in the first test
    // (testEmail, testPassword, and testUserId are already set)

    // Now test sign in through context
    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>
    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for initial loading
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Sign in
    let signInResult
    await act(async () => {
      signInResult = await result.current.signIn(testEmail, testPassword)
    })

    expect(signInResult.error).toBeNull()

    // Wait for user state to update
    await waitFor(() => {
      expect(result.current.user).not.toBeNull()
    }, { timeout: 5000 })

    expect(result.current.user.email).toBe(testEmail)
  })

  it('updates user profile', async () => {
    // Use the user created in the first test
    // Sign in first
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>
    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for auth to load
    await waitFor(() => {
      expect(result.current.user).not.toBeNull()
    }, { timeout: 5000 })

    // Update profile
    let updateResult
    await act(async () => {
      updateResult = await result.current.updateProfile('Test', 'User')
    })

    expect(updateResult.error).toBeNull()

    // Wait for profile to load
    await waitFor(() => {
      expect(result.current.profile).not.toBeNull()
    }, { timeout: 5000 })

    expect(result.current.profile.first_name).toBe('Test')
    expect(result.current.profile.last_name).toBe('User')

    // Verify in database
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUserId)
      .single()

    expect(profile.first_name).toBe('Test')
    expect(profile.last_name).toBe('User')
  })

  it('changes user password', async () => {
    // Use the user created in the first test
    // Sign in first (note: password might have been changed in previous test, but we'll use original)
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).not.toBeNull()
    }, { timeout: 5000 })

    // Change password
    const newPassword = 'newpassword456'
    let changeResult
    await act(async () => {
      changeResult = await result.current.changePassword(testPassword, newPassword)
    })

    expect(changeResult.error).toBeNull()

    // Sign out and try new password
    await supabase.auth.signOut()

    const { error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: newPassword
    })

    expect(error).toBeNull()

    // Change password back to original for subsequent tests
    const { result: result2 } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => {
      expect(result2.current.user).not.toBeNull()
    }, { timeout: 5000 })

    await act(async () => {
      await result2.current.changePassword(newPassword, testPassword)
    })
  })

  it('exports user data', async () => {
    // Use the user created in the first test
    // Sign in first
    await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })

    // Update profile
    await supabase
      .from('profiles')
      .update({
        first_name: 'Export',
        last_name: 'Test'
      })
      .eq('id', testUserId)

    const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.user).not.toBeNull()
      expect(result.current.profile).not.toBeNull()
    }, { timeout: 5000 })

    // Mock DOM for download
    const createElementSpy = vi.spyOn(document, 'createElement')
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})

    // Export data
    let exportResult
    await act(async () => {
      exportResult = await result.current.exportData()
    })

    expect(exportResult.error).toBeNull()

    // Verify download was triggered
    expect(createElementSpy).toHaveBeenCalledWith('a')
    expect(appendChildSpy).toHaveBeenCalled()

    // Cleanup spies
    createElementSpy.mockRestore()
    appendChildSpy.mockRestore()
    removeChildSpy.mockRestore()
  })
})
