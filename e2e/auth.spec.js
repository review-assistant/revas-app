import { test, expect } from '@playwright/test'

/**
 * Authentication E2E Tests
 * Tests Priority 1: Critical user paths for authentication
 */

test.describe('Authentication Flow', () => {
  // Generate unique email for each test run
  const timestamp = Date.now()
  const testEmail = `test-${timestamp}@example.com`
  const testPassword = 'testpass123'

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('@smoke User signup -> login -> logout flow', async ({ page }) => {
    // Step 1: Navigate to signup
    await page.click('text=Sign up')
    await expect(page.locator('text=Create a new account')).toBeVisible()

    // Step 2: Fill signup form
    await page.fill('input[name="firstName"]', 'Test')
    await page.fill('input[name="lastName"]', 'User')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.check('input[type="checkbox"]')

    // Step 3: Submit signup
    await page.click('button:has-text("Sign up")')

    // Step 4: Verify logged in (should see My Reviews modal)
    await expect(page.locator('text=My Reviews')).toBeVisible({ timeout: 10000 })

    // Create a review so we can access the account dropdown
    await page.click('button:has-text("Create")')
    await expect(page.locator('textarea')).toBeVisible({ timeout: 5000 })

    // Now email dropdown should be accessible
    await expect(page.locator(`text=${testEmail}`)).toBeVisible()

    // Step 5: Logout
    await page.click(`text=${testEmail}`)
    await page.click('text=Logout')

    // Step 6: Verify logged out (should see login form)
    await expect(page.locator('text=Sign in to your account')).toBeVisible()

    // Step 7: Login with same credentials
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button:has-text("Sign in")')

    // Step 8: Verify logged in again
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 })
  })

  test('Signup validation errors', async ({ page }) => {
    await page.click('text=Sign up')

    // HTML5 validation should prevent empty form submission
    // Fill form but don't accept terms checkbox
    await page.fill('input[name="firstName"]', 'Test')
    await page.fill('input[name="lastName"]', 'User')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    // Don't check the terms checkbox
    await page.click('button:has-text("Sign up")')

    // Should show error about terms (or prevent submission)
    // Verify we're still on signup page (not logged in)
    await expect(page.locator('text=Create a new account')).toBeVisible()

    // Verify user is not logged in by checking email doesn't appear
    await expect(page.locator(`text=${testEmail}`)).not.toBeVisible({ timeout: 2000 })
  })

  test('Login validation errors', async ({ page }) => {
    // Try to login with non-existent account
    await page.fill('input[type="email"]', 'nonexistent@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button:has-text("Sign in")')

    // Should show Supabase error message about invalid credentials
    await expect(page.locator('text=/Invalid login credentials|Invalid email or password/')).toBeVisible({ timeout: 5000 })

    // Verify still on login page
    await expect(page.locator('text=Sign in to your account')).toBeVisible()
  })

  test('Session persistence across page refresh', async ({ page }) => {
    // Login first
    await page.click('text=Sign up')
    await page.fill('input[name="firstName"]', 'Session')
    await page.fill('input[name="lastName"]', 'Test')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.check('input[type="checkbox"]')
    await page.click('button:has-text("Sign up")')

    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 })

    // Refresh the page
    await page.reload()

    // Should still be logged in
    await expect(page.locator(`text=${testEmail}`)).toBeVisible()
    // After refresh, should show My Reviews or review editor (depending on if review was selected)
    // Just verify user is still logged in (email visible)
  })
})
