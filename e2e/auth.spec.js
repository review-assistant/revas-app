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

    // Step 4: Verify logged in (should see email in account dropdown)
    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Edit your review:')).toBeVisible()

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

    // Try to submit empty form
    await page.click('button:has-text("Sign up")')
    await expect(page.locator('text=Please fill in all fields')).toBeVisible()

    // Fill partial form (missing names)
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button:has-text("Sign up")')
    await expect(page.locator('text=Please enter your first and last name')).toBeVisible()

    // Fill names but don't accept terms
    await page.fill('input[name="firstName"]', 'Test')
    await page.fill('input[name="lastName"]', 'User')
    await page.click('button:has-text("Sign up")')
    await expect(page.locator('text=You must accept the terms and privacy policy')).toBeVisible()
  })

  test('Login validation errors', async ({ page }) => {
    // Try to login with empty fields
    await page.click('button:has-text("Sign in")')
    await expect(page.locator('text=Please fill in all fields')).toBeVisible()

    // Try with invalid email format
    await page.fill('input[type="email"]', 'invalid-email')
    await page.fill('input[type="password"]', testPassword)
    await page.click('button:has-text("Sign in")')
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible()

    // Try with short password
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', '12345')
    await page.click('button:has-text("Sign in")')
    await expect(page.locator('text=Password must be at least 6 characters')).toBeVisible()
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
    await expect(page.locator('text=Edit your review:')).toBeVisible()
  })
})
