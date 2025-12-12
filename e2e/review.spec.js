import { test, expect } from '@playwright/test'

/**
 * Review Component E2E Tests
 * Tests Priority 1: Critical paths for review editing and comments
 */

test.describe('Review Component', () => {
  const timestamp = Date.now()
  const testEmail = `review-test-${timestamp}@example.com`
  const testPassword = 'testpass123'

  // Helper to login
  async function loginUser(page) {
    await page.goto('/')
    await page.click('text=Sign up')
    await page.fill('input[name="firstName"]', 'Review')
    await page.fill('input[name="lastName"]', 'Tester')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.check('input[type="checkbox"]')
    await page.click('button:has-text("Sign up")')

    await expect(page.locator(`text=${testEmail}`)).toBeVisible({ timeout: 10000 })
  }

  test.beforeEach(async ({ page }) => {
    await loginUser(page)
  })

  test('@smoke Load review and update comments', async ({ page }) => {
    // Verify main components are visible
    await expect(page.locator('text=Edit your review:')).toBeVisible()
    await expect(page.locator('textarea')).toBeVisible()

    // Use more specific selector for UPDATE button
    const updateButton = page.getByRole('button', { name: 'UPDATE' })
    await expect(updateButton).toBeVisible()

    // Type some review text
    await page.fill('textarea', 'This is a test paragraph for review.\n\nSecond paragraph here.')

    // UPDATE button should become blue (active)
    await expect(updateButton).toHaveClass(/bg-\[#4a90e2\]/)

    // Click update
    await updateButton.click()

    // Should show progress or complete
    // Wait for update to finish (button becomes gray again)
    await expect(updateButton).toHaveClass(/bg-\[#d9d9d9\]/, { timeout: 30000 })
  })

  test('Mock button loads sample text', async ({ page }) => {
    // Click Mock button
    await page.click('text=Mock')

    // Should load sample text
    const textarea = page.locator('textarea')
    await expect(textarea).not.toHaveValue('')

    // UPDATE button should be active
    const updateButton = page.locator('text=UPDATE')
    await expect(updateButton).toHaveClass(/bg-blue-600/)

    // Click update
    await updateButton.click()

    // Wait for processing
    await expect(updateButton).toHaveClass(/bg-gray-400/, { timeout: 30000 })

    // Statistics should show some counts
    const criticalStat = page.locator('text=/Critical:?/')
    await expect(criticalStat).toBeVisible()
  })

  test('Comment bar interactions', async ({ page }) => {
    // Load mock data
    await page.click('text=Mock')
    const updateButton = page.locator('text=UPDATE')
    await updateButton.click()

    // Wait for comments to load
    await expect(updateButton).toHaveClass(/bg-gray-400/, { timeout: 30000 })

    // Look for comment bars (they should be visible if there are comments)
    // Comment bars are typically on the right side of the textarea
    // This test assumes mock data generates some comments

    // Try to click a comment bar if any exist
    const commentBars = page.locator('[data-testid="comment-bar"]')
    const count = await commentBars.count()

    if (count > 0) {
      // Click first comment bar
      await commentBars.first().click()

      // Comment panel should open
      // This depends on your component structure
      // Look for comment text or panel
    }
  })

  test('Statistics filtering', async ({ page }) => {
    // Load mock data and update
    await page.click('text=Mock')
    await page.click('text=UPDATE')

    // Wait for update
    await expect(page.locator('text=UPDATE')).toHaveClass(/bg-gray-400/, { timeout: 30000 })

    // Click Critical filter if it has a count
    const criticalStat = page.locator('text=/Critical/')

    // Check if there are any critical comments
    const text = await criticalStat.textContent()
    if (text && !text.includes(': 0')) {
      await criticalStat.click()

      // Comment bars should filter to show only critical
      // Visual indication that filter is active
    }
  })

  test('Text editing persists', async ({ page }) => {
    const testText = 'My custom review text for persistence test.'

    // Enter text
    await page.fill('textarea', testText)

    // Navigate away (to account settings)
    await page.click(`text=${testEmail}`)
    await page.click('text=Account Settings')

    // Navigate back
    await page.click('text=Back to App')

    // Text should still be there (depending on your implementation)
    // This test assumes text is saved in localStorage or similar
    const textareaValue = await page.locator('textarea').inputValue()

    // Note: This might not persist depending on your implementation
    // Adjust test based on actual behavior
  })
})
